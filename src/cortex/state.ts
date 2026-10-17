import type { CameraPreset } from '../data/schema';
import { DEFAULT_LEAD, type V3 } from '../state';
import type { ViewState } from '../viewer/scene';
import type { LobeId } from './index';
import { LOBE } from './index';
import { VIEW, type ViewId } from './views';

export type CortexPage = 'atlas' | 'sources' | 'credits';
export type ColourMode = 'lobe' | 'atlas' | 'plain';

/** Cortex section state; the viewer reads the ViewState part (including inflate). */
export interface CortexState extends ViewState {
  page: CortexPage;
  view: ViewId;
  /** highlight only this lobe's labels within the view */
  lobe: LobeId | null;
  colour: ColourMode;
  labels: 'all' | 'hover' | 'off';
  inflate: number;
}

export const CTX_PRESETS: CameraPreset[] = ['lateral', 'medial', 'inferior', 'axial', 'coronal'];

export function defaultCortexState(): CortexState {
  return {
    page: 'atlas', view: 'lateral', lobe: null, colour: 'lobe', hemi: 'both', cam: { preset: null },
    layers: {
      nuclei: { on: false, opacity: 1 }, tracts: { on: false, opacity: 1 },
      cortex: { on: true, opacity: 1 },
      targets: { on: false, opacity: 1 }, electrode: { on: false, opacity: 1 },
    },
    labels: 'hover',
    clip: { axial: { on: false, mm: 0 }, coronal: { on: false, mm: 0 }, sagittal: { on: false, mm: 0 } },
    cutSide: 'none', sliceSeq: 't1', lead: { ...DEFAULT_LEAD },
    sel: null, hidden: [], inflate: 0,
  };
}

// #/atlas?v=lateral&lobe=frontal&sel=ctx_g_precentral&h=B&c=lateral&inf=1&col=a&lb=a
const PAGES: CortexPage[] = ['atlas', 'sources', 'credits'];
const r1 = (n: number) => Math.round(n * 10) / 10;

export function encodeCortex(s: CortexState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('v', s.view);
    if (s.lobe) p.set('lobe', s.lobe);
    if (s.sel) p.set('sel', s.sel);
    p.set('h', s.hemi === 'both' ? 'B' : s.hemi);
    if (s.cam.pos && s.cam.tgt) p.set('c', [...s.cam.pos, ...s.cam.tgt].map(r1).join(','));
    else if (s.cam.preset) p.set('c', s.cam.preset);
    if (s.inflate) p.set('inf', '1');
    if (s.colour !== 'lobe') p.set('col', s.colour === 'atlas' ? 'a' : 'p');
    if (s.labels !== 'hover') p.set('lb', s.labels === 'all' ? 'a' : '0');
    if (s.cutSide !== 'none') p.set('cut', s.cutSide);
    if (s.layers.cortex.opacity !== 1) p.set('op', s.layers.cortex.opacity.toFixed(2));
    if (s.hidden.length) p.set('hid', s.hidden.join(','));
  }
  const q = p.toString();
  return `#/${s.page}${q ? '?' + q : ''}`;
}

/** Decode a hash; settings a link leaves out come from its view's defaults. */
export function decodeCortex(hash: string): CortexState {
  const s = defaultCortexState();
  const m = hash.replace(/^#\/?/, '').split('?');
  s.page = PAGES.includes(m[0] as CortexPage) ? (m[0] as CortexPage) : 'atlas';
  const p = new URLSearchParams(m[1] ?? '');
  const v = VIEW.get(p.get('v') as ViewId) ?? VIEW.get('lateral')!;
  s.view = v.id; s.hemi = v.hemi;
  const lobe = p.get('lobe');
  s.lobe = lobe && LOBE.has(lobe as LobeId) ? (lobe as LobeId) : null;
  s.sel = p.get('sel');
  const h = p.get('h');
  if (h === 'L' || h === 'R') s.hemi = h; else if (h === 'B') s.hemi = 'both';
  const c = p.get('c');
  if (c) {
    const parts = c.split(',').map(Number);
    if (parts.length === 6 && parts.every(Number.isFinite)) s.cam = { preset: null, pos: parts.slice(0, 3) as V3, tgt: parts.slice(3) as V3 };
    else if ((CTX_PRESETS as string[]).includes(c)) s.cam = { preset: c as CameraPreset };
  }
  s.inflate = p.get('inf') === '1' ? 1 : 0;
  const col = p.get('col');
  s.colour = col === 'a' ? 'atlas' : col === 'p' ? 'plain' : 'lobe';
  const lb = p.get('lb');
  s.labels = lb === 'a' ? 'all' : lb === '0' ? 'off' : 'hover';
  const cut = p.get('cut');
  s.cutSide = cut === 'L' || cut === 'R' ? cut : 'none';
  const op = parseFloat(p.get('op') ?? '');
  if (Number.isFinite(op)) s.layers.cortex.opacity = Math.min(1, Math.max(0.1, op));
  s.hidden = (p.get('hid') ?? '').split(',').filter((x) => /^[a-z0-9_:-]+$/.test(x));
  return s;
}
