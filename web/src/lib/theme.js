import { isNightNow } from '../garden/index.js';

// ── theme ───────────────────────────────────────────────────────────
export const THEMES = ['auto', 'day', 'night'];
export function getTheme() {
  try {
    return localStorage.getItem('ustudy.theme') ?? 'auto';
  } catch {
    return 'auto';
  }
}
export function setTheme(theme) {
  try {
    if (theme === 'auto') localStorage.removeItem('ustudy.theme');
    else localStorage.setItem('ustudy.theme', theme);
  } catch {
    /* not persisted; still applies for this page */
  }
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  window.dispatchEvent(new CustomEvent('ustudy:theme', { detail: theme }));
}
/** The garden is night when the person chose night, or (on auto) when it's actually night out. */
export function gardenNight() {
  const t = getTheme();
  return t === 'night' ? true : t === 'day' ? false : isNightNow();
}

