import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { retainVerifiedRoute } from '../scripts/lib/retain-verified-route.mjs';

const data = JSON.parse(await readFile(new URL('../src/data/transport-map.json', import.meta.url), 'utf8'));

function original(id) {
  return {
    type: 'Feature',
    properties: { id, name: 'Generated from timetable stations' },
    geometry: { type: 'LineString', coordinates: [[-58.5, -34.8], [-59, -34.9]] },
  };
}
const kinds = ['ign-rail-network', 'osm-rail-network'];

test('regeneration preserves both audited IGN train tracks instead of two-point station lines', () => {
  for (const id of ['belgrano-sur-gonzalez-catan-lozano','sarmiento-merlo-lobos']) {
    const source = data.routes.features.find((f) => f.properties.id === id);
    const result = retainVerifiedRoute(original(id), kinds, data);
    assert.equal(result.properties.geometryKind, 'ign-rail-network');
    assert.equal(typeof result.properties.geometryKind, 'string', 'must not store kinds array');
    assert.deepEqual(result.properties.geometrySourceIds, source.properties.geometrySourceIds);
    assert.equal(result.properties.geometrySource, source.properties.geometrySource);
    assert.equal(result.properties.geometryCheckedAt, source.properties.geometryCheckedAt);
    assert.deepEqual(result.geometry, source.geometry);
    assert.ok(result.geometry.coordinates.length > 40);
  }
});

test('regeneration retains validated 136 Rápido road route', () => {
  const id = '136-rapido-primera-junta-navarro';
  const result = retainVerifiedRoute(original(id), 'road-network-estimate', data);
  assert.equal(result.properties.geometryKind, 'road-network-estimate');
  assert.ok(result.geometry.coordinates.length >= 2000);
});

test('rejects unreviewed or malformed previous geometries and never fabricates a route', () => {
  const base = original('route');
  const invalid = { routes: { features: [{
    type: 'Feature',
    properties: { id: 'route', geometryKind: 'ign-rail-network' },
    geometry: { type: 'LineString', coordinates: new Array(41).fill(null) },
  }] } };
  assert.equal(retainVerifiedRoute(base, kinds, invalid), base);
  assert.equal(retainVerifiedRoute(base, kinds, { routes: { features: [] } }), base);
  const untrusted = { routes: { features: [{
    type: 'Feature',
    properties: { id: 'route', geometryKind: 'reference-corridor' },
    geometry: { type: 'LineString', coordinates: new Array(150).fill([-58.5,-34.8]) },
  }] } };
  assert.equal(retainVerifiedRoute(base, kinds, untrusted), base);
});

test('the transport export uses the tested retention function for both railways', async () => {
  const script = await readFile(new URL('../scripts/export-transport-map-data.mjs', import.meta.url), 'utf8');
  assert.match(script, /retainVerifiedRoute\(trainRoute,[\s\S]*?previousMap\)/);
  assert.match(script, /retainVerifiedRoute\(sarmientoRoute,[\s\S]*?previousMap\)/);
  assert.match(script, /retainVerifiedRoute\(rapid136Route,[\s\S]*?previousMap\)/);
});
