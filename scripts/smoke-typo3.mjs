import { chromium } from '@playwright/test';

const [out, base] = [process.argv[2], process.argv[3]];
const browser = await chromium.launch();
const page = await browser.newPage({
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 1000 },
});
const logs = [];
page.on('console', (m) => {
  if (m.type() !== 'debug') logs.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(`${base}${process.argv[4] ?? '/pdf-flip'}`);
await page
  .waitForSelector('.pdflip-embedded.is-ready', { timeout: 20000 })
  .catch(() => logs.push('embedded not ready'));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/t-page.png`, fullPage: true });
await page.locator('.pdflip-gallery-item a').first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/t-lightbox.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const href = await page.locator('a[href*="68724"]').getAttribute('href');
await page.goto(new URL(href, base).href);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/t-fullpage.png` });
console.log(logs.join('\n') || 'no console messages');
await browser.close();
