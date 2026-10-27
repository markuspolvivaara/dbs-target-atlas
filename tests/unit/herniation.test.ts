import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { herniaRoot, herniaShape, meshSdf, pushOut, sectionArea, type HerniaSpec } from '../../src/spine/herniation';

const up = new THREE.Vector3(0, 0, 1);
const anchor = new THREE.Vector3(0, 0, 0), toward = new THREE.Vector3(0, -20, 0);   // out of the disc backwards (-y)
const spec = (o: Partial<HerniaSpec>): HerniaSpec => ({ zone: 'paracentral', side: 'L', type: 'protrusion', sizeMm: 6, migrateMm: 0, ...o });
/** where a signed distance crosses zero along a line from p (inside) in direction d */
function reach(sdf: (p: THREE.Vector3) => number, p: THREE.Vector3, d: THREE.Vector3): number {
  let t = 0;
  while (t < 40 && sdf(p.clone().addScaledVector(d, t)) < 0) t += 0.05;
  return t;
}

describe('disc herniation (schematic)', () => {
  it('names the root it presses on: lumbar traversing or exiting, cervical the one exiting at the disc, central none', () => {
    expect(herniaRoot('L4-L5', 'paracentral', 'lumbar')).toBe('L5');
    expect(herniaRoot('L4-L5', 'foraminal', 'lumbar')).toBe('L4');
    expect(herniaRoot('L4-L5', 'central', 'lumbar')).toBeNull();
    expect(herniaRoot('C5-C6', 'paracentral', 'cervical')).toBe('C6');
    expect(herniaRoot('C5-C6', 'foraminal', 'cervical')).toBe('C6');
    expect(herniaRoot('C7-T1', 'foraminal', 'cervical')).toBe('C8');
  });

  it('a protrusion reaches its size beyond the margin, on a base wider than it is deep', () => {
    const h = herniaShape(spec({}), anchor, toward, up, 10);
    expect(reach(h.sdf, anchor, new THREE.Vector3(0, -1, 0))).toBeCloseTo(6, 0);
    expect(reach(h.sdf, anchor, new THREE.Vector3(1, 0, 0))).toBeGreaterThan(6);
    expect(reach(h.sdf, anchor, new THREE.Vector3(0, 0, 1))).toBeLessThanOrEqual(6.05);   // no taller than the disc allows
  });

  it('an extrusion: a narrow neck, a wider fragment, moved along the spine', () => {
    const h = herniaShape(spec({ type: 'extrusion', sizeMm: 10, migrateMm: 6 }), anchor, toward, up, 10);
    const neck = reach(h.sdf, new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0));
    // the fragment: its middle is up the spine
    let best = { z: 0, w: 0 };
    for (let z = -4; z <= 14; z += 0.5) { const w = reach(h.sdf, new THREE.Vector3(0, -10 + 5.5, z), new THREE.Vector3(1, 0, 0)); if (w > best.w) best = { z, w }; }
    expect(best.w).toBeGreaterThan(neck * 1.5);
    expect(best.z).toBeGreaterThan(3);
  });

  it('meshes a signed distance outward-facing, and cuts it into the right area', () => {
    const R = 5, g = meshSdf((p) => p.length() - R, new THREE.Vector3(-7, -7, -7), new THREE.Vector3(7, 7, 7), 0.4);
    const pos = g.getAttribute('position') as THREE.BufferAttribute, idx = g.getIndex()!.array;
    for (let v = 0; v < pos.count; v++) expect(Math.abs(new THREE.Vector3().fromBufferAttribute(pos, v).length() - R)).toBeLessThan(0.15);
    let out = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((i) => new THREE.Vector3().fromBufferAttribute(pos, i));
      if (b.clone().sub(a).cross(c.clone().sub(a)).dot(a.clone().add(b).add(c)) > 0) out++;
    }
    expect(out / (idx.length / 3)).toBeGreaterThan(0.99);
    expect(sectionArea(pos, idx, new THREE.Vector3(), up, 20)).toBeCloseTo(Math.PI * R * R, -1);
  });

  it('pushes a surface out of it; where bone stops the push, the surface is pinned', () => {
    // a sheet (y = -4, the herniation reaches -6) in front of a wall of bone at y < -5.5
    const h = herniaShape(spec({}), anchor, toward, up, 10);
    const sheet = () => new THREE.PlaneGeometry(30, 30, 60, 60).rotateX(Math.PI / 2).translate(0, -4, 0);
    const free = sheet(), fp = free.getAttribute('position') as THREE.BufferAttribute;
    pushOut(fp, free.getIndex()!.array, h.sdf, h.core, { clear: 0.8, spread: 6, reach: 4 });
    let worst = Infinity;
    for (let v = 0; v < fp.count; v++) worst = Math.min(worst, h.sdf(new THREE.Vector3().fromBufferAttribute(fp, v)));
    expect(worst).toBeGreaterThan(0.6);
    const held = sheet(), hp = held.getAttribute('position') as THREE.BufferAttribute;
    const r = pushOut(hp, held.getIndex()!.array, h.sdf, h.core, { clear: 0.8, spread: 6, reach: 4, blocked: (p) => p.y < -5.5 });
    expect(Math.max(...r.pinned)).toBeGreaterThan(0.5);
    for (let v = 0; v < hp.count; v++) expect(hp.getY(v)).toBeGreaterThan(-5.6);
  });
});
