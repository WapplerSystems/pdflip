import type { PageImage, PageLink, Rect } from '../source/types';
import type { HitPart, SearchHit } from '../ui/search';
import { el } from '../util/dom';

/**
 * One page on screen: a canvas with the rendered page plus optional layers for links,
 * search highlights and selectable text. Overlays are positioned in percent of the page,
 * so they follow every resize and zoom without being recomputed.
 */
export class PageView {
  readonly element: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  private readonly linkLayer: HTMLDivElement;
  private readonly highlightLayer: HTMLDivElement;
  readonly textLayer: HTMLDivElement;
  page: number | null = null;
  /** Height in device pixels of what is painted at the moment. */
  paintedHeight = 0;
  textPage: number | null = null;
  private hits: SearchHit[] = [];
  private activeHit: SearchHit | undefined;

  constructor(className: string) {
    this.canvas = el('canvas', { class: 'pdflip-page-canvas', 'aria-hidden': 'true' });
    this.linkLayer = el('div', { class: 'pdflip-links' });
    this.highlightLayer = el('div', { class: 'pdflip-highlights', 'aria-hidden': 'true' });
    this.textLayer = el('div', { class: 'pdflip-text textLayer' });
    this.element = el(
      'div',
      { class: `pdflip-page is-empty ${className}`, role: 'img', 'aria-hidden': 'true' },
      // the content wrapper is mirrored back in right-to-left books, the page box is not
      el(
        'div',
        { class: 'pdflip-page-content' },
        this.canvas,
        this.highlightLayer,
        this.textLayer,
        this.linkLayer
      )
    );
  }

  /** Switches the page; returns true if it actually changed. */
  setPage(page: number | null, label: string): boolean {
    if (page === this.page) return false;
    this.page = page;
    this.paintedHeight = 0;
    this.element.classList.toggle('is-empty', page === null);
    this.element.classList.add('is-loading');
    if (page === null) {
      this.element.removeAttribute('aria-label');
      this.element.setAttribute('aria-hidden', 'true');
    } else {
      this.element.setAttribute('aria-label', label);
      this.element.removeAttribute('aria-hidden');
    }
    const context = this.canvas.getContext('2d');
    context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.linkLayer.replaceChildren();
    this.highlightLayer.replaceChildren();
    this.hits = [];
    this.activeHit = undefined;
    this.textLayer.replaceChildren();
    this.textPage = null;
    return true;
  }

  paint(image: PageImage, height: number): void {
    if (paintImage(this.canvas, image)) {
      this.paintedHeight = height;
      this.element.classList.remove('is-loading');
    }
  }

  setLinks(
    links: PageLink[],
    target: string,
    onPage: (page: number) => void,
    pageLabel: (page: number) => string
  ): void {
    this.linkLayer.replaceChildren(
      ...links.map((link) => {
        const anchor = el('a', {
          class: 'pdflip-link',
          href: link.url ?? `#page-${link.page}`,
          target: link.url ? target : undefined,
          rel: link.url && target === '_blank' ? 'noopener' : undefined,
          'aria-label': link.url ?? pageLabel(link.page ?? 1),
        });
        place(anchor, link.rect);
        if (link.page !== undefined) {
          const page = link.page;
          anchor.addEventListener('click', (event) => {
            event.preventDefault();
            onPage(page);
          });
        }
        // a click on a link must not start a page turn
        anchor.addEventListener('pointerdown', (event) => event.stopPropagation());
        return anchor;
      })
    );
  }

  /**
   * Marks search hits. Where the text layer is rendered, the marks are measured on its
   * glyph boxes (exact); otherwise they are estimated from the text runs.
   */
  setHighlights(hits: SearchHit[], active: SearchHit | undefined): void {
    this.hits = hits;
    this.activeHit = active;
    const spans = [
      ...this.textLayer.querySelectorAll<HTMLElement>('span:not(.markedContent)'),
    ].filter((span) => span.textContent !== '');
    const box = this.element.getBoundingClientRect();
    const marks: HTMLElement[] = [];
    for (const hit of hits) {
      const rects = spans.length > 0 && box.width > 0 ? measure(hit.parts, spans, box) : hit.rects;
      for (const rect of rects.length > 0 ? rects : hit.rects) {
        const mark = el('div', {
          class: hit === active ? 'pdflip-highlight is-active' : 'pdflip-highlight',
        });
        place(mark, rect);
        marks.push(mark);
      }
    }
    this.highlightLayer.replaceChildren(...marks);
  }

  /** Re-measures the marks once the text layer has been rendered. */
  refreshHighlights(): void {
    if (this.hits.length > 0) this.setHighlights(this.hits, this.activeHit);
  }
}

function measure(parts: HitPart[], spans: HTMLElement[], box: DOMRect): Rect[] {
  const rects: Rect[] = [];
  const range = document.createRange();
  for (const part of parts) {
    const node = spans[part.run]?.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) return [];
    const length = node.textContent?.length ?? 0;
    range.setStart(node, Math.min(part.from, length));
    range.setEnd(node, Math.min(part.to, length));
    for (const r of range.getClientRects()) {
      rects.push({
        x: (r.left - box.left) / box.width,
        y: (r.top - box.top) / box.height,
        width: r.width / box.width,
        height: r.height / box.height,
      });
    }
  }
  return rects;
}

function place(element: HTMLElement, rect: Rect): void {
  element.style.left = `${rect.x * 100}%`;
  element.style.top = `${rect.y * 100}%`;
  element.style.width = `${rect.width * 100}%`;
  element.style.height = `${rect.height * 100}%`;
}

/** Copies a page image into a canvas. Returns false if the image has already been released. */
export function paintImage(canvas: HTMLCanvasElement, image: PageImage): boolean {
  const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  if (!width || !height) return false;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  if (!context) return false;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0);
  return true;
}
