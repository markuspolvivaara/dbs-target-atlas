import * as THREE from 'three';
import { geometryOf } from './endoray';

/**
 * Faster picking (the audit's finding P1-09). three.js's own `Mesh.raycast` tests every triangle of a mesh, and a
 * hover pick runs on every pointer move: 15 to 37 ms per move in the skull base, vascular and ventricles sections.
 * Here each mesh's triangles are put once into a bounding-volume tree (in the mesh's own coordinates, for the shape it
 * shows: its morph targets off, or one of them full on), and a ray tests only the triangles in the boxes it passes
 * through. The hits are the ones three.js would give (every triangle the ray crosses on the side the material draws,
 * within the raycaster's near and far), so the ranking and the clipping in the viewer's pick are unchanged.
 *
 * The trees are built when a mesh is first picked, in idle time, one mesh at a time; until a mesh's tree is ready, and
 * while a morph target is on its way between off and on, that mesh is picked as before.
 */

const LEAF = 8;

export class TriBvh {
  /** triangle order: each leaf is a run of it */
  private readonly order: Uint32Array;
  /** per node: min x, y, z, max x, y, z */
  private readonly box: Float32Array;
  /** per node: a leaf's (first, -count) in `order`, an inner node's (left, right) children */
  private readonly link: Int32Array;
  private stack = new Int32Array(64);

  constructor(readonly pos: Float32Array, readonly index: Uint32Array) {
    const n = Math.floor(index.length / 3);
    const order = new Uint32Array(n);
    const cen = new Float32Array(n * 3);
    for (let t = 0; t < n; t++) {
      order[t] = t;
      const a = index[t * 3] * 3, b = index[t * 3 + 1] * 3, c = index[t * 3 + 2] * 3;
      for (let k = 0; k < 3; k++) cen[t * 3 + k] = (pos[a + k] + pos[b + k] + pos[c + k]) / 3;
    }
    const box: number[] = [], link: number[] = [];
    // (node, first, end) to split; a node's slot is taken when it is pushed
    const todo: number[] = [0, 0, n];
    box.push(0, 0, 0, 0, 0, 0); link.push(0, 0);
    while (todo.length) {
      const end = todo.pop()!, first = todo.pop()!, node = todo.pop()!;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      let cx0 = Infinity, cy0 = Infinity, cz0 = Infinity, cx1 = -Infinity, cy1 = -Infinity, cz1 = -Infinity;
      for (let i = first; i < end; i++) {
        const t = order[i];
        for (let v = 0; v < 3; v++) {
          const j = index[t * 3 + v] * 3, x = pos[j], y = pos[j + 1], z = pos[j + 2];
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        const x = cen[t * 3], y = cen[t * 3 + 1], z = cen[t * 3 + 2];
        if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y; if (z < cz0) cz0 = z; if (z > cz1) cz1 = z;
      }
      box[node * 6] = x0; box[node * 6 + 1] = y0; box[node * 6 + 2] = z0; box[node * 6 + 3] = x1; box[node * 6 + 4] = y1; box[node * 6 + 5] = z1;
      const ex = cx1 - cx0, ey = cy1 - cy0, ez = cz1 - cz0;
      const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
      const extent = axis === 0 ? ex : axis === 1 ? ey : ez;
      if (end - first <= LEAF || !(extent > 0)) { link[node * 2] = first; link[node * 2 + 1] = -(end - first); continue; }
      // split at the middle of the centroids' extent (both sides are then non-empty)
      const mid = (axis === 0 ? cx0 : axis === 1 ? cy0 : cz0) + extent / 2;
      let i = first, j = end - 1;
      while (i <= j) {
        if (cen[order[i] * 3 + axis] < mid) i++;
        else { const s = order[i]; order[i] = order[j]; order[j] = s; j--; }
      }
      const left = box.length / 6, right = left + 1;
      box.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); link.push(0, 0, 0, 0);
      link[node * 2] = left; link[node * 2 + 1] = right;
      todo.push(left, first, i, right, i, end);
    }
    this.order = order;
    this.box = Float32Array.from(box);
    this.link = Int32Array.from(link);
  }

  /** Every triangle the ray (origin o, unit direction d) crosses within `far`, on the side `side` draws:
   * `hit(t, triangle)`. Möller–Trumbore; a triangle faces the ray when the ray meets its counter-clockwise side, as in
   * three.js. */
  cast(o: THREE.Vector3, d: THREE.Vector3, side: THREE.Side, far: number, hit: (t: number, tri: number) => void): void {
    const { pos, index, order, box, link } = this;
    const ox = o.x, oy = o.y, oz = o.z, dx = d.x, dy = d.y, dz = d.z;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    let stack = this.stack, top = 0;
    stack[top++] = 0;
    while (top) {
      const node = stack[--top], b = node * 6;
      // the slab test (a ray parallel to an axis has an infinite inverse there, and the comparisons still hold; an
      // origin exactly on such a face gives NaN, and then the box is kept rather than lost)
      let t0 = (box[b] - ox) * ix, t1 = (box[b + 3] - ox) * ix;
      let tmin = Math.min(t0, t1), tmax = Math.max(t0, t1);
      t0 = (box[b + 1] - oy) * iy; t1 = (box[b + 4] - oy) * iy;
      tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
      t0 = (box[b + 2] - oz) * iz; t1 = (box[b + 5] - oz) * iz;
      tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
      if (!Number.isNaN(tmin) && !Number.isNaN(tmax) && (tmax < Math.max(tmin, 0) || tmin > far)) continue;
      const l = link[node * 2], r = link[node * 2 + 1];
      if (r < 0) {
        for (let k = l, e = l - r; k < e; k++) {
          const t = order[k];
          const a = index[t * 3] * 3, p = index[t * 3 + 1] * 3, q = index[t * 3 + 2] * 3;
          const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
          const e1x = pos[p] - ax, e1y = pos[p + 1] - ay, e1z = pos[p + 2] - az;
          const e2x = pos[q] - ax, e2y = pos[q + 1] - ay, e2z = pos[q + 2] - az;
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          // det > 0: the ray meets the front (counter-clockwise) face
          if (det === 0 || (side === THREE.FrontSide && det < 0) || (side === THREE.BackSide && det > 0)) continue;
          const inv = 1 / det;
          const sx = ox - ax, sy = oy - ay, sz = oz - az;
          const u = (sx * px + sy * py + sz * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
          const v = (dx * qx + dy * qy + dz * qz) * inv;
          if (v < 0 || u + v > 1) continue;
          const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (tt >= 0 && tt <= far) hit(tt, t);
        }
      } else {
        if (top + 2 > stack.length) { const s = new Int32Array(stack.length * 2); s.set(stack); stack = this.stack = s; }
        stack[top++] = l; stack[top++] = r;
      }
    }
  }
}

/** a geometry's trees, by the shape: 'base' (morph targets off) or the indices of the targets full on ('0', '1,3') */
const trees = new WeakMap<THREE.BufferGeometry, Map<string, TriBvh>>();
const queue: { g: THREE.BufferGeometry; key: string; on: number[] }[] = [];
const queued = new WeakMap<THREE.BufferGeometry, Set<string>>();
let scheduled = false;

/** The shape a mesh shows as a key, or null while a morph target is part way (then it is picked as before). */
function shapeOf(m: THREE.Mesh): { key: string; on: number[] } | null {
  const w = m.morphTargetInfluences;
  if (!w || !w.some((x) => x !== 0)) return { key: 'base', on: [] };
  if (w.some((x) => x !== 0 && x !== 1)) return null;
  const on = w.flatMap((x, i) => (x === 1 ? [i] : []));
  return { key: on.join(','), on };
}

function build(g: THREE.BufferGeometry, on: number[]): TriBvh {
  const { base, morphs, index } = geometryOf(g);
  let pos = base;
  if (on.length) {
    pos = base.slice();
    for (const k of on) { const D = morphs[k]; if (D) for (let i = 0; i < pos.length; i++) pos[i] += D[i]; }
  }
  return new TriBvh(pos, index);
}

/** Idle time: the browser's, or a short timeout with a budget of 12 ms: where the page leaves no idle time (a view
 * drawn on every frame, slow drawing) and the request times out, or where there is no requestIdleCallback (Safari
 * before 2025). */
const BUDGET_MS = 12;
const budget = (t0: number) => () => BUDGET_MS - (performance.now() - t0);
const idle: (cb: (left: () => number) => void) => void = typeof requestIdleCallback === 'function'
  ? (cb) => { requestIdleCallback((d) => cb(d.didTimeout ? budget(performance.now()) : () => d.timeRemaining()), { timeout: 200 }); }
  : (cb) => { setTimeout(() => cb(budget(performance.now())), 30); };

/** Build what is queued, at least one tree per call and more while the idle period lasts. */
function drain(left: () => number): void {
  scheduled = false;
  do {
    const job = queue.shift();
    if (!job) return;
    queued.get(job.g)?.delete(job.key);
    let per = trees.get(job.g);
    if (!per) trees.set(job.g, per = new Map());
    if (!per.has(job.key)) per.set(job.key, build(job.g, job.on));
  } while (queue.length && left() > 4);
  if (queue.length) { scheduled = true; idle(drain); }
}

/** The tree for the shape this mesh shows; null (and one asked for, in idle time) when it is not built yet. */
export function treeFor(m: THREE.Mesh): TriBvh | null {
  const g = m.geometry;
  const shape = shapeOf(m);
  if (!shape) return null;
  const t = trees.get(g)?.get(shape.key);
  if (t) return t;
  let q = queued.get(g);
  if (!q) queued.set(g, q = new Set());
  if (!q.has(shape.key)) {
    q.add(shape.key);
    queue.push({ g, key: shape.key, on: shape.on });
    if (!scheduled) { scheduled = true; idle(drain); }
  }
  return null;
}

/** Build now, without waiting for idle time (tests). */
export function buildTreeNow(m: THREE.Mesh): TriBvh | null {
  const shape = shapeOf(m);
  if (!shape) return null;
  let per = trees.get(m.geometry);
  if (!per) trees.set(m.geometry, per = new Map());
  let t = per.get(shape.key);
  if (!t) per.set(shape.key, t = build(m.geometry, shape.on));
  return t;
}

const _inv = new THREE.Matrix4();
const _ray = new THREE.Ray();
const _sphere = new THREE.Sphere();
const _box = new THREE.Box3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/**
 * `Mesh.raycast` through the mesh's tree (assigned to a mesh as `mesh.raycast = fastRaycast`). A mesh this does not
 * cover (no tree yet, a morph part way, several materials, a draw range or groups) goes to three.js's own.
 */
export function fastRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, out: THREE.Intersection[]): void {
  const g = this.geometry, mat = this.material;
  const plain = mat !== undefined && !Array.isArray(mat) && g.groups.length === 0 && g.drawRange.start === 0
    && (g.drawRange.count === Infinity || g.drawRange.count >= (g.index ? g.index.count : g.getAttribute('position').count));
  const tree = plain ? treeFor(this) : null;
  if (!tree) { THREE.Mesh.prototype.raycast.call(this, raycaster, out); return; }
  // as three.js: the bounding sphere in the world, then the ray in the mesh's own space against its bounding box
  if (g.boundingSphere === null) g.computeBoundingSphere();
  _sphere.copy(g.boundingSphere!).applyMatrix4(this.matrixWorld);
  if (!raycaster.ray.intersectsSphere(_sphere)) return;
  _inv.copy(this.matrixWorld).invert();
  _ray.copy(raycaster.ray).applyMatrix4(_inv);
  if (g.boundingBox === null) g.computeBoundingBox();
  if (!_ray.intersectsBox(_box.copy(g.boundingBox!))) return;
  const side = (mat as THREE.Material).side;
  const { pos, index } = tree;
  tree.cast(_ray.origin, _ray.direction, side, Infinity, (t, tri) => {
    const point = _ray.at(t, new THREE.Vector3()).applyMatrix4(this.matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(point);
    if (distance < raycaster.near || distance > raycaster.far) return;
    const a = index[tri * 3], b = index[tri * 3 + 1], c = index[tri * 3 + 2];
    const normal = new THREE.Vector3();
    THREE.Triangle.getNormal(_a.fromArray(pos, a * 3), _b.fromArray(pos, b * 3), _c.fromArray(pos, c * 3), normal);
    out.push({ distance, point, object: this, face: { a, b, c, normal, materialIndex: 0 }, faceIndex: tri });
  });
}
