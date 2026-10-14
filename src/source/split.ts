import type { OutlineItem } from '../types';
import type { PageImage, PageLink, PageSize, PageSource, Rect, TextRun } from './types';

/** One half of a page that holds two printed pages side by side. */
export type Half = 'left' | 'right';

/** A logical page: a whole page of the source, or one half of it. */
export interface Part {
  page: number;
  half?: Half;
}

/** A source that can render and read one half of a page. */
export interface HalvableSource extends PageSource {
  render(page: number, height: number, signal?: AbortSignal, half?: Half): Promise<PageImage>;
  renderTextLayer?(page: number, container: HTMLElement, half?: Half): Promise<void>;
}

/** How far a spread may deviate from twice the cover width and the cover height. */
const TOLERANCE = 0.12;

/**
 * Whether a page is two pages of the cover's size side by side. Compared by size, not by aspect
 * ratio: an A4 landscape page has the ratio of two A4 portrait pages, but is a single page.
 */
export function isSpread(size: PageSize, cover: PageSize): boolean {
  if (cover.width >= cover.height) return false;
  const close = (value: number, target: number) => Math.abs(value - target) / target <= TOLERANCE;
  return close(size.width, 2 * cover.width) && close(size.height, cover.height);
}

/**
 * Logical pages of a document whose inner pages are exported as spreads (common for magazines:
 * a portrait cover, then one landscape page per double page). `null` when nothing is a spread.
 */
export function splitParts(sizes: PageSize[]): Part[] | null {
  const cover = sizes[0];
  if (!cover) return null;
  const parts: Part[] = [];
  let found = false;
  sizes.forEach((size, index) => {
    const page = index + 1;
    if (index > 0 && isSpread(size, cover)) {
      parts.push({ page, half: 'left' }, { page, half: 'right' });
      found = true;
    } else {
      parts.push({ page });
    }
  });
  return found ? parts : null;
}

/** Whether a rectangle of the whole page belongs to the given half (by its centre). */
export function inHalf(rect: Rect, half: Half | undefined): boolean {
  if (!half) return true;
  const centre = rect.x + rect.width / 2;
  return half === 'left' ? centre < 0.5 : centre >= 0.5;
}

/** A rectangle in fractions of the whole page, converted to fractions of the half. */
export function toHalf(rect: Rect, half: Half | undefined): Rect {
  if (!half) return rect;
  const x = half === 'left' ? rect.x * 2 : (rect.x - 0.5) * 2;
  return { x, y: rect.y, width: rect.width * 2, height: rect.height };
}

/** Shows every spread of a source as two pages. */
export class SplitSource implements PageSource {
  private readonly firstPart = new Map<number, number>();

  constructor(
    private readonly inner: HalvableSource,
    private readonly parts: Part[]
  ) {
    parts.forEach((part, index) => {
      if (!this.firstPart.has(part.page)) this.firstPart.set(part.page, index + 1);
    });
    if (inner.renderTextLayer) {
      this.renderTextLayer = (page, container) => {
        const part = this.part(page);
        return inner.renderTextLayer!(part.page, container, part.half);
      };
    }
  }

  renderTextLayer?: (page: number, container: HTMLElement) => Promise<void>;

  get pageCount(): number {
    return this.parts.length;
  }

  private part(page: number): Part {
    return this.parts[page - 1] ?? this.parts[0]!;
  }

  /** The logical page a page of the source starts with (targets of links and the outline). */
  private logical(page: number): number {
    return this.firstPart.get(page) ?? page;
  }

  pageSize(page: number): PageSize {
    const part = this.part(page);
    const size = this.inner.pageSize(part.page);
    return part.half ? { width: size.width / 2, height: size.height } : size;
  }

  render(page: number, height: number, signal?: AbortSignal): Promise<PageImage> {
    const part = this.part(page);
    return this.inner.render(part.page, height, signal, part.half);
  }

  async outline(): Promise<OutlineItem[]> {
    const map = (items: OutlineItem[]): OutlineItem[] =>
      items.map((item) => ({
        ...item,
        page: item.page === null ? null : this.logical(item.page),
        items: map(item.items),
      }));
    return map(await this.inner.outline());
  }

  async links(page: number): Promise<PageLink[]> {
    const part = this.part(page);
    const links = await this.inner.links(part.page);
    return links
      .filter((link) => inHalf(link.rect, part.half))
      .map((link) => {
        const mapped: PageLink = { ...link, rect: toHalf(link.rect, part.half) };
        if (link.page !== undefined) mapped.page = this.logical(link.page);
        return mapped;
      });
  }

  async textRuns(page: number): Promise<TextRun[]> {
    const part = this.part(page);
    const runs = await this.inner.textRuns(part.page);
    return runs
      .filter((run) => inHalf(run.rect, part.half))
      .map((run) => ({ ...run, rect: toHalf(run.rect, part.half) }));
  }

  destroy(): void {
    this.inner.destroy();
  }
}
