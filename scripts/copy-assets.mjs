// Copies the stylesheet and the pdf.js runtime next to the bundles, so that `dist/`
// can be served as is: pdflip.global.js finds `pdfjs/` relative to its own URL.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'));
const dist = new URL('../dist/', import.meta.url).pathname;
const target = join(dist, 'pdfjs');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const file of ['build/pdf.min.mjs', 'build/pdf.worker.min.mjs']) {
  cpSync(join(pdfjsRoot, file), join(target, file.split('/').pop()));
}
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  cpSync(join(pdfjsRoot, directory), join(target, directory), { recursive: true });
}
cpSync(join(pdfjsRoot, 'LICENSE'), join(target, 'LICENSE'));
cpSync(new URL('../src/styles/pdflip.css', import.meta.url).pathname, join(dist, 'pdflip.css'));
console.log('assets copied to dist/');
