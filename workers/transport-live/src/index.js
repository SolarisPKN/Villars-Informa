const CUANDO_SUBO_VEHICLES = 'https://cuandosubo.sube.gob.ar/onebusaway-api-webapp/api/where/vehicles-for-agency/135.json';
const SOFSE_BASE_URL = 'https://api-servicios.sofse.gob.ar/v1';
const VILLARS_BUS_ROUTES = new Set(['135_1623', '135_1624']);
const VILLARS_TRAIN_BRANCH = 67;
const SOFSE_STATIONS = [154, 4226, 6000];
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
  return Number(station?.idElemento ?? station?.idEstacion ?? station?.estacion?.idElemento ?? station?.id);
}

function stationName(station) {
  return station?.nombre ?? station?.estacion?.nombre ?? station?.descripcion ?? null;
}

function trainIsRelevant(service) {
  if (Number(service?.ramal?.id) === VILLARS_TRAIN_BRANCH) return true;
  const stationIds = new Set((service?.estaciones || []).map(stationId).filter(Number.isFinite));
  return stationIds.has(154) && (stationIds.has(4226) || stationIds.has(6000));
}

export function normalizeTrainSnapshots(responses, generatedAt = new Date()) {
  const vehicles = new Map();
  for (const body of responses) {
    const receivedAt = timestamp(body?.timestamp) || generatedAt.toISOString();
    for (const item of body?.results || []) {
      const service = item?.servicio ?? item;
      const location = service?.location;
      if (!trainIsRelevant(service) || !Number.isFinite(location?.lat) || !Number.isFinite(location?.long)) continue;
      const destination = service?.hasta?.estacion ?? service?.hasta;
      const identity = service?.id || `${service?.numero || 'sin-numero'}:${service?.sentido || 'sin-sentido'}`;
      vehicles.set(identity, {
        provider: 'sofse',
        mode: 'train',
        routeId: `sofse-${VILLARS_TRAIN_BRANCH}`,
        tripId: service?.id ?? null,
        vehicleId: `train:${identity}`,
        label: `Tren ${service?.numero || ''}${stationName(destination) ? ` · ${stationName(destination)}` : ''}`.trim(),
        lat: location.lat,
        lon: location.long,
        bearing: null,
        updatedAt: receivedAt,
        positionKind: 'observed',
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
  const requests = await Promise.allSettled(SOFSE_STATIONS.map(async (station) => {
    const body = await fetchJson(
      `${SOFSE_BASE_URL}/arribos/estacion/${station}`,
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

export async function refreshTransport(env, now = new Date()) {
  const previous = await readPreviousSnapshot(env);
  const busConfigured = Boolean(env.CUANDO_SUBO_API_KEY);
  const [busResult, trainResult] = await Promise.allSettled([
    busConfigured ? collectBus(env, now) : Promise.resolve([]),
    collectTrains(now),
  ]);

  const busVehicles = busConfigured && busResult.status === 'fulfilled'
    ? busResult.value
    : busConfigured ? previousVehicles(previous, 'cuando-subo') : [];
  const trainVehicles = trainResult.status === 'fulfilled'
    ? trainResult.value.vehicles
    : previousVehicles(previous, 'sofse');
  const trainPartial = trainResult.status === 'fulfilled' ? trainResult.value.partialFailures : SOFSE_STATIONS.length;
  const generatedAt = now.toISOString();
  const busLastSuccessfulAt = busConfigured && busResult.status === 'fulfilled'
    ? generatedAt
    : busConfigured ? previousSuccessAt(previous, 'cuando-subo') : null;
  const trainLastSuccessfulAt = trainResult.status === 'fulfilled'
    ? generatedAt
    : previousSuccessAt(previous, 'sofse');
  const busFailed = busConfigured && busResult.status === 'rejected';
  const degraded = busFailed || trainResult.status === 'rejected' || trainPartial > 0;
  const unavailable = trainResult.status === 'rejected'
    && (!busConfigured || (busFailed && isUnavailable(busLastSuccessfulAt, now)))
    && isUnavailable(trainLastSuccessfulAt, now);
  const snapshot = {
    schemaVersion: 1,
    generatedAt,
    expiresAt: new Date(now.getTime() + STALE_AFTER_MS).toISOString(),
    discardAfter: new Date(now.getTime() + UNAVAILABLE_AFTER_MS).toISOString(),
    status: unavailable ? 'unavailable' : degraded ? 'degraded' : 'ok',
    providers: {
      'cuando-subo': !busConfigured
        ? { status: 'disabled', vehicles: 0, lastSuccessfulAt: null }
        : busResult.status === 'fulfilled'
        ? { status: 'ok', vehicles: busVehicles.length, lastSuccessfulAt: busLastSuccessfulAt }
        : { status: 'error', vehicles: busVehicles.length, lastSuccessfulAt: busLastSuccessfulAt, message: safeError(busResult.reason) },
      sofse: trainResult.status === 'fulfilled'
        ? { status: trainPartial > 0 ? 'degraded' : 'ok', vehicles: trainVehicles.length, failedStations: trainPartial, lastSuccessfulAt: trainLastSuccessfulAt }
        : { status: 'error', vehicles: trainVehicles.length, lastSuccessfulAt: trainLastSuccessfulAt, message: safeError(trainResult.reason) },
    },
    vehicles: [...busVehicles, ...trainVehicles],
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
