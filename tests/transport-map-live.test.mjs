import assert from 'node:assert/strict';
import test from 'node:test';
import { featureIsVisible, filtersForSelection, routeFamily, vehicleDirection, vehicleDirectionVariant } from '../src/utils/transport-map-live.js';

test('the Catán-Lozano SOFSE route remains mapped to the Belgrano Sur filter', () => {
  const feature = { properties: { mode: 'train', routeId: 'sofse-67' } };
  assert.equal(routeFamily(feature), 'belgrano-sur');
  assert.equal(featureIsVisible(feature, {
    modes: new Set(['train']),
    routes: new Set(['belgrano-sur']),
  }), true);
});

test('the Merlo-Lobos train and bridge buses keep distinct map families', () => {
  assert.equal(routeFamily({ properties: { mode: 'train', routeId: 'sofse-53' } }), 'sarmiento-merlo-lobos');
  assert.equal(routeFamily({ properties: { mode: 'bus', routeId: '136-villars' } }), '136-villars');
  assert.equal(routeFamily({ properties: { mode: 'bus', routeId: '135_1623' } }), '322-lujan');
  assert.equal(routeFamily({ properties: { mode: 'bus', routeId: '135_1625' } }), '322-canuelas');
  assert.equal(routeFamily({ properties: { mode: 'bus', routeId: '739_670' } }), '136-rapido');
});

test('the schedule selection creates one exclusive mode and route filter', () => {
  const filters = filtersForSelection({ mode: 'train', lineKey: 'belgrano-sur' }, ['positions', 'routes', 'stops']);
  assert.deepEqual([...filters.modes], ['train']);
  assert.deepEqual([...filters.routes], ['belgrano-sur']);
  assert.deepEqual([...filters.layers], ['positions', 'routes', 'stops']);
  assert.equal(featureIsVisible({ properties: { mode: 'train', routeId: 'sofse-67' } }, filters), true);
  assert.equal(featureIsVisible({ properties: { mode: 'train', routeId: 'sofse-53' } }, filters), false);
  assert.equal(featureIsVisible({ properties: { mode: 'bus', routeId: '739_670' } }, filters), false);
});

test('train destinations map to blue and orange without filtering either direction', () => {
  const catan = { properties: { mode: 'train', routeId: 'sofse-67', label: 'Tren 106 · González Catán' } };
  const villars = { properties: { mode: 'train', routeId: 'sofse-67', label: 'Tren 107 · Villars' } };
  assert.equal(vehicleDirection(catan), 'González Catán');
  assert.equal(vehicleDirectionVariant(catan), 'blue');
  assert.equal(vehicleDirectionVariant(villars), 'orange');
});

test('bus route ids and local patterns keep stable opposite colors', () => {
  assert.equal(vehicleDirectionVariant({ properties: { mode: 'bus', routeId: '739_670' } }), 'blue');
  assert.equal(vehicleDirectionVariant({ properties: { mode: 'bus', routeId: '739_671' } }), 'orange');
  assert.equal(vehicleDirectionVariant({ properties: { mode: 'bus', routeId: '135_1623' } }), 'blue');
  assert.equal(vehicleDirectionVariant({ properties: { mode: 'bus', routeId: '135_1624' } }), 'orange');
  assert.equal(vehicleDirectionVariant({ properties: { mode: 'bus', routeId: '136-villars', tripId: '136-f-plomer:480' } }), 'orange');
  assert.equal(vehicleDirectionVariant({ properties: { mode: 'bus', routeId: '136-villars', tripId: '136-f-marcos-paz:840' } }), 'blue');
});

test('a provider without direction evidence remains neutral', () => {
  const feature = { properties: { mode: 'bus', routeId: 'unknown-route', label: 'Colectivo sin destino' } };
  assert.equal(vehicleDirection(feature), null);
  assert.equal(vehicleDirectionVariant(feature), 'unknown');
});
