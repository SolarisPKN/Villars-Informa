import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBusSnapshot, refreshTransport } from '../workers/transport-live/src/index.js';

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

test('el Worker limita Cuándo SUBO al ramal 322 de Villars', () => {
  const vehicles = normalizeBusSnapshot(providerBody, new Date('2026-08-25T12:00:00Z'));
  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].routeId, '135_1623'); assert.equal(vehicles[0].vehicleId, 'bus-322');
  assert.equal(vehicles[0].positionKind, 'observed'); assert.equal(vehicles[0].stale, false);
});

test('el snapshot R2 declara la cobertura ferroviaria como no disponible', async () => {
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(providerBody);
  try {
    const snapshot = await refreshTransport({ TRANSPORT_LIVE: { put: async (...args) => writes.push(args) } }, new Date('2026-08-25T12:00:00Z'));
    assert.equal(snapshot.schemaVersion, 1); assert.equal(snapshot.providers.sofse.status, 'unavailable');
    assert.equal(writes.length, 1); assert.equal(writes[0][0], 'current.json');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
