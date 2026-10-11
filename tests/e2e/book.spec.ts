import { expect, type Page, test } from '@playwright/test';

const errors: string[] = [];

async function open(page: Page) {
  errors.length = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/demos/');
  await expect(page.locator('#katalog')).toHaveClass(/is-ready/, { timeout: 15_000 });
}

test('renders the embedded book and turns pages with the keyboard', async ({ page }) => {
  await open(page);
  const book = page.locator('#katalog');
  const input = book.locator('.pdflip-page-input');
  await expect(input).toHaveValue('1');
  await book.focus();
  await page.keyboard.press('ArrowRight');
  await expect(input).not.toHaveValue('1');
  await expect(page).toHaveURL(/#pdflip-katalog\/\d+/);
  await page.keyboard.press('Home');
  await expect(input).toHaveValue('1');
  expect(errors).toEqual([]);
});

test('turns a page by dragging the corner', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag');
  await open(page);
  const book = page.locator('#katalog');
  await book.focus();
  await page.keyboard.press('ArrowRight');
  await expect(book.locator('.pdflip-page-input')).toHaveValue('2–3');
  const box = (await book.locator('.pdflip-book').boundingBox())!;
  await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, { steps: 8 });
  // the turn layer has no size of its own, so check that it is active rather than "visible"
  await expect(book.locator('.pdflip-turn')).not.toHaveAttribute('hidden');
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.9, { steps: 8 });
  await page.mouse.up();
  await expect(book.locator('.pdflip-page-input')).toHaveValue('4–5');
});

test('finds text and highlights it', async ({ page }) => {
  await open(page);
  const book = page.locator('#katalog');
  await book.locator('.pdflip-button-search').click();
  await book.locator('.pdflip-search-input').fill('Naturstein');
  await expect(book.locator('.pdflip-search-hit').first()).toBeVisible();
  await book.locator('.pdflip-search-hit').first().click();
  await expect(book.locator('.pdflip-highlight').first()).toBeVisible();
});

test('shows thumbnails and the outline', async ({ page }) => {
  await open(page);
  const book = page.locator('#katalog');
  await book.locator('.pdflip-button-thumbnails').click();
  await expect(book.locator('.pdflip-thumbnail')).toHaveCount(16);
  await book.locator('.pdflip-thumbnail[data-page="6"]').click();
  await expect(book.locator('.pdflip-page-input')).toHaveValue(/^6/);
  await book.locator('.pdflip-button-outline').click();
  await expect(book.locator('.pdflip-outline button').first()).toBeVisible();
});

test('opens and closes the lightbox', async ({ page }) => {
  await open(page);
  await page.locator('#lightbox-katalog').click();
  const dialog = page.locator('dialog.pdflip-lightbox');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.pdflip')).toHaveClass(/is-ready/, { timeout: 15_000 });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#lightbox-katalog')).toBeFocused();
  expect(errors).toEqual([]);
});
