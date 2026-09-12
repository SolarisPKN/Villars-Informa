import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '../..');
const CACHE = join(ROOT, '.cache', 'maps');
const OUTPUT = join(ROOT, 'public', 'maps', 'buenos-aires');
const PARTIES = join(OUTPUT, 'partidos');
const REGIONS = join(CACHE, 'partidos');
const PMTILES_VERSION = '1.31.2';
const SOURCE_URL = process.env.PMTILES_SOURCE_URL || 'https://data.source.coop/opengeos/protomaps/planet/latest.pmtiles';
const GEOREF_URL = 'https://infra.datos.gob.ar/georef/departamentos.geojson';
const PROVINCE_BOUNDS = [-63.5, -41.3, -56.4, -33.0];
const MAX_DATA_ZOOM = 15;
const MAX_VISUAL_ZOOM = 18;
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.MAP_BUILD_CONCURRENCY || 2)));
const DRY_RUN = process.argv.includes('--dry-run');
const REUSE = process.argv.includes('--reuse');

const assets = {
  'win32-x64': ['go-pmtiles_1.31.2_Windows_x86_64.zip', 'a658baa4d7e55020aef6ca17bd9ff9faa1582671266b36f58c52db0ac8e785a1'],
  'linux-x64': ['go-pmtiles_1.31.2_Linux_x86_64.tar.gz', '3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f'],
  'linux-arm64': ['go-pmtiles_1.31.2_Linux_arm64.tar.gz', 'f8bd47e7ea866863489cad588fbaf2f31f42e5821f7a03f009b3769f05801cb1'],
  'darwin-x64': ['go-pmtiles-1.31.2_Darwin_x86_64.zip', '1f0dc02eee6c58312dd6c509faee1b5c32f0596568af1bf51f1b034e7a88a65b'],
  'darwin-arm64': ['go-pmtiles-1.31.2_Darwin_arm64.zip', '40528f7f616fcbf91207cd48c8fc023d213f6d86c0cbf1f748732803d1880f3d'],
};

function command(binary, args, { capture = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, args, { cwd: ROOT, windowsHide: true, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    const stdout = []; const stderr = [];
    child.stdout?.on('data', (chunk) => stdout.push(chunk));
    child.stderr?.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('exit', (code) => code === 0
      ? resolvePromise(Buffer.concat(stdout).toString('utf8'))
      : reject(new Error(`${basename(binary)} ${args[0]} terminó con ${code}: ${Buffer.concat(stderr).toString('utf8')}`)));
  });
}

async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of Readable.toWeb((await import('node:fs')).createReadStream(path))) hash.update(chunk);
  return hash.digest('hex');
}
async function download(url, output) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Descarga HTTP ${response.status}: ${url}`);
  await mkdir(dirname(output), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(output));
}

async function ensureCli() {
  if (process.platform === 'win32' && process.arch !== 'x64') throw new Error('Windows requiere x64 para este generador.');
  const key = `${process.platform}-${process.arch}`;
  const selected = assets[key];
  if (!selected) throw new Error(`No hay binario PMTiles fijado para ${key}. Definí PMTILES_CLI con un go-pmtiles v${PMTILES_VERSION} verificado.`);
  if (process.env.PMTILES_CLI) return resolve(process.env.PMTILES_CLI);
  const [archiveName, expectedHash] = selected;
  const toolDirectory = join(CACHE, `pmtiles-cli-${PMTILES_VERSION}`);
  const archive = join(toolDirectory, archiveName);
  const executable = join(toolDirectory, process.platform === 'win32' ? 'pmtiles.exe' : 'pmtiles');
  await mkdir(toolDirectory, { recursive: true });
  if (!await exists(archive)) await download(`https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/${archiveName}`, archive);
  const actualHash = await sha256(archive);
  if (actualHash !== expectedHash) throw new Error(`SHA-256 inválido para ${archiveName}: ${actualHash}`);
  if (!await exists(executable)) await command('tar', [archiveName.endsWith('.tar.gz') ? '-xzf' : '-xf', archive, '-C', toolDirectory]);
  return executable;
}

function slug(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function allPoints(coordinates, output = []) {
  if (Array.isArray(coordinates) && coordinates.length >= 2 && coordinates.every(Number.isFinite)) output.push(coordinates);
  else if (Array.isArray(coordinates)) for (const entry of coordinates) allPoints(entry, output);
  return output;
}
function boundsOf(geometry) {
  const points = allPoints(geometry.coordinates);
  return [Math.min(...points.map(([lon]) => lon)), Math.min(...points.map(([, lat]) => lat)), Math.max(...points.map(([lon]) => lon)), Math.max(...points.map(([, lat]) => lat))];
}

async function buildArchive(cli, output, args) {
  if (REUSE && await exists(output)) return;
  const temporary = `${output}.building`;
  await rm(temporary, { force: true });
  await command(cli, ['extract', SOURCE_URL, temporary, ...args, '--overfetch=0', ...(DRY_RUN ? ['--dry-run'] : ['--quiet'])]);
  if (DRY_RUN) return;
  await command(cli, ['verify', temporary, '--quiet']);
  await rm(output, { force: true });
  await rename(temporary, output);
}

async function mapPool(values, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < values.length) {
      const index = cursor; cursor += 1;
      await worker(values[index], index);
    }
  }));
}

async function main() {
  await mkdir(PARTIES, { recursive: true });
  await mkdir(REGIONS, { recursive: true });
  const cli = await ensureCli();
  const georefPath = join(CACHE, 'departamentos.geojson');
  if (!REUSE || !await exists(georefPath)) await download(GEOREF_URL, georefPath);
  const georefBytes = await readFile(georefPath);
  const georef = JSON.parse(georefBytes.toString('utf8'));
  const parties = georef.features.filter((feature) => feature.properties?.provincia?.id === '06').sort((a, b) => a.properties.id.localeCompare(b.properties.id));
  if (parties.length !== 135) throw new Error(`Georef devolvió ${parties.length} partidos bonaerenses; se esperaban 135.`);

  const overview = join(OUTPUT, 'overview.pmtiles');
  await buildArchive(cli, overview, [`--bbox=${PROVINCE_BOUNDS.join(',')}`, '--maxzoom=9']);
  await mapPool(parties, async (party, index) => {
    const fileName = `${party.properties.id}-${slug(party.properties.nombre)}.pmtiles`;
    const region = join(REGIONS, `${party.properties.id}.geojson`);
    await writeFile(region, `${JSON.stringify({ type: 'Feature', properties: { id: party.properties.id, nombre: party.properties.nombre }, geometry: party.geometry })}\n`);
    process.stdout.write(`[${index + 1}/${parties.length}] ${party.properties.nombre}\n`);
    await buildArchive(cli, join(PARTIES, fileName), [`--region=${region}`, '--minzoom=10', `--maxzoom=${MAX_DATA_ZOOM}`]);
  });
  if (DRY_RUN) return;

  const overviewStat = await stat(overview);
  const manifestParties = [];
  for (const party of parties) {
    const fileName = `${party.properties.id}-${slug(party.properties.nombre)}.pmtiles`;
    const path = join(PARTIES, fileName); const info = await stat(path);
    manifestParties.push({ id: party.properties.id, name: party.properties.nombre, bounds: boundsOf(party.geometry), file: `partidos/${fileName}`, bytes: info.size, sha256: await sha256(path) });
  }
  const sourceMetadata = JSON.parse(await command(cli, ['show', SOURCE_URL, '--metadata'], { capture: true }));
  const manifest = {
    schemaVersion: 1,
    description: 'Mapa vectorial de la provincia de Buenos Aires fragmentado por partido',
    bounds: PROVINCE_BOUNDS,
    minZoom: 0,
    maxDataZoom: MAX_DATA_ZOOM,
    maxVisualZoom: MAX_VISUAL_ZOOM,
    source: { pmtiles: SOURCE_URL, osmTimestamp: sourceMetadata['planetiler:osm:osmosisreplicationtime'] || null, georef: GEOREF_URL, georefSha256: createHash('sha256').update(georefBytes).digest('hex') },
    overview: { file: 'overview.pmtiles', bytes: overviewStat.size, sha256: await sha256(overview), minZoom: 0, maxZoom: 9 },
    parties: manifestParties,
  };
  await writeFile(join(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const expected = new Set(['overview.pmtiles', 'manifest.json', ...manifestParties.map(({ file }) => file)]);
  for (const entry of await readdir(PARTIES)) {
    const relativePath = `partidos/${entry}`;
    if (extname(entry) === '.pmtiles' && !expected.has(relativePath)) await rm(join(PARTIES, entry), { force: true });
  }
  const totalBytes = overviewStat.size + manifestParties.reduce((sum, party) => sum + party.bytes, 0);
  const largest = [...manifestParties].sort((a, b) => b.bytes - a.bytes)[0];
  console.log(`Mapa generado: 135 partidos + overview; ${totalBytes} bytes; mayor archivo ${largest.name}: ${largest.bytes} bytes.`);
}

await main();
