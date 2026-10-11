/**
 * Geometry of a soft page fold.
 *
 * Everything is computed for a forward turn of the right-hand leaf: the leaf covers
 * `x ∈ [0, w]`, `y ∈ [0, h]` with the spine at `x = 0`. Backward turns and right-to-left
 * books are rendered in a mirrored frame by the view, so one set of formulas serves all.
 *
 * The grabbed corner `c` is dragged to the pointer `p`. The paper folds along the
 * perpendicular bisector of `c` and `p`; the part of the leaf on the corner's side of
 * that line is mirrored across it and shows the back of the leaf.
 */
export interface Point {
  x: number;
  y: number;
}

/** CSS `matrix(a, b, c, d, e, f)`. */
export type Matrix = [number, number, number, number, number, number];

export interface Fold {
  /** Part of the leaf that still lies flat (book coordinates). */
  flat: Point[];
  /** Part of the leaf that has been lifted — this area now shows the page underneath. */
  lifted: Point[];
  /**
   * Transform that maps the back page (local coordinates `u ∈ [0, w]` as if it lay flat
   * on the left) onto its folded position in book coordinates.
   */
  backMatrix: Matrix;
  /** Area of the back page that is visible, in its local coordinates. */
  backClip: Point[];
  /** Fold line through the leaf: point on the line and unit normal pointing to the corner. */
  origin: Point;
  normal: Point;
  /** 0 = flat, 1 = turned over completely. */
  progress: number;
}

export type Corner = 'top' | 'bottom';

const EPSILON = 0.5;

/** Keeps the pointer where a sheet of paper attached to the spine can actually reach. */
export function constrainPointer(w: number, h: number, corner: Corner, pointer: Point): Point {
  const spineNear = { x: 0, y: corner === 'top' ? 0 : h };
  const spineFar = { x: 0, y: corner === 'top' ? h : 0 };
  let p = limitDistance(spineNear, pointer, w);
  p = limitDistance(spineFar, p, Math.hypot(w, h));
  return p;
}

function limitDistance(center: Point, point: Point, max: number): Point {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= max || distance === 0) {
    return point;
  }
  return { x: center.x + (dx / distance) * max, y: center.y + (dy / distance) * max };
}

export function computeFold(w: number, h: number, corner: Corner, pointer: Point): Fold | null {
  const c = { x: w, y: corner === 'top' ? 0 : h };
  const p = constrainPointer(w, h, corner, pointer);
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) {
    return null;
  }
  const normal = { x: dx / length, y: dy / length };
  const origin = { x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 };
  const side = (q: Point) => (q.x - origin.x) * normal.x + (q.y - origin.y) * normal.y;

  const leaf: Point[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const lifted = clipPolygon(leaf, (q) => side(q));
  const flat = clipPolygon(leaf, (q) => -side(q));

  // Reflection across the fold line: R(q) = A·q + t with A = I − 2nnᵀ, t = 2(origin·n)n.
  const a11 = 1 - 2 * normal.x * normal.x;
  const a12 = -2 * normal.x * normal.y;
  const a21 = a12;
  const a22 = 1 - 2 * normal.y * normal.y;
  const k = 2 * (origin.x * normal.x + origin.y * normal.y);
  const tx = k * normal.x;
  const ty = k * normal.y;
  // The back page point (u, v) sits on the leaf at (w − u, v); compose with R.
  const backMatrix: Matrix = [-a11, -a21, a12, a22, a11 * w + tx, a21 * w + ty];
  const backClip = lifted.map((q) => ({ x: w - q.x, y: q.y }));

  const progress = Math.min(1, Math.max(0, (w - p.x) / (2 * w)));
  return { flat, lifted, backMatrix, backClip, origin, normal, progress };
}

/** Sutherland–Hodgman clipping against the half plane `inside(q) >= 0`. */
export function clipPolygon(polygon: Point[], inside: (q: Point) => number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;
    const dc = inside(current);
    const dn = inside(next);
    if (dc >= 0) {
      result.push(current);
    }
    if (dc >= 0 !== dn >= 0) {
      const t = dc / (dc - dn);
      result.push({
        x: current.x + (next.x - current.x) * t,
        y: current.y + (next.y - current.y) * t,
      });
    }
  }
  return result;
}

export function polygonToCss(points: Point[], offsetX = 0, offsetY = 0): string {
  if (points.length < 3) {
    return 'polygon(0 0, 0 0, 0 0)';
  }
  return `polygon(${points
    .map((q) => `${round(q.x - offsetX)}px ${round(q.y - offsetY)}px`)
    .join(', ')})`;
}

export function matrixToCss(m: Matrix): string {
  return `matrix(${m.map(round).join(', ')})`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Point on the path the corner travels when a page is turned by a click instead of a drag. */
export function autoFlipPointer(w: number, h: number, corner: Corner, t: number): Point {
  const baseY = corner === 'top' ? 0 : h;
  // The corner sweeps from (w, baseY) to (−w, baseY) and lifts a little in between.
  const x = w - 2 * w * t;
  const lift = Math.sin(Math.PI * t) * h * 0.12;
  const y = corner === 'top' ? baseY + lift : baseY - lift;
  return { x, y };
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
