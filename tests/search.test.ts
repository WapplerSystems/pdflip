import { normalize, searchRuns } from '../src/ui/search';

const run = (text: string, x = 0) => ({ text, rect: { x, y: 0.1, width: 0.5, height: 0.02 } });

describe('search', () => {
  it('ignores case and diacritics', () => {
    expect(normalize('Über Größe')).toBe(
      'uber große'.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    );
    const hits = searchRuns(3, [run('Die Brunnen über dem See')], 'UBER');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.page).toBe(3);
  });

  it('finds matches across runs and records the parts', () => {
    const hits = searchRuns(1, [run('Natur'), run('stein ist schön')], 'natur stein');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.parts.map((p) => p.run)).toEqual([0, 1]);
  });

  it('keeps the original spelling in the snippet', () => {
    const [hit] = searchRuns(1, [run('Größe und Gewicht')], 'gewicht');
    expect(hit!.snippet).toContain('Größe');
    expect(hit!.snippet.slice(hit!.start, hit!.start + hit!.length)).toBe('Gewicht');
  });

  it('returns nothing for an empty query', () => {
    expect(searchRuns(1, [run('abc')], '  ')).toEqual([]);
  });
});
