import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { VolumeInfo } from '../data/schema';
import { SITE_ROOT } from '../brand';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);


/** Shared assets live at the site root (public/assets), whichever section page loads them. */
export const assetUrl = (rel: string) => SITE_ROOT + rel;

export interface MeshAsset { kind: 'mesh'; sides: Partial<Record<'L' | 'R', THREE.Mesh>> }
export interface LineAsset { kind: 'lines'; sides: Partial<Record<'L' | 'R', LineSegmentsGeometry>>; centroid: Partial<Record<'L' | 'R', THREE.Vector3>> }

const cache = new Map<string, Promise<MeshAsset | LineAsset>>();

/**
 * Load one structure GLB. Each glTF node is named "L" or "R"; node transforms
 * (from vertex quantization) are kept on meshes and baked into line positions.
 * Coordinates stay in MNI RAS millimetres.
 */
export function loadStructure(file: string): Promise<MeshAsset | LineAsset> {
  let p = cache.get(file);
  if (!p) {
    p = loader.loadAsync(assetUrl(file)).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const meshes: MeshAsset['sides'] = {};
      const lines: LineAsset['sides'] = {};
      const centroid: LineAsset['centroid'] = {};
      const all: THREE.Object3D[] = [];
      gltf.scene.traverse((o) => all.push(o));
      all.forEach((o) => {
        const side = sideOf(o);
        if (!side) return;
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.Mesh;
          m.removeFromParent();
          m.matrix.copy(m.matrixWorld);
          m.matrix.decompose(m.position, m.quaternion, m.scale);
          meshes[side] = m;
        } else if ((o as THREE.LineSegments).isLineSegments) {
          const l = o as THREE.LineSegments;
          const { geom, c } = toWideLines(l.geometry, l.matrixWorld);
          lines[side] = geom;
          centroid[side] = c;
        }
      });
      if (Object.keys(lines).length) return { kind: 'lines', sides: lines, centroid } as LineAsset;
      return { kind: 'mesh', sides: meshes } as MeshAsset;
    });
    cache.set(file, p);
  }
  return p;
}

function sideOf(o: THREE.Object3D): 'L' | 'R' | null {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) if (n.name === 'L' || n.name === 'R') return n.name;
  return null;
}

/** Indexed GL_LINES -> segment pairs for LineSegments2 (pixel-width lines). */
function toWideLines(g: THREE.BufferGeometry, mat: THREE.Matrix4) {
  const pos = g.getAttribute('position');
  const idx = g.getIndex();
  const v = new THREE.Vector3();
  const pts = new Float32Array(pos.count * 3);
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mat);
    pts.set([v.x, v.y, v.z], i * 3);
    c.add(v);
  }
  c.divideScalar(Math.max(1, pos.count));
  const n = idx ? idx.count : pos.count;
  const seg = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const i = idx ? idx.getX(k) : k;
    seg[k * 3] = pts[i * 3]; seg[k * 3 + 1] = pts[i * 3 + 1]; seg[k * 3 + 2] = pts[i * 3 + 2];
  }
  const geom = new LineSegmentsGeometry();
  geom.setPositions(seg);
  return { geom, c };
}

/** gzip-compressed uint8 volume; tolerates servers that already decoded the gzip. */
export async function loadVolume(info: VolumeInfo): Promise<THREE.Data3DTexture> {
  const res = await fetch(assetUrl(info.file));
  if (!res.ok) throw new Error(`${info.file}: HTTP ${res.status}`);
  let buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    buf = new Uint8Array(await new Response(ds).arrayBuffer());
  }
  const [nx, ny, nz] = info.dims;
  if (buf.length !== nx * ny * nz) throw new Error(`${info.file}: expected ${nx * ny * nz} bytes, got ${buf.length}`);
  const tex = new THREE.Data3DTexture(buf, nx, ny, nz);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
