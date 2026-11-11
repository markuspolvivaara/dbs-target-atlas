import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

/**
 * Every shipped mesh is wound outward, as the viewer needs to draw the near side of a surface: pipeline/winding_check.py's
 * check, run here on the compressed files as they are served, so that it also runs where the pipeline's build folder
 * is not (CI). Each triangle's winding must agree with the vertex normals it is lit with, and a mesh node that is
 * closed must enclose a positive volume (winding and normals both inside out). The pipeline's check also joins the two
 * halves of a structure cut at the midline; here the halves are checked one by one (their seams do not survive
 * quantization exactly).
 */
const SECTIONS = ['meshes', 'spine', 'skullbase', 'skullbase-ct', 'skullbase-v3', 'cortex', 'brainstem', 'ventricles', 'vascular'];
const MAX_INWARD = 0.05;   // decimation leaves a few folded triangles in large meshes: up to 5 % is tolerated
const SHEET_MM = 1e-3;     // a closed mesh enclosing less than this times its area is a two-sided sheet, not a solid

function check(P: Float64Array, N: Float32Array | Float64Array, T: Uint32Array): { inward: number; volume: number | null } {
  const nt = T.length / 3;
  let bad = 0, ok = 0, vol = 0, area = 0;
  let cx = 0, cy = 0, cz = 0;
  const nv = P.length / 3;
  for (let i = 0; i < nv; i++) { cx += P[3 * i]; cy += P[3 * i + 1]; cz += P[3 * i + 2]; }
  cx /= nv; cy /= nv; cz /= nv;
  // vertices merged by position (a closed surface: every edge shared by two triangles)
  const ids = new Map<string, number>();
  const id = new Uint32Array(nv);
  for (let i = 0; i < nv; i++) {
    const k = `${Math.round(P[3 * i] * 1000)},${Math.round(P[3 * i + 1] * 1000)},${Math.round(P[3 * i + 2] * 1000)}`;
    let v = ids.get(k);
    if (v === undefined) { v = ids.size; ids.set(k, v); }
    id[i] = v;
  }
  const edges = new Map<number, number>();
  const M = ids.size + 1;
  for (let t = 0; t < nt; t++) {
    const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
    const ax = P[3 * a] - cx, ay = P[3 * a + 1] - cy, az = P[3 * a + 2] - cz;
    const bx = P[3 * b] - cx, by = P[3 * b + 1] - cy, bz = P[3 * b + 2] - cz;
    const ux = P[3 * c] - cx, uy = P[3 * c + 1] - cy, uz = P[3 * c + 2] - cz;
    const fx = (by - ay) * (uz - az) - (bz - az) * (uy - ay), fy = (bz - az) * (ux - ax) - (bx - ax) * (uz - az), fz = (bx - ax) * (uy - ay) - (by - ay) * (ux - ax);
    const len = Math.hypot(fx, fy, fz);
    if (len > 1e-12) {
      ok++;
      const sx = N[3 * a] + N[3 * b] + N[3 * c], sy = N[3 * a + 1] + N[3 * b + 1] + N[3 * c + 1], sz = N[3 * a + 2] + N[3 * b + 2] + N[3 * c + 2];
      if (fx * sx + fy * sy + fz * sz < 0) bad++;
    }
    area += len / 2;
    vol += (ax * (by * uz - bz * uy) + ay * (bz * ux - bx * uz) + az * (bx * uy - by * ux)) / 6;
    for (const [p, q] of [[id[a], id[b]], [id[b], id[c]], [id[c], id[a]]]) {
      if (p === q) continue;
      const key = p < q ? p * M + q : q * M + p;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const n of edges.values()) if (n === 1) open++;
  const closed = edges.size > 0 && open / edges.size <= 0.001 && Math.abs(vol) >= SHEET_MM * area;
  return { inward: bad / Math.max(ok, 1), volume: closed ? vol : null };
}

describe('shipped meshes are wound outward', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  it.each(SECTIONS)('%s', async (section) => {
    const dir = new URL(`../../public/assets/${section}/`, import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith('.glb')).sort();
    expect(files.length).toBeGreaterThan(5);
    const bad: string[] = [];
    let meshes = 0;
    for (const f of files) {
      const doc = await io.readBinary(new Uint8Array(readFileSync(new URL(f, dir))));
      for (const node of doc.getRoot().listNodes()) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        const m = node.getWorldMatrix();
        for (const prim of mesh.listPrimitives()) {
          const pos = prim.getAttribute('POSITION'), nrm = prim.getAttribute('NORMAL'), idx = prim.getIndices();
          if (prim.getMode() !== 4 || !pos || !nrm || !idx) continue;
          meshes++;
          const n = pos.getCount();
          const P = new Float64Array(3 * n), N = new Float32Array(3 * n);
          const el: number[] = [];
          for (let i = 0; i < n; i++) {
            pos.getElement(i, el);
            P[3 * i] = m[0] * el[0] + m[4] * el[1] + m[8] * el[2] + m[12];
            P[3 * i + 1] = m[1] * el[0] + m[5] * el[1] + m[9] * el[2] + m[13];
            P[3 * i + 2] = m[2] * el[0] + m[6] * el[1] + m[10] * el[2] + m[14];
            nrm.getElement(i, el);
            // (a node's transform here is a shift and one scale, from the quantization: it leaves directions alone)
            N[3 * i] = el[0]; N[3 * i + 1] = el[1]; N[3 * i + 2] = el[2];
          }
          const r = check(P, N, Uint32Array.from(idx.getArray()!));
          if (r.inward > MAX_INWARD) bad.push(`${section}/${f}:${node.getName()} ${Math.round(r.inward * 100)} % of triangles disagree with their normals`);
          if (r.volume !== null && r.volume < 0) bad.push(`${section}/${f}:${node.getName()} closed but inside out (${(r.volume / 1000).toFixed(2)} ml)`);
        }
      }
    }
    expect(meshes).toBeGreaterThan(5);
    expect(bad).toEqual([]);
  }, 180_000);
});
