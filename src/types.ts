import type { Labels } from './i18n';

/** `single` shows one page, `double` a spread of two, `auto` decides by the available space. */
export type PageMode = 'auto' | 'single' | 'double';

/** Reading direction; `rtl` binds the book on the right (Arabic, Hebrew, Manga). */
export type Direction = 'ltr' | 'rtl';

/**
 * How pages turn:
 * - `soft`: paper fold that follows the pointer (default),
 * - `hard`: stiff board rotating around the spine,
 * - `cover`: covers turn hard, inner pages soft.
 */
export type FlipStyle = 'soft' | 'hard' | 'cover';

export type ControlName =
  | 'first'
  | 'prev'
  | 'pageNumber'
  | 'next'
  | 'last'
  | 'zoomIn'
  | 'zoomOut'
  | 'thumbnails'
  | 'outline'
  | 'search'
  | 'autoplay'
  | 'pageMode'
  | 'sound'
  | 'share'
  | 'download'
  | 'fullscreen'
  | 'close';

export interface OutlineItem {
  title: string;
  /** 1-based page number, `null` for entries that only group children. */
  page: number | null;
  /** External target instead of a page. */
  url?: string;
  items: OutlineItem[];
}

export interface PdfjsOptions {
  /** URL of `pdf.min.mjs`. Defaults to `pdfjs/pdf.min.mjs` next to the pdflip script. */
  src?: string;
  /** URL of `pdf.worker.min.mjs`. */
  workerSrc?: string;
  /** Directory with the CMaps (needed for many CJK fonts). */
  cMapUrl?: string;
  /** Directory with the standard fonts (needed for PDFs without embedded fonts). */
  standardFontDataUrl?: string;
  /** Directory with the wasm decoders (JBIG2, JPEG 2000). */
  wasmUrl?: string;
  /** An already imported pdf.js module (`import * as pdfjs from 'pdfjs-dist'`), skips loading `src`. */
  lib?: unknown;
  /**
   * Load the whole file instead of byte ranges. Needed behind servers or caches that
   * break range requests (gzip-compressed PDFs, some CDN and page caches).
   */
  disableRange?: boolean;
  /** Extra HTTP headers for the PDF request (e.g. an Authorization header). */
  httpHeaders?: Record<string, string>;
  /** Send cookies with cross-origin PDF requests. */
  withCredentials?: boolean;
}

/** A PDF as URL or as binary data, or a list of image URLs. */
export type PdflipSource = string | URL | ArrayBuffer | Uint8Array | Blob | string[];

export interface FlipEvent {
  /** 1-based number of the first page of the spread that is now shown. */
  page: number;
  /** 1-based page numbers visible after the flip. */
  pages: number[];
  previousPage: number;
}

export interface PdflipOptions {
  /** URL or data of a PDF, or a list of image URLs used as pages. */
  source: PdflipSource;
  /** Password of an encrypted PDF; a function is asked when the password is needed. */
  password?: string | (() => string | Promise<string>);
  /** Used for the deep link hash (`#pdflip-<id>/<page>`) and the element id. */
  id?: string;
  pageMode: PageMode;
  direction: Direction;
  flipStyle: FlipStyle;
  /** 1-based page to open the book with. */
  startPage: number;
  /** Duration of a page turn in ms. */
  duration: number;
  /**
   * Height of an embedded book: `auto` derives it from the width and the page ratio,
   * a number is taken as pixels, a string as any CSS length (`80vh`).
   */
  height: 'auto' | number | string;
  /** Page width / height. Taken from the first page when not set. */
  pageRatio?: number;
  /** Book background. `transparent` lets the page background show through. */
  background: string;
  /** Controls in the toolbar, in this order. */
  controls: ControlName[];
  /** Toolbar placement. */
  controlsPosition: 'top' | 'bottom' | 'hidden';
  /** Open the thumbnail or outline panel on start. */
  openPanel: 'none' | 'thumbnails' | 'outline';
  /** Custom table of contents; replaces the outline of the PDF when given. */
  outline?: OutlineItem[];
  /** Highest zoom factor. */
  zoomMax: number;
  /** What the mouse wheel does over the book. */
  wheel: 'zoom' | 'flip' | 'none';
  /** Play a page turn sound. */
  sound: boolean;
  /** Own sound file; without it a paper sound is synthesised. */
  soundUrl?: string;
  /** Turn the pages automatically. */
  autoplay: boolean;
  autoplayInterval: number;
  /** Start autoplay right away (otherwise only the control starts it). */
  autoplayStart: boolean;
  /** Show the download control; a string downloads that URL instead of the source. */
  download: boolean | string;
  /** Update and read the URL hash so that pages can be shared. */
  deepLink: boolean;
  /** Clickable links of the PDF (internal and external). */
  links: boolean;
  linkTarget: '_blank' | '_self';
  /** Selectable text layer on the visible pages. */
  textLayer: boolean;
  /** Upper limit of the rendered page height in device pixels. */
  maxTextureSize: number;
  /** Device pixel ratio used for rendering, defaults to `window.devicePixelRatio`. */
  pixelRatio?: number;
  /** Load the document only when the book comes near the viewport. */
  lazy: boolean;
  /** Byte range chunk size for progressive PDF loading. */
  rangeChunkSize: number;
  pdfjs: PdfjsOptions;
  /** UI language, `auto` follows `<html lang>`. */
  locale: string;
  labels?: Partial<Labels>;
  onReady?: (book: unknown) => void;
  /** Return `false` to cancel the flip. */
  beforeFlip?: (event: FlipEvent) => boolean | undefined;
  onFlip?: (event: FlipEvent) => void;
}

export type PdflipInit = Partial<PdflipOptions> & Pick<PdflipOptions, 'source'>;
