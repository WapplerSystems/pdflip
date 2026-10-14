import { Flipbook } from './flipbook';
import { openLightbox } from './lightbox';
import { optionsFromElement } from './options';
import { PdfSource } from './source/pdf';
import type { PdflipInit } from './types';
import { elementForHashId, parseHash } from './util/hash';

/**
 * Markup API — no JavaScript needed:
 *
 * ```html
 * <div data-pdflip="brochure.pdf"></div>                         <!-- embedded book -->
 * <a href="brochure.pdf" data-pdflip-lightbox>Open</a>          <!-- opens in a lightbox -->
 * <button data-pdflip-lightbox="brochure.pdf">Open</button>
 * <img data-pdflip-cover="brochure.pdf" alt="">                 <!-- renders the first page -->
 * ```
 *
 * Options go into `data-pdflip-*` attributes (`data-pdflip-page-mode="single"`).
 * Markup written for dFlip (`._df_book`, `._df_thumb`, `._df_button` with `source`) is
 * understood too, so existing content keeps working after a switch.
 */
export function init(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>(
    '[data-pdflip]:not([data-pdflip-lightbox])'
  )) {
    if (Flipbook.get(element)) continue;
    const source = element.dataset.pdflip;
    if (!source) continue;
    new Flipbook(element, { ...optionsFromElement(element), source: parseSource(source) });
  }
  for (const element of root.querySelectorAll<HTMLElement>('._df_book[source]')) {
    if (Flipbook.get(element)) continue;
    new Flipbook(element, { ...compatOptions(element), source: element.getAttribute('source')! });
  }
  for (const element of root.querySelectorAll<HTMLElement>(
    '._df_thumb[source]:not([data-pdflip-thumb])'
  )) {
    upgradeDflipThumb(element);
  }
  for (const element of root.querySelectorAll<HTMLImageElement>('img[data-pdflip-cover]')) {
    void renderCover(element);
  }
  for (const element of root.querySelectorAll<HTMLElement>('._df_book, ._df_thumb, ._df_button')) {
    element.classList.add('pdflip-compat');
  }
  openFromHash();
}

function parseSource(value: string): string | string[] {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as string[];
    } catch {
      // not a list, treat as URL
    }
  }
  return trimmed;
}

let delegated = false;

/** One click handler for all lightbox triggers, also for elements added later. */
export function bindLightboxTriggers(): void {
  if (delegated) return;
  delegated = true;
  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    )
      return;
    const trigger = (event.target as Element).closest<HTMLElement>(
      '[data-pdflip-lightbox], ._df_thumb[source], ._df_button[source]'
    );
    if (!trigger) return;
    const init = lightboxOptions(trigger);
    if (!init) return;
    event.preventDefault();
    openLightbox(init, trigger);
  });
}

function lightboxOptions(trigger: HTMLElement): PdflipInit | undefined {
  if (trigger.matches('[data-pdflip-lightbox]')) {
    const source =
      trigger.dataset.pdflipLightbox || trigger.dataset.pdflip || trigger.getAttribute('href');
    if (!source) return undefined;
    return {
      ...optionsFromElement(trigger),
      source: parseSource(source),
      id: trigger.id || undefined,
    };
  }
  const source = trigger.getAttribute('source');
  return source ? { ...compatOptions(trigger), source, id: trigger.id || undefined } : undefined;
}

/** Translates the most common dFlip attributes. */
function compatOptions(element: HTMLElement): Partial<PdflipInit> {
  const options: Partial<PdflipInit> = optionsFromElement(element);
  const height = element.getAttribute('height');
  if (height && height !== 'auto') options.height = Number(height) || height;
  const direction = element.getAttribute('direction');
  if (direction === '2') options.direction = 'rtl';
  const pageMode = element.getAttribute('pagemode');
  if (pageMode === '1') options.pageMode = 'single';
  if (pageMode === '2') options.pageMode = 'double';
  const openPage = element.getAttribute('openpage');
  if (openPage) options.startPage = Number(openPage);
  return options;
}

function upgradeDflipThumb(element: HTMLElement): void {
  element.dataset.pdflipThumb = '';
  const thumb = element.getAttribute('thumb');
  const title = element.textContent?.trim() ?? '';
  element.setAttribute('role', 'button');
  element.tabIndex = 0;
  element.replaceChildren();
  if (thumb) {
    const image = document.createElement('img');
    image.src = thumb;
    image.alt = '';
    image.loading = 'lazy';
    element.append(image);
  }
  if (title) {
    const caption = document.createElement('span');
    caption.className = 'pdflip-thumb-title';
    caption.textContent = title;
    element.append(caption);
  }
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      element.click();
    }
  });
}

/** Renders the first page of a PDF into an `<img>` (for galleries without prepared thumbnails). */
export async function renderCover(image: HTMLImageElement): Promise<void> {
  const url = image.dataset.pdflipCover;
  if (!url || image.dataset.pdflipCoverDone) return;
  image.dataset.pdflipCoverDone = '1';
  const observer = new IntersectionObserver(async (entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    const source = await PdfSource.open(url, {}, 65536, undefined, undefined, true);
    const width = Math.max(200, image.clientWidth || 300) * (window.devicePixelRatio || 1);
    const size = source.pageSize(1);
    const canvas = (await source.render(
      1,
      (width * size.height) / size.width
    )) as HTMLCanvasElement;
    image.src = canvas.toDataURL('image/jpeg', 0.85);
    source.destroy();
  });
  observer.observe(image);
}

/** A deep link (also one shared from dFlip) pointing at a lightbox trigger opens it on that page. */
function openFromHash(): void {
  const target = parseHash();
  if (!target) return;
  const trigger = elementForHashId(target.id);
  if (!trigger || Flipbook.get(trigger)) return;
  const init = lightboxOptions(trigger);
  if (init) openLightbox({ ...init, startPage: target.page }, trigger);
}
