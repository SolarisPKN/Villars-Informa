/**
 * Host-compatible PMTiles transport: prefer 206 byte ranges; fall back to
 * a bounded, single-file in-memory source when a static host replies 200.
 */
import { validatePmtilesRangeResponse } from './pmtiles-health.js';

export const MAX_LOCAL_PMTILES_BYTES = 25 * 1024 * 1024;

export function memoryPmtilesSource(buffer, key) {
  if (!(buffer instanceof ArrayBuffer)) throw new TypeError('Expected ArrayBuffer');
  return {
    getKey() { return key + '#memory'; },
    async getBytes(offset, length, signal) {
      if (signal?.aborted) throw new Error('PMTiles read aborted');
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
          offset < 0 || length < 0 || offset + length > buffer.byteLength) {
        throw new RangeError('PMTiles byte range exceeds memory archive');
      }
      return { data: buffer.slice(offset, offset + length) };
    },
  };
}

async function boundedDownload(response, maxBytes, expectedBytes) {
  const declared = response.headers.get('content-length');
  if (declared !== null && Number.isFinite(Number(declared)) && Number(declared) > maxBytes) {
    await response.body?.cancel?.();
    throw new Error('PMTiles exceeds permitted archive size');
  }
  const output = new Uint8Array(maxBytes);
  const reader = response.body?.getReader?.();
  let total = 0;
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (total + chunk.value.byteLength > maxBytes) {
          await reader.cancel();
          throw new Error('PMTiles exceeds permitted archive size');
        }
        output.set(chunk.value, total);
        total += chunk.value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > maxBytes) throw new Error('PMTiles exceeds permitted archive size');
    output.set(data);
    total = data.byteLength;
  }
  if (expectedBytes !== undefined && total !== expectedBytes) {
    throw new Error('Incomplete PMTiles archive: got ' + total + ', expected ' + expectedBytes);
  }
  return output.slice(0, total).buffer;
}

export async function openPmtilesSource(
  url, { expectedBytes, maxFullBytes = MAX_LOCAL_PMTILES_BYTES, fetchImpl = fetch } = {},
) {
  if (expectedBytes !== undefined && (!Number.isSafeInteger(expectedBytes) || expectedBytes < 16)) {
    throw new Error('Invalid PMTiles declared size');
  }
  if (expectedBytes !== undefined && expectedBytes > maxFullBytes) {
    throw new Error('PMTiles archive exceeds maximum fallback size');
  }
  const response = await fetchImpl(url, {
    headers: { Range: 'bytes=0-15', Accept: 'application/octet-stream' },
    cache: 'default',
  });
  if (response.status === 206) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    const { archiveBytes } = validatePmtilesRangeResponse(response, bytes);
    if (expectedBytes !== undefined && archiveBytes !== expectedBytes) {
      throw new Error('PMTiles remote size differs from manifest');
    }
    return { source: url, mode: 'ranges', archiveBytes };
  }
  if (response.status !== 200) {
    await response.body?.cancel?.();
    throw new Error('PMTiles server responded HTTP ' + response.status);
  }
  const buffer = await boundedDownload(response, expectedBytes ?? maxFullBytes, expectedBytes);
  if (buffer.byteLength < 16 ||
      new TextDecoder().decode(new Uint8Array(buffer, 0, 7)) !== 'PMTiles') {
    throw new Error('Bad PMTiles signature: server may be serving HTML');
  }
  return { source: memoryPmtilesSource(buffer, url), mode: 'memory', archiveBytes: buffer.byteLength };
}
