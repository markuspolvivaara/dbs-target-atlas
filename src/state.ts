import type { CameraPreset } from './data/schema';

export type Page = 'atlas' | 'imaging' | 'coords' | 'refs' | 'credits';
export type Hemi = 'L' | 'R' | 'both';
export type LayerKey = 'nuclei' | 'tracts' | 'cortex' | 'targets' | 'electrode';
export type Axis = 'axial' | 'coronal' | 'sagittal';
export type V3 = [number, number, number];

export interface Layer { on: boolean; opacity: number }
export interface Clip { on: boolean; mm: number; cut: boolean; flip: boolean }

export interface AppState {
  page: Page;
  ind: string;
  sym: string | null;
  hemi: Hemi;
  /** camera: preset name, or explicit RAS position + look-at target */
  cam: { preset: CameraPreset | null; pos?: V3; tgt?: V3 };
  layers: Record<LayerKey, Layer>;
  borders: boolean;
  labels: boolean;
  clip: Record<Axis, Clip>;
  lead: { spacing: 0.5 | 1.5; depth: number; ring: number; tilt: number; stim: boolean; contact: number; radius: number };
  sel: string | null;
  img: string;
  theme: 'system' | 'light' | 'dark';
}

export const DEFAULT_LEAD = { spacing: 0.5 as const, depth: 0, ring: 60, tilt: 15, stim: false, contact: 1, radius: 2 };

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
    labels: true,
    clip: {
      axial: { on: false, mm: -4, cut: false, flip: false },
      coronal: { on: false, mm: -13, cut: false, flip: false },
      sagittal: { on: false, mm: -12, cut: false, flip: false },
    },
    lead: { ...DEFAULT_LEAD },
    sel: null, img: 'stn', theme: 'system',
  };
}

// ---------------------------------------------------------------- URL hash
// #/atlas?i=pd&s=pd-tremor&h=L&c=anterior&ly=n1.00,t1.00,c0.50,g1.00,e0&ax=-4.0c ...
const PAGES: Page[] = ['atlas', 'imaging', 'coords', 'refs', 'credits'];
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
    if (!s.labels) p.set('lb', '0');
    for (const [a, code] of AXES) {
      const c = s.clip[a];
      if (c.on) p.set(code, `${r1(c.mm)}${c.cut ? 'c' : ''}${c.flip ? 'f' : ''}`);
    }
    if (s.layers.electrode.on) {
      const l = s.lead;
      p.set('lead', [l.spacing, r1(l.depth), l.ring, l.tilt].join(','));
      if (l.stim) p.set('stim', [l.contact, r1(l.radius)].join(','));
    }
    if (s.sel) p.set('sel', s.sel);
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
    else if (['anterior', 'lateral', 'superior', 'posteriorOblique', 'surgeon'].includes(c)) s.cam = { preset: c as CameraPreset };
  }
  const ly = p.get('ly');
  if (ly) for (const tok of ly.split(',')) {
    const e = LAYER_CODES.find(([, code]) => code === tok[0]);
    if (!e) continue;
    const [on, op] = tok.slice(1).split(':');
    s.layers[e[0]] = { on: on === '1', opacity: Math.min(1, Math.max(0, num(op ?? null, 1))) };
  }
  s.borders = p.get('b') !== '0';
  s.labels = p.get('lb') !== '0';
  for (const [a, code] of AXES) {
    const v = p.get(code);
    if (v !== null) s.clip[a] = { on: true, mm: num(v, s.clip[a].mm), cut: v.includes('c'), flip: v.includes('f') };
  }
  const lead = p.get('lead');
  if (lead) {
    const [sp, d, ring, tilt] = lead.split(',').map(Number);
    s.layers.electrode.on = true;
    s.lead = { ...s.lead, spacing: sp === 1.5 ? 1.5 : 0.5, depth: num(String(d), 0), ring: num(String(ring), 60), tilt: num(String(tilt), 15) };
  }
  const stim = p.get('stim');
  if (stim) {
    const [k, r] = stim.split(',').map(Number);
    s.lead.stim = true;
    s.lead.contact = Math.min(3, Math.max(0, Math.round(num(String(k), 1))));
    s.lead.radius = Math.min(6, Math.max(0.5, num(String(r), 2)));
  }
  s.sel = p.get('sel');
  if (p.has('t')) s.img = p.get('t')!;
  return s;
}
