import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const origin = process.env.MAP_ORIGIN || 'http://127.0.0.1:4321';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
const consoleErrors = [];
const requests = [];
const failLocalTiles = process.env.MAP_BREAK_PMTILES === '1';
const forceAlternate = process.env.MAP_FORCE_ALTERNATE === '1';
const testCsp = process.env.MAP_TEST_CSP === '1';
if (testCsp) {
  const headersFile = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  const policy = headersFile.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  if (!policy) throw new Error('No CSP present in public/_headers');
  await page.route(/\/transporte\/$/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
}
const cspViolations = [];
page.on('console', (msg) => { if (/Content Security Policy|violates the following|Refused to load/i.test(msg.text())) cspViolations.push(msg.text()); });
if (failLocalTiles) {
  await page.route(/\.pmtiles(?:$|\?)/, (route) => route.fulfill({ status: 503, body: 'simulated-PMTiles-down' }));
}
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('response', (response) => {
  if (/\/maps\//.test(response.url()) || /tile\.openstreetmap\.org/.test(response.url())) {
    requests.push({ status: response.status(), url: response.url().split('/').slice(-3).join('/') });
  }
});
try {
  await page.goto(new URL('/transporte/', origin).href, { waitUntil: 'domcontentloaded', timeout: 35_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 35_000 });
  await page.waitForTimeout(failLocalTiles ? 3000 : 8000);
  if (forceAlternate) {
    await page.locator('[data-map-alternate]').click();
  }
  if (forceAlternate || failLocalTiles) {
    await page.waitForFunction(() => [...document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile')]
      .some((img) => img.complete && img.naturalWidth > 0), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
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
    return {
      status: document.querySelector('[data-live-map-status]')?.textContent,
      alternateButton: document.querySelector('[data-map-alternate]')?.textContent,
      backupImages: document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile').length,
      backupImagesLoaded: [...document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile')]
        .filter((img) => img.complete && img.naturalWidth > 0).length,
      backupImagesFailed: [...document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile')]
        .filter((img) => img.complete && img.naturalWidth === 0).length,
      backupVisible: [...document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile')]
        .some((img) => img.complete && img.naturalWidth > 0 && (() => {
          const r = img.getBoundingClientRect();
          const box = document.querySelector('[data-transport-map]')?.getBoundingClientRect();
          return box && r.width > 0 && r.height > 0 && r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom;
        })()),
      canvasCount: canvases.length, data,
      routeLines: document.querySelectorAll('.leaflet-overlay-pane path').length,
    };
  });
  console.log('BROWSER_BASEMAP_DIAGNOSTICS ' + JSON.stringify({ details, errors, consoleErrors, cspViolations, requests }).slice(0, 25000));
  if ((failLocalTiles || forceAlternate) &&
      (details.backupImagesLoaded < 1 || !details.backupVisible || !details.status.includes('OpenStreetMap'))) {
    throw new Error('The alternate OSM basemap must LOAD visible PNG tiles, not merely create image elements: ' +
      JSON.stringify({ images: details.backupImages, loaded: details.backupImagesLoaded, failed: details.backupImagesFailed, cspViolations, requests }));
  }
  if (process.env.MAP_REPORT_ONLY !== '1' && !failLocalTiles && !forceAlternate && !details.data.some((tile) => tile.loaded && tile.alpha > 50 && tile.colors >= 4)) {
    throw new Error('Browser rendered no recognizable non-empty basemap canvas, despite PMTiles healthchecks');
  }
  if (process.env.MAP_REPORT_ONLY !== '1' && errors.length) throw new Error('Browser JS errors: ' + errors.join(' | '));
} finally {
  await browser.close();
}
