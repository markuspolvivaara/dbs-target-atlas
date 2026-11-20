import type { CameraPreset } from '../data/schema';
import { DEFAULT_LEAD, type LayerKey } from '../state';
import type { ViewState } from '../viewer/scene';
import { decodeOpacity, encodeOpacity } from '../viewer/scene';
import { decodeCamera, decodeClip, decodeHemi, decodeHidden, decodeLayers, encodeCamera, encodeClip, encodeHemi, encodeHidden, encodeLayers, hashOf, readHash } from '../viewlink';
import { BS_GROUP } from './groups';
import { defaultLabels, labelsFrom, labelsParam } from '../labels';

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
    labels: defaultLabels(),
    clip: { axial: { on: false, mm: -30 }, coronal: { on: false, mm: -30 }, sagittal: { on: false, mm: 0 } },
    cutSide: 'none', sliceSeq: 't1', lead: { ...DEFAULT_LEAD },
    sel: null, hidden: [],
  };
}

// #/atlas?g=sez_floor&sel=sez_suprafacial&h=B&c=posterior&ly=n1,t1,c1:0.50,z1&ax=-30&cut=L&seq=t2&lb=a
const PAGES: BsPage[] = ['atlas', 'sources', 'credits'];
const LAYER_CODES: [LayerKey, string][] = [['nuclei', 'n'], ['tracts', 't'], ['cortex', 'c'], ['targets', 'z']];

export function encodeBs(s: BsState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('g', s.grp);
    if (s.sel) p.set('sel', s.sel);
    encodeHemi(p, s.hemi);
    encodeCamera(p, s.cam);
    encodeLayers(p, s.layers, defaultBsState().layers, LAYER_CODES);
    encodeClip(p, s.clip);
    if (s.cutSide !== 'none') p.set('cut', s.cutSide);
    if (s.sliceSeq !== 't1') p.set('seq', s.sliceSeq);
    { const lbv = labelsParam(s.labels); if (lbv) p.set('lb', lbv); }
    encodeHidden(p, s.hidden);
    encodeOpacity(p, s.opacity);
  }
  return hashOf(s.page, p);
}

/** Decode a hash; settings a link leaves out come from the defaults. */
export function decodeBs(hash: string): BsState {
  const s = defaultBsState();
  const { page, p } = readHash(hash, PAGES);
  s.page = page;
  const g = BS_GROUP.get(p.get('g') ?? '');
  if (g) s.grp = g.id;
  s.sel = p.get('sel');
  decodeHemi(p, s);
  decodeCamera(p, s, BS_PRESETS);
  decodeLayers(p, s.layers, LAYER_CODES);
  decodeClip(p, s.clip);
  const cut = p.get('cut');
  s.cutSide = cut === 'L' || cut === 'R' ? cut : 'none';
  const seq = p.get('seq');
  s.sliceSeq = seq === 't2' || seq === 'pd' ? seq : 't1';
  const lb = p.get('lb');
  s.labels = labelsFrom(lb);
  s.hidden = decodeHidden(p);
  decodeOpacity(p, s);
  return s;
}
