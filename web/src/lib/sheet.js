/**
 * A side sheet for create/edit forms: traps focus while open, closes on
 * Escape, backdrop click or any [data-close], and gives focus back.
 */
export function createSheet(root) {
  let returnTo = null;
  const body = root.querySelector('.sheet-body');

  const focusables = () =>
    [...body.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.disabled && !el.hidden && el.offsetParent !== null,
    );

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function open() {
    returnTo = document.activeElement;
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => (body.querySelector('[autofocus]') ?? focusables().find((el) => el.matches('input, textarea, select')))?.focus());
  }

  function close() {
    root.hidden = true;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    returnTo?.focus?.();
  }

  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('[data-close]')) close();
  });

  return { open, close, get isOpen() { return !root.hidden; } };
}
