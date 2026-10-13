/**
 * Independent deployed-host PMTiles probe; useful for scheduled GitHub Actions.
 * It never requests the full archive and needs no API keys.
 */
import { probePmtilesByteServing } from '../src/utils/pmtiles-health.js';

const origin = process.env.MAP_ORIGIN || 'https://villars.solarispkn.com.ar';
const base = new URL('/', origin).href;
const manifestUrl = new URL('maps/buenos-aires/manifest.json', base);
const manifestResponse = await fetch(manifestUrl, { cache: 'no-store' });
if (!manifestResponse.ok) throw new Error(`Manifest HTTP ${manifestResponse.status}`);
const manifest = await manifestResponse.json();
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.parties) || manifest.parties.length !== 135) {
  throw new Error('Manifest provincial inesperado');
}
const lasHeras = manifest.parties.find((party) => party.id === '06329');
if (!lasHeras) throw new Error('Falta General Las Heras en el manifest');
for (const entry of [manifest.overview, lasHeras]) {
  const url = new URL(entry.file, manifestUrl);
  const health = await probePmtilesByteServing(url.href);
  if (health.archiveBytes !== entry.bytes) {
    throw new Error(`Tamaño declarado no coincide con rango real: ${entry.file}`);
  }
  console.log(`OK: ${url.pathname} (206, ${health.archiveBytes} bytes)`);
}
console.log('Cartografía provincial: el host sirve rangos HTTP correctos.');
