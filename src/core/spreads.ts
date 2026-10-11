/**
 * Page layout of the book. Page numbers are 1-based; `null` is an empty slot
 * (the place left of the front cover, right of a back cover on an even page count).
 *
 * In double mode the cover stands alone on the right, then the pages pair up:
 * `[null,1] [2,3] [4,5] … [n,null]`.
 */
export interface Spread {
  /** `[left, right]` in double mode, `[page]` in single mode. */
  pages: (number | null)[];
}

export function buildSpreads(pageCount: number, double: boolean): Spread[] {
  const spreads: Spread[] = [];
  if (pageCount <= 0) {
    return spreads;
  }
  if (!double) {
    for (let page = 1; page <= pageCount; page++) {
      spreads.push({ pages: [page] });
    }
    return spreads;
  }
  spreads.push({ pages: [null, 1] });
  for (let page = 2; page <= pageCount; page += 2) {
    spreads.push({ pages: [page, page + 1 <= pageCount ? page + 1 : null] });
  }
  return spreads;
}

export function spreadIndexForPage(page: number, pageCount: number, double: boolean): number {
  const clamped = Math.min(Math.max(1, page), Math.max(1, pageCount));
  return double ? Math.floor(clamped / 2) : clamped - 1;
}

/** Visible page numbers of a spread, without empty slots. */
export function visiblePages(spread: Spread | undefined): number[] {
  return (spread?.pages ?? []).filter((page): page is number => page !== null);
}

/** First visible page, used as "current page" for display and deep links. */
export function firstPage(spread: Spread | undefined): number {
  return visiblePages(spread)[0] ?? 1;
}
