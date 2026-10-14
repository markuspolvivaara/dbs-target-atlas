import palette from '../data/palette.json';

export type ThemePref = 'system' | 'light' | 'dark';
type Pal = Record<string, string>;
const P = palette as unknown as { light: Pal; dark: Pal };

const KEY = 'dbs-atlas-theme';

export function storedTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function storeTheme(t: ThemePref): void {
  try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* storage unavailable */ }
}

export function resolvedTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(pref: ThemePref): 'light' | 'dark' {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  return resolvedTheme(pref);
}

export function paletteFor(t: 'light' | 'dark'): Pal { return P[t]; }

/** Inject the structure palette as CSS custom properties (--c-stn ...), both themes. */
export function injectPaletteCss(): void {
  const decl = (pal: Pal) => Object.entries(pal).map(([k, v]) => `--c-${k}:${v};`).join('');
  const css = `:root{${decl(P.light)}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${decl(P.dark)}}}
:root[data-theme="dark"]{${decl(P.dark)}}`;
  const s = document.createElement('style');
  s.id = 'palette-vars';
  s.textContent = css;
  document.head.append(s);
}

/** Viewer background + ghost colour per theme (must match --viewer-bg in styles.css). */
export const VIEWER = {
  light: { bg: '#E4E9EE', ghost: '#8C98A5' },
  dark: { bg: '#0C141C', ghost: '#5B6876' },
};
