import assert from 'node:assert/strict';
import test from 'node:test';
import { basemapCanvasHasDetail } from '../src/utils/basemap-visibility.js';

function canvasWithColors(colorAt) {
  const width = 128, height = 128;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    const color = colorAt(x, y);
    pixels[index] = color[0]; pixels[index + 1] = color[1];
    pixels[index + 2] = color[2]; pixels[index + 3] = color[3];
  }
  return {
    width, height,
    getContext() { return { getImageData() { return { data: pixels }; } }; },
  };
}

function fixture(...canvases) {
  return { querySelectorAll() { return canvases; } };
}

test('an HTTP-success PMTiles response without rendered canvases is not considered a painted map', () => {
  assert.equal(basemapCanvasHasDetail(fixture()), false);
  assert.equal(basemapCanvasHasDetail(fixture(canvasWithColors(() => [0, 0, 0, 0]))), false);
  assert.equal(basemapCanvasHasDetail(fixture(canvasWithColors(() => [19, 25, 30, 255]))), false);
});

test('a vector basemap with many colored roads and geographic features is recognized as painted', () => {
  const painted = canvasWithColors((x, y) => [x * 2, y * 2, (x ^ y), 255]);
  assert.equal(basemapCanvasHasDetail(fixture(painted)), true);
});

test('unavailable canvas context does not crash the map and triggers backup decision', () => {
  const unavailable = { width: 256, height: 256, getContext() { throw new Error('Canvas denied'); } };
  assert.equal(basemapCanvasHasDetail(fixture(unavailable)), false);
});
