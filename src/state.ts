import type { CameraPreset } from './data/schema';
import type { ViewState } from './viewer/scene';
import { decodeOpacity, encodeOpacity } from './viewer/scene';
import { defaultLabels, labelsFrom, labelsParam } from './labels';
import { decodeCamera, decodeMeasure, encodeMeasure, decodeClip, decodeHidden, decodeLayers, encodeCamera, encodeClip, encodeHidden, encodeLayers, hashOf, r1, readHash } from './viewlink';

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
    // (the STN drawn whole unless its functional zones are asked for: the owner's choice, 2026-11-15)
    stn: 'whole',
    labels: defaultLabels(),
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

export function encode(s: AppState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('i', s.ind);
    if (s.sym) p.set('s', s.sym);
    if (s.hemi !== 'both') p.set('h', s.hemi);
    encodeCamera(p, s.cam);
    encodeLayers(p, s.layers, defaultState().layers, LAYER_CODES);
    if (!s.borders) p.set('b', '0');
    if (s.stn === 'zones') p.set('stn', 'z');
    { const lbv = labelsParam(s.labels); if (lbv) p.set('lb', lbv); }
    encodeClip(p, s.clip);
    if (s.cutSide !== 'none') p.set('cut', s.cutSide);
    if (s.sliceSeq !== 't1') p.set('seq', s.sliceSeq);
    if (s.layers.electrode.on) {
      const l = s.lead;
      p.set('lead', [l.spacing, r1(l.depth), l.ring, l.tilt, ...(l.anchor !== 'centre' ? [l.anchor] : [])].join(','));
      if (l.stim) p.set('stim', [l.contact, r1(l.radius)].join(','));
    }
    if (s.sel) p.set('sel', s.sel);
    encodeHidden(p, s.hidden);
    encodeOpacity(p, s.opacity);
    encodeMeasure(p, s.measured);
  } else if (s.page === 'imaging') {
    p.set('t', s.img);
  }
  return hashOf(s.page, p);
}

export function decode(hash: string, base: AppState = defaultState()): AppState {
  const s: AppState = structuredClone(base);
  const { page, p } = readHash(hash, PAGES);
  s.page = page;
  const num = (v: string | null, d: number) => (v !== null && Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
  if (p.has('i')) s.ind = p.get('i')!;
  s.sym = p.get('s');
  const h = p.get('h');
  s.hemi = h === 'L' || h === 'R' ? h : 'both';
  decodeCamera(p, s, ['coronal', 'sagittal', 'axial', 'posteriorOblique', 'surgeon']);
  const c = p.get('c');
  if (c && Object.hasOwn(LEGACY_PRESETS, c)) s.cam = { preset: LEGACY_PRESETS[c] }; // links shared before the rename
  decodeLayers(p, s.layers, LAYER_CODES);
  s.borders = p.get('b') !== '0';
  // ('w', for whole, is what links wrote while the zones were the default)
  s.stn = p.get('stn') === 'z' ? 'zones' : 'whole';
  const cut = p.get('cut');
  s.cutSide = cut === 'L' || cut === 'R' ? cut : 'none';
  const seq = p.get('seq');
  s.sliceSeq = seq === 't2' || seq === 'pd' ? seq : 't1';
  const lb = p.get('lb');
  s.labels = labelsFrom(lb);
  // (older links may carry per-plane cut flags ('c', 'f'); those cuts are no longer offered and are ignored)
  decodeClip(p, s.clip);
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
  s.hidden = decodeHidden(p);
  decodeOpacity(p, s);
  decodeMeasure(p, s);
  if (p.has('t')) s.img = p.get('t')!;
  return s;
}
