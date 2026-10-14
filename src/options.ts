import type { ControlName, PdflipInit, PdflipOptions } from './types';

export const defaultControls: ControlName[] = [
  'first',
  'prev',
  'pageNumber',
  'next',
  'last',
  'thumbnails',
  'outline',
  'search',
  'zoomIn',
  'zoomOut',
  'autoplay',
  'pageMode',
  'sound',
  'share',
  'download',
  'fullscreen',
];

export const defaults: Omit<PdflipOptions, 'source'> = {
  pageMode: 'auto',
  direction: 'ltr',
  flipStyle: 'soft',
  startPage: 1,
  duration: 700,
  height: 'auto',
  background: 'transparent',
  controls: defaultControls,
  controlsPosition: 'bottom',
  openPanel: 'none',
  zoomMax: 4,
  wheel: 'zoom',
  // off by default: an unexpected sound is the most frequent complaint about flip books
  sound: false,
  autoplay: true,
  autoplayInterval: 5000,
  autoplayStart: false,
  download: true,
  deepLink: true,
  links: true,
  linkTarget: '_blank',
  textLayer: true,
  maxTextureSize: 4096,
  lazy: true,
  rangeChunkSize: 65536 * 8,
  prefetch: false,
  pdfjs: {},
  locale: 'auto',
};

export function resolveOptions(init: PdflipInit): PdflipOptions {
  const options: PdflipOptions = { ...defaults, ...stripUndefined(init) } as PdflipOptions;
  options.pdfjs = { ...defaults.pdfjs, ...init.pdfjs };
  options.startPage = Math.max(1, Math.floor(options.startPage) || 1);
  options.duration = Math.max(0, options.duration);
  options.zoomMax = Math.max(1, options.zoomMax);
  if (!options.autoplay) {
    options.controls = options.controls.filter((c) => c !== 'autoplay');
  }
  if (options.download === false) {
    options.controls = options.controls.filter((c) => c !== 'download');
  }
  return options;
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const booleanOptions = new Set([
  'sound',
  'autoplay',
  'autoplayStart',
  'deepLink',
  'links',
  'textLayer',
  'lazy',
  'prefetch',
]);
const numberOptions = new Set([
  'startPage',
  'duration',
  'pageRatio',
  'zoomMax',
  'autoplayInterval',
  'maxTextureSize',
  'pixelRatio',
  'rangeChunkSize',
]);
const listOptions = new Set(['controls']);

/**
 * Reads options from `data-pdflip-*` attributes, e.g. `data-pdflip-page-mode="single"`,
 * plus a JSON object in `data-pdflip-options` for everything else.
 */
export function optionsFromElement(element: HTMLElement): Partial<PdflipInit> {
  const result: Record<string, unknown> = {};
  const json = element.dataset.pdflipOptions;
  if (json) {
    try {
      Object.assign(result, JSON.parse(json));
    } catch {
      console.warn('[pdflip] data-pdflip-options is not valid JSON', element);
    }
  }
  for (const [key, raw] of Object.entries(element.dataset)) {
    if (
      !key.startsWith('pdflip') ||
      key === 'pdflip' ||
      key === 'pdflipOptions' ||
      raw === undefined
    ) {
      continue;
    }
    const name = key.charAt(6).toLowerCase() + key.slice(7);
    result[name] = parseValue(name, raw);
  }
  return result as Partial<PdflipInit>;
}

function parseValue(name: string, raw: string): unknown {
  if (booleanOptions.has(name)) {
    return raw === '' || raw === 'true' || raw === '1';
  }
  if (numberOptions.has(name)) {
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }
  if (listOptions.has(name)) {
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (name === 'download') {
    if (raw === 'false' || raw === '0') return false;
    if (raw === '' || raw === 'true' || raw === '1') return true;
    return raw;
  }
  if (name === 'height') {
    const value = Number(raw);
    return raw !== 'auto' && Number.isFinite(value) ? value : raw;
  }
  return raw;
}
