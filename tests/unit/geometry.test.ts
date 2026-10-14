import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import { MANIFEST } from '../../src/data';
import { ACPC, MCP, acpcToMni, mniToAcpc } from '../../src/data/acpc';
import { decode, defaultState, encode } from '../../src/state';

/**
 * Decode the shipped (quantized, meshopt-compressed) GLBs and check them
 * against the manifest, so a broken transform in compression would fail here.
 */
async function nodeMeans(file: string) {
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

describe('shipped GLBs', () => {
  it.each(MANIFEST.structures.filter((s) => s.surfaceCentroid).map((s) => [s.id, s]))('%s: decoded mesh matches the uncompressed pipeline mesh, on the right side', async (_id, s) => {
    const means = await nodeMeans(s.file);
    for (const side of ['L', 'R'] as const) {
      const c = s.surfaceCentroid![side];
      const d = Math.hypot(...means[side].map((v, i) => v - c[i]));
      expect(d, `${s.id}/${side}`).toBeLessThan(0.1); // quantization error only
      expect(Math.sign(means[side][0])).toBe(side === 'L' ? -1 : 1);
    }
  });
  it.each(MANIFEST.structures.filter((s) => s.type === 'tract').map((s) => [s.id, s]))('%s: decoded streamline centroid matches the pipeline report', async (_id, s) => {
    const means = await nodeMeans(s.file);
    for (const side of ['L', 'R'] as const) {
      const d = Math.hypot(...means[side].map((v, i) => v - s.centroid![side][i]));
      expect(d, `${s.id}/${side}`).toBeLessThan(0.1);
    }
  });
});

describe('AC-PC conversion (Lead-DBS ea_mni2acpc frame, template space)', () => {
  it('MCP maps to the origin; AC and PC lie on the y axis', () => {
    expect(mniToAcpc(MCP).map((v) => Math.abs(v))).toEqual([0, 0, 0].map(() => expect.any(Number)));
    for (const v of mniToAcpc(MCP)) expect(Math.abs(v)).toBeLessThan(1e-9);
    const ac = mniToAcpc(ACPC.AC as [number, number, number]);
    const pc = mniToAcpc(ACPC.PC as [number, number, number]);
    expect(Math.abs(ac[0]) + Math.abs(ac[2])).toBeLessThan(1e-9);
    expect(ac[1]).toBeGreaterThan(0); // AC anterior
    expect(pc[1]).toBeLessThan(0);
    expect(ac[1] - pc[1]).toBeCloseTo(Math.hypot(...(ACPC.AC as number[]).map((v, i) => v - (ACPC.PC as number[])[i])), 9);
  });
  it('round-trips and keeps right positive', () => {
    const p: [number, number, number] = [12.3, -14.1, -6.8];
    const back = acpcToMni(mniToAcpc(p));
    back.forEach((v, i) => expect(v).toBeCloseTo(p[i], 9));
    expect(mniToAcpc([20, MCP[1], MCP[2]])[0]).toBeGreaterThan(0);
  });
});

describe('URL state', () => {
  it('round-trips a teaching link', () => {
    const s = defaultState();
    s.ind = 'et'; s.sym = 'et-head'; s.hemi = 'L';
    s.cam = { preset: null, pos: [10, 120, 30], tgt: [0, -12, -2] };
    s.layers.cortex = { on: false, opacity: 1 };
    s.layers.tracts.opacity = 0.5;
    s.clip.axial = { on: true, mm: -4.5, cut: true, flip: false };
    s.layers.electrode.on = true; s.lead = { ...s.lead, spacing: 1.5, depth: 2, stim: true, contact: 2, radius: 2.5 };
    s.sel = 'drtt';
    const back = decode(encode(s));
    expect(back.ind).toBe('et'); expect(back.sym).toBe('et-head'); expect(back.hemi).toBe('L');
    expect(back.cam.pos).toEqual([10, 120, 30]);
    expect(back.layers.cortex.on).toBe(false); expect(back.layers.tracts.opacity).toBe(0.5);
    expect(back.clip.axial).toEqual({ on: true, mm: -4.5, cut: true, flip: false });
    expect(back.lead).toMatchObject({ spacing: 1.5, depth: 2, stim: true, contact: 2, radius: 2.5 });
    expect(back.sel).toBe('drtt');
  });
});
