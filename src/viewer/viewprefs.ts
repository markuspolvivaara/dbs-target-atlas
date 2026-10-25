/**
 * Viewer preferences shared by every section of the atlas, per browser: whether selecting a structure fades the
 * others back (off: the selected structure is outlined and shown through what covers it, the rest left as it is).
 * Stored in localStorage; without storage the defaults apply and a change lasts until the page is left.
 */
const KEY = 'atlas-view-prefs';

export interface ViewPrefs { fadeOthers: boolean }

let prefs: ViewPrefs = load();
const listeners = new Set<(p: ViewPrefs) => void>();

function load(): ViewPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { fadeOthers: raw?.fadeOthers === true };
  } catch {
    return { fadeOthers: false };
  }
}

export function viewPrefs(): ViewPrefs { return prefs; }

export function setViewPrefs(p: Partial<ViewPrefs>): void {
  prefs = { ...prefs, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* not remembered */ }
  listeners.forEach((f) => f(prefs));
}

/** Call f on every change; returns the unsubscribe. */
export function onViewPrefs(f: (p: ViewPrefs) => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}
