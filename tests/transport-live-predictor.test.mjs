import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildPredictedLiveFeatures, ObservationHistory, projectPointToLine, usableLiveReports } from '../src/utils/transport-live-predictor.js';
import { partiesForViewport, readProvinceMapManifest } from '../src/utils/provincial-pmtiles.js';

const schedules = { timezone: 'America/Argentina/Buenos_Aires', routes: [{ id: 'route', type: 'train', lineKey: 'belgrano-sur', schedules: [{ id: 1, day: { key: 'weekday' }, services: [{ id: 1, name: '5112', destination: 'B', stops: [{ station: 'A', minutes: 600 }, { station: 'B', minutes: 660 }] }] }] }] };
const mapData = { routes: { features: [{ type: 'Feature', properties: { lineKey: 'belgrano-sur' }, geometry: { type: 'LineString', coordinates: [[-59, -35], [-58, -35]] } }] }, stops: { features: [{ type: 'Feature', properties: { lineKey: 'belgrano-sur', name: 'A' }, geometry: { type: 'Point', coordinates: [-59, -35] } }, { type: 'Feature', properties: { lineKey: 'belgrano-sur', name: 'B' }, geometry: { type: 'Point', coordinates: [-58, -35] } }] } };
const now = new Date('2026-09-14T13:30:00Z');

test('sin GPS el servicio previsto sigue apareciendo sobre el shape', () => {
  const features = buildPredictedLiveFeatures({ schedules, mapData, snapshot: null, date: now });
  assert.equal(features.length, 1);
  assert.equal(features[0].properties.positionKind, 'schedule-estimated');
  assert.ok(features[0].geometry.coordinates[0] > -59 && features[0].geometry.coordinates[0] < -58);
});

test('delay desplaza la predicción y GPS se proyecta sobre el recorrido', () => {
  const baseline = buildPredictedLiveFeatures({ schedules, mapData, snapshot: null, date: now })[0];
  const snapshot = { schemaVersion: 2, updatedAt: now.toISOString(), trains: { vehicles: [{ provider: 'sofse', mode: 'train', routeId: 'belgrano-sur-catan-lozano', serviceNumber: '5112', lat: -35.01, lon: -58.8, observedAt: now.toISOString(), positionSource: 'gps', delaySeconds: 300, status: 'delayed' }] }, buses: { vehicles: [] } };
  const corrected = buildPredictedLiveFeatures({ schedules, mapData, snapshot, date: now, history: new ObservationHistory() })[0];
  assert.equal(corrected.properties.positionKind, 'gps');
  assert.equal(corrected.properties.delaySeconds, 300);
  assert.ok(Math.abs(corrected.geometry.coordinates[1] + 35) < 1e-6);
  assert.notDeepEqual(corrected.geometry.coordinates, baseline.geometry.coordinates);
  assert.ok(projectPointToLine([-58.8, -35.01], mapData.routes.features[0].geometry.coordinates).distance > 0);
});

test('los consumidores PMTiles no descargan el archivo completo con arrayBuffer', async () => {
  const files = ['../src/scripts/transport-map.js', '../src/scripts/event-map.js', '../scripts/content-editor/event-map-picker.js', '../src/utils/provincial-pmtiles.js'];
  for (const file of files) assert.doesNotMatch(await readFile(new URL(file, import.meta.url), 'utf8'), /pmtiles[\s\S]{0,400}arrayBuffer\s*\(/i);
});

test('el manifest cubre 135 partidos, z15 real y selecciona sólo la vista', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/maps/buenos-aires/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.parties.length, 135);
  assert.equal(manifest.maxDataZoom, 15);
  assert.equal(manifest.maxVisualZoom, 18);
  assert.ok(manifest.parties.every(({ bytes }) => bytes < 25 * 1024 * 1024));
  const selected = partiesForViewport(manifest, [-59.05, -34.97, -58.68, -34.67]);
  assert.ok(selected.some(({ name }) => name === 'Marcos Paz'));
  assert.ok(selected.length < 25);
  assert.ok(!selected.some(({ name }) => name === 'Patagones'));
  const loaded = await readProvinceMapManifest('https://example.test/maps/manifest.json', async () => new Response(JSON.stringify(manifest)));
  assert.equal(loaded.manifest.source.georefSha256.length, 64);
});


function trainSnapshot(vehicles, checkedAt = now.toISOString()) {
  return {
    schemaVersion: 2, updatedAt: now.toISOString(),
    trains: { checkedAt, vehicles }, buses: { checkedAt, vehicles: [] },
  };
}

function observedTrain(overrides = {}) {
  return {
    provider: 'sofse', mode: 'train', routeId: 'belgrano-sur-catan-lozano',
    vehicleId: 'formation-7', serviceNumber: '5112', tripId: 'turn-1',
    lon: -58.82, lat: -35.0001, observedAt: now.toISOString(),
    sourceTimestamp: now.toISOString(), positionSource: 'gps',
    status: 'in_progress', ...overrides,
  };
}

test('a formation reported under multiple train trip ids is counted only once', () => {
  const reports = [observedTrain(), observedTrain({
    tripId: 'turn-2', serviceNumber: '5102', lon: -58.83,
    observedAt: new Date(now.getTime() - 60_000).toISOString(),
  })];
  const snapshot = trainSnapshot(reports);
  assert.equal(usableLiveReports(snapshot, now).length, 1);
  const pins = buildPredictedLiveFeatures({ schedules, mapData, snapshot, date: now });
  assert.equal(pins.length, 1);
  assert.equal(pins[0].properties.positionKind, 'gps');
});

test('old or stale GPS cannot create ghost train pins while the schedule estimate remains distinct', () => {
  const old = observedTrain({ observedAt: new Date(now.getTime() - 17 * 60_000).toISOString() });
  assert.equal(usableLiveReports(trainSnapshot([old]), now).length, 0);
  const pins = buildPredictedLiveFeatures({ schedules, mapData, snapshot: trainSnapshot([old]), date: now });
  assert.equal(pins.length, 1);
  assert.equal(pins[0].properties.positionKind, 'schedule-estimated');
  assert.equal(pins[0].properties.positionSource, 'schedule-estimated');

  assert.equal(usableLiveReports(trainSnapshot([observedTrain({ stale: true })]), now).length, 0);
  const stalled = trainSnapshot([observedTrain()], new Date(now.getTime() - 21 * 60_000).toISOString());
  assert.equal(usableLiveReports(stalled, now).length, 0, 'last bus update must not make an old train sample current');
});

test('cancelled and completed services do not reappear as synthetic trains', () => {
  for (const status of ['cancelled', 'completed']) {
    const snapshot = trainSnapshot([observedTrain({ status })]);
    const pins = buildPredictedLiveFeatures({ schedules, mapData, snapshot, date: now });
    assert.equal(pins.length, 0, status);
  }
});

test('provider-estimated coordinates are never labelled GPS', () => {
  const snapshot = trainSnapshot([observedTrain({ positionSource: 'provider-estimated' })]);
  const pins = buildPredictedLiveFeatures({ schedules, mapData, snapshot, date: now });
  assert.equal(pins.length, 1);
  assert.equal(pins[0].properties.positionKind, 'provider-estimated');
});

test('two verified, separated trains remain distinct and are not force-capped to one', () => {
  const snapshot = trainSnapshot([
    observedTrain(),
    observedTrain({
      vehicleId: 'formation-8', tripId: 'turn-8', serviceNumber: '5222',
      lon: -58.30, lat: -35.0001,
    }),
  ]);
  const pins = buildPredictedLiveFeatures({ schedules, mapData, snapshot, date: now });
  assert.equal(pins.length, 2);
  assert.ok(pins.every((pin) => pin.properties.positionKind === 'gps'));
});

test('live updates do not repaint every train, bus and stop layer each second', async () => {
  const mapScript = await readFile(new URL('../src/scripts/transport-map.js', import.meta.url), 'utf8');
  assert.match(mapScript, /renderFilteredLayers\(\{ liveOnly: true \}\)/);
  assert.match(mapScript, /renderFilteredLayers\(\{ liveOnly = false \} = \{\}\)/);
  assert.match(mapScript, /liveFeatures\(latestSnapshot\)\), 10_000/);
});
