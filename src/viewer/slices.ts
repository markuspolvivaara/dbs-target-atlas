import * as THREE from 'three';
import type { VolumeInfo } from '../data/schema';
import type { Axis } from '../state';
import { loadVolume } from './assets';

/**
 * Axial / coronal / sagittal planes that sample the ICBM 2009b T1 as a 3D
 * texture at their RAS position. Inside the subcortical crop the 0.5 mm
 * volume is used, elsewhere the 1.5 mm whole-head volume. Planes live in the
 * RAS root group, so plane coordinates are MNI millimetres.
 */
const EXTENT = { x: [-80, 80], y: [-118, 80], z: [-62, 88] } as const;

const vert = /* glsl */ `
  varying vec3 vRas;
  void main() {
    vRas = (modelMatrix * vec4(position, 1.0)).xyz; // world
    vRas = (uRootInv * vec4(vRas, 1.0)).xyz;        // back to RAS
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }`;

const frag = /* glsl */ `
  precision highp sampler3D;
  uniform sampler3D uLo; uniform sampler3D uHi;
  uniform vec3 uLoOrigin; uniform vec3 uLoSize; uniform vec3 uLoVox;
  uniform vec3 uHiOrigin; uniform vec3 uHiSize; uniform vec3 uHiVox;
  uniform float uHasHi; uniform float uOpacity; uniform float uContrast; uniform float uBrightness;
  varying vec3 vRas;
  void main() {
    vec3 tl = (vRas - uLoOrigin + 0.5 * uLoVox) / uLoSize;
    vec3 th = (vRas - uHiOrigin + 0.5 * uHiVox) / uHiSize;
    float v;
    if (uHasHi > 0.5 && all(greaterThan(th, vec3(0.0))) && all(lessThan(th, vec3(1.0)))) v = texture(uHi, th).r;
    else if (all(greaterThan(tl, vec3(0.0))) && all(lessThan(tl, vec3(1.0)))) v = texture(uLo, tl).r;
    else discard;
    v = clamp((v - 0.5) * uContrast + 0.5 + uBrightness, 0.0, 1.0);
    gl_FragColor = vec4(vec3(v), uOpacity); // display values as stored (no colour-space conversion)
  }`;

export class Slices {
  readonly group = new THREE.Group();
  private planes = new Map<Axis, THREE.Mesh>();
  private material: THREE.ShaderMaterial | null = null;
  private loading: Promise<void> | null = null;
  readonly clipPlanes = new Map<Axis, THREE.Plane>();
  status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';

  constructor(private volumes: Record<string, VolumeInfo>, private root: THREE.Object3D, private onReady: () => void) {
    this.group.name = 'slices';
  }

  ensureLoaded(): Promise<void> {
    if (this.loading) return this.loading;
    this.status = 'loading';
    const lo = this.volumes['t1_15mm'];
    const hi = this.volumes['t1_crop_05mm'];
    this.loading = Promise.all([loadVolume(lo), hi ? loadVolume(hi) : Promise.resolve(null)])
      .then(([tl, th]) => {
        const size = (v: VolumeInfo) => new THREE.Vector3(...v.dims).multiplyScalar(v.spacing);
        const vox = (v: VolumeInfo) => new THREE.Vector3(v.spacing, v.spacing, v.spacing);
        this.root.updateMatrixWorld(true);
        this.material = new THREE.ShaderMaterial({
          uniforms: {
            uLo: { value: tl }, uLoOrigin: { value: new THREE.Vector3(...lo.origin) }, uLoSize: { value: size(lo) }, uLoVox: { value: vox(lo) },
            uHi: { value: th ?? tl }, uHiOrigin: { value: new THREE.Vector3(...(hi ?? lo).origin) }, uHiSize: { value: size(hi ?? lo) }, uHiVox: { value: vox(hi ?? lo) },
            uHasHi: { value: th ? 1 : 0 }, uOpacity: { value: 1 }, uContrast: { value: 1.0 }, uBrightness: { value: -0.06 },
            uRootInv: { value: new THREE.Matrix4().copy(this.root.matrixWorld).invert() },
          },
          vertexShader: 'uniform mat4 uRootInv;\n' + vert,
          fragmentShader: frag,
          side: THREE.DoubleSide,
          transparent: false,
        });
        for (const p of this.planes.values()) p.material = this.material;
        this.status = 'ready';
        this.onReady();
      })
      .catch((e) => { this.status = 'error'; console.error(e); throw e; });
    return this.loading;
  }

  /** Create/position/hide planes. */
  update(axis: Axis, on: boolean, mm: number): void {
    let p = this.planes.get(axis);
    if (!p && on) {
      const [w, h] = axis === 'axial' ? [EXTENT.x, EXTENT.y] : axis === 'coronal' ? [EXTENT.x, EXTENT.z] : [EXTENT.y, EXTENT.z];
      const g = new THREE.PlaneGeometry(w[1] - w[0], h[1] - h[0]);
      g.translate((w[0] + w[1]) / 2, (h[0] + h[1]) / 2, 0);
      // PlaneGeometry lies in local XY; orient so local XY maps onto the slice's RAS axes
      if (axis === 'coronal') g.rotateX(Math.PI / 2);                    // XY -> XZ
      if (axis === 'sagittal') { g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2); } // XY -> XZ -> YZ
      p = new THREE.Mesh(g, this.material ?? new THREE.MeshBasicMaterial({ color: 0x444444, side: THREE.DoubleSide }));
      p.name = `slice-${axis}`;
      p.userData.slice = axis;
      p.renderOrder = -1;
      this.planes.set(axis, p);
      this.group.add(p);
    }
    if (!p) return;
    p.visible = on;
    p.position.set(axis === 'sagittal' ? mm : 0, axis === 'coronal' ? mm : 0, axis === 'axial' ? mm : 0);
  }

  /** Clip plane in world space for structures ("cut away"). keep = side of the plane that stays. */
  clipPlane(axis: Axis, mm: number, flip: boolean): THREE.Plane {
    const n = new THREE.Vector3(axis === 'sagittal' ? 1 : 0, axis === 'coronal' ? 1 : 0, axis === 'axial' ? 1 : 0);
    // default keeps the inferior / posterior / left part (normal points to the kept side)
    const keepNeg = !flip;
    const ras = new THREE.Plane(keepNeg ? n.clone().negate() : n.clone(), keepNeg ? mm : -mm);
    const pl = ras.clone().applyMatrix4(this.root.matrixWorld);
    this.clipPlanes.set(axis, pl);
    return pl;
  }

  pickables(): THREE.Object3D[] {
    return [...this.planes.values()].filter((p) => p.visible);
  }
}
