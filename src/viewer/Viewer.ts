import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { MAN, MANIFEST, TGT } from '../data';
import type { CameraPreset, ManifestStructure } from '../data/schema';
import type { AppState, Axis, Hemi, LayerKey } from '../state';
import { loadStructure, type LineAsset, type MeshAsset } from './assets';
import { Lead, contactCentres, trajectoryDir } from './lead';
import { applyLook, lineMaterial, rimMaterial, solidMaterial, type Look, type MeshMaterials } from './materials';
import { LANDMARKS, plan as makePlan, type Plan, type TractRole } from './selection';
import { Slices } from './slices';

type Side = 'L' | 'R';
type Palette = Record<string, string>;

interface MeshItem { kind: 'mesh'; meta: ManifestStructure; nodes: Partial<Record<Side, THREE.Mesh>>; mats: MeshMaterials; look: Look; layer: LayerKey }
interface LineItem { kind: 'lines'; meta: ManifestStructure; nodes: Partial<Record<Side, LineSegments2>>; mat: LineMaterial; role: TractRole | null; centroid: Partial<Record<Side, THREE.Vector3>> }
type Item = MeshItem | LineItem;

export interface PickInfo { id: string | null; name: string; ras: THREE.Vector3; side: Side | null; kind: 'structure' | 'slice' | 'lead' | 'marker' }

export interface ViewerEvents {
  hover(info: PickInfo | null, clientX: number, clientY: number): void;
  pick(info: PickInfo): void;
  readout(ras: THREE.Vector3 | null): void;
  measure(points: THREE.Vector3[]): void;
  cameraChanged(pos: THREE.Vector3, tgt: THREE.Vector3): void;
  leadMoved(depth: number): void;
  status(text: string | null): void;
  lead(contacts: Record<Side, THREE.Vector3[]> | null): void;
}

const DEG = Math.PI / 180;
const RAS_TO_WORLD = new THREE.Matrix4().makeRotationX(-Math.PI / 2); // (x, y, z) RAS -> (x, z, -y) three

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** All anatomy lives here, in MNI RAS millimetres. */
  readonly root = new THREE.Group();
  private items = new Map<string, Item>();
  private markerGroup = new THREE.Group();
  private measureGroup = new THREE.Group();
  private leads: Record<Side, Lead> = { L: new Lead('L'), R: new Lead('R') };
  readonly slices: Slices;
  private palette: Palette = {};
  private ghost = new THREE.Color('#9aa5b1');
  private plan: Plan | null = null;
  private state: AppState | null = null;
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

  constructor(private host: HTMLElement, private ev: ViewerEvents) {
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
    this.controls.addEventListener('end', () => this.ev.cameraChanged(this.toRas(this.camera.position), this.toRas(this.controls.target)));

    this.root.matrixAutoUpdate = false;
    this.root.matrix.copy(RAS_TO_WORLD);
    this.root.updateMatrixWorld(true);
    this.scene.add(this.root);
    this.root.add(this.markerGroup, this.measureGroup, this.leads.L.group, this.leads.R.group);
    this.slices = new Slices(MANIFEST.volumes, this.root, () => { this.ev.status(null); this.invalidate(); });
    this.root.add(this.slices.group);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x5a6470, 1.4);
    this.scene.add(hemi);
    const head = new THREE.DirectionalLight(0xffffff, 1.6);
    head.position.set(0.3, 0.6, 1);
    this.camera.add(head);
    this.scene.add(this.camera);

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
      if (k >= 1) { this.anim = null; this.ev.cameraChanged(this.toRas(this.camera.position), this.toRas(this.controls.target)); }
      this.needsRender = true;
    }
    if (this.controls.update()) this.needsRender = true;
    if (this.needsRender) {
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
    }
  };

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const it of this.items.values()) if (it.kind === 'lines') it.mat.resolution.set(w, h);
    this.invalidate();
  }

  private toRas(world: THREE.Vector3): THREE.Vector3 { return this.root.worldToLocal(world.clone()); }
  private toWorld(ras: THREE.Vector3): THREE.Vector3 { return this.root.localToWorld(ras.clone()); }

  // ---------------------------------------------------------------- theme
  setTheme(palette: Palette, background: string, ghost: string): void {
    this.palette = palette;
    this.scene.background = new THREE.Color(background);
    this.ghost.set(ghost);
    this.leads.L.shaftMat.color.set(palette.electrode); this.leads.R.shaftMat.color.set(palette.electrode);
    if (this.plan) this.updateMarkers();
    this.restyle();
  }

  private colour(meta: ManifestStructure): THREE.Color {
    return new THREE.Color(this.palette[meta.colour.token] ?? meta.colour.light);
  }

  // ---------------------------------------------------------------- loading
  private async ensure(id: string): Promise<Item | null> {
    const have = this.items.get(id);
    if (have) return have;
    const meta = MAN.get(id);
    if (!meta) return null;
    this.loadingCount++;
    this.ev.status('Loading anatomy…');
    try {
      const asset = await loadStructure(meta.file);
      if (this.items.has(id)) return this.items.get(id)!;
      const it = asset.kind === 'mesh' ? this.makeMeshItem(meta, asset) : this.makeLineItem(meta, asset);
      this.items.set(id, it);
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
    const nodes: MeshItem['nodes'] = {};
    for (const side of ['L', 'R'] as Side[]) {
      const m = a.sides[side];
      if (!m) continue;
      m.userData = { id: meta.id, side };
      m.visible = false;
      nodes[side] = m;
      this.root.add(m);
    }
    const layer: LayerKey = meta.type === 'cortex' ? 'cortex' : meta.type === 'target' ? 'targets' : 'nuclei';
    return { kind: 'mesh', meta, nodes, mats, look: 'hidden', layer };
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

  /** Load every nucleus up front (small); cortex and tracts on demand. */
  async preload(): Promise<void> {
    const ids = MANIFEST.structures.filter((s) => s.type === 'nucleus' || s.type === 'target').map((s) => s.id);
    await Promise.all(ids.map((id) => this.ensure(id)));
    this.restyle();
  }

  // ---------------------------------------------------------------- state
  async apply(s: AppState, opts: { animateCamera: boolean }): Promise<void> {
    const seq = ++this.applySeq;
    const prev = this.state;
    this.state = structuredClone(s);
    const planChanged = !prev || prev.ind !== s.ind || prev.sym !== s.sym || prev.borders !== s.borders;
    if (planChanged) this.plan = makePlan(s.ind, s.sym, s.borders);
    const p = this.plan!;
    const focusMeta = s.sel ? MAN.get(s.sel) : undefined;
    const needed = [
      ...[...p.tracts.keys()],
      // a structure selected from the index or legend is shown even if the view does not include it
      ...(focusMeta && (focusMeta.type === 'tract' || focusMeta.type === 'cortex') ? [focusMeta.id] : []),
      ...(s.layers.cortex.on && p.parcels.size ? ['cortex', ...p.parcels.keys()] : []),
      ...(s.layers.cortex.on && !p.parcels.size && this.items.has('cortex') ? ['cortex'] : []),
    ];
    await Promise.all(needed.map((id) => this.ensure(id)));
    if (seq !== this.applySeq) return; // superseded while loading
    this.updateMarkers();
    this.updateClip();
    this.restyle();
    this.updateLead();
    const initial = !prev;
    if (s.cam.pos && s.cam.tgt && (initial || opts.animateCamera)) {
      this.setCamera(new THREE.Vector3(...s.cam.pos), new THREE.Vector3(...s.cam.tgt), !initial);
    } else if (opts.animateCamera || (planChanged && !s.cam.pos) || (prev && prev.hemi !== s.hemi && !s.cam.pos)) {
      this.goPreset(s.cam.preset ?? p.camera, !initial && opts.animateCamera);
    }
    this.renderer.domElement.setAttribute('aria-label', this.describe());
    this.invalidate();
  }

  private sideVisible(side: Side): boolean {
    const h: Hemi = this.state?.hemi ?? 'both';
    return h === 'both' || h === side;
  }

  private restyle(): void {
    if (!this.state || !this.plan) return;
    const s = this.state, p = this.plan;
    const hidden = new Set(s.hidden);
    // focus: a selected structure (not a marker) is emphasised and everything else fades back
    const focus = s.sel && MAN.has(s.sel) && s.sel !== 'cortex' ? s.sel : null;
    for (const it of this.items.values()) {
      if (it.kind === 'mesh') {
        let look: Look = 'hidden';
        if (it.meta.type === 'nucleus' || it.meta.type === 'target') look = p.looks.get(it.meta.id) ?? 'hidden';
        else if (it.meta.id === 'cortex') look = 'ghost';
        else if (it.meta.type === 'cortex') look = p.parcels.has(it.meta.id) ? 'context' : 'hidden';
        const layer = s.layers[it.layer];
        let op = layer.on ? layer.opacity : 0;
        const focused = focus === it.meta.id;
        if (focused) { look = 'primary'; op = 1; }
        if (hidden.has(it.meta.id)) look = 'hidden';
        if (it.meta.id === 'cortex') op *= 1.1;
        // landmark volumes (optic tract) must read clearly next to the target
        if (LANDMARKS.has(it.meta.id) && look === 'context') op = Math.min(1, op * 2.2);
        if (it.meta.type === 'cortex' && it.meta.id !== 'cortex' && look === 'context') op = Math.min(1, op * 1.6);
        if (focus && !focused && look !== 'ghost' && look !== 'hidden') op *= 0.3;
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
        else if (focus) it.mat.opacity *= 0.25;
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
    this.markerGroup.visible = s.layers.targets.on;
    for (const m of this.markerGroup.children) {
      const side = m.userData.side as Side;
      m.visible = this.sideVisible(side) && !hidden.has(m.userData.marker);
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
      const t = TGT.get(m.targetId);
      if (!t) continue;
      const colour = new THREE.Color(this.palette[MAN.get(t.structureId)?.colour.token ?? p.accent] ?? accent);
      for (const side of ['L', 'R'] as Side[]) {
        const pos = new THREE.Vector3(...(side === 'L' ? t.mni.left : t.mni.right));
        const geo = new THREE.SphereGeometry(m.primary ? 0.9 : 0.8, 24, 16);
        const mat = m.primary
          // primary markers use the ink colour so they stand out against their (same-coloured) target
          ? new THREE.MeshBasicMaterial({ color: new THREE.Color(this.palette.ctx ?? '#14253a') })
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

  /** Screen positions for labels of highlighted nuclei (primary / alternative), one per structure. */
  structureScreen(): { id: string; x: number; y: number; look: Look }[] {
    const out: { id: string; x: number; y: number; look: Look }[] = [];
    if (!this.plan || !this.state?.layers.nuclei.on) return out;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    for (const [id, look] of this.plan.looks) {
      if (look !== 'primary' && look !== 'alt') continue;
      if (this.state.hidden.includes(id)) continue;
      const m = MAN.get(id);
      if (!m || m.type !== 'nucleus' || !m.centroid) continue;
      const side: Side = this.sideVisible('R') ? 'R' : 'L';
      const v = this.toWorld(new THREE.Vector3(...m.centroid[side])).project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      out.push({ id, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, look });
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
      if (c.on && c.cut) planes.push(this.slices.clipPlane(axis, c.mm, c.flip));
    }
    if (anyOn && this.slices.status === 'idle') { this.ev.status('Loading T1 slices…'); this.slices.ensureLoaded().catch(() => this.ev.status('Could not load the T1 template.')); }
    this.clipPlanes = planes;
    this.leads.L.setClipping(planes); this.leads.R.setClipping(planes);
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
        const c = MAN.get(id)?.centroid;
        if (c) pts.push(new THREE.Vector3(...c[side]));
      }
    }
    if (!pts.length) pts.push(new THREE.Vector3(0, -12, -2));
    const centre = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(pts.length);
    let radius = 14;
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
    }
    this.invalidate();
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
        if (it.kind === 'mesh' && (it.look === 'ghost' || it.look === 'hidden') && it.meta.id !== 'cortex') continue;
        out.push(n);
      }
    }
    // ghosted nuclei remain pickable but rank after highlighted ones
    for (const it of this.items.values()) if (it.kind === 'mesh' && it.look === 'ghost' && it.meta.id !== 'cortex') for (const n of Object.values(it.nodes)) if (n?.visible) out.push(n);
    out.push(...this.markerGroup.children.filter((m) => m.visible && this.markerGroup.visible));
    out.push(...this.slices.pickables());
    for (const l of Object.values(this.leads)) if (l.group.visible) out.push(l.group);
    return out;
  }

  pick(clientX: number, clientY: number, withLines: boolean): PickInfo | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.params.Line2 = { threshold: 6 } as never;
    (this.raycaster as unknown as { camera: THREE.Camera }).camera = this.camera;
    const objs = this.pickables().filter((o) => withLines || !(o as LineSegments2).isLineSegments2);
    const hits = this.raycaster.intersectObjects(objs, true).filter((h) => this.notClipped(h.point));
    if (!hits.length) return null;
    // prefer: lead > marker > highlighted structures > cortex/ghost > slice
    const rank = (h: THREE.Intersection) => {
      const o = h.object;
      if (o.userData.lead) return 0;
      if (o.userData.marker) return 1;
      if (o.userData.slice) return 5;
      const it = this.items.get(o.userData.id);
      if (!it) return 4;
      if (it.kind === 'lines') return 2;
      if (it.meta.id === 'cortex') return 4;
      return it.look === 'ghost' ? 3.5 : 2;
    };
    const best = hits.reduce((a, b) => (rank(b) < rank(a) || (rank(b) === rank(a) && b.distance < a.distance) ? b : a));
    const ras = this.toRas(best.point);
    const o = best.object;
    if (o.userData.marker) {
      const t = TGT.get(o.userData.marker);
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
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      const hit = this.state?.layers.electrode.on ? this.pick(e.clientX, e.clientY, false) : null;
      if (hit?.kind === 'lead' && hit.side) this.beginDrag(hit.side, e);
    });
    el.addEventListener('pointermove', (e) => {
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
    el.addEventListener('pointerleave', () => { this.ev.hover(null, 0, 0); });
    el.addEventListener('pointerup', (e) => {
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
    const names = (ids: string[]) => ids.map((id) => MAN.get(id)?.name ?? id).join(', ');
    const prim = [...p.looks].filter(([, l]) => l === 'primary').map(([id]) => id);
    const alt = [...p.looks].filter(([, l]) => l === 'alt').map(([id]) => id);
    return `3D atlas, ${p.title}. Highlighted: ${names(prim)}.` +
      (alt.length ? ` Alternatives: ${names(alt)}.` : '') +
      (p.tracts.size ? ` Tracts: ${names([...p.tracts.keys()])}.` : '') +
      (p.parcels.size ? ` Cortex: ${names([...p.parcels.keys()])}.` : '');
  }

  currentPlan(): Plan | null { return this.plan; }

  snapshot(): string { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/png'); }

  isIdle(): boolean { return this.loadingCount === 0 && !this.anim && this.slices.status !== 'loading'; }

  dispose(): void { this.disposed = true; this.renderer.dispose(); }
}
