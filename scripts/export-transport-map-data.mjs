import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const outputPath = resolve(process.argv[2] || 'src/data/transport-map.json');
const oneBusAwayBaseUrl = 'https://cuandosubo.sube.gob.ar/onebusaway-api-webapp/api/where';
const busRoutes = [
  { id: '135_1623', name: 'Línea 322 · Marcos Paz → Luján' },
  { id: '135_1624', name: 'Línea 322 · Luján → Marcos Paz' },
];
const trainStations = [
  { name: 'González Catán', coordinates: [-58.6467472, -34.771634] },
  { name: '20 de Junio', coordinates: [-58.7380117, -34.7803617] },
  { name: 'Marcos Paz (Belgrano)', coordinates: [-58.8296815, -34.7865089] },
  { name: 'Villars', coordinates: [-58.9384773, -34.8289569] },
  { name: 'Lozano', coordinates: [-59.0536908, -34.850067] },
];

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
      properties: { id: stop.id, name: stop.name, routeId: route.id, mode: 'bus' },
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
    }));
  return {
    route: {
      type: 'Feature',
      properties: { id: route.id, name: route.name, mode: 'bus' },
      geometry: { type: 'LineString', coordinates: decodePolyline(encoded) },
    },
    stops,
  };
}

const busData = await Promise.all(busRoutes.map(fetchRoute));
const trainRoute = {
  type: 'Feature',
  properties: { id: 'belgrano-sur-gonzalez-catan-lozano', name: 'Belgrano Sur · González Catán–Lozano', mode: 'train' },
  geometry: { type: 'LineString', coordinates: trainStations.map((station) => station.coordinates) },
};
const trainStops = trainStations.map((station) => ({
  type: 'Feature',
  properties: { id: `train-${station.name}`, name: station.name, mode: 'train' },
  geometry: { type: 'Point', coordinates: station.coordinates },
}));
const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  bounds: [-59.18, -34.98, -58.60, -34.48],
  center: [-58.9384773, -34.8289569],
  sources: {
    basemap: 'Protomaps Basemap, derivado de OpenStreetMap',
    bus: `${oneBusAwayBaseUrl}/stops-for-route/{routeId}.json`,
    trainStations: 'OpenStreetMap y coordenadas públicas de Estación Lozano',
  },
  routes: { type: 'FeatureCollection', features: [trainRoute, ...busData.map((item) => item.route)] },
  stops: { type: 'FeatureCollection', features: [...trainStops, ...busData.flatMap((item) => item.stops)] },
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Mapa exportado con ${payload.routes.features.length} trazas y ${payload.stops.features.length} paradas.`);
