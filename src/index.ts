export { bindLightboxTriggers, init, renderCover } from './auto';
export { Flipbook, type PdflipEventMap } from './flipbook';
export { type Labels, locales } from './i18n';
export { closeLightbox, openLightbox } from './lightbox';
export { defaults } from './options';
export { ImageSource } from './source/images';
export { loadPdfjs, PdfSource } from './source/pdf';
export type { PageSource } from './source/types';
export type * from './types';
export { setBaseUrl } from './util/base-url';

export const version: string = __VERSION__;
