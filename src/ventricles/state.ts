import type { CameraPreset } from '../data/schema';
import { DEFAULT_LEAD, type V3 } from '../state';
import type { ViewState } from '../viewer/scene';
import { VE_GROUP } from './groups';
import { ETV, TARGETS, TRAJ, type Target } from './index';

export type VePage = 'atlas' | 'sources' | 'credits';

/** The catheter: the side, how Kocher's point is found (Chen's 25 mm or Park's 30 mm from the midline), the entry moved
 * back or forward from it (mm), and the aim. */
export interface Catheter { side: 'L' | 'R'; kocher: 'chen' | 'park'; offset: number; target: Target }

/** The endoscope: the side of its burr hole, how deep its tip is (mm from the outer table along the shaft), its tilt
 * from Sousa's line (degrees: forwards, and towards the midline), and whether its view is the big one. */
export interface Scope { side: 'L' | 'R'; depth: number; ap: number; ml: number; big: boolean }
export const SCOPE_TILT_MAX = 20;

/** Sousa's line for a side, with the ventricles at this much of the hydrocephalus shape (0 to 1): its ends move with
 * the walls (the line between the shapes taken as straight) */
export function etvLine(side: 'L' | 'R', hydro: number) {
  const a = ETV.trajectories[side], b = ETV.hydrocephalus.trajectories[side];
  const mix = (x: readonly number[], y: readonly number[]) => x.map((v, i) => v + (y[i] - v) * hydro) as [number, number, number];
  const lerp = (x: number, y: number) => x + (y - x) * hydro;
  return { entry: mix(a.entry, b.entry), target: mix(a.target, b.target), monro: mix(a.monro, b.monro),
    depthMm: lerp(a.depthMm, b.depthMm), depthToMonroMm: lerp(a.depthToMonroMm, b.depthToMonroMm) };
}

/** the default depth: the tip in the third ventricle, a little more than halfway from the foramen of Monro to the floor */
export function defaultScopeDepth(side: 'L' | 'R', hydro = 0): number {
  const t = etvLine(side, hydro);
  return Math.round(t.depthToMonroMm + 0.6 * (t.depthMm - t.depthToMonroMm));
}
export const scopeMaxDepth = (side: 'L' | 'R') => Math.ceil(Math.max(ETV.trajectories[side].depthMm, ETV.hydrocephalus.trajectories[side].depthMm) + 10);

/** Ventricles section state; the viewer reads the ViewState part. */
export interface VeState extends ViewState {
  page: VePage;
  grp: string;
  labels: 'all' | 'hover' | 'off';
  cath: Catheter;
  scope: Scope;
  /** the shapes drawn: hydrocephalus (0 to 1: this patient's ventricles to the hydrocephalic ones) */
  morphs: Record<string, number>;
}

export const VE_PRESETS: CameraPreset[] = ['coronal', 'sagittal', 'axial', 'anterolateral', 'frontolateral'];
export const DEFAULT_CATHETER: Catheter = { side: 'R', kocher: 'chen', offset: 0, target: 'CMC' };

export function defaultVeState(): VeState {
  return {
    page: 'atlas', grp: 'ventricles', hemi: 'both', cam: { preset: null },
    layers: {
      nuclei: { on: true, opacity: 1 },   // the ventricles
      tracts: { on: true, opacity: 1 },
      cortex: { on: true, opacity: 1 },   // the fitted brain
      targets: { on: true, opacity: 1 },  // landmarks
      electrode: { on: false, opacity: 1 },
    },
    labels: 'hover',
    clip: { axial: { on: false, mm: 30 }, coronal: { on: false, mm: 0 }, sagittal: { on: false, mm: 0 } },
    cutSide: 'none', sliceSeq: 't1', lead: { ...DEFAULT_LEAD },
    sel: null, hidden: [], cath: { ...DEFAULT_CATHETER },
    scope: { side: 'R', depth: defaultScopeDepth('R'), ap: 0, ml: 0, big: true }, morphs: {},
  };
}

// #/atlas?g=evd&sel=ve_lateral_ventricle&h=B&c=coronal&cs=R&ck=chen&co=0&ct=CMC&lb=a
const PAGES: VePage[] = ['atlas', 'sources', 'credits'];
const r1 = (n: number) => Math.round(n * 10) / 10;

export function encodeVe(s: VeState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('g', s.grp);
    if (s.sel) p.set('sel', s.sel);
    p.set('h', s.hemi === 'both' ? 'B' : s.hemi);
    if (s.cam.pos && s.cam.tgt) p.set('c', [...s.cam.pos, ...s.cam.tgt].map(r1).join(','));
    else if (s.cam.preset) p.set('c', s.cam.preset);
    if (VE_GROUP.get(s.grp)?.catheter) {
      const c = s.cath;
      if (c.side !== DEFAULT_CATHETER.side) p.set('cs', c.side);
      if (c.kocher !== DEFAULT_CATHETER.kocher) p.set('ck', c.kocher);
      if (c.offset !== DEFAULT_CATHETER.offset) p.set('co', String(c.offset));
      if (c.target !== DEFAULT_CATHETER.target) p.set('ct', c.target);
    }
    if ((s.morphs.hydrocephalus ?? 0) > 0) p.set('hy', String(Math.round(s.morphs.hydrocephalus * 100)));
    if (VE_GROUP.get(s.grp)?.endoscope) {
      const e = s.scope;
      if (e.side !== 'R') p.set('es', e.side);
      if (e.depth !== defaultScopeDepth(e.side, s.morphs.hydrocephalus ?? 0)) p.set('ed', String(e.depth));
      if (e.ap || e.ml) p.set('ea', `${e.ap},${e.ml}`);
      if (!e.big) p.set('ev', '3d');
    }
    if (s.labels !== 'hover') p.set('lb', s.labels === 'all' ? 'a' : '0');
    if (s.hidden.length) p.set('hid', s.hidden.join(','));
  }
  const q = p.toString();
  return `#/${s.page}${q ? '?' + q : ''}`;
}

/** Decode a hash; settings a link leaves out come from the defaults. */
export function decodeVe(hash: string): VeState {
  const s = defaultVeState();
  const m = hash.replace(/^#\/?/, '').split('?');
  s.page = PAGES.includes(m[0] as VePage) ? (m[0] as VePage) : 'atlas';
  const p = new URLSearchParams(m[1] ?? '');
  const g = VE_GROUP.get(p.get('g') ?? '');
  if (g) s.grp = g.id;
  s.sel = p.get('sel');
  const h = p.get('h');
  if (h === 'L' || h === 'R') s.hemi = h; else if (h === 'B') s.hemi = 'both';
  const c = p.get('c');
  if (c) {
    const parts = c.split(',').map(Number);
    if (parts.length === 6 && parts.every(Number.isFinite)) s.cam = { preset: null, pos: parts.slice(0, 3) as V3, tgt: parts.slice(3) as V3 };
    else if ((VE_PRESETS as string[]).includes(c)) s.cam = { preset: c as CameraPreset };
  }
  const cs = p.get('cs');
  if (cs === 'L' || cs === 'R') s.cath.side = cs;
  const ck = p.get('ck');
  if (ck === 'chen' || ck === 'park') s.cath.kocher = ck;
  const co = Number(p.get('co'));
  if (p.has('co') && TRAJ.params.apOffsets.includes(co)) s.cath.offset = co;
  const ct = p.get('ct');
  if ((TARGETS as readonly string[]).includes(ct ?? '')) s.cath.target = ct as Target;
  const hy = Number(p.get('hy'));
  if (p.has('hy') && Number.isFinite(hy) && hy > 0 && !VE_GROUP.get(s.grp)?.catheter) s.morphs.hydrocephalus = Math.min(1, hy / 100);
  const es = p.get('es');
  if (es === 'L' || es === 'R') s.scope.side = es;
  s.scope.depth = defaultScopeDepth(s.scope.side, s.morphs.hydrocephalus ?? 0);
  const ed = Number(p.get('ed'));
  if (p.has('ed') && Number.isFinite(ed)) s.scope.depth = Math.max(0, Math.min(scopeMaxDepth(s.scope.side), Math.round(ed * 2) / 2));
  const ea = (p.get('ea') ?? '').split(',').map(Number);
  if (ea.length === 2 && ea.every(Number.isFinite)) [s.scope.ap, s.scope.ml] = ea.map((x) => Math.max(-SCOPE_TILT_MAX, Math.min(SCOPE_TILT_MAX, Math.round(x * 2) / 2)));
  s.scope.big = p.get('ev') !== '3d';
  const lb = p.get('lb');
  s.labels = lb === 'a' ? 'all' : lb === '0' ? 'off' : 'hover';
  s.hidden = (p.get('hid') ?? '').split(',').filter((x) => /^[a-z0-9_:-]+$/.test(x));
  return s;
}
