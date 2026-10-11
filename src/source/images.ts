import type { OutlineItem } from '../types';
import type { PageImage, PageLink, PageSize, PageSource, TextRun } from './types';

/** A list of images (JPEG, PNG, WebP, AVIF, SVG …), one per page. */
export class ImageSource implements PageSource {
  private readonly images = new Map<number, Promise<HTMLImageElement>>();
  private readonly sizes: PageSize[];

  private constructor(
    private readonly urls: string[],
    first: PageSize
  ) {
    this.sizes = urls.map(() => first);
  }

  static async open(urls: string[]): Promise<ImageSource> {
    if (urls.length === 0) {
      throw new Error('No images given');
    }
    const first = await loadImage(urls[0]!);
    const source = new ImageSource(urls, {
      width: first.naturalWidth,
      height: first.naturalHeight,
    });
    source.images.set(1, Promise.resolve(first));
    return source;
  }

  get pageCount(): number {
    return this.urls.length;
  }

  pageSize(page: number): PageSize {
    return this.sizes[page - 1] ?? this.sizes[0]!;
  }

  private image(page: number): Promise<HTMLImageElement> {
    let promise = this.images.get(page);
    if (!promise) {
      promise = loadImage(this.urls[page - 1]!).then((image) => {
        this.sizes[page - 1] = { width: image.naturalWidth, height: image.naturalHeight };
        return image;
      });
      this.images.set(page, promise);
    }
    return promise;
  }

  async render(page: number, height: number, signal?: AbortSignal): Promise<PageImage> {
    const image = await this.image(page);
    signal?.throwIfAborted();
    if (height >= image.naturalHeight) {
      return image;
    }
    // downscale once so that thumbnails do not keep the full images alive in the GPU
    const canvas = document.createElement('canvas');
    canvas.height = Math.max(1, Math.round(height));
    canvas.width = Math.max(1, Math.round((image.naturalWidth / image.naturalHeight) * height));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async outline(): Promise<OutlineItem[]> {
    return [];
  }

  async links(): Promise<PageLink[]> {
    return [];
  }

  async textRuns(): Promise<TextRun[]> {
    return [];
  }

  destroy(): void {
    this.images.clear();
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // no crossOrigin: drawing a cross-origin image into a canvas is allowed, only reading it back is not
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image could not be loaded: ${url}`));
    image.src = url;
  });
}
