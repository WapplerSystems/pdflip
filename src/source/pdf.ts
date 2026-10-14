import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RefProxy,
  TextContent,
  TextItem,
} from 'pdfjs-dist/types/src/display/api';
import type { OutlineItem, PdfjsOptions } from '../types';
import { resolveAsset } from '../util/base-url';
import type { Half, HalvableSource } from './split';
import type { PageImage, PageLink, PageSize, TextRun } from './types';

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | undefined;

/** Loads pdf.js once per page, on first use. */
export function loadPdfjs(options: PdfjsOptions): Promise<PdfjsModule> {
  if (options.lib) {
    return Promise.resolve(options.lib as PdfjsModule);
  }
  pdfjsPromise ??= import(/* @vite-ignore */ options.src ?? resolveAsset('pdfjs/pdf.min.mjs')).then(
    (module: PdfjsModule) => {
      module.GlobalWorkerOptions.workerSrc =
        options.workerSrc ?? resolveAsset('pdfjs/pdf.worker.min.mjs');
      return module;
    }
  );
  return pdfjsPromise;
}

/**
 * Loads a PDF through byte-range requests only. pdf.js on its own starts with a plain GET and
 * cancels it once the headers show range support; on a fast line large files arrive whole before
 * that. Without range support the first response already is the whole file.
 */
async function rangeTarget(
  pdfjs: PdfjsModule,
  url: string,
  options: PdfjsOptions,
  chunkSize: number
): Promise<
  | { range: InstanceType<PdfjsModule['PDFDataRangeTransport']> }
  | { data: Uint8Array }
  | { url: string }
> {
  const request = (begin: number, end: number) =>
    fetch(url, {
      headers: { ...options.httpHeaders, Range: `bytes=${begin}-${end - 1}` },
      credentials: options.withCredentials ? 'include' : 'same-origin',
    });
  const response = await request(0, chunkSize);
  if (response.status === 200) {
    return { data: new Uint8Array(await response.arrayBuffer()) };
  }
  const length = Number(response.headers.get('Content-Range')?.split('/')[1]);
  if (response.status !== 206 || !Number.isFinite(length) || length <= 0) {
    // Content-Range not readable (cross-origin without exposed header): leave it to pdf.js.
    await response.body?.cancel();
    return { url };
  }
  const transport = new pdfjs.PDFDataRangeTransport(
    length,
    new Uint8Array(await response.arrayBuffer())
  );
  transport.requestDataRange = (begin: number, end: number) => {
    request(begin, end)
      .then((part) => part.arrayBuffer())
      .then((data) => transport.onDataRange(begin, new Uint8Array(data)))
      .catch(() => transport.abort());
  };
  return { range: transport };
}

interface OutlineNode {
  title: string;
  url: string | null;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

export class PdfSource implements HalvableSource {
  private readonly sizes: PageSize[] = [];
  private readonly pages = new Map<number, Promise<PDFPageProxy>>();
  private readonly texts = new Map<number, Promise<TextContent>>();

  private constructor(
    private readonly pdfjs: PdfjsModule,
    private readonly document: PDFDocumentProxy,
    private readonly close: () => Promise<void>
  ) {}

  static async open(
    input: string | URL | ArrayBuffer | Uint8Array | Blob,
    options: PdfjsOptions,
    rangeChunkSize: number,
    onProgress?: (ratio: number) => void,
    password?: string | (() => string | Promise<string>),
    onlyNeeded = false
  ): Promise<PdfSource> {
    const pdfjs = await loadPdfjs(options);
    const target =
      onlyNeeded && !options.disableRange && (typeof input === 'string' || input instanceof URL)
        ? await rangeTarget(pdfjs, String(input), options, rangeChunkSize)
        : input instanceof Blob
          ? { data: new Uint8Array(await input.arrayBuffer()) }
          : input instanceof ArrayBuffer
            ? { data: new Uint8Array(input) }
            : input instanceof Uint8Array
              ? { data: input }
              : { url: String(input) };
    const task = pdfjs.getDocument({
      ...target,
      disableRange: options.disableRange ?? false,
      httpHeaders: options.httpHeaders,
      withCredentials: options.withCredentials ?? false,
      password: typeof password === 'string' ? password : undefined,
      cMapUrl: options.cMapUrl ?? resolveAsset('pdfjs/cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: options.standardFontDataUrl ?? resolveAsset('pdfjs/standard_fonts/'),
      wasmUrl: options.wasmUrl ?? resolveAsset('pdfjs/wasm/'),
      iccUrl: options.iccUrl ?? resolveAsset('pdfjs/iccs/'),
      rangeChunkSize,
      // Only the ranges of the pages that are read (books by default, gallery covers), or the
      // whole file in the background (option `prefetch`).
      disableAutoFetch: onlyNeeded,
    });
    if (onProgress) {
      task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
        if (total > 0) onProgress(Math.min(1, loaded / total));
      };
    }
    if (typeof password === 'function') {
      task.onPassword = (update: (value: string) => void) => {
        void Promise.resolve(password()).then(update);
      };
    }
    const document = await task.promise;
    const source = new PdfSource(pdfjs, document, () => task.destroy());
    // The layout needs the size of every page up front; the first page is usually
    // representative, the others are read lazily and replace the estimate.
    const first = await source.page(1);
    const [, , width, height] = first.view as [number, number, number, number];
    const rotated = first.rotate % 180 !== 0;
    for (let i = 0; i < document.numPages; i++) {
      source.sizes.push(rotated ? { width: height, height: width } : { width, height });
    }
    return source;
  }

  get pageCount(): number {
    return this.document.numPages;
  }

  pageSize(page: number): PageSize {
    return this.sizes[page - 1] ?? this.sizes[0] ?? { width: 595, height: 842 };
  }

  /** Reads the real size of one page. */
  async loadPageSize(page: number): Promise<PageSize> {
    await this.page(page);
    return this.pageSize(page);
  }

  /** Reads the real size of every page (the page dictionaries only, not their content). */
  async allPageSizes(): Promise<PageSize[]> {
    await Promise.all(
      Array.from({ length: this.document.numPages }, (_, index) => this.page(index + 1))
    );
    return [...this.sizes];
  }

  private page(page: number): Promise<PDFPageProxy> {
    let promise = this.pages.get(page);
    if (!promise) {
      promise = this.document.getPage(page).then((proxy) => {
        const viewport = proxy.getViewport({ scale: 1 });
        this.sizes[page - 1] = { width: viewport.width, height: viewport.height };
        return proxy;
      });
      this.pages.set(page, promise);
    }
    return promise;
  }

  async render(
    page: number,
    height: number,
    signal?: AbortSignal,
    half?: Half
  ): Promise<PageImage> {
    const proxy = await this.page(page);
    signal?.throwIfAborted();
    const base = proxy.getViewport({ scale: 1 });
    const scale = height / base.height;
    // a half is the whole page drawn into a canvas half as wide, shifted for the right one
    const viewport = proxy.getViewport({
      scale,
      offsetX: half === 'right' ? -(base.width * scale) / 2 : 0,
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(half ? viewport.width / 2 : viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const task = proxy.render({ canvas, viewport, background: '#ffffff' });
    const abort = () => task.cancel();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await task.promise;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
    return canvas;
  }

  async outline(): Promise<OutlineItem[]> {
    const nodes = (await this.document.getOutline()) as OutlineNode[] | null;
    if (!nodes) {
      return [];
    }
    return Promise.all(nodes.map((node) => this.outlineItem(node)));
  }

  private async outlineItem(node: OutlineNode): Promise<OutlineItem> {
    const item: OutlineItem = {
      title: node.title,
      page: await this.resolveDestination(node.dest),
      items: await Promise.all(node.items.map((child) => this.outlineItem(child))),
    };
    if (node.url) {
      item.url = node.url;
    }
    return item;
  }

  private async resolveDestination(dest: string | unknown[] | null): Promise<number | null> {
    try {
      const explicit = typeof dest === 'string' ? await this.document.getDestination(dest) : dest;
      const target = explicit?.[0];
      if (typeof target === 'number') {
        return target + 1;
      }
      if (target && typeof target === 'object') {
        return (await this.document.getPageIndex(target as RefProxy)) + 1;
      }
    } catch {
      // broken destinations are common in real-world PDFs, the entry just has no target
    }
    return null;
  }

  async links(page: number): Promise<PageLink[]> {
    const proxy = await this.page(page);
    const viewport = proxy.getViewport({ scale: 1 });
    const annotations = (await proxy.getAnnotations({ intent: 'display' })) as Array<{
      subtype: string;
      rect: number[];
      url?: string;
      dest?: string | unknown[];
    }>;
    const links: PageLink[] = [];
    for (const annotation of annotations) {
      if (annotation.subtype !== 'Link') continue;
      const [ax, ay, bx, by] = annotation.rect as [number, number, number, number];
      const [x1, y1] = viewport.convertToViewportPoint(ax, ay) as [number, number];
      const [x2, y2] = viewport.convertToViewportPoint(bx, by) as [number, number];
      const rect = normalizeRect(x1, y1, x2, y2, viewport.width, viewport.height);
      if (annotation.url) {
        links.push({ rect, url: annotation.url });
      } else if (annotation.dest) {
        const target = await this.resolveDestination(annotation.dest);
        if (target) links.push({ rect, page: target });
      }
    }
    return links;
  }

  private text(page: number): Promise<TextContent> {
    let promise = this.texts.get(page);
    if (!promise) {
      promise = this.page(page).then((proxy) => proxy.getTextContent());
      this.texts.set(page, promise);
    }
    return promise;
  }

  async textRuns(page: number): Promise<TextRun[]> {
    const [proxy, content] = await Promise.all([this.page(page), this.text(page)]);
    const viewport = proxy.getViewport({ scale: 1 });
    const runs: TextRun[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      const text = item as TextItem;
      const m = this.pdfjs.Util.transform(viewport.transform, text.transform) as number[];
      const fontHeight = Math.hypot(m[2]!, m[3]!);
      const width = text.width * viewport.scale;
      runs.push({
        text: text.str,
        rect: {
          x: m[4]! / viewport.width,
          y: (m[5]! - fontHeight) / viewport.height,
          width: width / viewport.width,
          height: (fontHeight * 1.15) / viewport.height,
        },
      });
    }
    return runs;
  }

  async renderTextLayer(page: number, container: HTMLElement, half?: Half): Promise<void> {
    const [proxy, content] = await Promise.all([this.page(page), this.text(page)]);
    const base = proxy.getViewport({ scale: 1 });
    const viewport = proxy.getViewport({
      scale: 1,
      offsetX: half === 'right' ? -base.width / 2 : 0,
    });
    let source = content;
    if (half) {
      // only the text of this half, the other one would lie over the neighbouring page
      source = {
        ...content,
        items: content.items.filter((item) => {
          if (!('str' in item)) return true;
          const m = this.pdfjs.Util.transform(viewport.transform, item.transform) as number[];
          const centre = m[4]! + (item.width * viewport.scale) / 2;
          return centre >= 0 && centre < base.width / 2;
        }),
      };
    }
    const layer = new this.pdfjs.TextLayer({ textContentSource: source, container, viewport });
    await layer.render();
    if (half) {
      container.style.width = `calc(var(--total-scale-factor) * ${base.width / 2}px)`;
    }
  }

  destroy(): void {
    void this.close();
  }
}

function normalizeRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  height: number
) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  return {
    x: left / width,
    y: top / height,
    width: Math.abs(x2 - x1) / width,
    height: Math.abs(y2 - y1) / height,
  };
}
