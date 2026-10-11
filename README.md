# pdflip

Open-source PDF flip book for the web. Shows PDFs (or a list of images) as a book whose
pages you turn by dragging, clicking or with the keyboard — built on [pdf.js](https://mozilla.github.io/pdf.js/),
without jQuery, without WebGL, and under a BSD license.

```html
<link rel="stylesheet" href="pdflip/pdflip.css">
<script src="pdflip/pdflip.global.js" defer></script>

<div data-pdflip="brochure.pdf"></div>
```

That is all: every element with `data-pdflip` becomes a flip book.

## Features

* **Realistic page turn**: the paper folds along the pointer with shading and a cast shadow;
  hard covers or hard pages as an option; a corner peels up when the mouse comes close.
* **Single and double pages**, chosen automatically by the available space, cover page alone.
* **Right-to-left** books (Arabic, Hebrew, Manga).
* **Zoom** up to 4× with sharp re-rendering, pan by dragging, pinch, double click, Ctrl + wheel.
* **Thumbnails**, **table of contents** (from the PDF or your own), **full-text search** with
  exact highlights on the page.
* **Selectable text** (copy & paste) and **clickable links** of the PDF, internal and external.
* **Lightbox** in a native `<dialog>`; the browser's back button closes it.
* **Deep links** (`#pdflip-<id>/<page>`), share via Web Share API, link copy or e-mail.
* **Fullscreen** (with a fallback for iOS), **autoplay**, optional page turn sound
  (synthesised, no audio file needed).
* **Accessible**: real buttons with labels, keyboard control (arrows, Page Up/Down, Home/End,
  + / − / 0), focus management in the lightbox, live region for page changes, reduced motion.
* **Light**: ~60 KB minified; pdf.js (~460 KB + worker) is loaded only when a book comes into view.
* **Memory-aware** page cache with a pixel budget — long documents and deep zoom do not crash
  mobile Safari.
* **CSP-friendly**: no inline scripts or `eval`, configuration via data attributes.
* **dFlip-compatible markup**: `._df_book`, `._df_thumb` and `._df_button` with `source` keep
  working, so existing content needs no change.

## Installation

```bash
npm install pdflip
```

Copy `node_modules/pdflip/dist/` to your public assets, or use a CDN. The `pdfjs/` folder must
stay next to `pdflip.global.js` (or configure its location, see `pdfjs` below).

### As ES module

```js
import { Flipbook } from 'pdflip';
import 'pdflip/pdflip.css';
import * as pdfjs from 'pdfjs-dist';

const book = new Flipbook(document.querySelector('#book'), {
  source: '/files/brochure.pdf',
  pdfjs: { lib: pdfjs, workerSrc: '/assets/pdf.worker.min.mjs' },
});
book.on('flip', ({ page }) => console.log('now on page', page));
```

## Markup

```html
<!-- embedded book -->
<div data-pdflip="brochure.pdf" data-pdflip-page-mode="double" data-pdflip-start-page="3"></div>

<!-- opens in a lightbox -->
<a href="brochure.pdf" data-pdflip-lightbox>Open brochure</a>
<button type="button" data-pdflip-lightbox="brochure.pdf">Open</button>

<!-- renders the first page as cover image -->
<img data-pdflip-cover="brochure.pdf" alt="Brochure">

<!-- images instead of a PDF -->
<div data-pdflip='["p1.jpg","p2.jpg","p3.jpg"]'></div>
```

Every option can be given as `data-pdflip-<option-in-kebab-case>`, or all at once as JSON in
`data-pdflip-options`. Set `<html data-pdflip-auto="false">` to disable the automatic
initialisation.

## Options

| Option | Default | Description |
|---|---|---|
| `source` | – | URL, `URL`, `Blob`, `ArrayBuffer`/`Uint8Array` of a PDF, or an array of image URLs |
| `password` | – | Password of an encrypted PDF, or a function returning it |
| `id` | element id | Used for deep links and the share URL |
| `pageMode` | `auto` | `auto`, `single`, `double` |
| `direction` | `ltr` | `rtl` for right-to-left books |
| `flipStyle` | `soft` | `soft` (paper), `hard` (board), `cover` (hard covers, soft pages) |
| `startPage` | `1` | Page to open with |
| `duration` | `700` | Duration of a page turn in ms |
| `height` | `auto` | `auto` (from width and page ratio), pixels or any CSS length |
| `pageRatio` | from PDF | Page width / height |
| `background` | `transparent` | Background of the book area |
| `controls` | all | Toolbar controls in order: `first prev pageNumber next last thumbnails outline search zoomIn zoomOut autoplay pageMode sound share download fullscreen close` |
| `controlsPosition` | `bottom` | `top`, `bottom`, `hidden` |
| `openPanel` | `none` | `thumbnails` or `outline` to open on start |
| `outline` | from PDF | Own table of contents: `[{ title, page, items: [] }]` |
| `zoomMax` | `4` | Highest zoom factor |
| `wheel` | `zoom` | `zoom` (with Ctrl, or always in fullscreen/lightbox), `flip`, `none` |
| `sound` | `false` | Page turn sound |
| `soundUrl` | – | Own sound file instead of the synthesised one |
| `autoplay` / `autoplayInterval` / `autoplayStart` | `true` / `5000` / `false` | Autoplay control, interval, start immediately |
| `download` | `true` | Download control; a URL offers another file than the source |
| `deepLink` | `true` | Keep the page in the URL hash |
| `links` | `true` | Clickable links of the PDF |
| `linkTarget` | `_blank` | Target of external links |
| `textLayer` | `true` | Selectable text (active while zoomed, so dragging still turns pages) |
| `lazy` | `true` | Load when the book comes near the viewport |
| `maxTextureSize` | `4096` | Upper limit of the rendered page height in device pixels |
| `locale` | `auto` | `en`, `de`, `fr`; `auto` follows `<html lang>` |
| `labels` | – | Override single texts |
| `pdfjs` | – | `src`, `workerSrc`, `cMapUrl`, `standardFontDataUrl`, `wasmUrl`, `lib`, `disableRange`, `httpHeaders`, `withCredentials` |
| `onReady`, `beforeFlip`, `onFlip` | – | Callbacks; `beforeFlip` may return `false` to cancel |

## API

```js
const book = Pdflip.Flipbook.get(element);   // instance created from markup
book.next(); book.prev(); book.first(); book.last(); book.goTo(12);
book.page;            // current (left) page
book.pageCount;
book.zoomBy(1.5);
book.setPageMode('single');
book.togglePanel('search');
book.startAutoplay(); book.stopAutoplay();
await book.toggleFullscreen();
book.on('flip', ({ page, pages, previousPage }) => {});
book.on('ready' | 'zoom' | 'error', handler);
book.destroy();

Pdflip.openLightbox({ source: 'brochure.pdf', startPage: 4 });
Pdflip.init(container);  // initialise markup added later
```

DOM events with the same data bubble from the book element: `pdflip:ready`, `pdflip:flip`,
`pdflip:zoom`, `pdflip:error` — handy for analytics.

## Theming

All colours and sizes are CSS custom properties on `.pdflip`:

```css
.pdflip {
  --pdflip-accent: #c00;
  --pdflip-toolbar-background: #fff;
  --pdflip-page-shadow: 0 4px 20px rgb(0 0 0 / .3);
  --pdflip-button-size: 2.75rem;
}
```

`data-theme="dark"` on the book switches to the dark palette (the lightbox uses it by default).

## Loading problems

The PDF is fetched by the browser, so the usual web rules apply:

* **Another domain** (CDN, cloud storage) needs an `Access-Control-Allow-Origin` header; otherwise
  serve the file from your own domain. The console names the cause.
* **Range requests** let large PDFs show their first pages before the whole file is loaded.
  Some caches or gzip compression of PDFs break them — set `pdfjs: { disableRange: true }` or
  exclude PDFs from compression.

## Development

```bash
pnpm install
pnpm dev            # rebuild on change
pnpm demo           # build, then open demos/index.html via any static server
pnpm run check      # typecheck, lint, unit tests, build
```

A DDEV configuration is included: `ddev start`, then open `https://pdflip.ddev.site/demos/`.

## Releasing

Bump `version` in `package.json`, add the section to `CHANGELOG.md`, then tag:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

The `Release` workflow checks and builds the tag, publishes it to npm via Trusted Publishing
(with provenance, no token) and creates the GitHub release. The CI of `main` updates the
TYPO3 extension (`WapplerSystems/t3-pdflip`) independently of releases.

## License

BSD-3-Clause © WapplerSystems. pdf.js is Apache-2.0 (Mozilla), see `dist/pdfjs/LICENSE`.

pdflip is an independent implementation; it contains no code of dFlip/DearFlip.
