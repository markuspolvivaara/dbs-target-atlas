import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BURR_MM, DRILL, DRILL_PAIRS, drillPairFor, DrillVolume, type DrillPair } from '../../src/spine/drill';
import { SP } from '../../src/spine';
import { decodeSpine, encodeSpine } from '../../src/spine/state';
import { spinePlan } from '../../src/spine/scene';

/** A pair whose upper "vertebra" is a ball of radius R (mm) at the centre of a small grid, on a grid like the CT's (x
 * flipped, 0.72 x 0.72 x 0.7 mm). */
function ball(R: number): DrillVolume {
  const dims: [number, number, number] = [40, 40, 40];
  const affine = [[-0.72, 0, 0, 14], [0, 0.72, 0, -14], [0, 0, 0.7, -14], [0, 0, 0, 1]];
  const pair: DrillPair = { id: 'X-Y', upper: 'x', lower: 'y', disc: 'd', root: 'r', file: '', bytes: 0, dims, affine, check: {} };
  const n = dims[0] * dims[1] * dims[2];
  const buf = new Uint8Array(n * 6);
  const iso = DRILL.params.fieldIso;
  const M = new THREE.Matrix4().set(...(affine.flat() as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]));
  const p = new THREE.Vector3();
  for (let i = 0; i < dims[0]; i++) for (let j = 0; j < dims[1]; j++) for (let k = 0; k < dims[2]; k++) {
    const x = (i * dims[1] + j) * dims[2] + k;
    const d = p.set(i, j, k).applyMatrix4(M).length();
    buf[x] = Math.max(0, Math.min(255, Math.round(iso + (R - d) * 40)));   // upper: the ball
    buf[n + x] = 0;                                                        // lower: none
    buf[2 * n + x] = 150;                                                  // density
    buf[3 * n + x] = buf[4 * n + x] = buf[5 * n + x] = 255;               // far from everything
  }
  return new DrillVolume(pair, buf.buffer);
}

function surface(v: DrillVolume): { pos: THREE.Vector3[]; tris: number[][]; nor: THREE.Vector3[] } {
  const pos: THREE.Vector3[] = [], nor: THREE.Vector3[] = [], tris: number[][] = [];
  const [cx, cy, cz] = v.chunks;
  for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) {
    const g = v.mesh(0, i, j, k, () => [1, 1, 1]);
    if (!g) continue;
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), I = g.getIndex()!;
    const base = pos.length;
    for (let a = 0; a < P.count; a++) { pos.push(new THREE.Vector3().fromBufferAttribute(P, a)); nor.push(new THREE.Vector3().fromBufferAttribute(N, a)); }
    for (let a = 0; a < I.count; a += 3) tris.push([base + I.getX(a), base + I.getX(a + 1), base + I.getX(a + 2)]);
  }
  return { pos, tris, nor };
}

describe('virtual drilling', () => {
  it('every cervical pair is in the data, each vertebra in the catalogue, its field matching the drawn vertebra', () => {
    expect(DRILL.pairs.map((p) => p.id)).toEqual(['C2-C3', 'C3-C4', 'C4-C5', 'C5-C6', 'C6-C7', 'C7-T1']);
    for (const p of DRILL.pairs) {
      for (const id of [p.upper, p.lower, p.root]) expect(SP.has(id), id).toBe(true);
      for (const c of Object.values(p.check)) { expect(c.medianMm).toBeLessThan(0.3); expect(c.p95Mm).toBeLessThan(0.8); }
    }
    expect(drillPairFor('C5')?.id).toBe('C5-C6');
    expect(DRILL_PAIRS.get('C7-T1')?.root).toBe('sp_root_c8');
  });

  it('the surface lies at the bone field’s level, faces out, and its normals agree', () => {
    const R = 8;
    const { pos, tris, nor } = surface(ball(R));
    expect(tris.length).toBeGreaterThan(500);
    for (const p of pos) expect(Math.abs(p.length() - R)).toBeLessThan(0.3);
    for (const [a, b, c] of tris) {
      const fn = pos[b].clone().sub(pos[a]).cross(pos[c].clone().sub(pos[a]));
      if (fn.length() < 1e-6) continue;                           // (a degenerate one, where two cells' vertices meet)
      const mid = pos[a].clone().add(pos[b]).add(pos[c]).divideScalar(3);
      expect(fn.dot(mid)).toBeGreaterThan(0);                    // outward (the ball's centre is the origin)
      expect(nor[a].dot(mid.clone().normalize())).toBeGreaterThan(0.9);
    }
  });

  it('a ray meets the ball, the burr cuts it, and a reset puts it back', () => {
    const R = 8, v = ball(R);
    const h = v.hit(new THREE.Ray(new THREE.Vector3(0, -40, 0), new THREE.Vector3(0, 1, 0)));
    expect(h?.vertebra).toBe(0);
    expect(h!.point.y).toBeCloseTo(-R, 0);
    const box = v.carve(new THREE.Vector3(0, -R, 0));
    expect(box).not.toBeNull();
    // about half the burr's ball is in the bone
    const half = (4 / 3) * Math.PI * (BURR_MM / 2) ** 3 / 2;
    expect(v.removedMm3[0]).toBeGreaterThan(half * 0.5);
    expect(v.removedMm3[0]).toBeLessThan(half * 1.6);
    const again = v.hit(new THREE.Ray(new THREE.Vector3(0, -40, 0), new THREE.Vector3(0, 1, 0)));
    expect(again!.point.y).toBeGreaterThan(-R + BURR_MM / 2 - 0.4);
    v.reset();
    expect(v.removedMm3[0]).toBe(0);
    expect(v.hit(new THREE.Ray(new THREE.Vector3(0, -40, 0), new THREE.Vector3(0, 1, 0)))!.point.y).toBeCloseTo(-R, 0);
  });

  it('drilling is in the link for a cervical level with a pair, and hides the pair and its disc', () => {
    const s = decodeSpine('#/atlas?r=cervical&lv=C5&dr=1');
    expect(s.drill).toBe('foraminotomy');
    expect(decodeSpine(encodeSpine(s)).drill).toBe('foraminotomy');
    const a = decodeSpine('#/atlas?r=cervical&lv=C5&dr=a&dd=2.5');
    expect([a.drill, a.distract]).toEqual(['acdf', 2.5]);
    expect(decodeSpine(encodeSpine(a))).toMatchObject({ drill: 'acdf', distract: 2.5 });
    expect(decodeSpine('#/atlas?r=cervical&lv=C5&dr=a&dd=99').distract).toBe(5);
    expect(decodeSpine('#/atlas?r=cervical&lv=C5&dr=1&dd=3').distract).toBe(0);   // distraction only at an ACDF
    expect(decodeSpine('#/atlas?r=cervical&lv=C1&dr=1').drill).toBeNull();   // no pair at C1
    expect(decodeSpine('#/atlas?r=lumbar&lv=L4&dr=1').drill).toBeNull();
    const p = spinePlan(s);
    for (const id of ['sp_c5', 'sp_c6', 'sp_disc_c5_c6']) expect(p.looks.get(id)).toBe('hidden');
    expect(p.looks.get('sp_c4')).not.toBe('hidden');
  });
});
