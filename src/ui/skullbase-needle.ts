import * as THREE from 'three';
import { NEEDLE_ID, NEEDLE_NAME, type NeedlePath } from '../skullbase/trigeminal';

/**
 * Trigeminal neuralgia's percutaneous needle, drawn by rule along Härtel's trigeminal axis (pipeline/
 * skullbase_trigeminal.py): a thin shaft from its outer end, 40 mm below the foramen ovale, to its tip (Meckel's cave on
 * v3, on v1 the trigeminal nerve's run down to the foramen, 12 mm beyond it); a see-through copy drawn over everything, so that the part in
 * the foramen and above it stays in sight through the bone; and a small ring square to it where it crosses the foramen.
 * Meshes only, coloured by a palette token (the viewer recolours them on a change of theme); the shaft can
 * be pointed at (its hover tip names it), and each part counts as the drawn needle (the text version lists it).
 */
// (a slate grey: the instruments' 'electrode' is too close to the cavernous sinus walls' grey in the dark theme,
// scripts/check-palette.ts)
export const NEEDLE_TOKEN = 'sbMedialWall';
/** the shaft's greatest radius, mm (a 0.9 mm needle); no more than the room the bone leaves round the line (on v3's
 * narrow foramen 0.25 mm), and no less than 0.2 mm */
const RADIUS = 0.45;
const radiusOf = (n: NeedlePath) => Math.max(0.2, Math.min(RADIUS, n.clearanceMm));

const v = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);

export function needleObjects(n: NeedlePath): THREE.Object3D[] {
  const outer = v(n.outer), tip = v(n.tip);
  const len = outer.distanceTo(tip);
  const dir = tip.clone().sub(outer).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const mid = outer.clone().add(tip).multiplyScalar(0.5);
  const r = radiusOf(n);
  const geo = () => new THREE.CylinderGeometry(r, r, len, 20);
  const tag = (o: THREE.Object3D) => { o.userData.token = NEEDLE_TOKEN; o.userData.drawn = NEEDLE_ID; return o; };
  // the shaft: lit, hidden by what lies in front of it
  const shaft = new THREE.Mesh(geo(), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 }));
  shaft.position.copy(mid);
  shaft.quaternion.copy(turn);
  shaft.userData.pick = NEEDLE_NAME;
  // the same, faint, over everything: the part in the canal and inside the skull stays in sight
  const through = new THREE.Mesh(geo(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthTest: false, depthWrite: false }));
  through.position.copy(mid);
  through.quaternion.copy(turn);
  through.renderOrder = 5;
  // a ring where it crosses the foramen, square to it
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.14, 8, 40), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
  ring.position.copy(v(n.crossing));
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  ring.renderOrder = 6;
  return [shaft, through, ring].map(tag);
}
