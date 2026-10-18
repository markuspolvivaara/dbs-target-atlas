import { z } from 'zod';
import screwJson from '../data/generated/spine-screw.json';
import { assetUrl } from '../viewer/assets';

/**
 * The virtual screw (pipeline/spine_screw.py writes the data): per level a frame, the measured pedicles, each technique's
 * start position, a signed distance field of the bone and points on the structures at risk. The evaluation here is
 * the same as the pipeline's reference (`screw_result`), which the unit tests compare against.
 */
const V3 = z.tuple([z.number(), z.number(), z.number()]);
export type V3 = z.infer<typeof V3>;
const PedicleSchema = z.object({
  width: z.number(), height: z.number(), transverseAngle: z.number(), sagittalAngle: z.number(), chord: z.number(),
  inscribedRadius: z.number(), isthmus: V3, isthmusUvw: V3, entry: V3, dir: V3,
});
const Isthmus = z.object({
  isthmusHeight: z.number(),
  groove: z.object({ height: z.number(), lateralOfCanal: z.number(), atlasAbove: z.boolean() }),
});
const LateralMassSchema = z.object({ width: z.number(), height: z.number(), facetInclination: z.array(z.number()), centre: V3 });
const StartSchema = z.object({
  entry: V3, dir: V3, chord: z.number().nullable().optional(), trajectory: z.number().optional(), promontory: V3.optional(), bodyDepth: z.number().optional(),
  sagittal: z.number().optional(), ventral: z.boolean().optional(), apex: V3.optional(),
  size: z.object({ diameter: z.number(), length: z.number() }),
});
const Side = z.object({ L: StartSchema, R: StartSchema });
const CheckSchema = z.object({
  grade: z.enum(['A', 'B', 'C', 'D', 'E']), seated: z.number(), breach: z.record(z.number()),
  nearest: z.array(z.object({ id: z.string(), mm: z.number() })),
});
const LevelSchema = z.object({
  frame: z.object({ origin: V3, ex: V3, ey: V3, ez: V3 }),
  pedicle: z.object({ L: PedicleSchema, R: PedicleSchema }).optional(),
  start: z.object({
    tt: Side.optional(), cbt: Side.optional(), s1: Side.optional(), st: Side.optional(), at: Side.optional(),
    rc: Side.optional(), mg: Side.optional(), an: Side.optional(), cp: Side.optional(),
    c1lm: Side.optional(), c2p: Side.optional(), c2pars: Side.optional(), c2tl: Side.optional(), ta: Side.optional(),
    od: Side.optional(),
  }),
  isthmus: z.object({ L: Isthmus, R: Isthmus }).optional(),
  lateralMass: z.object({ L: LateralMassSchema, R: LateralMassSchema }).optional(),
  check: z.record(CheckSchema),
  risk: z.array(z.object({ id: z.string(), offset: z.number().int(), count: z.number().int() })),
  sdf: z.object({ origin: V3, dims: V3, step: z.number(), scale: z.number(), clamp: z.number(), offset: z.number() }),
  file: z.string(), bytes: z.number(),
});
export type ScrewLevel = z.infer<typeof LevelSchema>;
export type Pedicle = z.infer<typeof PedicleSchema>;
export type Check = z.infer<typeof CheckSchema>;
export const SCREW_LEVELS: Record<string, ScrewLevel> = z.object({ levels: z.record(LevelSchema) }).parse(screwJson).levels;

export type TechniqueId = 'tt' | 'cbt' | 's1' | 'st' | 'at' | 'rc' | 'mg' | 'an' | 'cp' | 'c1lm' | 'c2p' | 'c2pars' | 'c2tl' | 'ta' | 'od';
/** The data a technique's screw is checked against: its level's, except the transarticular screw, which crosses the
 * atlanto-axial joint (the atlas and axis together). */
const DATA_KEY: Partial<Record<TechniqueId, string>> = { ta: 'C1-C2' };
export const screwKey = (level: string, tech: TechniqueId) => DATA_KEY[tech] ?? level;
export type ScrewSide = 'L' | 'R';
export const sideSign = (sd: ScrewSide) => (sd === 'L' ? -1 : 1);

// ---------------------------------------------------------------- vectors
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const DEG = Math.PI / 180;

type Frame = { ex: V3; ey: V3; ez: V3 };
const ventral = (lv: ScrewLevel, tech?: TechniqueId) => !!(tech && lv.start[tech]?.L.ventral);

/** The frame a technique's angles are read in: the level's, looking backwards for a screw from the front (the
 * odontoid screw), so its angles too are 0 straight into the bone and positive cranially. */
export function angleFrame(lv: ScrewLevel, tech?: TechniqueId): Frame {
  const { ex, ey, ez } = lv.frame;
  return ventral(lv, tech) ? { ex, ey: mul(ey, -1), ez } : { ex, ey, ez };
}

/** The frame a screw's breaches are named in (spine_screw.breach_frame): the level's, or for a screw from the front
 * its own start line: 'anterior' along it (its far cortex), 'superior' / 'inferior' its front and back walls. */
export function breachFrame(lv: ScrewLevel, tech: TechniqueId | undefined, sd: ScrewSide): Frame {
  if (!ventral(lv, tech)) return lv.frame;
  const d = lv.start[tech!]![sd].dir;
  const ey = mul(d, 1 / norm(d));
  let ex = sub(lv.frame.ex, mul(ey, dot(lv.frame.ex, ey)));
  ex = mul(ex, 1 / norm(ex));
  let ez: V3 = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]];
  if (dot(ez, lv.frame.ey) < 0) ez = mul(ez, -1);
  return { ex, ey, ez };
}

/** Direction into the bone from a transverse angle (medial convergence positive) and a sagittal angle (cranial
 * positive), in the technique's angle frame (as spine_screw.direction). */
export function direction(lv: ScrewLevel, sd: ScrewSide, medial: number, cranial: number, tech?: TechniqueId): V3 {
  const { ex, ey, ez } = angleFrame(lv, tech);
  const m = medial * DEG, c = cranial * DEG, sg = sideSign(sd);
  const d = add(mul(add(mul(ey, Math.cos(m)), mul(ex, -sg * Math.sin(m))), Math.cos(c)), mul(ez, Math.sin(c)));
  return mul(d, 1 / norm(d));
}

/** The angles of a direction (as spine_screw.angles). */
export function anglesOf(lv: ScrewLevel, sd: ScrewSide, d: V3, tech?: TechniqueId): { medial: number; cranial: number } {
  const { ex, ey, ez } = angleFrame(lv, tech);
  return {
    medial: Math.atan2(-sideSign(sd) * dot(d, ex), dot(d, ey)) / DEG,
    cranial: Math.asin(Math.max(-1, Math.min(1, dot(d, ez)))) / DEG,
  };
}

// ---------------------------------------------------------------- the bone field
export interface ScrewField {
  level: string;
  sdf: Int8Array;
  dims: V3;
  origin: V3;
  step: number;
  scale: number;
  risks: { id: string; pts: Int16Array }[];
}

/** Sample the distance field (mm, negative inside), trilinear with the edges held (scipy map_coordinates, order 1,
 * mode 'nearest'). */
export function sdfAt(f: ScrewField, p: V3): number {
  const [nx, ny, nz] = f.dims;
  const c = [0, 1, 2].map((i) => Math.min(Math.max((p[i] - f.origin[i]) / f.step, 0), f.dims[i] - 1));
  const i0 = c.map((x, i) => Math.min(Math.floor(x), f.dims[i] - 2));
  const t = c.map((x, i) => x - i0[i]);
  const v = (i: number, j: number, k: number) => f.sdf[i + nx * (j + ny * k)];
  let s = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let k = 0; k < 2; k++) {
    const w = (a ? t[0] : 1 - t[0]) * (b ? t[1] : 1 - t[1]) * (k ? t[2] : 1 - t[2]);
    if (w) s += w * v(i0[0] + a, i0[1] + b, i0[2] + k);
  }
  void nz;
  return s * f.scale;
}

/** Decode one level's file: the int8 field, then the int16 points (0.1 mm) of each structure at risk. */
export function decodeField(level: string, lv: ScrewLevel, buf: ArrayBuffer): ScrewField {
  const n = lv.sdf.dims[0] * lv.sdf.dims[1] * lv.sdf.dims[2];
  return {
    level, dims: lv.sdf.dims, origin: lv.sdf.origin, step: lv.sdf.step, scale: lv.sdf.scale,
    sdf: new Int8Array(buf, lv.sdf.offset, n),
    risks: lv.risk.map((r) => ({ id: r.id, pts: new Int16Array(buf, r.offset, r.count * 3) })),
  };
}

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf; // the server already decoded it
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

const fields = new Map<string, Promise<ScrewField>>();
export function loadField(level: string): Promise<ScrewField> {
  let p = fields.get(level);
  if (!p) {
    const lv = SCREW_LEVELS[level];
    p = fetch(assetUrl(lv.file))
      .then((r) => { if (!r.ok) throw new Error(`${lv.file}: ${r.status}`); return r.arrayBuffer(); })
      .then(gunzip)
      .then((buf) => decodeField(level, lv, buf));
    p.catch(() => fields.delete(level));
    fields.set(level, p);
  }
  return p;
}

// ---------------------------------------------------------------- a screw
export type BreachDir = 'medial' | 'lateral' | 'superior' | 'inferior' | 'anterior';
export interface ScrewResult {
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  /** mm from the entry where the screw is first wholly inside the bone (two radii if it never is) */
  seated: number;
  /** whether the screw is ever wholly inside the bone */
  inside: boolean;
  /** deepest breach (mm) of the screw's surface beyond the bone surface, by direction */
  breach: Partial<Record<BreachDir, number>>;
  /** where each direction's deepest breach is: the point of the screw's surface furthest out */
  where: Partial<Record<BreachDir, V3>>;
  nearest: { id: string; mm: number }[];
}

/** Gertzbein-Robbins grade of a pedicle wall breach in mm (Miyamoto 2025's definitions). */
export function grRobbins(mm: number): ScrewResult['grade'] {
  return mm <= 0 ? 'A' : mm <= 2 ? 'B' : mm <= 4 ? 'C' : mm <= 6 ? 'D' : 'E';
}

/** Breaches and the nearest structures at risk for a screw from `entry` along `d` (spine_screw.screw_result). */
export function evaluate(f: ScrewField, lv: ScrewLevel, sd: ScrewSide, entry: V3, d: V3, length: number, radius: number, nearestN = 3,
  tech?: TechniqueId): ScrewResult {
  const sg = sideSign(sd);
  const { ex, ey, ez } = breachFrame(lv, tech, sd);
  const ts: number[] = [];
  for (let k = 0; k * 0.5 <= length + 1e-6; k++) ts.push(k * 0.5);
  const pts = ts.map((t) => add(entry, mul(d, t)));
  const b = pts.map((p) => sdfAt(f, p) + radius);
  const firstIn = b.findIndex((x) => x <= 0);
  const seated = firstIn >= 0 ? ts[firstIn] : 2 * radius;
  const breach: Partial<Record<BreachDir, number>> = {};
  const where: Partial<Record<BreachDir, V3>> = {};
  ts.forEach((t, i) => {
    if (b[i] <= 0 || t < seated) return;
    const p = pts[i];
    const g: V3 = [0, 1, 2].map((a) => {
      const e: V3 = [0, 0, 0];
      e[a] = 0.5;
      return sdfAt(f, add(p, e)) - sdfAt(f, sub(p, e));
    }) as V3;
    const gn = norm(g) || 1;
    const n = mul(g, 1 / gn);
    const comp = [sg * dot(n, ex), dot(n, ey), dot(n, ez)];
    let k = 0;
    for (let j = 1; j < 3; j++) if (Math.abs(comp[j]) > Math.abs(comp[k])) k = j;
    const names: [string, string][] = [['lateral', 'medial'], ['anterior', 'posterior'], ['superior', 'inferior']];
    const name = names[k][comp[k] > 0 ? 0 : 1];
    const k2 = name as BreachDir;
    if (name !== 'posterior' && b[i] > (breach[k2] ?? 0)) { breach[k2] = b[i]; where[k2] = add(p, mul(n, radius)); }
  });
  const wall = Math.max(0, ...(['medial', 'lateral', 'superior', 'inferior'] as BreachDir[]).map((k) => breach[k] ?? 0));
  const tip = add(entry, mul(d, length));
  const ab = sub(tip, entry);
  const ab2 = dot(ab, ab);
  const nearest = f.risks.map(({ id, pts: q }) => {
    let best = Infinity;
    for (let i = 0; i < q.length; i += 3) {
      const p: V3 = [q[i] * 0.1, q[i + 1] * 0.1, q[i + 2] * 0.1];
      const t = Math.min(1, Math.max(0, dot(sub(p, entry), ab) / ab2));
      const dd = norm(sub(p, add(entry, mul(ab, t))));
      if (dd < best) best = dd;
    }
    return { id, mm: best - radius };
  }).sort((a, c) => a.mm - c.mm).slice(0, nearestN);
  return { grade: grRobbins(wall), seated, inside: firstIn >= 0, breach, where, nearest };
}

/** Move an entry point by `medial` and `cranial` mm (in the level's frame), then onto the bone surface along the
 * screw's axis: the outside-to-inside crossing within 8 mm of the moved point, nearest it. */
export function movedEntry(f: ScrewField | null, lv: ScrewLevel, sd: ScrewSide, entry: V3, d: V3, medial: number, cranial: number): V3 {
  if (!medial && !cranial) return entry;
  const p = add(entry, add(mul(lv.frame.ex, -sideSign(sd) * medial), mul(lv.frame.ez, cranial)));
  if (!f) return p;
  let best: number | null = null;
  let prev = sdfAt(f, add(p, mul(d, -8)));
  for (let t = -7.9; t <= 8.0001; t += 0.1) {
    const v = sdfAt(f, add(p, mul(d, t)));
    if (prev > 0 && v <= 0 && (best === null || Math.abs(t) < Math.abs(best))) best = t;
    prev = v;
  }
  return best === null ? p : add(p, mul(d, best));
}

/** A technique's start position as screw settings: angles from its start direction, its start size, no entry shift. */
export function screwDefaults(level: string, tech: TechniqueId, sd: ScrewSide) {
  const lv = SCREW_LEVELS[screwKey(level, tech)];
  const st = lv.start[tech]![sd];
  const a = anglesOf(lv, sd, st.dir, tech);
  const r1 = (n: number) => Math.round(n * 10) / 10 + 0; // + 0: no negative zero (a link would bring back 0)
  return { tech, side: sd, medial: r1(a.medial), cranial: r1(a.cranial), length: r1(st.size.length), diameter: st.size.diameter, du: 0, dw: 0 };
}

/** Entry (before it is put back on the bone surface) and direction of a screw's settings. */
export function screwAxis(level: string, c: { tech: TechniqueId; side: ScrewSide; medial: number; cranial: number; du: number; dw: number }): { entry: V3; dir: V3 } {
  const lv = SCREW_LEVELS[screwKey(level, c.tech)];
  const st = lv.start[c.tech]![c.side];
  const dir = direction(lv, c.side, c.medial, c.cranial, c.tech);
  return { entry: movedEntry(null, lv, c.side, st.entry, dir, c.du, c.dw), dir };
}

/** The plane along a screw, cut open from above: through its axis, its normal the level's cranial axis made
 * perpendicular to the screw; and a camera position looking down onto it. */
export function screwCut(level: string, c: Parameters<typeof screwAxis>[1] & { length: number }): { normal: V3; point: V3; camera: V3 } {
  const lv = SCREW_LEVELS[screwKey(level, c.tech)];
  const { entry, dir } = screwAxis(level, c);
  const ez = lv.frame.ez;
  let n = sub(ez, mul(dir, dot(ez, dir)));
  n = mul(n, 1 / norm(n));
  const point = add(entry, mul(dir, c.length / 2));
  // from above the plane, tipped a little forwards so the view is not straight down the camera's up axis
  return { normal: n, point, camera: add(point, add(mul(n, 170), mul(lv.frame.ey, 10))) };
}
