/**
 * Replace the 136 Rápido station-to-station straight line with an OSM road route.
 * The route is a road-valid estimate, NOT a verified official operator itinerary.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const file = resolve('src/data/transport-map.json');
const map = JSON.parse(await readFile(file, 'utf8'));
const route = map.routes.features.find(f => f.properties.id === '136-rapido-primera-junta-navarro');
if (!route) throw new Error('136 Rápido not present');
if (route.properties.geometryKind === 'road-network-estimate') {
  console.log('136 Rápido already has a road-based estimate');
  process.exit(0);
}
const stops = map.stops.features.filter(f => f.properties.lineKey === '136-rapido');
if (stops.length !== 23) throw new Error('Unexpected 136 Rápido stop list length');
const waypoints = stops.map(s => s.geometry.coordinates.join(',')).join(';');
const url = 'https://router.project-osrm.org/route/v1/driving/' + waypoints +
  '?overview=full&geometries=geojson&steps=false';
const response = await fetch(url, {
  signal: AbortSignal.timeout(90_000),
  headers: { Accept: 'application/json', 'User-Agent': 'Villars-Informa-map-audit/1.0' },
});
if (!response.ok) throw new Error('OSRM HTTP ' + response.status);
const payload = await response.json();
if (payload.code !== 'Ok') throw new Error('OSRM error ' + payload.code);
const coordinates = payload.routes?.[0]?.geometry?.coordinates;
if (!Array.isArray(coordinates) || coordinates.length < 500) throw new Error('OSRM returned no sufficiently detailed road route');
for (const p of coordinates) {
  if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) throw new Error('Invalid road point');
}
function dist(a,b) {
 const dy=(a[1]-b[1])*111320, dx=(a[0]-b[0])*111320*Math.cos(a[1]*Math.PI/180);
 return Math.hypot(dx,dy);
}
for (let i=1;i<coordinates.length;i++) if(dist(coordinates[i-1],coordinates[i])>3000) throw new Error('Disconnected road geometry');
route.geometry.coordinates = coordinates;
route.properties.geometryKind = 'road-network-estimate';
route.properties.geometrySource = 'OSRM driving over OpenStreetMap roads (ODbL); not official 136 route';
route.properties.geometryCheckedAt = new Date().toISOString().slice(0,10);
map.sources.rapid136Geometry = 'OSRM road network route via reference waypoints, not operator-confirmed';
await writeFile(file, JSON.stringify(map, null, 2) + '\n');
console.log('136 Rápido road route points:', coordinates.length);
