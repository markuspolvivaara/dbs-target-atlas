import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { buildTreeNow, fastRaycast } from '../../src/viewer/pickbvh';

/**
 * Picking through a tree of each mesh's triangles (src/viewer/pickbvh.ts, the audit's P1-09) gives the hits three.js's
 * own raycast gives: the same triangles at the same distances, for each side a material draws, with the mesh's
 * quantized positions and node transform as the viewer loads them, and with a morph target full on.
 */

/** One node of a shipped GLB as the viewer has it: the quantized positions as a normalized attribute, the node's
 * transform on the mesh. */
async function loadNode(file: string, side: 'L' | 'R'): Promise<THREE.Mesh> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(new Uint8Array(readFileSync(new URL(`../../public/${file}`, import.meta.url))));
  const node = doc.getRoot().listNodes().find((n) => n.getName() === side && n.getMesh())!;
  const prim = node.getMesh()!.listPrimitives()[0];
  const acc = prim.getAttribute('POSITION')!;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(acc.getArray()!, 3, acc.getNormalized()));
  g.setIndex(new THREE.BufferAttribute(prim.getIndices()!.getArray()!, 1));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  m.matrix.fromArray(node.getWorldMatrix());
  m.matrix.decompose(m.position, m.quaternion, m.scale);
  m.updateMatrixWorld(true);
  return m;
}

/** Rays from outside the mesh's box through points inside it, from every direction (seeded, so the same each run). */
function rays(m: THREE.Mesh, n: number): THREE.Ray[] {
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const box = new THREE.Box3().setFromObject(m);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const r = size.length();
  return Array.from({ length: n }, () => {
    const target = new THREE.Vector3(box.min.x + rnd() * size.x, box.min.y + rnd() * size.y, box.min.z + rnd() * size.z);
    const dir = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    return new THREE.Ray(c.clone().addScaledVector(dir, -r).add(target).sub(c), dir);
  });
}

const hitsBy = (m: THREE.Mesh, cast: THREE.Mesh['raycast'], ray: THREE.Ray, near = 0, far = Infinity) => {
  const rc = new THREE.Raycaster(ray.origin, ray.direction, near, far);
  const out: THREE.Intersection[] = [];
  cast.call(m, rc, out);
  return out.map((h) => ({ tri: h.faceIndex!, d: h.distance, p: h.point })).sort((a, b) => a.d - b.d || a.tri - b.tri);
};

/** Compare the two over the rays: the same triangles at the same distance (to 1e-4 mm) on all but a ray or two that
 * graze an edge, where the two tests may round differently. */
function compare(m: THREE.Mesh, R: THREE.Ray[], near = 0, far = Infinity) {
  let same = 0, hits = 0;
  for (const ray of R) {
    const a = hitsBy(m, THREE.Mesh.prototype.raycast, ray, near, far), b = hitsBy(m, fastRaycast, ray, near, far);
    hits += a.length;
    if (a.length === b.length && a.every((h, i) => h.tri === b[i].tri && Math.abs(h.d - b[i].d) < 1e-4 && h.p.distanceTo(b[i].p) < 1e-4)) same++;
  }
  return { same, of: R.length, hits };
}

describe('picking through a tree of the triangles gives three.js\'s hits', () => {
  it('a skull base bone (quantized, node transform), front, back and both sides', async () => {
    const m = await loadNode('assets/skullbase-v3/sb_temporal_bone.glb', 'R');
    expect(buildTreeNow(m)).toBeTruthy();
    const R = rays(m, 300);
    for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) {
      (m.material as THREE.Material).side = side;
      const r = compare(m, R);
      expect(r.hits, `side ${side}`).toBeGreaterThan(150);
      expect(r.same, `side ${side}`).toBeGreaterThanOrEqual(r.of - 2);
    }
    // the raycaster's near and far are kept
    (m.material as THREE.Material).side = THREE.DoubleSide;
    const r = compare(m, R, 80, 140);
    expect(r.same).toBeGreaterThanOrEqual(r.of - 2);
  }, 60_000);

  it('a cortical label, and the same with a morph target full on (its tree built for that shape)', async () => {
    const m = await loadNode('assets/cortex/ctx_g_front_sup.glb', 'L');
    const g = m.geometry, P = g.getAttribute('position');
    // a morph target: every vertex moved 0.05 of the unit box outward along x and up along z (relative, as glTF's)
    const D = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { D[i * 3] = 0.05 * Math.sign(P.getX(i)); D[i * 3 + 2] = 0.05; }
    g.morphAttributes.position = [new THREE.BufferAttribute(D, 3)];
    g.morphTargetsRelative = true;
    m.updateMorphTargets();
    (m.material as THREE.Material).side = THREE.DoubleSide;
    const R = rays(m, 200);
    buildTreeNow(m);
    expect(compare(m, R).same).toBeGreaterThanOrEqual(198);
    m.morphTargetInfluences![0] = 1;
    g.computeBoundingSphere(); g.computeBoundingBox();
    buildTreeNow(m);
    const r = compare(m, R);
    expect(r.hits).toBeGreaterThan(100);
    expect(r.same).toBeGreaterThanOrEqual(198);
    // part way: three.js's own raycast, so the same by construction
    m.morphTargetInfluences![0] = 0.5;
    expect(compare(m, R).same).toBe(200);
  }, 60_000);
});
