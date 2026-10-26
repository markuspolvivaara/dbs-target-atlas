import * as THREE from 'three';

/**
 * The view through a rigid 0° endoscope: a camera at the scope's tip looking down its shaft, lit by a light at the tip
 * (near walls bright, far ones dark: the endoscopic look), in a round field.
 *
 * The ventricles' walls are drawn from inside, and through them what lies just behind them: the scene without the
 * walls is drawn first (to a target with its depth), then the walls over it, each point taking the colour of what lies
 * behind it the more, the closer that is (exp(-thickness / lambda)). So the fornix, the caudate and the thalamus tint the
 * ependyma over them, and through the thin floor of the third ventricle the mammillary bodies and the basilar artery
 * show. lambda is a shading choice (WALL_LAMBDA_MM; the floor's FLOOR_LAMBDA_MM), not a measurement.
 */
export interface EndoMesh {
  /** the structure's meshes (both sides), its colour in this view and its role */
  nodes: THREE.Mesh[];
  colour: THREE.Color;
  role: 'wall' | 'inside' | 'behind';
  visible: boolean;
  /** drawn as choroid plexus: tufted, lobulated, glistening */
  look?: 'plexus';
}

export interface EndoPose {
  /** world coordinates: the tip, the direction it looks (unit) and which way is up on the screen */
  tip: THREE.Vector3;
  dir: THREE.Vector3;
  up: THREE.Vector3;
}

export interface EndoFloor {
  /** world: the middle of the thin floor (the ETV target), its radius (mm), and the world's up direction */
  centre: THREE.Vector3;
  radiusMm: number;
  up: THREE.Vector3;
  /** how far behind the floor things still show (mm): the floor's thinness */
  lambdaMm: number;
}

export const WALL_LAMBDA_MM = 0.8;
export const FLOOR_LAMBDA_MM = 1.6;
/** the field of view: a modelling choice for a rigid neuroendoscope, not a measurement */
export const ENDO_FOV_DEG = 75;

const WALL_COLOUR = new THREE.Color('#e9d6c7');

/** Cell noise (world mm) for the choroid plexus's lobules: round bumps of two sizes, tops 1, crevices 0. */
const PLEXUS_NOISE = /* glsl */ `
vec3 pxHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
// the distance to the nearest cell centre, blended smoothly between neighbouring cells (rounded crevices)
float pxCell(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float acc = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = o + pxHash(i + o) - f;
    acc += exp(-10.0 * dot(r, r));
  }
  return sqrt(max(0.0, -log(acc) / 10.0));
}
// domes: rounded lobules about 0.7 mm across, smaller villi on them
float pxDome(float d, float r) { float t = clamp(d / r, 0.0, 1.0); return sqrt(1.0 - t * t); }
float pxLobes(vec3 p) {
  return 0.72 * pxDome(pxCell(p * 1.5), 0.9) + 0.28 * pxDome(pxCell(p * 4.0 + 7.1), 0.85);
}`;
const BRAIN_COLOUR = new THREE.Color('#d9c6b8');

export class Endoscope {
  readonly camera = new THREE.PerspectiveCamera(ENDO_FOV_DEG, 1, 0.15, 160);
  // inverse-square from the tip (millimetres): a wall 5 mm away lit about fully, one 20 mm away dim
  private light = new THREE.PointLight(0xfff4e8, 28, 0, 2);
  private fill = new THREE.AmbientLight(0xffffff, 0.04);
  private rt = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1), samples: 0 });
  /** the walls' depth alone: what lies behind them is drawn only beyond it (a structure crossing the cavity in front
   * of a wall, where the fitted shapes overlap a little, is peeled away) */
  private rtWalls = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1), samples: 0 });
  private wallDepthMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false });
  private peel = { uWallDepth: { value: null as THREE.Texture | null }, uPeelRes: { value: new THREE.Vector2(1, 1) } };
  private mats = new Map<THREE.Color, THREE.MeshStandardMaterial>();
  private wall: THREE.MeshStandardMaterial;
  private plexus: THREE.MeshStandardMaterial;
  private uniforms = {
    uBehind: { value: null as THREE.Texture | null }, uBehindDepth: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) }, uOffset: { value: new THREE.Vector2(0, 0) },
    uNear: { value: 0.15 }, uFar: { value: 160 }, uLambda: { value: WALL_LAMBDA_MM },
    uFloorCentre: { value: new THREE.Vector3() }, uFloorR: { value: 0 }, uFloorLambda: { value: FLOOR_LAMBDA_MM },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
  };

  constructor() {
    this.camera.add(this.light);
    this.wall = new THREE.MeshStandardMaterial({ color: WALL_COLOUR, roughness: 0.3, metalness: 0, side: THREE.DoubleSide });
    this.wall.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'varying vec3 vWPos;\nvoid main() {')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', /* glsl */ `// (the standard material's shader already has the packing functions: perspectiveDepthToViewZ)
uniform sampler2D uBehind; uniform sampler2D uBehindDepth; uniform vec2 uRes; uniform vec2 uOffset;
uniform float uNear; uniform float uFar; uniform float uLambda; uniform vec3 uFloorCentre; uniform float uFloorR;
uniform float uFloorLambda; uniform vec3 uUp;
varying vec3 vWPos;
// value noise on the wall (world mm): a faint mottling, so the eye can read its curvature
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {`)
        .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
  {
    float m = vnoise(vWPos * 0.9) * 0.6 + vnoise(vWPos * 2.3) * 0.4;
    diffuseColor.rgb *= 0.9 + 0.12 * m;
  }`)
        .replace('#include <dithering_fragment>', /* glsl */ `#include <dithering_fragment>
  {
    vec2 uv = (gl_FragCoord.xy - uOffset) / uRes;
    float zf = vViewPosition.z;
    // the floor: thin near its middle, where it faces down (outward normal pointing down)
    vec3 wn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
    float down = gl_FrontFacing ? -dot(wn, uUp) : dot(wn, uUp);
    float fl = (1.0 - smoothstep(0.55 * uFloorR, uFloorR, distance(vWPos, uFloorCentre))) * smoothstep(0.1, 0.5, down);
    float lam = mix(uLambda, uFloorLambda, fl);
    // what lies beyond the wall, averaged over a few pixels round this one (tissue under the ependyma shows softly,
    // not with the outlines of the shapes behind it)
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int ix = -2; ix <= 2; ix++) for (int iy = -2; iy <= 2; iy++) {
      vec2 o = vec2(float(ix), float(iy)) * 3.0 / uRes;
      float zb = -perspectiveDepthToViewZ(texture2D(uBehindDepth, uv + o).x, uNear, uFar);
      float th = zb - zf;
      float see = th < -0.2 ? 0.0 : exp(-max(th, 0.0) / lam);
      acc += see * sRGBTransferOETF(vec4(texture2D(uBehind, uv + o).rgb, 1.0)).rgb;
      wsum += see;
    }
    float see = wsum / 25.0 * mix(0.42, 0.9, fl);
    vec3 behind = wsum > 1e-4 ? acc / wsum : gl_FragColor.rgb;
    // the target holds linear colour; the wall's is already encoded for the screen
    gl_FragColor.rgb = mix(gl_FragColor.rgb, behind, see);
  }`);
    };
    this.wall.customProgramCacheKey = () => 'endoscope-wall';
    // the choroid plexus: its surface pushed out into lobules (the outline is lumpy, not a tube), finer tufts as relief,
    // dark crevices and lighter, wet tops (a rendering choice on the fitted model's shape, not measured anatomy)
    this.plexus = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0 });
    this.plexus.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', `varying vec3 vPWorld;\n${PLEXUS_NOISE}\nvoid main() {`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    // a lumpy outline: a displacement that depends on the position only (the mesh's split vertices move together)
    // (in world millimetres, turned into the mesh's own units: the stored positions are quantized and scaled)
    vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz * 0.6;
    vec3 dw = 1.1 * (vec3(pxLobes(wp), pxLobes(wp + 31.7), pxLobes(wp + 57.3)) - 0.45);
    transformed += (inverse(modelMatrix) * vec4(dw, 0.0)).xyz;
  }`)
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vPWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', `varying vec3 vPWorld;\n${PLEXUS_NOISE}\nvoid main() {`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  float pxH = pxLobes(vPWorld);
  // raspberry red, darker in the crevices between the lobules (their shading does most of the work)
  // plum to raspberry over the plexus, darker in the crevices
  float pxTint = pxCell(vPWorld * 0.35);
  diffuseColor.rgb = mix(vec3(0.26, 0.025, 0.045), vec3(0.17, 0.025, 0.07), pxTint) * (0.55 + 0.45 * pxH);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    float e = 0.05;
    vec3 gw = vec3(pxLobes(vPWorld + vec3(e, 0.0, 0.0)), pxLobes(vPWorld + vec3(0.0, e, 0.0)), pxLobes(vPWorld + vec3(0.0, 0.0, e))) - pxH;
    vec3 gv = (viewMatrix * vec4(gw / e, 0.0)).xyz;
    normal = normalize(normal - 0.9 * (gv - dot(gv, normal) * normal));
  }`);
    };
    this.plexus.customProgramCacheKey = () => 'endoscope-plexus';
  }

  private material(c: THREE.Color): THREE.MeshStandardMaterial {
    let m = this.mats.get(c);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0 });
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.peel);
        sh.fragmentShader = sh.fragmentShader
          .replace('void main() {', 'uniform sampler2D uWallDepth; uniform vec2 uPeelRes;\nvoid main() {\n  if (gl_FragCoord.z <= texture2D(uWallDepth, gl_FragCoord.xy / uPeelRes).x + 1e-6) discard;');
      };
      m.customProgramCacheKey = () => 'endoscope-behind';
      this.mats.set(c, m);
    }
    return m;
  }

  /** The camera's exposure: the light set for walls this far away (mm), as an endoscope's camera adjusts to the
   * cavity it is in. */
  setExposure(wallMm: number): void {
    const d = Math.min(Math.max(wallMm, 3), 25);
    this.light.intensity = 28 * (d / 5) ** 2;
  }

  setFloor(f: EndoFloor | null): void {
    if (!f) { this.uniforms.uFloorR.value = 0; return; }
    this.uniforms.uFloorCentre.value.copy(f.centre);
    this.uniforms.uFloorR.value = f.radiusMm;
    this.uniforms.uFloorLambda.value = f.lambdaMm;
    this.uniforms.uUp.value.copy(f.up);
  }

  setPose(p: EndoPose): void {
    this.camera.position.copy(p.tip);
    this.camera.up.copy(p.up);
    this.camera.lookAt(p.tip.clone().add(p.dir));
    this.camera.updateMatrixWorld(true);
  }

  /** Draw the view into this part of the canvas (pixels from the bottom left), the rest of the scene hidden. `inside`:
   * whether the tip is in the ventricles (else the view is of brain tissue against the lens). */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, meshes: EndoMesh[], vp: THREE.Vector4, inside: boolean, hideOthers: THREE.Object3D[]): void {
    const pr = renderer.getPixelRatio();
    const w = Math.max(1, Math.round(vp.z * pr)), h = Math.max(1, Math.round(vp.w * pr));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    this.camera.aspect = vp.z / vp.w;
    this.camera.updateProjectionMatrix();
    const saved = new Map<THREE.Mesh, { m: THREE.Material | THREE.Material[]; v: boolean }>();
    const keep = (n: THREE.Mesh) => { if (!saved.has(n)) saved.set(n, { m: n.material, v: n.visible }); };
    const hidden = hideOthers.map((o) => [o, o.visible] as const);
    for (const o of hideOthers) o.visible = false;
    const bg = scene.background;
    const clear = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
    scene.add(this.camera);                 // its light (at the tip) is part of the scene only while it draws
    const lights: [THREE.Light, number][] = [];
    scene.traverse((o) => { if ((o as THREE.Light).isLight && o !== this.light && o !== this.fill) { lights.push([o as THREE.Light, (o as THREE.Light).intensity]); (o as THREE.Light).intensity = 0; } });
    scene.add(this.fill);
    scene.background = BRAIN_COLOUR.clone().multiplyScalar(0.08);
    try {
      if (!inside) {
        // in the brain: the lens against white matter, nothing to see
        renderer.setScissorTest(true);
        renderer.setScissor(vp.x, vp.y, vp.z, vp.w);
        renderer.setViewport(vp.x, vp.y, vp.z, vp.w);
        renderer.setClearColor(BRAIN_COLOUR.clone().multiplyScalar(0.55));
        renderer.clear(true, true);
        return;
      }
      if (this.rtWalls.width !== w || this.rtWalls.height !== h) this.rtWalls.setSize(w, h);
      // pass 0: the walls' depth
      for (const m of meshes) for (const n of m.nodes) {
        keep(n);
        n.visible = m.visible && m.role === 'wall';
        if (n.visible) n.material = this.wallDepthMat;
      }
      renderer.setRenderTarget(this.rtWalls);
      renderer.setViewport(0, 0, vp.z, vp.w);
      renderer.setScissorTest(false);
      renderer.clear(true, true);
      renderer.render(scene, this.camera);
      // pass 1: what lies behind the walls, beyond them, to the target
      this.peel.uWallDepth.value = this.rtWalls.depthTexture;
      this.peel.uPeelRes.value.set(w, h);
      for (const m of meshes) for (const n of m.nodes) {
        n.visible = m.visible && m.role === 'behind';
        if (n.visible) n.material = this.material(m.colour);
      }
      renderer.setRenderTarget(this.rt);
      renderer.setViewport(0, 0, vp.z, vp.w);
      renderer.setScissorTest(false);
      renderer.clear(true, true);
      renderer.render(scene, this.camera);
      renderer.setRenderTarget(null);
      // pass 2: the walls (seeing through to pass 1) and what lies in the ventricles
      this.uniforms.uBehind.value = this.rt.texture;
      this.uniforms.uBehindDepth.value = this.rt.depthTexture;
      this.uniforms.uRes.value.set(vp.z * pr, vp.w * pr);
      this.uniforms.uOffset.value.set(vp.x * pr, vp.y * pr);
      this.uniforms.uNear.value = this.camera.near;
      this.uniforms.uFar.value = this.camera.far;
      for (const m of meshes) for (const n of m.nodes) {
        n.visible = m.visible && m.role !== 'behind';
        if (n.visible) n.material = m.role === 'wall' ? this.wall : m.look === 'plexus' ? this.plexus : this.material(m.colour);
      }
      renderer.setScissorTest(true);
      renderer.setScissor(vp.x, vp.y, vp.z, vp.w);
      renderer.setViewport(vp.x, vp.y, vp.z, vp.w);
      renderer.setClearColor(BRAIN_COLOUR.clone().multiplyScalar(0.08));
      renderer.clear(true, true);
      renderer.render(scene, this.camera);
    } finally {
      for (const [n, s] of saved) { n.material = s.m; n.visible = s.v; }
      for (const [o, v] of hidden) o.visible = v;
      for (const [l, i] of lights) l.intensity = i;
      scene.remove(this.fill);
      scene.remove(this.camera);
      scene.background = bg;
      renderer.setClearColor(clear, clearAlpha);
      renderer.setScissorTest(false);
      renderer.setRenderTarget(null);
    }
  }

  dispose(): void {
    this.rt.dispose();
    this.rtWalls.dispose();
    this.wallDepthMat.dispose();
    this.wall.dispose();
    this.plexus.dispose();
    for (const m of this.mats.values()) m.dispose();
  }
}
