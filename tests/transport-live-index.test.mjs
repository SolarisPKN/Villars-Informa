import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canonicalJsonSha256 } from '../scripts/lib/canonical-json.mjs';
import {
  estimateIndexedTimetableVehicles,
  estimateTimetableVehicles,
} from '../src/utils/transport-route-model.js';

const [scheduleBytes, mapBytes, indexBytes] = await Promise.all([
  readFile(new URL('../src/data/transport-schedules.json', import.meta.url)),
  readFile(new URL('../src/data/transport-map.json', import.meta.url)),
  readFile(new URL('../workers/transport-live/src/generated-schedule-index.json', import.meta.url)),
]);
const schedules = JSON.parse(scheduleBytes);
const map = JSON.parse(mapBytes);
const index = JSON.parse(indexBytes);
const included = new Set(['136-rapido', '322-lujan', '322-canuelas', 'belgrano-sur', 'sarmiento-merlo-lobos']);
test('el índice live corresponde exactamente a los JSON estáticos vigentes', () => {
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.source.schedulesSha256, canonicalJsonSha256(schedules));
  assert.equal(index.source.mapSha256, canonicalJsonSha256(map));
  const expectedRuns = schedules.routes
    .filter((route) => included.has(route.lineKey))
    .flatMap((route) => route.schedules)
    .reduce((total, grid) => total + grid.services.length, 0);
  assert.equal(index.stats.runs, expectedRuns);
  assert.equal(index.stats.skipped, 0);
});

test('el índice compacto conserva las formaciones y segmentos del estimador anterior', () => {
  for (const date of [
    new Date('2026-09-10T01:21:00.000Z'),
    new Date('2026-09-06T15:30:00.000Z'),
    new Date('2026-09-05T10:00:00.000Z'),
  ]) {
    const legacy = schedules.routes
      .filter((route) => included.has(route.lineKey))
      .flatMap((route) => estimateTimetableVehicles(
        route,
        map.stops.features.filter((feature) => feature.properties?.lineKey === route.lineKey),
        date,
      ));
    const indexed = estimateIndexedTimetableVehicles(index, date);
    const signature = (vehicle) => [
      vehicle.vehicleId,
      vehicle.fromStop,
      vehicle.toStop,
      vehicle.lat.toFixed(7),
      vehicle.lon.toFixed(7),
    ].join('|');
    assert.deepEqual(indexed.map(signature).sort(), legacy.map(signature).sort());
  }
});
