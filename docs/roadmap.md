# Roadmap

Based on what users of dFlip/DearFlip reported on GitHub (`dearhive/dearflip-js-flipbook`,
issues #1–#150) and in the WordPress.org support forum of the Lite plugin (806 topics), as of
October 2026. The maintainer calls that repository an old test version without bug fixes
(#41, #47, #94), so the reports describe the problems a replacement has to solve.

## Reported problems

| Problem | Evidence | pdflip |
|---|---|---|
| PDF on another domain: "Cannot access file", CORS | ≈24 + 18 forum topics, GH #59, #74 | ✅ cause named in the console, Blob/ArrayBuffer sources, `httpHeaders`/`withCredentials` |
| Range requests broken by caches/gzip ("Bad end offset") | forum, GH #12 | ✅ `pdfjs.disableRange`, hint in the console · ⬜ automatic detection and fallback |
| Links in the PDF not clickable, wrong after zoom | ≈11 topics, GH #4, #41, #53 | ✅ overlays in percent, internal links turn to the page |
| Accessibility (no keyboard, divs instead of buttons, no announcements) | GH #121, a11y audits a11y-PT 052/056 | ✅ buttons with labels, keyboard, live region, dialog focus · ⬜ full WCAG audit |
| CSP needs `unsafe-eval`/inline scripts, old pdf.js with CVE-2024-4367 | GH #110, CarvingIT/smart-repository#187 | ✅ pdf.js 6, no inline config, no eval |
| pdf.js version conflicts with other plugins | 4 forum topics | ✅ own module instance, explicit `workerSrc`, `pdfjs.lib` |
| iOS: blank pages, freezes, crashes | ≈21 topics, GH #43, #55, #64, #130 | ✅ pixel budget, smaller budget on touch devices · ⬜ test on real devices |
| Blurry text, especially when zoomed | 6 topics, pdf.js #11865 | ✅ re-render at zoom × DPR · ⬜ tiles beyond `maxTextureSize` |
| WebGL/three.js does not load | GH #38, #39, #42, #45, #47 | ✅ no WebGL needed |
| Fullscreen on iOS, viewer behind the header | GH #24, #28, #36, #139, #149 | ✅ pseudo-fullscreen, lightbox in the top layer |
| Several books on one page react together | forum, GH #130 | ✅ no global state, keyboard only on the focused book, lazy loading |
| Wrong size on init, empty space on mobile | GH #49 | ✅ ResizeObserver, space reserved before loading |
| Wheel hijacks page scrolling | GH #3, #20, #146 | ✅ zoom only with Ctrl/pinch in embedded books |
| Unused JS on every page, slow | 3 topics | ✅ 60 KB, pdf.js only when a book is visible |
| Sound on by default, mute does not work | ≈11 topics | ✅ off by default |
| RTL: animation and focus wrong | 3 topics | ✅ RTL by mirroring, keys follow the reading direction |

## Feature requests

| Request | Evidence | pdflip |
|---|---|---|
| Full-text search | ≈15 topics, GH #46 | ✅ |
| Select and copy text | GH #116, 2 topics | ✅ (while zoomed) |
| Deep links, start page, JS API | GH #10, #76, #96 | ✅ |
| Events for analytics | GH #37, 3 topics | ✅ `pdflip:*` DOM events · ⬜ `download`/`share`/`complete` events |
| Page mode options, breakpoint, no cover | GH #19, #21, #34, #102, #109 | ✅ `pageMode` · ⬜ `cover: false`, split double-page PDFs, `transition: slide/none` |
| Thumbnails/outline: own TOC | GH #13, #23, #62 | ✅ `outline` option |
| Hide download/share, other download file, password | GH #14, #30, #58, #65 | ✅ `controls`, `download: url`, `password` |
| Dynamic sources (Blob, API), change at runtime | GH #45, #48, #73 | ✅ Blob/ArrayBuffer · ⬜ `setSource()` |
| React/Vue/Angular | GH #55, #56, #63, #87 | ✅ framework-free ESM · ⬜ custom element `<pdf-flipbook>` |
| Back button closes the lightbox | GH #26 | ✅ |
| Link target configurable | GH #25, #35 | ✅ `linkTarget` |
| SEO: content findable | 3 topics | ⬜ server-side text output in the integrations (TYPO3) |
| Vertical scroll reader | GH #101 | ⬜ |
| Calendar flip (top/bottom) | GH #40 | ⬜ |
| Print | GH #29 | ⬜ |
| Hotspots, video/audio on pages | 3 topics | ⬜ overlay API |
