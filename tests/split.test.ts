import { describe, expect, it } from 'vitest';
import { inHalf, isSpread, splitParts, toHalf } from '../src/source/split';

const portrait = { width: 595, height: 842 };
const spread = { width: 1190, height: 842 };

describe('split spreads', () => {
  it('recognises two cover-sized pages side by side', () => {
    expect(isSpread(spread, portrait)).toBe(true);
    expect(isSpread({ width: 1250, height: 842 }, portrait)).toBe(true);
    expect(isSpread(portrait, portrait)).toBe(false);
    expect(isSpread({ width: 842, height: 595 }, portrait)).toBe(false);
    expect(isSpread(spread, spread)).toBe(false);
  });

  it('splits every spread after the cover', () => {
    expect(splitParts([portrait, spread, spread, portrait])).toEqual([
      { page: 1 },
      { page: 2, half: 'left' },
      { page: 2, half: 'right' },
      { page: 3, half: 'left' },
      { page: 3, half: 'right' },
      { page: 4 },
    ]);
  });

  it('leaves documents without spreads alone', () => {
    expect(splitParts([portrait, portrait])).toBeNull();
    expect(splitParts([spread, spread])).toBeNull();
    expect(splitParts([])).toBeNull();
  });

  it('maps rectangles onto a half', () => {
    const left = { x: 0.1, y: 0.2, width: 0.1, height: 0.1 };
    const right = { x: 0.6, y: 0.2, width: 0.1, height: 0.1 };
    expect(inHalf(left, 'left')).toBe(true);
    expect(inHalf(left, 'right')).toBe(false);
    expect(inHalf(right, 'right')).toBe(true);
    expect(toHalf(left, 'left')).toEqual({ x: 0.2, y: 0.2, width: 0.2, height: 0.1 });
    expect(toHalf(right, 'right').x).toBeCloseTo(0.2);
    expect(toHalf(right, undefined)).toBe(right);
  });
});
