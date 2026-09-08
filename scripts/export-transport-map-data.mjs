import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const outputPath = resolve(process.argv[2] || 'src/data/transport-map.json');
const oneBusAwayBaseUrl = 'https://cuandosubo.sube.gob.ar/onebusaway-api-webapp/api/where';
const busRoutes = [
  {
    id: '135_1623', name: 'Línea 322 · Marcos Paz → Luján', lineKey: '322-lujan',
    referenceStops: [
      { id: '14_06525000111', name: 'Marcos Paz', coordinates: [-58.836593, -34.784525] },
      { id: '14_06329000014', name: 'Las Heras', coordinates: [-58.944517, -34.927507] },
      { id: '14_06329000003', name: 'Villars', coordinates: [-58.938715, -34.82856] },
      { id: '14_06329000001', name: 'Plomer', coordinates: [-59.028343, -34.792732] },
      { id: '14_06497000101', name: 'Luján', coordinates: [-59.119978, -34.55957] },
    ],
  },
  {
    id: '135_1624', name: 'Línea 322 · Luján → Marcos Paz', lineKey: '322-lujan',
    referenceStops: [
      { id: '14_06497000101', name: 'Luján', coordinates: [-59.119978, -34.55957] },
      { id: '14_06329000002', name: 'Plomer', coordinates: [-59.029452, -34.794475] },
      { id: '14_06329000003', name: 'Villars', coordinates: [-58.938715, -34.82856] },
      { id: '14_06329000014', name: 'Las Heras', coordinates: [-58.944517, -34.927507] },
      { id: '14_06525000101', name: 'Marcos Paz', coordinates: [-58.836848, -34.784592] },
    ],
  },
  {
    id: '135_1625',
    name: 'Línea 322 · Marcos Paz → Cañuelas',
    lineKey: '322-canuelas',
    referenceStops: [
      { id: '14_06525000111', name: 'Marcos Paz', coordinates: [-58.836593, -34.784525] },
      { id: '14_06329000014', name: 'Las Heras', coordinates: [-58.944517, -34.927507] },
      { id: '14_06134000038', name: 'Cañuelas', coordinates: [-58.7359377, -35.0247591] },
    ],
  },
  {
    id: '135_1626',
    name: 'Línea 322 · Cañuelas → Marcos Paz',
    lineKey: '322-canuelas',
    referenceStops: [
      { id: '14_06134000038', name: 'Cañuelas', coordinates: [-58.7359377, -35.0247591] },
      { id: '14_06329000014', name: 'Las Heras', coordinates: [-58.944517, -34.927507] },
      { id: '14_06525000101', name: 'Marcos Paz', coordinates: [-58.836848, -34.784592] },
    ],
  },
];
const belgranoStations = [
  { name: 'González Catán', coordinates: [-58.6467472, -34.771634] },
  { name: '20 de Junio', coordinates: [-58.7380117, -34.7803617] },
  { name: 'Marcos Paz (Belgrano)', coordinates: [-58.8296815, -34.7865089] },
  { name: 'Villars', coordinates: [-58.9384773, -34.8289569] },
  { name: 'Lozano', coordinates: [-59.0536908, -34.850067] },
];
const sarmientoStations = [
  ['Merlo', -58.7281142, -34.6644017], ['Km 34,5', -58.7602409, -34.6801742], ['A. Ferrari', -58.7794327, -34.706078],
  ['Mariano Acosta', -58.7930682, -34.7244791], ['Maquinista R. Cal', -58.8081306, -34.744777], ['Marcos Paz', -58.8366592, -34.7832092],
  ['Zamudio', -58.8921946, -34.8578991], ['Hornos', -58.917861, -34.8923029], ['Las Heras', -58.9445443, -34.9280932],
  ['Speratti', -58.9998545, -35.0021051], ['Zapiola', -59.0418857, -35.0583029], ['Empalme Lobos', -59.0908028, -35.1515057], ['Lobos', -59.0927904, -35.1848403],
].map(([name, lon, lat]) => ({ name, coordinates: [lon, lat] }));
const rapid136Stations = [
  ['Primera Junta', -58.4417, -34.6205], ['Caballito', -58.436, -34.618], ['Flores', -58.463, -34.628], ['Floresta', -58.483, -34.629],
  ['Villa Luro', -58.502, -34.636], ['Liniers', -58.52, -34.644], ['Ciudadela', -58.537, -34.641], ['Ramos Mejía', -58.562, -34.64],
  ['Haedo', -58.591, -34.645], ['Morón', -58.619, -34.648], ['Castelar', -58.642, -34.656], ['Ituzaingó', -58.673, -34.658],
  ['San Antonio de Padua', -58.699, -34.666], ...sarmientoStations.slice(0, 9).map(({ name, coordinates }) => [name, ...coordinates]), ['Navarro', -59.276, -35.005],
].map(([name, lon, lat]) => ({ name, coordinates: [lon, lat] }));

function decodePolyline(encoded) {
  const coordinates = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    const decodeValue = () => {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      return result & 1 ? ~(result >> 1) : result >> 1;
    };
    latitude += decodeValue();
    longitude += decodeValue();
    coordinates.push([longitude / 1e5, latitude / 1e5]);
  }
  return coordinates;
}

function referenceStopFeatures(route) {
  return (route.referenceStops || []).map((stop) => ({
    type: 'Feature',
    properties: {
      id: `schedule-ref-${route.id}-${stop.id}`,
      name: stop.name,
      routeId: route.id,
      lineKey: route.lineKey,
      mode: 'bus',
      referenceOnly: true,
    },
    geometry: { type: 'Point', coordinates: stop.coordinates },
  }));
}

async function fetchRoute(route) {
  const response = await fetch(`${oneBusAwayBaseUrl}/stops-for-route/${route.id}.json?key=web`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Villars-Informa/1.0 (+https://villars.solarispkn.com.ar)' },
  });
  if (!response.ok) throw new Error(`Cuándo SUBO devolvió HTTP ${response.status} para ${route.id}`);
  const body = await response.json();
  const encoded = body?.data?.entry?.polylines?.[0]?.points;
  if (!encoded) throw new Error(`Cuándo SUBO no devolvió la geometría de ${route.id}`);
  const stops = (body?.data?.references?.stops || [])
    .filter((stop) => stop.routeIds?.includes(route.id))
    .map((stop) => ({
      type: 'Feature',
      properties: { id: stop.id, name: stop.name, routeId: route.id, lineKey: route.lineKey, mode: 'bus' },
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
    }));
  return {
    route: {
      type: 'Feature',
      properties: { id: route.id, name: route.name, lineKey: route.lineKey, mode: 'bus' },
      geometry: { type: 'LineString', coordinates: decodePolyline(encoded) },
    },
    stops: [...stops, ...referenceStopFeatures(route)],
  };
}

async function referenceRoute(route) {
  if (!route.referenceStops?.length) return null;
  const waypoints = route.referenceStops.map(({ coordinates }) => coordinates.join(',')).join(';');
  let coordinates = route.referenceStops.map(({ coordinates: point }) => point);
  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Villars-Informa/1.0 (+https://villars.solarispkn.com.ar)' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body?.routes?.[0]?.geometry?.coordinates?.length > 2) {
      coordinates = body.routes[0].geometry.coordinates;
    }
  } catch (error) {
    console.warn(`OSRM no pudo trazar ${route.id} (${error.message}); se conserva el corredor entre paradas verificadas.`);
  }
  return {
    route: {
      type: 'Feature',
      properties: { id: route.id, name: route.name, lineKey: route.lineKey, mode: 'bus', geometryKind: 'reference-corridor' },
      geometry: { type: 'LineString', coordinates },
    },
    stops: route.referenceStops.map((stop) => ({
      type: 'Feature',
      properties: { id: stop.id, name: stop.name, routeId: route.id, lineKey: route.lineKey, mode: 'bus' },
      geometry: { type: 'Point', coordinates: stop.coordinates },
    })),
  };
}

async function readPreviousMap() {
  try {
    return JSON.parse(await readFile(outputPath, 'utf8'));
  } catch {
    return null;
  }
}

function cachedBusRoute(previousMap, route) {
  const previousRoute = previousMap?.routes?.features?.find(({ properties }) => properties?.id === route.id);
  if (!previousRoute) return null;
  const previousStops = (previousMap?.stops?.features || [])
    .filter(({ properties }) => properties?.routeId === route.id)
    .map((feature) => ({
      ...feature,
      properties: { ...feature.properties, lineKey: route.lineKey, mode: 'bus' },
    }));
  return {
    route: {
      ...previousRoute,
      properties: { ...previousRoute.properties, lineKey: route.lineKey, mode: 'bus' },
    },
    stops: [...previousStops, ...referenceStopFeatures(route)],
  };
}

const previousMap = await readPreviousMap();
const busData = await Promise.all(busRoutes.map(async (route) => {
  try {
    return await fetchRoute(route);
  } catch (error) {
    const cached = cachedBusRoute(previousMap, route);
    if (cached) {
      console.warn(`${error.message}; se conserva la geometría previamente auditada de ${route.id}.`);
      return cached;
    }
    const reference = await referenceRoute(route);
    if (!reference) throw error;
    console.warn(`${error.message}; se usa el corredor vial estático de referencia para ${route.id}.`);
    return reference;
  }
}));
const trainRoute = {
  type: 'Feature',
  properties: { id: 'belgrano-sur-gonzalez-catan-lozano', name: 'Belgrano Sur · González Catán–Lozano', lineKey: 'belgrano-sur', mode: 'train' },
  geometry: { type: 'LineString', coordinates: belgranoStations.map((station) => station.coordinates) },
};
const trainStops = belgranoStations.map((station) => ({
  type: 'Feature',
  properties: { id: `train-belgrano-${station.name}`, name: station.name, lineKey: 'belgrano-sur', mode: 'train' },
  geometry: { type: 'Point', coordinates: station.coordinates },
}));
const sarmientoRoute = { type: 'Feature', properties: { id: 'sarmiento-merlo-lobos', name: 'Sarmiento · Merlo–Lobos', lineKey: 'sarmiento-merlo-lobos', mode: 'train' }, geometry: { type: 'LineString', coordinates: sarmientoStations.map(({ coordinates }) => coordinates) } };
const sarmientoStops = sarmientoStations.map((station) => ({ type: 'Feature', properties: { id: `train-sarmiento-${station.name}`, name: station.name, lineKey: 'sarmiento-merlo-lobos', mode: 'train' }, geometry: { type: 'Point', coordinates: station.coordinates } }));
const rapid136Route = { type: 'Feature', properties: { id: '136-rapido-primera-junta-navarro', name: '136 Rápido · Primera Junta–Navarro (corredor de referencia)', lineKey: '136-rapido', mode: 'bus' }, geometry: { type: 'LineString', coordinates: rapid136Stations.map(({ coordinates }) => coordinates) } };
const rapid136Stops = rapid136Stations.map((station) => ({ type: 'Feature', properties: { id: `136-rapido-${station.name}`, name: station.name, lineKey: '136-rapido', mode: 'bus' }, geometry: { type: 'Point', coordinates: station.coordinates } }));
const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  bounds: [-59.32, -35.22, -58.38, -34.48],
  center: [-58.9384773, -34.8289569],
  sources: {
    basemap: 'Protomaps Basemap, derivado de OpenStreetMap',
    bus: `${oneBusAwayBaseUrl}/stops-for-route/{routeId}.json`,
    trainStations: 'OpenStreetMap y coordenadas públicas de Estación Lozano',
  },
  routes: { type: 'FeatureCollection', features: [trainRoute, sarmientoRoute, rapid136Route, ...busData.map((item) => item.route)] },
  stops: { type: 'FeatureCollection', features: [...trainStops, ...sarmientoStops, ...rapid136Stops, ...busData.flatMap((item) => item.stops)] },
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Mapa exportado con ${payload.routes.features.length} trazas y ${payload.stops.features.length} paradas.`);
