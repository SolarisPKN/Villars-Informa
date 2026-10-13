import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTY_MIN_DISPLAY_ZOOM, addProvincialPmtiles, latLngBoundsFromGeoBounds,
  partiesForViewport,
} from '../src/utils/provincial-pmtiles.js';

const partidoA = {
  id: 'A', file: 'partidos/a.pmtiles', bounds: [-59.5, -35.5, -59.0, -34.5], bytes: 1024,
};
const partidoB = {
  id: 'B', file: 'partidos/b.pmtiles', bounds: [-59.0, -35.5, -58.5, -34.5], bytes: 2048,
};
const manifest = {
  schemaVersion: 1,
  bounds: [-63.5, -41.3, -56.4, -33],
  overview: { file: 'overview.pmtiles', bytes: 3000 },
  maxDataZoom: 15, maxVisualZoom: 18,
  parties: [partidoA, partidoB],
};

function fakeMap(zoom = 10, bounds = [-59.4, -35.2, -59.1, -34.8]) {
  const listeners = new Map();
  return {
    zoom, bounds, layers: new Set(),
    getZoom() { return this.zoom; },
    getBounds() {
      return {
        getWest: () => this.bounds[0], getSouth: () => this.bounds[1],
        getEast: () => this.bounds[2], getNorth: () => this.bounds[3],
      };
    },
    on(events, handler) {
      for (const event of events.split(' ')) listeners.set(event, handler);
    },
    off(events, handler) {
      for (const event of events.split(' ')) {
        if (listeners.get(event) === handler) listeners.delete(event);
      }
    },
    removeLayer(layer) { this.layers.delete(layer); },
    move(bounds, zoom = this.zoom) {
      this.bounds = bounds;
      this.zoom = zoom;
      listeners.get('moveend')?.();
    },
  };
}

function fixture(map, customFactory) {
  const calls = [];
  const factory = customFactory || (async (_, url, options, bytes, transparent) => {
    const layer = {
      url, options,
      on() { return this; },
      addTo(target) { target.layers.add(this); return this; },
    };
    return { layer, deliveryMode: 'memory', header: { maxZoom: 15 } };
  });
  const archiveLayerFactory = async (...args) => {
    calls.push({ url: args[1], options: args[2], bytes: args[3], transparent: args[4] });
    return factory(...args);
  };
  return {
    calls,
    options: {
      map, leafletLayer: () => {},
      manifestLoader: async () => ({ manifest, url: 'https://example.test/maps/manifest.json' }),
      archiveLayerFactory,
      onTileError: (event) => { throw event.error; },
    },
  };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('geographic party bounds are not enlarged to the entire province', () => {
  assert.deepEqual(latLngBoundsFromGeoBounds(partidoA.bounds), [[-35.5, -59.5], [-34.5, -59.0]]);
  assert.deepEqual(partiesForViewport(manifest, [-59.4, -35.2, -59.1, -34.8]).map((p) => p.id), ['A']);
  assert.equal(PARTY_MIN_DISPLAY_ZOOM, 11);
});

test('overview stays on at zoom 10 and 18, detail is transparent and reused while panning', async () => {
  const map = fakeMap();
  const { calls, options } = fixture(map);
  const controller = await addProvincialPmtiles(options);
  const overview = [...map.layers][0];
  assert.equal(controller.mode, 'parties');
  assert.equal(map.layers.size, 1);
  assert.equal(calls[0].options.maxZoom, 18);
  assert.equal(calls[0].options.maxDataZoom, 9);
  map.move([-59.4, -35.2, -59.1, -34.8], 11);
  await settle();
  assert.equal(map.layers.size, 2);
  assert.ok(map.layers.has(overview));
  const a = calls.find((call) => call.url.endsWith('a.pmtiles'));
  assert.equal(a.transparent, true);
  assert.equal(a.options.minZoom, 11);
  assert.deepEqual(a.options.bounds, [[-35.5, -59.5], [-34.5, -59.0]]);

  map.move([-58.9, -35.2, -58.6, -34.8], 13);
  await settle();
  assert.equal(map.layers.size, 2);
  assert.ok(map.layers.has(overview));
  assert.equal(calls.filter((call) => call.url.endsWith('b.pmtiles')).length, 1);

  map.move([-59.4, -35.2, -59.1, -34.8], 18);
  await settle();
  assert.equal(map.layers.size, 2);
  assert.equal(calls.filter((call) => call.url.endsWith('a.pmtiles')).length, 1, 'cache prevents duplicate HTTP 200 downloads');

  map.move([-59.4, -35.2, -59.1, -34.8], 9);
  await settle();
  assert.deepEqual([...map.layers], [overview]);
  controller.destroy();
  assert.equal(map.layers.size, 0);
  map.move([-59.4, -35.2, -59.1, -34.8], 18);
  await settle();
  assert.equal(map.layers.size, 0);
});

test('stale asynchronous party downloads cannot paint outside the latest viewport', async () => {
  let finishA;
  const waitForA = new Promise((resolve) => { finishA = resolve; });
  const map = fakeMap();
  const { options } = fixture(map, async (_, url) => {
    if (url.endsWith('a.pmtiles')) await waitForA;
    const layer = { url, on() { return this; }, addTo(target) { target.layers.add(this); return this; } };
    return { layer, deliveryMode: 'memory', header: { maxZoom: 15 } };
  });
  const controller = await addProvincialPmtiles(options);
  const overview = [...map.layers][0];
  map.move([-59.4, -35.2, -59.1, -34.8], 12);
  await settle();
  map.move([-58.9, -35.2, -58.6, -34.8], 12);
  await settle();
  finishA();
  await settle();
  assert.ok(map.layers.has(overview));
  assert.equal([...map.layers].filter((layer) => layer.url.endsWith('a.pmtiles')).length, 0);
  assert.equal([...map.layers].filter((layer) => layer.url.endsWith('b.pmtiles')).length, 1);
  controller.destroy();
});
