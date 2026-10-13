import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const map=JSON.parse(await readFile(new URL('../src/data/transport-map.json',import.meta.url),'utf8'));
const routes=map.routes.features;
test('136 Rápido follows an OSM street route, not station-to-station chords',()=>{
 const route=routes.find(f=>f.properties.id==='136-rapido-primera-junta-navarro');
 assert.equal(route.properties.geometryKind,'road-network-estimate');
 assert.match(route.properties.geometrySource,/not official/i);
 assert.ok(route.geometry.coordinates.length>1000);
 let km=0;let largestGap=0;
 const coords=route.geometry.coordinates;
 for(let i=1;i<coords.length;i++){
  const p=coords[i],a=coords[i-1];
  const d=Math.hypot((p[0]-a[0])*111.32*Math.cos(p[1]*Math.PI/180),(p[1]-a[1])*111.32);
  largestGap=Math.max(largestGap,d);km+=d;
 }
 assert.ok(km>80 && km<190,'route distance must be plausible');
 assert.ok(largestGap<2,'no longer straight-line shortcuts between stop markers');
});
test('existing bidirectional 322 shapes remain road-based and detailed',()=>{
 for(const id of ['135_1623','135_1624','135_1625','135_1626']){
  const route=routes.find(f=>f.properties.id===id);
  assert.ok(route.geometry.coordinates.length>300,id);
 }
});
