export interface Labels {
  book: string;
  first: string;
  prev: string;
  next: string;
  last: string;
  pageOf: string;
  goToPage: string;
  zoomIn: string;
  zoomOut: string;
  thumbnails: string;
  outline: string;
  search: string;
  searchPlaceholder: string;
  searchNoResults: string;
  searchResults: string;
  autoplayStart: string;
  autoplayStop: string;
  singlePage: string;
  doublePage: string;
  soundOn: string;
  soundOff: string;
  share: string;
  copyLink: string;
  linkCopied: string;
  shareMail: string;
  mailSubject: string;
  download: string;
  fullscreen: string;
  exitFullscreen: string;
  close: string;
  loading: string;
  error: string;
  errorNotFound: string;
  errorInvalid: string;
  errorPassword: string;
  page: string;
  noOutline: string;
}

const en: Labels = {
  book: 'Flip book',
  first: 'First page',
  prev: 'Previous page',
  next: 'Next page',
  last: 'Last page',
  pageOf: '{page} of {total}',
  goToPage: 'Go to page',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  thumbnails: 'Thumbnails',
  outline: 'Table of contents',
  search: 'Search',
  searchPlaceholder: 'Search in document',
  searchNoResults: 'No results',
  searchResults: '{count} results',
  autoplayStart: 'Start autoplay',
  autoplayStop: 'Stop autoplay',
  singlePage: 'Single page',
  doublePage: 'Double page',
  soundOn: 'Turn sound on',
  soundOff: 'Turn sound off',
  share: 'Share',
  copyLink: 'Copy link',
  linkCopied: 'Link copied',
  shareMail: 'Send by e-mail',
  mailSubject: 'Have a look at this document',
  download: 'Download PDF',
  fullscreen: 'Fullscreen',
  exitFullscreen: 'Exit fullscreen',
  close: 'Close',
  loading: 'Loading …',
  error: 'The document could not be loaded.',
  errorNotFound: 'The document was not found.',
  errorInvalid: 'The file is not a valid PDF document.',
  errorPassword: 'The document is password protected.',
  page: 'Page {page}',
  noOutline: 'This document has no table of contents.',
};

const de: Labels = {
  book: 'Blätterkatalog',
  first: 'Erste Seite',
  prev: 'Vorherige Seite',
  next: 'Nächste Seite',
  last: 'Letzte Seite',
  pageOf: '{page} von {total}',
  goToPage: 'Gehe zu Seite',
  zoomIn: 'Vergrößern',
  zoomOut: 'Verkleinern',
  thumbnails: 'Seitenübersicht',
  outline: 'Inhaltsverzeichnis',
  search: 'Suche',
  searchPlaceholder: 'Im Dokument suchen',
  searchNoResults: 'Keine Treffer',
  searchResults: '{count} Treffer',
  autoplayStart: 'Automatisch blättern',
  autoplayStop: 'Automatisches Blättern anhalten',
  singlePage: 'Einzelseite',
  doublePage: 'Doppelseite',
  soundOn: 'Ton einschalten',
  soundOff: 'Ton ausschalten',
  share: 'Teilen',
  copyLink: 'Link kopieren',
  linkCopied: 'Link kopiert',
  shareMail: 'Per E-Mail senden',
  mailSubject: 'Schau dir dieses Dokument an',
  download: 'PDF herunterladen',
  fullscreen: 'Vollbild',
  exitFullscreen: 'Vollbild beenden',
  close: 'Schließen',
  loading: 'Wird geladen …',
  error: 'Das Dokument konnte nicht geladen werden.',
  errorNotFound: 'Das Dokument wurde nicht gefunden.',
  errorInvalid: 'Die Datei ist kein gültiges PDF-Dokument.',
  errorPassword: 'Das Dokument ist passwortgeschützt.',
  page: 'Seite {page}',
  noOutline: 'Dieses Dokument hat kein Inhaltsverzeichnis.',
};

const fr: Labels = {
  book: 'Livre feuilletable',
  first: 'Première page',
  prev: 'Page précédente',
  next: 'Page suivante',
  last: 'Dernière page',
  pageOf: '{page} sur {total}',
  goToPage: 'Aller à la page',
  zoomIn: 'Zoom avant',
  zoomOut: 'Zoom arrière',
  thumbnails: 'Miniatures',
  outline: 'Table des matières',
  search: 'Rechercher',
  searchPlaceholder: 'Rechercher dans le document',
  searchNoResults: 'Aucun résultat',
  searchResults: '{count} résultats',
  autoplayStart: 'Lecture automatique',
  autoplayStop: 'Arrêter la lecture automatique',
  singlePage: 'Page simple',
  doublePage: 'Double page',
  soundOn: 'Activer le son',
  soundOff: 'Couper le son',
  share: 'Partager',
  copyLink: 'Copier le lien',
  linkCopied: 'Lien copié',
  shareMail: 'Envoyer par e-mail',
  mailSubject: 'Regarde ce document',
  download: 'Télécharger le PDF',
  fullscreen: 'Plein écran',
  exitFullscreen: 'Quitter le plein écran',
  close: 'Fermer',
  loading: 'Chargement …',
  error: 'Le document n’a pas pu être chargé.',
  errorNotFound: 'Le document est introuvable.',
  errorInvalid: 'Le fichier n’est pas un document PDF valide.',
  errorPassword: 'Le document est protégé par un mot de passe.',
  page: 'Page {page}',
  noOutline: 'Ce document n’a pas de table des matières.',
};

export const locales: Record<string, Labels> = { en, de, fr };

/** Picks the labels for a locale (`de-CH` falls back to `de`, unknown to `en`). */
export function resolveLabels(locale: string, overrides?: Partial<Labels>): Labels {
  let lang = locale;
  if (lang === 'auto') {
    lang = (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
  }
  const base =
    locales[lang.toLowerCase()] ?? locales[lang.toLowerCase().split(/[-_]/)[0] ?? ''] ?? en;
  return { ...base, ...overrides };
}

/** Replaces `{name}` placeholders. */
export function format(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}
