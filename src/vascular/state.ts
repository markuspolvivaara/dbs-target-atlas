import type { CameraPreset } from '../data/schema';
import { DEFAULT_LEAD } from '../state';
import type { ViewState } from '../viewer/scene';
import { decodeOpacity, encodeOpacity } from '../viewer/scene';
import { decodeCamera, decodeMeasure, encodeMeasure, decodeHemi, decodeHidden, encodeCamera, encodeHemi, encodeHidden, hashOf, r1, readHash } from '../viewlink';
import { VA_GROUP } from './groups';
import { DSA, TREATMENTS } from './index';
import { defaultLabels, labelsFrom, labelsParam } from '../labels';

export type VaPage = 'atlas' | 'grading' | 'sources' | 'credits';

/** The angiogram: on or off, and its time (s, from the injection). Playing is not part of the link. */
export interface Dsa { on: boolean; t: number }

/** Vascular section state; the viewer reads the ViewState part. */
export interface VaState extends ViewState {
  page: VaPage;
  grp: string;
  labels: 'all' | 'hover' | 'off';
  dsa: Dsa;
  /** the aneurysm treatment shown in the Aneurysms view ('' none) */
  treat: string;
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
    labels: defaultLabels(),
    clip: { axial: { on: false, mm: 30 }, coronal: { on: false, mm: 0 }, sagittal: { on: false, mm: 0 } },
    cutSide: 'none', sliceSeq: 't1', lead: { ...DEFAULT_LEAD },
    sel: null, hidden: [], dsa: { on: false, t: DSA.artSpanS }, treat: '',
  };
}

// #/atlas?g=avm3&sel=va_avm3__nidus&h=B&c=axial&dsa=1&t=1.4&ly=b0,c40
const PAGES: VaPage[] = ['atlas', 'grading', 'sources', 'credits'];

export function encodeVa(s: VaState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('g', s.grp);
    if (s.sel) p.set('sel', s.sel);
    encodeHemi(p, s.hemi);
    encodeCamera(p, s.cam);
    if (s.dsa.on) { p.set('dsa', '1'); p.set('t', String(r1(s.dsa.t))); }
    if (s.treat) p.set('tr', s.treat);
    const ly = CODES.filter(([k]) => { const l = s.layers[k]!; return !l.on || l.opacity !== DEFAULT_OPACITY[k]; })
      .map(([k, c]) => { const l = s.layers[k]!; return `${c}${l.on ? Math.round(l.opacity * 100) : 0}`; });
    if (ly.length) p.set('ly', ly.join(','));
    { const lbv = labelsParam(s.labels); if (lbv) p.set('lb', lbv); }
    encodeHidden(p, s.hidden);
    encodeOpacity(p, s.opacity);
    encodeMeasure(p, s.measured);
  }
  return hashOf(s.page, p);
}

/** Decode a hash; settings a link leaves out come from the defaults. */
export function decodeVa(hash: string): VaState {
  const s = defaultVaState();
  const { page, p } = readHash(hash, PAGES);
  s.page = page;
  const g = VA_GROUP.get(p.get('g') ?? '');
  if (g) s.grp = g.id;
  s.sel = p.get('sel');
  decodeHemi(p, s);
  decodeCamera(p, s, VA_PRESETS);
  s.dsa.on = p.get('dsa') === '1';
  const tr = p.get('tr') ?? '';
  s.treat = TREATMENTS.some((x) => x.id === tr) ? tr : '';
  const t = Number(p.get('t'));
  if (p.has('t') && Number.isFinite(t)) s.dsa.t = Math.max(0, Math.min(DSA.tMaxS, t));
  for (const part of (p.get('ly') ?? '').split(',')) {
    const e = CODES.find(([, code]) => part.startsWith(code));
    const v = Number(part.slice(1));
    if (e && Number.isFinite(v)) { const l = s.layers[e[0]]!; l.on = v > 0; l.opacity = v > 0 ? Math.min(1, v / 100) : DEFAULT_OPACITY[e[0]]; }
  }
  const lb = p.get('lb');
  s.labels = labelsFrom(lb);
  s.hidden = decodeHidden(p);
  decodeOpacity(p, s);
  decodeMeasure(p, s);
  return s;
}
