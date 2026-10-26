import * as THREE from 'three';
import { z } from 'zod';
import drillJson from '../data/generated/spine-drill.json';
import { assetUrl } from '../viewer/assets';
import { gunzip } from './screw';

/**
 * Virtual drilling of a pair of adjacent cervical or lumbar vertebrae (pipeline/spine_drill.py writes the data): each
 * vertebra's bone field on the CT's grid (its FIELD_ISO surface is the drawn vertebra's), the CT, and the distances to
 * the dural sac, the roots and the vertebral arteries. A burr cuts its sphere out of the fields; the surface is rebuilt
 * where it changed (surface nets, in chunks). Bone no longer joined to its vertebra's body becomes a piece of its own,
 * which can be lifted off or drawn aside. Anatomy, not a simulation of the tissue: bone is simply taken away.
 */
const V3 = z.tuple([z.number(), z.number(), z.number()]);
/** a vertebra's body centre, axes (lateral, anterior, up) and spinous process (its base, tip and the canal's back wall
 * behind its middle), in the frame */
const LandmarkSchema = z.object({ body: V3, axes: z.tuple([V3, V3, V3]), spinous: z.object({ base: V3, tip: V3, wall: V3 }) });
export type Landmarks = z.infer<typeof LandmarkSchema>;
const PairSchema = z.object({
  id: z.string(), region: z.enum(['cervical', 'lumbar']), upper: z.string(), lower: z.string(), disc: z.string(), root: z.string(),
  artery: z.boolean(), file: z.string(), bytes: z.number(),
  dims: z.tuple([z.number(), z.number(), z.number()]), affine: z.array(z.array(z.number()).length(4)).length(4),
  check: z.record(z.object({ medianMm: z.number(), p95Mm: z.number() })),
  landmarks: z.tuple([LandmarkSchema, LandmarkSchema]),
});
export type DrillPair = z.infer<typeof PairSchema>;
export const DRILL = z.object({
  params: z.object({ fieldIso: z.number(), fieldHuStep: z.number(), boneHu: z.number(), densityMinHu: z.number(), densityStepHu: z.number(),
    distStepMm: z.number(), fields: z.array(z.string()) }),
  pairs: z.array(PairSchema),
}).parse(drillJson);
export const DRILL_PAIRS = new Map(DRILL.pairs.map((p) => [p.id, p]));
/** the pair drilled for a level: it and the vertebra below (cervical: the root of the foramen between them exits there;
 * lumbar: the one named for the lower traverses the segment) */
export const drillPairFor = (level: string | null): DrillPair | undefined => DRILL.pairs.find((p) => p.upper === `sp_${(level ?? '').toLowerCase()}`);

/** the burr: a round one, 4 mm in the neck and 5 mm in the lumbar spine (larger bones, more bone to take): drawing
 * choices */
export const BURR_MM_BY_REGION = { cervical: 4, lumbar: 5 } as const;
export const BURR_MM = BURR_MM_BY_REGION.cervical;
/** how fast a burr held against the bone goes in (mm a second), at first: a slider sets it (drawing choices) */
export const BURR_RATE_MM_S = { cervical: 4, lumbar: 8 } as const;
/** the slider's range and step (mm a second) */
export const BURR_RATE_RANGE: [number, number, number] = [1, 16, 1];
/** the burr cuts in steps of at least this (mm): smaller ones go in less than asked, the grid's values being whole
 * numbers (at 0.05 mm about half, at 0.2 mm nine-tenths) */
export const BURR_STEP_MM = 0.2;
/** the cut's field: units per mm across the burr's edge (the bone field's own, near its surface, is of this order) */
const CUT_GRADIENT = 60;
const CHUNK = 16;
/** an osteotome's cut (mm): wide enough that no two voxels touching across it are both left (the grid's diagonal is
 * 1.25 mm) */
export const KERF_MM = 1.5;
/** loose bits of bone smaller than this (mm3) are taken away with them (dust, as the suction takes it) */
export const CRUMB_MM3 = 3;
/** the spinous process is the bone behind its base joined to the bone within this (mm) of the line from its tip to its
 * base */
const SEED_MM = 3;
/** how far in front of the canal's back wall (mm) bone counts as the front of the vertebra, for telling which side a
 * lamina is still joined on */
const ATTACHED_FRONT_MM = 8;

export type Vertebra = 0 | 1;
/** One field of bone: a vertebra (where it lies, all of it still joined to its body) or a piece cut loose from one. */
export interface Layer {
  field: Uint8Array;
  vertebra: Vertebra;
  piece: boolean;
  /** where it is drawn, moved from where it lay, besides its vertebra's own move */
  offset: THREE.Vector3;
  /** lifted off */
  gone: boolean;
  /** its bone (mm3) */
  mm3: number;
  /** a piece: its centre (in the frame, where it lay) */
  centre: THREE.Vector3 | null;
}
export type Osteotomy = 'spinous' | 'split' | 'base';
export interface DrillSnapshot { layers: Layer[]; cut: Uint8Array; removed: [number, number] }
const copyLayer = (l: Layer): Layer => ({ ...l, field: l.field.slice(), offset: l.offset.clone(), centre: l.centre?.clone() ?? null });
export type Structure = 'dura' | 'root' | 'artery';
/** the burr stops where it would enter the dural sac, a root or a vertebral artery (closer than this to its surface,
 * mm): it does not drill past them to the bone behind */
export const STOP_MM = 0.3;
export interface Clearance { dura: number; root: number; artery: number }

export class DrillVolume {
  readonly nx: number; readonly ny: number; readonly nz: number;
  /** the bone: the two vertebrae (upper, lower) and the pieces cut loose, as cut */
  layers: Layer[];
  private readonly orig: [Uint8Array, Uint8Array];
  /** the burr's diameter (mm): by the region */
  readonly burrMm: number;
  /** which vertebrae are drilled (a laminectomy: only the upper; the other is drawn as it is) */
  readonly active: [boolean, boolean] = [true, true];
  readonly density: Uint8Array; readonly dura: Uint8Array; readonly root: Uint8Array; readonly artery: Uint8Array;
  /** where the burr has been: cut surfaces are coloured as cut bone */
  readonly cut: Uint8Array;
  readonly toRas: THREE.Matrix4; readonly toIjk: THREE.Matrix4;
  private readonly normalM: THREE.Matrix3;
  private readonly iso = DRILL.params.fieldIso;
  /** bone removed so far (mm3), per vertebra */
  readonly removedMm3: [number, number] = [0, 0];
  /** where each vertebra is drawn, moved from where it lies (a distraction): its bone, its pieces, cuts and surface
   * move with it; the structures at risk stay */
  readonly offsets: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly voxMm3: number;
  /** per vertebra, the bone of the CT not joined to its body (islands, bits of osteophyte): held as attached, so only
   * what is cut loose is loose */
  private islands: [number[], number[]] | null = null;

  constructor(readonly pair: DrillPair, buf: ArrayBuffer) {
    [this.nx, this.ny, this.nz] = pair.dims;
    const n = this.nx * this.ny * this.nz;
    const f = (k: number) => new Uint8Array(buf, k * n, n);
    this.burrMm = BURR_MM_BY_REGION[pair.region];
    this.orig = [f(0).slice(), f(1).slice()];
    this.layers = this.fresh();
    [this.density, this.dura, this.root, this.artery] = [f(2), f(3), f(4), f(5)];
    this.cut = new Uint8Array(n);
    const a = pair.affine;
    this.toRas = new THREE.Matrix4().set(a[0][0], a[0][1], a[0][2], a[0][3], a[1][0], a[1][1], a[1][2], a[1][3], a[2][0], a[2][1], a[2][2], a[2][3], 0, 0, 0, 1);
    this.toIjk = this.toRas.clone().invert();
    // normals: the field's gradient (in voxel steps) to the frame's directions
    this.normalM = new THREE.Matrix3().setFromMatrix4(this.toIjk).transpose();
    this.voxMm3 = Math.abs(new THREE.Matrix3().setFromMatrix4(this.toRas).determinant());
  }

  static async load(pair: DrillPair): Promise<DrillVolume> {
    const r = await fetch(assetUrl(pair.file));
    if (!r.ok) throw new Error(`${pair.file}: ${r.status}`);
    return new DrillVolume(pair, await gunzip(await r.arrayBuffer()));
  }

  private fresh(): Layer[] {
    return this.orig.map((o, v) => ({ field: o.slice(), vertebra: v as Vertebra, piece: false, offset: new THREE.Vector3(), gone: false, mm3: 0, centre: null }));
  }

  private idx(i: number, j: number, k: number): number { return (i * this.ny + j) * this.nz + k; }

  /** the layers drawn and drilled */
  live(l: number): boolean { const L = this.layers[l]; return !!L && !L.gone && this.active[L.vertebra]; }

  /** where a layer is drawn, moved from where it lies */
  shift(l: number): THREE.Vector3 { const L = this.layers[l]; return this.offsets[L.vertebra].clone().add(L.offset); }

  /** A field's value at a point in voxel coordinates (trilinear; outside: 0 for bone and the CT, 255 for distances). */
  sample(f: Uint8Array, x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x > this.nx - 1 || y > this.ny - 1 || z > this.nz - 1) return f === this.dura || f === this.root || f === this.artery ? 255 : 0;
    const i = Math.min(Math.floor(x), this.nx - 2), j = Math.min(Math.floor(y), this.ny - 2), k = Math.min(Math.floor(z), this.nz - 2);
    const u = x - i, v = y - j, w = z - k;
    const at = (a: number, b: number, c: number) => f[this.idx(i + a, j + b, k + c)];
    const l = (p: number, q: number, t: number) => p + (q - p) * t;
    return l(l(l(at(0, 0, 0), at(0, 0, 1), w), l(at(0, 1, 0), at(0, 1, 1), w), v), l(l(at(1, 0, 0), at(1, 0, 1), w), l(at(1, 1, 0), at(1, 1, 1), w), v), u);
  }

  /** Where a ray (in the frame) first meets bone, and which vertebra; or, if the dural sac, a root or a vertebral artery
   * comes first, where it meets that (`stop`): null if it meets neither. */
  hit(ray: THREE.Ray): { point: THREE.Vector3; vertebra: Vertebra | null; layer: number | null; stop?: Structure } | null {
    let best: { layer: number; t: number } | null = null;
    for (let l = 0; l < this.layers.length; l++) {
      if (!this.live(l)) continue;
      const t = this.hitOne(ray.origin.clone().sub(this.shift(l)), ray.direction, l);
      if (t !== null && (!best || t < best.t)) best = { layer: l, t };
    }
    const stop = this.stopAlong(ray, best ? best.t : Infinity);
    if (stop) return { point: ray.origin.clone().addScaledVector(ray.direction, stop.t), vertebra: null, layer: null, stop: stop.what };
    return best && { point: ray.origin.clone().addScaledVector(ray.direction, best.t), vertebra: this.layers[best.layer].vertebra, layer: best.layer };
  }

  /** The first point along a ray (before `before` mm) within STOP_MM of the dural sac, a root or a vertebral artery. */
  private stopAlong(ray: THREE.Ray, before: number): { t: number; what: Structure } | null {
    const o = ray.origin.clone().applyMatrix4(this.toIjk);
    const d = ray.origin.clone().add(ray.direction).applyMatrix4(this.toIjk).sub(o);
    const len = d.length();
    d.divideScalar(len);
    let t0 = 0, t1 = before * len;
    const hi = [this.nx - 1, this.ny - 1, this.nz - 1];
    for (let a = 0; a < 3; a++) {
      const oa = o.getComponent(a), da = d.getComponent(a);
      if (Math.abs(da) < 1e-9) { if (oa < 0 || oa > hi[a]) return null; continue; }
      let ta = (0 - oa) / da, tb = (hi[a] - oa) / da;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    const step = DRILL.params.distStepMm, lim = STOP_MM / step;
    for (let t = t0; t <= t1; t += 0.25) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      for (const [f, what] of [[this.dura, 'dura'], [this.root, 'root'], [this.artery, 'artery']] as const) {
        if (this.sample(f, x, y, z) <= lim) return { t: t / len, what };
      }
    }
    return null;
  }

  /** How far along a ray (frame mm, the layer's own position) it meets that layer's bone, or null. */
  private hitOne(origin: THREE.Vector3, dir: THREE.Vector3, l: number): number | null {
    const o = origin.clone().applyMatrix4(this.toIjk);
    const d = origin.clone().add(dir).applyMatrix4(this.toIjk).sub(o);
    const len = d.length();
    d.divideScalar(len);
    // the ray's span within the grid
    let t0 = 0, t1 = Infinity;
    const lo = [0, 0, 0], hi = [this.nx - 1, this.ny - 1, this.nz - 1];
    for (let a = 0; a < 3; a++) {
      const oa = o.getComponent(a), da = d.getComponent(a);
      if (Math.abs(da) < 1e-9) { if (oa < lo[a] || oa > hi[a]) return null; continue; }
      let ta = (lo[a] - oa) / da, tb = (hi[a] - oa) / da;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (t0 > t1) return null;
    const f = this.layers[l].field;
    const val = (t: number) => this.sample(f, o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
    for (let t = t0; t <= t1; t += 0.25) {
      if (val(t) < this.iso) continue;
      let a = Math.max(t0, t - 0.25), b = t;
      for (let s = 0; s < 8; s++) { const m = (a + b) / 2; if (val(m) >= this.iso) b = m; else a = m; }
      return b / len;   // voxel steps to frame mm along the ray
    }
    return null;
  }

  /** The burr's clearance (mm, from its surface) to the dural sac, the roots and the vertebral arteries, with its centre
   * here (in the frame). */
  clearance(c: THREE.Vector3): Clearance {
    const q = c.clone().applyMatrix4(this.toIjk), s = DRILL.params.distStepMm, r = this.burrMm / 2;
    const at = (f: Uint8Array) => this.sample(f, q.x, q.y, q.z) * s - r;
    return { dura: at(this.dura), root: at(this.root), artery: at(this.artery) };
  }

  /** Cut the burr's sphere out of the bone drilled, centred here (in the frame; each layer where it is drawn). Returns,
   * per layer, the voxel box it changed (or null). */
  carve(c: THREE.Vector3): ([THREE.Vector3, THREE.Vector3] | null)[] {
    return this.layers.map((_, l) => (this.live(l) ? this.carveOne(c.clone().sub(this.shift(l)), l) : null));
  }

  private carveOne(c: THREE.Vector3, l: number): [THREE.Vector3, THREE.Vector3] | null {
    const r = this.burrMm / 2;
    const reach = r + 255 / CUT_GRADIENT;   // where the cut's field can still lie below the bone's
    const corners = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => c.clone().add(new THREE.Vector3(sx, sy, sz).multiplyScalar(reach)).applyMatrix4(this.toIjk))));
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of corners) { lo.min(p); hi.max(p); }
    const i0 = Math.max(0, Math.floor(lo.x)), j0 = Math.max(0, Math.floor(lo.y)), k0 = Math.max(0, Math.floor(lo.z));
    const i1 = Math.min(this.nx - 1, Math.ceil(hi.x)), j1 = Math.min(this.ny - 1, Math.ceil(hi.y)), k1 = Math.min(this.nz - 1, Math.ceil(hi.z));
    if (i0 > i1 || j0 > j1 || k0 > k1) return null;
    const p = new THREE.Vector3(), L = this.layers[l], f = L.field, v = L.vertebra;
    let changed = false;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const dist = p.set(i, j, k).applyMatrix4(this.toRas).distanceTo(c);
      const s = this.iso + (dist - r) * CUT_GRADIENT;
      if (s >= 255) continue;
      const x = this.idx(i, j, k);
      const old = f[x];
      if (s >= old) continue;
      const nw = Math.max(0, Math.round(s));
      if (old >= this.iso && nw < this.iso) { this.removedMm3[v] += this.voxMm3; L.mm3 -= this.voxMm3; }
      f[x] = nw;
      changed = true;
      if (dist < r + 1) this.cut[x] = 1;
    }
    return changed ? [new THREE.Vector3(i0, j0, k0), new THREE.Vector3(i1, j1, k1)] : null;
  }

  /** A copy of the cut state, to go back to (undo). */
  snapshot(): DrillSnapshot {
    return { layers: this.layers.map(copyLayer), cut: this.cut.slice(), removed: [...this.removedMm3] as [number, number] };
  }

  restore(s: DrillSnapshot): void {
    this.layers = s.layers.map(copyLayer);
    this.cut.set(s.cut);
    this.removedMm3[0] = s.removed[0]; this.removedMm3[1] = s.removed[1];
  }

  reset(): void {
    this.layers = this.fresh();
    this.cut.fill(0);
    this.removedMm3[0] = this.removedMm3[1] = 0;
  }

  // ---------------------------------------------------------------- pieces
  /** The voxel nearest a point (in the frame, where the bone lies) whose bone is in `f`, within `reach` mm; or -1. */
  private boneNear(f: Uint8Array, p: THREE.Vector3, reach: number): number {
    const q = p.clone().applyMatrix4(this.toIjk), r = Math.ceil(reach / 0.7);
    let best = -1, bd = Infinity;
    const P = new THREE.Vector3();
    for (let i = Math.round(q.x) - r; i <= Math.round(q.x) + r; i++) for (let j = Math.round(q.y) - r; j <= Math.round(q.y) + r; j++)
      for (let k = Math.round(q.z) - r; k <= Math.round(q.z) + r; k++) {
        if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) continue;
        const x = this.idx(i, j, k);
        if (f[x] < this.iso) continue;
        const d = P.set(i, j, k).applyMatrix4(this.toRas).distanceTo(p);
        if (d <= reach && d < bd) { bd = d; best = x; }
      }
    return best;
  }

  /** The bone voxels of `f` within `r` mm of the segment from a to b (in the frame, where the bone lies). */
  private nearLine(f: Uint8Array, a: THREE.Vector3, b: THREE.Vector3, r: number): number[] {
    const lo = a.clone().min(b).subScalar(r), hi = a.clone().max(b).addScalar(r);
    const corners = [lo, hi].flatMap((x) => [lo, hi].flatMap((y) => [lo, hi].map((z) => new THREE.Vector3(x.x, y.y, z.z).applyMatrix4(this.toIjk))));
    const qlo = corners.reduce((m, c) => m.min(c), new THREE.Vector3(Infinity, Infinity, Infinity));
    const qhi = corners.reduce((m, c) => m.max(c), new THREE.Vector3(-Infinity, -Infinity, -Infinity));
    const seg = new THREE.Line3(a, b), P = new THREE.Vector3(), Q = new THREE.Vector3(), out: number[] = [];
    for (let i = Math.max(0, Math.floor(qlo.x)); i <= Math.min(this.nx - 1, Math.ceil(qhi.x)); i++)
      for (let j = Math.max(0, Math.floor(qlo.y)); j <= Math.min(this.ny - 1, Math.ceil(qhi.y)); j++)
        for (let k = Math.max(0, Math.floor(qlo.z)); k <= Math.min(this.nz - 1, Math.ceil(qhi.z)); k++) {
          const x = this.idx(i, j, k);
          if (f[x] < this.iso) continue;
          P.set(i, j, k).applyMatrix4(this.toRas);
          if (seg.closestPointToPoint(P, true, Q).distanceTo(P) <= r) out.push(x);
        }
    return out;
  }

  /** The bone voxels of `f` joined to the seeds (26-connected), only through voxels `ok` allows. */
  private flood(f: Uint8Array, seeds: number[], ok: (x: number) => boolean = () => true, seen = new Uint8Array(f.length)): number[] {
    const out: number[] = [], ny = this.ny, nz = this.nz, nx = this.nx;
    let stack = new Int32Array(1024), top = 0;
    for (const s of seeds) if (s >= 0 && !seen[s] && f[s] >= this.iso && ok(s)) { seen[s] = 1; if (top === stack.length) { const b = new Int32Array(top * 2); b.set(stack); stack = b; } stack[top++] = s; }
    while (top) {
      const x = stack[--top];
      out.push(x);
      const k = x % nz, j = ((x - k) / nz) % ny, i = (x - k - j * nz) / (nz * ny);
      for (let a = -1; a <= 1; a++) {
        const ii = i + a;
        if (ii < 0 || ii >= nx) continue;
        for (let b = -1; b <= 1; b++) {
          const jj = j + b;
          if (jj < 0 || jj >= ny) continue;
          for (let c = -1; c <= 1; c++) {
            const kk = k + c;
            if (kk < 0 || kk >= nz) continue;
            const y = (ii * ny + jj) * nz + kk;
            if (seen[y] || f[y] < this.iso || !ok(y)) continue;
            seen[y] = 1;
            if (top === stack.length) { const bb = new Int32Array(top * 2); bb.set(stack); stack = bb; }
            stack[top++] = y;
          }
        }
      }
    }
    return out;
  }

  private centreOf(vox: number[]): THREE.Vector3 {
    const c = new THREE.Vector3(), nz = this.nz, ny = this.ny;
    for (const x of vox) { const k = x % nz, j = ((x - k) / nz) % ny; c.x += (x - k - j * nz) / (nz * ny); c.y += j; c.z += k; }
    return c.divideScalar(Math.max(vox.length, 1)).applyMatrix4(this.toRas);
  }

  /**
   * Bone no longer joined (26-connected) to its vertebra's body becomes a piece of its own (or, smaller than
   * CRUMB_MM3, is taken away); a piece that has come apart becomes as many. Returns whether anything changed.
   */
  settle(): boolean {
    let changed = false;
    const n = this.layers.length;
    for (let l = 0; l < n; l++) {
      const L = this.layers[l];
      if (L.gone || !this.active[L.vertebra]) continue;
      const f = L.field, seen = new Uint8Array(f.length);
      let keep: number[];
      if (!L.piece) {
        const a = this.boneNear(f, new THREE.Vector3(...this.pair.landmarks[L.vertebra].body), 6);
        if (a < 0) continue;   // the body itself drilled away: nothing to tell attached from loose by
        keep = this.flood(f, [a, ...this.islandsOf(L.vertebra)], undefined, seen);
      } else keep = [];
      const parts: number[][] = [];
      for (let x = 0; x < f.length; x++) if (f[x] >= this.iso && !seen[x]) parts.push(this.flood(f, [x], undefined, seen));
      if (L.piece) {
        if (parts.length <= 1) continue;
        parts.sort((a, b) => b.length - a.length);
        keep = parts.shift()!;
        L.mm3 = keep.length * this.voxMm3;
        L.centre = this.centreOf(keep);
      }
      for (const part of parts) {
        changed = true;
        const mm3 = part.length * this.voxMm3;
        if (mm3 < CRUMB_MM3) {
          for (const x of part) f[x] = this.iso - 1;
          this.removedMm3[L.vertebra] += mm3;
          if (L.piece) L.mm3 -= mm3;
          continue;
        }
        // its voxels, and those round it (below the surface: how far out its surface lies), to a field of its own
        const g = new Uint8Array(f.length), inPart = new Uint8Array(f.length);
        for (const x of part) inPart[x] = 1;
        for (const x of part) {
          g[x] = f[x];
          const k = x % this.nz, j = ((x - k) / this.nz) % this.ny, i = (x - k - j * this.nz) / (this.nz * this.ny);
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
            const ii = i + a, jj = j + b, kk = k + c;
            if (ii < 0 || jj < 0 || kk < 0 || ii >= this.nx || jj >= this.ny || kk >= this.nz) continue;
            const y = this.idx(ii, jj, kk);
            if (!inPart[y]) g[y] = Math.max(g[y], f[y]);
          }
        }
        for (const x of part) f[x] = 0;
        this.layers.push({ field: g, vertebra: L.vertebra, piece: true, offset: L.offset.clone(), gone: false, mm3, centre: this.centreOf(part) });
        if (L.piece) L.mm3 -= mm3;
      }
    }
    return changed;
  }

  private islandsOf(v: Vertebra): number[] {
    if (!this.islands) {
      this.islands = [0, 1].map((u) => {
        const f = this.orig[u], seen = new Uint8Array(f.length);
        const a = this.boneNear(f, new THREE.Vector3(...this.pair.landmarks[u].body), 6);
        if (a >= 0) this.flood(f, [a], undefined, seen);
        const out: number[] = [];
        for (let x = 0; x < f.length; x++) if (f[x] >= this.iso && !seen[x]) out.push(x);
        return out;
      }) as [number[], number[]];
    }
    return this.islands[v];
  }

  /** Lift a piece off: it is taken away (its bone counted as removed). */
  lift(l: number): void {
    const L = this.layers[l];
    if (!L?.piece || L.gone) return;
    L.gone = true;
    this.removedMm3[L.vertebra] += L.mm3;
  }

  /** the pieces drawn */
  pieces(): number[] { return this.layers.map((_, l) => l).filter((l) => this.live(l) && this.layers[l].piece); }

  /** Where a point lies against a vertebra's spinous process (mm): across its midline (out to the side it is on, + to
   * the right of the frame's lateral axis) and in front of its base (+ forwards). */
  spinousAt(v: Vertebra, p: THREE.Vector3): { across: number; front: number } {
    const lm = this.pair.landmarks[v], b = new THREE.Vector3(...lm.spinous.base);
    const d = p.clone().sub(b);
    return { across: d.dot(new THREE.Vector3(...lm.axes[0])), front: d.dot(new THREE.Vector3(...lm.axes[1])) };
  }

  /** Whether any of a vertebra's spinous process is left behind its base (in its own bone, not a piece cut loose). */
  spinousLeft(v: Vertebra): boolean {
    const L = this.layers.find((x) => x.vertebra === v && !x.piece);
    if (!L) return false;
    const lm = this.pair.landmarks[v], base = new THREE.Vector3(...lm.spinous.base), ant = new THREE.Vector3(...lm.axes[1]);
    const P = new THREE.Vector3();
    return this.nearLine(L.field, new THREE.Vector3(...lm.spinous.tip), base, SEED_MM).some((x) => {
      const k = x % this.nz, j = ((x - k) / this.nz) % this.ny;
      return P.set((x - k - j * this.nz) / (this.nz * this.ny), j, k).applyMatrix4(this.toRas).sub(base).dot(ant) < -1;
    });
  }

  /**
   * Whether a vertebra's spinous process (its bone near the line from its tip to its base) is still joined to the front
   * of the vertebra (ATTACHED_FRONT_MM in front of the canal's back wall: the pedicles, the lateral masses, the body)
   * through the bone on each side of its midline (the patient's left and right). Null if no spinous process is left.
   */
  attachment(v: Vertebra): { L: boolean; R: boolean } | null {
    const L = this.layers.find((x) => x.vertebra === v && !x.piece);
    if (!L) return null;
    const lm = this.pair.landmarks[v];
    const base = new THREE.Vector3(...lm.spinous.base), lat = new THREE.Vector3(...lm.axes[0]), ant = new THREE.Vector3(...lm.axes[1]);
    const seeds = this.nearLine(L.field, new THREE.Vector3(...lm.spinous.tip), base, SEED_MM);
    if (!seeds.length) return null;
    const P = new THREE.Vector3();
    const at = (x: number) => { const k = x % this.nz, j = ((x - k) / this.nz) % this.ny; return P.set((x - k - j * this.nz) / (this.nz * this.ny), j, k).applyMatrix4(this.toRas).sub(base); };
    const front = new THREE.Vector3(...lm.spinous.wall).sub(base).dot(ant) + ATTACHED_FRONT_MM;
    const joined = (sign: number) => {
      const side = (x: number) => sign * at(x).dot(lat) > 1;
      let reached = false;
      this.flood(L.field, seeds.filter(side), (x) => { if (reached) return false; const ok = side(x); if (ok && at(x).dot(ant) > front) reached = true; return ok; });
      return reached;
    };
    // the frame's lateral axis points to the patient's right
    return { L: joined(-1), R: joined(1) };
  }

  /**
   * One cut at a vertebra's spinous process (the bone joined to its tip behind its base, in every layer of the
   * vertebra): taking it off at its base (`spinous`, as with a rongeur), or an osteotome's cut KERF_MM wide along its
   * midline down to its base (`split`) or across its base (`base`). Returns the voxel boxes changed, per layer.
   */
  osteotomy(v: Vertebra, kind: Osteotomy): ([THREE.Vector3, THREE.Vector3] | null)[] {
    const lm = this.pair.landmarks[v];
    const tip = new THREE.Vector3(...lm.spinous.tip), base = new THREE.Vector3(...lm.spinous.base);
    const lat = new THREE.Vector3(...lm.axes[0]), ant = new THREE.Vector3(...lm.axes[1]);
    // per voxel: across the midline and in front of the base (mm), linear in i, j, k
    const o = new THREE.Vector3().applyMatrix4(this.toRas).sub(base);
    const cols = [0, 1, 2].map((a) => new THREE.Vector3(...[0, 1, 2].map((r) => this.toRas.elements[a * 4 + r]) as [number, number, number]));
    const lin = (e: THREE.Vector3) => [o.dot(e), cols[0].dot(e), cols[1].dot(e), cols[2].dot(e)];
    const [la, li, lj, lk] = lin(lat), [aa, ai, aj, ak] = lin(ant);
    const ijk = (x: number) => { const k = x % this.nz, j = ((x - k) / this.nz) % this.ny; return [(x - k - j * this.nz) / (this.nz * this.ny), j, k]; };
    const across = (x: number) => { const [i, j, k] = ijk(x); return la + li * i + lj * j + lk * k; };
    const front = (x: number) => { const [i, j, k] = ijk(x); return aa + ai * i + aj * j + ak * k; };
    const half = KERF_MM / 2;
    const sd = kind === 'spinous' ? (x: number) => front(x)
      : kind === 'split' ? (x: number) => Math.max(Math.abs(across(x)) - half, front(x) - half)
        : (x: number) => Math.abs(front(x)) - half;
    return this.layers.map((L, l) => {
      if (L.vertebra !== v || !this.live(l)) return null;
      const f = L.field;
      // the spinous process in this layer: the bone behind the base joined to the bone near the line from its tip to its
      // base (all of it: once split, its halves are joined only through the bone in front)
      const seeds = this.nearLine(f, tip, base, SEED_MM).filter((x) => front(x) < 0);
      const sp = this.flood(f, seeds, (x) => front(x) < 0);
      if (!sp.length) return null;
      // it and two voxels round it (where its surface and the cut through its base lie)
      const reg = new Uint8Array(f.length);
      let ring = sp;
      for (const x of sp) reg[x] = 1;
      for (let it = 0; it < 2; it++) {
        const next: number[] = [];
        for (const x of ring) {
          const [i, j, k] = ijk(x);
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
            const ii = i + a, jj = j + b, kk = k + c;
            if (ii < 0 || jj < 0 || kk < 0 || ii >= this.nx || jj >= this.ny || kk >= this.nz) continue;
            const y = this.idx(ii, jj, kk);
            if (!reg[y]) { reg[y] = 1; next.push(y); }
          }
        }
        ring = next;
      }
      const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      let changed = false;
      for (let x = 0; x < f.length; x++) {
        if (!reg[x]) continue;
        const d = sd(x), s = this.iso + d * CUT_GRADIENT;
        if (s >= f[x]) continue;
        const old = f[x], nw = Math.max(0, Math.round(s));
        if (old >= this.iso && nw < this.iso) { this.removedMm3[v] += this.voxMm3; L.mm3 -= this.voxMm3; }
        f[x] = nw;
        if (d > -1) this.cut[x] = 1;
        const [i, j, k] = ijk(x);
        lo.min(new THREE.Vector3(i, j, k)); hi.max(new THREE.Vector3(i, j, k));
        changed = true;
      }
      return changed ? [lo, hi] as [THREE.Vector3, THREE.Vector3] : null;
    });
  }

  get chunks(): [number, number, number] {
    return [Math.ceil((this.nx - 1) / CHUNK), Math.ceil((this.ny - 1) / CHUNK), Math.ceil((this.nz - 1) / CHUNK)];
  }

  /** The chunks a voxel box touches (with a cell round it: surface nets' quads reach one cell back). */
  chunksOf(lo: THREE.Vector3, hi: THREE.Vector3): [number, number, number][] {
    const [cx, cy, cz] = this.chunks, out: [number, number, number][] = [];
    const a = (x: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(x / CHUNK)));
    for (let i = a(lo.x - 2, cx); i <= a(hi.x + 1, cx); i++) for (let j = a(lo.y - 2, cy); j <= a(hi.y + 1, cy); j++)
      for (let k = a(lo.z - 2, cz); k <= a(hi.z + 1, cz); k++) out.push([i, j, k]);
    return out;
  }

  /**
   * One chunk of one layer's surface (surface nets): a vertex in each cell the surface crosses (the mean of where it
   * crosses the cell's edges), a quad across each crossed edge; normals from the field's gradient, colours per vertex
   * (`colour`). Positions in the frame. Null if the surface does not pass through the chunk.
   */
  mesh(l: number, ci: number, cj: number, ck: number, colour: (p: THREE.Vector3, n: THREE.Vector3, ijk: THREE.Vector3) => [number, number, number]): THREE.BufferGeometry | null {
    const f = this.layers[l].field, iso = this.iso;
    const x0 = ci * CHUNK, y0 = cj * CHUNK, z0 = ck * CHUNK;
    const x1 = Math.min(x0 + CHUNK, this.nx - 1), y1 = Math.min(y0 + CHUNK, this.ny - 1), z1 = Math.min(z0 + CHUNK, this.nz - 1);
    // cells from one before the chunk (its quads reach back one cell) to its end
    const bx = Math.max(x0 - 1, 0), by = Math.max(y0 - 1, 0), bz = Math.max(z0 - 1, 0);
    const sx = x1 - bx, sy = y1 - by, sz = z1 - bz;
    const vid = new Int32Array(sx * sy * sz).fill(-1);
    const pos: number[] = [], nor: number[] = [], col: number[] = [], ind: number[] = [];
    const g = (i: number, j: number, k: number) => f[this.idx(i, j, k)];
    const P = new THREE.Vector3(), N = new THREE.Vector3(), Q = new THREE.Vector3();
    const E: [number, number, number, number, number, number][] = [
      [0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1],
      [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
    const cellVertex = (i: number, j: number, k: number): number => {
      const ci2 = ((i - bx) * sy + (j - by)) * sz + (k - bz);
      if (vid[ci2] !== -1) return vid[ci2];
      let n = 0, px = 0, py = 0, pz = 0;
      for (const [a, b, c, d, e, h] of E) {
        const va = g(i + a, j + b, k + c), vb = g(i + d, j + e, k + h);
        if ((va >= iso) === (vb >= iso)) continue;
        const t = (iso - va) / (vb - va);
        px += i + a + (d - a) * t; py += j + b + (e - b) * t; pz += k + c + (h - c) * t; n++;
      }
      if (!n) return (vid[ci2] = -2);
      Q.set(px / n, py / n, pz / n);
      // outward normal: down the field's gradient, to the frame
      const s = (dx: number, dy: number, dz: number) => this.sample(f, Q.x + dx, Q.y + dy, Q.z + dz);
      N.set(s(-0.5, 0, 0) - s(0.5, 0, 0), s(0, -0.5, 0) - s(0, 0.5, 0), s(0, 0, -0.5) - s(0, 0, 0.5)).applyMatrix3(this.normalM).normalize();
      P.copy(Q).applyMatrix4(this.toRas);
      const id = pos.length / 3;
      pos.push(P.x, P.y, P.z); nor.push(N.x, N.y, N.z); col.push(...colour(P, N, Q));
      return (vid[ci2] = id);
    };
    const inside = (i: number, j: number, k: number) => g(i, j, k) >= iso;
    const quad = (a: number, b: number, c: number, d: number, out: THREE.Vector3) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      // wound so its face points out of the bone (`out`): the quad's normal from its diagonals (one of its triangles
      // can be a sliver)
      const at = (x: number) => new THREE.Vector3(pos[x * 3], pos[x * 3 + 1], pos[x * 3 + 2]);
      const fn = at(c).sub(at(a)).cross(at(d).sub(at(b)));
      if (fn.dot(out) >= 0) ind.push(a, b, c, a, c, d); else ind.push(a, c, b, a, d, c);
    };
    const dirOut = (i: number, j: number, k: number, di: number, dj: number, dk: number) => {
      const o = new THREE.Vector3(di, dj, dk).applyMatrix3(new THREE.Matrix3().setFromMatrix4(this.toRas));
      return inside(i, j, k) ? o : o.negate();
    };
    for (let i = x0; i < x1; i++) for (let j = y0; j < y1; j++) for (let k = z0; k < z1; k++) {
      // the edges from voxel (i, j, k) along each axis; each crossed one gets the quad of the four cells round it
      if (i + 1 < this.nx && j >= 1 && k >= 1 && inside(i, j, k) !== inside(i + 1, j, k))
        quad(cellVertex(i, j - 1, k - 1), cellVertex(i, j, k - 1), cellVertex(i, j, k), cellVertex(i, j - 1, k), dirOut(i, j, k, 1, 0, 0));
      if (j + 1 < this.ny && i >= 1 && k >= 1 && inside(i, j, k) !== inside(i, j + 1, k))
        quad(cellVertex(i - 1, j, k - 1), cellVertex(i, j, k - 1), cellVertex(i, j, k), cellVertex(i - 1, j, k), dirOut(i, j, k, 0, 1, 0));
      if (k + 1 < this.nz && i >= 1 && j >= 1 && inside(i, j, k) !== inside(i, j, k + 1))
        quad(cellVertex(i - 1, j - 1, k), cellVertex(i, j - 1, k), cellVertex(i, j, k), cellVertex(i - 1, j, k), dirOut(i, j, k, 0, 0, 1));
    }
    if (!ind.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(ind);
    geo.computeBoundingSphere();
    return geo;
  }

  /** At a point (voxel coordinates): whether the burr cut near it, the CT (HU) a little inside the surface, and the
   * distances (mm) to the dural sac, the roots and the vertebral arteries. */
  at(q: THREE.Vector3, n: THREE.Vector3): { cut: boolean; hu: number; dura: number; root: number; artery: number } {
    const i = Math.round(q.x), j = Math.round(q.y), k = Math.round(q.z);
    let cut = false;
    for (let a = -1; a <= 1 && !cut; a++) for (let b = -1; b <= 1 && !cut; b++) for (let c = -1; c <= 1 && !cut; c++) {
      const x = i + a, y = j + b, z = k + c;
      if (x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz && this.cut[this.idx(x, y, z)]) cut = true;
    }
    // the CT a millimetre in (n: outward, in the frame; to voxel steps)
    const inn = n.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(this.toIjk)).multiplyScalar(-1);
    const p = DRILL.params, s = p.distStepMm;
    return { cut, hu: p.densityMinHu + this.sample(this.density, q.x + inn.x, q.y + inn.y, q.z + inn.z) * p.densityStepHu,
      dura: this.sample(this.dura, q.x, q.y, q.z) * s, root: this.sample(this.root, q.x, q.y, q.z) * s, artery: this.sample(this.artery, q.x, q.y, q.z) * s };
  }
}
