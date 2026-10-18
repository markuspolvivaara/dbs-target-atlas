import type { CameraPreset } from './data/schema';
import type { ViewState } from './viewer/scene';

export type Page = 'atlas' | 'imaging' | 'coords' | 'refs' | 'credits' | 'settings';
export type Hemi = 'L' | 'R' | 'both';
export type LayerKey = 'nuclei' | 'tracts' | 'cortex' | 'targets' | 'electrode';
/** Extra layers only the spine section has (other sections leave them out; missing = shown). */
export type ExtraLayerKey = 'discs' | 'vessels' | 'viscera';
export type Axis = 'axial' | 'coronal' | 'sagittal';
export type V3 = [number, number, number];
/** MRI sequence drawn on the slice planes (ICBM 2009b templates). */
export type SliceSeq = 't1' | 't2' | 'pd';
/** Which part of the lead sits on the target marker. */
export type LeadAnchor = 'centre' | 'tip' | 'c0' | 'c1' | 'c2' | 'c3';
export const LEAD_ANCHORS: LeadAnchor[] = ['centre', 'c0', 'c1', 'c2', 'c3', 'tip'];

export interface Layer { on: boolean; opacity: number }
export interface Clip { on: boolean; mm: number }

/** DBS section state; the viewer reads the ViewState part. */
export interface AppState extends ViewState {
  page: Page;
  ind: string;
  sym: string | null;
  hemi: Hemi;
  /** camera: preset name, or explicit RAS position + look-at target */
  cam: { preset: CameraPreset | null; pos?: V3; tgt?: V3 };
  layers: Record<LayerKey, Layer>;
  borders: boolean;
  /** The subthalamic nucleus drawn as its three functional zones, or as one nucleus. */
  stn: 'zones' | 'whole';
  /** Name labels in 3D: always, only for the hovered / selected item, or never. */
  labels: 'all' | 'hover' | 'off';
  clip: Record<Axis, Clip>;
  /** Cut away the patient's left or right half of everything (structures, tracts, cortex, lead, slices) at the midline. */
  cutSide: 'none' | 'L' | 'R';
  sliceSeq: SliceSeq;
  lead: { spacing: 0.5 | 1.5; anchor: LeadAnchor; depth: number; ring: number; tilt: number; stim: boolean; contact: number; radius: number };
  /** Selected structure or marker: its card opens and it is highlighted in 3D. */
  sel: string | null;
  /** Structures / markers switched off from the legend for the current view. */
  hidden: string[];
  img: string;
  theme: 'system' | 'light' | 'dark';
}

export const DEFAULT_LEAD = { spacing: 0.5 as const, anchor: 'centre' as LeadAnchor, depth: 0, ring: 60, tilt: 15, stim: false, contact: 1, radius: 2 };

export function defaultState(): AppState {
  return {
    page: 'atlas', ind: 'pd', sym: null, hemi: 'both',
    cam: { preset: null },
    layers: {
      nuclei: { on: true, opacity: 1 },
      tracts: { on: true, opacity: 1 },
      cortex: { on: true, opacity: 1 },
      targets: { on: true, opacity: 1 },
      electrode: { on: false, opacity: 1 },
    },
    borders: true,
    stn: 'zones',
    labels: 'hover',
    clip: {
      axial: { on: false, mm: -4 },
      coronal: { on: false, mm: -13 },
      sagittal: { on: false, mm: -12 },
    },
    cutSide: 'none',
    sliceSeq: 't1',
    lead: { ...DEFAULT_LEAD },
    sel: null, hidden: [], img: 'stn', theme: 'system',
  };
}

// ---------------------------------------------------------------- URL hash
// #/atlas?i=pd&s=pd-tremor&h=L&c=coronal&ly=n1.00,t1.00,c0.50,g1.00,e0&ax=-4.0c ...
/** Preset names used before 'anterior/lateral/superior' became 'coronal/sagittal/axial'. */
const LEGACY_PRESETS: Record<string, CameraPreset> = { anterior: 'coronal', lateral: 'sagittal', superior: 'axial' };
const PAGES: Page[] = ['atlas', 'imaging', 'coords', 'refs', 'credits', 'settings'];
const LAYER_CODES: [LayerKey, string][] = [['nuclei', 'n'], ['tracts', 't'], ['cortex', 'c'], ['targets', 'g'], ['electrode', 'e']];
const AXES: [Axis, string][] = [['axial', 'ax'], ['coronal', 'co'], ['sagittal', 'sa']];
const r1 = (n: number) => Math.round(n * 10) / 10;

export function encode(s: AppState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('i', s.ind);
    if (s.sym) p.set('s', s.sym);
    if (s.hemi !== 'both') p.set('h', s.hemi);
    if (s.cam.pos && s.cam.tgt) p.set('c', [...s.cam.pos, ...s.cam.tgt].map(r1).join(','));
    else if (s.cam.preset) p.set('c', s.cam.preset);
    const d = defaultState();
    const ly = LAYER_CODES.map(([k, c]) => `${c}${s.layers[k].on ? 1 : 0}${s.layers[k].opacity !== 1 ? ':' + s.layers[k].opacity.toFixed(2) : ''}`).join(',');
    const dly = LAYER_CODES.map(([k, c]) => `${c}${d.layers[k].on ? 1 : 0}`).join(',');
    if (ly !== dly) p.set('ly', ly);
    if (!s.borders) p.set('b', '0');
    if (s.stn === 'whole') p.set('stn', 'w');
    if (s.labels !== 'hover') p.set('lb', s.labels === 'all' ? 'a' : '0');
    for (const [a, code] of AXES) {
      const c = s.clip[a];
      if (c.on) p.set(code, `${r1(c.mm)}`);
    }
    if (s.cutSide !== 'none') p.set('cut', s.cutSide);
    if (s.sliceSeq !== 't1') p.set('seq', s.sliceSeq);
    if (s.layers.electrode.on) {
      const l = s.lead;
      p.set('lead', [l.spacing, r1(l.depth), l.ring, l.tilt, ...(l.anchor !== 'centre' ? [l.anchor] : [])].join(','));
      if (l.stim) p.set('stim', [l.contact, r1(l.radius)].join(','));
    }
    if (s.sel) p.set('sel', s.sel);
    if (s.hidden.length) p.set('hid', s.hidden.join(','));
  } else if (s.page === 'imaging') {
    p.set('t', s.img);
  }
  const q = p.toString();
  return `#/${s.page}${q ? '?' + q : ''}`;
}

export function decode(hash: string, base: AppState = defaultState()): AppState {
  const s: AppState = structuredClone(base);
  const m = hash.replace(/^#\/?/, '').split('?');
  const page = m[0] as Page;
  s.page = PAGES.includes(page) ? page : 'atlas';
  const p = new URLSearchParams(m[1] ?? '');
  const num = (v: string | null, d: number) => (v !== null && Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
  if (p.has('i')) s.ind = p.get('i')!;
  s.sym = p.get('s');
  const h = p.get('h');
  s.hemi = h === 'L' || h === 'R' ? h : 'both';
  const c = p.get('c');
  if (c) {
    const parts = c.split(',').map(Number);
    if (parts.length === 6 && parts.every(Number.isFinite)) s.cam = { preset: null, pos: parts.slice(0, 3) as V3, tgt: parts.slice(3) as V3 };
    else if (['coronal', 'sagittal', 'axial', 'posteriorOblique', 'surgeon'].includes(c)) s.cam = { preset: c as CameraPreset };
    else if (c in LEGACY_PRESETS) s.cam = { preset: LEGACY_PRESETS[c] }; // links shared before the rename
  }
  const ly = p.get('ly');
  if (ly) for (const tok of ly.split(',')) {
    const e = LAYER_CODES.find(([, code]) => code === tok[0]);
    if (!e) continue;
    const [on, op] = tok.slice(1).split(':');
    s.layers[e[0]] = { on: on === '1', opacity: Math.min(1, Math.max(0, num(op ?? null, 1))) };
  }
  s.borders = p.get('b') !== '0';
  s.stn = p.get('stn') === 'w' ? 'whole' : 'zones';
  const cut = p.get('cut');
  s.cutSide = cut === 'L' || cut === 'R' ? cut : 'none';
  const seq = p.get('seq');
  s.sliceSeq = seq === 't2' || seq === 'pd' ? seq : 't1';
  const lb = p.get('lb');
  s.labels = lb === 'a' ? 'all' : lb === '0' ? 'off' : 'hover';
  for (const [a, code] of AXES) {
    const v = p.get(code);
    // older links may carry per-plane cut flags ('c', 'f'); those cuts are no longer offered and are ignored
    if (v !== null) s.clip[a] = { on: true, mm: num(v, s.clip[a].mm) };
  }
  const lead = p.get('lead');
  if (lead) {
    const parts = lead.split(',');
    const [sp, d, ring, tilt] = parts.map(Number);
    const anchor = (LEAD_ANCHORS as string[]).includes(parts[4]) ? (parts[4] as LeadAnchor) : 'centre';
    s.layers.electrode.on = true;
    s.lead = { ...s.lead, spacing: sp === 1.5 ? 1.5 : 0.5, anchor, depth: num(String(d), 0), ring: num(String(ring), 60), tilt: num(String(tilt), 15) };
  }
  const stim = p.get('stim');
  if (stim) {
    const [k, r] = stim.split(',').map(Number);
    s.lead.stim = true;
    s.lead.contact = Math.min(3, Math.max(0, Math.round(num(String(k), 1))));
    s.lead.radius = Math.min(6, Math.max(0.5, num(String(r), 2)));
  }
  s.sel = p.get('sel');
  s.hidden = (p.get('hid') ?? '').split(',').filter((x) => /^[a-z0-9_:-]+$/.test(x));
  if (p.has('t')) s.img = p.get('t')!;
  return s;
}
