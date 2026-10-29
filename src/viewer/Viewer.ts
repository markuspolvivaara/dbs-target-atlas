import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { CameraPreset, ManifestStructure } from '../data/schema';
import type { Axis, ExtraLayerKey, Hemi, LayerKey } from '../state';
import { loadStructure, type LineAsset, type MeshAsset } from './assets';
import { Lead, contactCentres, trajectoryDir } from './lead';
import { applyLook, lineMaterial, outlineMaterial, rimMaterial, solidMaterial, xrayMaterial, type Look, type MeshMaterials, type OutlineUniforms } from './materials';
import { onViewPrefs, viewPrefs } from './viewprefs';
import { geometryOf, RayGridCache, type RayHit } from './endoray';
import { Endoscope, type EndoMesh } from './endoscope';
import type { SceneSource, ScenePlan, TractRole, ViewState } from './scene';
import { Slices } from './slices';

type Side = 'L' | 'R';
type Palette = Record<string, string>;

interface MeshItem { kind: 'mesh'; meta: ManifestStructure; nodes: Partial<Record<Side, THREE.Mesh>>; mats: MeshMaterials; look: Look; layer: LayerKey | ExtraLayerKey; surface: boolean; faded?: boolean }
interface LineItem { kind: 'lines'; meta: ManifestStructure; nodes: Partial<Record<Side, LineSegments2>>; mat: LineMaterial; role: TractRole | null; centroid: Partial<Record<Side, THREE.Vector3>> }
type Item = MeshItem | LineItem;

export interface PickInfo {
  id: string | null; name: string; ras: THREE.Vector3; side: Side | null; kind: 'structure' | 'slice' | 'lead' | 'marker';
  /** seen through the endoscope: how far behind the ventricle's wall it lies (mm) */
  behindMm?: number;
  /** ... through the thin floor of the third ventricle */
  throughFloor?: boolean;
}

type V3t = [number, number, number];
/** An endoscope in the scene (RAS millimetres): where its tip is, which way it looks and which way is up on screen;
 * whether its view is the big one (the 3D view then an inset) or the inset; each structure's role (the ventricles'
 * walls, what lies in them, what lies behind the walls; null: not drawn) and colour in its view; the thin floor. */
export interface EndoscopeConfig {
  tip: V3t; dir: V3t; up: V3t;
  big: boolean;
  role(id: string, category: string | undefined): EndoMesh['role'] | null;
  /** a structure drawn with its own look in the endoscope's view */
  look?(id: string): EndoMesh['look'];
  /** a body under the wall shown as the wall bulging white over it, not drawn itself (and picked before what lies
   * around it): its meshes taken as spheres */
  bulge?(id: string): boolean;
  colour(id: string): string;
  /** RAS: the thin floor's middle, its front-to-back axis and half-length, its half-width side to side (mm) */
  floor: { centre: V3t; ap: V3t; radiusMm: number; radiusLatMm: number; lambdaMm: number } | null;
  /** meshes a tool draws (in the scene's frame) that the endoscope shows too, with an id and a name for picking (the
   * walls the drilling cuts) */
  extra?(): { id: string; name: string; mesh: EndoMesh }[];
  /** whether the tip is in the cavity, where the caller knows it better than rays to the walls can tell */
  inside?(): boolean;
  /** x-ray vision: structures (behind ones) drawn over the view whatever lies in front of them, in this colour (CSS) */
  xray?(id: string): string | null;
}

/** A tool that takes the left button over the 3D view (the view then turns with the right button, pans with it and
 * Shift): it is given the pointer's ray in the scene's own frame (RAS mm), or null when the pointer leaves. */
export interface PointerTool {
  hover(ray: THREE.Ray | null, e?: PointerEvent): void;
  down(ray: THREE.Ray, e?: PointerEvent): void;
  drag(ray: THREE.Ray, e?: PointerEvent): void;
  up(e?: PointerEvent): void;
  /** whether it takes this pointer (any button; without it, the left button everywhere): the rest goes to the view as
   * when no tool is set. `inEndoscope`: over the endoscope's view. */
  wants?(e: PointerEvent, inEndoscope: boolean): boolean;
  /** the wheel over the endoscope's view (the 3D view's zoom then does not get it) */
  wheel?(deltaY: number): void;
}

export interface ViewerEvents {
  hover(info: PickInfo | null, clientX: number, clientY: number): void;
  pick(info: PickInfo): void;
  readout(ras: THREE.Vector3 | null): void;
  measure(points: THREE.Vector3[]): void;
  cameraChanged(pos: THREE.Vector3, tgt: THREE.Vector3): void;
  leadMoved(depth: number): void;
  status(text: string | null): void;
  lead(contacts: Record<Side, THREE.Vector3[]> | null): void;
  /** The camera starts / stops moving (orbit, pan, zoom or preset animation). */
  moving(active: boolean): void;
  /** the endoscope's tip went into or out of the ventricles (or that became known: the walls loaded) */
  endoscope?(inside: boolean): void;
}

const DEG = Math.PI / 180;
/** a layer the section's state does not have is drawn */
const SHOWN = { on: true, opacity: 1 };
const RAS_TO_WORLD = new THREE.Matrix4().makeRotationX(-Math.PI / 2); // (x, y, z) RAS -> (x, z, -y) three
/** in the endoscope's view, what lies this close behind a wall is what the pointer is on (it shows through) */
const ENDO_PICK_BEHIND_MM = 3;
/** ... and through the thin floor of the third ventricle, this close: what lies under it can be named before it is opened */
const ENDO_PICK_FLOOR_MM = 14;

/** Shared 3D viewer. What to draw comes from the section's SceneSource (catalogue + planner). */
export class Viewer<S extends ViewState = ViewState, P extends ScenePlan = ScenePlan> {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** All anatomy lives here, in MNI RAS millimetres. */
  readonly root = new THREE.Group();
  private items = new Map<string, Item>();
  private markerGroup = new THREE.Group();
  private measureGroup = new THREE.Group();
  /** objects a section draws itself (the spine's virtual screw); coloured by palette token, cut like the anatomy */
  private overlayGroup = new THREE.Group();
  /** a pointer tool's own objects, in the scene's frame (the tool adds, updates and disposes them) */
  readonly toolGroup = new THREE.Group();
  private tool: PointerTool | null = null;
  private toolDown = false;
  private leads: Record<Side, Lead> = { L: new Lead('L'), R: new Lead('R') };
  readonly slices: Slices;
  private palette: Palette = {};
  private ghost = new THREE.Color('#9aa5b1');
  private plan: P | null = null;
  private state: S | null = null;
  private needsRender = true;
  private anim: { t0: number; dur: number; p0: THREE.Vector3; p1: THREE.Vector3; t0v: THREE.Vector3; t1v: THREE.Vector3 } | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hoverQueued = false;
  private lastPointer: PointerEvent | null = null;
  private measuring = false;
  private measurePts: THREE.Vector3[] = [];
  private drag: { side: Side; startDepth: number; axis2d: THREE.Vector2; pxPerMm: number; x: number; y: number } | null = null;
  private clipPlanes: THREE.Plane[] = [];
  private markerTargets = new Map<string, THREE.Vector3>();
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private disposed = false;
  private loadingCount = 0;
  private applySeq = 0;
  private moveTimer = 0;
  /** morph targets by name (a glTF mesh's extras.targetNames: the skull base's surgical shapes); an unnamed target 0
   * (the cortex's inflated surface) is '0' and follows inflate. Current values and running animations. */
  private morph: Record<string, number> = {};
  private morphAnim = new Map<string, { t0: number; from: number; to: number }>();
  /** colour of the inside of cortical surfaces, seen through cut-aways and hidden labels */
  private interior = { value: new THREE.Color('#7d858e') };
  /** the selected structure's look: a dark ring with a light halo outside it (reads on light and dark backgrounds and
   * on any structure's colour), and the x-ray of its covered parts in its own colour */
  private outlineU: OutlineUniforms = { uOutlinePx: { value: 1.5 }, uResolution: { value: new THREE.Vector2(1, 1) } };
  private selMats = {
    halo: outlineMaterial(new THREE.Color('#ffffff'), this.outlineU, 2.4),
    ring: outlineMaterial(new THREE.Color('#0b1620'), this.outlineU, 1),
    xray: xrayMaterial(),
  };
  private selOverlays: THREE.Mesh[] = [];
  /** the x-rays of outlined structures after the first, each in its structure's own colour */
  private selXrays: THREE.MeshBasicMaterial[] = [];
  private unsubPrefs: () => void;
  private endo: Endoscope | null = null;
  private endoCfg: EndoscopeConfig | null = null;
  private endoInside = false;
  /** whether the tip's place must be found again (the pose, the shapes or the loaded meshes changed) */
  private endoDirty = true;
  /** the endoscope's rays: against the walls and what lies in the cavity (each frame), and against all it shows (picks) */
  private endoSeen = new RayGridCache();
  /** the names of the meshes a tool adds to the endoscope's view */
  private extraNames = new Map<string, string>();
  private endoPick = new RayGridCache();
  private endoColours = new Map<string, THREE.Color>();
  private endoReported = false;
  /** the angiogram view (vascular section): meshes whose geometry carries _arrival and _dwell (shares of the angiogram's
   * length) fade in as contrast reaches them and wash out after their dwell, drawn in one dark ink over a light ground
   * without depth (so vessels in front of each other add up, as on a radiograph); uT: the time, as a share */
  private dsa = { on: false, uOn: { value: 0 }, uT: { value: 0 }, uFade: { value: 0.03 }, uInk: { value: new THREE.Color('#121212') },
    ground: new THREE.Color('#d9d9d4'), themeGround: new THREE.Color('#ffffff') };

  private readonly cat;

  constructor(private host: HTMLElement, private ev: ViewerEvents, private source: SceneSource<S, P>) {
    this.cat = source.catalog;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.tabIndex = 0;
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.5, 2000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 900;
    this.controls.addEventListener('change', () => this.invalidate());
    this.controls.addEventListener('end', () => {
      this.ev.cameraChanged(this.toRas(this.camera.position), this.toRas(this.controls.target));
      // damping keeps the view drifting briefly after release
      clearTimeout(this.moveTimer);
      this.moveTimer = window.setTimeout(() => this.ev.moving(false), 300);
    });
    this.controls.addEventListener('start', () => { clearTimeout(this.moveTimer); this.ev.moving(true); });

    this.root.matrixAutoUpdate = false;
    this.root.matrix.copy(RAS_TO_WORLD);
    this.root.updateMatrixWorld(true);
    this.scene.add(this.root);
    this.root.add(this.markerGroup, this.measureGroup, this.overlayGroup, this.toolGroup, this.leads.L.group, this.leads.R.group);
    this.slices = new Slices(this.cat.volumes, this.root, () => { this.ev.status(null); this.invalidate(); });
    this.root.add(this.slices.group);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x5a6470, 1.4);
    this.scene.add(hemi);
    const head = new THREE.DirectionalLight(0xffffff, 1.6);
    head.position.set(0.3, 0.6, 1);
    this.camera.add(head);
    this.scene.add(this.camera);

    // (a section's plan may follow the setting too)
    this.unsubPrefs = onViewPrefs(() => { if (this.state) this.plan = this.source.plan(this.state); this.restyle(); });
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.bindPointer();
    this.loop();
  }

  // ---------------------------------------------------------------- frame
  invalidate(): void { this.needsRender = true; }

  private loop = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    if (this.anim) {
      const k = Math.min(1, (performance.now() - this.anim.t0) / this.anim.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(this.anim.p0, this.anim.p1, e);
      this.controls.target.lerpVectors(this.anim.t0v, this.anim.t1v, e);
      if (k >= 1) { this.anim = null; this.ev.cameraChanged(this.toRas(this.camera.position), this.toRas(this.controls.target)); this.ev.moving(false); }
      this.needsRender = true;
    }
    for (const [name, a] of [...this.morphAnim]) {
      const k = Math.min(1, (performance.now() - a.t0) / 800);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.setMorph(name, a.from + (a.to - a.from) * e);
      if (k >= 1) this.morphAnim.delete(name);
    }
    if (this.controls.update()) this.needsRender = true;
    if (this.needsRender) {
      this.needsRender = false;
      if (this.endoCfg) this.renderEndoscope();
      else this.renderer.render(this.scene, this.camera);
    }
  };

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const it of this.items.values()) if (it.kind === 'lines') it.mat.resolution.set(w, h);
    this.renderer.getDrawingBufferSize(this.outlineU.uResolution.value);
    this.outlineU.uOutlinePx.value = 1.5 * this.renderer.getPixelRatio();
    this.invalidate();
  }

  private toRas(world: THREE.Vector3): THREE.Vector3 { return this.root.worldToLocal(world.clone()); }
  private toWorld(ras: THREE.Vector3): THREE.Vector3 { return this.root.localToWorld(ras.clone()); }

  // ---------------------------------------------------------------- theme
  setTheme(palette: Palette, background: string, ghost: string): void {
    this.palette = palette;
    this.dsa.themeGround.set(background);
    this.scene.background = new THREE.Color(this.dsa.on ? this.dsa.ground : background);
    this.ghost.set(ghost);
    this.interior.value.set(palette.cortex ?? '#c4cbd3').multiplyScalar(0.62);
    this.leads.L.shaftMat.color.set(palette.electrode); this.leads.R.shaftMat.color.set(palette.electrode);
    if (this.plan) this.updateMarkers();
    this.recolourOverlay();
    this.restyle();
  }

  // ---------------------------------------------------------------- overlay
  /** Replace the section's own objects (in the scene's RAS millimetres). A mesh whose userData.token names a palette
   * token takes that colour, now and on theme changes. */
  setOverlay(objects: THREE.Object3D[]): void {
    for (const c of [...this.overlayGroup.children]) {
      this.overlayGroup.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.geometry.dispose(); for (const mt of [m.material].flat()) mt.dispose(); }
      });
    }
    for (const o of objects) this.overlayGroup.add(o);
    this.recolourOverlay();
    this.clipOverlay();
    this.invalidate();
  }

  private recolourOverlay(): void {
    this.overlayGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      const token = m.userData?.token as string | undefined;
      if (m.isMesh && token && this.palette[token]) for (const mt of [m.material].flat()) (mt as THREE.MeshStandardMaterial).color?.set(this.palette[token]);
    });
    this.invalidate();
  }

  private clipOverlay(): void {
    this.overlayGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) for (const mt of [m.material].flat()) mt.clippingPlanes = this.clipPlanes;
    });
  }

  private colour(meta: ManifestStructure): THREE.Color {
    return new THREE.Color(this.palette[meta.colour.token] ?? meta.colour.light);
  }

  // ---------------------------------------------------------------- loading
  private async ensure(id: string): Promise<Item | null> {
    const have = this.items.get(id);
    if (have) return have;
    const meta = this.cat.byId.get(id);
    if (!meta) return null;
    this.loadingCount++;
    this.ev.status('Loading anatomy…');
    try {
      const asset = await loadStructure(meta.file);
      if (this.items.has(id)) return this.items.get(id)!;
      const it = asset.kind === 'mesh' ? this.makeMeshItem(meta, asset) : this.makeLineItem(meta, asset);
      this.items.set(id, it);
      this.endoDirty = true;
      return it;
    } catch (e) {
      console.error(e);
      this.ev.status(`Could not load ${meta.name}.`);
      return null;
    } finally {
      this.loadingCount--;
      if (this.loadingCount === 0) this.ev.status(null);
    }
  }

  private makeMeshItem(meta: ManifestStructure, a: MeshAsset): MeshItem {
    const c = this.colour(meta);
    const mats = { solid: solidMaterial(c), rim: rimMaterial(c) };
    const surface = meta.type === 'surface';
    const nodes: MeshItem['nodes'] = {};
    for (const side of ['L', 'R'] as Side[]) {
      const m = a.sides[side];
      if (!m) continue;
      m.userData = { id: meta.id, side };
      m.visible = false;
      // cortical labels carry sulcal-depth shading as vertex colours and the inflated surface as morph target 0
      if (m.geometry.getAttribute('color')) mats.solid.vertexColors = true;
      if (m.geometry.getAttribute('_arrival')) this.dsaMaterial(mats.solid);
      // cut-away surfaces (insular view, hidden labels, clip planes) show their inside, in one flat colour so an
      // opening reads as a cut into the brain rather than a view through it
      if (surface && mats.solid.side !== THREE.DoubleSide) {
        mats.solid.side = THREE.DoubleSide;
        mats.solid.onBeforeCompile = (sh) => {
          sh.uniforms.uInterior = this.interior;
          sh.fragmentShader = sh.fragmentShader
            .replace('void main() {', 'uniform vec3 uInterior;\nvoid main() {')
            .replace('#include <color_fragment>', '#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb = uInterior;');
        };
        mats.solid.customProgramCacheKey = () => 'cortex-interior';
      }
      for (const [name, i] of Object.entries(m.morphTargetDictionary ?? {})) if (m.morphTargetInfluences) m.morphTargetInfluences[i] = this.morph[name] ?? 0;
      nodes[side] = m;
      this.root.add(m);
    }
    // bone meshes share the 'nuclei' layer, soft-tissue meshes the 'cortex' layer and vessel / nerve tubes the
    // 'tracts' layer (skull-base section); cortical labels (cortex section) use the 'cortex' layer
    const layer: LayerKey | ExtraLayerKey = meta.layer ?? (meta.type === 'cortex' || meta.type === 'soft' || surface ? 'cortex'
      : meta.type === 'tube' ? 'tracts' : meta.type === 'target' ? 'targets' : 'nuclei');
    return { kind: 'mesh', meta, nodes, mats, look: 'hidden', layer, surface };
  }

  /** The angiogram's fade on a mesh's material (see `dsa`): off, the material is as it was. */
  private dsaMaterial(m: THREE.MeshStandardMaterial): void {
    const u = this.dsa;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uDsaOn: u.uOn, uDsaT: u.uT, uDsaFade: u.uFade, uDsaInk: u.uInk });
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'attribute float _arrival;\nattribute float _dwell;\nvarying float vArr;\nvarying float vDw;\nvoid main() {\n  vArr = _arrival; vDw = _dwell;');
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform float uDsaOn;\nuniform float uDsaT;\nuniform float uDsaFade;\nuniform vec3 uDsaInk;\nvarying float vArr;\nvarying float vDw;\nvoid main() {')
        .replace('#include <dithering_fragment>', /* glsl */ `#include <dithering_fragment>
  if (uDsaOn > 0.5) {
    float a = smoothstep(vArr, vArr + uDsaFade, uDsaT) * (1.0 - smoothstep(vArr + vDw, vArr + vDw + 4.0 * uDsaFade, uDsaT));
    if (a < 0.02) discard;
    float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
    gl_FragColor = vec4(uDsaInk, a * (0.18 + 0.55 * facing));
  }`);
    };
    m.customProgramCacheKey = () => 'dsa';
  }

  /** The angiogram view: on or off, and its time (s) of its length (s). */
  setDsa(on: boolean, tS: number, lengthS: number): void {
    const was = this.dsa.on;
    this.dsa.on = on;
    this.dsa.uOn.value = on ? 1 : 0;
    this.dsa.uT.value = tS / lengthS;
    this.dsa.uFade.value = 0.3 / lengthS;
    if (on !== was) {
      this.scene.background = new THREE.Color(on ? this.dsa.ground : this.dsa.themeGround);
      this.restyle();
    }
    this.invalidate();
  }

  /** Set the morph target of this name on every mesh that has it (0..1). */
  private setMorph(name: string, v: number): void {
    this.morph[name] = v;
    this.endoDirty = true;
    for (const it of this.items.values()) {
      if (it.kind !== 'mesh') continue;
      for (const m of Object.values(it.nodes)) {
        const i = m?.morphTargetDictionary?.[name];
        if (i !== undefined && m?.morphTargetInfluences) m.morphTargetInfluences[i] = v;
      }
    }
    this.needsRender = true;
  }

  /** Swap a surface's index between all faces and the faces left after removing the opercula (flagged per vertex). */
  private setOpercula(m: THREE.Mesh, cut: boolean): void {
    const g = m.geometry;
    const u = m.userData as { fullIndex?: THREE.BufferAttribute; cutIndex?: THREE.BufferAttribute };
    if (!u.fullIndex) {
      const oper = g.getAttribute('_oper');
      const idx = g.getIndex();
      if (!oper || !idx) return;
      u.fullIndex = idx;
      const keep: number[] = [];
      for (let f = 0; f < idx.count; f += 3) {
        let n = 0;
        for (let k = 0; k < 3; k++) if (oper.getX(idx.getX(f + k)) > 0.5) n++;
        if (n === 0) keep.push(idx.getX(f), idx.getX(f + 1), idx.getX(f + 2));
      }
      u.cutIndex = new THREE.BufferAttribute(new Uint32Array(keep), 1);
    }
    const want = cut ? u.cutIndex! : u.fullIndex;
    if (g.getIndex() !== want) g.setIndex(want);
  }

  private makeLineItem(meta: ManifestStructure, a: LineAsset): LineItem {
    const mat = lineMaterial(this.colour(meta), 1.6, false);
    mat.resolution.set(this.host.clientWidth, this.host.clientHeight);
    const nodes: LineItem['nodes'] = {};
    for (const side of ['L', 'R'] as Side[]) {
      const g = a.sides[side];
      if (!g) continue;
      const l = new LineSegments2(g, mat);
      l.userData = { id: meta.id, side };
      l.visible = false;
      nodes[side] = l;
      this.root.add(l);
    }
    return { kind: 'lines', meta, nodes, mat, role: null, centroid: a.centroid };
  }

  /** Load every nucleus (and skull-base bone / soft-tissue mesh) up front (small); cortex and tracts on demand. */
  async preload(): Promise<void> {
    const ids = this.cat.structures.filter((s) => ['nucleus', 'target', 'bone', 'soft', 'surface', 'tube'].includes(s.type)).map((s) => s.id);
    await Promise.all(ids.map((id) => this.ensure(id)));
    this.restyle();
  }

  // ---------------------------------------------------------------- state
  async apply(s: S, opts: { animateCamera: boolean }): Promise<void> {
    const seq = ++this.applySeq;
    const prev = this.state;
    this.state = structuredClone(s);
    const planChanged = !prev || this.source.planKey(prev) !== this.source.planKey(s);
    if (planChanged) this.plan = this.source.plan(s);
    const p = this.plan!;
    const focusMeta = s.sel ? this.cat.byId.get(s.sel) : undefined;
    const needed = [
      ...[...p.tracts.keys()],
      // a structure selected from the index or legend is shown even if the view does not include it
      ...(focusMeta && (focusMeta.type === 'tract' || focusMeta.type === 'cortex') ? [focusMeta.id] : []),
      ...(s.layers.cortex.on && p.parcels.size ? ['cortex', ...p.parcels.keys()] : []),
      ...(s.layers.cortex.on && !p.parcels.size && (p.cortex || this.items.has('cortex')) ? ['cortex'] : []),
    ];
    await Promise.all(needed.map((id) => this.ensure(id)));
    if (seq !== this.applySeq) return; // superseded while loading
    this.updateMarkers();
    this.updateClip();
    this.restyle();
    this.updateLead();
    const initial = !prev;
    const want: Record<string, number> = { '0': s.inflate ?? 0, ...(s.morphs ?? {}) };
    for (const name of Object.keys(this.morph)) if (!(name in want)) want[name] = 0;
    for (const [name, to] of Object.entries(want)) {
      const cur = this.morph[name] ?? 0;
      if (to === (this.morphAnim.get(name)?.to ?? cur)) continue;
      // a slider's small steps follow at once; a toggle (pial / inflated, open / closed) animates
      if (initial || this.reducedMotion || Math.abs(to - cur) <= 0.15) { this.morphAnim.delete(name); this.setMorph(name, to); }
      else this.morphAnim.set(name, { t0: performance.now(), from: cur, to });
    }
    if (s.cam.pos && s.cam.tgt && (initial || opts.animateCamera)) {
      this.setCamera(new THREE.Vector3(...s.cam.pos), new THREE.Vector3(...s.cam.tgt), !initial);
    } else if (opts.animateCamera || (planChanged && !s.cam.pos) || (prev && prev.hemi !== s.hemi && !s.cam.pos)) {
      this.goPreset(s.cam.preset ?? p.camera, !initial && opts.animateCamera);
    }
    this.renderer.domElement.setAttribute('aria-label', this.describe());
    this.invalidate();
  }

  /** Outline these mesh structures (the selected one, or a plan's) and show their covered parts through what covers
   * them (children of their meshes sharing their geometry and morph targets, so they follow the shapes and visibility;
   * not pickable). */
  private showSelection(ids: string[]): void {
    for (const o of this.selOverlays) o.removeFromParent();
    this.selOverlays = [];
    for (const m of this.selXrays) m.dispose();
    this.selXrays = [];
    for (const m of Object.values(this.selMats)) m.clippingPlanes = this.clipPlanes;
    for (const id of ids) {
      const it = this.items.get(id);
      if (!it || it.kind !== 'mesh') continue;
      let xray = this.selMats.xray;
      if (id !== ids[0]) { xray = xray.clone(); xray.clippingPlanes = this.clipPlanes; this.selXrays.push(xray); }
      xray.color.copy(this.colour(it.meta));
      for (const node of Object.values(it.nodes)) {
        if (!node) continue;
        for (const [mat, order] of [[this.selMats.halo, 7], [this.selMats.ring, 8], [xray, 9]] as const) {
          const o = new THREE.Mesh(node.geometry, mat);
          o.morphTargetInfluences = node.morphTargetInfluences;
          o.morphTargetDictionary = node.morphTargetDictionary;
          o.renderOrder = order;
          o.raycast = () => {};
          node.add(o);
          this.selOverlays.push(o);
        }
      }
    }
  }

  private sideVisible(side: Side): boolean {
    const h: Hemi = this.state?.hemi ?? 'both';
    return h === 'both' || h === side;
  }

  /** Visible and not on the half removed by the left/right cut (markers and labels are not clipped by geometry). */
  private sideShown(side: Side): boolean {
    return this.sideVisible(side) && this.state?.cutSide !== side;
  }

  private restyle(): void {
    if (!this.state || !this.plan) return;
    const s = this.state, p = this.plan;
    const hidden = new Set(s.hidden);
    // focus: a selected structure (not a marker) is emphasised: outlined and shown through what covers it, and, if the
    // viewer's setting asks for it, everything else fades back
    const focus = s.sel && this.cat.byId.has(s.sel) && s.sel !== 'cortex' ? s.sel : null;
    const fade = viewPrefs().fadeOthers;
    for (const it of this.items.values()) {
      if (it.kind === 'mesh' && it.surface) {
        // cortical labels stay opaque: a selection mutes the others instead of fading them
        let look: Look = p.looks.get(it.meta.id) ?? 'muted';
        const focused = focus === it.meta.id;
        if (focused) look = 'primary';
        else if (fade && focus && look === 'primary') look = 'muted';
        if (hidden.has(it.meta.id)) look = 'hidden';
        const layer = s.layers[it.layer] ?? SHOWN;
        const op = layer.on ? layer.opacity : 0;
        const hex = p.colours?.get(it.meta.id);
        const c = hex ? new THREE.Color(hex) : this.colour(it.meta);
        const neutral = new THREE.Color(this.palette.cortex ?? '#c4cbd3');
        for (const side of ['L', 'R'] as Side[]) {
          const m = it.nodes[side];
          if (!m) continue;
          applyLook(m, it.mats, look, op, neutral, c);
          this.setOpercula(m, !!p.cutOpercula);
          if (!this.sideVisible(side)) m.visible = false;
        }
        it.look = look;
        it.mats.solid.emissive.copy(focused ? c.clone().multiplyScalar(0.35) : new THREE.Color(0x000000));
        it.mats.solid.clippingPlanes = this.clipPlanes;
      } else if (it.kind === 'mesh') {
        let look: Look = 'hidden';
        if (it.meta.type !== 'cortex') look = p.looks.get(it.meta.id) ?? 'hidden';
        else if (it.meta.id === 'cortex') look = 'ghost';
        else if (it.meta.type === 'cortex') look = p.parcels.has(it.meta.id) ? 'context' : 'hidden';
        const layer = s.layers[it.layer] ?? SHOWN;
        let op = layer.on ? layer.opacity : 0;
        const focused = focus === it.meta.id;
        if (focused) { look = 'primary'; op = 1; }
        if (hidden.has(it.meta.id)) look = 'hidden';
        if (it.meta.id === 'cortex') op *= 1.1;
        // landmark volumes (optic tract) must read clearly next to the target
        if (this.cat.landmarks.has(it.meta.id) && look === 'context') op = Math.min(1, op * 2.2);
        if (it.meta.type === 'cortex' && it.meta.id !== 'cortex' && look === 'context') op = Math.min(1, op * 1.6);
        it.faded = fade && !!focus && !focused && look !== 'ghost' && look !== 'hidden';
        if (it.faded) op *= 0.3;
        const c = this.colour(it.meta);
        for (const side of ['L', 'R'] as Side[]) {
          const m = it.nodes[side];
          if (!m) continue;
          applyLook(m, it.mats, look, op, it.meta.id === 'cortex' ? new THREE.Color(this.palette.cortex ?? '#c4cbd3') : this.ghost, c);
          if (!this.sideVisible(side)) m.visible = false;
        }
        it.look = look;
        it.mats.solid.emissive.copy(focused ? c.clone().multiplyScalar(0.45) : new THREE.Color(0x000000));
        it.mats.solid.clippingPlanes = this.clipPlanes;
        it.mats.rim.clippingPlanes = this.clipPlanes;
        // the angiogram: no depth (what lies in front adds up, as on a radiograph), over everything else
        const dsaMesh = Object.values(it.nodes).some((m) => m?.geometry.getAttribute('_arrival'));
        it.mats.solid.depthTest = !(this.dsa.on && dsaMesh);
        if (this.dsa.on && dsaMesh) {
          it.mats.solid.transparent = true;
          it.mats.solid.depthWrite = false;
          for (const m of Object.values(it.nodes)) if (m) m.renderOrder = 5;
        }
      } else {
        const focused = focus === it.meta.id;
        const role = p.tracts.get(it.meta.id) ?? (focused ? 'key' : null);
        it.role = role;
        const layer = s.layers.tracts;
        const on = !hidden.has(it.meta.id) && !!role && ((layer.on && layer.opacity > 0.001) || focused);
        it.mat.color.set(this.colour(it.meta));
        const response = it.meta.role === 'response';
        it.mat.opacity = (role === 'border' ? 0.22 : role === 'alt' ? 0.6 : response ? 0.32 : 0.62) * layer.opacity;
        it.mat.linewidth = role === 'border' ? 1 : role === 'alt' ? 1.2 : response ? 1 : 1.4;
        if (focused) { it.mat.opacity = 1; it.mat.linewidth = 3; }
        else if (focus && fade) it.mat.opacity *= 0.25;
        const dashed = role === 'alt';
        if (it.mat.dashed !== dashed) { it.mat.dashed = dashed; it.mat.needsUpdate = true; }
        it.mat.clippingPlanes = this.clipPlanes;
        for (const side of ['L', 'R'] as Side[]) {
          const l = it.nodes[side];
          if (!l) continue;
          if (dashed && !l.userData.dist) { l.computeLineDistances(); l.userData.dist = true; }
          l.visible = on && this.sideVisible(side);
          l.renderOrder = 4;
        }
      }
    }
    this.showSelection(focus ? [focus] : (p.outline ?? []).filter((id) => !hidden.has(id)));
    this.markerGroup.visible = s.layers.targets.on;
    for (const m of this.markerGroup.children) {
      const side = m.userData.side as Side;
      m.visible = this.sideShown(side) && !hidden.has(m.userData.marker);
      m.scale.setScalar(s.sel === m.userData.marker ? 1.8 : 1);
      const mat = (m as THREE.Mesh).material as THREE.Material;
      mat.opacity = (m.userData.primary ? 1 : 0.9) * s.layers.targets.opacity;
      mat.transparent = mat.opacity < 1 || !m.userData.primary;
    }
    this.invalidate();
  }

  // ---------------------------------------------------------------- markers
  private updateMarkers(): void {
    for (const c of [...this.markerGroup.children]) { this.markerGroup.remove(c); (c as THREE.Mesh).geometry.dispose(); }
    this.markerTargets.clear();
    const p = this.plan!;
    const accent = new THREE.Color(this.palette[p.accent] ?? '#14253a');
    for (const m of p.markers) {
      const t = this.cat.markers.get(m.targetId);
      if (!t) continue;
      const own = t.token ? this.palette[t.token] : undefined;
      const colour = new THREE.Color(own ?? this.palette[this.cat.byId.get(t.structureId)?.colour.token ?? p.accent] ?? accent);
      for (const side of (t.sides ?? ['L', 'R']) as Side[]) {
        const pos = new THREE.Vector3(...(side === 'L' ? t.mni.left : t.mni.right));
        const geo = new THREE.SphereGeometry(t.radius ?? (m.primary ? 0.9 : 0.8), 24, 16);
        const mat = m.primary
          // primary markers use the ink colour so they stand out against their (same-coloured) target, unless they
          // have a colour of their own
          ? new THREE.MeshBasicMaterial({ color: own ? colour : new THREE.Color(this.palette.ctx ?? '#14253a') })
          : rimMaterial(colour);
        // markers often sit inside a solid target: draw them on top so they stay visible
        mat.depthTest = false;
        mat.depthWrite = false;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.userData = { marker: t.id, side, primary: m.primary };
        mesh.renderOrder = 6;
        this.markerGroup.add(mesh);
        if (m.primary && !this.markerTargets.has(side)) this.markerTargets.set(side, pos);
        if (!m.primary) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthTest: false }));
          ring.renderOrder = 6;
          ring.position.copy(pos);
          ring.userData = { marker: t.id, side, primary: false, ring: true };
          this.markerGroup.add(ring);
        }
      }
    }
  }

  /** Primary target per side (RAS), used for the lead and camera focus. */
  targetFor(side: Side): THREE.Vector3 | null {
    return this.markerTargets.get(side) ?? null;
  }

  /** Screen positions for labels of highlighted nuclei (primary / alternative), one per structure; tracts too if the plan asks. */
  structureScreen(): { id: string; x: number; y: number; look: Look }[] {
    const out: { id: string; x: number; y: number; look: Look }[] = [];
    if (!this.plan || !this.state) return out;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (this.plan.labelTracts && this.state.layers.tracts.on) {
      for (const [id, role] of this.plan.tracts) {
        if (role !== 'key' || this.state.hidden.includes(id)) continue;
        const it = this.items.get(id);
        if (it?.kind !== 'lines') continue;
        const side: Side = this.sideShown('L') ? 'L' : 'R';
        const c = it.centroid[side];
        if (!c || !this.sideShown(side)) continue;
        const v = this.toWorld(c.clone()).project(this.camera);
        if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
        out.push({ id, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, look: 'primary' });
      }
    }
    for (const [id, look] of this.plan.looks) {
      if (look !== 'primary' && look !== 'alt') continue;
      if (this.state.hidden.includes(id)) continue;
      const it = this.items.get(id);
      if (!(this.state.layers[it?.kind === 'mesh' ? it.layer : 'nuclei'] ?? SHOWN).on) continue;
      const m = this.cat.byId.get(id);
      if (!m || m.type === 'cortex' || m.type === 'tract' || !m.centroid) continue;
      const side: Side = this.sideShown('R') ? 'R' : 'L';
      if (!this.sideShown(side)) continue;
      const v = this.toWorld(new THREE.Vector3(...m.centroid[side])).project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      out.push({ id, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, look });
    }
    return out;
  }

  /** Screen anchor for a label: a marker's position, or a structure's centroid on a shown side. */
  anchorFor(id: string): { x: number; y: number } | null {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const proj = (world: THREE.Vector3) => {
      const v = world.project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return null;
      return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h };
    };
    const marks = this.markerGroup.children.filter((m) => m.userData.marker === id && !m.userData.ring && m.visible);
    if (marks.length) {
      const m = marks.find((x) => x.userData.side === 'R') ?? marks[0];
      return proj(m.getWorldPosition(new THREE.Vector3()));
    }
    const side: Side = this.sideShown('R') ? 'R' : 'L';
    if (!this.sideShown(side)) return null;
    const sa = this.surfaceAnchor(id, side);
    if (sa) return proj(this.toWorld(sa.pos));
    const meta = this.cat.byId.get(id);
    if (!meta?.centroid) return null;
    return proj(this.toWorld(new THREE.Vector3(...meta.centroid[side])));
  }

  /** A cortical label's anchor at the current pial-to-inflated morph, and whether it faces the camera. */
  private surfaceAnchor(id: string, side: Side): { pos: THREE.Vector3; facing: boolean } | null {
    const a = this.cat.anchors?.get(id)?.[side];
    if (!a) return null;
    const t = this.morph['0'] ?? 0;
    const pos = new THREE.Vector3(...a.pial).lerp(new THREE.Vector3(...a.inflated), t);
    const n = new THREE.Vector3(...a.nPial).lerp(new THREE.Vector3(...a.nInflated), t).normalize();
    const eye = this.toRas(this.camera.position);
    return { pos, facing: n.dot(eye.sub(pos)) > 0 };
  }

  /** Screen positions of the drawn cortical labels' anchors that face the camera (one side: right if shown). */
  surfaceScreen(): { id: string; x: number; y: number; look: Look; side: Side }[] {
    const out: { id: string; x: number; y: number; look: Look; side: Side }[] = [];
    if (!this.state?.layers.cortex.on) return out;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    for (const it of this.items.values()) {
      if (it.kind !== 'mesh' || !it.surface || it.look === 'hidden') continue;
      for (const side of ['L', 'R'] as Side[]) {
        if (!this.sideShown(side) || !it.nodes[side]) continue;
        const a = this.surfaceAnchor(it.meta.id, side);
        if (!a || !a.facing || !this.notClipped(this.toWorld(a.pos))) continue;
        const v = this.toWorld(a.pos).project(this.camera);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
        out.push({ id: it.meta.id, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, look: it.look, side });
      }
    }
    return out;
  }

  markerScreen(): { id: string; side: Side; x: number; y: number; primary: boolean }[] {
    const out: { id: string; side: Side; x: number; y: number; primary: boolean }[] = [];
    if (!this.markerGroup.visible) return out;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    for (const m of this.markerGroup.children) {
      if (!m.visible || m.userData.ring) continue;
      const v = m.getWorldPosition(new THREE.Vector3()).project(this.camera);
      if (v.z > 1) continue;
      out.push({ id: m.userData.marker, side: m.userData.side, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, primary: m.userData.primary });
    }
    return out;
  }

  // ---------------------------------------------------------------- clipping + slices
  private updateClip(): void {
    const s = this.state!;
    const planes: THREE.Plane[] = [];
    let anyOn = false;
    for (const axis of ['axial', 'coronal', 'sagittal'] as Axis[]) {
      const c = s.clip[axis];
      this.slices.update(axis, c.on, c.mm);
      if (c.on) anyOn = true;
    }
    // cut at the midline (x = 0): clipPlane(flip=false) keeps x <= 0, i.e. removes the patient's right half.
    // Only structures are cut; the slice images stay whole so that half shows the slice unobstructed.
    if (s.cutSide !== 'none') planes.push(this.slices.clipPlane('sagittal', 0, s.cutSide === 'L'));
    // lift off everything above a height (skull base: the calvaria and brain-level vessels)
    if (s.cutAbove !== undefined && s.cutAbove !== null) planes.push(this.slices.clipPlane('axial', s.cutAbove, false));
    if (s.cutPlane) {
      const n = new THREE.Vector3(...s.cutPlane.normal).normalize();
      // three.js keeps the side where normal . x + constant >= 0: here the side away from the given normal
      planes.push(new THREE.Plane(n.clone().negate(), n.dot(new THREE.Vector3(...s.cutPlane.point))).applyMatrix4(this.root.matrixWorld));
    }
    const seqName = { t1: 'T1', t2: 'T2', pd: 'PD' }[s.sliceSeq];
    if (anyOn && this.slices.current !== s.sliceSeq && this.slices.status !== 'loading') {
      this.ev.status(`Loading ${seqName} slices…`);
      this.slices.ensureLoaded(s.sliceSeq).catch(() => this.ev.status(`Could not load the ${seqName} template.`));
    } else if (anyOn && this.slices.status === 'loading') {
      // a different sequence was picked while one was loading: queue it
      this.slices.ensureLoaded(s.sliceSeq).catch(() => this.ev.status(`Could not load the ${seqName} template.`));
    }
    this.clipPlanes = planes;
    this.leads.L.setClipping(planes); this.leads.R.setClipping(planes);
    this.clipOverlay();
  }

  // ---------------------------------------------------------------- lead
  private updateLead(): void {
    const s = this.state!;
    const on = s.layers.electrode.on;
    const contacts: Record<Side, THREE.Vector3[]> = { L: [], R: [] };
    let any = false;
    for (const side of ['L', 'R'] as Side[]) {
      const t = this.targetFor(side);
      const lead = this.leads[side];
      lead.group.visible = on && !!t && this.sideVisible(side);
      if (!t) continue;
      const g = lead.update(t, s.lead);
      contacts[side] = g.centres;
      any = true;
    }
    this.ev.lead(on && any ? contacts : null);
    this.invalidate();
  }

  // ---------------------------------------------------------------- camera
  private frame(): { centre: THREE.Vector3; radius: number } {
    const p = this.plan!;
    const pts: THREE.Vector3[] = [];
    for (const side of ['L', 'R'] as Side[]) {
      if (!this.sideVisible(side)) continue;
      const t = this.targetFor(side);
      if (t) pts.push(t);
      for (const id of p.focusIds) {
        const c = this.cat.byId.get(id)?.centroid;
        if (c) pts.push(new THREE.Vector3(...c[side]));
      }
    }
    if (!pts.length) pts.push(new THREE.Vector3(0, -12, -2));
    const centre = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(pts.length);
    let radius = p.minRadius ?? 14;
    for (const q of pts) radius = Math.max(radius, q.distanceTo(centre) + 10);
    // cortical areas in view need a wider frame
    if (this.state?.layers.cortex.on && p.parcels.size) radius = Math.max(radius, 55);
    return { centre, radius };
  }

  goPreset(preset: CameraPreset, animate: boolean): void {
    if (!this.plan) return;
    const { centre, radius } = this.frame();
    const hemi = this.state?.hemi ?? 'both';
    const sideSign = hemi === 'L' ? -1 : 1;
    let dir: THREE.Vector3;
    switch (preset) {
      // coronal: seen from the front (patient's right on screen left)
      case 'coronal': dir = new THREE.Vector3(0, 1, 0.12); break;
      // sagittal: seen from the patient's left, so anterior is on screen left
      case 'sagittal': dir = new THREE.Vector3(-1, 0, 0.08); break;
      // axial: seen from above with anterior up (camera nudged posterior so the orbit keeps anterior at the top)
      case 'axial': dir = new THREE.Vector3(0, -0.05, 1); break;
      case 'posteriorOblique': dir = new THREE.Vector3(0.65 * sideSign, -0.8, 0.55); break;
      // lateral: the shown hemisphere from outside (both: from the left); medial: from the midline
      case 'lateral': dir = new THREE.Vector3(hemi === 'R' ? 1 : -1, 0, 0.08); break;
      case 'medial': dir = new THREE.Vector3(hemi === 'R' ? -1 : 1, 0, 0.08); break;
      // inferior: from below, anterior up on screen (camera nudged anterior so the orbit keeps anterior at the top)
      case 'inferior': dir = new THREE.Vector3(0, 0.05, -1); break;
      // posterior: from behind and a little above (the floor of the fourth ventricle faces back and up)
      case 'posterior': dir = new THREE.Vector3(0, -1, 0.35); break;
      // anterolateral: the shown side from in front, the side and above, along a pterional craniotomy
      case 'anterolateral': dir = new THREE.Vector3(0.8 * sideSign, 0.4, 0.45); break;
      // frontolateral: more from in front and above (the ventricles' frontal ventriculostomy)
      case 'frontolateral': dir = new THREE.Vector3(0.55 * sideSign, 0.75, 0.5); break;
      // supraorbital: down a lateral supraorbital craniotomy's corridor, over the lateral orbital roof to the carotid and
      // optic nerve (the mean clear line of sight from them out through that opening, with the frontal lobe lifted)
      case 'supraorbital': dir = new THREE.Vector3(0.64 * sideSign, 0.52, 0.57); break;
      // vertex: from above and a little behind, down the interhemispheric fissure
      case 'vertex': dir = new THREE.Vector3(0.05 * sideSign, -0.3, 1); break;
      // suboccipital: from behind and below, up into the cerebellomedullary fissure
      case 'suboccipital': dir = new THREE.Vector3(0, -1, -0.95); break;
      // retrosigmoid: from behind the sigmoid sinus and a little below, along the back of the petrous bone into the
      // cerebellopontine angle (Skull base v3's retrosigmoid view, the cerebellum drawn back, framed between the trigeminal
      // and vestibulocochlear nerves): a direction that keeps the porus acusticus and the facial and vestibulocochlear
      // nerves' cisternal course in clear sight past the bone, the sinuses and the cerebellum
      case 'retrosigmoid': dir = new THREE.Vector3(0.45 * sideSign, -0.77, -0.45); break;
      case 'surgeon': {
        const side: Side = hemi === 'L' ? 'L' : 'R';
        const l = this.state!.lead;
        dir = trajectoryDir(l.ring, l.tilt, side);
        const t = this.targetFor(side);
        if (t) { this.setCamera(t.clone().addScaledVector(dir, this.distFor(radius * 0.8)), t, animate); return; }
        break;
      }
    }
    dir.normalize();
    this.setCamera(centre.clone().addScaledVector(dir, this.distFor(radius)), centre, animate);
  }

  private distFor(radius: number): number {
    const fov = this.camera.fov * DEG;
    const aspect = Math.min(1, this.camera.aspect);
    return radius / Math.sin(fov / 2) / Math.max(0.6, aspect) * 0.9;
  }

  /** pos / target in RAS */
  setCamera(posRas: THREE.Vector3, tgtRas: THREE.Vector3, animate: boolean): void {
    const p1 = this.toWorld(posRas), t1 = this.toWorld(tgtRas);
    if (!animate || this.reducedMotion) {
      this.anim = null;
      this.camera.position.copy(p1); this.controls.target.copy(t1);
      this.controls.update();
      this.ev.cameraChanged(posRas, tgtRas);
    } else {
      this.anim = { t0: performance.now(), dur: 700, p0: this.camera.position.clone(), p1, t0v: this.controls.target.clone(), t1v: t1 };
      this.ev.moving(true);
    }
    this.invalidate();
  }

  /** Give the left button to a tool (null: back to turning the view). */
  setPointerTool(t: PointerTool | null): void {
    if (this.tool && this.toolDown) this.tool.up();
    this.tool = t;
    this.toolDown = false;
    this.controls.mouseButtons = t ? { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.renderer.domElement.style.cursor = t ? 'none' : '';
    this.renderer.domElement.oncontextmenu = t ? (e) => e.preventDefault() : null;
  }

  /** The ray under a point of the canvas, in the scene's frame (RAS mm). */
  private rasRay(clientX: number, clientY: number): THREE.Ray {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.camera.updateMatrixWorld();   // (the view may not have been drawn since the camera last moved)
    const er = this.endoscopeRects();
    const x = clientX - r.left, y = clientY - r.top;
    const inRect = (q: DOMRect) => x >= q.x && x <= q.x + q.width && y >= q.y && y <= q.y + q.height;
    const ndcIn = (q: DOMRect) => new THREE.Vector2(((x - q.x) / q.width) * 2 - 1, -((y - q.y) / q.height) * 2 + 1);
    if (er && this.endo && (er.endo.width < r.width ? inRect(er.endo) : !inRect(er.overview))) {
      // through the endoscope's lens: its image is distorted, the ray is the undistorted view's
      this.endo.camera.updateMatrixWorld();
      this.raycaster.setFromCamera(Endoscope.undistort(ndcIn(er.endo), er.endo.width, er.endo.height), this.endo.camera);
    } else if (er) {
      // the 3D view, drawn in its own rectangle (its aspect as drawn there)
      const asp = this.camera.aspect;
      this.camera.aspect = er.overview.width / er.overview.height;
      this.camera.updateProjectionMatrix();
      this.raycaster.setFromCamera(ndcIn(er.overview), this.camera);
      this.camera.aspect = asp;
      this.camera.updateProjectionMatrix();
    } else this.raycaster.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const o = this.toRas(this.raycaster.ray.origin);
    const d = this.toRas(this.raycaster.ray.origin.clone().add(this.raycaster.ray.direction)).sub(o).normalize();
    return new THREE.Ray(o, d);
  }

  // ---------------------------------------------------------------- picking
  setMeasuring(on: boolean): void {
    this.measuring = on;
    if (!on) { this.measurePts = []; this.drawMeasure(); }
    this.renderer.domElement.style.cursor = on ? 'crosshair' : '';
  }

  private pickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const it of this.items.values()) {
      for (const n of Object.values(it.nodes)) {
        if (!n || !n.visible) continue;
        if (it.kind === 'mesh' && (it.look === 'ghost' || it.look === 'hidden' || it.faded) && it.meta.id !== 'cortex') continue;
        out.push(n);
      }
    }
    // ghosted nuclei (and structures faded back round a selection) remain pickable but rank after highlighted ones
    for (const it of this.items.values()) if (it.kind === 'mesh' && (it.look === 'ghost' || it.faded) && it.meta.id !== 'cortex') for (const n of Object.values(it.nodes)) if (n?.visible) out.push(n);
    out.push(...this.markerGroup.children.filter((m) => m.visible && this.markerGroup.visible));
    out.push(...this.slices.pickables());
    for (const l of Object.values(this.leads)) if (l.group.visible) out.push(l.group);
    return out;
  }

  pick(clientX: number, clientY: number, withLines: boolean): PickInfo | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const er = this.endoscopeRects();
    if (er) {
      // the endoscope's view: picked through its eye; the 3D view (full or inset): through the ordinary camera
      const x = clientX - r.left, y = clientY - r.top;
      const inEndo = x >= er.endo.x && x <= er.endo.right && y >= er.endo.y && y <= er.endo.bottom;
      const inOverview = x >= er.overview.x && x <= er.overview.right && y >= er.overview.y && y <= er.overview.bottom;
      if (inEndo && (this.endoCfg!.big ? !inOverview : true)) {
        if (!this.endoInside) return null;
        return this.pickEndo(Endoscope.undistort(new THREE.Vector2(((x - er.endo.x) / er.endo.width) * 2 - 1, -((y - er.endo.y) / er.endo.height) * 2 + 1),
          er.endo.width, er.endo.height));
      }
      const a = this.camera.aspect;
      this.camera.aspect = er.overview.width / er.overview.height;
      this.camera.updateProjectionMatrix();
      this.pointer.set(((x - er.overview.x) / er.overview.width) * 2 - 1, -((y - er.overview.y) / er.overview.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      this.camera.aspect = a;
      this.camera.updateProjectionMatrix();
      return this.pickWith(withLines);
    }
    this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.pickWith(withLines);
  }

  private pickWith(withLines: boolean): PickInfo | null {
    this.raycaster.params.Line2 = { threshold: 6 } as never;
    (this.raycaster as unknown as { camera: THREE.Camera }).camera = this.camera;
    const objs = this.pickables().filter((o) => withLines || !(o as LineSegments2).isLineSegments2);
    const hits = this.raycaster.intersectObjects(objs, true).filter((h) => this.notClipped(h.point));
    if (!hits.length) return null;
    // prefer: lead > marker > highlighted structures > faded > cortex/ghost > slice
    const rank = (h: THREE.Intersection) => {
      const o = h.object;
      if (o.userData.lead) return 0;
      if (o.userData.marker) return 1;
      if (o.userData.slice) return 5;
      const it = this.items.get(o.userData.id);
      if (!it) return 4;
      if (it.kind === 'lines') return 2;
      if (it.meta.id === 'cortex') return 4;
      // faded back round a selection: still seen, so before ghosts (the skull base's removed bone, barely drawn: a
      // click into an opening goes to what lies beyond it); faded bone, seen through, after what it encloses
      if (it.kind === 'mesh' && it.faded) return it.meta.type === 'bone' ? 3.2 : 3;
      return it.look === 'ghost' ? 3.5 : 2;
    };
    const best = hits.reduce((a, b) => (rank(b) < rank(a) || (rank(b) === rank(a) && b.distance < a.distance) ? b : a));
    const ras = this.toRas(best.point);
    const o = best.object;
    if (o.userData.marker) {
      const t = this.cat.markers.get(o.userData.marker);
      return { id: o.userData.marker, name: t?.label ?? '', ras, side: o.userData.side, kind: 'marker' };
    }
    if (o.userData.lead) return { id: null, name: `Lead (${o.userData.lead === 'L' ? 'left' : 'right'})`, ras, side: o.userData.lead, kind: 'lead' };
    if (o.userData.slice) return { id: null, name: `${o.userData.slice} slice`, ras, side: ras.x < 0 ? 'L' : 'R', kind: 'slice' };
    const it = this.items.get(o.userData.id);
    return { id: o.userData.id, name: it?.meta.name ?? '', ras, side: o.userData.side, kind: 'structure' };
  }

  private notClipped(world: THREE.Vector3): boolean {
    return this.clipPlanes.every((p) => p.distanceToPoint(world) >= -1e-3);
  }

  private bindPointer(): void {
    const el = this.renderer.domElement;
    let down: { x: number; y: number; t: number } | null = null;
    const takes = (e: PointerEvent) => !!this.tool && (this.tool.wants ? this.tool.wants(e, this.inEndoscope(e.clientX, e.clientY)) : e.button <= 0);
    el.addEventListener('pointerdown', (e) => {
      if (this.tool && takes(e)) {
        this.toolDown = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ }
        this.tool.down(this.rasRay(e.clientX, e.clientY), e);
        return;
      }
      if (this.tool && !this.tool.wants) return;
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      const hit = this.state?.layers.electrode.on ? this.pick(e.clientX, e.clientY, false) : null;
      if (hit?.kind === 'lead' && hit.side) this.beginDrag(hit.side, e);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.tool && (this.toolDown || takes(e))) {
        const ray = this.rasRay(e.clientX, e.clientY);
        if (this.toolDown) this.tool.drag(ray, e); else this.tool.hover(ray, e);
        return;
      }
      if (this.tool && !this.tool.wants) return;
      if (this.tool) this.tool.hover(null, e);
      if (this.drag) { this.onDrag(e); return; }
      this.lastPointer = e;
      if (!this.hoverQueued) {
        this.hoverQueued = true;
        requestAnimationFrame(() => {
          this.hoverQueued = false;
          const pe = this.lastPointer;
          if (!pe || this.anim) return;
          const hit = this.pick(pe.clientX, pe.clientY, false);
          this.ev.readout(hit ? hit.ras : null);
          if (pe.pointerType === 'mouse') this.ev.hover(hit && hit.kind !== 'slice' ? hit : null, pe.clientX, pe.clientY);
        });
      }
    });
    // the wheel over the endoscope's view goes to the tool (before the 3D view's controls see it)
    el.addEventListener('wheel', (e) => {
      if (!this.tool?.wheel || !this.inEndoscope(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.tool.wheel(e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1));
    }, { capture: true, passive: false });
    el.addEventListener('contextmenu', (e) => { if (this.tool?.wants && this.inEndoscope(e.clientX, e.clientY)) e.preventDefault(); });
    el.addEventListener('pointerleave', () => { this.ev.hover(null, 0, 0); if (this.tool && !this.toolDown) this.tool.hover(null); });
    el.addEventListener('pointerup', (e) => {
      if (this.tool && this.toolDown) { this.toolDown = false; this.tool.up(e); return; }
      if (this.tool && !this.tool.wants) return;
      if (this.drag) { this.endDrag(); return; }
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6) return;
      const hit = this.pick(e.clientX, e.clientY, true);
      if (this.measuring) {
        if (!hit) return;
        if (this.measurePts.length >= 2) this.measurePts = [];
        this.measurePts.push(hit.ras.clone());
        this.drawMeasure();
        this.ev.measure([...this.measurePts]);
        return;
      }
      if (hit) { this.ev.readout(hit.ras); this.ev.pick(hit); }
    });
  }

  private beginDrag(side: Side, e: PointerEvent): void {
    const t = this.targetFor(side);
    if (!t || !this.state) return;
    const { centres, dir } = contactCentres(t, this.state.lead, side);
    const a = this.toWorld(centres[0]).project(this.camera);
    const b = this.toWorld(centres[0].clone().add(dir.clone().multiplyScalar(10))).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    const axis2d = new THREE.Vector2((b.x - a.x) * r.width / 2, -(b.y - a.y) * r.height / 2);
    const pxPerMm = axis2d.length() / 10;
    if (pxPerMm < 0.5) return; // looking straight down the lead: drag would be unstable
    this.drag = { side, startDepth: this.state.lead.depth, axis2d: axis2d.normalize(), pxPerMm, x: e.clientX, y: e.clientY };
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  }

  private onDrag(e: PointerEvent): void {
    const d = this.drag!;
    const along = (e.clientX - d.x) * d.axis2d.x + (e.clientY - d.y) * d.axis2d.y;
    // moving toward the entry (along +dir) makes the lead shallower
    const depth = Math.max(-15, Math.min(15, d.startDepth - along / d.pxPerMm));
    this.ev.leadMoved(Math.round(depth * 10) / 10);
  }

  private endDrag(): void { this.drag = null; this.controls.enabled = true; }

  private drawMeasure(): void {
    for (const c of [...this.measureGroup.children]) { this.measureGroup.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    const col = new THREE.Color(this.palette.ctx ?? '#14253a');
    for (const p of this.measurePts) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ color: col, depthTest: false }));
      m.position.copy(p); m.renderOrder = 10;
      this.measureGroup.add(m);
    }
    if (this.measurePts.length === 2) {
      const g = new THREE.BufferGeometry().setFromPoints(this.measurePts);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, depthTest: false }));
      l.renderOrder = 10;
      this.measureGroup.add(l);
    }
    this.invalidate();
  }

  /** Screen-space direction (unit, y down) of the RAS +x/+y/+z axes, plus whether each points toward the viewer. */
  axesScreen(): Record<'R' | 'A' | 'S', { x: number; y: number; toward: boolean }> {
    const inv = this.camera.matrixWorldInverse;
    const out = {} as Record<'R' | 'A' | 'S', { x: number; y: number; toward: boolean }>;
    const axes: ['R' | 'A' | 'S', THREE.Vector3][] = [['R', new THREE.Vector3(1, 0, 0)], ['A', new THREE.Vector3(0, 1, 0)], ['S', new THREE.Vector3(0, 0, 1)]];
    for (const [k, v] of axes) {
      const d = v.applyMatrix4(RAS_TO_WORLD).transformDirection(inv);
      out[k] = { x: d.x, y: -d.y, toward: d.z > 0 };
    }
    return out;
  }

  measureScreen(): { x: number; y: number } | null {
    if (this.measurePts.length !== 2) return null;
    const mid = this.measurePts[0].clone().add(this.measurePts[1]).multiplyScalar(0.5);
    const v = this.toWorld(mid).project(this.camera);
    return { x: (v.x + 1) / 2 * this.host.clientWidth, y: (1 - v.y) / 2 * this.host.clientHeight };
  }

  // ---------------------------------------------------------------- misc
  describe(): string {
    const p = this.plan;
    if (!p) return '3D atlas';
    const names = (ids: string[]) => ids.map((id) => this.cat.byId.get(id)?.name ?? id).join(', ');
    const prim = [...p.looks].filter(([, l]) => l === 'primary').map(([id]) => id);
    const alt = [...p.looks].filter(([, l]) => l === 'alt').map(([id]) => id);
    return `3D atlas, ${p.title}. Highlighted: ${names(prim)}.` +
      (alt.length ? ` Alternatives: ${names(alt)}.` : '') +
      (p.tracts.size ? ` Tracts: ${names([...p.tracts.keys()])}.` : '') +
      (p.parcels.size ? ` Cortex: ${names([...p.parcels.keys()])}.` : '');
  }

  currentPlan(): P | null { return this.plan; }

  snapshot(): string { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/png'); }

  isIdle(): boolean { return this.loadingCount === 0 && !this.anim && !this.morphAnim.size && this.slices.status !== 'loading'; }

  dispose(): void { this.disposed = true; this.unsubPrefs(); this.endo?.dispose(); this.renderer.dispose(); }

  // ---------------------------------------------------------------- endoscope
  /** Show an endoscope's view (null: the ordinary 3D view only). While its view is the big one, dragging does not turn
   * the 3D view (the page steers the scope instead). */
  setEndoscope(cfg: EndoscopeConfig | null): void {
    this.endoCfg = cfg;
    if (cfg && !this.endo) this.endo = new Endoscope();
    this.controls.enabled = !cfg?.big;
    if (cfg) {
      this.endo!.setPose({ tip: this.toWorld(new THREE.Vector3(...cfg.tip)), dir: this.dirWorld(cfg.dir), up: this.dirWorld(cfg.up) });
      this.endo!.setFloor(cfg.floor ? { centre: this.toWorld(new THREE.Vector3(...cfg.floor.centre)), radiusMm: cfg.floor.radiusMm,
        ap: this.dirWorld(cfg.floor.ap), lat: this.dirWorld([1, 0, 0]), radiusLatMm: cfg.floor.radiusLatMm,
        lambdaMm: cfg.floor.lambdaMm, up: this.dirWorld([0, 0, 1]) } : null);
      this.endoDirty = true;
    }
    this.invalidate();
  }

  /** Whether the endoscope's tip is inside the ventricles (rays from it meet their walls from inside). */
  endoscopeInside(): boolean { return !!this.endoCfg && this.endoInside; }

  /** Whether a point on the screen is over the endoscope's view. */
  inEndoscope(clientX: number, clientY: number): boolean {
    const r = this.endoscopeRects();
    if (!r) return false;
    const h = this.host.getBoundingClientRect();
    const x = clientX - h.left, y = clientY - h.top;
    const inside = (q: DOMRect) => x >= q.x && x <= q.x + q.width && y >= q.y && y <= q.y + q.height;
    return inside(r.endo) && !(this.endoCfg!.big && inside(r.overview));
  }

  /** Where the endoscope's view and the 3D view are drawn, CSS pixels from the host's top left. */
  endoscopeRects(): { endo: DOMRect; overview: DOMRect } | null {
    if (!this.endoCfg) return null;
    const W = this.host.clientWidth, H = this.host.clientHeight;
    const s = Math.round(Math.min(W, H) * (W < 600 ? 0.42 : 0.34));
    const inset = new DOMRect(W - s - 12, H - s - 12, s, s);
    const full = new DOMRect(0, 0, W, H);
    return this.endoCfg.big ? { endo: full, overview: inset } : { endo: inset, overview: full };
  }

  private dirWorld(d: V3t): THREE.Vector3 {
    return new THREE.Vector3(...d).applyMatrix4(RAS_TO_WORLD).normalize();
  }

  private xrayColours = new Map<string, THREE.Color>();
  /** (one colour object for each, the endoscope keeping a material for each) */
  private xrayColour(css: string | null | undefined): THREE.Color | undefined {
    if (!css) return undefined;
    let c = this.xrayColours.get(css);
    if (!c) { c = new THREE.Color(css); this.xrayColours.set(css, c); }
    return c;
  }

  private endoMeshes(): { meshes: EndoMesh[]; ids: string[] } {
    const cfg = this.endoCfg!;
    const hidden = new Set(this.state?.hidden ?? []);
    const meshes: EndoMesh[] = [], ids: string[] = [];
    for (const it of this.items.values()) {
      if (it.kind !== 'mesh') continue;
      const role = cfg.role(it.meta.id, it.meta.category);
      const nodes = Object.values(it.nodes).filter((n): n is THREE.Mesh => !!n);
      if (!role) { meshes.push({ nodes, colour: new THREE.Color(), role: 'behind', visible: false }); ids.push(it.meta.id); continue; }
      let c = this.endoColours.get(it.meta.id);
      if (!c) { c = new THREE.Color(cfg.colour(it.meta.id)); this.endoColours.set(it.meta.id, c); }
      const look = this.plan?.looks.get(it.meta.id) ?? 'hidden';
      meshes.push({ nodes, colour: c, role, visible: look !== 'hidden' && !hidden.has(it.meta.id), look: cfg.look?.(it.meta.id), bulge: cfg.bulge?.(it.meta.id), xray: this.xrayColour(cfg.xray?.(it.meta.id)) });
      ids.push(it.meta.id);
    }
    for (const x of cfg.extra?.() ?? []) { meshes.push(x.mesh); ids.push(x.id); this.extraNames.set(x.id, x.name); }
    return { meshes, ids };
  }

  private tipInside(): boolean {
    const shown = this.endoMeshes().meshes.filter((m) => m.visible);
    const walls = new Set(shown.filter((m) => m.role === 'wall').flatMap((m) => m.nodes));
    if (!walls.size) return false;
    const grid = this.endoSeen.get([...walls, ...shown.filter((m) => m.role === 'inside').flatMap((m) => m.nodes)]);
    const isWall = (n: THREE.Mesh) => walls.has(n);
    const tip = this.endo!.camera.position;
    let inside = 0, n = 0;
    const dists: number[] = [], facing: number[] = [];
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as V3t[]) {
      const dir = new THREE.Vector3(...d);
      const h = grid.cast(tip, dir, { accept: isWall })[0];
      if (!h) continue;
      n++;
      dists.push(h.distance);
      if (h.normal.dot(dir) > 0) inside++;
    }
    // the exposure: for what the lens sees (rays over its field, the walls and what lies in the cavity)
    const cam = this.endo!.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), upv = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    for (const a of [-0.6, -0.3, 0, 0.3, 0.6]) for (const b of [-0.6, -0.3, 0, 0.3, 0.6]) {
      if (a * a + b * b > 0.4) continue;
      const h = grid.cast(tip, fwd.clone().addScaledVector(right, a).addScaledVector(upv, b).normalize())[0];
      if (h) facing.push(h.distance);
    }
    // as a camera meters: by the light that comes back (as 1/d² from the light at the tip), so what is near brings
    // the exposure down and does not burn out
    if (facing.length) this.endo!.setExposure(1 / Math.sqrt(facing.reduce((s, d) => s + 1 / Math.max(d, 0.5) ** 2, 0) / facing.length));
    else if (dists.length) this.endo!.setExposure(dists.sort((a, b) => a - b)[Math.floor(dists.length / 2)]);
    if (this.endoCfg?.inside) return this.endoCfg.inside();
    return n > 0 && inside > n / 2;
  }

  private renderEndoscope(): void {
    if (this.endoDirty) {
      this.endoDirty = false;
      const was = this.endoInside;
      this.endoInside = this.tipInside();
      if (was !== this.endoInside || !this.endoReported) { this.endoReported = true; this.ev.endoscope?.(this.endoInside); }
    }
    const rects = this.endoscopeRects()!;
    const H = this.host.clientHeight;
    const gl = (r: DOMRect) => new THREE.Vector4(r.x, H - r.y - r.height, r.width, r.height);
    const { meshes } = this.endoMeshes();
    // the bodies drawn as bulges of the wall: each mesh as a sphere, as the shapes stand now
    this.endo!.setBulges(meshes.filter((m) => m.visible && m.bulge).flatMap((m) => m.nodes).slice(0, 2).map((n) => {
      const g = geometryOf(n.geometry), V = g.base.slice();
      g.morphs.forEach((D, k) => { const w = n.morphTargetInfluences?.[k] ?? 0; if (w) for (let i = 0; i < V.length; i++) V[i] += w * D[i]; });
      n.updateWorldMatrix(true, false);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < V.length; i += 3) pts.push(new THREE.Vector3(V[i], V[i + 1], V[i + 2]).applyMatrix4(n.matrixWorld));
      const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);
      return { centre: c, radiusMm: pts.reduce((a, p) => a + p.distanceTo(c), 0) / pts.length };
    }));
    // (and the selection's outline and x-ray: the endoscope draws the structures its own way)
    const others = [this.markerGroup, this.measureGroup, this.overlayGroup, this.leads.L.group, this.leads.R.group, this.slices.group, ...this.selOverlays];
    const drawOverview = (r: DOMRect, clear: boolean) => {
      const v = gl(r);
      const a = this.camera.aspect;
      this.camera.aspect = r.width / r.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setScissorTest(true);
      this.renderer.setScissor(v.x, v.y, v.z, v.w);
      this.renderer.setViewport(v.x, v.y, v.z, v.w);
      const ac = this.renderer.autoClear;
      this.renderer.autoClear = clear;
      if (!clear) this.renderer.clear(true, true);
      this.renderer.render(this.scene, this.camera);
      this.renderer.autoClear = ac;
      this.camera.aspect = a;
      this.camera.updateProjectionMatrix();
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.host.clientWidth, H);
    };
    if (this.endoCfg!.big) {
      this.endo!.render(this.renderer, this.scene, meshes, gl(rects.endo), this.endoInside, others);
      drawOverview(rects.overview, false);
    } else {
      drawOverview(rects.overview, true);
      this.endo!.render(this.renderer, this.scene, meshes, gl(rects.endo), this.endoInside, others);
    }
    this.renderer.setViewport(0, 0, this.host.clientWidth, H);
  }

  /** What the pointer is on in the endoscope's view: what lies in the ventricles, else what shows through the wall
   * (within ENDO_PICK_BEHIND_MM behind it), else the wall. */
  private pickEndo(ndc: THREE.Vector2): PickInfo | null {
    const { meshes, ids } = this.endoMeshes();
    const roleOf = new Map<THREE.Object3D, { role: EndoMesh['role']; id: string; front: boolean }>();
    meshes.forEach((m, i) => { if (m.visible) for (const n of m.nodes) roleOf.set(n, { role: m.role, id: ids[i], front: !!m.bulge }); });
    this.raycaster.setFromCamera(ndc, this.endo!.camera);
    const hits = this.endoPick.get([...roleOf.keys()] as THREE.Mesh[]).cast(this.raycaster.ray.origin, this.raycaster.ray.direction, { all: true });
    if (!hits.length) return null;
    const wall = hits.find((h) => roleOf.get(h.node)!.role === 'wall');
    const inner = hits.find((h) => roleOf.get(h.node)!.role === 'inside');
    // what shows through the wall: the first structure beyond it (one crossing the cavity in front of it is not drawn)
    // (one drawn in front of the others there, if the ray meets it)
    const beyond = hits.filter((h) => roleOf.get(h.node)!.role === 'behind' && (!wall || h.distance >= wall.distance - 0.2));
    const behind = beyond.find((h) => roleOf.get(h.node)!.front) ?? beyond[0];
    let best = wall ?? behind ?? hits[0], behindMm: number | undefined;
    const floor = !!wall && this.onFloor(wall);
    if (inner && (!wall || inner.distance < wall.distance)) best = inner;
    else if (behind && wall && behind.distance - wall.distance < (floor ? ENDO_PICK_FLOOR_MM : ENDO_PICK_BEHIND_MM)) {
      best = behind; behindMm = Math.max(0, behind.distance - wall.distance);
    }
    const id = roleOf.get(best.node)!.id;
    return { id, name: this.items.get(id)?.meta.name ?? this.extraNames.get(id) ?? '', ras: this.toRas(best.point), side: best.node.userData.side ?? null, kind: 'structure', behindMm,
      throughFloor: behindMm !== undefined && floor };
  }

  /** Whether a hit on a wall is on the thin floor of the third ventricle: near its middle, facing down. */
  private onFloor(h: RayHit): boolean {
    const f = this.endoCfg?.floor;
    if (!f) return false;
    const p = this.toRas(h.point);
    const v = p.sub(new THREE.Vector3(...f.centre)), ap = new THREE.Vector3(...f.ap).normalize();
    const a = v.dot(ap), s = v.x, up = v.clone().addScaledVector(ap, -a).setX(0).length();
    if (Math.hypot(a / f.radiusMm, s / f.radiusLatMm, up / f.radiusMm) > 1.1) return false;
    const nr = h.normal.clone().applyMatrix4(new THREE.Matrix4().copy(RAS_TO_WORLD).invert());
    return nr.normalize().z < -0.3;                      // its outward normal points down
  }

  /** A structure's vertices (RAS mm), for distances. */
  structurePoints(id: string): THREE.Vector3[] {
    const it = this.items.get(id);
    if (!it || it.kind !== 'mesh') return [];
    const out: THREE.Vector3[] = [];
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    for (const n of Object.values(it.nodes)) {
      if (!n) continue;
      n.updateMatrixWorld(true);
      const m = new THREE.Matrix4().multiplyMatrices(inv, n.matrixWorld);
      const p = n.geometry.getAttribute('position');
      // with the shapes as drawn now (glTF morph targets are relative)
      const morphs = (n.geometry.morphAttributes.position ?? []).map((a, k) => [a, n.morphTargetInfluences?.[k] ?? 0] as const).filter(([, w]) => w > 0);
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
        for (const [a, w] of morphs) v.add(new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i)).multiplyScalar(w));
        out.push(v.applyMatrix4(m));
      }
    }
    return out;
  }
}
