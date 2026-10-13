import test from 'node:test';
import assert from 'node:assert/strict';
import { probePmtilesByteServing } from '../src/utils/pmtiles-health.js';

const payload = () => {
  const bytes = new Uint8Array(16);
  bytes.set(new TextEncoder().encode('PMTiles'));
  return bytes;
};
const makeResponse = (status, range, bytes = payload()) => new Response(bytes, {
  status,
  headers: range ? { 'Content-Range': range } : {},
});

test('PMTiles valid byte range', async () => {
  const value = await probePmtilesByteServing('/map.pmtiles', async (url, options) => {
    assert.equal(url, '/map.pmtiles');
    assert.equal(options.headers.Range, 'bytes=0-15');
    return makeResponse(206, 'bytes 0-15/123456');
  });
  assert.equal(value.archiveBytes, 123456);
});

test('rejects whole-file response, truncated range and corrupted magic', async () => {
  await assert.rejects(() => probePmtilesByteServing('/map', async () => makeResponse(200, null)));
  await assert.rejects(() => probePmtilesByteServing('/map', async () => makeResponse(206, 'bytes 0-15/100', new Uint8Array(0))));
  await assert.rejects(() => probePmtilesByteServing('/map', async () => makeResponse(206, 'bytes 0-15/100', new Uint8Array(16))));
});

test('rejects ignored ranges without buffering entire archive', async () => {
  let cancelled = false;
  let buffered = false;
  const response = {
    status: 200,
    headers: new Headers(),
    body: { async cancel() { cancelled = true; } },
    async arrayBuffer() { buffered = true; throw new Error('Must not read full file'); },
  };
  await assert.rejects(() => probePmtilesByteServing('/huge.pmtiles', async () => response), /lectura parcial segura/);
  assert.equal(cancelled, true);
  assert.equal(buffered, false);
});
