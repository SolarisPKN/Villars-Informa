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
  assert.ok(header.maxZoom >= 10, 'regional detail must have zoom 10+ tiles');
  assert.ok(header.minLon < -58.9384 && header.maxLon > -58.9384);
  assert.ok(header.minLat < -34.829 && header.maxLat > -34.829);
});
