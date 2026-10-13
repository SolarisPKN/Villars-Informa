import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Cloudflare applies public/_headers while Astro preview does not. Always
// verify the fallback's image host is approved by the actual deployed CSP.
test('CSP permits exactly the free OSM raster fallback image host', async () => {
  const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  const policy = headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(policy, 'public/_headers must define a CSP');
  const imgSource = policy.split(';').map((line) => line.trim()).find((line) => line.startsWith('img-src '));
  assert.ok(imgSource, 'img-src directive is mandatory');
  assert.match(imgSource, /https:\/\/tile\.openstreetmap\.org(?:\s|$)/);
  assert.match(imgSource, /'self'/);
  assert.doesNotMatch(imgSource, /\s\*/);
  const script = await readFile(new URL('../src/scripts/transport-map.js', import.meta.url), 'utf8');
  assert.match(script, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
});
