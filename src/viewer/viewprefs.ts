/**
 * Viewer preferences shared by every section of the atlas, per browser: whether selecting a structure fades the
 * others back (off: the selected structure is outlined and shown through what covers it, the rest left as it is);
 * where the legend sits on a wide screen (on the view, or in a column beside it); and whether the legend on the view
 * is minimised (a desktop's; a phone's legend starts closed regardless).
 * Stored in localStorage; without storage the defaults apply and a change lasts until the page is left.
 */
const KEY = 'atlas-view-prefs';

export type LegendPlace = 'float' | 'dock';
export interface ViewPrefs { fadeOthers: boolean; legend: LegendPlace; legendShut: boolean }

const DEFAULTS: ViewPrefs = { fadeOthers: false, legend: 'float', legendShut: false };

let prefs: ViewPrefs = load();
const listeners = new Set<(p: ViewPrefs) => void>();

/** Stored values read back, anything unknown replaced by its default. */
export function parsePrefs(raw: unknown): ViewPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    fadeOthers: r.fadeOthers === true,
    legend: r.legend === 'dock' ? 'dock' : DEFAULTS.legend,
    legendShut: r.legendShut === true,
  };
}

function load(): ViewPrefs {
  try {
    return parsePrefs(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return { ...DEFAULTS };
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
