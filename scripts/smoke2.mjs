import { chromium } from '@playwright/test';

const out = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 900 },
});
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(`https://pdflip.ddev.site/demos/index.html?_cb=${Date.now()}`);
await page.waitForSelector('#katalog.is-ready');
await page.waitForTimeout(800);
const book = page.locator('#katalog');
await book.locator('.pdflip-button-thumbnails').click();
await page.waitForTimeout(1200);
await book.screenshot({ path: `${out}/10-thumbs.png` });
await book.locator('.pdflip-thumbnail[data-page="6"]').click();
await page.waitForTimeout(1200);
await book.locator('.pdflip-button-outline').click();
await page.waitForTimeout(600);
await book.screenshot({ path: `${out}/11-outline.png` });
await book.locator('.pdflip-button-search').click();
await book.locator('.pdflip-search-input').fill('Naturstein');
await page.waitForTimeout(1500);
console.log('summary', await book.locator('.pdflip-search-summary').textContent());
await book.locator('.pdflip-search-hit').nth(1).click({ timeout: 5000 });
await page.waitForTimeout(1200);
await book.screenshot({ path: `${out}/12-search.png` });
await book.locator('.pdflip-panel-close').click();
// hover peek
const b = await book.locator('.pdflip-book').boundingBox();
await page.mouse.move(b.x + b.width - 20, b.y + b.height - 20);
await page.waitForTimeout(300);
await page.mouse.move(b.x + b.width - 30, b.y + b.height - 30, { steps: 3 });
await page.waitForTimeout(300);
await book.screenshot({ path: `${out}/13-peek.png` });
await page.mouse.move(b.x + 50, b.y - 100);
await page.waitForTimeout(800);
// zoom
await book.locator('.pdflip-button-zoomIn').click();
await page.waitForTimeout(900);
await book.screenshot({ path: `${out}/14-zoom.png` });
console.log(
  JSON.stringify(
    await page.evaluate(() => ({
      hash: location.hash,
      page: document.querySelector('#katalog .pdflip-page-input').value,
    }))
  )
);
// mobile
await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(1000);
await book
  .locator('.pdflip-button-zoomOut')
  .click()
  .catch(() => {});
await page.waitForTimeout(600);
await book.screenshot({ path: `${out}/15-mobile.png` });
console.log(logs.join('\n'));
await browser.close();
