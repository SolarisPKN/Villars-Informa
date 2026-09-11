import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const schedulesPath = resolve(process.argv[2] || 'src/data/transport-schedules.json');
const mapPath = resolve(process.argv[3] || 'src/data/transport-map.json');
const outputPath = resolve(process.argv[4] || 'workers/transport-live/src/generated-schedule-index.json');
const includedLines = new Set([
  '136-rapido',
  '322-lujan',
  '322-canuelas',
  'belgrano-sur',
  'sarmiento-merlo-lobos',
]);
const aliases = new Map([
  ['a ferrari', 'agustin ferrari'],
  ['maquinista r cal', 'maquinista ricardo cal'],
  ['hornos', 'general hornos'],
  ['las heras', 'general las heras'],
]);

function normalizedLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const [scheduleBytes, mapBytes] = await Promise.all([
  readFile(schedulesPath),
  readFile(mapPath),
]);
const schedules = JSON.parse(scheduleBytes);
const map = JSON.parse(mapBytes);
const days = { weekday: [], saturday: [], sunday: [] };
let skipped = 0;

for (const route of schedules.routes || []) {
  if (!includedLines.has(route.lineKey)) continue;
  const coordinates = new Map(
    (map?.stops?.features || [])
      .filter(({ properties }) => properties?.lineKey === route.lineKey)
      .map((feature) => {
        const key = normalizedLabel(feature?.properties?.name);
        return [aliases.get(key) || key, feature?.geometry?.coordinates];
      }),
  );
  const coordinateFor = (name) => {
    const key = normalizedLabel(name);
    return coordinates.get(key) || coordinates.get(aliases.get(key));
  };

  for (const grid of route.schedules || []) {
    const dayKey = grid?.day?.key;
    if (!Object.hasOwn(days, dayKey)) continue;
    for (const service of grid.services || []) {
      const stops = (service.stops || [])
        .map((stop) => {
          const coordinate = coordinateFor(stop.station);
          return Array.isArray(coordinate) && coordinate.length === 2 && Number.isFinite(stop.minutes)
            ? [stop.minutes, coordinate[0], coordinate[1], stop.station]
            : null;
        })
        .filter(Boolean)
        .sort((left, right) => left[0] - right[0]);
      if (stops.length < 2) {
        skipped += 1;
        continue;
      }
      const mode = route.type || 'bus';
      days[dayKey].push({
        m: mode,
        r: `schedule-${route.lineKey}`,
        l: route.lineKey,
        t: `${route.id}:${grid.id}:${service.id}`,
        v: `${mode === 'train' ? 'train' : 'bus'}-estimated:${route.lineKey}:${grid.id}:${service.id}`,
        n: `${route.lineLabel || route.branch || route.name} · ${service.name}`,
        a: stops[0][0],
        z: stops.at(-1)[0],
        s: stops,
      });
    }
  }
}

for (const runs of Object.values(days)) {
  runs.sort((left, right) => left.a - right.a || left.v.localeCompare(right.v));
}
const payload = {
  schemaVersion: 1,
  timezone: schedules.timezone || 'America/Argentina/Buenos_Aires',
  source: {
    schedulesSha256: sha256(scheduleBytes),
    mapSha256: sha256(mapBytes),
  },
  stats: {
    runs: Object.values(days).reduce((total, runs) => total + runs.length, 0),
    skipped,
  },
  days,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload)}\n`, 'utf8');
console.log(`Índice live: ${payload.stats.runs} formaciones; ${skipped} omitidas sin trazado suficiente.`);
