/** Smoke test of /salud/ in a real browser, mobile and desktop. */
import { chromium } from 'playwright';

const origin = process.env.HEALTH_ORIGIN || 'http://127.0.0.1:4321';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(new URL('/salud/', origin).href, { waitUntil: 'domcontentloaded', timeout: 35_000 });
  await page.locator('.service-card').first().waitFor();
  const overview = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent,
    cards: [...document.querySelectorAll('.service-card h3')].map((x) => x.textContent),
    pharmacies: [...document.querySelectorAll('[data-pharmacy-card]')].map((x) => ({
      name: x.querySelector('h3')?.textContent, hidden: x.hidden,
    })),
    emergencies: [...document.querySelectorAll('.emergency-contact strong')].map((x) => x.textContent),
    sources: document.querySelectorAll('.health-source-link[href^="https://"]').length,
    telephoneLinks: [...document.querySelectorAll('a[href^="tel:"]')].map((x) => x.getAttribute('href')),
    quickNavigation: document.querySelectorAll('.health-quick-nav a').length,
  }));
  console.log('HEALTH_BROWSER_DESKTOP ' + JSON.stringify(overview));
  for (const name of ['CAPS Villars', 'CAPS General Hornos', 'Hospital Municipal', 'USAM', 'Farmacia Healy']) {
    if (!overview.cards.some((x) => x.includes(name))) throw new Error('Missing visible service: ' + name);
  }
  if (overview.pharmacies.length !== 6 || overview.pharmacies.some((x) => x.hidden)) throw new Error('Six pharmacies must be visible by default');
  if (overview.sources < 20 || overview.quickNavigation !== 3 || overview.telephoneLinks.length < 20) throw new Error('Health links incomplete');
  if (!overview.emergencies.includes('107') || !overview.emergencies.includes('911')) throw new Error('Vital emergency phone missing');
  await page.selectOption('#pharmacy-select', '1');
  const narrowed = await page.locator('[data-pharmacy-card]:visible').count();
  if (narrowed !== 1) throw new Error('Pharmacy selector should filter to one card');
  await page.selectOption('#pharmacy-select', 'all');
  if (await page.locator('[data-pharmacy-card]:visible').count() !== 6) throw new Error('Pharmacy filter reset failed');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    windowWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    emergencyCards: document.querySelectorAll('.emergency-contact').length,
    visiblePrimary: [...document.querySelectorAll('.service-card')].filter((x) => {
      const box = x.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    }).length,
  }));
  console.log('HEALTH_BROWSER_MOBILE ' + JSON.stringify(mobile));
  if (mobile.emergencyCards < 12 || mobile.visiblePrimary !== 5) throw new Error('Mobile content missing');
  if (mobile.scrollWidth > mobile.windowWidth + 8) throw new Error('Horizontal overflow on mobile health page');
  if (errors.length) throw new Error('Client JS failures: ' + errors.join('; '));
} finally {
  await browser.close();
}
