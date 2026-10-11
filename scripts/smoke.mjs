// Quick visual smoke test: loads the demo, takes screenshots of the important states.
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'https://pdflip.ddev.site/demos/index.html';
const browser = await chromium.launch();
const page = await browser.newPage({
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 900 },
});
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(`${url}?_cb=${Date.now()}`);
await page
  .waitForSelector('#katalog.is-ready', { timeout: 15000 })
  .catch(() => logs.push('katalog not ready'));
await page.waitForTimeout(1500);
const book = page.locator('#katalog');
await book.screenshot({ path: `${out}/01-cover.png` });
await book.focus();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(1200);
await book.screenshot({ path: `${out}/02-spread.png` });
// drag a page half way
const vp = await page.locator('#katalog .pdflip-book').boundingBox();
await page.mouse.move(vp.x + vp.width - 5, vp.y + vp.height - 5);
await page.mouse.down();
await page.mouse.move(vp.x + vp.width * 0.6, vp.y + vp.height * 0.7, { steps: 10 });
await book.screenshot({ path: `${out}/03-drag.png` });
await page.mouse.move(vp.x + vp.width * 0.2, vp.y + vp.height * 0.8, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(1000);
await book.screenshot({ path: `${out}/04-after-drag.png` });
const state = await page.evaluate(() => ({
  input: document.querySelector('#katalog .pdflip-page-input')?.value,
  hash: location.hash,
  links: document.querySelectorAll('#katalog .pdflip-link').length,
  textSpans: document.querySelectorAll('#katalog .pdflip-text span').length,
}));
console.log(JSON.stringify(state));
await page.locator('#api-book').scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await page.locator('section:has(#api-book)').screenshot({ path: `${out}/05-api.png` });
await page.locator('.pdflip-rtl, [data-pdflip-direction]').first().scrollIntoViewIfNeeded();
await page.locator('[data-pdflip-direction]').screenshot({ path: `${out}/06-rtl.png` });
await page.locator('#lightbox-katalog').click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/07-lightbox.png` });
console.log(logs.join('\n'));
await browser.close();
