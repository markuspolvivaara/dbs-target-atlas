import * as THREE from 'three';
import { z } from 'zod';
import drillJson from '../data/generated/spine-drill.json';
import { assetUrl } from '../viewer/assets';
import { gunzip } from './screw';

/**
 * Virtual drilling of a pair of adjacent cervical vertebrae (pipeline/spine_drill.py writes the data): each vertebra's
 * bone field on the CT's grid (its FIELD_ISO surface is the drawn vertebra's), the CT, and the distances to the dural
 * sac, the roots and the vertebral arteries. A burr cuts its sphere out of both fields; the surface is rebuilt where it
 * changed (surface nets, in chunks). Anatomy, not a simulation of the tissue: bone is simply taken away.
 */
const PairSchema = z.object({
  id: z.string(), upper: z.string(), lower: z.string(), disc: z.string(), root: z.string(), file: z.string(), bytes: z.number(),
  dims: z.tuple([z.number(), z.number(), z.number()]), affine: z.array(z.array(z.number()).length(4)).length(4),
  check: z.record(z.object({ medianMm: z.number(), p95Mm: z.number() })),
});
export type DrillPair = z.infer<typeof PairSchema>;
export const DRILL = z.object({
  params: z.object({ fieldIso: z.number(), fieldHuStep: z.number(), boneHu: z.number(), densityMinHu: z.number(), densityStepHu: z.number(),
    distStepMm: z.number(), fields: z.array(z.string()) }),
  pairs: z.array(PairSchema),
}).parse(drillJson);
export const DRILL_PAIRS = new Map(DRILL.pairs.map((p) => [p.id, p]));
/** the pair drilled for a level: it and the vertebra below (the root of the foramen between them exits there) */
export const drillPairFor = (level: string | null): DrillPair | undefined => DRILL.pairs.find((p) => p.upper === `sp_${(level ?? '').toLowerCase()}`);

/** the burr: a 4 mm round one */
export const BURR_MM = 4;
/** how fast a burr held against the bone goes in (mm a second): a drawing choice */
export const BURR_RATE_MM_S = 4;
/** the burr cuts in steps of at least this (mm): smaller ones go in less than asked, the grid's values being whole
 * numbers (at 0.05 mm about half, at 0.2 mm nine-tenths) */
export const BURR_STEP_MM = 0.2;
/** the cut's field: units per mm across the burr's edge (the bone field's own, near its surface, is of this order) */
const CUT_GRADIENT = 60;
const CHUNK = 16;

export type Vertebra = 0 | 1;
export type Structure = 'dura' | 'root' | 'artery';
/** the burr stops where it would enter the dural sac, a root or a vertebral artery (closer than this to its surface,
 * mm): it does not drill past them to the bone behind */
export const STOP_MM = 0.3;
export interface Clearance { dura: number; root: number; artery: number }

export class DrillVolume {
  readonly nx: number; readonly ny: number; readonly nz: number;
  /** the two vertebrae's bone fields (upper, lower), as cut */
  readonly bone: [Uint8Array, Uint8Array];
  private readonly orig: [Uint8Array, Uint8Array];
  readonly density: Uint8Array; readonly dura: Uint8Array; readonly root: Uint8Array; readonly artery: Uint8Array;
  /** where the burr has been: cut surfaces are coloured as cut bone */
  readonly cut: Uint8Array;
  readonly toRas: THREE.Matrix4; readonly toIjk: THREE.Matrix4;
  private readonly normalM: THREE.Matrix3;
  private readonly iso = DRILL.params.fieldIso;
  /** bone removed so far (mm3), per vertebra */
  readonly removedMm3: [number, number] = [0, 0];
  /** where each vertebra is drawn, moved from where it lies (a distraction): its bone, cuts and surface move with it;
   * the structures at risk stay */
  readonly offsets: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly voxMm3: number;

  constructor(readonly pair: DrillPair, buf: ArrayBuffer) {
    [this.nx, this.ny, this.nz] = pair.dims;
    const n = this.nx * this.ny * this.nz;
    const f = (k: number) => new Uint8Array(buf, k * n, n);
    this.bone = [f(0).slice(), f(1).slice()];
    this.orig = [f(0).slice(), f(1).slice()];
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

  private idx(i: number, j: number, k: number): number { return (i * this.ny + j) * this.nz + k; }

  /** A field's value at a point in voxel coordinates (trilinear; outside: 0). */
  sample(f: Uint8Array, x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x > this.nx - 1 || y > this.ny - 1 || z > this.nz - 1) return f === this.bone[0] || f === this.bone[1] || f === this.density ? 0 : 255;
    const i = Math.min(Math.floor(x), this.nx - 2), j = Math.min(Math.floor(y), this.ny - 2), k = Math.min(Math.floor(z), this.nz - 2);
    const u = x - i, v = y - j, w = z - k;
    const at = (a: number, b: number, c: number) => f[this.idx(i + a, j + b, k + c)];
    const l = (p: number, q: number, t: number) => p + (q - p) * t;
    return l(l(l(at(0, 0, 0), at(0, 0, 1), w), l(at(0, 1, 0), at(0, 1, 1), w), v), l(l(at(1, 0, 0), at(1, 0, 1), w), l(at(1, 1, 0), at(1, 1, 1), w), v), u);
  }

  /** Where a ray (in the frame) first meets bone, and which vertebra; or, if the dural sac, a root or a vertebral artery
   * comes first, where it meets that (`stop`): null if it meets neither. */
  hit(ray: THREE.Ray): { point: THREE.Vector3; vertebra: Vertebra | null; stop?: Structure } | null {
    let best: { vertebra: Vertebra; t: number } | null = null;
    for (const v of [0, 1] as Vertebra[]) {
      const t = this.hitOne(ray.origin.clone().sub(this.offsets[v]), ray.direction, v);
      if (t !== null && (!best || t < best.t)) best = { vertebra: v, t };
    }
    const stop = this.stopAlong(ray, best ? best.t : Infinity);
    if (stop) return { point: ray.origin.clone().addScaledVector(ray.direction, stop.t), vertebra: null, stop: stop.what };
    return best && { point: ray.origin.clone().addScaledVector(ray.direction, best.t), vertebra: best.vertebra };
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

  /** How far along a ray (frame mm, the vertebra's own position) it meets that vertebra's bone, or null. */
  private hitOne(origin: THREE.Vector3, dir: THREE.Vector3, v: Vertebra): number | null {
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
    const f = this.bone[v];
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
    const q = c.clone().applyMatrix4(this.toIjk), s = DRILL.params.distStepMm, r = BURR_MM / 2;
    const at = (f: Uint8Array) => this.sample(f, q.x, q.y, q.z) * s - r;
    return { dura: at(this.dura), root: at(this.root), artery: at(this.artery) };
  }

  /** Cut the burr's sphere out of both vertebrae, centred here (in the frame; each vertebra where it is drawn). Returns,
   * per vertebra, the voxel box it changed (or null). */
  carve(c: THREE.Vector3): [[THREE.Vector3, THREE.Vector3] | null, [THREE.Vector3, THREE.Vector3] | null] {
    return [this.carveOne(c.clone().sub(this.offsets[0]), 0), this.carveOne(c.clone().sub(this.offsets[1]), 1)];
  }

  private carveOne(c: THREE.Vector3, v: Vertebra): [THREE.Vector3, THREE.Vector3] | null {
    const r = BURR_MM / 2;
    const reach = r + 255 / CUT_GRADIENT;   // where the cut's field can still lie below the bone's
    const corners = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => c.clone().add(new THREE.Vector3(sx, sy, sz).multiplyScalar(reach)).applyMatrix4(this.toIjk))));
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of corners) { lo.min(p); hi.max(p); }
    const i0 = Math.max(0, Math.floor(lo.x)), j0 = Math.max(0, Math.floor(lo.y)), k0 = Math.max(0, Math.floor(lo.z));
    const i1 = Math.min(this.nx - 1, Math.ceil(hi.x)), j1 = Math.min(this.ny - 1, Math.ceil(hi.y)), k1 = Math.min(this.nz - 1, Math.ceil(hi.z));
    if (i0 > i1 || j0 > j1 || k0 > k1) return null;
    const p = new THREE.Vector3(), f = this.bone[v];
    let changed = false;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const dist = p.set(i, j, k).applyMatrix4(this.toRas).distanceTo(c);
      const s = this.iso + (dist - r) * CUT_GRADIENT;
      if (s >= 255) continue;
      const x = this.idx(i, j, k);
      const old = f[x];
      if (s >= old) continue;
      const nw = Math.max(0, Math.round(s));
      if (old >= this.iso && nw < this.iso) this.removedMm3[v] += this.voxMm3;
      f[x] = nw;
      changed = true;
      if (dist < r + 1) this.cut[x] = 1;
    }
    return changed ? [new THREE.Vector3(i0, j0, k0), new THREE.Vector3(i1, j1, k1)] : null;
  }

  /** A copy of the cut state, to go back to (undo). */
  snapshot(): { bone: [Uint8Array, Uint8Array]; cut: Uint8Array; removed: [number, number] } {
    return { bone: [this.bone[0].slice(), this.bone[1].slice()], cut: this.cut.slice(), removed: [...this.removedMm3] as [number, number] };
  }

  restore(s: { bone: [Uint8Array, Uint8Array]; cut: Uint8Array; removed: [number, number] }): void {
    this.bone[0].set(s.bone[0]); this.bone[1].set(s.bone[1]); this.cut.set(s.cut);
    this.removedMm3[0] = s.removed[0]; this.removedMm3[1] = s.removed[1];
  }

  reset(): void {
    this.restore({ bone: this.orig, cut: new Uint8Array(this.cut.length), removed: [0, 0] });
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
   * One chunk of one vertebra's surface (surface nets): a vertex in each cell the surface crosses (the mean of where it
   * crosses the cell's edges), a quad across each crossed edge; normals from the field's gradient, colours per vertex
   * (`colour`). Positions in the frame. Null if the surface does not pass through the chunk.
   */
  mesh(v: Vertebra, ci: number, cj: number, ck: number, colour: (p: THREE.Vector3, n: THREE.Vector3, ijk: THREE.Vector3) => [number, number, number]): THREE.BufferGeometry | null {
    const f = this.bone[v], iso = this.iso;
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
