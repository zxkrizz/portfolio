// Colour theme: an explicit choice (saved per visitor) wins over the system setting.
// The inline script in <head> sets data-theme before first paint; this module handles changes.

const root = document.documentElement;
const media = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

const stored = () => { try { return localStorage.getItem('theme'); } catch { return null; } };
export const isDark = () => root.dataset.theme === 'dark';

function apply(theme) {
  if (root.dataset.theme === theme) return;
  root.dataset.theme = theme;
  listeners.forEach((fn) => fn(theme));
}

export function onThemeChange(fn) { listeners.add(fn); }

export function toggleTheme() {
  const next = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('theme', next); } catch { /* private mode: still switch for this visit */ }
  apply(next);
}

// follow the OS only while the visitor has not picked a theme themselves
media.addEventListener('change', (e) => { if (!stored()) apply(e.matches ? 'dark' : 'light'); });

export function mountThemeToggle(button) {
  const label = () => {
    button.textContent = isDark() ? '☀ light' : '◐ dark';
    button.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
  };
  label();
  onThemeChange(label);
  button.addEventListener('click', toggleTheme);
}
