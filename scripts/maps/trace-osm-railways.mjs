/**
 * Generate precise, offline railway lines from OSM rail way segments.
 *
 * Ferromapas historically distributed a KMZ but its archive is not currently
 * available under a confirmed reusable license; never label OSM data as it.
 *
 * This tool does NOT alter schedules or status of running train services.
 * It replaces only two previously straight station-to-station map geometries.
 *
 * Usage: node scripts/maps/trace-osm-railways.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FILE = resolve('src/data/transport-map.json');
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];
const PATHS = [
  { key: 'belgrano-sur', bbox: [-34.91, -59.12, -34.71, -58.58] },
  { key: 'sarmiento-merlo-lobos', bbox: [-35.24, -59.16, -34.61, -58.64] },
];

const radians = (n) => n * Math.PI / 180;
function meters(a, b) {
  const dy = radians(a[1] - b[1]);
  const dx = radians(a[0] - b[0]);
  const k = Math.sin(dy / 2) ** 2 +
    Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dx / 2) ** 2;
  return 12742000 * Math.atan2(Math.sqrt(k), Math.sqrt(Math.max(0, 1 - k)));
}
const length = (coords) => coords.slice(1).reduce((s, p, i) => s + meters(p, coords[i]), 0);

async function queryRailways(bbox) {
  const query = '[out:json][timeout:150];way["railway"="rail"](' + bbox.join(',') + ');out geom;';
  const errors = [];
  for (const endpoint of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 155_000);
      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST', body: new URLSearchParams({ data: query }),
          headers: { 'User-Agent': 'VillarsInforma-rail-geocheck/1.0 (OpenStreetMap ODbL)', Accept: 'application/json' },
          signal: controller.signal,
        });
      } finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const json = await response.json();
      if (!Array.isArray(json.elements) || json.elements.length < 50) throw new Error('Insufficient rail geometry');
      console.log('OSM rail ways from', endpoint, 'count:', json.elements.length);
      return json.elements;
    } catch (e) { errors.push(endpoint + ': ' + String(e)); }
  }
  throw new Error('No available Overpass endpoint:\n' + errors.join('\n'));
}

function graphOf(ways) {
  const edges = new Map();
  const nodes = new Map();
  let count = 0;
  function edge(a, b, d) {
    if (!edges.has(a)) edges.set(a, []);
    edges.get(a).push([b, d]);
  }
  for (const way of ways) {
    if (!Array.isArray(way.nodes) || !Array.isArray(way.geometry)) continue;
    if (way.nodes.length !== way.geometry.length) continue;
    for (let i = 0; i < way.nodes.length; i++) {
      const id = way.nodes[i];
      const loc = [way.geometry[i].lon, way.geometry[i].lat];
      nodes.set(id, loc);
      if (i > 0) {
        const prev = way.nodes[i - 1];
        if (prev === id) continue;
        const d = meters(nodes.get(prev), loc);
        if (d > 1800 || d < 0.02) continue;
        edge(id, prev, d); edge(prev, id, d);
        count++;
      }
    }
  }
  if (count < 100) throw new Error('Insufficient connected rail segments');
  return { nodes, edges };
}

function nearestNodes(graph, target, count = 18, radius = 1200) {
  const nearby = [];
  for (const [id, coordinates] of graph.nodes) {
    const d = meters(target, coordinates);
    if (d <= radius && graph.edges.has(id)) nearby.push({ id, d });
  }
  return nearby.sort((a, b) => a.d - b.d).slice(0, count);
}

// Multi-source Dijkstra; each origin carries a "distance from actual station"
// penalty. This avoids choosing the wrong station-side siding when the nearest
// rail vertex belongs to an isolated track.
function bestRailLeg(graph, a, b) {
  const origins = nearestNodes(graph, a), goals = nearestNodes(graph, b);
  if (!origins.length || !goals.length) throw new Error('No rail vertices within 1.2km of station');
  const goalSet = new Map(goals.map((v) => [v.id, v.d]));
  const dist = new Map();
  const previous = new Map();
  const heap = [];
  function put(id, d) {
    let at = heap.length; heap.push([d, id]);
    while (at > 0) {
      const p = (at - 1) >> 1;
      if (heap[p][0] <= d) break;
      heap[at] = heap[p]; at = p;
    }
    heap[at] = [d, id];
  }
  function pop() {
    if (!heap.length) return null;
    const root = heap[0]; const last = heap.pop();
    if (heap.length) {
      let at = 0;
      while (true) {
        let child = at * 2 + 1;
        if (child >= heap.length) break;
        if (child + 1 < heap.length && heap[child + 1][0] < heap[child][0]) child++;
        if (last[0] <= heap[child][0]) break;
        heap[at] = heap[child]; at = child;
      }
      heap[at] = last;
    }
    return root;
  }
  for (const o of origins) { dist.set(o.id, o.d); previous.set(o.id, null); put(o.id, o.d); }
  let finish = null;
  let finishCost = Infinity;
  while (heap.length) {
    const [d, id] = pop();
    if (d !== dist.get(id)) continue;
    if (d > finishCost) break;
    if (goalSet.has(id) && d + goalSet.get(id) < finishCost) {
      finish = id; finishCost = d + goalSet.get(id);
    }
    for (const [next, weight] of graph.edges.get(id) || []) {
      if (d + weight < (dist.get(next) ?? Infinity)) {
        dist.set(next, d + weight); previous.set(next, id); put(next, d + weight);
      }
    }
  }
  if (finish === null) throw new Error('Railway disconnected between stations: ' + a + ' / ' + b);
  const ids = [];
  for (let id = finish; id !== null; id = previous.get(id) ?? null) ids.push(id);
  ids.reverse();
  const coordinates = ids.map((id) => graph.nodes.get(id));
  const direct = meters(a, b);
  const rail = length(coordinates);
  if (coordinates.length < 3 || rail < direct * 0.75 || rail > direct * 3.8 + 1500) {
    throw new Error('Rail leg is geometrically implausible (' + rail.toFixed() + 'm vs ' + direct.toFixed() + 'm straight)');
  }
  return { coordinates, rail, direct };
}

const map = JSON.parse(await readFile(FILE, 'utf8'));
let changed = false;
for (const { key, bbox } of PATHS) {
  const track = map.routes.features.find((feature) => feature.properties.lineKey === key);
  if (!track || track.geometry.type !== 'LineString') throw new Error('Missing existing railway ' + key);
  if (track.properties.geometryKind === 'osm-rail-network' && !process.argv.includes('--force')) {
    console.log('Already has validated rail geometry:', key);
    continue;
  }
  const stations = map.stops.features
    .filter((feature) => feature.properties.mode === 'train' && feature.properties.lineKey === key)
    .map((feature) => feature.geometry.coordinates);
  if (stations.length < 4) throw new Error('Insufficient train stations: ' + key);
  const graph = graphOf(await queryRailways(bbox));
  const coordinates = [];
  for (let i = 1; i < stations.length; i++) {
    const leg = bestRailLeg(graph, stations[i - 1], stations[i]);
    if (coordinates.length && leg.coordinates.length && meters(coordinates.at(-1), leg.coordinates[0]) < 70) {
      leg.coordinates.shift();
    } else if (coordinates.length && meters(coordinates.at(-1), leg.coordinates[0]) > 250) {
      throw new Error('Unconnected successive railway legs near station ' + i + ' for ' + key);
    }
    coordinates.push(...leg.coordinates);
    console.log(key, 'station', i, '/', stations.length - 1, 'rail km', (leg.rail / 1000).toFixed(2));
  }
  if (coordinates.length < stations.length * 10) throw new Error('Not detailed enough: ' + key);
  // Only emit verified rail network vertices; no interpolated cross-country
  // shortcut segments are added to patch disconnected data.
  track.geometry.coordinates = coordinates.map((pt) => pt.map((x) => Math.round(x * 1e7) / 1e7));
  track.properties.geometryKind = 'osm-rail-network';
  track.properties.geometrySource = 'OpenStreetMap railway=rail nodes via Overpass; ODbL';
  track.properties.geometryCheckedAt = new Date().toISOString().slice(0, 10);
  console.log('VALID', key, 'vertices', coordinates.length, 'rail km', (length(coordinates) / 1000).toFixed(2));
  changed = true;
}
if (changed) {
  map.sources.trainTrackGeometry = 'OpenStreetMap rail nodes via Overpass (ODbL); compared to Ferromapas scope, not Ferromapas KMZ';
  await writeFile(FILE, JSON.stringify(map, null, 2) + '\n');
}
