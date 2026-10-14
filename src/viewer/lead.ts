import * as THREE from 'three';
import { ACPC_AXES } from '../data/acpc';

/**
 * Generic quadripolar lead: 1.27 mm diameter, four 1.5 mm ring contacts,
 * 0.5 or 1.5 mm spacing, contact 0 at the tip. Placed so the centre of the
 * contact array sits on the target, then offset along its own axis (depth).
 *
 * Trajectory angles are in the template AC-PC frame:
 *   ring = angle above the AC-PC line in the sagittal plane, tilted anteriorly (90 = vertical)
 *   tilt = lateral angle from the mid-sagittal plane, entry lateral to target
 * Defaults are illustrative only: no source in the content gives a typical trajectory.
 */
export const LEAD = { diameter: 1.27, contactLength: 1.5, contacts: 4, shaftLength: 70 };

export interface LeadParams { spacing: number; depth: number; ring: number; tilt: number; stim: boolean; contact: number; radius: number }

const rad = THREE.MathUtils.degToRad;

export function trajectoryDir(ring: number, tilt: number, side: 'L' | 'R'): THREE.Vector3 {
  const r = rad(ring), t = rad(tilt), s = side === 'L' ? -1 : 1;
  const y0 = Math.cos(r), z0 = Math.sin(r);
  const local = [s * z0 * Math.sin(t), y0, z0 * Math.cos(t)]; // x (lateral), y (anterior), z (superior)
  const ax = ACPC_AXES;
  return new THREE.Vector3(
    local[0] * ax.x[0] + local[1] * ax.y[0] + local[2] * ax.z[0],
    local[0] * ax.x[1] + local[1] * ax.y[1] + local[2] * ax.z[1],
    local[0] * ax.x[2] + local[1] * ax.y[2] + local[2] * ax.z[2],
  ).normalize();
}

export function arrayLength(spacing: number): number {
  return LEAD.contacts * LEAD.contactLength + (LEAD.contacts - 1) * spacing;
}

export function contactCentres(target: THREE.Vector3, p: LeadParams, side: 'L' | 'R'): { tip: THREE.Vector3; dir: THREE.Vector3; centres: THREE.Vector3[] } {
  const dir = trajectoryDir(p.ring, p.tilt, side);
  const tip = target.clone().addScaledVector(dir, -(arrayLength(p.spacing) / 2 + p.depth));
  const centres = Array.from({ length: LEAD.contacts }, (_, k) =>
    tip.clone().addScaledVector(dir, k * (LEAD.contactLength + p.spacing) + LEAD.contactLength / 2));
  return { tip, dir, centres };
}

export class Lead {
  readonly group = new THREE.Group();
  private shaft: THREE.Mesh;
  private contacts: THREE.Mesh[] = [];
  private stimSphere: THREE.Mesh;
  readonly shaftMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5 });
  readonly contactMat = new THREE.MeshStandardMaterial({ color: 0xd9dee3, roughness: 0.3, metalness: 0.6 });
  readonly activeMat = new THREE.MeshStandardMaterial({ color: 0xffb000, roughness: 0.3, metalness: 0.4, emissive: 0x553300 });
  readonly stimMat = new THREE.MeshStandardMaterial({ color: 0xffb000, transparent: true, opacity: 0.28, depthWrite: false, roughness: 0.9 });

  constructor(readonly side: 'L' | 'R') {
    const r = LEAD.diameter / 2;
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.985, r * 0.985, 1, 24, 1, false), this.shaftMat);
    this.shaft.userData.lead = side;
    this.group.add(this.shaft);
    for (let k = 0; k < LEAD.contacts; k++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, LEAD.contactLength, 24, 1, true), this.contactMat);
      c.userData.lead = side;
      c.userData.contact = k;
      this.contacts.push(c);
      this.group.add(c);
    }
    const tipCap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.985, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this.shaftMat);
    tipCap.name = 'tip';
    tipCap.userData.lead = side;
    this.group.add(tipCap);
    this.stimSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.stimMat);
    this.stimSphere.renderOrder = 5;
    this.group.add(this.stimSphere);
    this.group.name = `lead-${side}`;
  }

  /** Place in RAS (the group lives in the RAS root). */
  update(target: THREE.Vector3, p: LeadParams): { tip: THREE.Vector3; dir: THREE.Vector3; centres: THREE.Vector3[] } {
    const geo = contactCentres(target, p, this.side);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), geo.dir);
    const place = (o: THREE.Object3D, along: number) => {
      o.position.copy(geo.tip).addScaledVector(geo.dir, along);
      o.quaternion.copy(q);
    };
    // shaft from the tip up to shaftLength (contacts drawn over it)
    this.shaft.scale.set(1, LEAD.shaftLength, 1);
    place(this.shaft, LEAD.shaftLength / 2);
    this.contacts.forEach((c, k) => {
      place(c, k * (LEAD.contactLength + p.spacing) + LEAD.contactLength / 2);
      c.material = p.stim && k === p.contact ? this.activeMat : this.contactMat;
    });
    const tip = this.group.getObjectByName('tip')!;
    place(tip, 0);
    this.stimSphere.visible = p.stim;
    this.stimSphere.position.copy(geo.centres[p.contact]);
    this.stimSphere.scale.setScalar(p.radius);
    return geo;
  }

  setClipping(planes: THREE.Plane[]): void {
    for (const m of [this.shaftMat, this.contactMat, this.activeMat, this.stimMat]) { m.clippingPlanes = planes; m.needsUpdate = true; }
  }
}
