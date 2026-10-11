/**
 * Line icons on a 24×24 grid, drawn for pdflip. They inherit `currentColor` and
 * scale with the font size, so themes only need CSS — no icon font, no extra request.
 */
const paths = {
  first: 'M18 6l-6 6 6 6M7 6v12',
  prev: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  last: 'M6 6l6 6-6 6M17 6v12',
  zoomIn: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM20 20l-4.8-4.8M10.5 7.5v6M7.5 10.5h6',
  zoomOut: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM20 20l-4.8-4.8M7.5 10.5h6',
  thumbnails: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  outline: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM20 20l-4.8-4.8',
  play: 'M8 5l11 7-11 7z',
  pause: 'M8.5 5v14M15.5 5v14',
  singlePage: 'M7 3h10v18H7z',
  doublePage: 'M3 5h8v14H3zM13 5h8v14h-8z',
  soundOn: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  soundOff: 'M4 9v6h4l5 4V5L8 9zM16.5 9.5l5 5M21.5 9.5l-5 5',
  share: 'M12 15V3M8 7l4-4 4 4M5 12v8h14v-8',
  download: 'M12 3v12M7.5 10.5L12 15l4.5-4.5M5 20h14',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  exitFullscreen: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  close: 'M6 6l12 12M18 6L6 18',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
} as const;

export type IconName = keyof typeof paths;

const SVG = 'http://www.w3.org/2000/svg';

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'pdflip-icon');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}
