import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  normalizeBusSnapshot,
  normalizeTrainSnapshots,
  refreshTransport,
} from '../workers/transport-live/src/index.js';
import route136Config from '../src/data/transport-136-villars.json' with { type: 'json' };
import transportMap from '../src/data/transport-map.json' with { type: 'json' };
import transportSchedules from '../src/data/transport-schedules.json' with { type: 'json' };
import { estimateScheduled136, estimateTimetableVehicles, route136MapFeatures } from '../src/utils/transport-route-model.js';

const workerConfig = JSON.parse(await readFile(new URL('../workers/transport-live/wrangler.jsonc', import.meta.url), 'utf8'));
const spanishReadme = await readFile(new URL('../README.es.md', import.meta.url), 'utf8');

const providerBody = {
  data: {
    references: {
      trips: [
        { id: 'trip-villars', routeId: '135_1623' },
        { id: 'trip-other', routeId: '135_9999' },
      ],
    },
    list: [
      {
        id: 'vehicle-entry', vehicleId: 'bus-322', tripId: 'trip-villars',
        location: { lat: -34.8285, lon: -58.9387 }, lastLocationUpdateTime: 1_787_666_340_000,
        tripStatus: { position: { lat: -34.8, lon: -58.9 }, orientation: 120 },
      },
      { id: 'ignored', tripId: 'trip-other', location: { lat: -34, lon: -58 } },
    ],
  },
};

test('la 136 local conserva la T y sólo publica posiciones estimadas por horario', () => {
  const features = route136MapFeatures(route136Config);
  assert.equal(features.route.geometry.type, 'MultiLineString');
  assert.equal(features.route.geometry.coordinates.length, 4);
  assert.deepEqual(features.stops.map(({ properties }) => properties.name), [
    'Estación Marcos Paz', 'Zamudio · RP 40 y RP 6', 'Estación Villars',
    'Estación Plomer', 'General Hornos', 'Terminal Las Heras',
  ]);

  const vehicles = estimateScheduled136(route136Config, new Date('2026-08-31T16:30:00.000Z'));
  assert.ok(vehicles.some(({ routeId }) => routeId === '136-g-marcos-paz-las-heras'));
  assert.ok(vehicles.every(({ provider, positionKind, lat, lon }) => (
    provider === 'published-schedule'
    && positionKind === 'predicted'
    && Number.isFinite(lat)
    && Number.isFinite(lon)
  )));
});

test('la 136 Rápido estima unidades activas desde la grilla completa sin presentarlas como GPS', () => {
  const route = transportSchedules.routes.find(({ lineKey }) => lineKey === '136-rapido');
  const stops = transportMap.stops.features.filter(({ properties }) => properties?.lineKey === '136-rapido');
  const weekdayGrid = route.schedules.find(({ day, direction }) => day.key === 'weekday' && direction === 'Navarro');
  const service = weekdayGrid.services[0];
  const start = service.stops[0].minutes;
  const end = service.stops.at(-1).minutes;
  const minute = Math.floor((start + end) / 2);
  const localDate = new Date(Date.UTC(2026, 7, 31, Math.floor(minute / 60) + 3, minute % 60));
  const vehicles = estimateTimetableVehicles(route, stops, localDate);
  const vehicle = vehicles.find(({ tripId }) => tripId.endsWith(`:${service.id}`));
  assert.ok(vehicle);
  assert.equal(vehicle.routeId, 'schedule-136-rapido');
  assert.equal(vehicle.lineKey, '136-rapido');
  assert.equal(vehicle.positionKind, 'predicted');
  assert.equal(vehicle.provider, 'published-schedule');
  assert.ok(Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lon));
});

test('el despliegue conserva cron y binding, no declara secretos y documenta procedencia', () => {
  assert.deepEqual(workerConfig.triggers?.crons, ['* * * * *']);
  assert.deepEqual(workerConfig.r2_buckets, [{
    binding: 'TRANSPORT_LIVE',
    bucket_name: 'villars-transport-live',
  }]);
  assert.doesNotMatch(JSON.stringify(workerConfig), /CUANDO_SUBO_API_KEY|secret/i);
  assert.match(spanishReadme, /© OpenStreetMap contributors/);
  assert.match(spanishReadme, /transcripción manual/);
  assert.match(spanishReadme, /No se usa una API privada de Moovit ni scraping automatizado/);
});

test('el Worker limita Cuándo SUBO al ramal 322 de Villars', () => {
  const vehicles = normalizeBusSnapshot(providerBody, new Date('2026-08-25T12:00:00Z'));
  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].routeId, '135_1623'); assert.equal(vehicles[0].vehicleId, 'bus:bus-322');
  assert.equal(vehicles[0].positionKind, 'observed'); assert.equal(vehicles[0].stale, false);
});

test('el Worker limita SOFSE a Belgrano Sur y Sarmiento Merlo–Lobos', () => {
  const responses = [{
    timestamp: 1_787_666_400,
    results: [
      {
        servicio: {
          id: 'train-villars', numero: 9001, sentido: 1,
          ramal: { id: 67 }, hasta: { estacion: { nombre: 'Villars' } },
          location: { lat: -34.827, long: -58.94 },
        },
      },
      {
        servicio: {
          id: 'train-other', numero: 3146, sentido: 2,
          ramal: { id: 25 }, location: { lat: -34.6, long: -58.4 },
        },
      },
    ],
  }];

  const vehicles = normalizeTrainSnapshots(responses, new Date('2026-08-25T12:00:00Z'));
  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].vehicleId, 'train:train-villars');
  assert.equal(vehicles[0].routeId, 'sofse-67');
  assert.match(vehicles[0].label, /Villars/);
});

test('SOFSE conserva un tren activo de 20 de Junio a Catán aunque no informe GPS', () => {
  const responses = [{
    results: [{
      servicio: {
        id: null,
        numero: 5010,
        sentido: 2,
        ramal: { id: 67 },
        hasta: { estacion: { nombre: 'González Catán' } },
        location: null,
        estaciones: [
          {
            idElemento: 526,
            nombre: '20 de Junio',
            llegada: { programada: '2026-08-27T21:32:00.000Z' },
            salida: { real: '2026-08-27T21:33:00.000Z' },
          },
          {
            idElemento: 154,
            nombre: 'González Catán',
            llegada: { estimada: '2026-08-27T21:53:00.000Z' },
            salida: { programada: '2026-08-27T21:55:00.000Z' },
          },
        ],
      },
    }],
  }];

  const vehicles = normalizeTrainSnapshots(responses, new Date('2026-08-27T21:50:00.000Z'));
  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].vehicleId, 'train:67:5010:2:2026-08-27');
  assert.equal(vehicles[0].positionKind, 'predicted');
  assert.equal(vehicles[0].fromStop, '20 de Junio');
  assert.equal(vehicles[0].toStop, 'González Catán');
  assert.equal(vehicles[0].scheduledArrivalAt, '2026-08-27T21:53:00.000Z');
  assert.ok(vehicles[0].lat > -34.781 && vehicles[0].lat < -34.771);
  assert.ok(vehicles[0].lon > -58.739 && vehicles[0].lon < -58.646);

  const finished = normalizeTrainSnapshots(responses, new Date('2026-08-27T22:10:00.000Z'));
  assert.equal(finished.length, 0);
});

test('el Worker consulta SOFSE con ramal, sentido, fecha, hora y destino de la app', async () => {
  const queried = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/auth/authorize')) return Response.json({ token: 'test-sofse-token' });
    if (target.includes('/arribos/estacion/')) {
      queried.push(target);
      return Response.json({ results: [] });
    }
    throw new Error('URL inesperada: ' + target);
  };
  try {
    await refreshTransport({
      TRANSPORT_LIVE: { get: async () => null, put: async () => {} },
    }, new Date('2026-08-27T21:50:00.000Z'));

    assert.equal(queried.length, 10);
    const twentyJune = queried.map((value) => new URL(value)).find(({ pathname }) => pathname.endsWith('/526'));
    assert.ok(twentyJune);
    assert.equal(twentyJune.searchParams.get('ramal'), '67');
    assert.equal(twentyJune.searchParams.get('sentido'), '2');
    assert.equal(twentyJune.searchParams.get('fecha'), '2026-08-27');
    assert.equal(twentyJune.searchParams.get('hora'), '18:50');
    assert.equal(twentyJune.searchParams.get('hasta'), '154');
    assert.equal(twentyJune.searchParams.get('paraApp'), 'true');
    const merlo = queried.map((value) => new URL(value)).find(({ pathname, searchParams }) => (
      pathname.endsWith('/269') && searchParams.get('ramal') === '53'
    ));
    assert.ok(merlo);
    assert.equal(merlo.searchParams.get('sentido'), '1');
    assert.equal(merlo.searchParams.get('hasta'), '225');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('el snapshot R2 consolida colectivo y tren sin persistir credenciales', async () => {
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('vehicles-for-agency')) {
      assert.equal(options.headers.Authorization, 'Bearer test-cuando-subo-key');
      return Response.json(providerBody);
    }
    if (target.endsWith('/auth/authorize')) return Response.json({ token: 'test-sofse-token' });
    if (target.includes('/arribos/estacion/154')) {
      assert.equal(options.headers.Authorization, 'test-sofse-token');
      return Response.json({
        timestamp: 1_787_666_400,
        results: [{
          servicio: {
            id: 'train-villars', numero: 9001, sentido: 1,
            ramal: { id: 67 }, hasta: { estacion: { nombre: 'Villars' } },
            location: { lat: -34.827, long: -58.94 },
          },
        }],
      });
    }
    if (target.includes('/arribos/estacion/')) return Response.json({ timestamp: 1_787_666_400, results: [] });
    throw new Error(`URL inesperada: ${target}`);
  };
  try {
    const snapshot = await refreshTransport({
      CUANDO_SUBO_API_KEY: 'test-cuando-subo-key',
      TRANSPORT_LIVE: {
        get: async () => null,
        put: async (...args) => writes.push(args),
      },
    }, new Date('2026-08-25T12:00:00Z'));
    assert.equal(snapshot.schemaVersion, 1);
    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.providers['cuando-subo'].status, 'ok');
    assert.equal(snapshot.providers.sofse.status, 'ok');
    assert.equal(snapshot.providers['cuando-subo'].lastSuccessfulAt, snapshot.generatedAt);
    assert.equal(snapshot.providers.sofse.lastSuccessfulAt, snapshot.generatedAt);
    assert.equal(snapshot.discardAfter, '2026-08-25T12:10:00.000Z');
    assert.equal(snapshot.providers['published-schedule'].status, 'estimated');
    assert.ok(snapshot.vehicles.length >= 2);
    assert.ok(snapshot.vehicles.some(({ provider }) => provider === 'published-schedule'));
    assert.doesNotMatch(JSON.stringify(snapshot), /test-cuando-subo-key|test-sofse-token/);
    assert.equal(writes.length, 1); assert.equal(writes[0][0], 'current.json');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SOFSE publica una formación activa de Sarmiento con su routeId propio', () => {
  const responses = [{
    timestamp: 1_787_666_400,
    results: [{
      servicio: {
        id: 'sarmiento-1001', numero: 1001, sentido: 1,
        ramal: { id: 53 }, hasta: { estacion: { nombre: 'Las Heras' } },
        location: { lat: -34.80, long: -58.85 },
      },
    }],
  }];
  const vehicles = normalizeTrainSnapshots(responses, new Date('2026-08-25T12:00:00Z'));
  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].routeId, 'sofse-53');
  assert.equal(vehicles[0].vehicleId, 'train:sarmiento-1001');
  assert.match(vehicles[0].label, /Las Heras/);
});

test('una respuesta 200 con esquema inválido no se confunde con cero unidades', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('vehicles-for-agency')) return Response.json({ data: {} });
    if (target.endsWith('/auth/authorize')) return Response.json({ token: 'test-sofse-token' });
    if (target.includes('/arribos/estacion/')) return Response.json({ timestamp: 1_787_666_400, results: [] });
    throw new Error(`URL inesperada: ${target}`);
  };
  try {
    const snapshot = await refreshTransport({
      CUANDO_SUBO_API_KEY: 'test-cuando-subo-key',
      TRANSPORT_LIVE: {
        get: async () => ({
          providers: { 'cuando-subo': { lastSuccessfulAt: '2026-08-25T11:59:00.000Z' } },
          vehicles: [{ provider: 'cuando-subo', vehicleId: 'bus:anterior', lat: -34.8, lon: -58.9 }],
        }),
        put: async () => {},
      },
    }, new Date('2026-08-25T12:00:00Z'));
    assert.equal(snapshot.status, 'degraded');
    assert.equal(snapshot.providers['cuando-subo'].status, 'error');
    assert.equal(snapshot.providers['cuando-subo'].lastSuccessfulAt, '2026-08-25T11:59:00.000Z');
    assert.equal(snapshot.vehicles[0].stale, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SOFSE puede operar solo sin consultar Cuándo SUBO ni inventar un error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    assert.doesNotMatch(target, /vehicles-for-agency/);
    if (target.endsWith('/auth/authorize')) return Response.json({ token: 'test-sofse-token' });
    if (target.includes('/arribos/estacion/')) return Response.json({ timestamp: 1_787_666_400, results: [] });
    throw new Error(`URL inesperada: ${target}`);
  };
  try {
    const snapshot = await refreshTransport({
      TRANSPORT_LIVE: { get: async () => null, put: async () => {} },
    }, new Date('2026-08-25T12:00:00Z'));
    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.providers['cuando-subo'].status, 'disabled');
    assert.equal(snapshot.providers.sofse.status, 'ok');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('un fallo del estimador 136 queda aislado y no interrumpe SOFSE ni la escritura R2', async () => {
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/auth/authorize')) return Response.json({ token: 'test-sofse-token' });
    if (target.includes('/arribos/estacion/')) return Response.json({ timestamp: 1_788_195_600, results: [] });
    throw new Error(`URL inesperada: ${target}`);
  };
  try {
    const snapshot = await refreshTransport({
      TRANSPORT_LIVE: {
        get: async () => null,
        put: async (...args) => writes.push(args),
      },
    }, new Date('2026-08-31T18:00:00.000Z'), {
      scheduleCollector: () => { throw new Error('tabla 136 inválida'); },
    });
    assert.equal(snapshot.status, 'degraded');
    assert.equal(snapshot.providers.sofse.status, 'ok');
    assert.equal(snapshot.providers['published-schedule'].status, 'error');
    assert.match(snapshot.providers['published-schedule'].message, /tabla 136 inválida/);
    assert.equal(snapshot.vehicles.some(({ provider }) => provider === 'published-schedule'), false);
    assert.equal(writes.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
