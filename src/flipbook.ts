import { PageCache } from './core/page-cache';
import { spreadIndexForPage, visiblePages } from './core/spreads';
import { format, type Labels, resolveLabels } from './i18n';
import { resolveOptions } from './options';
import { ImageSource } from './source/images';
import { PdfSource } from './source/pdf';
import type { PageSource } from './source/types';
import type {
  ControlName,
  FlipEvent,
  OutlineItem,
  PageMode,
  PdflipInit,
  PdflipOptions,
} from './types';
import { type IconName, icon } from './ui/icons';
import { type SearchHit, searchDocument } from './ui/search';
import { el, uniqueId } from './util/dom';
import { isBookHash, parseHash } from './util/hash';
import { FlipSound } from './util/sound';
import { BookView } from './view/book-view';
import type { PageView } from './view/page-view';

type Panel = 'thumbnails' | 'outline' | 'search';

export interface PdflipEventMap {
  ready: Flipbook;
  flip: FlipEvent;
  zoom: number;
  error: Error;
}

const instances = new WeakMap<HTMLElement, Flipbook>();

/**
 * A flip book in a container element.
 *
 * ```js
 * const book = new Pdflip.Flipbook(document.querySelector('#book'), { source: 'brochure.pdf' });
 * book.on('flip', ({ page }) => console.log(page));
 * ```
 */
export class Flipbook {
  readonly options: PdflipOptions;
  readonly labels: Labels;
  readonly id: string;
  readonly root: HTMLElement;
  source: PageSource | undefined;
  private cache: PageCache | undefined;
  private view: BookView | undefined;
  private readonly main: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly toolbar: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly loader: HTMLDivElement;
  private readonly buttons = new Map<ControlName, HTMLButtonElement>();
  private pageInput: HTMLInputElement | undefined;
  private pageTotal: HTMLSpanElement | undefined;
  private ratio = Math.SQRT1_2;
  private forcedMode: PageMode;
  private soundEnabled: boolean;
  private readonly sound: FlipSound;
  private autoplayTimer: ReturnType<typeof setInterval> | undefined;
  private openPanelName: Panel | undefined;
  private outlineItems: OutlineItem[] | undefined;
  private thumbnailObserver: IntersectionObserver | undefined;
  private search:
    | { query: string; hits: SearchHit[]; active: number; controller: AbortController }
    | undefined;
  private readonly resizeObserver: ResizeObserver;
  private readonly listeners = new Map<keyof PdflipEventMap, Set<(value: never) => void>>();
  private readonly cleanup: (() => void)[] = [];
  private destroyed = false;
  /** Resolves when the document is loaded and the first spread is shown. */
  readonly ready: Promise<Flipbook>;

  constructor(container: HTMLElement, init: PdflipInit) {
    instances.get(container)?.destroy();
    instances.set(container, this);
    this.options = resolveOptions(init);
    this.labels = resolveLabels(this.options.locale, this.options.labels);
    this.id = this.options.id ?? container.id ?? uniqueId('pdflip');
    if (!this.id) this.id = uniqueId('pdflip');
    this.forcedMode = this.options.pageMode;
    this.soundEnabled = this.options.sound;
    this.sound = new FlipSound(this.options.soundUrl);

    this.root = container;
    this.root.classList.add('pdflip');
    this.root.classList.toggle('is-rtl', this.options.direction === 'rtl');
    this.root.dataset.controls = this.options.controlsPosition;
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-roledescription', this.labels.book);
    if (!this.root.hasAttribute('aria-label'))
      this.root.setAttribute('aria-label', this.labels.book);
    if (!this.root.hasAttribute('tabindex')) this.root.tabIndex = 0;
    this.root.style.setProperty('--pdflip-background', this.options.background);

    this.panel = el('div', { class: 'pdflip-panel', hidden: true });
    this.loader = el(
      'div',
      { class: 'pdflip-loader', role: 'progressbar', 'aria-label': this.labels.loading },
      el('div', { class: 'pdflip-loader-bar' })
    );
    this.main = el('div', { class: 'pdflip-main' }, this.panel, this.loader);
    this.toolbar = el('div', {
      class: 'pdflip-toolbar',
      role: 'toolbar',
      'aria-label': this.labels.book,
    });
    this.status = el('div', { class: 'pdflip-status', role: 'status', 'aria-live': 'polite' });
    this.root.replaceChildren(this.main, this.toolbar, this.status);
    if (this.options.controlsPosition === 'hidden') this.toolbar.hidden = true;
    this.buildToolbar();

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.bindKeyboard();
    this.reserveSpace();
    this.ready = (this.options.lazy ? this.whenVisible() : Promise.resolve()).then(() =>
      this.load()
    );
  }

  static get(element: HTMLElement): Flipbook | undefined {
    return instances.get(element);
  }

  // ---------------------------------------------------------------- loading

  /** Keeps the page from jumping when the book appears (no layout shift). */
  private reserveSpace(): void {
    if (this.options.height !== 'auto') {
      const height = this.options.height;
      this.root.style.height = typeof height === 'number' ? `${height}px` : height;
      return;
    }
    const ratio = this.options.pageRatio ?? Math.SQRT1_2;
    const double =
      this.forcedMode === 'double' || (this.forcedMode === 'auto' && this.root.clientWidth >= 640);
    this.main.style.aspectRatio = String((double ? 2 : 1) * ratio);
    this.main.style.maxHeight = '90vh';
  }

  private whenVisible(): Promise<void> {
    if (typeof IntersectionObserver === 'undefined') return Promise.resolve();
    return new Promise((resolve) => {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            resolve();
          }
        },
        { rootMargin: '400px' }
      );
      observer.observe(this.root);
      this.cleanup.push(() => observer.disconnect());
    });
  }

  private async load(): Promise<Flipbook> {
    try {
      const { source } = this.options;
      this.source = Array.isArray(source)
        ? await ImageSource.open(source)
        : await PdfSource.open(
            source,
            this.options.pdfjs,
            this.options.rangeChunkSize,
            (ratio) => this.loader.style.setProperty('--pdflip-loaded', String(ratio)),
            this.options.password
          );
      if (this.destroyed) {
        this.source.destroy();
        return this;
      }
      const size = this.source.pageSize(1);
      this.ratio = this.options.pageRatio ?? size.width / size.height;
      this.cache = new PageCache(this.source);
      this.view = new BookView({
        source: this.source,
        cache: this.cache,
        flipStyle: this.options.flipStyle,
        rtl: this.options.direction === 'rtl',
        duration: this.options.duration,
        zoomMax: this.options.zoomMax,
        maxTextureSize: this.options.maxTextureSize,
        pixelRatio: this.options.pixelRatio ?? window.devicePixelRatio ?? 1,
        wheel: this.options.wheel,
        immersive: () => this.isFullscreen() || this.root.closest('dialog') !== null,
        pageLabel: (page) => format(this.labels.page, { page }),
        allowTurn: (from, to) => this.allowTurn(from, to),
        turnStarted: () => {
          if (this.soundEnabled) this.sound.play(this.options.duration);
        },
        turned: (index, previous) => this.turned(index, previous),
        zoomChanged: (zoom) => {
          this.root.classList.toggle('is-zoomed', zoom > 1.01);
          this.updateControls();
          this.emit('zoom', zoom);
        },
        decorate: (view) => this.decorate(view),
      });
      this.view.element.style.background = this.options.background;
      this.main.append(this.view.element);
      this.loader.remove();
      this.root.classList.add('is-ready');

      const startPage = this.pageFromHash() ?? this.options.startPage;
      this.resizeObserver.observe(this.root);
      this.layout();
      this.view.showSpread(
        spreadIndexForPage(startPage, this.source.pageCount, this.view.double),
        true
      );
      this.updateControls();
      if (this.options.openPanel !== 'none') this.togglePanel(this.options.openPanel);
      if (this.options.autoplay && this.options.autoplayStart) this.startAutoplay();
      this.options.onReady?.(this);
      this.emit('ready', this);
    } catch (error) {
      this.loader.remove();
      const reason = error instanceof Error ? error : new Error(String(error));
      const { message, hint } = describeError(reason, this.options.source, this.labels);
      const download = this.downloadUrl();
      this.main.append(
        el(
          'div',
          { class: 'pdflip-error', role: 'alert' },
          el('p', {}, message),
          download
            ? el(
                'p',
                {},
                el('a', { href: download, target: '_blank', rel: 'noopener' }, this.labels.download)
              )
            : null
        )
      );
      this.main.style.aspectRatio = '';
      this.root.classList.add('has-error');
      console.error(`[pdflip] ${hint}`, reason);
      this.emit('error', reason);
    }
    return this;
  }

  /** Sizes the book to the container and picks single or double pages. */
  private layout(): void {
    const view = this.view;
    if (!view || !this.source) return;
    const panelWidth =
      !this.panel.hidden && this.root.clientWidth > 720 ? this.panel.offsetWidth : 0;
    const width = this.root.clientWidth - panelWidth;
    if (this.options.height === 'auto' && !this.isFullscreen()) {
      const doubleWanted =
        this.forcedMode === 'double' || (this.forcedMode === 'auto' && width >= 640);
      const bookHeight = width / ((doubleWanted ? 2 : 1) * this.ratio);
      const max = window.innerHeight * 0.9;
      this.main.style.height = `${Math.round(Math.min(max, bookHeight + 32))}px`;
      this.main.style.aspectRatio = '';
      this.main.style.maxHeight = '';
    } else if (this.options.height !== 'auto' && !this.isFullscreen()) {
      const height = this.options.height;
      this.root.style.height = typeof height === 'number' ? `${height}px` : height;
      this.main.style.height = '';
    } else {
      this.main.style.height = '';
    }
    const padding = 16;
    const availableWidth = Math.max(100, view.element.clientWidth - padding * 2);
    const availableHeight = Math.max(100, view.element.clientHeight - padding * 2);
    const double =
      this.forcedMode === 'double' ||
      (this.forcedMode === 'auto' &&
        availableWidth / availableHeight > this.ratio * 1.25 &&
        availableWidth >= 480);
    view.layout(availableWidth, availableHeight, double && this.source.pageCount > 1, this.ratio);
    this.updateControls();
  }

  // ---------------------------------------------------------------- navigation

  get pageCount(): number {
    return this.source?.pageCount ?? 0;
  }

  /** 1-based page that is shown (the left one of a spread). */
  get page(): number {
    return this.view?.currentPage() ?? 1;
  }

  next(): void {
    this.view?.turnTo(this.view.index + 1);
  }

  prev(): void {
    this.view?.turnTo(this.view.index - 1);
  }

  first(): void {
    this.view?.turnTo(0);
  }

  last(): void {
    if (this.view) this.view.turnTo(this.view.spreads.length - 1);
  }

  goTo(page: number): void {
    const view = this.view;
    if (!view || !this.source) return;
    view.turnTo(spreadIndexForPage(page, this.source.pageCount, view.double));
  }

  private allowTurn(from: number, to: number): boolean {
    const view = this.view;
    if (!view || !this.options.beforeFlip) return true;
    const pages = visiblePages(view.spreads[to]);
    const event: FlipEvent = {
      page: pages[0] ?? 1,
      pages,
      previousPage: visiblePages(view.spreads[from])[0] ?? 1,
    };
    return this.options.beforeFlip(event) !== false;
  }

  private turned(index: number, previous: number): void {
    const view = this.view!;
    const pages = visiblePages(view.spreads[index]);
    const event: FlipEvent = {
      page: pages[0] ?? 1,
      pages,
      previousPage: visiblePages(view.spreads[previous])[0] ?? 1,
    };
    this.updateControls();
    this.updateHash();
    this.status.textContent = format(this.labels.pageOf, {
      page: pages.join('–'),
      total: this.pageCount,
    });
    this.options.onFlip?.(event);
    this.emit('flip', event);
    if (this.autoplayTimer && index >= view.spreads.length - 1) this.stopAutoplay();
  }

  // ---------------------------------------------------------------- page decoration

  private decorate(view: PageView): void {
    const source = this.source;
    const page = view.page;
    if (!source || page === null) return;
    if (this.options.links) {
      void source.links(page).then((links) => {
        if (view.page !== page) return;
        view.setLinks(
          links,
          this.options.linkTarget,
          (target) => this.goTo(target),
          (target) => format(this.labels.page, { page: target })
        );
      });
    }
    if (this.options.textLayer && source.renderTextLayer && view.textPage !== page) {
      view.textPage = page;
      const size = source.pageSize(page);
      view.textLayer.style.setProperty(
        '--total-scale-factor',
        String((this.view?.height ?? size.height) / size.height)
      );
      void source
        .renderTextLayer(page, view.textLayer)
        .then(() => view.refreshHighlights())
        .catch(() => undefined);
    } else if (this.view) {
      const size = source.pageSize(page);
      view.textLayer.style.setProperty(
        '--total-scale-factor',
        String(this.view.height / size.height)
      );
    }
    this.highlight(view);
  }

  private highlight(view: PageView): void {
    const search = this.search;
    if (!search || view.page === null) {
      view.setHighlights([], undefined);
      return;
    }
    const hits = search.hits.filter((hit) => hit.page === view.page);
    const active = search.hits[search.active];
    view.setHighlights(hits, active?.page === view.page ? active : undefined);
  }

  // ---------------------------------------------------------------- toolbar

  private buildToolbar(): void {
    const groups: ControlName[][] = [[], [], []];
    for (const control of this.options.controls) {
      if (['first', 'prev', 'pageNumber', 'next', 'last'].includes(control))
        groups[1]!.push(control);
      else if (['thumbnails', 'outline', 'search'].includes(control)) groups[0]!.push(control);
      else groups[2]!.push(control);
    }
    for (const group of groups) {
      const container = el('div', { class: 'pdflip-toolbar-group' });
      for (const control of group) {
        container.append(this.createControl(control));
      }
      this.toolbar.append(container);
    }
  }

  private createControl(control: ControlName): HTMLElement {
    if (control === 'pageNumber') {
      this.pageInput = el('input', {
        class: 'pdflip-page-input',
        type: 'text',
        inputmode: 'numeric',
        'aria-label': this.labels.goToPage,
        size: 4,
      });
      this.pageTotal = el('span', { class: 'pdflip-page-total' });
      this.pageInput.addEventListener('change', () => {
        const page = Number.parseInt(this.pageInput!.value, 10);
        if (Number.isFinite(page)) this.goTo(page);
        this.updateControls();
      });
      this.pageInput.addEventListener('focus', () => this.pageInput!.select());
      return el('label', { class: 'pdflip-page-number' }, this.pageInput, this.pageTotal);
    }
    const definitions: Record<
      Exclude<ControlName, 'pageNumber'>,
      [IconName, string, () => void]
    > = {
      first: ['first', this.labels.first, () => this.first()],
      prev: ['prev', this.labels.prev, () => this.prev()],
      next: ['next', this.labels.next, () => this.next()],
      last: ['last', this.labels.last, () => this.last()],
      zoomIn: ['zoomIn', this.labels.zoomIn, () => this.zoomBy(1.5)],
      zoomOut: ['zoomOut', this.labels.zoomOut, () => this.zoomBy(1 / 1.5)],
      thumbnails: ['thumbnails', this.labels.thumbnails, () => this.togglePanel('thumbnails')],
      outline: ['outline', this.labels.outline, () => this.togglePanel('outline')],
      search: ['search', this.labels.search, () => this.togglePanel('search')],
      autoplay: [
        'play',
        this.labels.autoplayStart,
        () => (this.autoplayTimer ? this.stopAutoplay() : this.startAutoplay()),
      ],
      pageMode: ['singlePage', this.labels.singlePage, () => this.togglePageMode()],
      sound: ['soundOn', this.labels.soundOff, () => this.toggleSound()],
      share: ['share', this.labels.share, () => void this.share()],
      download: ['download', this.labels.download, () => this.download()],
      fullscreen: ['fullscreen', this.labels.fullscreen, () => void this.toggleFullscreen()],
      close: [
        'close',
        this.labels.close,
        () => this.root.dispatchEvent(new CustomEvent('pdflip:close', { bubbles: true })),
      ],
    };
    const [iconName, label, action] = definitions[control];
    const button = el(
      'button',
      {
        type: 'button',
        class: `pdflip-button pdflip-button-${control}`,
        'aria-label': label,
        title: label,
      },
      icon(iconName)
    );
    button.addEventListener('click', action);
    this.buttons.set(control, button);
    return button;
  }

  private setButton(
    control: ControlName,
    iconName: IconName,
    label: string,
    pressed?: boolean
  ): void {
    const button = this.buttons.get(control);
    if (!button) return;
    button.replaceChildren(icon(iconName));
    button.setAttribute('aria-label', label);
    button.title = label;
    if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
  }

  private updateControls(): void {
    const view = this.view;
    if (!view) return;
    const atStart = view.index <= 0;
    const atEnd = view.index >= view.spreads.length - 1;
    for (const [control, disabled] of [
      ['first', atStart],
      ['prev', atStart],
      ['next', atEnd],
      ['last', atEnd],
      ['zoomIn', view.zoom >= this.options.zoomMax - 0.01],
      ['zoomOut', view.zoom <= 1.01],
    ] as const) {
      const button = this.buttons.get(control);
      if (button) button.disabled = disabled;
    }
    if (this.pageInput && this.pageTotal) {
      const pages = visiblePages(view.spreads[view.index]);
      if (document.activeElement !== this.pageInput) this.pageInput.value = pages.join('–');
      this.pageTotal.textContent = `/ ${this.pageCount}`;
    }
    this.setButton(
      'pageMode',
      view.double ? 'singlePage' : 'doublePage',
      view.double ? this.labels.singlePage : this.labels.doublePage
    );
    this.setButton(
      'sound',
      this.soundEnabled ? 'soundOn' : 'soundOff',
      this.soundEnabled ? this.labels.soundOff : this.labels.soundOn,
      this.soundEnabled
    );
    this.setButton(
      'autoplay',
      this.autoplayTimer ? 'pause' : 'play',
      this.autoplayTimer ? this.labels.autoplayStop : this.labels.autoplayStart,
      Boolean(this.autoplayTimer)
    );
    const fullscreen = this.isFullscreen();
    this.setButton(
      'fullscreen',
      fullscreen ? 'exitFullscreen' : 'fullscreen',
      fullscreen ? this.labels.exitFullscreen : this.labels.fullscreen,
      fullscreen
    );
    for (const panel of ['thumbnails', 'outline', 'search'] as const) {
      this.buttons.get(panel)?.setAttribute('aria-pressed', String(this.openPanelName === panel));
    }
    this.markCurrentThumbnail();
  }

  // ---------------------------------------------------------------- zoom, mode, sound, autoplay

  zoomBy(factor: number): void {
    const view = this.view;
    if (!view) return;
    view.zoomAt(view.zoom * factor);
  }

  setPageMode(mode: PageMode): void {
    this.forcedMode = mode;
    this.layout();
  }

  private togglePageMode(): void {
    this.setPageMode(this.view?.double ? 'single' : 'double');
  }

  toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    this.updateControls();
  }

  startAutoplay(): void {
    const view = this.view;
    if (!view) return;
    this.stopAutoplay();
    if (view.index >= view.spreads.length - 1) this.first();
    this.autoplayTimer = setInterval(
      () => {
        if (document.hidden) return;
        this.next();
      },
      Math.max(1000, this.options.autoplayInterval)
    );
    this.updateControls();
  }

  stopAutoplay(): void {
    clearInterval(this.autoplayTimer);
    this.autoplayTimer = undefined;
    this.updateControls();
  }

  // ---------------------------------------------------------------- fullscreen

  isFullscreen(): boolean {
    return (
      document.fullscreenElement === this.root ||
      this.root.classList.contains('is-pseudo-fullscreen')
    );
  }

  async toggleFullscreen(): Promise<void> {
    if (this.isFullscreen()) {
      if (document.fullscreenElement === this.root) await document.exitFullscreen();
      this.root.classList.remove('is-pseudo-fullscreen');
    } else if (this.root.requestFullscreen && document.fullscreenEnabled) {
      await this.root.requestFullscreen();
    } else {
      // iOS Safari has no element fullscreen; fill the window instead
      this.root.classList.add('is-pseudo-fullscreen');
    }
    this.root.classList.toggle('is-fullscreen', this.isFullscreen());
    this.updateControls();
    this.layout();
  }

  // ---------------------------------------------------------------- share & download

  private shareUrl(): string {
    const url = new URL(window.location.href);
    url.hash = `pdflip-${this.id}/${this.page}`;
    return url.href;
  }

  async share(): Promise<void> {
    const url = this.shareUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
      }
    }
    this.togglePopover('share', [
      [
        'copy',
        this.labels.copyLink,
        async () => {
          await navigator.clipboard?.writeText(url);
          this.announce(this.labels.linkCopied);
        },
      ],
      [
        'mail',
        this.labels.shareMail,
        () => {
          window.location.href = `mailto:?subject=${encodeURIComponent(this.labels.mailSubject)}&body=${encodeURIComponent(url)}`;
        },
      ],
    ]);
  }

  private togglePopover(
    control: ControlName,
    items: [IconName, string, () => void | Promise<void>][]
  ): void {
    const button = this.buttons.get(control);
    const existing = this.root.querySelector('.pdflip-popover');
    existing?.remove();
    if (!button || existing) return;
    const menu = el('div', { class: 'pdflip-popover', role: 'menu' });
    for (const [iconName, label, action] of items) {
      const item = el(
        'button',
        { type: 'button', class: 'pdflip-popover-item', role: 'menuitem' },
        icon(iconName),
        label
      );
      item.addEventListener('click', () => {
        menu.remove();
        void action();
      });
      menu.append(item);
    }
    button.after(menu);
    (menu.firstElementChild as HTMLElement | null)?.focus();
    const close = (event: Event) => {
      if (!menu.contains(event.target as Node) && event.target !== button) {
        menu.remove();
        document.removeEventListener('pointerdown', close);
      }
    };
    document.addEventListener('pointerdown', close);
  }

  private downloadUrl(): string | undefined {
    const { download, source } = this.options;
    if (typeof download === 'string') return download;
    return typeof source === 'string' || source instanceof URL ? String(source) : undefined;
  }

  download(): void {
    const url = this.downloadUrl();
    if (!url) return;
    const link = el('a', { href: url, download: '' });
    document.body.append(link);
    link.click();
    link.remove();
  }

  // ---------------------------------------------------------------- panels

  togglePanel(name: Panel): void {
    if (this.openPanelName === name) {
      this.closePanel();
      return;
    }
    this.openPanelName = name;
    this.panel.hidden = false;
    this.panel.dataset.panel = name;
    this.thumbnailObserver?.disconnect();
    if (name === 'thumbnails') this.renderThumbnails();
    if (name === 'outline') void this.renderOutline();
    if (name === 'search') this.renderSearch();
    this.updateControls();
    this.layout();
  }

  closePanel(): void {
    this.openPanelName = undefined;
    this.panel.hidden = true;
    this.thumbnailObserver?.disconnect();
    this.panel.replaceChildren();
    this.updateControls();
    this.layout();
  }

  private panelHeader(title: string): HTMLElement {
    const close = el(
      'button',
      {
        type: 'button',
        class: 'pdflip-button pdflip-panel-close',
        'aria-label': this.labels.close,
        title: this.labels.close,
      },
      icon('close')
    );
    close.addEventListener('click', () => {
      this.closePanel();
      this.root.focus();
    });
    return el(
      'div',
      { class: 'pdflip-panel-header' },
      el('h2', { class: 'pdflip-panel-title' }, title),
      close
    );
  }

  private renderThumbnails(): void {
    const source = this.source;
    if (!source) return;
    const list = el('ol', { class: 'pdflip-thumbnails' });
    const ratio = this.ratio;
    const pixelRatio = window.devicePixelRatio || 1;
    this.thumbnailObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const canvas = entry.target as HTMLCanvasElement;
          this.thumbnailObserver?.unobserve(canvas);
          const page = Number(canvas.dataset.page);
          void source.render(page, 200 * pixelRatio).then((image) => {
            canvas.width = image.width;
            canvas.height = image.height;
            canvas.getContext('2d')?.drawImage(image, 0, 0);
            canvas.parentElement?.classList.remove('is-loading');
          });
        }
      },
      { root: this.panel, rootMargin: '200px' }
    );
    for (let page = 1; page <= source.pageCount; page++) {
      const canvas = el('canvas', { 'data-page': page, 'aria-hidden': 'true' });
      canvas.style.aspectRatio = String(ratio);
      const button = el(
        'button',
        { type: 'button', class: 'pdflip-thumbnail is-loading', 'data-page': page },
        canvas,
        el('span', {}, String(page))
      );
      button.setAttribute('aria-label', format(this.labels.page, { page }));
      button.addEventListener('click', () => this.goTo(page));
      list.append(el('li', {}, button));
      this.thumbnailObserver.observe(canvas);
    }
    this.panel.replaceChildren(this.panelHeader(this.labels.thumbnails), list);
    this.markCurrentThumbnail();
  }

  private markCurrentThumbnail(): void {
    if (this.openPanelName !== 'thumbnails' || !this.view) return;
    const pages = visiblePages(this.view.spreads[this.view.index]);
    for (const button of this.panel.querySelectorAll<HTMLButtonElement>('.pdflip-thumbnail')) {
      const current = pages.includes(Number(button.dataset.page));
      if (current) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
      if (current && pages[0] === Number(button.dataset.page))
        button.scrollIntoView({ block: 'nearest' });
    }
  }

  private async renderOutline(): Promise<void> {
    this.outlineItems ??= this.options.outline ?? (await this.source?.outline()) ?? [];
    if (this.openPanelName !== 'outline') return;
    const build = (items: OutlineItem[]): HTMLElement =>
      el(
        'ul',
        { class: 'pdflip-outline-list' },
        ...items.map((item) => {
          const target = item.url
            ? el(
                'a',
                { href: item.url, target: this.options.linkTarget, rel: 'noopener' },
                item.title
              )
            : el('button', { type: 'button', disabled: item.page === null }, item.title);
          if (!item.url && item.page !== null) {
            const page = item.page;
            target.addEventListener('click', () => this.goTo(page));
          }
          return el('li', {}, target, item.items.length > 0 ? build(item.items) : null);
        })
      );
    const content =
      this.outlineItems.length > 0
        ? build(this.outlineItems)
        : el('p', { class: 'pdflip-panel-empty' }, this.labels.noOutline);
    this.panel.replaceChildren(
      this.panelHeader(this.labels.outline),
      el('nav', { class: 'pdflip-outline' }, content)
    );
  }

  private renderSearch(): void {
    const input = el('input', {
      type: 'search',
      class: 'pdflip-search-input',
      placeholder: this.labels.searchPlaceholder,
      'aria-label': this.labels.search,
      value: this.search?.query ?? '',
    });
    const summary = el('p', { class: 'pdflip-search-summary', role: 'status' });
    const results = el('ol', { class: 'pdflip-search-results' });
    const form = el('form', { class: 'pdflip-search', role: 'search' }, input);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => this.runSearch(input.value, summary, results);
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, 250);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.search && this.search.query === input.value && this.search.hits.length > 0) {
        this.showHit((this.search.active + 1) % this.search.hits.length);
      } else {
        run();
      }
    });
    this.panel.replaceChildren(this.panelHeader(this.labels.search), form, summary, results);
    input.focus();
    if (this.search) this.runSearch(this.search.query, summary, results);
  }

  private runSearch(query: string, summary: HTMLElement, results: HTMLElement): void {
    this.search?.controller.abort();
    results.replaceChildren();
    summary.textContent = '';
    if (!this.source || query.trim().length < 2) {
      this.search = undefined;
      this.refreshHighlights();
      return;
    }
    const controller = new AbortController();
    const search = { query, hits: [] as SearchHit[], active: 0, controller };
    this.search = search;
    void searchDocument(this.source, query, controller.signal, (hits) => {
      for (const hit of hits) {
        const index = search.hits.length;
        search.hits.push(hit);
        const snippet = el(
          'span',
          { class: 'pdflip-search-snippet' },
          hit.snippet.slice(0, hit.start),
          el('mark', {}, hit.snippet.slice(hit.start, hit.start + hit.length)),
          hit.snippet.slice(hit.start + hit.length)
        );
        const button = el(
          'button',
          { type: 'button', class: 'pdflip-search-hit' },
          el('span', { class: 'pdflip-search-page' }, format(this.labels.page, { page: hit.page })),
          snippet
        );
        button.addEventListener('click', () => this.showHit(index));
        results.append(el('li', {}, button));
      }
      summary.textContent =
        search.hits.length > 0
          ? format(this.labels.searchResults, { count: search.hits.length })
          : this.labels.searchNoResults;
      if (hits.length > 0 && search.hits.length === hits.length) this.refreshHighlights();
    });
  }

  private showHit(index: number): void {
    const search = this.search;
    const hit = search?.hits[index];
    if (!search || !hit) return;
    search.active = index;
    this.panel.querySelectorAll('.pdflip-search-hit').forEach((button, i) => {
      button.classList.toggle('is-active', i === index);
    });
    if (visiblePages(this.view?.spreads[this.view.index]).includes(hit.page)) {
      this.refreshHighlights();
    } else {
      this.goTo(hit.page);
    }
  }

  private refreshHighlights(): void {
    for (const view of this.view?.visibleViews() ?? []) this.highlight(view);
  }

  // ---------------------------------------------------------------- keyboard, hash, events

  private bindKeyboard(): void {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest('input, textarea, select, [contenteditable]') ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const rtl = this.options.direction === 'rtl';
      const keys: Record<string, () => void> = {
        ArrowRight: () => (rtl ? this.prev() : this.next()),
        ArrowLeft: () => (rtl ? this.next() : this.prev()),
        PageDown: () => this.next(),
        PageUp: () => this.prev(),
        Home: () => this.first(),
        End: () => this.last(),
        '+': () => this.zoomBy(1.5),
        '=': () => this.zoomBy(1.5),
        '-': () => this.zoomBy(1 / 1.5),
        '0': () => this.view?.resetZoom(),
      };
      const action = keys[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    this.root.addEventListener('keydown', onKey);
    const onFullscreen = () => {
      this.root.classList.toggle('is-fullscreen', this.isFullscreen());
      this.updateControls();
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    // any interaction with the book itself stops autoplay, the toolbar does not
    this.root.addEventListener('pointerdown', (event) => {
      if (this.autoplayTimer && !(event.target as HTMLElement).closest('.pdflip-toolbar'))
        this.stopAutoplay();
    });
    this.cleanup.push(() => document.removeEventListener('fullscreenchange', onFullscreen));
  }

  private pageFromHash(): number | undefined {
    if (!this.options.deepLink) return undefined;
    const target = parseHash();
    if (!target || (target.id !== this.id && target.id !== this.root.dataset.pdflipLegacyId))
      return undefined;
    return target.page;
  }

  private updateHash(): void {
    if (!this.options.deepLink) return;
    const hash = `#pdflip-${encodeURIComponent(this.id)}/${this.page}`;
    if (window.location.hash !== hash && (window.location.hash === '' || isBookHash())) {
      history.replaceState(history.state, '', hash);
    }
  }

  private announce(message: string): void {
    this.status.textContent = message;
  }

  on<K extends keyof PdflipEventMap>(
    event: K,
    listener: (value: PdflipEventMap[K]) => void
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (value: never) => void);
    return () => set.delete(listener as (value: never) => void);
  }

  private emit<K extends keyof PdflipEventMap>(event: K, value: PdflipEventMap[K]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as (value: PdflipEventMap[K]) => void)(value);
    }
    this.root.dispatchEvent(new CustomEvent(`pdflip:${event}`, { detail: value }));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopAutoplay();
    this.search?.controller.abort();
    this.resizeObserver.disconnect();
    this.thumbnailObserver?.disconnect();
    for (const fn of this.cleanup) fn();
    this.view?.destroy();
    this.cache?.clear();
    this.source?.destroy();
    this.sound.destroy();
    this.root.replaceChildren();
    this.root.classList.remove(
      'pdflip',
      'is-ready',
      'is-rtl',
      'is-zoomed',
      'is-fullscreen',
      'has-error'
    );
    instances.delete(this.root);
  }
}

/**
 * Turns pdf.js and network errors into a message for the reader and a hint for the
 * developer — the most common support case of flip books is a PDF that cannot be loaded.
 */
function describeError(
  error: Error,
  source: unknown,
  labels: Labels
): { message: string; hint: string } {
  const name = error.name;
  const status = (error as Error & { status?: number }).status;
  if (name === 'PasswordException') {
    return {
      message: labels.errorPassword,
      hint: 'The PDF is encrypted; pass the `password` option.',
    };
  }
  if (name === 'InvalidPDFException') {
    return { message: labels.errorInvalid, hint: 'The file is not a valid PDF.' };
  }
  if (name === 'MissingPDFException' || status === 404) {
    return { message: labels.errorNotFound, hint: `The PDF was not found: ${String(source)}` };
  }
  if (typeof source === 'string' && /^https?:/i.test(source)) {
    const url = new URL(source, window.location.href);
    if (
      url.origin !== window.location.origin &&
      (name === 'UnexpectedResponseException' ||
        error instanceof TypeError ||
        /fetch|network/i.test(error.message))
    ) {
      return {
        message: labels.error,
        hint: `The PDF is on another origin (${url.origin}) and the server does not allow cross-origin requests. Serve it from your own domain or send an Access-Control-Allow-Origin header.`,
      };
    }
  }
  if (/offset|range/i.test(error.message)) {
    return {
      message: labels.error,
      hint: 'The server or a cache breaks byte range requests; set `pdfjs.disableRange: true` or exclude PDFs from compression.',
    };
  }
  return { message: labels.error, hint: error.message };
}
