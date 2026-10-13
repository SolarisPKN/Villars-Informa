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
  { key: 'belgrano-sur' },
  { key: 'sarmiento-merlo-lobos' },
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

async function railwaysFromOsmRelation(relationId, stations) {
  // OpenStreetMap's main versioned data API is independent from Overpass.
  // Query the specific documented track relation instead of a huge bbox.
  const url = 'https://api.openstreetmap.org/api/0.6/relation/' + relationId + '/full';
  const response = await fetch(url, {
    signal: AbortSignal.timeout(70_000),
    headers: { Accept: 'application/xml', 'User-Agent': 'VillarsInformaRailAudit/1.0 (OSM ODbL)' },
  });
  if (!response.ok) throw new Error('OSM relation ' + relationId + ' HTTP ' + response.status);
  const xml = await response.text();
  if (xml.length > 60_000_000) throw new Error('Relation too large');
  const attrs = (src) => Object.fromEntries([...src.matchAll(/([\w:-]+)="([^"]*)"/g)]
    .map((m) => [m[1], m[2]]));
  const nodes = new Map();
  for (const m of xml.matchAll(/<node\b([^>]*)>/g)) {
    const a = attrs(m[1]);
    if (a.id && Number.isFinite(Number(a.lon)) && Number.isFinite(Number(a.lat))) {
      nodes.set(Number(a.id), { lon: Number(a.lon), lat: Number(a.lat) });
    }
  }
  const ways = [];
  for (const m of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const a = attrs(m[1]), body = m[2], tags = {};
    for (const t of body.matchAll(/<tag\b([^>]*)\/>/g)) {
      const pair = attrs(t[1]); tags[pair.k] = pair.v;
    }
    if (!['rail', 'disused'].includes(tags.railway)) continue;
    const ids = [...body.matchAll(/<nd\b([^>]*)\/>/g)].map(t => Number(attrs(t[1]).ref));
    if (ids.length < 2 || ids.some(id => !nodes.has(id))) continue;
    const geometry = ids.map(id => nodes.get(id));
    // Keep lines close to the rail corridor, not a giant national relation.
    const useful = geometry.some(p => stations.some(([lon,lat]) =>
      Math.abs(p.lon - lon) < 0.24 && Math.abs(p.lat - lat) < 0.17));
    if (useful) ways.push({ id: Number(a.id), nodes: ids, geometry, tags });
  }
  console.log('OSM main API relation', relationId, 'xml bytes', xml.length, 'rail ways', ways.length);
  if (ways.length < 10) throw new Error('Relation includes too few rail segments');
  return ways;
}

async function queryRailways(stations) {
  // A corridor around ordered stations greatly reduces load versus fetching
  // every railway in a huge province-wide bounding rectangle (HTTP 504).
  const corridor = stations.map(([lon, lat]) => lat + ',' + lon).join(',');
  const query = '[out:json][timeout:120];way["railway"~"^(rail|disused)$"](around:6000,' + corridor + ');out geom;';
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

async function railwaysFromOsmMap(left, right) {
  // Target only the precise missing interval; OpenStreetMap's main map API
  // includes neighboring rail segments without relying on overloaded Overpass.
  const xmin = Math.min(left[0], right[0]) - 0.012;
  const xmax = Math.max(left[0], right[0]) + 0.012;
  const ymin = Math.min(left[1], right[1]) - 0.012;
  const ymax = Math.max(left[1], right[1]) + 0.012;
  if ((xmax - xmin) * (ymax - ymin) > 0.2) throw new Error('Rail repair bbox too large');
  const url = 'https://api.openstreetmap.org/api/0.6/map?bbox=' + [xmin,ymin,xmax,ymax].join(',');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(80_000),
    headers: { Accept: 'application/xml', 'User-Agent': 'VillarsInformaRailAudit/1.0 (OSM ODbL)' },
  });
  if (!response.ok) throw new Error('OSM map segment HTTP ' + response.status);
  const xml = await response.text();
  if (xml.length > 50_000_000) throw new Error('OSM map segment too large');
  const attrs = src => Object.fromEntries([...src.matchAll(/([\w:-]+)="([^"]*)"/g)]
    .map(m => [m[1],m[2]]));
  const nodes = new Map();
  for (const m of xml.matchAll(/<node\b([^>]*)>/g)) {
    const a = attrs(m[1]);
    if (a.id && Number.isFinite(Number(a.lon)) && Number.isFinite(Number(a.lat))) {
      nodes.set(Number(a.id), {lon:Number(a.lon),lat:Number(a.lat)});
    }
  }
  const ways=[];
  for (const m of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const a=attrs(m[1]), body=m[2], tags={};
    for (const t of body.matchAll(/<tag\b([^>]*)\/>/g)) {
      const pair=attrs(t[1]); tags[pair.k]=pair.v;
    }
    if (!['rail','disused','construction'].includes(tags.railway)) continue;
    const ids=[...body.matchAll(/<nd\b([^>]*)\/>/g)].map(t=>Number(attrs(t[1]).ref));
    if(ids.length < 2 || ids.some(id=>!nodes.has(id))) continue;
    ways.push({id:Number(a.id), nodes:ids, geometry:ids.map(id=>nodes.get(id)), tags});
  }
  console.log('OSM map patch',JSON.stringify([xmin,ymin,xmax,ymax]),'rail ways',ways.length,'xml bytes',xml.length);
  if (!ways.length) throw new Error('No real railway segments in OSM map patch');
  return ways;
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

function nearestNodes(graph, target, count = 80, radius = 1800) {
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
  if (finish === null) {
    const accessible = [...dist.keys()];
    const far = new Set(goals.map(g => g.id));
    const pending = [...far];
    while (pending.length) {
      const id = pending.pop();
      for (const [next] of graph.edges.get(id) || []) if (!far.has(next)) { far.add(next); pending.push(next); }
    }
    let nearest = { meters: Infinity, a: null, b: null };
    // Report where the mapped rail graph is broken; never bridge silently.
    for (const id of accessible) for (const other of far) {
      const m = meters(graph.nodes.get(id), graph.nodes.get(other));
      if (m < nearest.meters) nearest = { meters: m, a: graph.nodes.get(id), b: graph.nodes.get(other) };
    }
    const error = new Error('Railway disconnected: ' + a + ' / ' + b + '; nearest gap ' +
      nearest.meters.toFixed(1) + 'm at ' + JSON.stringify(nearest.a) + ' -> ' + JSON.stringify(nearest.b) +
      '; candidates ' + origins.length + ' / ' + goals.length + '; graph nodes ' + graph.nodes.size);
    error.gap = nearest;
    throw error;
  }
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
for (const { key } of PATHS) {
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
  let ways;
  try {
    ways = await railwaysFromOsmRelation(key === 'belgrano-sur' ? 2694441 : 7451008, stations);
  } catch (error) {
    console.warn('Rail relation unavailable, using Overpass corridor:', error.message);
    ways = await queryRailways(stations);
  }
  let graph = graphOf(ways);
  const coordinates = [];
  const patchedIntervals = new Set();
  for (let i = 1; i < stations.length; i++) {
    let leg;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        leg = bestRailLeg(graph, stations[i - 1], stations[i]);
        break;
      } catch (error) {
        if (!error.gap || error.gap.meters > 9000) throw error;
        const patchKey = [error.gap.a, error.gap.b].map(point => point.map(n => n.toFixed(3)).join(',')).join(':');
        if (patchedIntervals.has(patchKey)) throw error;
        patchedIntervals.add(patchKey);
        const patch = await railwaysFromOsmMap(error.gap.a, error.gap.b);
        const byId = new Map([...ways, ...patch].map(way => [way.id,way]));
        if (byId.size === ways.length) throw new Error('Missing rail patch did not add new rail nodes');
        ways = [...byId.values()];
        graph = graphOf(ways);
        console.log('Rail graph extended after OSM map patch; ways:', ways.length);
      }
    }
    if (!leg) throw new Error('Could not find continuous rail path after local OSM patches');
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
