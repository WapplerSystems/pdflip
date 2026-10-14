import { describe, expect, it } from 'vitest';
import { isBookHash, parseHash } from '../src/util/hash';

describe('parseHash', () => {
  it('reads the pdflip format', () => {
    expect(parseHash('#pdflip-book-1/12')).toEqual({ id: 'book-1', page: 12 });
    expect(parseHash('#pdflip-a%20b/3')).toEqual({ id: 'a b', page: 3 });
  });

  it('reads links shared from dFlip', () => {
    expect(parseHash('#flipbook-pdflip-75955/5/')).toEqual({ id: 'pdflip-75955', page: 5 });
    expect(parseHash('#flipbook-df_intro_thumb-47337/3')).toEqual({
      id: 'df_intro_thumb-47337',
      page: 3,
    });
    expect(parseHash('#dflip-brochure/')).toEqual({ id: 'brochure', page: 1 });
    expect(parseHash('#dearflip-brochure')).toEqual({ id: 'brochure', page: 1 });
  });

  it('ignores other hashes', () => {
    expect(parseHash('')).toBeUndefined();
    expect(parseHash('#content')).toBeUndefined();
    expect(parseHash('#pdflip-book')).toBeUndefined();
    expect(isBookHash('#content')).toBe(false);
    expect(isBookHash('#flipbook-x/2/')).toBe(true);
    expect(isBookHash('#pdflip-x/2')).toBe(true);
  });
});
