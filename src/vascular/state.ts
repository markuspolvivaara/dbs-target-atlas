import type { CameraPreset } from '../data/schema';
import { DEFAULT_LEAD, type V3 } from '../state';
import type { ViewState } from '../viewer/scene';
import { VA_GROUP } from './groups';
import { DSA } from './index';

export type VaPage = 'atlas' | 'sources' | 'credits';

/** The angiogram: on or off, and its time (s, from the injection). Playing is not part of the link. */
export interface Dsa { on: boolean; t: number }

/** Vascular section state; the viewer reads the ViewState part. */
export interface VaState extends ViewState {
  page: VaPage;
  grp: string;
  labels: 'all' | 'hover' | 'off';
  dsa: Dsa;
}

export const VA_PRESETS: CameraPreset[] = ['coronal', 'sagittal', 'axial', 'anterolateral', 'frontolateral'];
/** the layers: bone (nuclei), arteries (tracts), the fitted brain (cortex), the lesions (targets), veins (vessels) */
export const VA_LAYERS = ['nuclei', 'tracts', 'cortex', 'targets', 'vessels'] as const;
const CODES: [typeof VA_LAYERS[number], string][] = [['nuclei', 'b'], ['tracts', 'a'], ['cortex', 'c'], ['targets', 'l'], ['vessels', 'v']];
const DEFAULT_OPACITY = { nuclei: 1, tracts: 1, cortex: 1, targets: 1, vessels: 1 };

export function defaultVaState(): VaState {
  return {
    page: 'atlas', grp: 'normal', hemi: 'both', cam: { preset: null },
    layers: {
      nuclei: { on: true, opacity: 1 },
      tracts: { on: true, opacity: 1 },
      cortex: { on: true, opacity: 1 },
      targets: { on: true, opacity: 1 },
      electrode: { on: false, opacity: 1 },
      vessels: { on: true, opacity: 1 },
    },
    labels: 'hover',
    clip: { axial: { on: false, mm: 30 }, coronal: { on: false, mm: 0 }, sagittal: { on: false, mm: 0 } },
    cutSide: 'none', sliceSeq: 't1', lead: { ...DEFAULT_LEAD },
    sel: null, hidden: [], dsa: { on: false, t: DSA.artSpanS },
  };
}

// #/atlas?g=avm3&sel=va_avm3__nidus&h=B&c=axial&dsa=1&t=1.4&ly=b0,c40
const PAGES: VaPage[] = ['atlas', 'sources', 'credits'];
const r1 = (n: number) => Math.round(n * 10) / 10;

export function encodeVa(s: VaState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('g', s.grp);
    if (s.sel) p.set('sel', s.sel);
    p.set('h', s.hemi === 'both' ? 'B' : s.hemi);
    if (s.cam.pos && s.cam.tgt) p.set('c', [...s.cam.pos, ...s.cam.tgt].map(r1).join(','));
    else if (s.cam.preset) p.set('c', s.cam.preset);
    if (s.dsa.on) { p.set('dsa', '1'); p.set('t', String(r1(s.dsa.t))); }
    const ly = CODES.filter(([k]) => { const l = s.layers[k]!; return !l.on || l.opacity !== DEFAULT_OPACITY[k]; })
      .map(([k, c]) => { const l = s.layers[k]!; return `${c}${l.on ? Math.round(l.opacity * 100) : 0}`; });
    if (ly.length) p.set('ly', ly.join(','));
    if (s.labels !== 'hover') p.set('lb', s.labels === 'all' ? 'a' : '0');
    if (s.hidden.length) p.set('hid', s.hidden.join(','));
  }
  const q = p.toString();
  return `#/${s.page}${q ? '?' + q : ''}`;
}

/** Decode a hash; settings a link leaves out come from the defaults. */
export function decodeVa(hash: string): VaState {
  const s = defaultVaState();
  const m = hash.replace(/^#\/?/, '').split('?');
  s.page = PAGES.includes(m[0] as VaPage) ? (m[0] as VaPage) : 'atlas';
  const p = new URLSearchParams(m[1] ?? '');
  const g = VA_GROUP.get(p.get('g') ?? '');
  if (g) s.grp = g.id;
  s.sel = p.get('sel');
  const h = p.get('h');
  if (h === 'L' || h === 'R') s.hemi = h; else if (h === 'B') s.hemi = 'both';
  const c = p.get('c');
  if (c) {
    const parts = c.split(',').map(Number);
    if (parts.length === 6 && parts.every(Number.isFinite)) s.cam = { preset: null, pos: parts.slice(0, 3) as V3, tgt: parts.slice(3) as V3 };
    else if ((VA_PRESETS as string[]).includes(c)) s.cam = { preset: c as CameraPreset };
  }
  s.dsa.on = p.get('dsa') === '1';
  const t = Number(p.get('t'));
  if (p.has('t') && Number.isFinite(t)) s.dsa.t = Math.max(0, Math.min(DSA.tMaxS, t));
  for (const part of (p.get('ly') ?? '').split(',')) {
    const e = CODES.find(([, code]) => part.startsWith(code));
    const v = Number(part.slice(1));
    if (e && Number.isFinite(v)) { const l = s.layers[e[0]]!; l.on = v > 0; l.opacity = v > 0 ? Math.min(1, v / 100) : DEFAULT_OPACITY[e[0]]; }
  }
  const lb = p.get('lb');
  s.labels = lb === 'a' ? 'all' : lb === '0' ? 'off' : 'hover';
  s.hidden = (p.get('hid') ?? '').split(',').filter((x) => /^[a-z0-9_:-]+$/.test(x));
  return s;
}
