import route136Config from '../../../src/data/transport-136-villars.json' with { type: 'json' };
import transportMap from '../../../src/data/transport-map.json' with { type: 'json' };
import transportSchedules from '../../../src/data/transport-schedules.json' with { type: 'json' };
import { estimateScheduled136, estimateTimetableVehicles } from '../../../src/utils/transport-route-model.js';

const CUANDO_SUBO_VEHICLES = 'https://cuandosubo.sube.gob.ar/onebusaway-api-webapp/api/where/vehicles-for-agency/135.json';
const SOFSE_BASE_URL = 'https://api-servicios.sofse.gob.ar/v1';
const VILLARS_BUS_ROUTES = new Set(['135_1623', '135_1624']);
const TRAIN_BRANCHES = new Set([67, 53]);
const SOFSE_QUERIES = [
  { branch: 67, station: 154, destination: 4226, direction: 1 },
  { branch: 67, station: 154, destination: 6000, direction: 1 },
  { branch: 67, station: 526, destination: 154, direction: 2 },
  { branch: 67, station: 3700, destination: 154, direction: 2 },
  { branch: 67, station: 4226, destination: 154, direction: 2 },
  { branch: 67, station: 6000, destination: 154, direction: 2 },
  { branch: 53, station: 269, destination: 225, direction: 1 },
  { branch: 53, station: 254, destination: 225, direction: 1 },
  { branch: 53, station: 225, destination: 269, direction: 2 },
  { branch: 53, station: 254, destination: 269, direction: 2 },
];
const TRAIN_STATIONS = new Map([
  [154, { name: 'González Catán', lat: -34.771634, lon: -58.6467472 }],
  [526, { name: '20 de Junio', lat: -34.7803617, lon: -58.7380117 }],
  [3700, { name: 'Marcos Paz (Belgrano)', lat: -34.7865089, lon: -58.8296815 }],
  [4226, { name: 'Villars', lat: -34.8289569, lon: -58.9384773 }],
  [6000, { name: 'Lozano', lat: -34.850067, lon: -59.0536908 }],
  [269, { name: 'Merlo', lat: -34.6644017, lon: -58.7281142 }],
  [254, { name: 'Marcos Paz', lat: -34.7832092, lon: -58.8366592 }],
  [225, { name: 'Las Heras', lat: -34.9280932, lon: -58.9445443 }],
]);
const FETCH_TIMEOUT_MS = 10_000;
const STALE_AFTER_MS = 120_000;
const UNAVAILABLE_AFTER_MS = 600_000;

function timestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  return new Date(milliseconds).toISOString();
}

function argentinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function argentinaTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return values.hour + ':' + values.minute;
}

function replaceLowercase(value, replacements) {
  return [...value].map((character) => replacements[character] ?? character).join('');
}

function buildSofseCredentials(date = new Date()) {
  const compactDate = argentinaDate(date).replaceAll('-', '');
  const username = btoa(`${compactDate}sofse`);
  const firstPass = replaceLowercase(btoa(username), {
    a: '#t', e: '#x', i: '#f', o: '#l', u: '#7', '=': '#g',
  });
  const secondPass = replaceLowercase(btoa([...firstPass].reverse().join('')), {
    a: '#j', e: '#p', i: '#w', o: '#8', u: '#0', '=': '#v',
  });
  return {
    username,
    password: encodeURIComponent([...secondPass].reverse().join('')),
  };
}

async function fetchJson(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Villars-Informa-Live/1.0 (+https://villars.solarispkn.com.ar)',
      ...options.headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export function normalizeBusSnapshot(body, generatedAt = new Date()) {
  const trips = new Map((body?.data?.references?.trips || []).map((trip) => [trip.id, trip]));
  const vehicles = [];
  for (const entry of body?.data?.list || []) {
    const trip = trips.get(entry.tripId);
    if (!trip || !VILLARS_BUS_ROUTES.has(trip.routeId)) continue;
    const observed = entry.location;
    const predicted = entry.tripStatus?.position;
    const position = Number.isFinite(observed?.lat) && Number.isFinite(observed?.lon) ? observed : predicted;
    if (!Number.isFinite(position?.lat) || !Number.isFinite(position?.lon)) continue;
    const updatedAt = timestamp(entry.lastLocationUpdateTime) || timestamp(entry.lastUpdateTime);
    const ageMs = updatedAt ? generatedAt.getTime() - new Date(updatedAt).getTime() : null;
    vehicles.push({
      provider: 'cuando-subo',
      mode: 'bus',
      routeId: trip.routeId,
      tripId: entry.tripId,
      vehicleId: `bus:${entry.vehicleId || entry.id}`,
      label: 'Colectivo 322 Luján',
      lat: position.lat,
      lon: position.lon,
      bearing: Number.isFinite(entry.tripStatus?.orientation) ? entry.tripStatus.orientation : null,
      updatedAt,
      positionKind: position === observed ? 'observed' : 'predicted',
      stale: ageMs === null || ageMs > STALE_AFTER_MS,
    });
  }
  return vehicles;
}

function stationId(station) {
  return Number(station?.idElemento ?? station?.idEstacion ?? station?.estacion?.idElemento ?? station?.estacion?.id ?? station?.id);
}

function stationName(station) {
  return station?.nombre ?? station?.estacion?.nombre ?? station?.descripcion ?? null;
}

function dateValue(value) {
  const milliseconds = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function eventTime(event, order) {
  for (const field of order) {
    const value = dateValue(event?.[field]);
    if (value !== null) return value;
  }
  return null;
}

function finiteCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function stationPosition(station) {
  const fallback = TRAIN_STATIONS.get(stationId(station));
  const lat = finiteCoordinate(station?.latitud ?? station?.estacion?.latitud ?? fallback?.lat);
  const lon = finiteCoordinate(station?.longitud ?? station?.estacion?.longitud ?? fallback?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, name: stationName(station) || fallback?.name || null };
}

function estimateTrainPosition(service, generatedAt) {
  const stops = (service?.estaciones || [])
    .map((station) => ({
      position: stationPosition(station),
      arrival: eventTime(station?.llegada, ['real', 'estimada', 'programada']),
      departure: eventTime(station?.salida, ['real', 'estimada', 'programada']),
    }))
    .filter(({ position }) => position)
    .sort((left, right) => (left.arrival ?? left.departure ?? Infinity) - (right.arrival ?? right.departure ?? Infinity));
  const now = generatedAt.getTime();

  for (const stop of stops) {
    if (stop.arrival !== null && stop.departure !== null && now >= stop.arrival && now <= stop.departure) {
      return {
        ...stop.position,
        fromStop: stop.position.name,
        toStop: stop.position.name,
        scheduledArrivalAt: new Date(stop.arrival).toISOString(),
      };
    }
  }

  for (let index = 0; index < stops.length - 1; index += 1) {
    const from = stops[index];
    const to = stops[index + 1];
    const start = from.departure ?? from.arrival;
    const end = to.arrival ?? to.departure;
    if (start === null || end === null || end <= start || now < start || now > end) continue;
    const progress = Math.min(1, Math.max(0, (now - start) / (end - start)));
    return {
      lat: from.position.lat + (to.position.lat - from.position.lat) * progress,
      lon: from.position.lon + (to.position.lon - from.position.lon) * progress,
      fromStop: from.position.name,
      toStop: to.position.name,
      scheduledArrivalAt: new Date(end).toISOString(),
    };
  }
  return null;
}

function trainBranch(service) {
  const declaredBranch = Number(service?.ramal?.id);
  if (TRAIN_BRANCHES.has(declaredBranch)) return declaredBranch;
  const stationIds = new Set((service?.estaciones || []).map(stationId).filter(Number.isFinite));
  if (stationIds.has(154) && (stationIds.has(4226) || stationIds.has(6000))) return 67;
  if (stationIds.has(269) && (stationIds.has(254) || stationIds.has(225))) return 53;
  return null;
}

export function normalizeTrainSnapshots(responses, generatedAt = new Date()) {
  const vehicles = new Map();
  for (const body of responses) {
    const receivedAt = timestamp(body?.timestamp) || generatedAt.toISOString();
    for (const item of body?.results || []) {
      const service = item?.servicio ?? item;
      const location = service?.location;
      const branchId = trainBranch(service);
      if (branchId === null) continue;
      const observed = {
        lat: finiteCoordinate(location?.lat),
        lon: finiteCoordinate(location?.long),
      };
      const hasObservedPosition = Number.isFinite(observed.lat) && Number.isFinite(observed.lon);
      const position = hasObservedPosition ? observed : estimateTrainPosition(service, generatedAt);
      if (!position) continue;
      const destination = service?.hasta?.estacion ?? service?.hasta;
      const firstServiceTime = (service?.estaciones || [])
        .map((station) => eventTime(station?.salida, ['programada', 'estimada', 'real']) ?? eventTime(station?.llegada, ['programada', 'estimada', 'real']))
        .find((value) => value !== null);
      const serviceDate = firstServiceTime ? new Date(firstServiceTime).toISOString().slice(0, 10) : argentinaDate(generatedAt);
      const identity = service?.id || [branchId, service?.numero || 'sin-numero', service?.sentido || 'sin-sentido', serviceDate].join(':');
      vehicles.set(identity, {
        provider: 'sofse',
        mode: 'train',
        routeId: `sofse-${branchId}`,
        tripId: service?.id ?? null,
        vehicleId: `train:${identity}`,
        label: `Tren ${service?.numero || ''}${stationName(destination) ? ` · ${stationName(destination)}` : ''}`.trim(),
        lat: position.lat,
        lon: position.lon,
        bearing: null,
        updatedAt: receivedAt,
        positionKind: hasObservedPosition ? 'observed' : 'predicted',
        fromStop: position.fromStop ?? null,
        toStop: position.toStop ?? null,
        scheduledArrivalAt: position.scheduledArrivalAt ?? null,
        stale: generatedAt.getTime() - new Date(receivedAt).getTime() > STALE_AFTER_MS,
      });
    }
  }
  return [...vehicles.values()];
}

async function collectBus(env, generatedAt) {
  if (!env.CUANDO_SUBO_API_KEY) throw new Error('Falta el secreto CUANDO_SUBO_API_KEY');
  const body = await fetchJson(CUANDO_SUBO_VEHICLES, {
    headers: { Authorization: `Bearer ${env.CUANDO_SUBO_API_KEY}` },
  });
  if (!Array.isArray(body?.data?.list) || !Array.isArray(body?.data?.references?.trips)) {
    throw new Error('Cuándo SUBO devolvió una respuesta sin el esquema esperado');
  }
  return normalizeBusSnapshot(body, generatedAt);
}

async function authenticateSofse(generatedAt) {
  const body = await fetchJson(`${SOFSE_BASE_URL}/auth/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSofseCredentials(generatedAt)),
  });
  const token = typeof body === 'string' ? body : body?.token ?? body?.accessToken ?? body?.access_token;
  if (!token) throw new Error('SOFSE no devolvió un token reconocible');
  return token;
}

async function collectTrains(generatedAt) {
  const token = await authenticateSofse(generatedAt);
  const date = argentinaDate(generatedAt);
  const time = argentinaTime(generatedAt);
  const requests = await Promise.allSettled(SOFSE_QUERIES.map(async ({ branch, station, destination, direction }) => {
    const params = new URLSearchParams({
      ramal: String(branch),
      sentido: String(direction),
      cantidad: '30',
      fecha: date,
      hora: time,
      hasta: String(destination),
      paraApp: 'true',
    });
    const body = await fetchJson(
      SOFSE_BASE_URL + '/arribos/estacion/' + station + '?' + params,
      { headers: { Authorization: token } },
    );
    if (!Array.isArray(body?.results)) throw new Error(`SOFSE devolvió una respuesta inválida para la estación ${station}`);
    return body;
  }));
  const successful = requests.filter(({ status }) => status === 'fulfilled').map(({ value }) => value);
  if (successful.length === 0) throw new Error('SOFSE no respondió en ninguna estación controlada');
  return {
    vehicles: normalizeTrainSnapshots(successful, generatedAt),
    partialFailures: requests.length - successful.length,
  };
}

function previousVehicles(snapshot, provider) {
  return (snapshot?.vehicles || [])
    .filter((vehicle) => vehicle?.provider === provider)
    .map((vehicle) => ({ ...vehicle, stale: true }));
}

function safeError(error) {
  const message = String(error?.message || error);
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 160);
}

function previousSuccessAt(snapshot, provider) {
  const value = snapshot?.providers?.[provider]?.lastSuccessfulAt;
  return value && Number.isFinite(new Date(value).getTime()) ? value : null;
}

function isUnavailable(lastSuccessfulAt, now) {
  if (!lastSuccessfulAt) return true;
  return now.getTime() - new Date(lastSuccessfulAt).getTime() > UNAVAILABLE_AFTER_MS;
}

async function readPreviousSnapshot(env) {
  try {
    return await env.TRANSPORT_LIVE.get('current.json', { type: 'json' });
  } catch {
    return null;
  }
}

export async function refreshTransport(env, now = new Date(), options = {}) {
  const previous = await readPreviousSnapshot(env);
  const busConfigured = Boolean(env.CUANDO_SUBO_API_KEY);
  const scheduleCollector = options.scheduleCollector
    || ((generatedAt) => {
      const rapid136 = transportSchedules.routes.find(({ lineKey }) => lineKey === '136-rapido');
      const rapidStops = transportMap.stops.features.filter(({ properties }) => properties?.lineKey === '136-rapido');
      return [
        ...estimateScheduled136(route136Config, generatedAt),
        ...estimateTimetableVehicles(rapid136, rapidStops, generatedAt),
      ];
    });
  const [busResult, trainResult, scheduleResult] = await Promise.allSettled([
    busConfigured ? collectBus(env, now) : Promise.resolve([]),
    collectTrains(now),
    Promise.resolve().then(() => scheduleCollector(now)),
  ]);

  const scheduled136Vehicles = scheduleResult.status === 'fulfilled' ? scheduleResult.value : [];
  const busVehicles = busConfigured && busResult.status === 'fulfilled'
    ? busResult.value
    : busConfigured ? previousVehicles(previous, 'cuando-subo') : [];
  const trainVehicles = trainResult.status === 'fulfilled'
    ? trainResult.value.vehicles
    : previousVehicles(previous, 'sofse');
  const trainPartial = trainResult.status === 'fulfilled' ? trainResult.value.partialFailures : SOFSE_QUERIES.length;
  const generatedAt = now.toISOString();
  const busLastSuccessfulAt = busConfigured && busResult.status === 'fulfilled'
    ? generatedAt
    : busConfigured ? previousSuccessAt(previous, 'cuando-subo') : null;
  const trainLastSuccessfulAt = trainResult.status === 'fulfilled'
    ? generatedAt
    : previousSuccessAt(previous, 'sofse');
  const scheduleLastSuccessfulAt = scheduleResult.status === 'fulfilled'
    ? generatedAt
    : previousSuccessAt(previous, 'published-schedule');
  const busFailed = busConfigured && busResult.status === 'rejected';
  const scheduleFailed = scheduleResult.status === 'rejected';
  const degraded = busFailed || scheduleFailed || trainResult.status === 'rejected' || trainPartial > 0;
  const unavailable = scheduleFailed
    && trainResult.status === 'rejected'
    && (!busConfigured || (busFailed && isUnavailable(busLastSuccessfulAt, now)))
    && isUnavailable(trainLastSuccessfulAt, now);
  const snapshot = {
    schemaVersion: 1,
    generatedAt,
    expiresAt: new Date(now.getTime() + STALE_AFTER_MS).toISOString(),
    discardAfter: new Date(now.getTime() + UNAVAILABLE_AFTER_MS).toISOString(),
    status: unavailable ? 'unavailable' : degraded ? 'degraded' : 'ok',
    providers: {
      'published-schedule': scheduleResult.status === 'fulfilled'
        ? { status: 'estimated', vehicles: scheduled136Vehicles.length, lastSuccessfulAt: scheduleLastSuccessfulAt }
        : { status: 'error', vehicles: 0, lastSuccessfulAt: scheduleLastSuccessfulAt, message: safeError(scheduleResult.reason) },
      'cuando-subo': !busConfigured
        ? { status: 'disabled', vehicles: 0, lastSuccessfulAt: null }
        : busResult.status === 'fulfilled'
        ? { status: 'ok', vehicles: busVehicles.length, lastSuccessfulAt: busLastSuccessfulAt }
        : { status: 'error', vehicles: busVehicles.length, lastSuccessfulAt: busLastSuccessfulAt, message: safeError(busResult.reason) },
      sofse: trainResult.status === 'fulfilled'
        ? { status: trainPartial > 0 ? 'degraded' : 'ok', vehicles: trainVehicles.length, failedStations: trainPartial, lastSuccessfulAt: trainLastSuccessfulAt }
        : { status: 'error', vehicles: trainVehicles.length, lastSuccessfulAt: trainLastSuccessfulAt, message: safeError(trainResult.reason) },
    },
    vehicles: [...busVehicles, ...trainVehicles, ...scheduled136Vehicles],
  };
  await env.TRANSPORT_LIVE.put('current.json', JSON.stringify(snapshot), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'public, max-age=45, s-maxage=45, stale-while-revalidate=15',
    },
    customMetadata: { schemaVersion: '1', generatedAt },
  });
  return snapshot;
}

export default {
  async scheduled(_event, env, context) {
    context.waitUntil(refreshTransport(env));
  },
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', role: 'scheduled-writer', snapshot: 'R2/current.json' });
    }
    return new Response('Not found', { status: 404 });
  },
};
