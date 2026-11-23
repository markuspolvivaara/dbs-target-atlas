import type { CameraPreset } from '../data/schema';
import { DEFAULT_LEAD, type LayerKey } from '../state';
import type { ViewState } from '../viewer/scene';
import { decodeOpacity, encodeOpacity } from '../viewer/scene';
import { decodeCamera, decodeMeasure, encodeMeasure, decodeClip, decodeHemi, decodeHidden, decodeLayers, encodeCamera, encodeClip, encodeHemi, encodeLayers, hashOf, readHash } from '../viewlink';
import { hiddenAtFirst } from './index';

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
// `hid` is written when the hidden tracts are not the view's own (hiddenAtFirst: a tract not drawn until asked for), so
// it may be empty: "nothing hidden", where the view would hide one. Without it a link hides the view's own.
const PAGES: TractsPage[] = ['atlas', 'refs', 'credits'];
const LAYER_CODES: [LayerKey, string][] = [['nuclei', 'n'], ['tracts', 't'], ['cortex', 'c']];

export function encodeTracts(s: TractsState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('g', s.grp);
    if (s.sel) p.set('sel', s.sel);
    encodeHemi(p, s.hemi);
    encodeCamera(p, s.cam);
    encodeLayers(p, s.layers, defaultTractsState().layers, LAYER_CODES);
    if (s.labels !== 'all') p.set('lb', s.labels === 'hover' ? 'h' : '0');
    encodeClip(p, s.clip);
    if (s.cutSide !== 'none') p.set('cut', s.cutSide);
    if (s.sliceSeq !== 't1') p.set('seq', s.sliceSeq);
    const own = hiddenAtFirst(s.grp, s.sel);
    if (s.hidden.length !== own.length || s.hidden.some((id) => !own.includes(id))) p.set('hid', s.hidden.join(','));
    encodeOpacity(p, s.opacity);
    encodeMeasure(p, s.measured);
  }
  return hashOf(s.page, p);
}

/** Decode a hash. A missing `h` means "use the group's own hemisphere", and a missing `g` with a tract named "a group
 * that holds the tract" (a link from another section): both are left to the caller, who then sets the hidden tracts
 * again where the link names none (`hasHidden` false: hiddenAtFirst of the group it settled on). */
export function decodeTracts(hash: string, base: TractsState = defaultTractsState()): { state: TractsState; hasHemi: boolean; hasGroup: boolean; hasHidden: boolean } {
  const s: TractsState = structuredClone(base);
  const { page, p } = readHash(hash, PAGES);
  s.page = page;
  if (p.has('g')) s.grp = p.get('g')!;
  s.sel = p.get('sel');
  decodeHemi(p, s);
  decodeCamera(p, s, TRACT_PRESETS);
  decodeLayers(p, s.layers, LAYER_CODES);
  const lb = p.get('lb');
  s.labels = lb === 'h' ? 'hover' : lb === '0' ? 'off' : 'all';
  decodeClip(p, s.clip);
  const cut = p.get('cut');
  s.cutSide = cut === 'L' || cut === 'R' ? cut : 'none';
  const seq = p.get('seq');
  s.sliceSeq = seq === 't2' || seq === 'pd' ? seq : 't1';
  s.hidden = p.has('hid') ? decodeHidden(p) : hiddenAtFirst(s.grp, s.sel);
  decodeOpacity(p, s);
  decodeMeasure(p, s);
  return { state: s, hasHemi: p.has('h'), hasGroup: p.has('g'), hasHidden: p.has('hid') };
}
