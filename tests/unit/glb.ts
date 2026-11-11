import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

/**
 * Decode the shipped (quantized, meshopt-compressed) GLBs and check them
 * against the manifest, so a broken transform in compression would fail here.
 */
export async function nodeMeans(file: string) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(new Uint8Array(readFileSync(new URL(`../../public/${file}`, import.meta.url))));
  const out: Record<string, [number, number, number]> = {};
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const prim = mesh.listPrimitives()[0];
    const acc = prim.getAttribute('POSITION')!;
    const el: number[] = [];
    const P: number[][] = [];
    for (let i = 0; i < acc.getCount(); i++) {
      acc.getElement(i, el);
      const [x, y, z] = el;
      P.push([m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]);
    }
    const idx = prim.getIndices()!.getArray()!;
    const s = [0, 0, 0];
    let w = 0;
    if (prim.getMode() === 4) {
      // area-weighted triangle centroid (vertex density after decimation is uneven)
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [P[idx[t]], P[idx[t + 1]], P[idx[t + 2]]];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
        for (let k = 0; k < 3; k++) s[k] += area * (a[k] + b[k] + c[k]) / 3;
        w += area;
      }
    } else {
      for (const p of P) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
      w = P.length;
    }
    out[node.getName()] = s.map((v) => v / w) as [number, number, number];
  }
  return out;
}

/** Each mesh node's extent along x (mm; x < 0 is the left): [min, max] by node name. */
export async function nodeExtentsX(file: string) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(new Uint8Array(readFileSync(new URL(`../../public/${file}`, import.meta.url))));
  const out: Record<string, [number, number]> = {};
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    let lo = Infinity, hi = -Infinity;
    const el: number[] = [];
    for (const prim of mesh.listPrimitives()) {
      const acc = prim.getAttribute('POSITION')!;
      for (let i = 0; i < acc.getCount(); i++) {
        acc.getElement(i, el);
        const x = m[0] * el[0] + m[4] * el[1] + m[8] * el[2] + m[12];
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
    out[node.getName()] = [lo, hi];
  }
  return out;
}

/** A shipped file's surface as one triangle soup: every mesh node's positions (mm, in the scene) and triangles. */
export async function meshSoup(file: string): Promise<{ P: Float64Array; T: Uint32Array }> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(new Uint8Array(readFileSync(new URL(`../../public/${file}`, import.meta.url))));
  const P: number[] = [], T: number[] = [];
  const el: number[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      const base = P.length / 3;
      const acc = prim.getAttribute('POSITION')!;
      for (let i = 0; i < acc.getCount(); i++) {
        acc.getElement(i, el);
        P.push(m[0] * el[0] + m[4] * el[1] + m[8] * el[2] + m[12], m[1] * el[0] + m[5] * el[1] + m[9] * el[2] + m[13], m[2] * el[0] + m[6] * el[1] + m[10] * el[2] + m[14]);
      }
      for (const i of prim.getIndices()!.getArray()!) T.push(base + i);
    }
  }
  return { P: Float64Array.from(P), T: Uint32Array.from(T) };
}

/**
 * How many of the points Q lie inside the closed surface (P, T): a ray along +x from each, counted by the parity of
 * the triangles it crosses (triangles bucketed by y and z, so each ray meets only the few in its cell). Points are
 * moved a hair off the lattice the files' quantization puts them on, so that a ray does not run along an edge.
 */
export function pointsInside(Q: Float64Array, P: Float64Array, T: Uint32Array, cell = 2): number {
  const nt = T.length / 3;
  let y0 = Infinity, z0 = Infinity, y1 = -Infinity, z1 = -Infinity, x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]);
    y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]);
    z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]);
  }
  const ny = Math.max(1, Math.ceil((y1 - y0) / cell)), nz = Math.max(1, Math.ceil((z1 - z0) / cell));
  const buckets: number[][] = Array.from({ length: ny * nz }, () => []);
  const cy = (y: number) => Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / cell)));
  const cz = (z: number) => Math.min(nz - 1, Math.max(0, Math.floor((z - z0) / cell)));
  for (let t = 0; t < nt; t++) {
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
    const ya = cy(Math.min(P[a + 1], P[b + 1], P[c + 1])), yb = cy(Math.max(P[a + 1], P[b + 1], P[c + 1]));
    const za = cz(Math.min(P[a + 2], P[b + 2], P[c + 2])), zb = cz(Math.max(P[a + 2], P[b + 2], P[c + 2]));
    for (let j = ya; j <= yb; j++) for (let k = za; k <= zb; k++) buckets[j * nz + k].push(t);
  }
  let inside = 0;
  for (let q = 0; q < Q.length; q += 3) {
    const x = Q[q], y = Q[q + 1] + 1.37e-4, z = Q[q + 2] + 0.71e-4;
    if (x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1) continue;
    let crossings = 0;
    for (const t of buckets[cy(y) * nz + cz(z)]) {
      const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
      // the ray (x + s, y, z), s > 0, against the triangle: its (y, z) inside the triangle's projection, the hit ahead
      const ay = P[a + 1] - y, az = P[a + 2] - z, by = P[b + 1] - y, bz = P[b + 2] - z, cy_ = P[c + 1] - y, cz_ = P[c + 2] - z;
      const w0 = by * cz_ - bz * cy_, w1 = cy_ * az - cz_ * ay, w2 = ay * bz - az * by;
      if (!((w0 > 0 && w1 > 0 && w2 > 0) || (w0 < 0 && w1 < 0 && w2 < 0))) continue;
      const hit = (w0 * P[a] + w1 * P[b] + w2 * P[c]) / (w0 + w1 + w2);
      if (hit > x) crossings++;
    }
    if (crossings % 2 === 1) inside++;
  }
  return inside;
}
