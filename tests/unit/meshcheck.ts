import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

/**
 * Measurements for mesh-checks.test.ts, on the files as they are served. Every reader takes the folder that holds
 * `assets/` (the site's `public/` by default), so that the same checks can be run on older files.
 */

export const PUBLIC = new URL('../../public/', import.meta.url);

async function io() {
  await MeshoptDecoder.ready;
  return new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

/** One mesh node of a file: where it lies and what is wrong with its arrays. */
export interface NodeStats {
  file: string;
  node: string;
  modes: number[];
  verts: number;
  /** mean x of its vertices (mm; x < 0 is the left) */
  meanX: number;
  lo: [number, number, number];
  hi: [number, number, number];
  nonFinite: number;
  badIndices: number;
  triangles: number;
  /** triangles with a corner repeated */
  degenerate: number;
  /** triangles without area, in the mesh and in every shape it morphs to (pipeline/triangles.mjs takes them out) */
  flat: number;
  /** triangles drawn a second time over the same corners in the same order */
  twice: number;
  normals: number;
  badNormals: number;
}

/** Every mesh node of a file, in the scene's millimetres. */
export async function nodeStats(file: string, root: URL = PUBLIC): Promise<NodeStats[]> {
  const doc = await (await io()).readBinary(new Uint8Array(readFileSync(new URL(file, root))));
  const out: NodeStats[] = [];
  const el: number[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const s: NodeStats = { file, node: node.getName(), modes: [], verts: 0, meanX: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity],
      nonFinite: 0, badIndices: 0, triangles: 0, degenerate: 0, flat: 0, twice: 0, normals: 0, badNormals: 0 };
    let sx = 0;
    for (const prim of mesh.listPrimitives()) {
      s.modes.push(prim.getMode());
      const pos = prim.getAttribute('POSITION');
      const n = pos?.getCount() ?? 0;
      for (let i = 0; i < n; i++) {
        pos!.getElement(i, el);
        const p = [0, 1, 2].map((k) => m[k] * el[0] + m[4 + k] * el[1] + m[8 + k] * el[2] + m[12 + k]);
        if (!p.every(Number.isFinite)) { s.nonFinite++; continue; }
        for (let k = 0; k < 3; k++) { s.lo[k] = Math.min(s.lo[k], p[k]); s.hi[k] = Math.max(s.hi[k], p[k]); }
        sx += p[0];
        s.verts++;
      }
      const nrm = prim.getAttribute('NORMAL');
      for (let i = 0; i < (nrm?.getCount() ?? 0); i++) {
        nrm!.getElement(i, el);
        s.normals++;
        if (Math.abs(Math.hypot(el[0], el[1], el[2]) - 1) > 0.05) s.badNormals++;
      }
      const idx = prim.getIndices()?.getArray();
      if (!idx) continue;
      for (const i of idx) if (i >= n) s.badIndices++;
      if (prim.getMode() !== 4) continue;
      const targets = prim.listTargets().map((t) => t.getAttribute('POSITION')).filter((t) => t !== null);
      const a: number[] = [], b: number[] = [], c: number[] = [], d: number[] = [], e: number[] = [], f: number[] = [];
      const area = (i0: number, i1: number, i2: number, T?: NonNullable<typeof pos>) => {
        pos!.getElement(i0, a); pos!.getElement(i1, b); pos!.getElement(i2, c);
        if (T) { T.getElement(i0, d); T.getElement(i1, e); T.getElement(i2, f); for (let k = 0; k < 3; k++) { a[k] += d[k]; b[k] += e[k]; c[k] += f[k]; } }
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
        return Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
      };
      const seen = new Set<string>();
      for (let t = 0; t + 2 < idx.length; t += 3) {
        s.triangles++;
        const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) { s.degenerate++; continue; }
        if (area(i0, i1, i2) === 0 && targets.every((T) => area(i0, i1, i2, T!) === 0)) s.flat++;
        const r = i0 < i1 && i0 < i2 ? [i0, i1, i2] : i1 < i2 ? [i1, i2, i0] : [i2, i0, i1];
        const key = r.join(',');
        if (seen.has(key)) s.twice++; else seen.add(key);
      }
    }
    s.meanX = s.verts ? sx / s.verts : NaN;
    out.push(s);
  }
  return out;
}

/**
 * What is wrong with a file's node names for the side they lie on. The viewer shows and hides the halves by these
 * names (a node `L` with "Left", `R` with "Right"); a structure on the midline is kept whole in `R`, or cut into its two
 * halves. Two halves: L lies left of R, and where the frame's midline is x = 0 (all but the spine, whose midline is
 * the patient's own), each on its own side of it. One node: L lies left; R lies right or on the midline.
 */
export function sideProblems(nodes: NodeStats[], midlineAtZero: boolean): string[] {
  const bad: string[] = [];
  const by = new Map(nodes.map((n) => [n.node, n]));
  const where = (n: NodeStats) => `${n.file}: node ${n.node}, mean x ${n.meanX.toFixed(1)} mm`;
  for (const n of nodes) if (n.node !== 'L' && n.node !== 'R') bad.push(`${n.file}: a node named ${JSON.stringify(n.node)}, not L or R`);
  if (nodes.length !== by.size) bad.push(`${nodes[0].file}: two nodes of one name`);
  const L = by.get('L'), R = by.get('R');
  if (L && R) {
    if (!(L.meanX < R.meanX)) bad.push(`${where(L)}, not left of ${where(R)}`);
    if (midlineAtZero && L.meanX > 0.5) bad.push(`${where(L)}: right of the midline`);
    if (midlineAtZero && R.meanX < -0.5) bad.push(`${where(R)}: left of the midline`);
  } else if (L) {
    if (!(L.meanX < 0)) bad.push(`${where(L)}: the only node, named L, not on the left`);
  } else if (R) {
    if (!(R.meanX > -1)) bad.push(`${where(R)}: the only node, named R, lies on the left`);
  }
  return bad;
}

/** A file's triangles as one soup (mm, in the scene), with the vertex normals. */
export async function soup(file: string, root: URL = PUBLIC): Promise<{ P: Float64Array; N: Float64Array; T: Uint32Array }> {
  const doc = await (await io()).readBinary(new Uint8Array(readFileSync(new URL(file, root))));
  const P: number[] = [], N: number[] = [], T: number[] = [];
  const el: number[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      const base = P.length / 3;
      const pos = prim.getAttribute('POSITION')!, nrm = prim.getAttribute('NORMAL');
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, el);
        for (let k = 0; k < 3; k++) P.push(m[k] * el[0] + m[4 + k] * el[1] + m[8 + k] * el[2] + m[12 + k]);
        // (a node's transform is a shift and one scale, from the quantization: it leaves directions alone)
        if (nrm) { nrm.getElement(i, el); N.push(el[0], el[1], el[2]); } else N.push(0, 0, 0);
      }
      for (const i of prim.getIndices()!.getArray()!) T.push(base + i);
    }
  }
  return { P: Float64Array.from(P), N: Float64Array.from(N), T: Uint32Array.from(T) };
}

/** Several soups as one (the skull-base CT models' bones are pieces of one surface: closed only together). */
export function joined(parts: { P: Float64Array; T: Uint32Array }[]): { P: Float64Array; T: Uint32Array } {
  const P = new Float64Array(parts.reduce((a, s) => a + s.P.length, 0));
  const T = new Uint32Array(parts.reduce((a, s) => a + s.T.length, 0));
  let p = 0, t = 0;
  for (const s of parts) {
    P.set(s.P, p);
    for (let i = 0; i < s.T.length; i++) T[t + i] = s.T[i] + p / 3;
    p += s.P.length; t += s.T.length;
  }
  return { P, T };
}

/** An MRI template volume of the DBS manifest, sampled (trilinear, voxel centres at origin + i × spacing; NaN outside). */
export function volume(v: { file: string; dims: number[]; origin: number[]; spacing: number }, root: URL = PUBLIC) {
  const d = gunzipSync(readFileSync(new URL(v.file, root)));
  const [nx, ny, nz] = v.dims;
  return (x: number, y: number, z: number): number => {
    const fx = (x - v.origin[0]) / v.spacing, fy = (y - v.origin[1]) / v.spacing, fz = (z - v.origin[2]) / v.spacing;
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
    if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) return NaN;
    const a = fx - i, b = fy - j, c = fz - k;
    let s = 0;
    for (let di = 0; di < 2; di++) for (let dj = 0; dj < 2; dj++) for (let dk = 0; dk < 2; dk++)
      s += (di ? a : 1 - a) * (dj ? b : 1 - b) * (dk ? c : 1 - c) * d[i + di + nx * (j + dj + ny * (k + dk))];
    return s;
  };
}

/**
 * The template's signal just outside a surface against just inside it, along each vertex normal (`mm` each way). On T2
 * the fluid round the brainstem is bright and its tissue dark: a surface on the brainstem's own boundary has the bright
 * side out; one that is too large has tissue (or the far wall's bone) out and fluid in, one that is too small tissue on
 * both sides. Returns the median difference (out minus in) and the shares of vertices with a clear step (> `step`) out
 * or in.
 */
export function across(S: { P: Float64Array; N: Float64Array }, f: (x: number, y: number, z: number) => number, mm = 1.5, step = 20) {
  const diffs: number[] = [];
  let out = 0, inn = 0;
  for (let i = 0; i < S.P.length; i += 3) {
    const [x, y, z] = [S.P[i], S.P[i + 1], S.P[i + 2]], [u, v, w] = [S.N[i], S.N[i + 1], S.N[i + 2]];
    const o = f(x + mm * u, y + mm * v, z + mm * w), n = f(x - mm * u, y - mm * v, z - mm * w);
    if (Number.isNaN(o) || Number.isNaN(n)) continue;
    diffs.push(o - n);
    if (o - n > step) out++;
    if (n - o > step) inn++;
  }
  diffs.sort((a, b) => a - b);
  return { n: diffs.length, median: diffs[diffs.length >> 1], outShare: out / diffs.length, inShare: inn / diffs.length };
}

/**
 * A surface's width across x at height z, as the brainstem build measures it (pipeline/brainstem_build.py, WIDTH_LEVELS):
 * where its triangles' edges cross the plane, the points within 0.6 mm of the middle of their front-to-back extent.
 */
export function widthAt(S: { P: Float64Array; T: Uint32Array }, z: number): number {
  const xs: number[] = [], ys: number[] = [];
  for (let t = 0; t < S.T.length; t += 3) {
    for (const [a, b] of [[S.T[t], S.T[t + 1]], [S.T[t + 1], S.T[t + 2]], [S.T[t + 2], S.T[t]]]) {
      const za = S.P[3 * a + 2], zb = S.P[3 * b + 2];
      if ((za - z) * (zb - z) >= 0) continue;
      const w = (z - za) / (zb - za);
      xs.push(S.P[3 * a] + w * (S.P[3 * b] - S.P[3 * a]));
      ys.push(S.P[3 * a + 1] + w * (S.P[3 * b + 1] - S.P[3 * a + 1]));
    }
  }
  const cy = (ys.reduce((a, v) => Math.min(a, v), Infinity) + ys.reduce((a, v) => Math.max(a, v), -Infinity)) / 2;
  const near = xs.filter((_, i) => Math.abs(ys[i] - cy) < 0.6);
  return near.reduce((a, v) => Math.max(a, v), -Infinity) - near.reduce((a, v) => Math.min(a, v), Infinity);
}
