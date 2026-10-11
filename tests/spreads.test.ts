import { buildSpreads, firstPage, spreadIndexForPage, visiblePages } from '../src/core/spreads';

describe('spreads', () => {
  it('puts the cover alone and pairs the rest', () => {
    expect(buildSpreads(5, true).map((s) => s.pages)).toEqual([
      [null, 1],
      [2, 3],
      [4, 5],
    ]);
    expect(buildSpreads(4, true).map((s) => s.pages)).toEqual([
      [null, 1],
      [2, 3],
      [4, null],
    ]);
  });

  it('has one page per spread in single mode', () => {
    expect(buildSpreads(3, false).map((s) => s.pages)).toEqual([[1], [2], [3]]);
  });

  it('finds the spread of a page', () => {
    expect(spreadIndexForPage(1, 10, true)).toBe(0);
    expect(spreadIndexForPage(2, 10, true)).toBe(1);
    expect(spreadIndexForPage(3, 10, true)).toBe(1);
    expect(spreadIndexForPage(99, 10, true)).toBe(5);
    expect(spreadIndexForPage(4, 10, false)).toBe(3);
  });

  it('lists visible pages', () => {
    expect(visiblePages({ pages: [null, 1] })).toEqual([1]);
    expect(firstPage({ pages: [6, 7] })).toBe(6);
  });

  it('handles empty documents', () => {
    expect(buildSpreads(0, true)).toEqual([]);
  });
});
