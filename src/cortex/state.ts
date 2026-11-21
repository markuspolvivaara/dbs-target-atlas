import type { CameraPreset } from '../data/schema';
import { DEFAULT_LEAD } from '../state';
import type { ViewState } from '../viewer/scene';
import { decodeOpacity, encodeOpacity } from '../viewer/scene';
import { CLIP_PARAMS, decodeCamera, decodeHemi, decodeHidden, encodeCamera, encodeClip, encodeHemi, encodeHidden, hashOf, readHash } from '../viewlink';
import type { FnGroupId, LobeId } from './index';
import { FN_GROUPS, LOBE } from './index';
import { VIEW, type ViewId } from './views';
import { defaultLabels, labelsFrom, labelsParam } from '../labels';

export type CortexPage = 'atlas' | 'sources' | 'credits';
export type ColourMode = 'lobe' | 'atlas' | 'plain';

/** Cortex section state; the viewer reads the ViewState part (including inflate). */
export interface CortexState extends ViewState {
  page: CortexPage;
  view: ViewId;
  /** highlight only this lobe's labels within the view */
  lobe: LobeId | null;
  /** functional areas drawn over the labels (motor, language...), or none */
  fn: FnGroupId | null;
  colour: ColourMode;
  labels: 'all' | 'hover' | 'off';
  inflate: number;
}

export const CTX_PRESETS: CameraPreset[] = ['lateral', 'medial', 'inferior', 'axial', 'coronal'];

export function defaultCortexState(): CortexState {
  return {
    page: 'atlas', view: 'lateral', lobe: null, fn: null, colour: 'lobe', hemi: 'both', cam: { preset: null },
    layers: {
      nuclei: { on: false, opacity: 1 }, tracts: { on: false, opacity: 1 },
      cortex: { on: true, opacity: 1 },
      targets: { on: false, opacity: 1 }, electrode: { on: false, opacity: 1 },
    },
    labels: defaultLabels(),
    clip: { axial: { on: false, mm: 0 }, coronal: { on: false, mm: 0 }, sagittal: { on: false, mm: 0 } },
    cutSide: 'none', sliceSeq: 't1', lead: { ...DEFAULT_LEAD },
    sel: null, hidden: [], inflate: 0,
  };
}

// #/atlas?v=lateral&lobe=frontal&sel=ctx_g_precentral&h=B&c=lateral&inf=1&col=a&lb=a&co=-12&seq=t2
const PAGES: CortexPage[] = ['atlas', 'sources', 'credits'];

export function encodeCortex(s: CortexState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('v', s.view);
    if (s.lobe) p.set('lobe', s.lobe);
    if (s.fn) p.set('f', s.fn);
    if (s.sel) p.set('sel', s.sel);
    encodeHemi(p, s.hemi);
    encodeCamera(p, s.cam);
    if (s.inflate) p.set('inf', '1');
    if (s.colour !== 'lobe') p.set('col', s.colour === 'atlas' ? 'a' : 'p');
    { const lbv = labelsParam(s.labels); if (lbv) p.set('lb', lbv); }
    if (s.cutSide !== 'none') p.set('cut', s.cutSide);
    encodeClip(p, s.clip);
    if (s.sliceSeq !== 't1') p.set('seq', s.sliceSeq);
    if (s.layers.cortex.opacity !== 1) p.set('op', s.layers.cortex.opacity.toFixed(2));
    encodeHidden(p, s.hidden);
    encodeOpacity(p, s.opacity);
  }
  return hashOf(s.page, p);
}

/** Decode a hash; settings a link leaves out come from its view's defaults. */
export function decodeCortex(hash: string): CortexState {
  const s = defaultCortexState();
  const { page, p } = readHash(hash, PAGES);
  s.page = page;
  const v = VIEW.get(p.get('v') as ViewId) ?? VIEW.get('lateral')!;
  s.view = v.id; s.hemi = v.hemi;
  const lobe = p.get('lobe');
  s.lobe = lobe && LOBE.has(lobe as LobeId) ? (lobe as LobeId) : null;
  const fn = p.get('f');
  s.fn = FN_GROUPS.some((g) => g.id === fn) ? (fn as FnGroupId) : null;
  s.sel = p.get('sel');
  decodeHemi(p, s);
  decodeCamera(p, s, CTX_PRESETS);
  s.inflate = p.get('inf') === '1' ? 1 : 0;
  const col = p.get('col');
  s.colour = col === 'a' ? 'atlas' : col === 'p' ? 'plain' : 'lobe';
  const lb = p.get('lb');
  s.labels = labelsFrom(lb);
  const cut = p.get('cut');
  s.cutSide = cut === 'L' || cut === 'R' ? cut : 'none';
  // (a plane whose value is not a number stays off)
  for (const [a, code] of CLIP_PARAMS) {
    const v = parseFloat(p.get(code) ?? '');
    if (Number.isFinite(v)) s.clip[a] = { on: true, mm: v };
  }
  const seq = p.get('seq');
  s.sliceSeq = seq === 't2' || seq === 'pd' ? seq : 't1';
  const op = parseFloat(p.get('op') ?? '');
  if (Number.isFinite(op)) s.layers.cortex.opacity = Math.min(1, Math.max(0.1, op));
  s.hidden = decodeHidden(p);
  decodeOpacity(p, s);
  return s;
}
