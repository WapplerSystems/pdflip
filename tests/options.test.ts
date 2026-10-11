import { resolveLabels } from '../src/i18n';
import { optionsFromElement, resolveOptions } from '../src/options';

describe('options', () => {
  it('reads data attributes', () => {
    const element = document.createElement('div');
    element.dataset.pdflip = 'a.pdf';
    element.dataset.pdflipPageMode = 'single';
    element.dataset.pdflipStartPage = '5';
    element.dataset.pdflipSound = 'true';
    element.dataset.pdflipControls = 'prev, next';
    element.dataset.pdflipDownload = 'other.pdf';
    expect(optionsFromElement(element)).toEqual({
      pageMode: 'single',
      startPage: 5,
      sound: true,
      controls: ['prev', 'next'],
      download: 'other.pdf',
    });
  });

  it('merges JSON options', () => {
    const element = document.createElement('div');
    element.dataset.pdflipOptions = '{"zoomMax": 6}';
    expect(optionsFromElement(element).zoomMax).toBe(6);
  });

  it('drops controls of disabled features', () => {
    const options = resolveOptions({ source: 'a.pdf', download: false, autoplay: false });
    expect(options.controls).not.toContain('download');
    expect(options.controls).not.toContain('autoplay');
    expect(options.sound).toBe(false);
  });

  it('falls back from regional to base language', () => {
    expect(resolveLabels('de-CH').next).toBe('Nächste Seite');
    expect(resolveLabels('xx').next).toBe('Next page');
    expect(resolveLabels('en', { next: 'Weiter' }).next).toBe('Weiter');
  });
});
