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
