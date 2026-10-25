import * as THREE from 'three';
import type { CameraPreset } from '../data/schema';
import type { Hemi, LayerKey } from '../state';
import type { Claim } from '../brainstem/schema';
import { KIND_LABEL, kindOf, LM, TARGETS, TRAJ, trajectoryFor, VE, VE_REF, type Trajectory } from '../ventricles';
import { ACCURACY, IDEAL, KOCHER, LATERAL_WALLS, PRACTICE, TARGET_NAME, THIRD_FLOOR } from '../ventricles/content';
import { VE_GROUP, VE_GROUPS, type VeGroup } from '../ventricles/groups';
import { veScene, type VePlan } from '../ventricles/scene';
import type { Catheter, VeState } from '../ventricles/state';
import { Viewer, type PickInfo } from '../viewer/Viewer';
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
const GROUP_ROWS: [VeGroup['kind'], string][] = [['anatomy', 'Anatomy'], ['access', 'Ventricular access']];
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
    this.stage.append(host, toolbar, this.leaders, this.labels, this.gizmo, bottom, this.tip, this.status);
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
    this.viewer.apply(s, { animateCamera: opts.camera }).then(() => this.renderLegend());
    this.stage.querySelectorAll<HTMLButtonElement>('[data-hemi]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hemi === s.hemi)));
    this.stage.querySelectorAll<HTMLButtonElement>('.toolbar [data-labels]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.labels === s.labels)));
    this.stage.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.toggleAttribute('data-active', b.dataset.preset === s.cam.preset));
    const g = VE_GROUP.get(s.grp)!;
    const cath = g.catheter ? JSON.stringify(s.cath) : '';
    const key = `${s.grp}|${s.sel}|${s.hidden.join(',')}|${cath}`;
    if (key !== this.lastKey || !prev) { this.lastKey = key; this.renderOverview(); }
    if (cath !== this.lastCath) {
      this.lastCath = cath;
      const t = g.catheter ? this.current() : undefined;
      this.viewer.setOverlay(t ? catheterObjects(t) : []);
    }
    this.renderLayers();
    if (prev && prev.sel !== s.sel && s.sel) this.selectTab('overview', false);
  }

  private current(): Trajectory | undefined {
    const c = this.s.cath;
    return trajectoryFor(c.kocher, c.side, c.offset, c.target);
  }

  private pickGroup(id: string): void {
    this.update((st) => { st.grp = id; st.cam = { preset: null }; st.hidden = []; st.sel = null; }, { camera: true });
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
      g.kind === 'anatomy' ? h('dl', {},
        h('dt', {}, 'The lateral ventricle’s walls'), h('dd', {}, claimList(LATERAL_WALLS)),
        h('dt', {}, 'The floor of the third ventricle'), h('dd', {}, claimList(THIRD_FLOOR), h('p', { class: 'aside' }, 'This CT shows the third ventricle only in part: its floor is not drawn.'))) : null,
      h('p', { class: 'aside schematic-note' }, 'One young adult’s CT: the ventricles are this patient’s and narrow; the brain around them is a template fitted into the skull. For teaching, not for planning.'));
    if (s.sel) pane.append(h('details', { class: 'more' }, h('summary', {}, `About ${g.name}`), groupCard));
    else pane.append(groupCard);
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
      : `Misses both lateral ventricles: it passes ${fmtMm(t.missMm ?? 0)} mm from the ${t.nearestSide === c.side ? 'ipsilateral' : 'contralateral'} one.`;
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
          h('li', {}, `Volume: ${fmtMm(TRAJ.ventricles.volumeMl.R)} ml right, ${fmtMm(TRAJ.ventricles.volumeMl.L)} ml left (as far as the CT shows them)`),
          h('li', {}, `Frontal horns: ${fmtMm(fh.widthMm)} mm across both at their widest, against an inner skull width of ${fmtMm(fh.innerSkullMm)} mm on that slice (Evans’ index ${fh.evansIndex.toFixed(2)})`))),
        h('dt', {}, 'Walls'), h('dd', {}, claimList(LATERAL_WALLS))] : null,
        id === 've_third_ventricle' ? [h('dt', {}, 'Its floor'), h('dd', {}, claimList(THIRD_FLOOR))] : null,
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
  }

  private placeLabels(): void {
    drawGizmo(this.gizmo, this.viewer.axesScreen());
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
    this.tip.textContent = nameOf(info.id ?? '') + (info.side && info.kind === 'structure' ? (info.side === 'L' ? ' (left)' : ' (right)') : '');
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
    if (k === 'Escape') {
      if (this.measureBtn.getAttribute('aria-pressed') === 'true') { this.toggleMeasure(); return true; }
      if (this.s.sel) { this.update((s) => { s.sel = null; }); return true; }
    }
    return false;
  }

  onShow(): void { this.viewer.invalidate(); }
}
