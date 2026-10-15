import { CONTENT } from '../data';
import { LEAD_ANCHORS, type LeadAnchor } from '../state';

/**
 * Per-browser preferences: which indications appear in the atlas, and where
 * the lead sits relative to each target marker.
 * Stored in localStorage; if storage is unavailable (private mode, blocked
 * site data) everything still works and simply is not remembered.
 */
const KEY = 'dbs-atlas-prefs';

/** Lead placement the user prefers: which part sits on the target, offset, spacing. */
export interface LeadPref { anchor: LeadAnchor; depth: number; spacing: 0.5 | 1.5 }
export interface Prefs { hiddenIndications: string[]; leadByTarget: Record<string, LeadPref>; leadDefault: LeadPref | null }

export const BUILTIN_LEAD: LeadPref = { anchor: 'centre', depth: 0, spacing: 0.5 };

function cleanLead(v: unknown): LeadPref | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const anchor = (LEAD_ANCHORS as string[]).includes(o.anchor as string) ? (o.anchor as LeadAnchor) : null;
  const depth = typeof o.depth === 'number' && Number.isFinite(o.depth) ? Math.max(-15, Math.min(15, o.depth)) : null;
  const spacing = o.spacing === 1.5 ? 1.5 : o.spacing === 0.5 ? 0.5 : null;
  return anchor && depth !== null && spacing ? { anchor, depth, spacing } : null;
}

let prefs: Prefs = load();
type Kind = 'indications' | 'lead';
const listeners = new Set<(kind: Kind) => void>();

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const known = new Set(CONTENT.indications.map((i) => i.id));
    const hidden = Array.isArray(raw.hiddenIndications) ? raw.hiddenIndications.filter((x: unknown) => typeof x === 'string' && known.has(x)) : [];
    const leadByTarget: Record<string, LeadPref> = {};
    for (const [k, v] of Object.entries(raw.leadByTarget ?? {})) { const c = cleanLead(v); if (c) leadByTarget[k] = c; }
    // never hide everything
    return { hiddenIndications: hidden.length >= known.size ? [] : hidden, leadByTarget, leadDefault: cleanLead(raw.leadDefault) };
  } catch {
    return { hiddenIndications: [], leadByTarget: {}, leadDefault: null };
  }
}

export function getPrefs(): Prefs { return prefs; }

export function storageAvailable(): boolean {
  try { localStorage.setItem(KEY + '-test', '1'); localStorage.removeItem(KEY + '-test'); return true; } catch { return false; }
}

export function setHidden(hidden: string[]): void {
  const all = CONTENT.indications.map((i) => i.id);
  const h = all.filter((id) => hidden.includes(id));
  if (h.length >= all.length) return; // keep at least one visible
  prefs = { ...prefs, hiddenIndications: h };
  save('indications');
}

function save(kind: Kind): void {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* not remembered */ }
  listeners.forEach((f) => f(kind));
}

/** Saved placement for a target, else the user's default, else the built-in centre-on-target. */
export function leadPrefFor(targetId: string | null): { pref: LeadPref; source: 'target' | 'default' | 'builtin' } {
  if (targetId && prefs.leadByTarget[targetId]) return { pref: prefs.leadByTarget[targetId], source: 'target' };
  if (prefs.leadDefault) return { pref: prefs.leadDefault, source: 'default' };
  return { pref: BUILTIN_LEAD, source: 'builtin' };
}

export function saveLeadPref(targetId: string, pref: LeadPref): void {
  const c = cleanLead(pref);
  if (!c) return;
  const old = prefs.leadByTarget[targetId];
  if (old && old.anchor === c.anchor && old.depth === c.depth && old.spacing === c.spacing) return;
  prefs = { ...prefs, leadByTarget: { ...prefs.leadByTarget, [targetId]: c } };
  save('lead');
}

export function clearLeadPref(targetId: string): void {
  const { [targetId]: _gone, ...rest } = prefs.leadByTarget;
  void _gone;
  prefs = { ...prefs, leadByTarget: rest };
  save('lead');
}

export function saveLeadDefault(pref: LeadPref | null): void {
  prefs = { ...prefs, leadDefault: pref ? cleanLead(pref) : null };
  save('lead');
}

export function clearAllLeadPrefs(): void {
  prefs = { ...prefs, leadByTarget: {}, leadDefault: null };
  save('lead');
}

export function onPrefsChange(f: (kind: Kind) => void): void { listeners.add(f); }

/** Indications shown in chips and keyboard cycling. A hidden current indication (e.g. from a shared link) stays listed. */
export function visibleIndications(current?: string) {
  const hidden = new Set(prefs.hiddenIndications);
  return CONTENT.indications.filter((i) => !hidden.has(i.id) || i.id === current);
}

export function isHidden(id: string): boolean { return prefs.hiddenIndications.includes(id); }
