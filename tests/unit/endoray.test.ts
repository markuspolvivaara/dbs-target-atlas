import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RayGrid } from '../../src/viewer/endoray';

/** A sphere with a morph target (moved and stretched), placed off the origin, double-sided like the endoscope's walls. */
function mesh(influence: number): THREE.Mesh {
  const g = new THREE.SphereGeometry(10, 48, 32);
  const p = g.getAttribute('position');
  const d = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { d[i * 3] = 3; d[i * 3 + 2] = p.getZ(i) * 0.5; }
  g.morphAttributes.position = [new THREE.Float32BufferAttribute(d, 3)];
  g.morphTargetsRelative = true;
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  m.position.set(5, -2, 7);
  m.rotation.set(0.3, 0.2, 0.1);
  m.updateMorphTargets();
  m.morphTargetInfluences![0] = influence;
  m.updateMatrixWorld(true);
  return m;
}

describe('the endoscope ray grid', () => {
  for (const w of [0, 0.6]) {
    it(`finds the same hits as three.js's raycaster (morph ${w})`, () => {
      const m = mesh(w);
      const grid = new RayGrid([m]);
      const rc = new THREE.Raycaster();
      let seed = 1;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
      for (let k = 0; k < 200; k++) {
        const o = new THREE.Vector3(rnd() * 25, rnd() * 25, rnd() * 25);
        const d = new THREE.Vector3(rnd(), rnd(), rnd()).normalize();
        rc.set(o, d);
        const want = rc.intersectObject(m, false);
        const all = grid.cast(o, d, { all: true });
        expect(all.length).toBe(want.length);
        all.forEach((h, i) => expect(h.distance).toBeCloseTo(want[i].distance, 3));
        const first = grid.cast(o, d)[0];
        if (want.length) {
          expect(first.distance).toBeCloseTo(want[0].distance, 3);
          // the geometric normal, as the face is wound
          const n = want[0].face!.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(m.matrixWorld)).normalize();
          expect(first.normal.dot(n)).toBeGreaterThan(0.999);
        } else expect(first).toBeUndefined();
      }
    });
  }
});
