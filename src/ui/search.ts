import type { PageSource, Rect, TextRun } from '../source/types';

export interface SearchHit {
  page: number;
  /** Rectangles of the match on the page (one per text run it spans). */
  rects: Rect[];
  /** Surrounding text for the result list. */
  snippet: string;
  /** Position of the match inside the snippet. */
  start: number;
  length: number;
  /** Character ranges per text run, used to measure exact highlights in the text layer. */
  parts: HitPart[];
}

export interface HitPart {
  /** Index of the text run on the page. */
  run: number;
  from: number;
  to: number;
}

/** Folds case and diacritics so that "Uber" finds "Über". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Finds every occurrence of `query` on a page. The runs are joined with spaces where
 * pdf.js split the text, matching is done on the normalised text and mapped back to the
 * runs, so that each hit can be highlighted on the page.
 */
export function searchRuns(page: number, runs: TextRun[], query: string): SearchHit[] {
  const needle = normalize(query.trim()).replace(/\s+/g, ' ');
  if (needle.length === 0) return [];
  let text = '';
  // same layout as `text`, but with the original spelling for the result list
  let display = '';
  const offsets: { run: TextRun; index: number; start: number; end: number }[] = [];
  for (const [runIndex, run] of runs.entries()) {
    if (text.length > 0 && !text.endsWith(' ') && !run.text.startsWith(' ')) {
      text += ' ';
      display += ' ';
    }
    const start = text.length;
    // normalisation can change the length (NFD), so normalise run by run
    const normalized = normalize(run.text).replace(/\s+/g, ' ');
    const original = run.text.replace(/\s+/g, ' ');
    text += normalized;
    display += original.length === normalized.length ? original : normalized;
    offsets.push({ run, index: runIndex, start, end: text.length });
  }
  const hits: SearchHit[] = [];
  let index = text.indexOf(needle);
  while (index !== -1) {
    const end = index + needle.length;
    const rects: Rect[] = [];
    const parts: HitPart[] = [];
    for (const { run, index: runIndex, start, end: runEnd } of offsets) {
      if (runEnd <= index || start >= end) continue;
      parts.push({
        run: runIndex,
        from: Math.max(index, start) - start,
        to: Math.min(end, runEnd) - start,
      });
      const length = Math.max(1, runEnd - start);
      const from = (Math.max(index, start) - start) / length;
      const to = (Math.min(end, runEnd) - start) / length;
      rects.push({
        x: run.rect.x + run.rect.width * from,
        y: run.rect.y,
        width: run.rect.width * (to - from),
        height: run.rect.height,
      });
    }
    const snippetStart = Math.max(0, index - 40);
    const snippet = display.slice(snippetStart, Math.min(display.length, end + 40));
    hits.push({ page, rects, parts, snippet, start: index - snippetStart, length: needle.length });
    index = text.indexOf(needle, end);
  }
  return hits;
}

/** Searches the whole document page by page; stops when the signal is aborted. */
export async function searchDocument(
  source: PageSource,
  query: string,
  signal: AbortSignal,
  onHits: (hits: SearchHit[], page: number) => void
): Promise<void> {
  for (let page = 1; page <= source.pageCount; page++) {
    if (signal.aborted) return;
    const runs = await source.textRuns(page);
    if (signal.aborted) return;
    onHits(searchRuns(page, runs, query), page);
  }
}
