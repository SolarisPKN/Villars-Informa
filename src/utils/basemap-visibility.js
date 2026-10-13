/**
 * Detects the failure mode where protomaps-leaflet silently paints only
 * its uniform background (or never finishes a Canvas tile). HTTP 200/206 and
 * valid PMTiles headers alone cannot establish whether a basemap is visible.
 */
export function basemapCanvasHasDetail(root) {
  const canvases = [...(root?.querySelectorAll?.('canvas.leaflet-tile-loaded') || [])];
  for (const canvas of canvases) {
    if (!canvas.width || !canvas.height) continue;
    let pixels;
    try {
      pixels = canvas.getContext('2d', { willReadFrequently: true })
        ?.getImageData(0, 0, canvas.width, canvas.height).data;
    } catch {
      // Tainted or unavailable 2D context: allow an explicit backup selection.
      continue;
    }
    if (!pixels) continue;
    const colors = new Set();
    let visible = 0;
    // Subsample to avoid expensive 4K framebuffer reads on slower machines.
    for (let y = 6; y < canvas.height; y += 12) {
      for (let x = 6; x < canvas.width; x += 12) {
        const i = (y * canvas.width + x) * 4;
        if (pixels[i + 3] < 16) continue;
        visible++;
        colors.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
        if (colors.size >= 12 && visible >= 12) return true;
      }
    }
  }
  return false;
}
