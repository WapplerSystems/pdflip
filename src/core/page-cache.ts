import type { PageImage, PageSource } from '../source/types';

interface Entry {
  height: number;
  image: Promise<PageImage>;
  controller: AbortController;
  lastUsed: number;
  /** Pixels of the rendered image, known once it is ready. */
  pixels: number;
}

/**
 * Pixel budget for all cached pages. Mobile Safari kills the tab when canvases use more
 * than a few hundred MB, so touch devices get a much smaller budget (4 bytes per pixel).
 */
export function defaultPixelBudget(): number {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse ? 24_000_000 : 96_000_000;
}

/**
 * Rendered page images, keyed by page and kept at the largest size requested so far.
 * Least recently used pages are dropped when the cache exceeds its page limit or its
 * pixel budget, which bounds the memory of long documents and deep zoom.
 */
export class PageCache {
  private readonly entries = new Map<number, Entry>();
  private clock = 0;

  constructor(
    private readonly source: PageSource,
    private readonly limit = 16,
    private readonly pixelBudget = defaultPixelBudget()
  ) {}

  /**
   * Returns the page rendered at least `height` device pixels high. Heights are rounded up
   * to steps of 128 px with 10 % tolerance, so that small resizes do not trigger a new render.
   */
  get(page: number, height: number): Promise<PageImage> {
    const rounded = Math.ceil(height / 128) * 128;
    const entry = this.entries.get(page);
    if (entry && entry.height >= rounded * 0.9) {
      entry.lastUsed = ++this.clock;
      return entry.image;
    }
    const controller = new AbortController();
    const image = this.source.render(page, rounded, controller.signal);
    const created: Entry = {
      height: rounded,
      image,
      controller,
      lastUsed: ++this.clock,
      pixels: 0,
    };
    this.entries.set(page, created);
    image.then(
      (result) => {
        created.pixels = result.width * result.height;
        if (entry) void entry.image.then(releaseImage, () => undefined);
        this.evict(page);
      },
      () => {
        if (this.entries.get(page) === created) {
          // fall back to the smaller image that was there before
          if (entry) this.entries.set(page, entry);
          else this.entries.delete(page);
        }
      }
    );
    this.evict(page);
    return image;
  }

  private totalPixels(): number {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.pixels;
    return total;
  }

  private evict(keep: number): void {
    const sorted = [...this.entries.entries()]
      .filter(([page]) => page !== keep)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    let total = this.totalPixels();
    for (const [page, entry] of sorted) {
      if (this.entries.size <= this.limit && total <= this.pixelBudget) break;
      // never drop what was used in the last two frames of interaction (the visible spread)
      if (this.clock - entry.lastUsed < 4) continue;
      entry.controller.abort();
      void entry.image.then(releaseImage, () => undefined);
      this.entries.delete(page);
      total -= entry.pixels;
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      entry.controller.abort();
      void entry.image.then(releaseImage, () => undefined);
    }
    this.entries.clear();
  }
}

function releaseImage(image: PageImage): void {
  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
    // frees the backing store immediately instead of waiting for the garbage collector
    image.width = 0;
    image.height = 0;
  } else if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    image.close();
  }
}
