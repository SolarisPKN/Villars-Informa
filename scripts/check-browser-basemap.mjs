import { chromium } from 'playwright';

const origin = process.env.MAP_ORIGIN || 'http://127.0.0.1:4321';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
const consoleErrors = [];
const requests = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('response', (response) => {
  if (/\/maps\//.test(response.url())) requests.push({ status: response.status(), url: response.url().split('/').slice(-2).join('/') });
});
try {
  await page.goto(new URL('/transporte/', origin).href, { waitUntil: 'domcontentloaded', timeout: 35_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 35_000 });
  await page.waitForTimeout(8000);
  const details = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas.leaflet-tile')];
    const data = [];
    for (const canvas of canvases) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx || !canvas.width || !canvas.height) continue;
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      let alpha = 0;
      let dark = 0;
      for (let i = 0; i < pixels.length; i += 16) {
        if (pixels[i + 3]) {
          alpha++;
          if (pixels[i] < 20 && pixels[i+1] < 20 && pixels[i+2] < 20) dark++;
          if (colors.size < 1500) colors.add((pixels[i] << 16) | (pixels[i+1] << 8) | pixels[i+2]);
        }
      }
      data.push({ zoom: canvas.parentElement?.className, width: canvas.width, height: canvas.height, alpha, dark, colors: colors.size, loaded: canvas.classList.contains('leaflet-tile-loaded') });
    }
    return { status: document.querySelector('[data-live-map-status]')?.textContent, canvasCount: canvases.length, data, routeLines: document.querySelectorAll('.leaflet-overlay-pane path').length };
  });
  console.log('BROWSER_BASEMAP_DIAGNOSTICS ' + JSON.stringify({ details, errors, consoleErrors, requests }).slice(0, 25000));
  if (process.env.MAP_REPORT_ONLY !== '1' && !details.data.some((tile) => tile.loaded && tile.alpha > 50 && tile.colors >= 4)) {
    throw new Error('Browser rendered no recognizable non-empty basemap canvas, despite PMTiles healthchecks');
  }
  if (process.env.MAP_REPORT_ONLY !== '1' && errors.length) throw new Error('Browser JS errors: ' + errors.join(' | '));
} finally {
  await browser.close();
}
