import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { departuresFor, destinationsFrom, nextService, nextServiceForRoute, scheduleGrid } from '../src/utils/transport-services.js';

const data = JSON.parse(await readFile(new URL('../src/data/transport-schedules.json', import.meta.url), 'utf8'));
const villarsRoutes = data.routes.filter((route) => route.schedules.some((schedule) => schedule.stations.some((station) => station.normalizedName === 'villars')));

test('el snapshot tiene procedencia verificable y estructura estable', () => {
  assert.equal(data.schemaVersion, 2); assert.equal(data.timezone, 'America/Argentina/Buenos_Aires');
  assert.match(data.source.databaseSha256, /^[a-f0-9]{64}$/); assert.equal(data.stats.routes, data.routes.length);
  assert.ok(data.stats.schedules > 0); assert.ok(data.stats.times > 0);
});
test('Villars cuenta con recorridos reales de colectivo y tren', () => {
  assert.ok(villarsRoutes.some((route) => route.type === 'bus')); assert.ok(villarsRoutes.some((route) => route.type === 'train'));
});
test('días, paradas y minutos de cada grilla son válidos', () => {
  const dayKeys = new Set(['weekday', 'saturday', 'sunday']);
  for (const route of data.routes) for (const schedule of route.schedules) {
    assert.ok(dayKeys.has(schedule.day.key)); assert.ok(schedule.direction);
    for (const station of schedule.stations) { assert.ok(station.name); assert.ok(station.times.every((minutes) => Number.isInteger(minutes) && minutes >= 0)); assert.equal(new Set(station.times).size, station.times.length); }
    for (const service of schedule.services) {
      assert.ok(service.name); assert.ok(service.stops.length > 0);
      assert.equal(service.origin, service.stops[0].station); assert.equal(service.destination, service.stops.at(-1).station);
      assert.ok(service.stops.every((stop) => Number.isInteger(stop.minutes) && stop.minutes >= 0));
    }
  }
});
test('el formato conserva servicios posteriores a medianoche', () => {
  assert.ok(data.routes.some((route) => route.schedules.some((schedule) => schedule.stations.some((station) => station.times.some((minutes) => minutes >= 1440)))));
});
test('Lozano no se ofrece en días hábiles y el próximo tren real es el sábado', () => {
  const train = villarsRoutes.find((route) => route.type === 'train' && destinationsFrom(route).includes('Lozano'));
  assert.ok(train);
  assert.deepEqual(departuresFor(train, 'weekday', 'Lozano'), []);
  assert.deepEqual(departuresFor(train, 'saturday', 'Lozano').map(({ minutes }) => minutes), [628, 985]);
  assert.deepEqual(departuresFor(train, 'sunday', 'Lozano').map(({ minutes }) => minutes), [633, 994]);
  const next = nextService(train, 'Lozano', data.timezone, new Date('2026-08-25T15:00:00Z'));
  assert.equal(next.weekday, 6); assert.equal(next.date, '29/8'); assert.equal(next.minutes, 628);
});

test('las grillas muestran juntos lunes a viernes, sábados y domingos por destino', () => {
  const bus = villarsRoutes.find((route) => route.type === 'bus' && destinationsFrom(route).includes('Luján'));
  const train = villarsRoutes.find((route) => route.type === 'train' && destinationsFrom(route).includes('Lozano'));
  assert.ok(bus); assert.ok(train);

  const busWeekday = scheduleGrid(bus, 'weekday');
  assert.deepEqual(busWeekday.columns.map(({ destination }) => destination), ['Luján', 'Marcos Paz']);
  assert.equal(busWeekday.rows.length, 3);
  assert.deepEqual(busWeekday.rows[0].map((departure) => departure.minutes), [360, 493]);

  const trainWeekday = scheduleGrid(train, 'weekday');
  assert.deepEqual(trainWeekday.columns.map(({ destination }) => destination), ['González Catán', 'Lozano']);
  assert.equal(trainWeekday.rows.length, 2);
  assert.equal(trainWeekday.rows[0][0].minutes, 613);
  assert.equal(trainWeekday.rows[0][1], null);

  for (const day of ['weekday', 'saturday', 'sunday']) {
    assert.equal(scheduleGrid(bus, day).columns.length, 2);
    assert.equal(scheduleGrid(train, day).columns.length, 2);
  }

  const next = nextServiceForRoute(bus, data.timezone, new Date('2026-08-25T08:00:00Z'));
  assert.equal(next.destination, 'Luján');
  assert.equal(next.minutes, 360);
});

test('el mapa ofrece filtros separados y no presenta la 136 como traza verificada', async () => {
  const [page, script] = await Promise.all([
    readFile(new URL('../src/pages/transporte.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/scripts/transport-map.js', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /data-map-mode="train"/);
  assert.match(page, /data-map-layer="positions"/);
  assert.match(page, /data-map-layer="routes"/);
  assert.match(page, /data-map-layer="stops"/);
  assert.match(page, /data-map-route="136" disabled/);
  assert.match(script, /function renderFilteredLayers/);
  assert.match(script, /currentLiveFeatures\.filter/);
});
