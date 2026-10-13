/**
 * Verify the deployed map in both supported modes: HTTP 206 random access
 * and HTTP 200 bounded whole-file memory source. No API keys required.
 */
import { openPmtilesSource } from '../src/utils/pmtiles-source.js';
import { PMTiles } from 'pmtiles';

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
