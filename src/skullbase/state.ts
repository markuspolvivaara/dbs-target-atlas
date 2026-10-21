import type { CameraPreset } from '../data/schema';
import { DEFAULT_LEAD, type LayerKey, type V3 } from '../state';
import type { ViewState } from '../viewer/scene';
import { combinedCut, DEFAULT_GROUP, SB_GROUP } from './groups';

export type SkullPage = 'atlas' | 'sources' | 'credits';

/** Skull-base section state; the viewer reads the ViewState part (including cutAbove). */
export interface SkullState extends ViewState {
  page: SkullPage;
  grp: string;
  /** other systems shown together with grp (a system); in the URL as with=id,id */
  also: string[];
  labels: 'all' | 'hover' | 'off';
  cutAbove: number | null;
}

export const SKULL_PRESETS: CameraPreset[] = ['axial', 'inferior', 'lateral', 'coronal', 'posteriorOblique'];

export function defaultSkullState(): SkullState {
  const g = SB_GROUP.get(DEFAULT_GROUP)!;
  return {
    page: 'atlas', grp: g.id, also: [], hemi: 'both', cam: { preset: null },
    layers: {
      nuclei: { on: true, opacity: 1 },   // bones
      tracts: { on: true, opacity: 1 },   // vessels and nerves
      cortex: { on: true, opacity: 1 },   // soft tissue
      targets: { on: true, opacity: 1 },  // landmarks
      electrode: { on: false, opacity: 1 },
    },
    labels: 'hover',
    clip: { axial: { on: false, mm: 0 }, coronal: { on: false, mm: 0 }, sagittal: { on: false, mm: 0 } },
    cutSide: 'none', sliceSeq: 't1', lead: { ...DEFAULT_LEAD },
    sel: null, hidden: [], cutAbove: g.cutAbove,
  };
}

// #/atlas?g=near_hypophysial_fossa&sel=sb_internal_carotid_artery&h=B&c=axial&cz=10&cut=L&lb=a
const PAGES: SkullPage[] = ['atlas', 'sources', 'credits'];
const LAYER_CODES: [LayerKey, string][] = [['nuclei', 'b'], ['tracts', 'v'], ['cortex', 's'], ['targets', 'l']];
const r1 = (n: number) => Math.round(n * 10) / 10;

export function encodeSkull(s: SkullState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('g', s.grp);
    if (s.also.length) p.set('with', s.also.join(','));
    if (s.sel) p.set('sel', s.sel);
    p.set('h', s.hemi === 'both' ? 'B' : s.hemi);
    if (s.cam.pos && s.cam.tgt) p.set('c', [...s.cam.pos, ...s.cam.tgt].map(r1).join(','));
    else if (s.cam.preset) p.set('c', s.cam.preset);
    const d = defaultSkullState();
    const ly = LAYER_CODES.map(([k, c]) => `${c}${s.layers[k].on ? 1 : 0}${s.layers[k].opacity !== 1 ? ':' + s.layers[k].opacity.toFixed(2) : ''}`).join(',');
    if (ly !== LAYER_CODES.map(([k, c]) => `${c}${d.layers[k].on ? 1 : 0}`).join(',')) p.set('ly', ly);
    p.set('cz', s.cutAbove === null ? 'off' : `${r1(s.cutAbove)}`);
    if (s.cutSide !== 'none') p.set('cut', s.cutSide);
    if (s.labels !== 'hover') p.set('lb', s.labels === 'all' ? 'a' : '0');
    if (s.hidden.length) p.set('hid', s.hidden.join(','));
  }
  const q = p.toString();
  return `#/${s.page}${q ? '?' + q : ''}`;
}

/** Decode a hash; settings a link leaves out come from its group's defaults. */
export function decodeSkull(hash: string): SkullState {
  const s = defaultSkullState();
  const m = hash.replace(/^#\/?/, '').split('?');
  s.page = PAGES.includes(m[0] as SkullPage) ? (m[0] as SkullPage) : 'atlas';
  const p = new URLSearchParams(m[1] ?? '');
  const g = SB_GROUP.get(p.get('g') ?? '') ?? SB_GROUP.get(DEFAULT_GROUP)!;
  s.grp = g.id; s.hemi = g.hemi; s.cutAbove = g.cutAbove;
  s.also = g.kind !== 'system' ? [] : [...new Set((p.get('with') ?? '').split(','))]
    .filter((id) => id !== g.id && SB_GROUP.get(id)?.kind === 'system');
  if (s.also.length) s.cutAbove = combinedCut([g.id, ...s.also]);
  s.sel = p.get('sel');
  const h = p.get('h');
  if (h === 'L' || h === 'R') s.hemi = h; else if (h === 'B') s.hemi = 'both';
  const c = p.get('c');
  if (c) {
    const parts = c.split(',').map(Number);
    if (parts.length === 6 && parts.every(Number.isFinite)) s.cam = { preset: null, pos: parts.slice(0, 3) as V3, tgt: parts.slice(3) as V3 };
    else if ((SKULL_PRESETS as string[]).includes(c)) s.cam = { preset: c as CameraPreset };
  }
  const ly = p.get('ly');
  if (ly) for (const tok of ly.split(',')) {
    const e = LAYER_CODES.find(([, code]) => code === tok[0]);
    if (!e) continue;
    const [on, op] = tok.slice(1).split(':');
    const o = op !== undefined && Number.isFinite(parseFloat(op)) ? parseFloat(op) : 1;
    s.layers[e[0]] = { on: on === '1', opacity: Math.min(1, Math.max(0, o)) };
  }
  const cz = p.get('cz');
  if (cz === 'off') s.cutAbove = null;
  else if (cz !== null && Number.isFinite(parseFloat(cz))) s.cutAbove = parseFloat(cz);
  const cut = p.get('cut');
  s.cutSide = cut === 'L' || cut === 'R' ? cut : 'none';
  const lb = p.get('lb');
  s.labels = lb === 'a' ? 'all' : lb === '0' ? 'off' : 'hover';
  s.hidden = (p.get('hid') ?? '').split(',').filter((x) => /^[a-z0-9_:-]+$/.test(x));
  return s;
}
