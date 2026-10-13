import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { route136MapFeatures } from '../src/utils/transport-route-model.js';
import { normalizedStationKey, buildPredictedLiveFeatures } from '../src/utils/transport-live-predictor.js';

const map = JSON.parse(await readFile(new URL('../src/data/transport-map.json', import.meta.url), 'utf8'));
const local136 = JSON.parse(await readFile(new URL('../src/data/transport-136-villars.json', import.meta.url), 'utf8'));
const routeFor = (id) => map.routes.features.find(f => f.properties.id === id);
function distance(a,b) {
  return Math.hypot((a[0]-b[0])*111320*Math.cos(a[1]*Math.PI/180), (a[1]-b[1])*111320);
}
function maxJump(coords) {
  return coords.slice(1).reduce((max,p,i) => Math.max(max,distance(p,coords[i])),0);
}

test('two rail routes follow railway vertices, not 5 or 13 straight station chords', () => {
  for(const id of ['belgrano-sur-gonzalez-catan-lozano','sarmiento-merlo-lobos']) {
    const route = routeFor(id);
    assert.ok(route);
    assert.equal(route.properties.geometryKind,'ign-rail-network', id);
    assert.ok(route.geometry.coordinates.length > 50,id);
    assert.ok(maxJump(route.geometry.coordinates) < 6501,id);
  }
});

test('long-haul and regional buses use real road polylines, not reference station chords', () => {
  const rapid = routeFor('136-rapido-primera-junta-navarro');
  assert.equal(rapid.properties.geometryKind,'road-network-estimate');
  assert.ok(rapid.geometry.coordinates.length > 500);
  assert.ok(maxJump(rapid.geometry.coordinates)<3001);
  for (const id of ['135_1623','135_1624','135_1625','135_1626']) {
    const route=routeFor(id);
    assert.ok(route.geometry.coordinates.length>300,id);
    assert.ok(maxJump(route.geometry.coordinates)<3001,id);
  }
});

test('all 136 local patterns expose routed roads for safe position projection', () => {
  const { route, patterns } = route136MapFeatures(local136);
  assert.equal(route.geometry.type,'MultiLineString');
  assert.equal(patterns.length, local136.patterns.length);
  assert.ok(patterns.every(p=>p.properties.positionOnly && p.properties.geometryKind==='road-routed'));
  for(const pattern of patterns) {
    assert.ok(pattern.geometry.coordinates.length>10,pattern.properties.id);
    assert.ok(maxJump(pattern.geometry.coordinates)<2500,pattern.properties.id);
  }
  assert.equal(normalizedStationKey('136-villars','Estación Villars'), normalizedStationKey('136-villars','Villars'));
  assert.equal(normalizedStationKey('136-villars','Zamudio · RP 40 y RP 6'),normalizedStationKey('136-villars','Zamudio'));
  assert.equal(normalizedStationKey('belgrano-sur','Marcos Paz (Belgrano)'),normalizedStationKey('belgrano-sur','Marcos Paz'));
});

test('no GPS marker is fabricated for a bus far from its known road', () => {
  const schedules={ timezone:'America/Argentina/Buenos_Aires',routes:[] };
  const known={ routes:{ features:[{type:'Feature',properties:{lineKey:'test-bus'},geometry:{type:'LineString',coordinates:[[-59,-35],[-58.99,-35]]}}]},stops:{features:[]} };
  const now = new Date('2026-10-13T15:00:00Z');
  const offroad={schemaVersion:2,buses:{vehicles:[{routeId:'test-bus',mode:'bus',lat:-35.04,lon:-58.995,positionSource:'gps'}]},trains:{vehicles:[]}};
  assert.equal(buildPredictedLiveFeatures({schedules,mapData:known,snapshot:offroad,date:now}).length,0);
  offroad.buses.vehicles[0].lat=-35.0001;
  const visible=buildPredictedLiveFeatures({schedules,mapData:known,snapshot:offroad,date:now});
  assert.equal(visible.length,0, 'unmatched unverified reports do not get pinned to arbitrary routes');
  
});
