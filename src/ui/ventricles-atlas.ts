import * as THREE from 'three';
import type { CameraPreset } from '../data/schema';
import type { Hemi, LayerKey } from '../state';
import type { Claim } from '../brainstem/schema';
import { ETV, KIND_LABEL, kindOf, LM, TARGETS, TRAJ, trajectoryFor, VE, VE_REF, type Trajectory } from '../ventricles';
import { ACCURACY, AQUEDUCT, ETV_ANATOMY, ETV_TRAJECTORY, FOURTH, HYDRO, IDEAL, KOCHER, LATERAL_WALLS, MONRO, PRACTICE, TARGET_NAME, THIRD_FLOOR } from '../ventricles/content';
import { VE_GROUP, VE_GROUPS, type VeGroup } from '../ventricles/groups';
import { veScene, type VePlan } from '../ventricles/scene';
import { defaultScopeDepth, etvLine, SCOPE_TILT_MAX, scopeMaxDepth, type Catheter, type Scope, type VeState } from '../ventricles/state';
import { Viewer, type EndoscopeConfig, type PickInfo } from '../viewer/Viewer';
import { ENDO_FOV_DEG, FLOOR_LAMBDA_MM } from '../viewer/endoscope';
import { h } from './h';
import { refLinksFrom } from './reflinks';
import { bindSheetDrag, drawGizmo, layoutLabels, type LabelItem } from './stage';
import { chips, clear, eyeIcon, fmtMm } from './widgets';

type Update = (fn: (s: VeState) => void, opts?: { camera?: boolean }) => void;

const PRESETS: [CameraPreset, string, string, string][] = [
  ['coronal', 'Front', '1', 'Front'], ['sagittal', 'Side', '2', 'Side'], ['axial', 'From above', '3', 'Above'],
  ['anterolateral', 'Front oblique', '4', 'Obl'], ['frontolateral', 'Over the forehead', '5', 'Fore'],
];
const LAYERS: [LayerKey, string][] = [['nuclei', 'Ventricles'], ['cortex', 'Fitted brain'], ['targets', 'Landmarks']];
const GROUP_ROWS: [VeGroup['kind'], string][] = [['anatomy', 'Anatomy'], ['access', 'Ventricular access'], ['endoscopic', 'Endoscopy']];
const KOCHER_LABEL = { chen: '25 mm from the midline (Chen)', park: '30 mm from the midline (Park)' } as const;

const nameOf = (id: string) => VE.get(id)?.name ?? LM.get(id)?.name ?? id;
const tokenOf = (id: string) => VE.get(id)?.colour.token ?? 'ctx';
const refs = (ids: string[]) => refLinksFrom(VE_REF, ids);
const claimList = (cl: Claim[]) => h('ul', { class: 'evidence' }, ...cl.map((c) => h('li', {}, c.text, ' ', refs(c.refIds))));
const offsetLabel = (o: number) => (o === 0 ? 'At Kocher’s point' : `${Math.abs(o)} mm ${o > 0 ? 'forward' : 'back'}`);

/** The catheter as drawn: a tube from the entry on the outer table to past where it meets a ventricle (or to its
 * aim), a thin line on to the aim, and a point where it enters the ventricle. */
function catheterObjects(t: Trajectory): THREE.Object3D[] {
  const e = new THREE.Vector3(...t.entry);
  const d = new THREE.Vector3(...t.direction);
  const len = t.depthMm !== undefined ? t.depthMm + 15 : 75;
  const g = new THREE.Group();
  const mat = () => new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, len, 24), mat());
  tube.position.y = len / 2 - 8;
  tube.userData.token = 'electrode';
  g.add(tube);
  g.position.copy(e);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  const out: THREE.Object3D[] = [g];
  if (t.aim) {
    const a = new THREE.Vector3(...t.aim);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([e.clone().addScaledVector(d, len - 8), a]), new THREE.LineDashedMaterial({ dashSize: 3, gapSize: 2 }));
    line.computeLineDistances();
    line.userData.token = 'electrode';
    out.push(line);
  }
  if (t.entersAt) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(2, 20, 14), new THREE.MeshBasicMaterial({ depthTest: false }));
    m.position.set(...t.entersAt);
    m.renderOrder = 6;
    m.userData.token = 'sbCsf';
    out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------- the endoscope
const v3 = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);

/** Where the endoscope is (RAS): Sousa's line for its side, tilted about its burr hole, the tip `depth` down the shaft;
 * up on the screen is forwards (the infundibular recess at the top, the mammillary bodies below). */
export function scopePose(sc: Scope, hydro: number): { entry: THREE.Vector3; tip: THREE.Vector3; dir: THREE.Vector3; up: THREE.Vector3; line: THREE.Vector3 } {
  const t = etvLine(sc.side, hydro);
  const entry = v3(t.entry);
  const line = v3(t.target).sub(entry).normalize();
  const fwd = new THREE.Vector3(0, 1, 0).addScaledVector(line, -line.y).normalize();
  const lat = new THREE.Vector3().crossVectors(fwd, line).normalize();
  const deg = Math.PI / 180;
  const dir = line.clone().applyAxisAngle(lat, -sc.ap * deg).applyAxisAngle(fwd, (sc.side === 'R' ? 1 : -1) * sc.ml * deg).normalize();
  const tip = entry.clone().addScaledVector(dir, sc.depth);
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
  return { entry, tip, dir, up, line };
}

/** What each structure looks like through the endoscope (a rendering choice: tissue colours under a white light) */
function endoColour(id: string): string {
  const k = kindOf(id);
  if (id === 've_choroid_plexus') return '#b0404c';
  if (k === 'vessel') return VE.get(id)?.category === 'vein' ? '#4a3266' : '#a51d2d';
  if (k === 'nerve') return '#efe6cc';
  if (k === 'bone') return '#eadfc6';
  if (k === 'brainstem') return '#d9c3b3';
  if (['ve_fornix', 've_mammillary_body', 've_anterior_commissure', 've_posterior_commissure', 've_corpus_callosum', 've_optic_chiasm', 've_optic_tract', 've_stria_terminalis'].includes(id)) return '#f6f2ea';
  if (id === 've_caudate_nucleus') return '#c9ab9d';
  return '#d6bcac';
}
function endoRole(id: string, category: string | undefined): 'wall' | 'inside' | 'behind' | null {
  if (category === 'ventricle') return 'wall';
  if (id === 've_choroid_plexus') return 'inside';
  // the hypothalamus is the third ventricle's wall itself (the wall's own colour stands for it): what lies beyond it
  // shows through the floor
  if (category === 'brain' || id === 've_hypothalamus') return null;
  return 'behind';
}

/** Shortest distance (mm) from a segment to any of the points. */
function segmentDistance(a: THREE.Vector3, b: THREE.Vector3, pts: THREE.Vector3[]): number {
  const ab = b.clone().sub(a), l2 = Math.max(ab.lengthSq(), 1e-9);
  let best = Infinity;
  const q = new THREE.Vector3();
  for (const p of pts) {
    const t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / l2));
    best = Math.min(best, p.distanceTo(q.copy(a).addScaledVector(ab, t)));
  }
  return best;
}

/** The endoscope in the 3D view: its shaft from the burr hole to the tip, Sousa's line on to the target, the target. */
function scopeObjects(sc: Scope, hydro: number): THREE.Object3D[] {
  const p = scopePose(sc, hydro);
  const g = new THREE.Group();
  // from the tip back up the shaft, 20 mm out of the burr hole (a schematic calibre)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, sc.depth + 20, 20), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2 }));
  shaft.position.y = (sc.depth + 20) / 2;
  shaft.userData.token = 'electrode';
  g.add(shaft);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.dir.clone().negate());
  g.position.copy(p.tip);
  const t = etvLine(sc.side, hydro);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(t.entry), v3(t.target)]), new THREE.LineDashedMaterial({ dashSize: 2, gapSize: 1.5 }));
  line.computeLineDistances();
  line.userData.token = 'sbCsf';
  const dot = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 12), new THREE.MeshBasicMaterial({ depthTest: false }));
  dot.position.copy(v3(t.target));
  dot.renderOrder = 6;
  dot.userData.token = 'sbCsf';
  return [g, line, dot];
}

/** The 3D page of the ventricles section: views, structure cards, the catheter and its result. */
export class VentriclesAtlasPage {
  readonly el: HTMLElement;
  viewer!: Viewer<VeState, VePlan>;
  private s!: VeState;
  private stage: HTMLElement;
  private panel: HTMLElement;
  private tabs: Record<string, HTMLElement> = {};
  private tabBtns: Record<string, HTMLButtonElement> = {};
  private tip = h('div', { class: 'tip', role: 'tooltip', hidden: true });
  private readout = h('div', { class: 'readout', 'aria-live': 'off' });
  private measureOut = h('div', { class: 'measure-out', 'aria-live': 'polite', hidden: true });
  private legend = h('ul', { class: 'legend3d' });
  private labels = h('div', { class: 'labels', 'aria-hidden': 'true' });
  private leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private gizmo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite', hidden: true });
  private measureBtn!: HTMLButtonElement;
  private sheetState: 'peek' | 'full' = 'peek';
  private measurePts: THREE.Vector3[] = [];
  private lastKey = '';
  private lastCath = '';
  private lastScope = '';
  /** the endoscope's round field and the inset's frame, over the canvas */
  private endoMask = h('div', { class: 'endo-mask', 'aria-hidden': 'true', hidden: true });
  private insetFrame = h('div', { class: 'inset-frame', hidden: true },
    h('button', { type: 'button', class: 'inset-swap', title: 'Swap the endoscope’s view and the 3D view (V)', onclick: () => this.setScope((e) => { e.big = !e.big; }) }, 'Swap'));
  private scopeOut = h('div', { class: 'scope-out', role: 'status', 'aria-live': 'polite' });
  private steer: { x: number; y: number; ap: number; ml: number } | null = null;
  /** the endoscope panel's sliders, updated in place as the scope moves (not rebuilt, so a drag is not lost) */
  private scopeInputs: Partial<Record<'depth' | 'ap' | 'ml', { input: HTMLInputElement; out: HTMLElement; unit: string }>> = {};

  constructor(private update: Update) {
    this.stage = h('section', { class: 'stage', 'aria-label': '3D viewer' });
    this.panel = h('aside', { class: 'panel', 'aria-label': 'Anatomy and tools', 'data-sheet': 'peek' });
    this.el = h('div', { class: 'atlas' }, this.stage, this.panel);
    this.buildStage();
    this.buildPanel();
  }

  // ---------------------------------------------------------------- stage
  private buildStage(): void {
    const host = h('div', { class: 'viewer-host' });
    const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'View' });
    const presetGroup = h('div', { class: 'tgroup', role: 'group', 'aria-label': 'Camera presets' });
    for (const [p, label, key, short] of PRESETS) {
      presetGroup.append(h('button', {
        type: 'button', class: 'tbtn', 'data-preset': p, title: `${label} (${key})`, 'aria-label': label,
        onclick: () => this.update((s) => { s.cam = { preset: p }; }, { camera: true }),
      }, h('span', { class: 'long' }, label), h('span', { class: 'short', 'aria-hidden': 'true' }, short)));
    }
    const hemiGroup = h('div', { class: 'tgroup seg', role: 'group', 'aria-label': 'Side' });
    for (const [v, label, short] of [['L', 'Left', 'L'], ['both', 'Both', 'L+R'], ['R', 'Right', 'R']] as [Hemi, string, string][]) {
      hemiGroup.append(h('button', {
        type: 'button', class: 'tbtn', 'data-hemi': v, 'aria-pressed': 'false', title: `${label} side (H cycles)`, 'aria-label': `${label} side`,
        onclick: () => this.update((s) => { s.hemi = v; }),
      }, h('span', { class: 'long' }, label), h('span', { class: 'short', 'aria-hidden': 'true' }, short)));
    }
    this.measureBtn = h('button', { type: 'button', class: 'tbtn', 'aria-pressed': 'false', title: 'Measure distance between two points (M)', onclick: () => this.toggleMeasure() }, 'Measure');
    const share = h('button', { type: 'button', class: 'tbtn', title: 'Copy a link to this exact view', onclick: () => this.copyLink(share) }, 'Copy link');
    const labelGroup = h('div', { class: 'tgroup seg', role: 'group', 'aria-label': 'Name labels' },
      h('span', { class: 'tlabel' }, 'Labels'),
      ...([['all', 'All', 'Label everything highlighted in this view'], ['hover', 'Hover', 'Label only what you point at or select'], ['off', 'Off', 'No name labels']] as const)
        .map(([v, label, title]) => h('button', { type: 'button', class: 'tbtn', 'data-labels': v, 'aria-pressed': 'false', title: `${title} (N cycles)`, onclick: () => this.update((s) => { s.labels = v; }) }, label)));
    toolbar.append(presetGroup, hemiGroup, labelGroup, h('div', { class: 'tgroup' }, this.measureBtn, share));
    this.gizmo.setAttribute('viewBox', '-40 -40 80 80');
    this.gizmo.setAttribute('class', 'gizmo');
    this.gizmo.setAttribute('aria-hidden', 'true');
    const legendOpen = window.matchMedia('(min-width: 900px) and (min-height: 700px)').matches;
    const bottom = h('div', { class: 'stage-bottom' },
      h('details', { class: 'legend-box', open: legendOpen }, h('summary', {}, 'Legend'), this.legend),
      h('div', { class: 'readout-box' }, this.measureOut, this.readout));
    this.leaders.setAttribute('class', 'leaders');
    this.leaders.setAttribute('aria-hidden', 'true');
    this.stage.append(host, this.endoMask, this.insetFrame, toolbar, this.leaders, this.labels, this.gizmo, bottom, this.tip, this.status);
    this.bindSteering(host);
    this.readout.textContent = 'Point at a structure for its position';

    this.viewer = new Viewer<VeState, VePlan>(host, {
      hover: (info, x, y) => this.showTip(info, x, y),
      pick: (info) => { if (info.id && info.kind === 'structure') this.update((s) => { s.sel = info.id; }); },
      readout: (ras) => this.showReadout(ras),
      measure: (pts) => { this.measurePts = pts; this.showMeasure(); },
      cameraChanged: (p, t) => this.update((s) => {
        s.cam = { preset: s.cam.preset, pos: [p.x, p.y, p.z], tgt: [t.x, t.y, t.z] };
      }, { camera: false }),
      leadMoved: () => undefined,
      status: (t) => { this.status.hidden = !t; this.status.textContent = t ?? ''; },
      lead: () => undefined,
      moving: (on) => this.stage.classList.toggle('moving', on),
      endoscope: () => this.renderScopeOut(),
    }, veScene);
    const origRender = this.viewer.renderer.render.bind(this.viewer.renderer);
    this.viewer.renderer.render = (sc, cam) => { origRender(sc, cam); this.placeLabels(); };
  }

  // ---------------------------------------------------------------- panel
  private buildPanel(): void {
    const handle = h('button', {
      type: 'button', class: 'sheet-handle', 'aria-label': 'Expand or collapse panel', 'aria-expanded': 'false',
      onclick: () => this.setSheet(this.sheetState === 'peek' ? 'full' : 'peek'),
    }, h('span', { class: 'grip' }));
    bindSheetDrag(handle, (st) => this.setSheet(st));
    const tablist = h('div', { class: 'ptabs', role: 'tablist', 'aria-label': 'Panel' });
    const names: [string, string][] = [['overview', 'Anatomy'], ['layers', 'Layers']];
    for (const [id, label] of names) {
      const b = h('button', {
        type: 'button', role: 'tab', class: 'ptab', id: `ptab-${id}`, 'aria-controls': `pane-${id}`,
        'aria-selected': id === 'overview' ? 'true' : 'false', tabindex: id === 'overview' ? 0 : -1,
        onclick: () => this.selectTab(id),
        onkeydown: (e: Event) => {
          const k = (e as KeyboardEvent).key;
          if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
          e.preventDefault();
          const i = names.findIndex(([x]) => x === id);
          const n = names[(i + (k === 'ArrowRight' ? 1 : names.length - 1)) % names.length][0];
          this.selectTab(n); this.tabBtns[n].focus();
        },
      }, label) as HTMLButtonElement;
      this.tabBtns[id] = b;
      tablist.append(b);
      this.tabs[id] = h('div', { class: 'pane', role: 'tabpanel', id: `pane-${id}`, 'aria-labelledby': `ptab-${id}`, hidden: id !== 'overview' });
    }
    this.panel.append(handle, tablist, ...Object.values(this.tabs));
  }

  private selectTab(id: string, expand = true): void {
    for (const [k, b] of Object.entries(this.tabBtns)) {
      b.setAttribute('aria-selected', String(k === id));
      b.tabIndex = k === id ? 0 : -1;
      this.tabs[k].hidden = k !== id;
    }
    if (expand && this.sheetState === 'peek' && window.matchMedia('(max-width: 899px)').matches) this.setSheet('full');
  }

  private setSheet(st: 'peek' | 'full'): void {
    this.sheetState = st;
    this.panel.dataset.sheet = st;
    this.panel.querySelector('.sheet-handle')?.setAttribute('aria-expanded', String(st === 'full'));
  }

  // ---------------------------------------------------------------- render
  render(s: VeState, opts: { camera: boolean }): void {
    const prev = this.s;
    this.s = s;
    this.viewer.apply(s, { animateCamera: opts.camera }).then(() => {
      this.renderLegend();
      // the meshes are loaded now: whether the tip is in the ventricles can be told
      if (VE_GROUP.get(this.s.grp)?.endoscope) { this.viewer.setEndoscope(this.endoscopeConfig(this.s.scope, this.s.morphs.hydrocephalus ?? 0)); this.renderScopeOut(); }
    });
    this.stage.querySelectorAll<HTMLButtonElement>('[data-hemi]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hemi === s.hemi)));
    this.stage.querySelectorAll<HTMLButtonElement>('.toolbar [data-labels]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.labels === s.labels)));
    this.stage.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.toggleAttribute('data-active', b.dataset.preset === s.cam.preset));
    const g = VE_GROUP.get(s.grp)!;
    const cath = g.catheter ? JSON.stringify(s.cath) : '';
    const key = `${s.grp}|${s.sel}|${s.hidden.join(',')}|${cath}|${g.endoscope ? `${s.scope.side}${s.scope.big}` : ''}`;
    if (key !== this.lastKey || !prev) { this.lastKey = key; this.renderOverview(); }
    if (cath !== this.lastCath) {
      this.lastCath = cath;
      const t = g.catheter ? this.current() : undefined;
      if (!g.endoscope) this.viewer.setOverlay(t ? catheterObjects(t) : []);
    }
    const hydro = s.morphs.hydrocephalus ?? 0;
    const scope = g.endoscope ? JSON.stringify(s.scope) + hydro : '';
    if (scope !== this.lastScope) {
      this.lastScope = scope;
      this.viewer.setOverlay(g.endoscope ? scopeObjects(s.scope, hydro) : g.catheter && this.current() ? catheterObjects(this.current()!) : []);
      this.viewer.setEndoscope(g.endoscope ? this.endoscopeConfig(s.scope, hydro) : null);
      this.endoMask.hidden = this.insetFrame.hidden = !g.endoscope;
      this.stage.classList.toggle('endo-big', !!g.endoscope && s.scope.big);
      if (g.endoscope) this.renderScopeOut();
    }
    this.renderLayers();
    if (prev && prev.sel !== s.sel && s.sel) this.selectTab('overview', false);
  }

  private endoscopeConfig(sc: Scope, hydro: number): EndoscopeConfig {
    const p = scopePose(sc, hydro);
    const xyz = (v: THREE.Vector3) => [v.x, v.y, v.z] as [number, number, number];
    // the floor thins as the ventricles enlarge: more shows through it (a shading choice)
    return {
      tip: xyz(p.tip), dir: xyz(p.dir), up: xyz(p.up), big: sc.big, role: endoRole, colour: endoColour,
      look: (id) => (id === 've_choroid_plexus' ? 'plexus' : undefined),
      floor: { centre: etvLine(sc.side, hydro).target, radiusMm: 7 + 3 * hydro, lambdaMm: FLOOR_LAMBDA_MM * (1 + 0.6 * hydro) },
    };
  }

  private setHydro(v: number): void {
    this.update((st) => {
      const was = st.morphs.hydrocephalus ?? 0;
      // keep the tip as deep relative to the floor as it was
      const d = st.scope.depth - defaultScopeDepth(st.scope.side, was);
      st.morphs = { ...st.morphs, hydrocephalus: v };
      if (!v) delete st.morphs.hydrocephalus;
      st.scope.depth = Math.max(0, Math.min(scopeMaxDepth(st.scope.side), defaultScopeDepth(st.scope.side, v) + d));
    });
  }

  private setScope(fn: (e: Scope) => void): void {
    this.update((st) => { fn(st.scope); });
  }

  /** Steering while the endoscope's view is the big one: drag tilts the scope about its burr hole, the wheel moves it
   * in and out. */
  private bindSteering(host: HTMLElement): void {
    const on = () => VE_GROUP.get(this.s?.grp ?? '')?.endoscope && this.s.scope.big;
    const inInset = (e: PointerEvent | WheelEvent) => {
      const r = this.viewer.endoscopeRects()?.overview, b = host.getBoundingClientRect();
      return !!r && e.clientX - b.left >= r.x && e.clientX - b.left <= r.right && e.clientY - b.top >= r.y && e.clientY - b.top <= r.bottom;
    };
    host.addEventListener('pointerdown', (e) => {
      if (!on() || inInset(e)) return;
      this.steer = { x: e.clientX, y: e.clientY, ap: this.s.scope.ap, ml: this.s.scope.ml };
    });
    host.addEventListener('pointermove', (e) => {
      if (!this.steer || !(e.buttons & 1)) { this.steer = null; return; }
      const k = 0.12, st = this.steer;
      const clamp = (x: number) => Math.max(-SCOPE_TILT_MAX, Math.min(SCOPE_TILT_MAX, Math.round(x * 2) / 2));
      // drag the view: the scene follows the pointer, so the scope turns the other way
      const ap = clamp(st.ap + (e.clientY - st.y) * k), ml = clamp(st.ml + (this.s.scope.side === 'R' ? 1 : -1) * (e.clientX - st.x) * k);
      if (ap !== this.s.scope.ap || ml !== this.s.scope.ml) this.setScope((sc) => { sc.ap = ap; sc.ml = ml; });
    });
    window.addEventListener('pointerup', () => { this.steer = null; });
    host.addEventListener('wheel', (e) => {
      if (!on() || inInset(e)) return;
      e.preventDefault();
      this.moveScope(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
  }

  private moveScope(mm: number): void {
    this.setScope((sc) => { sc.depth = Math.max(0, Math.min(scopeMaxDepth(sc.side), Math.round((sc.depth + mm) * 2) / 2)); });
  }

  /** Where the tip is and how close the shaft comes to what it must spare, on this CT. */
  private renderScopeOut(): void {
    const sc = this.s.scope;
    const hydro = this.s.morphs.hydrocephalus ?? 0;
    const p = scopePose(sc, hydro);
    const t = etvLine(sc.side, hydro);
    for (const [k, v] of [['depth', sc.depth], ['ap', sc.ap], ['ml', sc.ml]] as const) {
      const el = this.scopeInputs[k];
      if (!el) continue;
      if (document.activeElement !== el.input) el.input.value = String(v);
      el.out.textContent = `${fmtMm(v)}${el.unit}`;
    }
    clear(this.scopeOut);
    const inside = this.viewer.endoscopeInside();
    const tgt = v3(t.target), apex = v3(ETV.points.basilarApex), monro = v3(t.monro);
    const where = !inside ? (sc.depth < t.depthToMonroMm - 10 ? 'in the brain: the lens against the tissue (advance into the frontal horn)' : 'against or through a wall, in the brain')
      : p.tip.z > monro.z + 1.5 ? 'in the lateral ventricle' : 'in the third ventricle';
    const fornix = this.viewer.structurePoints('ve_fornix').filter((q) => (sc.side === 'R' ? q.x > ETV.frame.origin[0] : q.x < ETV.frame.origin[0]));
    const off = THREE.MathUtils.radToDeg(p.dir.angleTo(p.line));
    this.scopeOut.append(
      h('p', {}, h('strong', {}, `${fmtMm(sc.depth)} mm`), ` from the outer table, ${where}.`),
      h('ul', { class: 'plain' },
        h('li', {}, `The tip is ${fmtMm(p.tip.distanceTo(tgt))} mm from the target on the floor, ${fmtMm(p.tip.distanceTo(apex))} mm from the basilar apex.`),
        fornix.length ? h('li', {}, `The shaft passes ${fmtMm(segmentDistance(p.entry, p.tip, fornix))} mm from the fornix (its nearest point).`) : null,
        h('li', {}, off < 0.25 ? 'On Sousa’s line through the foramen of Monro.' : `${fmtMm(off)}° off Sousa’s line.`)));
  }

  private current(): Trajectory | undefined {
    const c = this.s.cath;
    return trajectoryFor(c.kocher, c.side, c.offset, c.target);
  }

  private pickGroup(id: string): void {
    this.update((st) => {
      st.grp = id; st.cam = { preset: null }; st.hidden = []; st.sel = null;
      // the catheter's trajectories are this patient's: drawn on the ventricles as they are
      if (VE_GROUP.get(id)?.catheter) st.morphs = {};
      st.scope.depth = defaultScopeDepth(st.scope.side, st.morphs.hydrocephalus ?? 0);
    }, { camera: true });
  }

  private setCath(fn: (c: Catheter) => void): void {
    this.update((st) => { fn(st.cath); });
  }

  private renderOverview(): void {
    const s = this.s;
    const pane = this.tabs.overview;
    const keep = [pane.scrollTop, this.panel.scrollTop];
    requestAnimationFrame(() => { pane.scrollTop = keep[0]; this.panel.scrollTop = keep[1]; });
    clear(pane);
    const g = VE_GROUP.get(s.grp)!;
    for (const [kind, label] of GROUP_ROWS) {
      pane.append(h('p', { class: 'chips-label' }, label),
        chips(VE_GROUPS.filter((x) => x.kind === kind).map((x) => [x.id, x.name]), g.id, (v) => this.pickGroup(v), { label, cls: 'grp-chips' }));
    }
    if (g.catheter) pane.append(this.catheterPanel());
    if (g.endoscope) pane.append(this.scopePanel());
    else if (g.kind === 'anatomy') pane.append(h('section', { class: 'card scope', 'aria-label': 'Shape' }, h('h3', {}, 'Shape'), this.hydroControl()));
    const hidden = new Set(s.hidden);
    const show = (ids: string[], on: boolean) => this.update((st) => { st.hidden = on ? st.hidden.filter((x) => !ids.includes(x)) : [...new Set([...st.hidden, ...ids])]; });
    const entry = (id: string) => {
      const off = hidden.has(id);
      return h('span', { class: `sb-entry${off ? ' off' : ''}` },
        h('button', { type: 'button', class: 'eye', 'aria-pressed': String(!off), title: off ? 'Show' : 'Hide', 'aria-label': `${off ? 'Show' : 'Hide'} ${nameOf(id)}`, onclick: () => show([id], off) }, eyeIcon(!off)),
        h('button', {
          type: 'button', class: 'chip sb-item', 'aria-pressed': String(s.sel === id), 'data-id': id,
          onclick: () => this.update((st) => { st.sel = st.sel === id ? null : id; }),
        }, h('span', { class: 'swatch', style: `--c: var(--c-${tokenOf(id)})` }), nameOf(id)));
    };
    pane.append(h('p', { class: 'chips-label' }, `Ventricles (${g.key.length})`), h('div', { class: 'chips wrap sb-list' }, ...g.key.map(entry)));
    if (s.sel && VE.has(s.sel)) pane.append(this.card(s.sel));
    const groupCard = h('article', { class: 'card' },
      h('p', { class: 'eyebrow' }, GROUP_ROWS.find(([k]) => k === g.kind)![1]),
      h('h2', {}, g.name),
      h('p', {}, g.description),
      g.kind === 'access' ? h('dl', {},
        h('dt', {}, 'Kocher’s point'), h('dd', {}, claimList(KOCHER)),
        h('dt', {}, 'Aiming between the canthi'), h('dd', {}, claimList(IDEAL)),
        h('dt', {}, 'In practice'), h('dd', {}, claimList(PRACTICE)),
        h('dt', {}, 'How it is drawn here'), h('dd', {},
          `On this CT: the coronal suture is placed where its frontal and parietal bones meet; Kocher’s point ${fmtMm(TRAJ.params.kocherAnteriorMm)} mm in front of it along the outer table. The external acoustic meatus is where each ear canal leaves the bone. The CT stops at the forehead, so the medial canthi are put ${fmtMm(TRAJ.canthusMm)} mm from the midline (half Chen’s mean intercanthal distance) and, as in Chen, projected onto the line between the two meatus: the catheter aims at that point. Depths are measured from the outer table along the catheter.`)) : null,
      g.kind === 'endoscopic' ? h('dl', {},
        h('dt', {}, 'What the endoscope passes and spares'), h('dd', {}, claimList(ETV_ANATOMY)),
        h('dt', {}, 'The line to the floor'), h('dd', {}, claimList(ETV_TRAJECTORY)),
        h('dt', {}, 'Hydrocephalus'), h('dd', {}, claimList(HYDRO)),
        h('dt', {}, 'How it is drawn here'), h('dd', {}, this.etvMethod())) : null,
      g.kind === 'anatomy' && g.id !== 'ventricles' ? h('dl', {},
        h('dt', {}, 'Around the foramen of Monro'), h('dd', {}, claimList(ETV_ANATOMY.slice(0, 1))),
        h('dt', {}, 'The floor of the third ventricle'), h('dd', {}, claimList(THIRD_FLOOR)),
        h('dt', {}, 'How it is drawn here'), h('dd', {}, this.etvMethod())) : null,
      g.id === 'ventricles' ? h('dl', {},
        h('dt', {}, 'The lateral ventricle’s walls'), h('dd', {}, claimList(LATERAL_WALLS)),
        h('dt', {}, 'The foramina of Monro'), h('dd', {}, claimList(MONRO)),
        h('dt', {}, 'The floor of the third ventricle'), h('dd', {}, claimList(THIRD_FLOOR), h('p', { class: 'aside' }, 'This CT shows the third ventricle only in part: its floor is the fitted model’s.')),
        h('dt', {}, 'The aqueduct'), h('dd', {}, claimList(AQUEDUCT)),
        h('dt', {}, 'The fourth ventricle'), h('dd', {}, claimList(FOURTH))) : null,
      h('p', { class: 'aside schematic-note' }, 'One young adult’s CT: the ventricles are this patient’s and narrow, completed by a fitted model where the CT cannot show them; the brain around them is a template fitted into the skull. For teaching, not for planning.'));
    if (s.sel) pane.append(h('details', { class: 'more' }, h('summary', {}, `About ${g.name}`), groupCard));
    else pane.append(groupCard);
  }

  /** How the endoscopic view's anatomy is placed on this CT, and how it compares with the published measurements. */
  private etvMethod(): HTMLElement {
    const mb = ETV.mammillary;
    const t = ETV.trajectories.R;
    const yz = (a: [number, number]) => `${fmtMm(-a[0])} mm behind and ${fmtMm(-a[1])} mm below`;
    return h('div', {},
      h('p', {}, 'The structures around the ventricles are the Z-Anatomy model’s, carried onto this CT by the fit that fits its ventricles onto this CT’s; where this CT shows the ventricles larger than the model, they are pushed out to the walls. The CT shows none of them. The vessels are this patient’s, from the CT angiogram; the oculomotor nerves are routed through this CT; the brainstem is a fitted model (Skull base v3).'),
      h('p', {}, `Measured from the anterior commissure along the AC–PC line (${fmtMm(ETV.acpcLengthMm)} mm here) as da Silva does: the infundibular recess lies ${yz(ETV.infundibularRecessAcpcMm)} it, and the top of the basilar artery ${yz(ETV.basilarApexAcpcMm)}. The model’s mammillary bodies lay ${fmtMm(-mb.modelAcpcMm[0])} mm behind it, too far forward: they are moved to da Silva’s ${fmtMm(-mb.daSilvaAcpcMm[0])} mm, at the height of the model’s floor there (${fmtMm(-mb.placedAcpcMm[1])} mm below it). The target is the midline floor halfway between the infundibular recess and the mammillary bodies; the basilar apex lies ${fmtMm(ETV.targetToBasilarApexMm)} mm from it.`),
      h('p', {}, `Sousa’s line, through the middle of the right foramen of Monro to the target and out to the outer table, is ${fmtMm(t.depthMm)} mm long on this CT and reaches the foramen at ${fmtMm(t.depthToMonroMm)} mm; its entry is ${fmtMm(t.fromMidlineMm)} mm from the midline and ${fmtMm(Math.abs(t.fromCoronalSutureMm))} mm ${t.fromCoronalSutureMm < 0 ? 'behind' : 'in front of'} the coronal suture; it is angled ${fmtMm(t.sagittalAngleDeg)}° in the sagittal and ${fmtMm(t.coronalAngleDeg)}° in the coronal plane against the AC–PC line’s perpendicular.`),
      h('p', {}, `The hydrocephalus slider: at its full extent the ventricles measure as Roşu’s medians (Evans’ index ${ETV.hydrocephalus.hydrocephalus.evansIndex.toFixed(2)}, third ventricle ${fmtMm(ETV.hydrocephalus.hydrocephalus.thirdWidthMm)} mm wide; this patient’s: ${ETV.hydrocephalus.rest.evansIndex.toFixed(2)} and ${fmtMm(ETV.hydrocephalus.rest.thirdWidthMm)} mm as drawn), triventricular (the aqueduct and the fourth ventricle unchanged), and the floor is pushed down to ${fmtMm(ETV.hydrocephalus.hydrocephalus.floorToApexMm)} mm from the basilar apex (Aydin’s 2.75 mm, as da Silva cites it; ${fmtMm(ETV.hydrocephalus.rest.floorToApexMm)} mm here at rest), the apex itself still. How the walls get there is a shape, not a simulation of the tissue: each wall moves out along its normal (the septum, the lateral ventricles’ floors and the columns of the fornix stay; the foramina grow backwards and outwards), the walls are draped over this patient’s arteries at the skull base, which do not move, and everything around follows a smooth field that does not fold it. With it, Sousa’s line is ${fmtMm(ETV.hydrocephalus.trajectories.R.depthMm)} mm long and reaches the foramen at ${fmtMm(ETV.hydrocephalus.trajectories.R.depthToMonroMm)} mm.`),
      h('p', { class: 'aside' }, `The endoscope’s view is drawn, not photographed: a ${ENDO_FOV_DEG}° field, a light at the tip, each wall showing what lies just behind it (more through the thin floor), and the choroid plexus lobulated and glistening. These are rendering choices on the fitted shapes, not measurements.`));
  }

  /** The hydrocephalus slider and what the ventricles measure at it. */
  private hydroControl(): HTMLElement {
    const H = ETV.hydrocephalus;
    const v = this.s.morphs.hydrocephalus ?? 0;
    const out = h('output', {}, `${Math.round(v * 100)} %`);
    const note = h('p', { class: 'aside hydro-now' });
    const say = (x: number) => {
      const l = (a: number, b: number) => a + (b - a) * x;
      note.textContent = `Evans’ index ${l(H.rest.evansIndex, H.hydrocephalus.evansIndex).toFixed(2)}, third ventricle ${fmtMm(l(H.rest.thirdWidthMm, H.hydrocephalus.thirdWidthMm))} mm wide, the floor ${fmtMm(l(H.rest.floorToApexMm, H.hydrocephalus.floorToApexMm))} mm above the basilar apex (in between, the shape is a straight blend).`;
    };
    say(v);
    const input = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: v, 'aria-label': 'Hydrocephalus',
      oninput: (e: Event) => { const x = parseFloat((e.target as HTMLInputElement).value); out.textContent = `${Math.round(x * 100)} %`; say(x); this.setHydro(x); } });
    return h('div', { class: 'hydro' },
      h('label', { class: 'range scope-range' }, h('span', {}, 'Hydrocephalus ', out), input),
      note);
  }

  /** The endoscope's controls and where it is. */
  private scopePanel(): HTMLElement {
    const sc = this.s.scope;
    const slider = (key: 'depth' | 'ap' | 'ml', label: string, value: number, min: number, max: number, step: number, set: (v: number) => void, unit: string) => {
      const out = h('output', {}, `${fmtMm(value)}${unit}`);
      const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label, oninput: (e: Event) => set(parseFloat((e.target as HTMLInputElement).value)) }) as HTMLInputElement;
      this.scopeInputs[key] = { input, out, unit };
      return h('label', { class: 'range scope-range' }, h('span', {}, label, ' ', out), input);
    };
    const box = h('section', { class: 'card scope', 'aria-label': 'Endoscope' },
      h('h3', {}, 'Endoscope'),
      h('p', { class: 'chips-label' }, 'Burr hole'),
      chips<'L' | 'R'>([['R', 'Right'], ['L', 'Left']], sc.side, (v) => this.update((st) => { st.scope.side = v; st.scope.depth = defaultScopeDepth(v, st.morphs.hydrocephalus ?? 0); }), { label: 'Burr hole', cls: 'scope-side' }),
      this.hydroControl(),
      slider('depth', 'Depth', sc.depth, 0, scopeMaxDepth(sc.side), 0.5, (v) => this.setScope((e) => { e.depth = v; }), ' mm'),
      slider('ap', 'Tilt forward', sc.ap, -SCOPE_TILT_MAX, SCOPE_TILT_MAX, 0.5, (v) => this.setScope((e) => { e.ap = v; }), '°'),
      slider('ml', 'Tilt towards the midline', sc.ml, -SCOPE_TILT_MAX, SCOPE_TILT_MAX, 0.5, (v) => this.setScope((e) => { e.ml = v; }), '°'),
      h('div', { class: 'chips' },
        h('button', { type: 'button', class: 'chip', onclick: () => this.setScope((e) => { e.ap = 0; e.ml = 0; }) }, 'Back on the line'),
        h('button', { type: 'button', class: 'chip', onclick: () => this.setScope((e) => { e.big = !e.big; }) }, sc.big ? 'Show the 3D view big' : 'Show the endoscope big')),
      h('p', { class: 'aside' }, 'In the endoscope’s view: drag to tilt the scope, scroll to move it in or out (or the arrow keys, W and S). Up on the screen is forwards. Point at the image to name what you see, and what shows through the wall.'),
      this.scopeOut);
    this.renderScopeOut();
    return box;
  }

  /** The catheter's controls and its result on this CT, with the published accuracy of its aim. */
  private catheterPanel(): HTMLElement {
    const c = this.s.cath;
    const t = this.current();
    const box = h('section', { class: 'card catheter', 'aria-label': 'Catheter' },
      h('h3', {}, 'Catheter'),
      h('p', { class: 'chips-label' }, 'Side'),
      chips<'L' | 'R'>([['R', 'Right'], ['L', 'Left']], c.side, (v) => this.setCath((x) => { x.side = v; }), { label: 'Side', cls: 'cath-side' }),
      h('p', { class: 'chips-label' }, 'Kocher’s point'),
      chips<'chen' | 'park'>([['chen', KOCHER_LABEL.chen], ['park', KOCHER_LABEL.park]], c.kocher, (v) => this.setCath((x) => { x.kocher = v; }), { label: 'Kocher’s point', cls: 'cath-kocher' }),
      h('p', { class: 'chips-label' }, 'Entry'),
      chips<string>(TRAJ.params.apOffsets.map((o) => [String(o), offsetLabel(o)]), String(c.offset), (v) => this.setCath((x) => { x.offset = Number(v); }), { label: 'Entry', cls: 'cath-offset' }),
      h('p', { class: 'chips-label' }, 'Aimed at (coronal target)'),
      chips<string>(TARGETS.map((x) => [x, `${x}: ${TARGET_NAME[x]}`]), c.target, (v) => this.setCath((x) => { x.target = v as Catheter['target']; }), { label: 'Aim', cls: 'cath-target' }));
    if (!t) return box;
    const ipsi = t.ventricle === c.side;
    const verdict = t.ventricle
      ? `${ipsi ? 'Reaches the ipsilateral' : 'Reaches the contralateral'} lateral ventricle ${fmtMm(t.depthMm ?? 0)} mm from the outer table, and runs ${fmtMm(t.insideMm ?? 0)} mm inside it.`
      : `Meets neither lateral ventricle within ${fmtMm(TRAJ.params.maxDepthMm)} mm of the outer table (where Chen advises withdrawing and re-aiming): it passes ${fmtMm(t.missMm ?? 0)} mm from the ${t.nearestSide === c.side ? 'ipsilateral' : 'contralateral'} one.`;
    box.append(h('div', { class: `cath-result ${t.ventricle ? (ipsi ? 'ok' : 'warn') : 'miss'}`, role: 'status' },
      h('p', {}, h('strong', {}, 'On this CT: '), verdict),
      h('p', { class: 'aside' }, `Skull ${fmtMm(t.boneMm)} mm thick at the entry; the catheter is ${fmtMm(t.angleToNormalDeg)}° from the perpendicular. This patient’s frontal horns are ${fmtMm(TRAJ.ventricles.frontalHorns.widthMm)} mm wide across both (Evans’ index ${TRAJ.ventricles.frontalHorns.evansIndex.toFixed(2)}).`)),
      h('h4', {}, `Published: ${TARGET_NAME[c.target]}`), claimList(ACCURACY[c.target]));
    return box;
  }

  private card(id: string): HTMLElement {
    const close = h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: () => this.update((s) => { s.sel = null; }) }, '×');
    const st = VE.get(id)!;
    const k = kindOf(id);
    const fh = TRAJ.ventricles.frontalHorns;
    return h('article', { class: 'card sel', style: `--accent: var(--c-${st.colour.token})` }, close,
      h('p', { class: 'eyebrow' }, KIND_LABEL[k]),
      h('h2', {}, h('span', { class: 'swatch', style: `--c: var(--c-${st.colour.token})` }), st.name),
      k === 'brain' ? h('p', { class: 'aside schematic-note' }, 'A template brain fitted into this skull and its arteries, not this patient’s own.') : null,
      h('dl', {},
        id === 've_lateral_ventricle' ? [h('dt', {}, 'Measured on this CT'), h('dd', {}, h('ul', { class: 'plain' },
          h('li', {}, `Volume: ${fmtMm(TRAJ.ventricles.volumeMl.R)} ml right, ${fmtMm(TRAJ.ventricles.volumeMl.L)} ml left as far as the CT shows them; ${fmtMm(TRAJ.ventricles.drawnMl.R)} and ${fmtMm(TRAJ.ventricles.drawnMl.L)} ml as drawn`),
          h('li', {}, `Frontal horns: ${fmtMm(fh.widthMm)} mm across both at their widest, against an inner skull width of ${fmtMm(fh.innerSkullMm)} mm on that slice (Evans’ index ${fh.evansIndex.toFixed(2)})`))),
        h('dt', {}, 'Walls'), h('dd', {}, claimList(LATERAL_WALLS))] : null,
        id === 've_third_ventricle' ? [h('dt', {}, 'Its floor'), h('dd', {}, claimList(THIRD_FLOOR))] : null,
        id === 've_interventricular_foramen' ? [h('dt', {}, 'The foramen'), h('dd', {}, claimList(MONRO))] : null,
        id === 've_cerebral_aqueduct' ? [h('dt', {}, 'The aqueduct'), h('dd', {}, claimList(AQUEDUCT))] : null,
        id === 've_fourth_ventricle' ? [h('dt', {}, 'The fourth ventricle'), h('dd', {}, claimList(FOURTH))] : null,
        h('dt', {}, 'Geometry'), h('dd', {}, `${st.source}. ${st.derivation} `, h('a', { href: '#/credits' }, 'Licence and attribution'))));
  }

  // ---------------------------------------------------------------- legend, labels, readout
  private renderLegend(): void {
    const p = this.viewer.currentPlan();
    clear(this.legend);
    if (!p) return;
    const hidden = new Set(this.s.hidden);
    const row = (cls: string, token: string, text: string, ids: string[]) => {
      const off = ids.length > 0 && ids.every((x) => hidden.has(x));
      return h('li', { class: off ? 'off' : '' },
        ids.length ? h('button', {
          type: 'button', class: 'eye', 'aria-pressed': String(!off), title: off ? 'Show' : 'Hide', 'aria-label': `${off ? 'Show' : 'Hide'} ${text}`,
          onclick: () => this.update((s) => { s.hidden = off ? s.hidden.filter((x) => !ids.includes(x)) : [...new Set([...s.hidden, ...ids])]; }),
        }, eyeIcon(!off)) : null,
        h('span', { class: `sw ${cls}`, style: `--c: var(--c-${token})` }), h('span', { class: 'lg-text' }, text));
    };
    for (const [id, l] of p.looks) if (l === 'primary') this.legend.append(row('solid', tokenOf(id), nameOf(id), [id]));
    const bones = [...p.looks].filter(([id, l]) => l !== 'hidden' && kindOf(id) === 'bone').map(([id]) => id);
    if (bones.length) this.legend.append(row('patch', 'sbBone', `Bones (${bones.length})`, bones));
    if (VE_GROUP.get(this.s.grp)?.catheter) this.legend.append(row('solid', 'electrode', 'Catheter', []));
    if (VE_GROUP.get(this.s.grp)?.endoscope) this.legend.append(row('solid', 'electrode', 'Endoscope', []));
    const ctx = [...p.looks].filter(([, l]) => l === 'context').map(([id]) => id);
    if (ctx.length) this.legend.append(row('patch', 'sbCsf', `Ventricles (${ctx.length}, see-through)`, ctx));
  }

  private placeLabels(): void {
    drawGizmo(this.gizmo, this.viewer.axesScreen());
    const er = this.viewer.endoscopeRects();
    if (er) {
      const e = er.endo, o = er.overview;
      Object.assign(this.endoMask.style, { left: `${e.x}px`, top: `${e.y}px`, width: `${e.width}px`, height: `${e.height}px` });
      const inset = this.s.scope.big ? o : e;
      Object.assign(this.insetFrame.style, { left: `${inset.x}px`, top: `${inset.y}px`, width: `${inset.width}px`, height: `${inset.height}px` });
      this.insetFrame.dataset.kind = this.s.scope.big ? '3d' : 'endo';
      if (this.s.scope.big) { layoutLabels([], this.stage.clientWidth, this.stage.clientHeight, this.labels, this.leaders); return; }
    }
    const mode = this.s?.labels ?? 'hover';
    const items: LabelItem[] = [];
    const have = new Set<string>();
    const add = (id: string, text: string, ax: number, ay: number, cls: string) => { if (!have.has(id)) { have.add(id); items.push({ id, text, ax, ay, cls }); } };
    if (mode === 'all') {
      const g = VE_GROUP.get(this.s.grp);
      const key = new Set(g?.key ?? []);
      for (const p of this.viewer.structureScreen()) if (key.has(p.id)) add(p.id, nameOf(p.id), p.x, p.y, 'slabel primary');
    }
    if (mode !== 'off' && this.s?.sel) {
      const a = this.viewer.anchorFor(this.s.sel);
      if (a) add(this.s.sel, nameOf(this.s.sel), a.x, a.y, 'slabel primary');
    }
    layoutLabels(items, this.stage.clientWidth, this.stage.clientHeight, this.labels, this.leaders);
  }

  private showTip(info: PickInfo | null, x: number, y: number): void {
    if (!info) { this.tip.hidden = true; return; }
    const r = this.stage.getBoundingClientRect();
    this.tip.hidden = false;
    this.tip.textContent = nameOf(info.id ?? '') + (info.side && info.kind === 'structure' ? (info.side === 'L' ? ' (left)' : ' (right)') : '')
      + (info.behindMm !== undefined ? `, through the wall (${fmtMm(info.behindMm)} mm behind it)` : '');
    this.tip.style.transform = `translate(${Math.round(x - r.left + 14)}px, ${Math.round(y - r.top + 14)}px)`;
  }

  private showReadout(ras: THREE.Vector3 | null): void {
    if (!ras) return;
    clear(this.readout);
    this.readout.append(h('span', { class: 'k' }, 'mm'), ` x ${fmtMm(ras.x)}  y ${fmtMm(ras.y)}  z ${fmtMm(ras.z)} from the hypophysial fossa`);
  }

  private toggleMeasure(): void {
    const on = this.measureBtn.getAttribute('aria-pressed') !== 'true';
    this.measureBtn.setAttribute('aria-pressed', String(on));
    this.viewer.setMeasuring(on);
    this.measurePts = [];
    this.measureOut.hidden = !on;
    this.measureOut.textContent = on ? 'Click or tap two points on any structure.' : '';
  }

  private showMeasure(): void {
    const [a, b] = this.measurePts;
    this.measureOut.hidden = false;
    if (!b) { this.measureOut.textContent = `Point A: ${[a.x, a.y, a.z].map(fmtMm).join(', ')}. Pick point B.`; return; }
    this.measureOut.textContent = `Distance ${fmtMm(a.distanceTo(b))} mm (on this CT)`;
  }

  private async copyLink(btn: HTMLElement): Promise<void> {
    try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Link copied'; }
    catch { window.prompt('Copy this link', location.href); }
    setTimeout(() => { btn.textContent = 'Copy link'; }, 1600);
  }

  // ---------------------------------------------------------------- layers
  private renderLayers(): void {
    const pane = this.tabs.layers;
    const s = this.s;
    if (!pane.childElementCount) {
      const rows = LAYERS.map(([k, label]) => h('div', { class: 'layer', 'data-layer': k },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e: Event) => this.update((st) => { st.layers[k].on = (e.target as HTMLInputElement).checked; }) }), label),
        h('label', { class: 'range' }, h('span', { class: 'vh' }, `${label} opacity`),
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, oninput: (e: Event) => this.update((st) => { st.layers[k].opacity = parseFloat((e.target as HTMLInputElement).value); }) }))));
      pane.append(h('h3', {}, 'Layers'), ...rows);
    }
    for (const [k] of LAYERS) {
      const row = pane.querySelector(`[data-layer="${k}"]`)!;
      (row.querySelector('input[type=checkbox]') as HTMLInputElement).checked = s.layers[k].on;
      (row.querySelector('input[type=range]') as HTMLInputElement).value = String(s.layers[k].opacity);
    }
  }

  // ---------------------------------------------------------------- keyboard
  handleKey(e: KeyboardEvent): boolean {
    const k = e.key;
    const preset = PRESETS.find((p) => p[2] === k);
    if (preset) { this.update((s) => { s.cam = { preset: preset[0] }; }, { camera: true }); return true; }
    if (k === 'h' || k === 'H') { this.update((s) => { s.hemi = s.hemi === 'both' ? 'L' : s.hemi === 'L' ? 'R' : 'both'; }); return true; }
    if (k === 'm' || k === 'M') { this.toggleMeasure(); return true; }
    if (k === 'n' || k === 'N') { this.update((s) => { s.labels = s.labels === 'hover' ? 'all' : s.labels === 'all' ? 'off' : 'hover'; }); return true; }
    if (VE_GROUP.get(this.s.grp)?.catheter) {
      // T cycles the aim, S the side
      if (k === 't' || k === 'T') { this.setCath((c) => { c.target = TARGETS[(TARGETS.indexOf(c.target) + 1) % TARGETS.length]; }); return true; }
      if (k === 's' || k === 'S') { this.setCath((c) => { c.side = c.side === 'R' ? 'L' : 'R'; }); return true; }
    }
    if (VE_GROUP.get(this.s.grp)?.endoscope) {
      const tilt = (dap: number, dml: number) => this.setScope((e) => {
        e.ap = Math.max(-SCOPE_TILT_MAX, Math.min(SCOPE_TILT_MAX, e.ap + dap));
        e.ml = Math.max(-SCOPE_TILT_MAX, Math.min(SCOPE_TILT_MAX, e.ml + dml));
      });
      if (k === 'w' || k === 'W') { this.moveScope(1); return true; }
      if (k === 's' || k === 'S') { this.moveScope(-1); return true; }
      if (k === 'ArrowUp') { tilt(1, 0); return true; }
      if (k === 'ArrowDown') { tilt(-1, 0); return true; }
      if (k === 'ArrowLeft') { tilt(0, this.s.scope.side === 'R' ? 1 : -1); return true; }
      if (k === 'ArrowRight') { tilt(0, this.s.scope.side === 'R' ? -1 : 1); return true; }
      if (k === 'v' || k === 'V') { this.setScope((e) => { e.big = !e.big; }); return true; }
    }
    if (k === 'Escape') {
      if (this.measureBtn.getAttribute('aria-pressed') === 'true') { this.toggleMeasure(); return true; }
      if (this.s.sel) { this.update((s) => { s.sel = null; }); return true; }
    }
    return false;
  }

  onShow(): void { this.viewer.invalidate(); }
}
