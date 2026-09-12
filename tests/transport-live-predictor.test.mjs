import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildPredictedLiveFeatures, ObservationHistory, projectPointToLine } from '../src/utils/transport-live-predictor.js';
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
