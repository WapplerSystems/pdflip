import { clipPolygon, computeFold, constrainPointer, type Point } from '../src/core/fold';

const area = (points: Point[]) =>
  Math.abs(
    points.reduce((sum, p, i) => {
      const q = points[(i + 1) % points.length]!;
      return sum + p.x * q.y - q.x * p.y;
    }, 0) / 2
  );

const apply = (m: number[], p: Point): Point => ({
  x: m[0]! * p.x + m[2]! * p.y + m[4]!,
  y: m[1]! * p.x + m[3]! * p.y + m[5]!,
});

describe('computeFold', () => {
  const w = 400;
  const h = 600;

  it('returns nothing while the corner has not moved', () => {
    expect(computeFold(w, h, 'bottom', { x: w, y: h })).toBeNull();
  });

  it('splits the leaf into a flat and a lifted part that add up to the page', () => {
    const fold = computeFold(w, h, 'bottom', { x: 250, y: 520 })!;
    expect(area(fold.flat) + area(fold.lifted)).toBeCloseTo(w * h, 3);
    expect(area(fold.lifted)).toBeGreaterThan(0);
  });

  it('maps the corner of the back page onto the pointer', () => {
    const pointer = { x: 120, y: 480 };
    const fold = computeFold(w, h, 'bottom', pointer)!;
    // the grabbed corner (w, h) of the leaf is the corner (0, h) of the back page
    const corner = apply(fold.backMatrix, { x: 0, y: h });
    expect(corner.x).toBeCloseTo(pointer.x, 6);
    expect(corner.y).toBeCloseTo(pointer.y, 6);
  });

  it('keeps points on the fold line in place (reflection)', () => {
    const fold = computeFold(w, h, 'top', { x: 100, y: 150 })!;
    const onLine = { x: fold.origin.x - fold.normal.y * 50, y: fold.origin.y + fold.normal.x * 50 };
    const local = { x: w - onLine.x, y: onLine.y };
    const mapped = apply(fold.backMatrix, local);
    expect(mapped.x).toBeCloseTo(onLine.x, 6);
    expect(mapped.y).toBeCloseTo(onLine.y, 6);
  });

  it('reports progress from 0 to 1', () => {
    expect(computeFold(w, h, 'bottom', { x: w - 1, y: h })!.progress).toBeLessThan(0.01);
    expect(computeFold(w, h, 'bottom', { x: -w, y: h })!.progress).toBeCloseTo(1, 6);
  });
});

describe('constrainPointer', () => {
  it('keeps the corner within reach of the spine', () => {
    const p = constrainPointer(400, 600, 'bottom', { x: -900, y: 600 });
    expect(Math.hypot(p.x, p.y - 600)).toBeLessThanOrEqual(400 + 1e-9);
  });
});

describe('clipPolygon', () => {
  it('clips a square at a vertical line', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(area(clipPolygon(square, (p) => 4 - p.x))).toBeCloseTo(40);
  });
});
