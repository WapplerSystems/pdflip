/**
 * Entry of the `<script>` build (`pdflip.global.js`): remembers where it was loaded
 * from, then initialises every flip book in the page once the DOM is ready.
 */
import { bindLightboxTriggers, init } from './auto';
import { setBaseUrl } from './util/base-url';

const script = document.currentScript as HTMLScriptElement | null;
if (script?.src) {
  setBaseUrl(new URL('.', script.src).href);
}

function start(): void {
  if (document.documentElement.dataset.pdflipAuto === 'false') return;
  bindLightboxTriggers();
  init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

export * from './index';
