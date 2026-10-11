import type { OutlineItem } from '../types';

export interface PageSize {
  width: number;
  height: number;
}

/** Rectangle in page fractions: 0/0 is the top left corner, 1/1 the bottom right one. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageLink {
  rect: Rect;
  url?: string;
  /** 1-based target page. */
  page?: number;
}

export interface TextRun {
  text: string;
  rect: Rect;
}

export type PageImage = HTMLCanvasElement | HTMLImageElement | ImageBitmap;

/** Anything that can deliver pages: a PDF, a list of images, … */
export interface PageSource {
  readonly pageCount: number;
  pageSize(page: number): PageSize;
  /** Renders a page so that it is `height` device pixels high. */
  render(page: number, height: number, signal?: AbortSignal): Promise<PageImage>;
  outline(): Promise<OutlineItem[]>;
  links(page: number): Promise<PageLink[]>;
  textRuns(page: number): Promise<TextRun[]>;
  /** Selectable text; the container is sized by the CSS variable `--total-scale-factor`. */
  renderTextLayer?(page: number, container: HTMLElement): Promise<void>;
  destroy(): void;
}
