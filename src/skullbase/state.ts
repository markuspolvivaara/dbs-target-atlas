import type { CameraPreset } from '../data/schema';
import { DEFAULT_LEAD, type LayerKey } from '../state';
import type { ViewState } from '../viewer/scene';
import { decodeOpacity, encodeOpacity } from '../viewer/scene';
import { decodeCamera, decodeMeasure, encodeMeasure, decodeHemi, decodeHidden, decodeLayers, encodeCamera, encodeHemi, encodeHidden, encodeLayers, hashOf, r1, readHash } from '../viewlink';
import { combinedCut, DEFAULT_GROUP, SB_GROUP } from './groups';
import { defaultLabels, labelsFrom, labelsParam } from '../labels';

export type SkullPage = 'atlas' | 'grading' | 'sources' | 'credits';

/** The endonasal view's endoscope and the pieces taken away, as a link holds them: the nostril, how far in the scope is
 * (mm along its way), how it is turned (degrees: to the side, up or down, its picture rolled), whether its picture is
 * the big one, and the ids of the pieces taken away. What the burr drilled is not held (voxels do not fit a link). */
export interface EndoView { side: 'L' | 'R'; depth: number; yaw: number; pitch: number; roll: number; big: boolean; removed: string[] }

/** Skull-base section state; the viewer reads the ViewState part (including cutAbove). */
export interface SkullState extends ViewState {
  page: SkullPage;
  grp: string;
  /** other systems shown together with grp (a system); in the URL as with=id,id */
  also: string[];
  labels: 'all' | 'hover' | 'off';
  cutAbove: number | null;
  /** a surgical view's shapes of the brain (named morph targets, 0..1 each; none in other views). In the URL by MORPH_PARAMS */
  morphs: Record<string, number>;
  /** a view with a section (the Knosp grades): cut at it (default) or whole; in the URL as sec=0 when whole */
  section: boolean;
  /** the endonasal view's endoscope and pieces (from its panel once the sinus is loaded, or from a link; none in other
   * views). In the URL as sc=R,12.5,4,-2,0 (ev=3d: its picture as the inset) and rm=septa,floor */
  endo?: EndoView;
  /** the landmark the position read-out measures from (its id), or null: the frame's origin, the hypophysial fossa. In
   * the URL as fr=id */
  from: string | null;
  /** a teaching tour being played (src/skullbase/tours.ts), and its step (1 = the first); in the URL as tour=id&ts=n */
  tour: string | null;
  ts: number;
}

/** the surgical shapes and their URL parameters (op=0..100 and so on) */
export const MORPH_PARAMS: Record<string, string> = { open: 'op', lift: 'lf', lsoLift: 'll', interhemispheric: 'ih', telovelar: 'tv', retrosigmoid: 'rs', farLateral: 'fl', farLateralBack: 'fb', clinoid: 'ac', ridge: 'sr', subtemporal: 'st' };

export const SKULL_PRESETS: CameraPreset[] = ['axial', 'inferior', 'lateral', 'coronal', 'posteriorOblique', 'anterolateral', 'frontolateral', 'supraorbital', 'vertex', 'suboccipital', 'retrosigmoid', 'orbitozygomatic', 'farLateral', 'subtemporal',
  'pterional', 'orbitozygomaticFront', 'vertexFront', 'retrosigmoidLateral', 'farLateralLow', 'retrosigmoidLevel', 'subtemporalLow', 'aim'];

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
    labels: defaultLabels(),
    clip: { axial: { on: false, mm: 0 }, coronal: { on: false, mm: 0 }, sagittal: { on: false, mm: 0 } },
    cutSide: 'none', sliceSeq: 't1', lead: { ...DEFAULT_LEAD },
    sel: null, hidden: [], cutAbove: g.cutAbove, morphs: {}, section: true, from: null, tour: null, ts: 1,
  };
}

// #/atlas?g=near_hypophysial_fossa&sel=sb_internal_carotid_artery&h=B&c=axial&cz=10&cut=L&lb=a
const PAGES: SkullPage[] = ['atlas', 'grading', 'sources', 'credits'];
const LAYER_CODES: [LayerKey, string][] = [['nuclei', 'b'], ['tracts', 'v'], ['cortex', 's'], ['targets', 'l']];

export function encodeSkull(s: SkullState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('g', s.grp);
    if (s.also.length) p.set('with', s.also.join(','));
    if (s.sel) p.set('sel', s.sel);
    if (s.from) p.set('fr', s.from);
    if (s.tour) { p.set('tour', s.tour); p.set('ts', String(s.ts)); }
    encodeHemi(p, s.hemi);
    encodeCamera(p, s.cam);
    encodeLayers(p, s.layers, defaultSkullState().layers, LAYER_CODES);
    p.set('cz', s.cutAbove === null ? 'off' : `${r1(s.cutAbove)}`);
    if (s.cutSide !== 'none') p.set('cut', s.cutSide);
    { const lbv = labelsParam(s.labels); if (lbv) p.set('lb', lbv); }
    encodeHidden(p, s.hidden);
    encodeOpacity(p, s.opacity);
    encodeMeasure(p, s.measured);
    const dflt = SB_GROUP.get(s.grp)?.morphDefault ?? {};
    for (const [name, key] of Object.entries(MORPH_PARAMS)) {
      const v = s.morphs[name] ?? 0;
      if (v > 0 || (dflt[name] ?? 0) > 0) p.set(key, String(Math.round(v * 100)));
    }
    if (!s.section && SB_GROUP.get(s.grp)?.section) p.set('sec', '0');
    if (s.endo && SB_GROUP.get(s.grp)?.endonasal) {
      const e = s.endo;
      p.set('sc', [e.side, e.depth, e.yaw, e.pitch, e.roll].join(','));
      if (!e.big) p.set('ev', '3d');
      if (e.removed.length) p.set('rm', e.removed.join(','));
    }
  }
  return hashOf(s.page, p);
}

/** Decode a hash; settings a link leaves out come from its group's defaults. */
export function decodeSkull(hash: string): SkullState {
  const s = defaultSkullState();
  const { page, p } = readHash(hash, PAGES);
  s.page = page;
  const g = SB_GROUP.get(p.get('g') ?? '') ?? SB_GROUP.get(DEFAULT_GROUP)!;
  s.grp = g.id; s.hemi = g.hemi; s.cutAbove = g.cutAbove;
  s.also = g.kind !== 'system' ? [] : [...new Set((p.get('with') ?? '').split(','))]
    .filter((id) => id !== g.id && SB_GROUP.get(id)?.kind === 'system');
  if (s.also.length) s.cutAbove = combinedCut([g.id, ...s.also]);
  s.sel = p.get('sel');
  { const fr = p.get('fr'); s.from = fr && /^[a-z0-9_]+$/.test(fr) ? fr : null; }
  { const t = p.get('tour'); s.tour = t && /^[a-z0-9_-]+$/.test(t) ? t : null; }
  { const n = parseInt(p.get('ts') ?? '', 10); s.ts = Number.isFinite(n) && n >= 1 ? n : 1; }
  decodeHemi(p, s);
  decodeCamera(p, s, SKULL_PRESETS);
  decodeLayers(p, s.layers, LAYER_CODES);
  const cz = p.get('cz');
  if (cz === 'off') s.cutAbove = null;
  else if (cz !== null && Number.isFinite(parseFloat(cz))) s.cutAbove = parseFloat(cz);
  const cut = p.get('cut');
  s.cutSide = cut === 'L' || cut === 'R' ? cut : 'none';
  const lb = p.get('lb');
  s.labels = labelsFrom(lb);
  s.hidden = decodeHidden(p);
  decodeOpacity(p, s);
  decodeMeasure(p, s);
  s.section = p.get('sec') !== '0';
  s.morphs = {};
  for (const name of g.morphs ?? []) {     // only the shapes this view has (a view's own default where the link leaves one out)
    const v = parseFloat(p.get(MORPH_PARAMS[name]) ?? '');
    if (Number.isFinite(v)) { if (v > 0) s.morphs[name] = Math.min(1, v / 100); } else if (g.morphDefault?.[name]) s.morphs[name] = g.morphDefault[name];
  }
  // the endonasal view's scope: its side and four plain numbers (held here to what any scope could be; the panel holds
  // them to this model's way and to what is open), and the pieces by their ids
  const sc = (p.get('sc') ?? '').split(',');
  const side = sc[0];
  if (g.endonasal && sc.length === 5 && (side === 'L' || side === 'R') && sc.slice(1).every((t) => /^-?\d+(\.\d+)?$/.test(t))) {
    const [depth, yaw, pitch, roll] = sc.slice(1).map(Number);
    const held = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
    s.endo = { side, depth: Math.max(0, Math.min(300, depth)), yaw: held(yaw, 90), pitch: held(pitch, 90), roll: held(roll, 180),
      big: p.get('ev') !== '3d', removed: [...new Set((p.get('rm') ?? '').split(',').filter((x) => /^[A-Za-z0-9_]+$/.test(x)))] };
  }
  return s;
}
