/**
 * Deep link hashes. pdflip writes `#pdflip-<id>/<page>`; links shared from dFlip
 * (`#flipbook-<id>/<page>/`, also with the prefixes `dflip-` and `dearflip-`) are read as well,
 * so they keep opening the right book on the right page after a switch.
 */
export interface HashTarget {
  id: string;
  page: number;
}

const CURRENT = /^#pdflip-(.+)\/(\d+)$/;
const LEGACY = /^#(?:flipbook|dflip|dearflip)-([^/]+)(?:\/(\d+))?\/?$/;

export function parseHash(hash: string = window.location.hash): HashTarget | undefined {
  const match = hash.match(CURRENT) ?? hash.match(LEGACY);
  if (!match) return undefined;
  return { id: decodeURIComponent(match[1]!), page: match[2] ? Number(match[2]) : 1 };
}

/** Whether the hash belongs to a book, so pdflip may replace or clear it. */
export function isBookHash(hash: string = window.location.hash): boolean {
  return hash.startsWith('#pdflip-') || LEGACY.test(hash);
}

/**
 * The element a hash id points to: its own id, or the id dFlip gave it, kept in
 * `data-pdflip-legacy-id` when the markup was renamed.
 */
export function elementForHashId(id: string): HTMLElement | null {
  return (
    document.getElementById(id) ??
    document.querySelector<HTMLElement>(`[data-pdflip-legacy-id="${CSS.escape(id)}"]`)
  );
}
