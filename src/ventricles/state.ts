import type { CameraPreset } from '../data/schema';
import { DEFAULT_LEAD, type V3 } from '../state';
import type { ViewState } from '../viewer/scene';
import { VE_GROUP } from './groups';
import { TARGETS, TRAJ, type Target } from './index';

export type VePage = 'atlas' | 'sources' | 'credits';

/** The catheter: the side, how Kocher's point is found (Chen's 25 mm or Park's 30 mm from the midline), the entry moved
 * back or forward from it (mm), and the aim. */
export interface Catheter { side: 'L' | 'R'; kocher: 'chen' | 'park'; offset: number; target: Target }

/** Ventricles section state; the viewer reads the ViewState part. */
export interface VeState extends ViewState {
  page: VePage;
  grp: string;
  labels: 'all' | 'hover' | 'off';
  cath: Catheter;
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
  const lb = p.get('lb');
  s.labels = lb === 'a' ? 'all' : lb === '0' ? 'off' : 'hover';
  s.hidden = (p.get('hid') ?? '').split(',').filter((x) => /^[a-z0-9_:-]+$/.test(x));
  return s;
}
