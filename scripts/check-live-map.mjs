/**
 * Verify the deployed map in both supported modes: HTTP 206 random access
 * and HTTP 200 bounded whole-file memory source. No API keys required.
 */
import { openPmtilesSource } from '../src/utils/pmtiles-source.js';
import { PMTiles } from 'pmtiles';
import { stat } from 'node:fs/promises';

const origin = process.env.MAP_ORIGIN || 'https://villars.solarispkn.com.ar';
const manifestUrl = new URL('maps/buenos-aires/manifest.json', new URL('/', origin));
const response = await fetch(manifestUrl, { cache: 'no-store' });
if (!response.ok) throw new Error('Manifest HTTP ' + response.status);
const manifest = await response.json();
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.parties) || manifest.parties.length !== 135) {
  throw new Error('Unexpected provincial manifest');
}
const lasHeras = manifest.parties.find((party) => party.id === '06329');
if (!lasHeras) throw new Error('General Las Heras missing from manifest');
for (const entry of [manifest.overview, lasHeras]) {
  const url = new URL(entry.file, manifestUrl);
  const result = await openPmtilesSource(url.href, { expectedBytes: entry.bytes });
  const header = await new PMTiles(result.source).getHeader();
  if (header.maxZoom < header.minZoom) throw new Error('Invalid map zoom: ' + entry.file);
  console.log('OK ' + entry.file + ': ' + result.mode + ', ' + result.archiveBytes +
    ' bytes, zoom ' + header.minZoom + '-' + header.maxZoom);
}
console.log('Deployed PMTiles compatible: HTTP 206 or bounded HTTP 200.');


// A previous healthcheck only opened the provincial overview + Las Heras.
// The primary regional canvas used in Villars was untested in production.
const regionalFile = new URL('../public/maps/villars-region.pmtiles', import.meta.url);
const regionalSize = (await stat(regionalFile)).size;
const regionalUrl = new URL('/maps/villars-region.pmtiles', new URL('/', origin)).href;
const regional = await openPmtilesSource(regionalUrl, { expectedBytes: regionalSize });
const regionalHeader = await new PMTiles(regional.source).getHeader();
if (regionalHeader.maxZoom < 14 ||
    regionalHeader.minLon >= -58.9384 || regionalHeader.maxLon <= -58.9384 ||
    regionalHeader.minLat >= -34.8289 || regionalHeader.maxLat <= -34.8289) {
  throw new Error('Regional PMTiles archive does not cover Villars at expected zoom');
}
console.log('OK Villars regional PMTiles: ' + regional.mode + ', ' + regional.archiveBytes +
  ' bytes, zoom ' + regionalHeader.minZoom + '-' + regionalHeader.maxZoom);
