import { drillPairFor } from './drill';
import { HERNIA_MIGRATE, HERNIA_SIZE, HERNIA_ZONES, type HerniaSpec } from './herniation';
import type { CameraPreset } from '../data/schema';
import { DEFAULT_LEAD, type V3 } from '../state';
import type { ViewState } from '../viewer/scene';
import type { RegionId } from './index';
import { APPROACHES, CCJ_MEASURES, TECHNIQUES, type ApproachId, type CcjMeasureId, type LesionZone } from './content';
import type { TechniqueId } from './screw';
import { REGION } from './regions';

export type SpinePage = 'atlas' | 'sources' | 'credits';

/** Spine section state; the viewer reads the ViewState part. */
export interface SpineState extends ViewState {
  page: SpinePage;
  region: RegionId;
  /** selected vertebral level ('L4'), or null for the whole region */
  level: string | null;
  labels: 'all' | 'hover' | 'off';
  /** lesion-to-root tool: a herniation at a lumbar disc, of a kind, on a side */
  lesion: { pair: string; zone: LesionZone; side: 'L' | 'R' } | null;
  /** cut away everything above the centre of the disc below the selected level, or above the screw's first third
   * (cutAbove follows it) */
  cut: 'none' | 'disc' | 'screw';
  /** virtual screw at the selected level: technique, side, angles (deg), size and entry shift (mm) */
  screw: ScrewState | null;
  /** an approach to the disc below the selected level, from one side: dorsal (thoracic) or anterior (cervical, ACDF) */
  approach: { id: ApproachId | 'acdf'; side: 'L' | 'R' } | null;
  /** craniocervical junction: the measurement whose lines are drawn */
  measure: CcjMeasureId | null;
  /** drilling the selected level and the vertebra below it (cervical: a posterior foraminotomy, an anterior discectomy,
   * a laminectomy of the level alone; lumbar: an over-the-top decompression or a spinous process-splitting one) */
  drill: DrillMode | null;
  /** at an anterior discectomy, the two vertebrae drawn this far apart (mm); at a spinous process split, the two halves
   * (mm); at a laminoplasty, how far the door is opened (deg) */
  distract: number;
  /** the side an over-the-top decompression comes from; the side a laminoplasty opens on (its hinge on the other) */
  drillSide: 'L' | 'R';
  /** while drilling, the bone as it was drawn too (a translucent skin, showing where bone was taken) */
  drillGhost: boolean;
  /** while drilling a pair: a schematic disc herniation at their disc, pushing the dural sac and the roots aside */
  hernia: HerniaSpec | null;
}

export type DrillMode = 'foraminotomy' | 'acdf' | 'lamEnBloc' | 'lamPiecemeal' | 'laminoplasty' | 'overTheTop' | 'spSplit';
/** each approach: its link code, the region it is offered in, how far its slider draws the bone apart or opens it (to
 * a maximum, in steps) and in what unit, and whether it is done from a side */
export const DRILL_MODES: Record<DrillMode, { code: string; region: 'cervical' | 'lumbar'; spread?: [number, number]; unit?: 'mm' | '°'; sided?: boolean }> = {
  foraminotomy: { code: '1', region: 'cervical' },
  acdf: { code: 'a', region: 'cervical', spread: [5, 0.5] },
  lamEnBloc: { code: 'e', region: 'cervical' },
  lamPiecemeal: { code: 'p', region: 'cervical' },
  laminoplasty: { code: 'l', region: 'cervical', spread: [60, 5], unit: '°', sided: true },
  overTheTop: { code: 'o', region: 'lumbar', sided: true },
  spSplit: { code: 's', region: 'lumbar', spread: [12, 1] },
};
export const DISTRACT_MAX_MM = DRILL_MODES.acdf.spread![0];

export interface ScrewState {
  tech: TechniqueId;
  side: 'L' | 'R';
  /** transverse angle, medial convergence positive */
  medial: number;
  /** sagittal angle to the endplate plane, cranial positive */
  cranial: number;
  length: number;
  diameter: number;
  /** entry shift from the technique's start position: medial and cranial positive */
  du: number;
  dw: number;
}
/** slider ranges (and the URL's bounds) */
export const SCREW_RANGE: Record<'medial' | 'cranial' | 'length' | 'diameter' | 'du' | 'dw', [number, number, number]> = {
  // wide enough for every start position: translaminar screws run far laterally, C1-C2 screws steeply cranially in the
  // axis's frame (tilted with its C2-C3 disc)
  medial: [-70, 60, 0.5], cranial: [-60, 90, 0.5], length: [6, 70, 1], diameter: [3.5, 9, 0.5], du: [-10, 10, 0.5], dw: [-10, 10, 0.5],
};

export const SPINE_PRESETS: CameraPreset[] = ['lateral', 'posteriorOblique', 'coronal', 'axial', 'inferior'];

export function defaultSpineState(): SpineState {
  return {
    page: 'atlas', region: 'cervical', level: null, hemi: 'both', cam: { preset: null },
    layers: {
      nuclei: { on: true, opacity: 1 },   // bone
      discs: { on: true, opacity: 1 },
      tracts: { on: true, opacity: 1 },   // neural
      // cervical only, off at first (Layers and cut turns them on): carotids, jugulars, vertebral artery; trachea,
      // oesophagus, thyroid, larynx, prevertebral muscles, sternocleidomastoids
      vessels: { on: false, opacity: 1 },
      viscera: { on: false, opacity: 0.6 },
      cortex: { on: false, opacity: 1 }, targets: { on: true, opacity: 1 }, electrode: { on: false, opacity: 1 },
    },
    labels: 'hover',
    clip: { axial: { on: false, mm: 0 }, coronal: { on: false, mm: 0 }, sagittal: { on: false, mm: 0 } },
    cutSide: 'none', sliceSeq: 't1', lead: { ...DEFAULT_LEAD },
    sel: null, hidden: [], lesion: null, cut: 'none', screw: null, approach: null, measure: null, cutAbove: null, cutPlane: null, drill: null, distract: 0, drillSide: 'L', drillGhost: false, hernia: null,
  };
}

// #/atlas?r=lumbar&lv=L4&sel=sp_l4&h=B&c=lateral&ly=b1,d1,n1,v1,o0.5&cut=R&lb=a
const PAGES: SpinePage[] = ['atlas', 'sources', 'credits'];
const LAYER_CODES: [keyof SpineState['layers'], string][] = [['nuclei', 'b'], ['discs', 'd'], ['tracts', 'n'], ['vessels', 'v'], ['viscera', 'o']];
const r1 = (n: number) => Math.round(n * 10) / 10;

export function encodeSpine(s: SpineState): string {
  const p = new URLSearchParams();
  if (s.page === 'atlas') {
    p.set('r', s.region);
    if (s.level) p.set('lv', s.level);
    if (s.sel) p.set('sel', s.sel);
    p.set('h', s.hemi === 'both' ? 'B' : s.hemi);
    if (s.cam.pos && s.cam.tgt) p.set('c', [...s.cam.pos, ...s.cam.tgt].map(r1).join(','));
    else if (s.cam.preset) p.set('c', s.cam.preset);
    const d = defaultSpineState();
    const code = (st: SpineState) => LAYER_CODES.map(([k, c]) => `${c}${st.layers[k]!.on ? 1 : 0}${st.layers[k]!.opacity !== 1 ? ':' + st.layers[k]!.opacity.toFixed(2) : ''}`).join(',');
    if (code(s) !== code(d)) p.set('ly', code(s));
    if (s.cutSide !== 'none') p.set('cut', s.cutSide);
    if (s.labels !== 'hover') p.set('lb', s.labels === 'all' ? 'a' : '0');
    if (s.hidden.length) p.set('hid', s.hidden.join(','));
    if (s.cut !== 'none' && s.level) p.set('x', s.cut === 'disc' ? 'd' : 's');
    if (s.screw && s.level) {
      const c = s.screw;
      p.set('scr', [c.tech, c.side, c.medial, c.cranial, c.length, c.diameter, c.du, c.dw].map((x) => (typeof x === 'number' ? r1(x) : x)).join('~'));
    }
    if (s.lesion) p.set('les', `${s.lesion.pair}.${s.lesion.zone}.${s.lesion.side}`);
    if (s.approach && s.level) p.set('ap', `${s.approach.id}.${s.approach.side}`);
    if (s.measure && s.region === 'ccj') p.set('cm', s.measure);
    if (s.drill && drillPairFor(s.level)) {
      p.set('dr', DRILL_MODES[s.drill].code);
      if (DRILL_MODES[s.drill].spread && s.distract) p.set('dd', String(s.distract));
      if (DRILL_MODES[s.drill].sided && s.drillSide !== 'L') p.set('ds', s.drillSide);
      if (s.drillGhost) p.set('dg', '1');
      const hz = s.hernia;
      if (hz) p.set('hz', [hz.zone, hz.side, hz.type === 'extrusion' ? 'e' : 'p', hz.sizeMm, hz.migrateMm].join('.'));
    }
  }
  const q = p.toString();
  return `#/${s.page}${q ? '?' + q : ''}`;
}

export function decodeSpine(hash: string): SpineState {
  const s = defaultSpineState();
  const m = hash.replace(/^#\/?/, '').split('?');
  s.page = PAGES.includes(m[0] as SpinePage) ? (m[0] as SpinePage) : 'atlas';
  const p = new URLSearchParams(m[1] ?? '');
  const r = REGION.get(p.get('r') as RegionId);
  s.region = r && r.ready ? r.id : 'cervical';   // the spine opens on the cervical region
  const lv = p.get('lv');
  s.level = lv && REGION.get(s.region)!.levels.includes(lv) ? lv : null;
  s.sel = p.get('sel');
  const h = p.get('h');
  if (h === 'L' || h === 'R') s.hemi = h; else if (h === 'B') s.hemi = 'both';
  const c = p.get('c');
  if (c) {
    const parts = c.split(',').map(Number);
    if (parts.length === 6 && parts.every(Number.isFinite)) s.cam = { preset: null, pos: parts.slice(0, 3) as V3, tgt: parts.slice(3) as V3 };
    else if ((SPINE_PRESETS as string[]).includes(c)) s.cam = { preset: c as CameraPreset };
  }
  const ly = p.get('ly');
  if (ly) for (const tok of ly.split(',')) {
    const e = LAYER_CODES.find(([, code]) => code === tok[0]);
    if (!e) continue;
    const [on, op] = tok.slice(1).split(':');
    const o = op !== undefined && Number.isFinite(parseFloat(op)) ? parseFloat(op) : 1;
    s.layers[e[0]] = { on: on === '1', opacity: Math.min(1, Math.max(0, o)) };
  }
  const cut = p.get('cut');
  s.cutSide = cut === 'L' || cut === 'R' ? cut : 'none';
  const lb = p.get('lb');
  s.labels = lb === 'a' ? 'all' : lb === '0' ? 'off' : 'hover';
  s.hidden = (p.get('hid') ?? '').split(',').filter((x) => /^[a-z0-9_:-]+$/.test(x));
  const les = /^([LST]\d)-([LS]\d)\.(paracentral|foraminal|farlateral)\.([LR])$/.exec(p.get('les') ?? '');
  s.screw = decodeScrew(p.get('scr'), s.level);
  const x = p.get('x');
  s.cut = !s.level ? 'none' : x === 'd' ? 'disc' : x === 's' && s.screw ? 'screw' : 'none';
  // a lesion belongs to the disc below the selected level
  s.lesion = les && s.level && les[1] === s.level ? { pair: `${les[1]}-${les[2]}`, zone: les[3] as LesionZone, side: les[4] as 'L' | 'R' } : null;
  const ap = /^([a-z]+)\.([LR])$/.exec(p.get('ap') ?? '');
  s.approach = ap && s.level?.startsWith('T') && ap[1] in APPROACHES ? { id: ap[1] as ApproachId, side: ap[2] as 'L' | 'R' }
    : ap && s.level?.startsWith('C') && ap[1] === 'acdf' ? { id: 'acdf', side: ap[2] as 'L' | 'R' } : null;
  const cm = p.get('cm');
  s.measure = s.region === 'ccj' && CCJ_MEASURES.some((x) => x.id === cm) ? cm as CcjMeasureId : null;
  const dr = p.get('dr'), pair = drillPairFor(s.level);
  const mode = (Object.keys(DRILL_MODES) as DrillMode[]).find((m) => DRILL_MODES[m].code === dr);
  s.drill = pair && mode && DRILL_MODES[mode].region === pair.region && pair.region === s.region ? mode : null;
  const dd = Number(p.get('dd')), spread = s.drill ? DRILL_MODES[s.drill].spread : undefined;
  s.distract = spread && Number.isFinite(dd) ? Math.max(0, Math.min(spread[0], Math.round(dd / spread[1]) * spread[1])) : 0;
  s.drillSide = s.drill && DRILL_MODES[s.drill].sided && p.get('ds') === 'R' ? 'R' : 'L';
  s.drillGhost = !!s.drill && p.get('dg') === '1';
  s.hernia = s.drill ? decodeHernia(p.get('hz'), DRILL_MODES[s.drill].region) : null;
  return s;
}

function decodeHernia(v: string | null, region: 'lumbar' | 'cervical'): HerniaSpec | null {
  const m = /^(central|paracentral|foraminal|farlateral)\.([LR])\.([pe])\.(-?[\d.]+)\.(-?[\d.]+)$/.exec(v ?? '');
  if (!m || !HERNIA_ZONES[region].some(([z]) => z === m[1])) return null;
  const clamp = (x: number, [lo, hi, st]: [number, number, number]) => Math.min(hi, Math.max(lo, Math.round(x / st) * st));
  const size = Number(m[4]), mig = Number(m[5]);
  if (!Number.isFinite(size) || !Number.isFinite(mig)) return null;
  return { zone: m[1] as HerniaSpec['zone'], side: m[2] as 'L' | 'R', type: m[3] === 'e' ? 'extrusion' : 'protrusion',
    sizeMm: clamp(size, HERNIA_SIZE), migrateMm: m[3] === 'e' ? clamp(mig, HERNIA_MIGRATE) : 0 };
}

function decodeScrew(v: string | null, level: string | null): ScrewState | null {
  const parts = (v ?? '').split('~');
  if (!level || parts.length !== 8) return null;
  const [tech, side, ...nums] = parts;
  const t = TECHNIQUES[tech as TechniqueId];
  if (!t || !t.levels.includes(level) || (side !== 'L' && side !== 'R')) return null;
  const n = nums.map(Number);
  if (!n.every(Number.isFinite)) return null;
  const keys = ['medial', 'cranial', 'length', 'diameter', 'du', 'dw'] as const;
  const out = { tech: tech as TechniqueId, side: t.midline ? 'L' : side } as ScrewState;   // a midline screw is the 'left' one
  keys.forEach((k, i) => { const [lo, hi] = SCREW_RANGE[k]; out[k] = Math.min(hi, Math.max(lo, n[i])); });
  return out;
}
