import * as THREE from 'three';

/**
 * Rays against the endoscope's meshes as drawn (their morph targets applied), on a uniform grid. three.js's own
 * raycast tests every triangle of a mesh and morphs each as it goes, too slow to run on every frame as the scope
 * moves; here the meshes are baked into world space once (per set of meshes and shapes) and a ray tests only the
 * triangles in the cells it passes through.
 */
export interface RayHit { node: THREE.Mesh; distance: number; point: THREE.Vector3; normal: THREE.Vector3 }

const MAX_CELLS = 1 << 21;

export class RayGrid {
  private readonly tri: Float32Array;       // 9 floats per triangle, world space
  private readonly own: Int32Array;         // the node of each triangle
  private readonly lo = new THREE.Vector3();
  private readonly hi = new THREE.Vector3();
  private readonly cell: number;
  private readonly dim: [number, number, number];
  private readonly start: Int32Array;       // cell -> its triangles in `items` (CSR)
  private readonly items: Int32Array;
  private readonly stamp: Int32Array;       // the last ray that tested each triangle (one test per ray)
  private ray = 0;

  constructor(private readonly nodes: THREE.Mesh[]) {
    const parts: Float32Array[] = [];
    let n = 0;
    for (const node of nodes) {
      node.updateWorldMatrix(true, false);
      const g = geometryOf(node.geometry);
      const V = g.base.slice();
      g.morphs.forEach((D, k) => {
        const w = node.morphTargetInfluences?.[k] ?? 0;
        if (w) for (let i = 0; i < V.length; i++) V[i] += w * D[i];
      });
      const e = node.matrixWorld.elements;
      for (let i = 0; i < V.length; i += 3) {
        const x = V[i], y = V[i + 1], z = V[i + 2];
        V[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
        V[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        V[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
      const idx = g.index, nt = idx.length / 3;
      const T = new Float32Array(nt * 9);
      for (let t = 0; t < nt * 3; t++) {
        const j = idx[t] * 3;
        T[t * 3] = V[j]; T[t * 3 + 1] = V[j + 1]; T[t * 3 + 2] = V[j + 2];
      }
      parts.push(T);
      n += nt;
    }
    this.tri = new Float32Array(n * 9);
    this.own = new Int32Array(n);
    let o = 0;
    parts.forEach((T, k) => { this.tri.set(T, o * 9); this.own.fill(k, o, o + T.length / 9); o += T.length / 9; });
    this.stamp = new Int32Array(n);
    // the grid: cells of about the triangles' size, no more than MAX_CELLS of them
    let ax = Infinity, ay = Infinity, az = Infinity, bx = -Infinity, by = -Infinity, bz = -Infinity;
    for (let i = 0; i < n * 9; i += 3) {
      const x = this.tri[i], y = this.tri[i + 1], z = this.tri[i + 2];
      if (x < ax) ax = x; if (x > bx) bx = x; if (y < ay) ay = y; if (y > by) by = y; if (z < az) az = z; if (z > bz) bz = z;
    }
    this.lo.set(ax, ay, az); this.hi.set(bx, by, bz);
    if (!n) { this.lo.set(0, 0, 0); this.hi.set(1, 1, 1); }
    this.lo.subScalar(1e-3); this.hi.addScalar(1e-3);
    const size = this.hi.clone().sub(this.lo);
    this.cell = Math.max(1.5, Math.cbrt((size.x * size.y * size.z) / MAX_CELLS));
    this.dim = [0, 1, 2].map((a) => Math.max(1, Math.ceil(size.getComponent(a) / this.cell))) as [number, number, number];
    const ncell = this.dim[0] * this.dim[1] * this.dim[2];
    // each triangle's range of cells, then the cells' lists (counted, then filled)
    const R = new Int32Array(n * 6);
    const lx = this.lo.x, ly = this.lo.y, lz = this.lo.z, inv = 1 / this.cell;
    const [dx, dy, dz] = this.dim;
    const cl = (x: number, d: number) => (x < 0 ? 0 : x >= d ? d - 1 : x);
    const T = this.tri;
    const count = new Int32Array(ncell + 1);
    for (let t = 0; t < n; t++) {
      const i = t * 9;
      const x0 = Math.min(T[i], T[i + 3], T[i + 6]), x1 = Math.max(T[i], T[i + 3], T[i + 6]);
      const y0 = Math.min(T[i + 1], T[i + 4], T[i + 7]), y1 = Math.max(T[i + 1], T[i + 4], T[i + 7]);
      const z0 = Math.min(T[i + 2], T[i + 5], T[i + 8]), z1 = Math.max(T[i + 2], T[i + 5], T[i + 8]);
      const r = t * 6;
      R[r] = cl(Math.floor((x0 - lx) * inv), dx); R[r + 1] = cl(Math.floor((x1 - lx) * inv), dx);
      R[r + 2] = cl(Math.floor((y0 - ly) * inv), dy); R[r + 3] = cl(Math.floor((y1 - ly) * inv), dy);
      R[r + 4] = cl(Math.floor((z0 - lz) * inv), dz); R[r + 5] = cl(Math.floor((z1 - lz) * inv), dz);
      for (let a = R[r]; a <= R[r + 1]; a++) for (let b = R[r + 2]; b <= R[r + 3]; b++) for (let c = R[r + 4]; c <= R[r + 5]; c++) count[a + dx * (b + dy * c) + 1]++;
    }
    for (let c = 0; c < ncell; c++) count[c + 1] += count[c];
    this.start = count;
    this.items = new Int32Array(count[ncell]);
    const fill = count.slice(0, ncell);
    for (let t = 0; t < n; t++) {
      const r = t * 6;
      for (let a = R[r]; a <= R[r + 1]; a++) for (let b = R[r + 2]; b <= R[r + 3]; b++) for (let c = R[r + 4]; c <= R[r + 5]; c++) this.items[fill[a + dx * (b + dy * c)]++] = t;
    }
  }

  private idx(x: number, ax: number): number {
    return Math.min(this.dim[ax] - 1, Math.max(0, Math.floor((x - this.lo.getComponent(ax)) / this.cell)));
  }

  /** The hits along the ray (o, unit d) within `far`, nearest first: all of them, or only the first. Both sides of a
   * triangle are hit; `normal` is its geometric one (the meshes are wound outward). `accept`: which nodes count. */
  cast(o: THREE.Vector3, d: THREE.Vector3, opts: { far?: number; all?: boolean; accept?: (n: THREE.Mesh) => boolean } = {}): RayHit[] {
    const far = opts.far ?? Infinity;
    // the ray's span inside the grid's box
    let t0 = 0, t1 = far;
    for (let a = 0; a < 3; a++) {
      const oa = o.getComponent(a), da = d.getComponent(a), la = this.lo.getComponent(a), ha = this.hi.getComponent(a);
      if (Math.abs(da) < 1e-12) { if (oa < la || oa > ha) return []; continue; }
      let ta = (la - oa) / da, tb = (ha - oa) / da;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return [];
    }
    this.ray = (this.ray + 1) | 0;
    if (this.ray === 0) { this.stamp.fill(0); this.ray = 1; }
    const cur = [0, 1, 2].map((a) => this.idx(o.getComponent(a) + d.getComponent(a) * t0, a));
    const step = [0, 1, 2].map((a) => (d.getComponent(a) > 0 ? 1 : -1));
    const tMax = [0, 1, 2].map((a) => {
      const da = d.getComponent(a);
      if (Math.abs(da) < 1e-12) return Infinity;
      const edge = this.lo.getComponent(a) + (cur[a] + (da > 0 ? 1 : 0)) * this.cell;
      return (edge - o.getComponent(a)) / da;
    });
    const tDelta = [0, 1, 2].map((a) => { const da = Math.abs(d.getComponent(a)); return da < 1e-12 ? Infinity : this.cell / da; });
    const hits: { t: number; tri: number }[] = [];
    let best = Infinity;
    const T = this.tri;
    for (;;) {
      const c = cur[0] + this.dim[0] * (cur[1] + this.dim[1] * cur[2]);
      for (let s = this.start[c]; s < this.start[c + 1]; s++) {
        const t = this.items[s];
        if (this.stamp[t] === this.ray) continue;
        this.stamp[t] = this.ray;
        if (opts.accept && !opts.accept(this.nodes[this.own[t]])) continue;
        const h = intersect(T, t * 9, o, d);
        if (h >= 0 && h <= far) { hits.push({ t: h, tri: t }); best = Math.min(best, h); }
      }
      const exit = Math.min(tMax[0], tMax[1], tMax[2]);
      if (!opts.all && best <= exit) break;
      if (exit > t1) break;
      const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      cur[a] += step[a];
      if (cur[a] < 0 || cur[a] >= this.dim[a]) break;
      tMax[a] += tDelta[a];
    }
    hits.sort((x, y) => x.t - y.t);
    return (opts.all ? hits : hits.slice(0, 1)).map(({ t, tri }) => {
      const e1 = new THREE.Vector3(T[tri * 9 + 3] - T[tri * 9], T[tri * 9 + 4] - T[tri * 9 + 1], T[tri * 9 + 5] - T[tri * 9 + 2]);
      const e2 = new THREE.Vector3(T[tri * 9 + 6] - T[tri * 9], T[tri * 9 + 7] - T[tri * 9 + 1], T[tri * 9 + 8] - T[tri * 9 + 2]);
      return { node: this.nodes[this.own[tri]], distance: t, point: o.clone().addScaledVector(d, t), normal: e1.cross(e2).normalize() };
    });
  }
}

/** A geometry's positions, morph offsets (as glTF's, relative) and triangles as plain arrays, read once: its
 * attributes may be quantized, and reading them through three.js's accessors on every bake is slow. */
const geometries = new WeakMap<THREE.BufferGeometry, { base: Float32Array; morphs: Float32Array[]; index: Uint32Array }>();
export function geometryOf(g: THREE.BufferGeometry): { base: Float32Array; morphs: Float32Array[]; index: Uint32Array } {
  let c = geometries.get(g);
  if (c) return c;
  const read = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) { out[i * 3] = a.getX(i); out[i * 3 + 1] = a.getY(i); out[i * 3 + 2] = a.getZ(i); }
    return out;
  };
  const base = read(g.getAttribute('position'));
  const morphs = (g.morphAttributes.position ?? []).map((a) => {
    const D = read(a);
    if (!g.morphTargetsRelative) for (let i = 0; i < D.length; i++) D[i] -= base[i];
    return D;
  });
  const index = g.index ? Uint32Array.from({ length: g.index.count }, (_, i) => g.index!.getX(i)) : Uint32Array.from({ length: base.length / 3 - (base.length / 3) % 3 }, (_, i) => i);
  c = { base, morphs, index };
  geometries.set(g, c);
  return c;
}

/** Möller–Trumbore, both sides: the ray's parameter at the triangle, or -1. */
function intersect(T: Float32Array, i: number, o: THREE.Vector3, d: THREE.Vector3): number {
  const ax = T[i], ay = T[i + 1], az = T[i + 2];
  const e1x = T[i + 3] - ax, e1y = T[i + 4] - ay, e1z = T[i + 5] - az;
  const e2x = T[i + 6] - ax, e2y = T[i + 7] - ay, e2z = T[i + 8] - az;
  const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det;
  const sx = o.x - ax, sy = o.y - ay, sz = o.z - az;
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const w = (d.x * qx + d.y * qy + d.z * qz) * inv;
  if (w < 0 || u + w > 1) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= 0 ? t : -1;
}

/** The grid for these meshes as drawn now, rebuilt only when the set or their shapes change. */
export class RayGridCache {
  private key = '';
  private grid: RayGrid | null = null;

  get(nodes: THREE.Mesh[]): RayGrid {
    const key = nodes.map((n) => `${n.uuid}:${n.geometry.uuid}:${(n.morphTargetInfluences ?? []).map((w) => w.toFixed(4)).join(',')}`).join('|');
    if (!this.grid || key !== this.key) { this.grid = new RayGrid(nodes); this.key = key; }
    return this.grid;
  }
}
