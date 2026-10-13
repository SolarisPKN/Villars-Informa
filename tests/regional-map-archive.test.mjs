import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PMTiles } from 'pmtiles';
import { memoryPmtilesSource } from '../src/utils/pmtiles-source.js';

test('regional PMTiles archive bounds/zooms match actual local coverage', async () => {
  const bytes = await readFile(new URL('../public/maps/villars-region.pmtiles', import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const header = await new PMTiles(memoryPmtilesSource(buffer, 'region-audit')).getHeader();
  console.log('REGIONAL_PMTILES_ACTUAL_HEADER ' + JSON.stringify({
    minZoom: header.minZoom, maxZoom: header.maxZoom,
    bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
    center: [header.centerLon, header.centerLat],
    tileDataLength: header.tileDataLength,
  }));
  const source = new PMTiles(memoryPmtilesSource(buffer, 'regional-tile-content'));
  const toTile = (lon, lat, zoom) => {
    const n = 2 ** zoom;
    const rad = lat * Math.PI / 180;
    return [Math.floor((lon + 180) / 360 * n),
      Math.floor((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * n)];
  };
  for (const [name, lon, lat] of [
    ['Villars', -58.93847, -34.82895],
    ['Gonzalez Catan', -58.64675, -34.77163],
    ['Marcos Paz', -58.82968, -34.78650],
    ['Las Heras', -58.94454, -34.92809],
  ]) {
    for (const zoom of [11, 12, 14]) {
      const [x, y] = toTile(lon, lat, zoom);
      const tile = await source.getZxy(zoom, x, y);
      console.log('REGIONAL_TILE_SAMPLE ' + name + ' z' + zoom + ' ' + (tile?.data?.byteLength || 0));
      // These are populated inhabited locations, not optional empty sea tiles.
      assert.ok(tile?.data?.byteLength > 0, name + ' is missing data at z' + zoom);
    }
  }
  assert.ok(header.maxZoom >= 10, 'regional detail must have zoom 10+ tiles');
  assert.ok(header.minLon < -58.9384 && header.maxLon > -58.9384);
  assert.ok(header.minLat < -34.829 && header.maxLat > -34.829);
});
