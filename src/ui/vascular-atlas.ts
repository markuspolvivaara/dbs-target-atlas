import * as THREE from 'three';
import type { CameraPreset } from '../data/schema';
import type { Hemi, LayerKey, ExtraLayerKey } from '../state';
import type { Claim } from '../brainstem/schema';
import { DSA, KIND_LABEL, kindOf, LESION, ponceClass, TREATMENTS, VA, VA_REF, type Lesion } from '../vascular';
import { A1_HYPOPLASIA, ANASTOMOTIC_VEINS, ANEURYSM_SITES, AVM_NIDUS, AVM_OTHER, AVM_WHAT, BLISTER, CCF, CCF_VEINS, CLIPPING, COILING, DAVF, FETAL_PCOM, FLOW_DIVERSION, FUSIFORM, ISAT, SPETZLER_MARTIN, SPETZLER_PONCE } from '../vascular/content';
import { VA_GROUP, VA_GROUPS, type VaGroup } from '../vascular/groups';
import { lesionParts, vaScene, type VaPlan } from '../vascular/scene';
import type { VaState } from '../vascular/state';
import { Viewer, type PickInfo } from '../viewer/Viewer';
import { h } from './h';
import { refLinksFrom } from './reflinks';
import { bindSheetDrag, drawGizmo, layoutLabels, type LabelItem } from './stage';
import { chips, clear, eyeIcon, fmtMm } from './widgets';

type Update = (fn: (s: VaState) => void, opts?: { camera?: boolean }) => void;

const PRESETS: [CameraPreset, string, string, string][] = [
  ['coronal', 'Front', '1', 'Front'], ['sagittal', 'Side', '2', 'Side'], ['axial', 'From above', '3', 'Above'],
  ['anterolateral', 'Front oblique', '4', 'Obl'], ['frontolateral', 'Over the forehead', '5', 'Fore'],
];
const LAYERS: [LayerKey | ExtraLayerKey, string][] = [
  ['tracts', 'Arteries'], ['vessels', 'Veins and sinuses'], ['targets', 'Lesion (nidus, aneurysm, fistula)'], ['cortex', 'Brain (fitted template)'], ['nuclei', 'Bone'],
];
const GROUP_ROWS: [VaGroup['kind'], string][] = [['normal', 'Normal circulation'], ['aneurysm', 'Aneurysms'], ['avm', 'Arteriovenous malformations'], ['fistula', 'Arteriovenous fistulas']];

const nameOf = (id: string) => VA.get(id)?.name ?? id;
const tokenOf = (id: string) => VA.get(id)?.colour.token ?? 'ctx';
const refs = (ids: string[]) => refLinksFrom(VA_REF, ids);
const claimList = (cl: Claim[]) => h('ul', { class: 'evidence' }, ...cl.map((c) => h('li', {}, c.text, ' ', refs(c.refIds))));

/** The angiogram's phase at a time (s): its own timing, a drawing choice. */
export function phaseAt(t: number): string {
  if (t < 0.05) return 'before the injection';
  if (t <= DSA.arterialS[1]) return 'arterial phase';
  if (t < DSA.venStartS) return 'capillary phase';
  if (t <= DSA.venousS[1]) return 'venous phase';
  return 'late venous phase, washing out';
}

const DSA_METHOD = 'How the angiogram is drawn: each vessel turns dark as contrast reaches it and fades as it washes out, as on a digital subtraction angiogram, but in 3D (turn it as it plays). Bone and brain are left out, as subtraction removes them. The timing is a drawing choice, not measured: arteries fill in order of their distance along the vessels from the injection (both carotid and both vertebral arteries at once), veins after a capillary delay, from their upstream ends to the jugular veins. A shunt has no capillary bed between artery and vein (Naranbhai 2023), so a lesion’s veins, and the sinuses they drain into, fill straight after its nidus or fistula, in the arterial phase.';

/** The 3D page of the vascular section: views, the angiogram, structure cards and the layers. */
export class VascularAtlasPage {
  readonly el: HTMLElement;
  viewer!: Viewer<VaState, VaPlan>;
  private s!: VaState;
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
  // the angiogram's bar
  private dsaToggle!: HTMLButtonElement;
  private playBtn!: HTMLButtonElement;
  private scrub!: HTMLInputElement;
  private timeOut = h('span', { class: 'dsa-time', 'aria-live': 'off' });
  private playing = false;
  private playT = 0;
  private lastFrame = 0;

  constructor(private update: Update) {
    this.stage = h('section', { class: 'stage', 'aria-label': '3D viewer' });
    this.panel = h('aside', { class: 'panel', 'aria-label': 'Views and layers', 'data-sheet': 'peek' });
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
    // the angiogram: on/off, play, and its time
    this.dsaToggle = h('button', { type: 'button', class: 'tbtn', 'aria-pressed': 'false', title: 'Show the vessels as an angiogram (A)', onclick: () => this.setDsa(!this.s.dsa.on) }, 'Angiogram') as HTMLButtonElement;
    this.playBtn = h('button', { type: 'button', class: 'tbtn', 'aria-label': 'Play', title: 'Play the angiogram (Space)', onclick: () => this.togglePlay() }, '▶') as HTMLButtonElement;
    this.scrub = h('input', { type: 'range', min: 0, max: DSA.tMaxS, step: 0.05, 'aria-label': 'Time after the injection (s)',
      oninput: (e: Event) => { this.playing = false; this.syncPlay(); this.playT = parseFloat((e.target as HTMLInputElement).value); this.showTime(); this.viewer.setDsa(true, this.playT, DSA.tMaxS); },
      onchange: () => this.update((s) => { s.dsa.on = true; s.dsa.t = this.playT; }) }) as HTMLInputElement;
    const dsaBar = h('div', { class: 'dsa-bar', role: 'group', 'aria-label': 'Angiogram' }, this.dsaToggle, this.playBtn, this.scrub, this.timeOut);
    const legendOpen = window.matchMedia('(min-width: 900px) and (min-height: 700px)').matches;
    const bottom = h('div', { class: 'stage-bottom' },
      h('details', { class: 'legend-box', open: legendOpen }, h('summary', {}, 'Legend'), this.legend),
      h('div', { class: 'readout-box' }, this.measureOut, this.readout));
    this.leaders.setAttribute('class', 'leaders');
    this.leaders.setAttribute('aria-hidden', 'true');
    this.stage.append(host, toolbar, dsaBar, this.leaders, this.labels, this.gizmo, bottom, this.tip, this.status);
    this.readout.textContent = 'Point at a structure for its position';

    this.viewer = new Viewer<VaState, VaPlan>(host, {
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
    }, vaScene);
    const origRender = this.viewer.renderer.render.bind(this.viewer.renderer);
    this.viewer.renderer.render = (sc, cam) => { origRender(sc, cam); this.placeLabels(); };
  }

  // ---------------------------------------------------------------- the angiogram
  private setDsa(on: boolean): void {
    if (!on) { this.playing = false; this.syncPlay(); }
    this.update((s) => { s.dsa.on = on; if (on && !this.playing) s.dsa.t = s.dsa.t || 0; });
  }

  private togglePlay(): void {
    if (!this.s.dsa.on) this.update((s) => { s.dsa.on = true; });
    this.playing = !this.playing;
    if (this.playing && this.playT >= DSA.tMaxS - 0.05) this.playT = 0;
    this.syncPlay();
    if (this.playing) { this.lastFrame = performance.now(); requestAnimationFrame(this.tick); }
    else this.update((s) => { s.dsa.t = this.playT; });
  }

  private tick = (now: number) => {
    if (!this.playing) return;
    // real time: the angiogram's seconds are seconds
    this.playT = Math.min(DSA.tMaxS, this.playT + (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.viewer.setDsa(true, this.playT, DSA.tMaxS);
    this.scrub.value = String(this.playT);
    this.showTime();
    if (this.playT >= DSA.tMaxS) { this.playing = false; this.syncPlay(); this.update((s) => { s.dsa.t = this.playT; }); return; }
    requestAnimationFrame(this.tick);
  };

  private syncPlay(): void {
    this.playBtn.textContent = this.playing ? '❚❚' : '▶';
    this.playBtn.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
  }

  private showTime(): void {
    this.timeOut.textContent = this.s?.dsa.on || this.playing ? `${this.playT.toFixed(1)} s · ${phaseAt(this.playT)}` : 'off';
  }

  // ---------------------------------------------------------------- panel
  private buildPanel(): void {
    const handle = h('button', {
      type: 'button', class: 'sheet-handle', 'aria-label': 'Expand or collapse panel', 'aria-expanded': 'false',
      onclick: () => this.setSheet(this.sheetState === 'peek' ? 'full' : 'peek'),
    }, h('span', { class: 'grip' }));
    bindSheetDrag(handle, (st) => this.setSheet(st));
    const tablist = h('div', { class: 'ptabs', role: 'tablist', 'aria-label': 'Panel' });
    const names: [string, string][] = [['overview', 'Views'], ['layers', 'Layers']];
    for (const [id, label] of names) {
      const b = h('button', {
        type: 'button', role: 'tab', class: 'ptab', id: `ptab-${id}`, 'aria-controls': `pane-${id}`,
        'aria-selected': id === 'overview' ? 'true' : 'false', tabindex: id === 'overview' ? 0 : -1,
        onclick: () => this.selectTab(id),
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
  render(s: VaState, opts: { camera: boolean }): void {
    const prev = this.s;
    this.s = s;
    if (!this.playing) this.playT = s.dsa.t;
    this.viewer.apply(s, { animateCamera: opts.camera }).then(() => {
      this.viewer.setDsa(this.s.dsa.on, this.playing ? this.playT : this.s.dsa.t, DSA.tMaxS);
      this.renderLegend();
    });
    this.stage.querySelectorAll<HTMLButtonElement>('[data-hemi]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hemi === s.hemi)));
    this.stage.querySelectorAll<HTMLButtonElement>('.toolbar [data-labels]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.labels === s.labels)));
    this.stage.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.toggleAttribute('data-active', b.dataset.preset === s.cam.preset));
    this.dsaToggle.setAttribute('aria-pressed', String(s.dsa.on));
    this.stage.classList.toggle('dsa-on', s.dsa.on);
    if (!this.playing) this.scrub.value = String(s.dsa.t);
    this.showTime();
    const key = `${s.grp}|${s.sel}|${s.hidden.join(',')}`;
    if (key !== this.lastKey || !prev) { this.lastKey = key; this.renderOverview(); }
    this.renderLayers();
    if (prev && prev.sel !== s.sel && s.sel) this.selectTab('overview', false);
  }

  private pickGroup(id: string): void {
    this.update((st) => { st.grp = id; st.cam = { preset: null }; st.hidden = []; st.sel = null; }, { camera: true });
  }

  private renderOverview(): void {
    const s = this.s;
    const pane = this.tabs.overview;
    const keep = [pane.scrollTop, this.panel.scrollTop];
    requestAnimationFrame(() => { pane.scrollTop = keep[0]; this.panel.scrollTop = keep[1]; });
    clear(pane);
    const g = VA_GROUP.get(s.grp)!;
    for (const [kind, label] of GROUP_ROWS) {
      pane.append(h('p', { class: 'chips-label' }, label),
        chips(VA_GROUPS.filter((x) => x.kind === kind).map((x) => [x.id, x.name]), g.id, (v) => this.pickGroup(v), { label, cls: 'grp-chips' }));
    }
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
    const { parts } = lesionParts(g.id);
    const own = parts.filter((p) => !VA.get(p)?.replaces);
    if (own.length) pane.append(h('p', { class: 'chips-label' }, g.kind === 'aneurysm' ? `Aneurysms (${own.length})` : 'The lesion'), h('div', { class: 'chips wrap sb-list' }, ...own.map(entry)));
    if (s.sel && VA.has(s.sel)) pane.append(this.card(s.sel));
    const groupCard = h('article', { class: 'card' },
      h('p', { class: 'eyebrow' }, GROUP_ROWS.find(([k]) => k === g.kind)![1]),
      h('h2', {}, g.name),
      h('p', {}, g.description),
      this.groupContent(g),
      h('details', { class: 'more' }, h('summary', {}, 'How the angiogram is drawn'), h('p', {}, DSA_METHOD)),
      h('p', { class: 'aside schematic-note' }, g.kind === 'normal'
        ? 'One adult’s CT angiogram: the vessels are this patient’s as its expert labels and the skull base section trace them. For teaching, not for diagnosis.'
        : 'The lesion is a drawing on one adult’s normal CT angiogram, not a patient’s: its place, shape and size are chosen to show the type. For teaching, not for diagnosis.'));
    if (s.sel) pane.append(h('details', { class: 'more' }, h('summary', {}, `About ${g.name}`), groupCard));
    else pane.append(groupCard);
  }

  private groupContent(g: VaGroup): HTMLElement | null {
    if (g.id === 'normal') return h('dl', {},
      h('dt', {}, 'The anastomotic veins'), h('dd', {}, 'The veins of Trolard (to the superior sagittal sinus) and Labbé (to the transverse sinus) are drawn by rule on the fitted brain from the superficial Sylvian vein.', claimList(ANASTOMOTIC_VEINS)));
    if (g.id === 'fetal') return h('dl', {}, h('dt', {}, 'Fetal posterior cerebral artery'), h('dd', {}, claimList(FETAL_PCOM)));
    if (g.id === 'a1hypo') return h('dl', {}, h('dt', {}, 'A1 hypoplasia'), h('dd', {}, claimList(A1_HYPOPLASIA)));
    if (g.kind === 'aneurysm') return h('div', {}, this.treatmentBox(), h('dl', {},
      h('dt', {}, 'Where they arise'), h('dd', {}, claimList(ANEURYSM_SITES)),
      h('dt', {}, 'Fusiform aneurysms'), h('dd', {}, claimList(FUSIFORM)),
      h('dt', {}, 'Blister and dissecting aneurysms'), h('dd', {}, claimList(BLISTER)),
      h('dt', {}, 'When one bleeds'), h('dd', {}, h('a', { href: '#/grading?to=hunt-hess' }, 'Hunt and Hess, WFNS and modified Fisher grades →'))));
    if (g.kind === 'avm') {
      const l = LESION.get(g.lesions[0])!;
      return h('dl', {},
        h('dt', {}, 'This one'), h('dd', {}, this.smTable(l)),
        h('dt', {}, 'What an AVM is'), h('dd', {}, claimList(AVM_WHAT)),
        h('dt', {}, 'The nidus'), h('dd', {}, claimList(AVM_NIDUS)),
        h('dt', {}, 'Spetzler–Martin grade'), h('dd', {}, claimList(SPETZLER_MARTIN)),
        h('dt', {}, 'Spetzler–Ponce class'), h('dd', {}, claimList(SPETZLER_PONCE)),
        h('dt', {}, 'Other grades and management'), h('dd', {}, claimList(AVM_OTHER)),
        h('dt', {}, 'All the grades'), h('dd', {}, h('a', { href: '#/grading' }, 'Spetzler–Martin and supplementary grades, and what they mean for treatment →')));
    }
    if (g.id === 'davf') return h('dl', {},
      h('dt', {}, 'This one'), h('dd', {}, 'Drawn as Borden type II, Cognard type IIa+b: it drains into the sinus (on to the jugular vein, and back along the transverse sinus against its normal flow) and back into a cortical vein, the vein of Labbé over the temporal lobe (cortical venous reflux). In the angiogram the sinus and that vein fill in the arterial phase.'),
      h('dt', {}, 'Borden and Cognard'), h('dd', {}, claimList(DAVF)),
      h('dt', {}, 'All the types'), h('dd', {}, h('a', { href: '#/grading?to=borden' }, 'Borden and Cognard tables, and what they mean for treatment →')));
    if (g.kind === 'fistula') return h('dl', {},
      h('dt', {}, 'Barrow types'), h('dd', {}, claimList(CCF)),
      h('dt', {}, 'Venous drainage'), h('dd', {}, claimList(CCF_VEINS)));
    return null;
  }

  /** The aneurysm treatments: one at a time, each on one of the drawn aneurysms, with what the sources say of it. */
  private treatmentBox(): HTMLElement {
    const t = this.s.treat;
    const lab = (id: string) => {
      const l = TREATMENTS.find((x) => x.id === id)!;
      const on = LESION.get((l as unknown as { treats: string }).treats)?.name ?? '';
      return `${l.name} (${on.replace(/ aneurysm$/, '').replace(/^Middle cerebral artery bifurcation$/, 'MCA bifurcation')})`;
    };
    const notes: Record<string, [string, Claim[]][]> = {
      clip: [['Clipping', CLIPPING], ['Clipping or coiling', ISAT]],
      coil: [['Coiling', COILING], ['Clipping or coiling', ISAT]],
      fd: [['Flow diversion', FLOW_DIVERSION]],
    };
    return h('div', { class: 'treat-box' },
      chips<string>([['', 'None'], ...TREATMENTS.map((x) => [x.id, lab(x.id)] as [string, string])], t,
        (v) => this.update((s) => { s.treat = v; s.sel = null; }), { label: 'Treatment', cls: 'treat-chips' }),
      t ? h('dl', {}, ...notes[t].flatMap(([title, cl]) => [h('dt', {}, title), h('dd', {}, claimList(cl))])) : null);
  }

  /** An AVM's Spetzler–Martin points, as drawn, its grade and Spetzler–Ponce class. */
  private smTable(l: Lesion): HTMLElement {
    const sm = l.sm!;
    const deep = (l.drainage ?? []).filter((d) => typeof d !== 'string' && d.kind === 'deep').length > 0;
    const row = (k: string, v: string, pts: number) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', {}, v), h('td', { class: 'num' }, String(pts)));
    return h('div', {},
      h('table', { class: 'sm-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'As drawn'), h('th', {}, 'Points'))),
        h('tbody', {},
          row('Size', `${fmtMm(l.nidusMm ?? 0)} mm nidus`, sm.size),
          row('Eloquence', l.location ?? '', sm.eloquence),
          row('Venous drainage', deep ? 'deep (and superficial)' : 'superficial only', sm.deep)),
        h('tfoot', {}, h('tr', {}, h('th', { scope: 'row' }, 'Grade'), h('td', {}, `Spetzler–Ponce class ${ponceClass(sm.grade)}`), h('td', { class: 'num' }, ['', 'I', 'II', 'III', 'IV', 'V'][sm.grade])))),
      h('p', { class: 'aside' }, `Fed by: ${(l.feeders ?? []).map((f) => f.toLowerCase()).filter((x, i, a) => a.indexOf(x) === i).join(', ')}. Draining to: ${(l.drainage ?? []).map((d) => (typeof d === 'string' ? d : d.vessel).toLowerCase()).filter((x, i, a) => a.indexOf(x) === i).join(', ')}.`));
  }

  private card(id: string): HTMLElement {
    const close = h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: () => this.update((s) => { s.sel = null; }) }, '×');
    const st = VA.get(id)!;
    const k = kindOf(id);
    const lesion = st.lesion ? LESION.get(st.lesion) : undefined;
    const facts: string[] = [];
    if (lesion?.kind === 'aneurysm' && st.category === 'aneurysm') {
      if (lesion.domeDiameterMm) facts.push(`Dome ${fmtMm(lesion.domeDiameterMm)} mm across on a ${fmtMm(lesion.neckMm ?? 0)} mm neck (illustrative).`);
      if (lesion.widestMm) facts.push(`Widened to ${fmtMm(lesion.widestMm)} mm over ${fmtMm(lesion.lengthMm ?? 0)} mm of a ${fmtMm(lesion.arteryMm ?? 0)} mm artery (illustrative).`);
      if (lesion.heightMm) facts.push(`A ${fmtMm(lesion.baseMm ?? 0)} mm base, ${fmtMm(lesion.heightMm)} mm high (illustrative).`);
    }
    return h('article', { class: 'card sel', style: `--accent: var(--c-${st.colour.token})` }, close,
      h('p', { class: 'eyebrow' }, KIND_LABEL[k]),
      h('h2', {}, h('span', { class: 'swatch', style: `--c: var(--c-${st.colour.token})` }), st.name),
      st.schematic ? h('p', { class: 'aside schematic-note' }, 'Drawn by rule, not segmented from the CT.') : null,
      h('dl', {},
        facts.length ? [h('dt', {}, 'As drawn'), h('dd', {}, facts.join(' '))] : null,
        lesion?.type === 'fusiform' ? [h('dt', {}, 'Fusiform aneurysms'), h('dd', {}, claimList(FUSIFORM))] : null,
        lesion?.type === 'blister' ? [h('dt', {}, 'Blister aneurysms'), h('dd', {}, claimList(BLISTER))] : null,
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
    const shown = [...p.looks].filter(([, l]) => l !== 'hidden').map(([id]) => id);
    const ofKind = (k: string) => shown.filter((id) => kindOf(id) === k);
    for (const id of shown) if (['aneurysm', 'nidus', 'fistula', 'feeder', 'drainer'].includes(kindOf(id))) this.legend.append(row('solid', tokenOf(id), nameOf(id), [id]));
    const art = ofKind('artery'), ven = ofKind('vein'), bone = ofKind('bone'), brain = ofKind('brain');
    if (art.length) this.legend.append(row('solid', 'sbArtery', `Arteries (${art.length})`, art));
    if (ven.length) this.legend.append(row('solid', 'sbVein', `Veins and sinuses (${ven.length})`, ven));
    if (brain.length) this.legend.append(row('patch', 'sbBrain', `Brain, fitted (${brain.length}, see-through)`, brain));
    if (bone.length) this.legend.append(row('patch', 'sbBone', `Bones (${bone.length})`, bone));
  }

  private placeLabels(): void {
    drawGizmo(this.gizmo, this.viewer.axesScreen());
    const mode = this.s?.labels ?? 'hover';
    const items: LabelItem[] = [];
    const have = new Set<string>();
    const add = (id: string, text: string, ax: number, ay: number, cls: string) => { if (!have.has(id)) { have.add(id); items.push({ id, text, ax, ay, cls }); } };
    if (mode === 'all') {
      const own = new Set(lesionParts(this.s.grp).parts.filter((p) => !VA.get(p)?.replaces));
      for (const p of this.viewer.structureScreen()) if (own.has(p.id)) add(p.id, nameOf(p.id), p.x, p.y, 'slabel primary');
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
        h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e: Event) => this.update((st) => { st.layers[k]!.on = (e.target as HTMLInputElement).checked; }) }), label),
        h('label', { class: 'range' }, h('span', { class: 'vh' }, `${label} opacity`),
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, oninput: (e: Event) => this.update((st) => { st.layers[k]!.opacity = parseFloat((e.target as HTMLInputElement).value); }) }))));
      pane.append(h('h3', {}, 'Layers'),
        h('p', { class: 'aside' }, 'Fade what is in the way: the brain and the bone to see an AVM inside, the veins to follow its feeding arteries, the arteries to follow its drainage.'),
        ...rows);
    }
    for (const [k] of LAYERS) {
      const row = pane.querySelector(`[data-layer="${k}"]`)!;
      (row.querySelector('input[type=checkbox]') as HTMLInputElement).checked = s.layers[k]!.on;
      (row.querySelector('input[type=range]') as HTMLInputElement).value = String(s.layers[k]!.opacity);
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
    if (k === 'a' || k === 'A') { this.setDsa(!this.s.dsa.on); return true; }
    if (k === ' ') { this.togglePlay(); return true; }
    if (k === 'Escape') {
      if (this.measureBtn.getAttribute('aria-pressed') === 'true') { this.toggleMeasure(); return true; }
      if (this.s.sel) { this.update((s) => { s.sel = null; }); return true; }
    }
    return false;
  }

  onShow(): void { this.viewer.invalidate(); }
}
