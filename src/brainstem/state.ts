import type { CameraPreset } from '../data/schema';
import { DEFAULT_LEAD, type Axis, type LayerKey, type V3 } from '../state';
import type { ViewState } from '../viewer/scene';
import { BS_GROUP } from './groups';

export type BsPage = 'atlas' | 'sources' | 'credits';

/** Brainstem section state; the viewer reads the ViewState part. */
export interface BsState extends ViewState {
  page: BsPage;
  grp: string;
  labels: 'all' | 'hover' | 'off';
}

export const BS_PRESETS: CameraPreset[] = ['coronal', 'posterior', 'sagittal', 'posteriorOblique', 'axial'];

export function defaultBsState(): BsState {
  return {
    page: 'atlas', grp: 'overview', hemi: 'both', cam: { preset: null },
    layers: {
      nuclei: { on: true, opacity: 1 },   // nuclei
      tracts: { on: true, opacity: 1 },   // nerves, arteries and tracts
      cortex: { on: true, opacity: 1 },   // the brainstem's surface
      targets: { on: true, opacity: 1 },  // safe entry zones
      electrode: { on: false, opacity: 1 },
    },
    labels: 'hover',
    clip: { axial: { on: false, mm: -30 }, coronal: { on: false, mm: -30 }, sagittal: { on: false, mm: 0 } },
    cutSide: 'none', sliceSeq: 't1', lead: { ...DEFAULT_LEAD },
    sel: null, hidden: [],
  };
}

// #/atlas?g=sez_floor&sel=sez_suprafacial&h=B&c=posterior&ly=n1,t1,c1:0.50,z1&ax=-30&cut=L&seq=t2&lb=a
const PAGES: BsPage[] = ['atlas', 'sources', 'credits'];
const LAYER_CODES: [LayerKey, string][] = [['nuclei', 'n'], ['tracts', 't'], ['cortex', 'c'], ['targets', 'z']];
const AXES: [Axis, string][] = [['axial', 'ax'], ['coronal', 'co'], ['sagittal', 'sa']];
const r1 = (n: number) => Math.round(n * 10) / 10;

export function encodeBs(s: BsState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('g', s.grp);
    if (s.sel) p.set('sel', s.sel);
    p.set('h', s.hemi === 'both' ? 'B' : s.hemi);
    if (s.cam.pos && s.cam.tgt) p.set('c', [...s.cam.pos, ...s.cam.tgt].map(r1).join(','));
    else if (s.cam.preset) p.set('c', s.cam.preset);
    const d = defaultBsState();
    const ly = LAYER_CODES.map(([k, c]) => `${c}${s.layers[k].on ? 1 : 0}${s.layers[k].opacity !== 1 ? ':' + s.layers[k].opacity.toFixed(2) : ''}`).join(',');
    if (ly !== LAYER_CODES.map(([k, c]) => `${c}${d.layers[k].on ? 1 : 0}`).join(',')) p.set('ly', ly);
    for (const [a, code] of AXES) if (s.clip[a].on) p.set(code, `${r1(s.clip[a].mm)}`);
    if (s.cutSide !== 'none') p.set('cut', s.cutSide);
    if (s.sliceSeq !== 't1') p.set('seq', s.sliceSeq);
    if (s.labels !== 'hover') p.set('lb', s.labels === 'all' ? 'a' : '0');
    if (s.hidden.length) p.set('hid', s.hidden.join(','));
  }
  const q = p.toString();
  return `#/${s.page}${q ? '?' + q : ''}`;
}

/** Decode a hash; settings a link leaves out come from the defaults. */
export function decodeBs(hash: string): BsState {
  const s = defaultBsState();
  const m = hash.replace(/^#\/?/, '').split('?');
  s.page = PAGES.includes(m[0] as BsPage) ? (m[0] as BsPage) : 'atlas';
  const p = new URLSearchParams(m[1] ?? '');
  const num = (v: string | null, d: number) => (v !== null && Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
  const g = BS_GROUP.get(p.get('g') ?? '');
  if (g) s.grp = g.id;
  s.sel = p.get('sel');
  const h = p.get('h');
  if (h === 'L' || h === 'R') s.hemi = h; else if (h === 'B') s.hemi = 'both';
  const c = p.get('c');
  if (c) {
    const parts = c.split(',').map(Number);
    if (parts.length === 6 && parts.every(Number.isFinite)) s.cam = { preset: null, pos: parts.slice(0, 3) as V3, tgt: parts.slice(3) as V3 };
    else if ((BS_PRESETS as string[]).includes(c)) s.cam = { preset: c as CameraPreset };
  }
  const ly = p.get('ly');
  if (ly) for (const tok of ly.split(',')) {
    const e = LAYER_CODES.find(([, code]) => code === tok[0]);
    if (!e) continue;
    const [on, op] = tok.slice(1).split(':');
    s.layers[e[0]] = { on: on === '1', opacity: Math.min(1, Math.max(0, num(op ?? null, 1))) };
  }
  for (const [a, code] of AXES) {
    const v = p.get(code);
    if (v !== null) s.clip[a] = { on: true, mm: num(v, s.clip[a].mm) };
  }
  const cut = p.get('cut');
  s.cutSide = cut === 'L' || cut === 'R' ? cut : 'none';
  const seq = p.get('seq');
  s.sliceSeq = seq === 't2' || seq === 'pd' ? seq : 't1';
  const lb = p.get('lb');
  s.labels = lb === 'a' ? 'all' : lb === '0' ? 'off' : 'hover';
  s.hidden = (p.get('hid') ?? '').split(',').filter((x) => /^[a-z0-9_:-]+$/.test(x));
  return s;
}
