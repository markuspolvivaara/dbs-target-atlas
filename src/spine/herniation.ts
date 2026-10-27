import * as THREE from 'three';
import type { LesionZone } from './content';

/**
 * A schematic disc herniation and what it does to the dural sac and the roots (there is none on this CT): its shape a
 * signed distance (mm, + outside), from the disc's margin towards a zone's position; the sac and the roots pushed out of
 * it, smoothly, and where a root cannot give way (bone behind it) it is flattened. Anatomy drawn by rule, not a
 * simulation of the tissue. Independent of the drilling: whatever draws it gives it the disc and, optionally, the bone.
 */
export type HerniaType = 'protrusion' | 'extrusion';
export interface HerniaSpec {
  zone: LesionZone;
  side: 'L' | 'R';
  type: HerniaType;
  /** how far it reaches beyond the disc's margin (mm) */
  sizeMm: number;
  /** an extrusion's fragment moved along the spine (mm, + up) */
  migrateMm: number;
}
export const HERNIA_SIZE: [number, number, number] = [2, 15, 0.5];
export const HERNIA_MIGRATE: [number, number, number] = [-10, 10, 1];
/** where each zone's size starts (mm; drawing choices): on this CT the dural sac and the schematic roots lie a few mm behind
 * the disc's margin, so a paracentral one must reach further to touch the traversing root */
export const HERNIA_DEFAULT_SIZE: Record<LesionZone, number> = { paracentral: 10, foraminal: 6, farlateral: 7 };

/** a protrusion's base reaches at most this far to each side (mm; a drawing choice) */
const PROTRUSION_HALF_WIDTH_MM = 9;

export interface HerniaShape {
  sdf: (p: THREE.Vector3) => number;
  /** a box round it (frame mm) */
  lo: THREE.Vector3; hi: THREE.Vector3;
  /** where it leaves the disc, and the way it points */
  anchor: THREE.Vector3; dir: THREE.Vector3;
  /** its core: a line through its middle, from inside the disc out (what it pushes things away from) */
  core: THREE.Vector3[];
}

/** an ellipsoid's signed distance (approximate; q in its own axes, radii r) */
function ellipsoid(q: THREE.Vector3, r: THREE.Vector3): number {
  const k0 = Math.hypot(q.x / r.x, q.y / r.y, q.z / r.z), k1 = Math.hypot(q.x / (r.x * r.x), q.y / (r.y * r.y), q.z / (r.z * r.z));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r.x, r.y, r.z);
}
/** a capsule's (segment a-b, radius r) */
function capsule(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r: number): number {
  const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t)) - r;
}
/** a smooth union (k: how far the blend reaches, mm) */
function smin(a: number, b: number, k: number): number {
  const h = THREE.MathUtils.clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}

/**
 * The herniation's shape: from the disc's margin where the line from the disc's centre to the zone's position (`toward`)
 * leaves it (`anchor`), outwards. A protrusion: half an ellipsoid on a base wider than it is deep (Eslami 2026), no taller
 * than the disc allows. An extrusion: a narrow neck through the annulus and a larger fragment, moved along the spine by
 * `migrateMm`. `up` is the spine's direction there, `discHeight` the disc's height (mm). A protrusion leans `lift` mm up the
 * spine at its tip (a foraminal one, towards the exiting root in the foramen's upper part).
 */
export function herniaShape(spec: HerniaSpec, anchor: THREE.Vector3, toward: THREE.Vector3, up: THREE.Vector3, discHeight: number, lift = 0): HerniaShape {
  const dir = toward.clone().sub(anchor);
  dir.addScaledVector(up, -dir.dot(up)).normalize();   // in the disc's plane
  const side = new THREE.Vector3().crossVectors(up, dir).normalize();
  const D = spec.sizeMm;
  if (spec.type === 'protrusion') {
    // depth, half-width, half-height: the base wider than the depth, at most PROTRUSION_HALF_WIDTH_MM to a side, no taller
    // than the disc allows
    const w = THREE.MathUtils.clamp(D * 1.2, 5, PROTRUSION_HALF_WIDTH_MM);
    const r = new THREE.Vector3(D, w, Math.min(w, discHeight * 0.5 + 1));
    const sdf = (p: THREE.Vector3) => {
      const q = p.clone().sub(anchor), d = q.dot(dir);
      // leaning: the further out, the further up
      return ellipsoid(new THREE.Vector3(d, q.dot(side), q.dot(up) - lift * THREE.MathUtils.clamp(d / D, 0, 1)), r);
    };
    const e = Math.max(r.x, r.y, r.z) + Math.abs(lift) + 1;
    const core = [anchor.clone().addScaledVector(dir, -2), anchor.clone().addScaledVector(dir, D * 0.6).addScaledVector(up, lift * 0.6)];
    return { sdf, lo: anchor.clone().subScalar(e), hi: anchor.clone().addScalar(e), anchor, dir, core };
  }
  // an extrusion: neck (radius N) out of the disc, the fragment (radius R) beyond it, moved along the spine
  const N = THREE.MathUtils.clamp(D * 0.3, 1.5, 3), R = Math.max(D * 0.55, N * 1.8);
  const neckIn = anchor.clone().addScaledVector(dir, -2), neckOut = anchor.clone().addScaledVector(dir, Math.max(D - 2 * R, N));
  const frag = anchor.clone().addScaledVector(dir, D - R).addScaledVector(up, spec.migrateMm);
  const rf = new THREE.Vector3(R, R * 1.15, R * 1.3);   // a little longer along the spine, as a migrated fragment is
  const sdf = (p: THREE.Vector3) => {
    const q = p.clone().sub(frag);
    const f = ellipsoid(new THREE.Vector3(q.dot(dir), q.dot(side), q.dot(up)), rf);
    const neck = Math.min(capsule(p, neckIn, neckOut, N), capsule(p, neckOut, frag, N));
    return smin(f, neck, 1.5);
  };
  const pts = [neckIn, neckOut, frag];
  const lo = pts.reduce((m, x) => m.min(x), pts[0].clone()).subScalar(rf.z + 2), hi = pts.reduce((m, x) => m.max(x), pts[0].clone()).addScalar(rf.z + 2);
  return { sdf, lo, hi, anchor, dir, core: [neckIn, neckOut, frag] };
}

/** The gradient of a signed distance (unit, + outwards). */
export function gradient(sdf: (p: THREE.Vector3) => number, p: THREE.Vector3, h = 0.2): THREE.Vector3 {
  const g = new THREE.Vector3(
    sdf(new THREE.Vector3(p.x + h, p.y, p.z)) - sdf(new THREE.Vector3(p.x - h, p.y, p.z)),
    sdf(new THREE.Vector3(p.x, p.y + h, p.z)) - sdf(new THREE.Vector3(p.x, p.y - h, p.z)),
    sdf(new THREE.Vector3(p.x, p.y, p.z + h)) - sdf(new THREE.Vector3(p.x, p.y, p.z - h)));
  const l = g.length();
  return l > 1e-9 ? g.divideScalar(l) : new THREE.Vector3(0, 0, 1);
}

/** A signed distance's surface as a mesh (surface nets on a grid of `step` mm over the box). */
export function meshSdf(sdf: (p: THREE.Vector3) => number, lo: THREE.Vector3, hi: THREE.Vector3, step = 0.4): THREE.BufferGeometry {
  const n = [0, 1, 2].map((a) => Math.max(2, Math.ceil((hi.getComponent(a) - lo.getComponent(a)) / step) + 1));
  const [nx, ny, nz] = n;
  const val = new Float32Array(nx * ny * nz);
  const P = new THREE.Vector3();
  const id = (i: number, j: number, k: number) => (i * ny + j) * nz + k;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) val[id(i, j, k)] = sdf(P.set(lo.x + i * step, lo.y + j * step, lo.z + k * step));
  const vid = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [], ind: number[] = [];
  const E = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0],
    [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
  const cell = (i: number, j: number, k: number): number => {
    if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) return -1;
    const c = id(i, j, k);
    if (vid[c] !== -1) return vid[c];
    let cnt = 0, px = 0, py = 0, pz = 0;
    for (const [a, b, cc, d, e, f] of E) {
      const va = val[id(i + a, j + b, k + cc)], vb = val[id(i + d, j + e, k + f)];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      px += i + a + (d - a) * t; py += j + b + (e - b) * t; pz += k + cc + (f - cc) * t; cnt++;
    }
    if (!cnt) return (vid[c] = -2);
    pos.push(lo.x + (px / cnt) * step, lo.y + (py / cnt) * step, lo.z + (pz / cnt) * step);
    return (vid[c] = pos.length / 3 - 1);
  };
  // each quad wound so that it faces out (from the edge's inside end to its outside end)
  const at = (x: number) => new THREE.Vector3(pos[x * 3], pos[x * 3 + 1], pos[x * 3 + 2]);
  const quad = (a: number, b: number, c: number, d: number, out: THREE.Vector3) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const fn = at(c).sub(at(a)).cross(at(d).sub(at(b)));
    if (fn.dot(out) >= 0) ind.push(a, b, c, a, c, d); else ind.push(a, c, b, a, d, c);
  };
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) for (let k = 0; k < nz - 1; k++) {
    const inside = val[id(i, j, k)] < 0, sg = inside ? 1 : -1;
    if (j >= 1 && k >= 1 && inside !== (val[id(i + 1, j, k)] < 0)) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), new THREE.Vector3(sg, 0, 0));
    if (i >= 1 && k >= 1 && inside !== (val[id(i, j + 1, k)] < 0)) quad(cell(i - 1, j, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i - 1, j, k), new THREE.Vector3(0, sg, 0));
    if (i >= 1 && j >= 1 && inside !== (val[id(i, j, k + 1)] < 0)) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), new THREE.Vector3(0, 0, sg));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}

/** The direction from the nearest point of a polyline to p (unit). */
function awayFrom(line: THREE.Vector3[], p: THREE.Vector3): THREE.Vector3 {
  let best = Infinity, q = line[0];
  const seg = new THREE.Line3(), c = new THREE.Vector3();
  for (let i = 0; i + 1 < line.length; i++) {
    seg.set(line[i], line[i + 1]).closestPointToPoint(p, true, c);
    const d = c.distanceToSquared(p);
    if (d < best) { best = d; q = c.clone(); }
  }
  const g = p.clone().sub(q);
  return g.lengthSq() > 1e-12 ? g.normalize() : new THREE.Vector3(0, 0, 1);
}

/** Each vertex's neighbours, from a mesh's triangles. */
function neighbours(index: ArrayLike<number>, n: number): number[][] {
  const nb: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
  }
  return nb.map((s) => [...s]);
}

export interface PushResult {
  /** how far each vertex was moved (mm) */
  moved: Float32Array;
  /** how far each vertex is still inside the herniation's clearance, the bone not letting it go further (mm) */
  pinned: Float32Array;
}

/**
 * A mesh pushed out of a herniation (positions in place, in the frame): each vertex closer than `clear` mm to it moved
 * straight away from its core until it is `clear` mm out (both walls of something thin it reaches into move the same
 * way, rather than being split), the moves spread over the mesh (`spread` rounds of averaging with the neighbours:
 * few for the dural sac, which is dented, many for a root, which gives way as a whole) and each vertex still moved at
 * least its own way out. With `blocked`, a move stops where it would enter bone: what is left is how far that vertex is
 * pinned (the root flattened between the herniation and the bone).
 */
export function pushOut(pos: THREE.BufferAttribute, index: ArrayLike<number>, sdf: (p: THREE.Vector3) => number, core: THREE.Vector3[], opts: {
  clear: number; spread: number; reach: number; blocked?: (p: THREE.Vector3) => boolean;
  /** move together everything within this (mm): a root's cross-section, which shifts as a whole rather than dents */
  rigid?: number;
}): PushResult {
  const n = pos.count, P = new THREE.Vector3();
  const need = new Float32Array(n), g: THREE.Vector3[] = new Array(n), near: number[] = [];
  for (let v = 0; v < n; v++) {
    P.fromBufferAttribute(pos, v);
    const s = sdf(P);
    if (s > opts.reach) continue;
    near.push(v);
    g[v] = awayFrom(core, P);
    if (s >= opts.clear) continue;
    // how far along it until clear of the herniation (stepping out, then halving)
    let t0 = 0, t1 = 0.25;
    while (t1 < 40 && sdf(P.clone().addScaledVector(g[v], t1)) < opts.clear) { t0 = t1; t1 += 0.25; }
    for (let k = 0; k < 6; k++) { const m = (t0 + t1) / 2; if (sdf(P.clone().addScaledVector(g[v], m)) < opts.clear) t0 = m; else t1 = m; }
    need[v] = t1;
  }
  const moved = new Float32Array(n), pinned = new Float32Array(n);
  if (!near.some((v) => need[v] > 0)) return { moved, pinned };
  const nb = neighbours(index, n);
  const D: THREE.Vector3[] = Array.from({ length: n }, () => new THREE.Vector3());
  for (const v of near) D[v].copy(g[v]).multiplyScalar(need[v]);
  // spread over the mesh near the herniation (the region grown a few rings round it)
  const region = new Set(near);
  let ring = near;
  for (let r = 0; r < Math.min(opts.spread, 12); r++) {
    const next: number[] = [];
    for (const v of ring) for (const w of nb[v]) if (!region.has(w)) { region.add(w); next.push(w); }
    ring = next;
  }
  const reg = [...region];
  if (opts.rigid) {   // each vertex moved as far as the furthest-pushed one within `rigid` of it
    const pushed = near.filter((v) => need[v] > 0), pv = new THREE.Vector3(), pw = new THREE.Vector3();
    const r2 = opts.rigid * opts.rigid;
    for (const v of reg) {
      pv.fromBufferAttribute(pos, v);
      let best = need[v], dir = g[v];
      for (const w of pushed) if (need[w] > best && pw.fromBufferAttribute(pos, w).distanceToSquared(pv) <= r2) { best = need[w]; dir = g[w]; }
      if (best > 0 && dir) { D[v].copy(dir).multiplyScalar(best); if (!g[v]) { g[v] = dir; } if (best > need[v]) { need[v] = best; if (!near.includes(v)) near.push(v); } }
    }
  }
  for (let it = 0; it < opts.spread; it++) {
    const nd = reg.map((v) => {
      const a = new THREE.Vector3();
      for (const w of nb[v]) a.add(D[w]);
      return a.divideScalar(Math.max(nb[v].length, 1)).multiplyScalar(0.5).addScaledVector(D[v], 0.5);
    });
    reg.forEach((v, i) => D[v].copy(nd[i]));
    for (const v of near) {   // each still moved at least its own way out
      const short = need[v] - D[v].dot(g[v]);
      if (short > 0) D[v].addScaledVector(g[v], short);
    }
  }
  for (const v of reg) {
    const len = D[v].length();
    if (len < 1e-4) continue;
    P.fromBufferAttribute(pos, v);
    let t = 1;
    if (opts.blocked) {   // no further than the bone lets it
      const steps = Math.max(1, Math.ceil(len / 0.25));
      for (let k = 1; k <= steps; k++) if (opts.blocked(P.clone().addScaledVector(D[v], k / steps))) { t = (k - 1) / steps; break; }
    }
    P.addScaledVector(D[v], t);
    pos.setXYZ(v, P.x, P.y, P.z);
    moved[v] = len * t;
    if (t < 1) pinned[v] = Math.max(0, opts.clear - sdf(P));
  }
  pos.needsUpdate = true;
  return { moved, pinned };
}

/**
 * A closed mesh's cross-section area (mm²) where a plane cuts it, within `reach` mm of `centre` (a mesh outwardly
 * wound: the loops' signed areas add up).
 */
export function sectionArea(pos: THREE.BufferAttribute, index: ArrayLike<number>, centre: THREE.Vector3, normal: THREE.Vector3, reach: number): number {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let sum = 0;
  const d = (p: THREE.Vector3) => p.clone().sub(centre).dot(normal);
  for (let t = 0; t < index.length; t += 3) {
    a.fromBufferAttribute(pos, index[t]); b.fromBufferAttribute(pos, index[t + 1]); c.fromBufferAttribute(pos, index[t + 2]);
    if (a.distanceTo(centre) > reach) continue;
    const vs = [a, b, c], ds = vs.map(d);
    const cut: THREE.Vector3[] = [];
    for (let e = 0; e < 3; e++) {
      const p = vs[e], q = vs[(e + 1) % 3], dp = ds[e], dq = ds[(e + 1) % 3];
      if ((dp < 0) !== (dq < 0)) cut.push(p.clone().lerp(q, dp / (dp - dq)));
    }
    if (cut.length !== 2) continue;
    // the segment runs so that the triangle's outward normal lies to its right, looking along the plane's normal
    const tn = b.clone().sub(a).cross(c.clone().sub(a));
    let [p, q] = cut;
    if (q.clone().sub(p).cross(normal).dot(tn) < 0) [p, q] = [q, p];
    sum += p.clone().sub(centre).cross(q.clone().sub(centre)).dot(normal) / 2;
  }
  return Math.abs(sum);
}
