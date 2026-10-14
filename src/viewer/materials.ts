import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

export type Look = 'primary' | 'alt' | 'context' | 'shell' | 'ghost' | 'hidden';

/** Base opacity per look; layer opacity multiplies these. */
export const LOOK_OPACITY: Record<Look, number> = {
  primary: 1, alt: 1, context: 0.35, shell: 0.22, ghost: 0.1, hidden: 0,
};

export interface MeshMaterials {
  solid: THREE.MeshStandardMaterial;
  rim: THREE.ShaderMaterial;
}

/**
 * Outline look for alternative targets: a view-dependent rim (strong at
 * silhouettes, nearly clear face-on) with a faint fill. Supports clipping.
 */
export function rimMaterial(colour: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: colour.clone() }, uOpacity: { value: 1 }, uFill: { value: 0.1 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <clipping_planes_pars_vertex>
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <clipping_planes_pars_fragment>
      uniform vec3 uColor; uniform float uOpacity; uniform float uFill;
      varying vec3 vN; varying vec3 vV;
      void main() {
        #include <clipping_planes_fragment>
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float a = mix(uFill, 0.95, smoothstep(0.15, 0.75, rim));
        gl_FragColor = vec4(uColor, a * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    clipping: true,
  });
}

export function solidMaterial(colour: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: colour.clone(), roughness: 0.6, metalness: 0.0 });
}

export function applyLook(
  mesh: THREE.Mesh, mats: MeshMaterials, look: Look, layerOpacity: number, ghostColour: THREE.Color, colour: THREE.Color,
): void {
  mesh.visible = look !== 'hidden' && layerOpacity > 0.001;
  if (!mesh.visible) return;
  const op = LOOK_OPACITY[look] * layerOpacity;
  if (look === 'alt') {
    mats.rim.uniforms.uColor.value.copy(colour);
    mats.rim.uniforms.uOpacity.value = layerOpacity;
    mesh.material = mats.rim;
    mesh.renderOrder = 3;
    return;
  }
  const m = mats.solid;
  m.color.copy(look === 'ghost' ? ghostColour : colour);
  m.opacity = op;
  m.transparent = op < 0.999;
  m.depthWrite = !m.transparent;
  m.needsUpdate = true;
  mesh.material = m;
  mesh.renderOrder = look === 'ghost' ? 1 : look === 'shell' ? 2 : look === 'context' ? 2 : 0;
}

export function lineMaterial(colour: THREE.Color, widthPx: number, dashed: boolean): LineMaterial {
  const m = new LineMaterial({
    color: colour.getHex(), linewidth: widthPx, worldUnits: false, transparent: true, opacity: 0.9,
    dashed, dashSize: 2, gapSize: 1.5, alphaToCoverage: false, depthWrite: false,
  });
  m.clipping = true;
  return m;
}
