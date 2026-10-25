import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

/** muted: opaque, drawn in a colour close to the neutral one (cortical labels that are not highlighted) */
export type Look = 'primary' | 'alt' | 'context' | 'shell' | 'ghost' | 'muted' | 'hidden';

/** Base opacity per look; layer opacity multiplies these. */
export const LOOK_OPACITY: Record<Look, number> = {
  primary: 1, alt: 1, context: 0.35, shell: 0.22, ghost: 0.1, muted: 1, hidden: 0,
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
  if (look === 'muted') m.color.copy(colour).lerp(ghostColour, 0.8);
  else m.color.copy(look === 'ghost' ? ghostColour : colour);
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

/** Shared by the selection outlines: its width in drawing-buffer pixels and that buffer's size (set on resize). */
export interface OutlineUniforms { uOutlinePx: { value: number }; uResolution: { value: THREE.Vector2 } }

/**
 * The selected structure's outline: its back faces pushed out a few pixels round its silhouette (an inverted hull),
 * in one flat colour, depth-tested so that what lies in front of the structure also covers its outline. Clipped like
 * the anatomy; follows morph targets (the normals are the unmorphed ones, enough for a few pixels).
 */
export function outlineMaterial(colour: THREE.Color, u: OutlineUniforms, widthScale: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: colour.clone(), side: THREE.BackSide, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutlinePx = u.uOutlinePx;
    sh.uniforms.uResolution = u.uResolution;
    sh.uniforms.uScale = { value: widthScale };
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'uniform float uOutlinePx;\nuniform float uScale;\nuniform vec2 uResolution;\nvoid main() {')
      .replace('#include <project_vertex>', /* glsl */ `#include <project_vertex>
  {
    vec2 dir = ( projectionMatrix * vec4( normalize( normalMatrix * normal ), 0.0 ) ).xy;
    float len = length( dir );
    if ( len > 1e-6 ) gl_Position.xy += dir / len * uOutlinePx * uScale * 2.0 / uResolution * gl_Position.w;
  }`);
  };
  m.customProgramCacheKey = () => `selection-outline-${widthScale}`;
  return m;
}

/**
 * The selected structure where something covers it: drawn only where it lies behind what is already drawn (depth
 * test reversed), translucent in its own colour, so it can be found through bone or brain without fading them.
 */
export function xrayMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, depthFunc: THREE.GreaterDepth,
  });
}
