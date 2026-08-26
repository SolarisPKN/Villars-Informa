const WHEN_SUBE_VEHICLES = 'https://cuandosubo.sube.gob.ar/onebusaway-api-webapp/api/where/vehicles-for-agency/135.json?key=web';
const VILLARS_BUS_ROUTES = new Set(['135_1623', '135_1624']);

function timestamp(value) {
  const numeric = Number(value);
  return numeric > 0 ? new Date(numeric).toISOString() : null;
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
      vehicleId: entry.vehicleId || entry.id,
      label: 'Colectivo 322',
      lat: position.lat,
      lon: position.lon,
      bearing: Number.isFinite(entry.tripStatus?.orientation) ? entry.tripStatus.orientation : null,
      updatedAt,
      positionKind: position === observed ? 'observed' : 'predicted',
      stale: ageMs === null || ageMs > 120_000,
    });
  }
  return vehicles;
}

async function fetchJson(url, timeoutMs = 15_000) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Villars-Informa-Live/1.0 (+https://villars.solarispkn.com.ar)' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function collectBus(generatedAt) {
  const body = await fetchJson(WHEN_SUBE_VEHICLES);
  return normalizeBusSnapshot(body, generatedAt);
}

export async function refreshTransport(env, now = new Date()) {
  const generatedAt = now.toISOString();
  const busResult = await Promise.allSettled([collectBus(now)]).then(([result]) => result);
  const busVehicles = busResult.status === 'fulfilled' ? busResult.value : [];
  const snapshot = {
    schemaVersion: 1,
    generatedAt,
    expiresAt: new Date(now.getTime() + 120_000).toISOString(),
    status: busResult.status === 'fulfilled' ? 'ok' : 'degraded',
    providers: {
      'cuando-subo': busResult.status === 'fulfilled'
        ? { status: 'ok', vehicles: busVehicles.length }
        : { status: 'error', message: String(busResult.reason?.message || busResult.reason) },
      sofse: { status: 'unavailable', message: 'La fuente de posiciones ferroviarias todavía no está documentada ni verificada.' },
    },
    vehicles: busVehicles,
  };
  await env.TRANSPORT_LIVE.put('current.json', JSON.stringify(snapshot), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=45, s-maxage=45, stale-while-revalidate=15' },
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
