import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RefProxy,
  TextContent,
  TextItem,
} from 'pdfjs-dist/types/src/display/api';
import type { OutlineItem, PdfjsOptions } from '../types';
import { resolveAsset } from '../util/base-url';
import type { PageImage, PageLink, PageSize, PageSource, TextRun } from './types';

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

interface OutlineNode {
  title: string;
  url: string | null;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

export class PdfSource implements PageSource {
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
    password?: string | (() => string | Promise<string>)
  ): Promise<PdfSource> {
    const pdfjs = await loadPdfjs(options);
    const target =
      input instanceof Blob
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
      rangeChunkSize,
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

  async render(page: number, height: number, signal?: AbortSignal): Promise<PageImage> {
    const proxy = await this.page(page);
    signal?.throwIfAborted();
    const base = proxy.getViewport({ scale: 1 });
    const viewport = proxy.getViewport({ scale: height / base.height });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
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

  async renderTextLayer(page: number, container: HTMLElement): Promise<void> {
    const [proxy, content] = await Promise.all([this.page(page), this.text(page)]);
    const layer = new this.pdfjs.TextLayer({
      textContentSource: content,
      container,
      viewport: proxy.getViewport({ scale: 1 }),
    });
    await layer.render();
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
