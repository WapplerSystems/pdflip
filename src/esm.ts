/**
 * Entry of the ES module build. Assets are looked up next to this file; bundlers that
 * move the module should pass `pdfjs.lib` (or `pdfjs.src`/`workerSrc`) instead.
 */
import { setBaseUrl } from './util/base-url';

setBaseUrl(new URL('.', import.meta.url).href);

export * from './index';
