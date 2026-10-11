import { Flipbook } from './flipbook';
import { resolveLabels } from './i18n';
import type { PdflipInit } from './types';
import { icon } from './ui/icons';
import { el } from './util/dom';

let open: { dialog: HTMLDialogElement; book: Flipbook; trigger: Element | null } | undefined;

/**
 * Opens a flip book in a modal `<dialog>`: focus is trapped inside, Escape and a click
 * on the backdrop close it, and focus returns to the element that opened it.
 */
export function openLightbox(init: PdflipInit, trigger?: Element | null): Flipbook {
  closeLightbox();
  const labels = resolveLabels(init.locale ?? 'auto', init.labels);
  const container = el('div', { class: 'pdflip-lightbox-book' });
  if (init.id) container.id = init.id;
  const close = el(
    'button',
    {
      type: 'button',
      class: 'pdflip-button pdflip-lightbox-close',
      'aria-label': labels.close,
      title: labels.close,
    },
    icon('close')
  );
  const dialog = el(
    'dialog',
    { class: 'pdflip-lightbox', 'aria-label': labels.book },
    close,
    container
  );
  document.body.append(dialog);
  const book = new Flipbook(container, { height: '100%', ...init });
  open = { dialog, book, trigger: trigger ?? document.activeElement };

  close.addEventListener('click', () => closeLightbox());
  dialog.addEventListener('close', () => closeLightbox());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeLightbox();
  });
  container.addEventListener('pdflip:close', () => closeLightbox());
  // the browser's back button closes the lightbox instead of leaving the page
  history.pushState({ pdflipLightbox: true }, '');
  window.addEventListener('popstate', onPopState);
  dialog.showModal();
  document.documentElement.classList.add('pdflip-lightbox-open');
  container.focus();
  return book;
}

function onPopState(): void {
  closeLightbox(true);
}

export function closeLightbox(fromHistory = false): void {
  const current = open;
  if (!current) return;
  open = undefined;
  window.removeEventListener('popstate', onPopState);
  const pushed = !fromHistory && history.state?.pdflipLightbox === true;
  current.book.destroy();
  if (current.dialog.open) current.dialog.close();
  current.dialog.remove();
  document.documentElement.classList.remove('pdflip-lightbox-open');
  if (pushed) {
    // drop the entry added on open; the page below keeps its own URL
    history.back();
  } else if (window.location.hash.startsWith('#pdflip-')) {
    history.replaceState(history.state, '', window.location.pathname + window.location.search);
  }
  if (current.trigger instanceof HTMLElement) current.trigger.focus();
}
