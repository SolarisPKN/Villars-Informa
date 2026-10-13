/**
 * PMTiles requires an uncompressed, exact HTTP 206 byte-range response.
 * This catches CDN/hosting corruption before a blank Leaflet canvas is shown.
 */
export function validatePmtilesRangeResponse(response, bytes) {
  if (response.status !== 206) {
    throw new Error(`El servidor devolvió HTTP ${response.status} en vez de 206 (Partial Content).`);
  }
  const contentRange = response.headers.get('content-range') || '';
  const match = /^bytes 0-15\/(\d+)$/i.exec(contentRange.trim());
  if (!match || Number(match[1]) < 16) {
    throw new Error(`Content-Range PMTiles inválido: ${contentRange || '(ausente)'}`);
  }
  if (bytes.byteLength !== 16) {
    throw new Error(`Rango PMTiles incompleto: llegaron ${bytes.byteLength} de 16 bytes.`);
  }
  if (new TextDecoder().decode(bytes.subarray(0, 7)) !== 'PMTiles') {
    throw new Error('La respuesta por rangos no contiene la firma PMTiles.');
  }
  return { archiveBytes: Number(match[1]) };
}

export async function probePmtilesByteServing(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: { Range: 'bytes=0-15' },
    cache: 'no-store',
  });
  // Check response metadata BEFORE buffering: some static hosts ignore Range and
  // return a whole multi-megabyte archive with HTTP 200.
  const range = response.headers.get('content-range') || '';
  const validRange = /^bytes 0-15\/(\d+)$/i.test(range.trim());
  const advertisedLength = response.headers.get('content-length');
  if (response.status !== 206 || !validRange || (advertisedLength !== null && Number(advertisedLength) !== 16)) {
    await response.body?.cancel?.();
    throw new Error(`PMTiles no admite lectura parcial segura (HTTP ${response.status}, Content-Range: ${range || '(ausente)'}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return validatePmtilesRangeResponse(response, bytes);
}
