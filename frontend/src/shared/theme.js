export const THEME_KEY = 'fiona-theme';

// No stored choice means "follow the device"; the CSS then uses prefers-color-scheme.
export function readStoredTheme() {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export function effectiveTheme() {
  return readStoredTheme()
    || (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
}

export function toggleTheme() {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  try {
    window.localStorage.setItem(THEME_KEY, next);
  } catch {
    // The choice still applies to this page.
  }
  applyTheme(next);
  return next;
}
