import type { CameraPreset } from '../data/schema';
import { DEFAULT_LEAD, type Axis, type LayerKey, type V3 } from '../state';
import type { ViewState } from '../viewer/scene';

export type TractsPage = 'atlas' | 'refs' | 'credits';

/** White-matter section state; the viewer reads the ViewState part. `sel` is the tract whose card is open. */
export interface TractsState extends ViewState {
  page: TractsPage;
  /** tract group drawn in 3D (function or anatomy) */
  grp: string;
  labels: 'all' | 'hover' | 'off';
}

export const TRACT_PRESETS: CameraPreset[] = ['lateral', 'medial', 'coronal', 'axial', 'posteriorOblique'];

export function defaultTractsState(): TractsState {
  return {
    page: 'atlas', grp: 'language', hemi: 'L',
    cam: { preset: null },
    layers: {
      nuclei: { on: true, opacity: 1 },
      tracts: { on: true, opacity: 1 },
      cortex: { on: true, opacity: 1 },
      targets: { on: false, opacity: 1 },
      electrode: { on: false, opacity: 1 },
    },
    labels: 'all',
    clip: {
      axial: { on: false, mm: 10 },
      coronal: { on: false, mm: -20 },
      sagittal: { on: false, mm: -30 },
    },
    cutSide: 'none',
    sliceSeq: 't1',
    lead: { ...DEFAULT_LEAD },
    sel: null, hidden: [],
  };
}

// ---------------------------------------------------------------- URL hash
// #/atlas?g=language&sel=wm_af&h=L&c=lateral&ly=n1,t1,c1:0.50&ax=10.0&cut=L&seq=t2&lb=h
const PAGES: TractsPage[] = ['atlas', 'refs', 'credits'];
const LAYER_CODES: [LayerKey, string][] = [['nuclei', 'n'], ['tracts', 't'], ['cortex', 'c']];
const AXES: [Axis, string][] = [['axial', 'ax'], ['coronal', 'co'], ['sagittal', 'sa']];
const r1 = (n: number) => Math.round(n * 10) / 10;

export function encodeTracts(s: TractsState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('g', s.grp);
    if (s.sel) p.set('sel', s.sel);
    p.set('h', s.hemi === 'both' ? 'B' : s.hemi);
    if (s.cam.pos && s.cam.tgt) p.set('c', [...s.cam.pos, ...s.cam.tgt].map(r1).join(','));
    else if (s.cam.preset) p.set('c', s.cam.preset);
    const d = defaultTractsState();
    const ly = LAYER_CODES.map(([k, c]) => `${c}${s.layers[k].on ? 1 : 0}${s.layers[k].opacity !== 1 ? ':' + s.layers[k].opacity.toFixed(2) : ''}`).join(',');
    const dly = LAYER_CODES.map(([k, c]) => `${c}${d.layers[k].on ? 1 : 0}`).join(',');
    if (ly !== dly) p.set('ly', ly);
    if (s.labels !== 'all') p.set('lb', s.labels === 'hover' ? 'h' : '0');
    for (const [a, code] of AXES) if (s.clip[a].on) p.set(code, `${r1(s.clip[a].mm)}`);
    if (s.cutSide !== 'none') p.set('cut', s.cutSide);
    if (s.sliceSeq !== 't1') p.set('seq', s.sliceSeq);
    if (s.hidden.length) p.set('hid', s.hidden.join(','));
  }
  const q = p.toString();
  return `#/${s.page}${q ? '?' + q : ''}`;
}

/** Decode a hash. A missing `h` means "use the group's own hemisphere" and is left to the caller. */
export function decodeTracts(hash: string, base: TractsState = defaultTractsState()): { state: TractsState; hasHemi: boolean } {
  const s: TractsState = structuredClone(base);
  const m = hash.replace(/^#\/?/, '').split('?');
  s.page = PAGES.includes(m[0] as TractsPage) ? (m[0] as TractsPage) : 'atlas';
  const p = new URLSearchParams(m[1] ?? '');
  const num = (v: string | null, d: number) => (v !== null && Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
  if (p.has('g')) s.grp = p.get('g')!;
  s.sel = p.get('sel');
  const h = p.get('h');
  s.hemi = h === 'L' || h === 'R' ? h : h === 'B' ? 'both' : s.hemi;
  const c = p.get('c');
  if (c) {
    const parts = c.split(',').map(Number);
    if (parts.length === 6 && parts.every(Number.isFinite)) s.cam = { preset: null, pos: parts.slice(0, 3) as V3, tgt: parts.slice(3) as V3 };
    else if ((TRACT_PRESETS as string[]).includes(c)) s.cam = { preset: c as CameraPreset };
  }
  const ly = p.get('ly');
  if (ly) for (const tok of ly.split(',')) {
    const e = LAYER_CODES.find(([, code]) => code === tok[0]);
    if (!e) continue;
    const [on, op] = tok.slice(1).split(':');
    s.layers[e[0]] = { on: on === '1', opacity: Math.min(1, Math.max(0, num(op ?? null, 1))) };
  }
  const lb = p.get('lb');
  s.labels = lb === 'h' ? 'hover' : lb === '0' ? 'off' : 'all';
  for (const [a, code] of AXES) {
    const v = p.get(code);
    if (v !== null) s.clip[a] = { on: true, mm: num(v, s.clip[a].mm) };
  }
  const cut = p.get('cut');
  s.cutSide = cut === 'L' || cut === 'R' ? cut : 'none';
  const seq = p.get('seq');
  s.sliceSeq = seq === 't2' || seq === 'pd' ? seq : 't1';
  s.hidden = (p.get('hid') ?? '').split(',').filter((x) => /^[a-z0-9_:-]+$/.test(x));
  return { state: s, hasHemi: h !== null };
}
