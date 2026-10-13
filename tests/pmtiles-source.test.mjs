import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryPmtilesSource, openPmtilesSource } from '../src/utils/pmtiles-source.js';

const archive = (size = 48) => {
  const data = new Uint8Array(size);
  data.set(new TextEncoder().encode('PMTiles'));
  return data;
};

test('keeps HTTP Range PMTiles source when server responds 206', async () => {
  const response = new Response(archive(16), {
    status: 206, headers: { 'Content-Range': 'bytes 0-15/480' },
  });
  const result = await openPmtilesSource('/map.pmtiles', { expectedBytes: 480, fetchImpl: async () => response });
  assert.equal(result.mode, 'ranges');
  assert.equal(result.source, '/map.pmtiles');
});

test('accepts Cloudflare-style HTTP 200 and serves PMTiles from memory', async () => {
  const result = await openPmtilesSource('/map.pmtiles', {
    expectedBytes: 48, fetchImpl: async () => new Response(archive(), { status: 200 }),
  });
  assert.equal(result.mode, 'memory');
  assert.equal(result.archiveBytes, 48);
  assert.equal(new TextDecoder().decode((await result.source.getBytes(0, 7)).data), 'PMTiles');
  assert.equal((await result.source.getBytes(7, 3)).data.byteLength, 3);
  await assert.rejects(result.source.getBytes(47, 4), RangeError);
  await assert.rejects(result.source.getBytes(-1, 1), RangeError);
});

test('rejects an HTML fallback or a truncated response from the host', async () => {
  await assert.rejects(openPmtilesSource('/x', {
    expectedBytes: 48, fetchImpl: async () => new Response(new Uint8Array(48), { status: 200 }),
  }), /signature/);
  await assert.rejects(openPmtilesSource('/x', {
    expectedBytes: 48, fetchImpl: async () => new Response(archive(47), { status: 200 }),
  }), /Incomplete/);
});

test('refuses full archives above maximum allowed bytes', async () => {
  let cancelled = false;
  const response = {
    status: 200,
    headers: new Headers({ 'Content-Length': '1000' }),
    body: { async cancel() { cancelled = true; } },
  };
  await assert.rejects(openPmtilesSource('/x', {
    maxFullBytes: 64, fetchImpl: async () => response,
  }), /size/);
  assert.equal(cancelled, true);
  await assert.rejects(openPmtilesSource('/x', {
    maxFullBytes: 64, fetchImpl: async () => new Response(archive(128), { status: 200 }),
  }), /size/);
});

test('rejects HTTP 206 with inconsistent archive size', async () => {
  await assert.rejects(openPmtilesSource('/x', {
    expectedBytes: 100, fetchImpl: async () => new Response(archive(16), {
      status: 206, headers: { 'Content-Range': 'bytes 0-15/200' },
    }),
  }), /differs/);
});

test('memory source respects abort and bounds', async () => {
  const src = memoryPmtilesSource(archive().buffer, '/x');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(src.getBytes(0, 2, controller.signal));
});
