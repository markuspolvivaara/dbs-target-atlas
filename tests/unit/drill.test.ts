import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BURR_MM, BURR_MM_BY_REGION, DRILL, DRILL_PAIRS, drillPairFor, DrillVolume, type DrillPair } from '../../src/spine/drill';
import { SP } from '../../src/spine';
import { decodeSpine, encodeSpine } from '../../src/spine/state';
import { spinePlan } from '../../src/spine/scene';

type V = [number, number, number];
/** A pair whose upper "vertebra" is drawn by a signed distance (mm, + inside), on a small grid like the CT's (x
 * flipped, 0.72 x 0.72 x 0.7 mm); its body at `body`, its spinous process from `base` back to `tip` (the frame's
 * axes: back is -y). */
function shape(sd: (p: THREE.Vector3) => number, body: V = [0, 0, 0], base: V = [0, -3, 0], tip: V = [0, -12, 0], region: 'cervical' | 'lumbar' = 'cervical'): DrillVolume {
  const dims: [number, number, number] = [40, 40, 40];
  const affine = [[-0.72, 0, 0, 14], [0, 0.72, 0, -14], [0, 0, 0.7, -14], [0, 0, 0, 1]];
  const lm = { body, axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as [V, V, V], spinous: { base, tip, wall: [0, 0, 0] as V } };
  const pair: DrillPair = { id: 'X-Y', region, upper: 'x', lower: 'y', disc: 'd', root: 'r', artery: true, file: '', bytes: 0, dims, affine, check: {}, landmarks: [lm, lm] };
  const n = dims[0] * dims[1] * dims[2];
  const buf = new Uint8Array(n * 6);
  const iso = DRILL.params.fieldIso;
  const M = new THREE.Matrix4().set(...(affine.flat() as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]));
  const p = new THREE.Vector3();
  for (let i = 0; i < dims[0]; i++) for (let j = 0; j < dims[1]; j++) for (let k = 0; k < dims[2]; k++) {
    const x = (i * dims[1] + j) * dims[2] + k;
    buf[x] = Math.max(0, Math.min(255, Math.round(iso + sd(p.set(i, j, k).applyMatrix4(M)) * 40)));   // upper: the shape
    buf[n + x] = 0;                                                        // lower: none
    buf[2 * n + x] = 150;                                                  // density
    buf[3 * n + x] = buf[4 * n + x] = buf[5 * n + x] = 255;               // far from everything
  }
  return new DrillVolume(pair, buf.buffer);
}
/** A ball of radius R (mm) at the grid's centre. */
const ball = (R: number) => shape((p) => R - p.length());
/** signed distances (+ inside) of a ball and of a box (half-sizes) */
const sBall = (p: THREE.Vector3, c: V, R: number) => R - p.distanceTo(new THREE.Vector3(...c));
const sBox = (p: THREE.Vector3, lo: V, hi: V) => Math.min(p.x - lo[0], hi[0] - p.x, p.y - lo[1], hi[1] - p.y, p.z - lo[2], hi[2] - p.z);

function surface(v: DrillVolume): { pos: THREE.Vector3[]; tris: number[][]; nor: THREE.Vector3[] } {
  const pos: THREE.Vector3[] = [], nor: THREE.Vector3[] = [], tris: number[][] = [];
  const [cx, cy, cz] = v.chunks;
  for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) {
    const g = v.mesh(0, i, j, k, () => [1, 1, 1]);   // the upper vertebra's layer
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
    expect(DRILL.pairs.map((p) => p.id)).toEqual(['C2-C3', 'C3-C4', 'C4-C5', 'C5-C6', 'C6-C7', 'C7-T1', 'L1-L2', 'L2-L3', 'L3-L4', 'L4-L5']);
    for (const p of DRILL.pairs) {
      for (const id of [p.upper, p.lower, p.root]) expect(SP.has(id), id).toBe(true);
      for (const c of Object.values(p.check)) { expect(c.medianMm).toBeLessThan(0.3); expect(c.p95Mm).toBeLessThan(0.8); }
    }
    expect(drillPairFor('C5')?.id).toBe('C5-C6');
    expect(DRILL_PAIRS.get('C7-T1')?.root).toBe('sp_root_c8');
    expect(DRILL_PAIRS.get('L4-L5')).toMatchObject({ region: 'lumbar', root: 'sp_root_l5', artery: false });
    // each spinous process: its base between the canal's back wall and its tip, behind the body
    for (const p of DRILL.pairs) for (const lm of p.landmarks) {
      const ant = new THREE.Vector3(...lm.axes[1]), at = (x: [number, number, number]) => new THREE.Vector3(...x).sub(new THREE.Vector3(...lm.body)).dot(ant);
      expect(at(lm.spinous.wall)).toBeLessThan(-10);
      expect(at(lm.spinous.base)).toBeLessThan(at(lm.spinous.wall));
      expect(at(lm.spinous.tip)).toBeLessThan(at(lm.spinous.base) - 5);
    }
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
    // the lumbar burr is 5 mm: its bite into the same ball is larger
    const lum = shape((p) => R - p.length(), [0, 0, 0], [0, -3, 0], [0, -12, 0], 'lumbar');
    expect(lum.burrMm).toBe(BURR_MM_BY_REGION.lumbar);
    lum.carve(new THREE.Vector3(0, -R, 0));
    expect(lum.removedMm3[0]).toBeGreaterThan(half * 1.6);   // beyond what the 4-mm one can take
    expect(v.hit(new THREE.Ray(new THREE.Vector3(0, -40, 0), new THREE.Vector3(0, 1, 0)))!.point.y).toBeCloseTo(-R, 0);
  });

  it('bone cut loose from the body becomes a piece, which can be lifted off; undo brings it back', () => {
    // a body (a ball) and a smaller ball behind it, joined by a rod: the burr cuts the rod
    const v = shape((p) => Math.max(sBall(p, [0, 4, 0], 5), sBall(p, [0, -8, 0], 4), sBox(p, [-1.5, -5, -1.5], [1.5, 0, 1.5])), [0, 4, 0]);
    expect(v.settle()).toBe(false);
    const before = v.snapshot();
    v.carve(new THREE.Vector3(0, -2.5, 0));
    expect(v.settle()).toBe(true);
    const pieces = v.pieces();
    expect(pieces).toHaveLength(1);
    const L = v.layers[pieces[0]];
    expect(L.mm3).toBeGreaterThan(200);                      // the back ball (268 mm3) less the burr's bite
    expect(L.mm3).toBeLessThan(290);
    expect(L.centre!.y).toBeLessThan(-6);
    const removed = v.removedMm3[0];
    v.lift(pieces[0]);
    expect(v.removedMm3[0]).toBeCloseTo(removed + L.mm3, 3);
    // a ray from behind now meets the body (or the stump of the rod), not the lifted ball
    expect(v.hit(new THREE.Ray(new THREE.Vector3(0, -40, 0), new THREE.Vector3(0, 1, 0)))!.point.y).toBeGreaterThan(-2);
    v.restore(before);
    expect(v.pieces()).toHaveLength(0);
    expect(v.hit(new THREE.Ray(new THREE.Vector3(0, -40, 0), new THREE.Vector3(0, 1, 0)))!.point.y).toBeCloseTo(-12, 0);
  });

  it('the spinous process is taken off at its base; split and detached, it is two halves, one to each side', () => {
    // a body, and a spinous process behind it from y = 1 back to y = -12 (its base at y = -3)
    const sd = (p: THREE.Vector3) => Math.max(sBall(p, [0, 5, 0], 5), sBox(p, [-2.5, -12, -3], [2.5, 1, 3]));
    const fromBehind = new THREE.Ray(new THREE.Vector3(0.8, -40, 0), new THREE.Vector3(0, 1, 0));
    const rongeur = shape(sd, [0, 5, 0]);
    expect(rongeur.hit(fromBehind)!.point.y).toBeCloseTo(-12, 0);
    rongeur.osteotomy(0, 'spinous');
    expect(rongeur.hit(fromBehind)!.point.y).toBeCloseTo(-3, 0);
    expect(rongeur.settle()).toBe(false);
    expect(rongeur.removedMm3[0]).toBeGreaterThan(5 * 6 * 9 * 0.8);
    // split only: still one with the body; then detached at the base: two halves
    const v = shape(sd, [0, 5, 0]);
    v.osteotomy(0, 'split');
    expect(v.settle()).toBe(false);
    v.osteotomy(0, 'base');
    expect(v.settle()).toBe(true);
    const halves = v.pieces().map((l) => v.spinousAt(0, v.layers[l].centre!));
    expect(halves).toHaveLength(2);
    for (const a of halves) expect(a.front).toBeLessThan(0);
    expect(halves.map((a) => Math.sign(a.across)).sort()).toEqual([-1, 1]);
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
    expect(decodeSpine('#/atlas?r=lumbar&lv=L4&dr=1').drill).toBeNull();      // a cervical approach at a lumbar level
    expect(decodeSpine('#/atlas?r=cervical&lv=C5&dr=o').drill).toBeNull();    // and a lumbar one at a cervical level
    for (const [code, mode] of [['e', 'lamEnBloc'], ['p', 'lamPiecemeal']] as const) expect(decodeSpine(`#/atlas?r=cervical&lv=C5&dr=${code}`).drill).toBe(mode);
    const o = decodeSpine('#/atlas?r=lumbar&lv=L4&dr=o&ds=R');
    expect([o.drill, o.drillSide]).toEqual(['overTheTop', 'R']);
    expect(decodeSpine(encodeSpine(o))).toMatchObject({ drill: 'overTheTop', drillSide: 'R' });
    const sp = decodeSpine('#/atlas?r=lumbar&lv=L4&dr=s&dd=10');
    expect([sp.drill, sp.distract]).toEqual(['spSplit', 10]);
    expect(decodeSpine('#/atlas?r=lumbar&lv=L4&dr=s&dd=40').distract).toBe(12);
    const p = spinePlan(s);
    for (const id of ['sp_c5', 'sp_c6', 'sp_disc_c5_c6']) expect(p.looks.get(id)).toBe('hidden');
    expect(p.looks.get('sp_c4')).not.toBe('hidden');
    // a laminectomy: the level alone is drilled, the one below and the disc drawn as they are
    const lam = spinePlan(decodeSpine('#/atlas?r=cervical&lv=C5&dr=e'));
    expect([lam.looks.get('sp_c5'), lam.looks.get('sp_c6'), lam.looks.get('sp_disc_c5_c6')]).toEqual(['hidden', 'context', 'primary']);
    const ott = spinePlan(decodeSpine('#/atlas?r=lumbar&lv=L4&dr=o'));
    expect([ott.looks.get('sp_l4'), ott.looks.get('sp_l5'), ott.looks.get('sp_disc_l4_l5')]).toEqual(['hidden', 'hidden', 'primary']);
  });
});
