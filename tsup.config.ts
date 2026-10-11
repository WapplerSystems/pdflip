import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

/**
 * Two artefacts:
 * - ESM (`pdflip.mjs` + types) for bundlers and `<script type="module">`.
 * - IIFE (`pdflip.global.js`) for a plain `<script>` tag, exposing the global `Pdflip`
 *   and initialising every `[data-pdflip]` element on the page.
 *
 * pdf.js is NOT bundled: it is loaded on demand from `dist/pdfjs/` (copied by
 * scripts/copy-assets.mjs), so pages without a flip book never pay for it.
 */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};
const define = { __VERSION__: JSON.stringify(pkg.version) };

export default defineConfig([
  {
    entry: { pdflip: 'src/esm.ts' },
    format: ['esm'],
    outExtension: () => ({ js: '.mjs' }),
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2022',
    platform: 'browser',
    external: ['pdfjs-dist'],
    define,
  },
  {
    entry: { pdflip: 'src/global.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.global.js' }),
    globalName: 'Pdflip',
    sourcemap: true,
    clean: false,
    minify: true,
    target: 'es2022',
    platform: 'browser',
    external: ['pdfjs-dist'],
    define,
  },
]);
