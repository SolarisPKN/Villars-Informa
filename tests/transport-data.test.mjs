import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const data = JSON.parse(await readFile(new URL('../src/data/transport-schedules.json', import.meta.url), 'utf8'));
const villarsRoutes = data.routes.filter((route) => route.schedules.some((schedule) => schedule.stations.some((station) => station.normalizedName === 'villars')));

test('el snapshot tiene procedencia verificable y estructura estable', () => {
  assert.equal(data.schemaVersion, 1); assert.equal(data.timezone, 'America/Argentina/Buenos_Aires');
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
  }
});
test('el formato conserva servicios posteriores a medianoche', () => {
  assert.ok(data.routes.some((route) => route.schedules.some((schedule) => schedule.stations.some((station) => station.times.some((minutes) => minutes >= 1440)))));
});
