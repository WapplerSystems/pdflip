import {
  autoFlipPointer,
  type Corner,
  computeFold,
  constrainPointer,
  easeInOut,
  type Fold,
  matrixToCss,
  type Point,
  polygonToCss,
} from '../core/fold';
import type { PageCache } from '../core/page-cache';
import { buildSpreads, type Spread, spreadIndexForPage } from '../core/spreads';
import type { PageSource } from '../source/types';
import type { FlipStyle } from '../types';
import { el, prefersReducedMotion } from '../util/dom';
import { PageView, paintImage } from './page-view';

export interface BookViewHost {
  readonly source: PageSource;
  readonly cache: PageCache;
  flipStyle: FlipStyle;
  rtl: boolean;
  duration: number;
  zoomMax: number;
  maxTextureSize: number;
  pixelRatio: number;
  wheel: 'zoom' | 'flip' | 'none';
  /** Fullscreen or lightbox: the wheel may zoom without a modifier key. */
  immersive(): boolean;
  pageLabel(page: number): string;
  /** Called before a turn starts; return false to prevent it. */
  allowTurn(from: number, to: number): boolean;
  turnStarted(): void;
  turned(index: number, previous: number): void;
  zoomChanged(zoom: number): void;
  /** Adds links, text and highlights to a page that has come to rest. */
  decorate(view: PageView): void;
}

interface Turn {
  from: number;
  to: number;
  corner: Corner;
  hard: boolean;
  pointer: Point;
  /** Pages of the turning sheet and of the slots while it is in motion. */
  front: number | null;
  back: number | null;
  under: number | null;
  left: number | null;
}

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  side: 'left' | 'right';
  turn?: Turn;
  pan?: { x: number; y: number };
  lastX: number;
  lastTime: number;
  velocity: number;
}

/** One rendered face of the turning sheet. */
class Face {
  readonly element: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  page: number | null = null;

  constructor(className: string) {
    this.canvas = el('canvas', { class: 'pdflip-page-canvas', 'aria-hidden': 'true' });
    this.element = el(
      'div',
      { class: `pdflip-face ${className}` },
      el('div', { class: 'pdflip-page-content' }, this.canvas)
    );
  }
}

const HOVER_ZONE = 80;
const DRAG_THRESHOLD = 6;

/**
 * Renders the book: the two page slots of the current spread, the sheet that is being
 * turned, zoom and pan. It knows nothing about toolbars or panels.
 */
export class BookView {
  readonly element: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly book: HTMLDivElement;
  private readonly slots: [PageView, PageView];
  private readonly turnLayer: HTMLDivElement;
  private readonly flat: Face;
  private readonly back: Face;
  private readonly backWrap: HTMLDivElement;
  private readonly hardLeaf: HTMLDivElement;
  private readonly hardFront: Face;
  private readonly hardBack: Face;
  private readonly shadeUnder: HTMLDivElement;
  private readonly shadeUnderGradient: HTMLDivElement;
  private readonly shadeFlat: HTMLDivElement;
  private readonly shadeFlatGradient: HTMLDivElement;
  private readonly shadeBackGradient: HTMLDivElement;

  spreads: Spread[] = [];
  index = 0;
  double = true;
  /** Page size in CSS pixels at zoom 1. */
  width = 0;
  height = 0;
  zoom = 1;
  private pan = { x: 0, y: 0 };
  private turn: Turn | undefined;
  private animation: { frame: number; finish: () => void } | undefined;
  private drag: Drag | undefined;
  private hovering = false;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: { distance: number; zoom: number } | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly host: BookViewHost) {
    this.slots = [new PageView('pdflip-slot-left'), new PageView('pdflip-slot-right')];

    this.flat = new Face('pdflip-turn-flat');
    this.back = new Face('pdflip-turn-back');
    this.shadeBackGradient = el('div', { class: 'pdflip-shade-gradient pdflip-shade-back' });
    this.back.element.append(this.shadeBackGradient);
    this.backWrap = el('div', { class: 'pdflip-turn-back-wrap' }, this.back.element);
    this.shadeFlatGradient = el('div', { class: 'pdflip-shade-gradient pdflip-shade-crease' });
    this.shadeFlat = el('div', { class: 'pdflip-shade' }, this.shadeFlatGradient);
    this.shadeUnderGradient = el('div', { class: 'pdflip-shade-gradient pdflip-shade-cast' });
    this.shadeUnder = el('div', { class: 'pdflip-shade' }, this.shadeUnderGradient);

    this.hardFront = new Face('pdflip-hard-front');
    this.hardBack = new Face('pdflip-hard-back');
    this.hardLeaf = el(
      'div',
      { class: 'pdflip-hard-leaf' },
      this.hardFront.element,
      this.hardBack.element
    );

    this.turnLayer = el(
      'div',
      { class: 'pdflip-turn', hidden: true },
      this.shadeUnder,
      this.flat.element,
      this.shadeFlat,
      this.backWrap,
      this.hardLeaf
    );
    this.book = el(
      'div',
      { class: 'pdflip-book' },
      this.slots[0].element,
      this.slots[1].element,
      this.turnLayer
    );
    this.stage = el('div', { class: 'pdflip-stage' }, this.book);
    this.element = el('div', { class: 'pdflip-viewport' }, this.stage);

    this.element.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.element.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.element.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.element.addEventListener('pointercancel', (event) => this.onPointerUp(event, true));
    this.element.addEventListener('pointerleave', () => this.onPointerLeave());
    this.element.addEventListener('dblclick', (event) => this.onDoubleClick(event));
    this.element.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
  }

  private lastWheelTurn = 0;

  /**
   * The wheel never hijacks page scrolling in an embedded book: it zooms with Ctrl/⌘ (and
   * trackpad pinch, which browsers report as Ctrl+wheel), pans while zoomed and only zooms
   * or turns without a modifier in fullscreen and in the lightbox.
   */
  private onWheel(event: WheelEvent): void {
    const mode = this.host.wheel;
    if (mode === 'none' && !event.ctrlKey) return;
    if (event.ctrlKey || event.metaKey || (mode === 'zoom' && this.host.immersive())) {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.002));
      this.zoomAt(this.zoom * factor, event.clientX, event.clientY);
      if (this.zoom < 1.02) this.resetZoom();
      return;
    }
    if (this.zoom > 1.01) {
      event.preventDefault();
      this.pan = { x: this.pan.x - event.deltaX, y: this.pan.y - event.deltaY };
      this.clampPan();
      this.applyStageTransform();
      return;
    }
    if (mode === 'flip') {
      event.preventDefault();
      const now = performance.now();
      if (now - this.lastWheelTurn < 450 || Math.abs(event.deltaY) < 4) return;
      this.lastWheelTurn = now;
      this.turnTo(this.index + (event.deltaY > 0 ? 1 : -1));
    }
  }

  // ---------------------------------------------------------------- layout

  /** Fits the book into the viewport. */
  layout(availableWidth: number, availableHeight: number, double: boolean, ratio: number): void {
    const modeChanged = double !== this.double || this.spreads.length === 0;
    const currentPage = this.currentPage();
    this.double = double;
    if (modeChanged) {
      this.spreads = buildSpreads(this.host.source.pageCount, double);
      this.index = spreadIndexForPage(currentPage, this.host.source.pageCount, double);
    }
    const columns = double ? 2 : 1;
    let height = Math.min(availableHeight, availableWidth / (columns * ratio));
    height = Math.max(50, Math.floor(height));
    this.height = height;
    this.width = Math.floor(height * ratio);

    this.book.style.width = `${this.width * columns}px`;
    this.book.style.height = `${this.height}px`;
    this.book.classList.toggle('is-double', double);
    this.book.classList.toggle('is-single', !double);
    this.book.style.setProperty('--pdflip-page-width', `${this.width}px`);
    this.book.style.setProperty('--pdflip-page-height', `${this.height}px`);
    this.turnLayer.style.left = double ? `${this.width}px` : '0px';
    this.book.classList.toggle('is-rtl', this.host.rtl);
    this.clampPan();
    this.applyStageTransform();
    this.cancelTurn();
    this.showSpread(this.index, true);
  }

  private spineX(): number {
    return this.double ? this.width : 0;
  }

  currentPage(): number {
    const pages = this.spreads[this.index]?.pages.filter((page): page is number => page !== null);
    return pages?.[0] ?? 1;
  }

  get isTurning(): boolean {
    return this.turn !== undefined;
  }

  // ---------------------------------------------------------------- spreads

  /** Shows a spread immediately, without animation. */
  showSpread(index: number, force = false): void {
    const clamped = Math.min(Math.max(0, index), Math.max(0, this.spreads.length - 1));
    if (clamped === this.index && !force) return;
    this.index = clamped;
    const pages = this.spreads[clamped]?.pages ?? [];
    if (this.double) {
      this.setSlot(0, pages[0] ?? null);
      this.setSlot(1, pages[1] ?? null);
    } else {
      this.setSlot(0, null);
      this.setSlot(1, pages[0] ?? null);
    }
    this.book.classList.toggle('is-front-cover', this.double && pages[0] === null);
    this.book.classList.toggle('is-back-cover', this.double && pages[1] === null);
    for (const slot of this.slots) {
      if (slot.page !== null) this.host.decorate(slot);
    }
    this.preload();
  }

  private setSlot(slot: 0 | 1, page: number | null): void {
    const view = this.slots[slot];
    if (view.setPage(page, page === null ? '' : this.host.pageLabel(page))) {
      this.paint(view, page);
    } else if (page !== null && view.paintedHeight < this.renderHeight() * 0.9) {
      this.paint(view, page);
    }
  }

  private paint(view: PageView, page: number | null): void {
    if (page === null) return;
    const height = this.renderHeight();
    this.host.cache.get(page, height).then(
      (image) => {
        if (view.page === page) view.paint(image, height);
      },
      () => undefined
    );
  }

  private paintFace(face: Face, page: number | null): void {
    face.element.classList.toggle('is-empty', page === null);
    if (face.page === page) return;
    face.page = page;
    const context = face.canvas.getContext('2d');
    context?.clearRect(0, 0, face.canvas.width, face.canvas.height);
    if (page === null) return;
    this.host.cache.get(page, this.renderHeight()).then(
      (image) => {
        if (face.page === page) paintImage(face.canvas, image);
      },
      () => undefined
    );
  }

  private renderHeight(): number {
    return Math.min(this.host.maxTextureSize, this.height * this.zoom * this.host.pixelRatio);
  }

  /** Renders the neighbouring spreads in the background so that turning is instant. */
  private preload(): void {
    const height = this.renderHeight();
    for (const offset of [1, -1, 2]) {
      for (const page of this.spreads[this.index + offset]?.pages ?? []) {
        if (page !== null) void this.host.cache.get(page, height).catch(() => undefined);
      }
    }
  }

  // ---------------------------------------------------------------- turning

  canTurn(to: number): boolean {
    return to >= 0 && to < this.spreads.length && to !== this.index;
  }

  /** Turns to a spread with an animation (one sheet, also when skipping pages). */
  turnTo(index: number, corner: Corner = 'bottom'): void {
    const target = Math.min(Math.max(0, index), this.spreads.length - 1);
    this.finishAnimation();
    if (!this.canTurn(target) || this.zoom > 1.01) {
      if (this.zoom > 1.01) this.resetZoom();
      if (target !== this.index && this.host.allowTurn(this.index, target)) {
        this.jump(target);
      }
      return;
    }
    if (!this.host.allowTurn(this.index, target)) return;
    const turn = this.createTurn(target, corner);
    if (!turn) return;
    const forward = target > this.index;
    const w = this.width;
    const start = forward
      ? { x: w, y: corner === 'top' ? 0 : this.height }
      : autoFlipPointer(w, this.height, corner, 1);
    turn.pointer = start;
    this.beginTurn(turn);
    const duration = prefersReducedMotion() ? 0 : this.host.duration;
    this.animate(
      duration,
      (t) => {
        const progress = forward ? t : 1 - t;
        return autoFlipPointer(w, this.height, corner, easeInOut(progress));
      },
      () => this.completeTurn(true)
    );
  }

  private jump(target: number): void {
    const previous = this.index;
    this.showSpread(target);
    this.host.turned(this.index, previous);
  }

  private createTurn(to: number, corner: Corner): Turn | undefined {
    const from = this.index;
    const forward = to > from;
    const a = this.spreads[forward ? from : to]?.pages ?? [];
    const b = this.spreads[forward ? to : from]?.pages ?? [];
    // a turn from A to B is the same movement as the way back from B to A played in reverse
    const turn: Turn = this.double
      ? {
          from,
          to,
          corner,
          hard: false,
          pointer: { x: 0, y: 0 },
          front: a[1] ?? null,
          back: b[0] ?? null,
          under: b[1] ?? null,
          left: a[0] ?? null,
        }
      : {
          from,
          to,
          corner,
          hard: false,
          pointer: { x: 0, y: 0 },
          front: a[0] ?? null,
          back: null,
          under: b[0] ?? null,
          left: null,
        };
    turn.hard = this.isHardSheet(turn.front, turn.back);
    return turn;
  }

  private isHardSheet(front: number | null, back: number | null): boolean {
    const style = this.host.flipStyle;
    if (style === 'hard') return true;
    if (style === 'soft' || !this.double) return false;
    const last = this.host.source.pageCount;
    return (
      front === 1 ||
      back === 1 ||
      front === last ||
      back === last ||
      front === null ||
      back === null
    );
  }

  private beginTurn(turn: Turn): void {
    this.turn = turn;
    this.host.turnStarted();
    if (this.double) {
      this.setSlot(0, turn.left);
      this.setSlot(1, turn.under);
    } else {
      this.setSlot(1, turn.under);
    }
    if (!this.hovering) {
      // the closed book slides to the side while it opens (and back while it closes)
      const target = this.spreads[turn.to]?.pages ?? [];
      this.book.classList.toggle('is-front-cover', this.double && target[0] === null);
      this.book.classList.toggle('is-back-cover', this.double && target[1] === null);
    }
    this.turnLayer.hidden = false;
    this.turnLayer.classList.toggle('is-hard', turn.hard);
    this.turnLayer.classList.toggle('is-single', !this.double);
    if (turn.hard) {
      this.paintFace(this.hardFront, turn.front);
      this.paintFace(this.hardBack, turn.back);
    } else {
      this.paintFace(this.flat, turn.front);
      this.paintFace(this.back, turn.back);
    }
    this.renderTurn();
  }

  private renderTurn(): void {
    const turn = this.turn;
    if (!turn) return;
    const w = this.width;
    const h = this.height;
    if (turn.hard) {
      const p = constrainPointer(w, h, turn.corner, turn.pointer);
      const progress = Math.min(1, Math.max(0, (w - p.x) / (2 * w)));
      this.hardLeaf.style.transform = `rotateY(${-180 * progress}deg)`;
      this.hardLeaf.style.setProperty('--pdflip-light', String(Math.sin(Math.PI * progress)));
      return;
    }
    const fold = computeFold(w, h, turn.corner, turn.pointer);
    if (!fold) {
      this.flat.element.style.clipPath = '';
      this.backWrap.hidden = true;
      this.shadeUnder.hidden = true;
      this.shadeFlat.hidden = true;
      return;
    }
    this.backWrap.hidden = false;
    this.shadeUnder.hidden = false;
    this.shadeFlat.hidden = false;
    this.flat.element.style.clipPath = polygonToCss(fold.flat);
    this.back.element.style.transform = matrixToCss(fold.backMatrix);
    this.back.element.style.clipPath = polygonToCss(fold.backClip);
    this.backWrap.style.opacity =
      !this.double && fold.progress > 0.6 ? String(Math.max(0, (1 - fold.progress) / 0.4)) : '1';
    this.shadeUnder.style.clipPath = polygonToCss(fold.lifted);
    this.shadeFlat.style.clipPath = polygonToCss(fold.flat);
    this.placeShade(this.shadeUnderGradient, fold.origin, fold.normal, fold);
    this.placeShade(
      this.shadeFlatGradient,
      fold.origin,
      { x: -fold.normal.x, y: -fold.normal.y },
      fold
    );
    // the back face is shaded in its own (mirrored) coordinates
    this.placeShade(
      this.shadeBackGradient,
      { x: w - fold.origin.x, y: fold.origin.y },
      { x: -fold.normal.x, y: fold.normal.y },
      fold
    );
  }

  /** Puts a gradient strip so that it starts on the fold line and runs along `normal`. */
  private placeShade(element: HTMLElement, origin: Point, normal: Point, fold: Fold): void {
    const angle = Math.atan2(normal.y, normal.x);
    const size = Math.hypot(this.width, this.height) * 2;
    element.style.width = `${size}px`;
    element.style.height = `${size * 2}px`;
    element.style.transform = `translate(${origin.x}px, ${origin.y}px) rotate(${angle}rad) translateY(-50%)`;
    element.style.setProperty('--pdflip-progress', String(fold.progress));
    element.style.setProperty('--pdflip-shade-width', `${Math.max(16, this.width * 0.18)}px`);
  }

  private completeTurn(done: boolean): void {
    const turn = this.turn;
    if (!turn) return;
    this.turn = undefined;
    this.turnLayer.hidden = true;
    this.flat.page = null;
    this.back.page = null;
    this.hardFront.page = null;
    this.hardBack.page = null;
    const previous = this.index;
    this.index = done ? turn.to : turn.from;
    this.showSpread(this.index, true);
    if (done) this.host.turned(this.index, previous);
  }

  private cancelTurn(): void {
    this.finishAnimation();
    if (this.turn) this.completeTurn(false);
  }

  private animate(duration: number, path: (t: number) => Point, done: () => void): void {
    const start = performance.now();
    const step = (now: number) => {
      const t = duration <= 0 ? 1 : Math.min(1, (now - start) / duration);
      if (this.turn) {
        this.turn.pointer = path(t);
        this.renderTurn();
      }
      if (t < 1) {
        this.animation!.frame = requestAnimationFrame(step);
      } else {
        this.animation = undefined;
        done();
      }
    };
    this.animation = {
      frame: requestAnimationFrame(step),
      finish: () => {
        if (this.turn) this.turn.pointer = path(1);
        done();
      },
    };
  }

  private finishAnimation(): void {
    const animation = this.animation;
    if (!animation) return;
    cancelAnimationFrame(animation.frame);
    this.animation = undefined;
    animation.finish();
  }

  // ---------------------------------------------------------------- pointer

  /** Pointer position in book coordinates: spine at x = 0, forward direction to the right. */
  private toBook(clientX: number, clientY: number): Point {
    const rect = this.book.getBoundingClientRect();
    const scale = rect.height / this.height || 1;
    let offset = (clientX - rect.left) / scale;
    if (this.host.rtl) {
      // the book is mirrored, so its local x runs from the right edge
      offset = this.width * (this.double ? 2 : 1) - offset;
    }
    return { x: offset - this.spineX(), y: (clientY - rect.top) / scale };
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      this.startPinch();
      return;
    }
    if (this.pointers.size > 2) return;
    if ((event.target as HTMLElement).closest('.pdflip-text') && this.zoom > 1.01) {
      return; // text selection while zoomed
    }
    this.finishAnimation();
    const point = this.toBook(event.clientX, event.clientY);
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      side: point.x < 0 ? 'left' : 'right',
      lastX: point.x,
      lastTime: event.timeStamp,
      velocity: 0,
    };
    if (this.zoom > 1.01) {
      this.drag.pan = { ...this.pan };
    } else if (this.turn) {
      // hover peek is active: take it over as a drag
      this.drag.turn = this.turn;
    }
    this.element.setPointerCapture?.(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.pointers.has(event.pointerId)) {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (this.pinch) {
      this.updatePinch();
      return;
    }
    const drag = this.drag;
    if (!drag) {
      this.hover(event);
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
    if (drag.pan) {
      this.pan = {
        x: drag.pan.x + event.clientX - drag.startX,
        y: drag.pan.y + event.clientY - drag.startY,
      };
      this.clampPan();
      this.applyStageTransform();
      return;
    }
    const point = this.toBook(event.clientX, event.clientY);
    const dt = Math.max(1, event.timeStamp - drag.lastTime);
    drag.velocity = (point.x - drag.lastX) / dt;
    drag.lastX = point.x;
    drag.lastTime = event.timeStamp;
    if (!drag.turn) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD)
        return;
      const target = this.index + (drag.side === 'right' ? 1 : -1);
      if (!this.canTurn(target) || !this.host.allowTurn(this.index, target)) {
        this.drag = undefined;
        return;
      }
      const start = this.toBook(drag.startX, drag.startY);
      const turn = this.createTurn(target, start.y < this.height / 2 ? 'top' : 'bottom');
      if (!turn) return;
      turn.pointer = point;
      drag.turn = turn;
      this.beginTurn(turn);
      this.hovering = false;
    }
    this.hovering = false;
    drag.turn.pointer = point;
    this.renderTurn();
  }

  private onPointerUp(event: PointerEvent, cancelled = false): void {
    this.pointers.delete(event.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.endPinch();
      return;
    }
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.drag = undefined;
    if (drag.pan) return;
    const turn = drag.turn;
    if (!turn) {
      // a click without movement turns the page on the side that was clicked
      if (!cancelled) this.turnTo(this.index + (drag.side === 'right' ? 1 : -1), 'bottom');
      return;
    }
    const forward = turn.to > turn.from;
    const moved =
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= DRAG_THRESHOLD;
    if (!moved && !cancelled) {
      // click on a peeling corner: turn the page
      this.releaseTurn(turn, forward);
      return;
    }
    const point = turn.pointer;
    // complete when the corner crossed the spine or the gesture was a quick swipe
    let complete = forward ? point.x < 0 : point.x > 0;
    if (Math.abs(drag.velocity) > 0.5) complete = forward ? drag.velocity < 0 : drag.velocity > 0;
    if (cancelled) complete = false;
    this.releaseTurn(turn, forward ? complete : !complete);
  }

  /**
   * Lets go of the sheet: it falls to the left (`toLeft`) or back to the right,
   * which for a backward turn means completing or cancelling it.
   */
  private releaseTurn(turn: Turn, toLeft: boolean): void {
    this.hovering = false;
    const forward = turn.to > turn.from;
    const w = this.width;
    const h = this.height;
    const from = constrainPointer(w, h, turn.corner, turn.pointer);
    const baseY = turn.corner === 'top' ? 0 : h;
    const target = { x: toLeft ? -w : w, y: baseY };
    const distance = Math.abs(target.x - from.x) / (2 * w);
    const duration = prefersReducedMotion() ? 0 : Math.max(120, this.host.duration * distance);
    const done = forward ? toLeft : !toLeft;
    this.animate(
      duration,
      (t) => {
        const e = easeInOut(t);
        return { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e };
      },
      () => this.completeTurn(done)
    );
  }

  /** Peels the corner a little when the pointer comes close, as an invitation to drag. */
  private hover(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || this.zoom > 1.01 || this.animation) return;
    if (this.turn && !this.hovering) return;
    const point = this.toBook(event.clientX, event.clientY);
    const w = this.width;
    const h = this.height;
    const corner: Corner = point.y < h / 2 ? 'top' : 'bottom';
    const cornerY = corner === 'top' ? 0 : h;
    const nearRight =
      w - point.x < HOVER_ZONE && point.x <= w && Math.abs(point.y - cornerY) < HOVER_ZONE;
    const leftEdge = this.double ? -w : 0;
    const nearLeft =
      this.double &&
      point.x - leftEdge < HOVER_ZONE &&
      point.x >= leftEdge &&
      Math.abs(point.y - cornerY) < HOVER_ZONE;
    const target = this.index + (nearRight ? 1 : -1);
    if (
      (nearRight || nearLeft) &&
      this.canTurn(target) &&
      !this.host.flipStyle.startsWith('hard')
    ) {
      if (!this.hovering) {
        const turn = this.createTurn(target, corner);
        if (!turn || turn.hard) return;
        this.hovering = true;
        turn.pointer = nearRight ? { x: w, y: cornerY } : { x: -w, y: cornerY };
        this.beginTurn(turn);
      }
      const turn = this.turn!;
      const peek = 0.35;
      const anchor = nearRight ? { x: w, y: cornerY } : { x: -w, y: cornerY };
      turn.pointer = {
        x: anchor.x + (point.x - anchor.x) * peek * 2.5,
        y: anchor.y + (point.y - anchor.y) * peek * 2.5,
      };
      if (nearRight) turn.pointer.x = Math.min(turn.pointer.x, w - 12);
      else turn.pointer.x = Math.max(turn.pointer.x, -w + 12);
      this.renderTurn();
    } else if (this.hovering) {
      this.onPointerLeave();
    }
  }

  private onPointerLeave(): void {
    if (!this.hovering || !this.turn || this.drag) return;
    const turn = this.turn;
    const forward = turn.to > turn.from;
    this.releaseTurn(turn, !forward);
  }

  private onDoubleClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('a')) return;
    if (this.zoom > 1.01) {
      this.resetZoom();
    } else {
      this.zoomAt(2, event.clientX, event.clientY);
    }
  }

  // ---------------------------------------------------------------- zoom

  zoomAt(zoom: number, clientX?: number, clientY?: number): void {
    this.cancelTurn();
    const next = Math.min(this.host.zoomMax, Math.max(1, zoom));
    const rect = this.element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const sx = clientX ?? cx;
    const sy = clientY ?? cy;
    // keep the point under the cursor in place
    const qx = (sx - cx - this.pan.x) / this.zoom;
    const qy = (sy - cy - this.pan.y) / this.zoom;
    this.zoom = next;
    this.pan = { x: sx - cx - next * qx, y: sy - cy - next * qy };
    this.clampPan();
    this.applyStageTransform();
    this.element.classList.toggle('is-zoomed', next > 1.01);
    this.host.zoomChanged(next);
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.showSpread(this.index, true), 200);
  }

  resetZoom(): void {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.applyStageTransform();
    this.element.classList.remove('is-zoomed');
    this.host.zoomChanged(1);
  }

  private clampPan(): void {
    const bookWidth = this.width * (this.double ? 2 : 1) * this.zoom;
    const bookHeight = this.height * this.zoom;
    const maxX = Math.max(0, (bookWidth - this.element.clientWidth) / 2);
    const maxY = Math.max(0, (bookHeight - this.element.clientHeight) / 2);
    this.pan.x = Math.min(maxX, Math.max(-maxX, this.pan.x));
    this.pan.y = Math.min(maxY, Math.max(-maxY, this.pan.y));
  }

  private applyStageTransform(): void {
    this.stage.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
  }

  private startPinch(): void {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    this.cancelTurn();
    this.drag = undefined;
    this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
  }

  private updatePinch(): void {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b || !this.pinch) return;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    this.zoomAt(
      (this.pinch.zoom * distance) / this.pinch.distance,
      (a.x + b.x) / 2,
      (a.y + b.y) / 2
    );
  }

  private endPinch(): void {
    this.pinch = undefined;
    if (this.zoom < 1.05) this.resetZoom();
  }

  /** Page views of the current spread (for search highlights). */
  visibleViews(): PageView[] {
    return this.slots.filter((slot) => slot.page !== null);
  }

  destroy(): void {
    this.finishAnimation();
    clearTimeout(this.refreshTimer);
    this.element.remove();
  }
}
