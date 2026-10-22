import * as THREE from 'three';
import type { CameraPreset } from '../data/schema';
import type { Hemi, LayerKey } from '../state';
import { APPROACH_GEOM, definitionFor, isApproachPart, kindOf, LANDMARKS, LM, NOT_YET_SHOWN, REGIONS, SB, SB_MANIFEST, SB_MODEL, V3_FIT, type Landmark, type SbModel } from '../skullbase';
import { APPROACH, APPROACH_REF, INSULA, type ApproachClaim, type ApproachSection } from '../skullbase/approaches';
import { TB_NOTES, TB_REF } from '../skullbase/temporal';
import { encodeSkull } from '../skullbase/state';
import { combinedCut, FLOOR_CUT_MM, SB_GROUP, SB_GROUPS, viewGroup, type SbGroup } from '../skullbase/groups';
import { skullScene, type SkullPlan } from '../skullbase/scene';
import type { SkullState } from '../skullbase/state';
import { Viewer, type PickInfo } from '../viewer/Viewer';
import { h } from './h';
import { bindSheetDrag, drawGizmo, layoutLabels, type LabelItem } from './stage';
import { chips, clear, eyeIcon, fmtMm } from './widgets';
import { refLinksFrom } from './reflinks';
import { FORAMEN_CONTENTS, FORAMEN_REF } from '../skullbase/foramina';

type Update = (fn: (s: SkullState) => void, opts?: { camera?: boolean }) => void;

const PRESETS: [CameraPreset, string, string, string][] = [
  ['axial', 'From above', '1', 'Above'], ['inferior', 'From below', '2', 'Below'], ['lateral', 'Lateral', '3', 'Lat'],
  ['coronal', 'Anterior', '4', 'Ant'], ['posteriorOblique', 'Post-oblique', '5', 'Obl'],
  ...(SB_MODEL === 'v3' ? [['anterolateral', 'Surgical (anterolateral)', '6', 'Surg'] as [CameraPreset, string, string, string]] : []),
];
const LAYERS: [LayerKey, string][] = [['nuclei', 'Bones'], ['tracts', 'Vessels and nerves'], ['cortex', 'Soft tissue'], ['targets', 'Landmarks']];
const KIND_LABEL = { bone: 'Bone', soft: 'Soft tissue', artery: 'Artery', vein: 'Vein or dural sinus', nerve: 'Nerve', labyrinth: 'Inner ear', ossicle: 'Ossicle', membrane: 'Membrane', brain: 'Brain (fitted template)', hindbrain: 'Cerebellum and brainstem (fitted model)', ventricle: 'Ventricle (fitted model)', removed: 'Bone removed' } as const;
const KIND_PLURAL: Record<string, string> = { 'Soft tissue': 'Soft tissue', Artery: 'Arteries', 'Vein or dural sinus': 'Veins and dural sinuses', Nerve: 'Nerves', Ossicle: 'Ossicles', Membrane: 'Membranes' };
const GROUP_ROWS: [SbGroup['kind'], string][] = SB_MODEL === 'v3'
  ? [['overview', 'Overview'], ['region', 'Each side'], ['system', 'Systems'], ['approach', 'Surgical views']]
  : [['overview', 'Overview'], ['region', 'Regions'], ['system', 'Systems'], ['bone', 'Bones and their landmarks']];
/** the three models of the section: page folder and chip label */
const MODELS: [SbModel, string, string][] = [['v3', 'skullbase', 'Skull base'], ['zanatomy', 'skullbase-v1', 'Skull base v1 (Z-Anatomy)'], ['ct', 'skullbase-ct', 'Skull base v2 (CT)']];
const SIDE_NAME = { R: 'right', L: 'left' } as const;
/** the surgical views' shapes: slider label, key, and what full means on this model */
const MORPH_UI: Record<string, { label: string; key: string; note: () => string | null }> = {
  open: {
    label: 'Open the Sylvian fissure', key: 'o', note: () => {
      const b = V3_FIT.brain;
      return b ? `At 100 % the fissure’s lips are ${fmtMm(b.params.openFrontalMm)} mm higher (frontal and parietal) and ${fmtMm(b.params.openTemporalMm)} mm lower (temporal) than at rest; the insula and the brain beyond ${fmtMm(b.params.openRoiMm)} mm stay put. The middle cerebral artery’s branches on the frontal and parietal opercula rise with them.` : null;
    },
  },
  lift: {
    label: 'Lift the frontal lobe', key: 'l', note: () => {
      const b = V3_FIT.brain;
      return b ? `At 100 % the frontal lobe’s orbital surface is ${fmtMm(b.params.liftMm)} mm higher along a corridor over the orbital roof, from the anterior clinoid process forward to the frontal pole (fading out ${fmtMm(b.params.liftReachMm)} mm from it); the front of the insula rises up to ${Math.round(b.params.liftInsulaShare * 100)} % of that; the temporal lobe stays.` : null;
    },
  },
  interhemispheric: {
    label: 'Hold the right hemisphere off the falx', key: 'i', note: () => {
      const b = V3_FIT.brain;
      return b ? `At 100 % the right hemisphere’s medial surface, the cingulate gyrus with it, is ${fmtMm(b.params.interhemisphericMm)} mm further from the midline over the craniotomy’s length (fading out ${fmtMm(b.params.interhemisphericFadeMm)} mm beyond it), the shift falling to none ${fmtMm(b.params.interhemisphericReachMm)} mm out; the corpus callosum, the medial wall and the left hemisphere stay. The arteries in the fissure stay where the CT shows them.` : null;
    },
  },
  telovelar: {
    label: 'Draw the cerebellar tonsils apart', key: 't', note: () => {
      const p = V3_FIT.pfossa;
      return p ? `At 100 % each tonsil is ${fmtMm(p.params.tvMm)} mm further out to its side (and a little up), the rest of the hemisphere following less the further it lies from the tonsil (none ${fmtMm(p.params.tvReachMm)} mm away); the vermis, brainstem and fourth ventricle stay, and so do the arteries.` : null;
    },
  },
};
/** a list of sourced notes */
const notesList = (name: string) => (TB_NOTES[name] ?? []).length
  ? h('ul', { class: 'evidence' }, ...TB_NOTES[name].map((c) => h('li', {}, c.text, ' ', refLinksFrom(TB_REF, c.refIds))))
  : null;
const nameOf = (id: string) => SB.get(id)?.name ?? LM.get(id)?.name ?? id;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
/** Nerves grouped by cranial nerve (I-XII); within one, the nerve itself first, then its branches by name. */
function byCranialNerve(ids: string[]): [number, string[]][] {
  const groups = new Map<number, string[]>();
  for (const id of ids) {
    const cn = SB.get(id)?.cranialNerve ?? 13;
    groups.set(cn, [...(groups.get(cn) ?? []), id]);
  }
  const trunkFirst = (cn: number) => (a: string, b: string) => {
    const t = (id: string) => (/\([IVX]+\)$/.test(nameOf(id)) && cn <= 12 ? 0 : 1);
    return t(a) - t(b) || nameOf(a).localeCompare(nameOf(b));
  };
  return [...groups].sort(([a], [b]) => a - b).map(([cn, m]) => [cn, m.sort(trunkFirst(cn))]);
}
/** A cranial nerve's name as the model gives it ('Trigeminal nerve' from 'Trigeminal nerve (V)'). */
function cnName(cn: number, members: string[]): string {
  const trunk = members.find((id) => nameOf(id).endsWith(`(${ROMAN[cn - 1]})`));
  if (trunk) return nameOf(trunk).replace(/\s*\([IVX]+\)$/, '');
  return members.length === 1 ? nameOf(members[0]) : `Cranial nerve ${ROMAN[cn - 1] ?? ''}`;
}

/** A nerve (I-XII) or an artery system with its members; trunk: one member is the nerve or artery itself. */
interface Subgroup { num: string; title: string; members: string[]; trunk: boolean }
function subgroups(kind: 'nerve' | 'artery', ids: string[]): Subgroup[] {
  if (kind === 'nerve') {
    return byCranialNerve(ids).map(([cn, m]) => ({
      num: cn <= 12 ? ROMAN[cn - 1] : '', title: cnName(cn, m), members: m,
      trunk: m.some((id) => nameOf(id).endsWith(`(${ROMAN[cn - 1]})`)),
    }));
  }
  // arteries by system, in the order the manifest gives; the system's own artery first
  const order = SB_MANIFEST.arterySystems;
  const by = new Map<string, string[]>();
  for (const id of ids) {
    const k = SB.get(id)?.system ?? '';
    by.set(k, [...(by.get(k) ?? []), id]);
  }
  // the system's own artery: its name, or its name with a segment ('Middle cerebral artery (M1 segment)')
  const own = (id: string, k: string) => nameOf(id) === k || nameOf(id).startsWith(`${k} (`);
  return [...by].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([k, m]) => ({
    num: '', title: k, trunk: m.some((id) => own(id, k)),
    members: m.sort((a, b) => Number(!own(a, k)) - Number(!own(b, k)) || nameOf(a).localeCompare(nameOf(b))),
  }));
}
const subLabel = (g: Subgroup) => {
  const n = g.members.length - 1;
  const extra = !n ? '' : g.trunk ? ` (+${n} branch${n > 1 ? 'es' : ''})` : ` (${g.members.length})`;
  return `${g.num ? g.num + ' ' : ''}${g.title}${extra}`;
};
const tokenOf = (id: string) => SB.get(id)?.colour.token ?? 'ctx';

/** The 3D page of the skull-base section: groups, structure and landmark cards, layers and the cut-away. */
export class SkullbaseAtlasPage {
  readonly el: HTMLElement;
  viewer!: Viewer<SkullState, SkullPlan>;
  private s!: SkullState;
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
  private legendHover: string | null = null;
  private gizmo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite', hidden: true });
  private measureBtn!: HTMLButtonElement;
  private sheetState: 'peek' | 'full' = 'peek';
  private measurePts: THREE.Vector3[] = [];
  private lastKey = '';

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
      ...([['all', 'All', 'Label landmarks and, in regions, vessels and nerves'], ['hover', 'Hover', 'Label only what you point at, select or hover in the legend'], ['off', 'Off', 'No name labels']] as const)
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

    this.viewer = new Viewer<SkullState, SkullPlan>(host, {
      hover: (info, x, y) => this.showTip(info, x, y),
      pick: (info) => { if (info.id && (info.kind === 'structure' || info.kind === 'marker')) this.update((s) => { s.sel = info.id; }); },
      readout: (ras) => this.showReadout(ras),
      measure: (pts) => { this.measurePts = pts; this.showMeasure(); },
      cameraChanged: (pos, tgt) => this.update((s) => {
        s.cam = { preset: s.cam.preset, pos: [pos.x, pos.y, pos.z], tgt: [tgt.x, tgt.y, tgt.z] };
      }, { camera: false }),
      leadMoved: () => undefined,
      status: (t) => { this.status.hidden = !t; this.status.textContent = t ?? ''; },
      lead: () => undefined,
      moving: (on) => this.stage.classList.toggle('moving', on),
    }, skullScene);
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
    const names: [string, string][] = [['overview', 'Anatomy'], ['layers', 'Layers and cut']];
    for (const [id, label] of names) {
      const b = h('button', {
        type: 'button', role: 'tab', class: 'ptab', id: `ptab-${id}`, 'aria-controls': `pane-${id}`,
        'aria-selected': id === 'overview' ? 'true' : 'false', tabindex: id === 'overview' ? 0 : -1,
        onclick: () => this.selectTab(id),
        onkeydown: (e: Event) => {
          const k = (e as KeyboardEvent).key;
          if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
          e.preventDefault();
          const n = names[(names.findIndex(([x]) => x === id) + 1) % names.length][0];
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
  render(s: SkullState, opts: { camera: boolean }): void {
    const prev = this.s;
    this.s = s;
    this.viewer.apply(s, { animateCamera: opts.camera }).then(() => this.renderLegend());
    this.stage.querySelectorAll<HTMLButtonElement>('[data-hemi]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hemi === s.hemi)));
    this.stage.querySelectorAll<HTMLButtonElement>('.toolbar [data-labels]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.labels === s.labels)));
    this.stage.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.toggleAttribute('data-active', b.dataset.preset === s.cam.preset));
    const key = `${s.grp}|${s.also.join(',')}|${s.sel}|${s.hidden.join(',')}`;
    if (key !== this.lastKey || !prev) { this.lastKey = key; this.renderOverview(); }
    // the surgical view's sliders follow the state (keys move them too)
    for (const slider of this.tabs.overview.querySelectorAll<HTMLInputElement>('input[data-morph]')) {
      const v = Math.round((s.morphs[slider.dataset.morph!] ?? 0) * 100);
      if (Number(slider.value) === v) continue;
      slider.value = String(v);
      const out = slider.parentElement?.querySelector('output');
      if (out) out.textContent = `${v} %`;
    }
    this.renderLayers();
    if (prev && prev.sel !== s.sel && s.sel) this.selectTab('overview', false);
  }

  private pickGroup(id: string): void {
    this.update((st) => {
      const g = SB_GROUP.get(id)!;
      st.grp = id; st.also = []; st.hemi = g.hemi; st.cutAbove = g.cutAbove; st.cam = { preset: null }; st.hidden = []; st.sel = null; st.morphs = {};
    }, { camera: true });
  }

  /** Systems combine: with a system shown, a tap adds another or removes one (the last one stays); from any other view
   * a system opens on its own. The view keeps its camera; the cut-away becomes the least restrictive of the systems'. */
  private toggleSystem(id: string): void {
    if (SB_GROUP.get(this.s.grp)?.kind !== 'system') { this.pickGroup(id); return; }
    this.update((st) => {
      const shown = [st.grp, ...st.also];
      if (shown.includes(id)) {
        if (shown.length === 1) return;
        const rest = shown.filter((x) => x !== id);
        st.grp = rest[0]; st.also = rest.slice(1);
      } else {
        st.also = [...st.also, id];
        const cut = combinedCut([st.grp, ...st.also]);
        st.cutAbove = cut === null || st.cutAbove === null ? null : Math.max(st.cutAbove, cut);
      }
    });   // (not { camera: false }: that marks an update from the camera, which is not re-rendered)
  }

  private renderOverview(): void {
    const s = this.s;
    const pane = this.tabs.overview;
    // the lists re-render on every toggle: keep the reader's place
    const keep = [pane.scrollTop, this.panel.scrollTop];
    requestAnimationFrame(() => { pane.scrollTop = keep[0]; this.panel.scrollTop = keep[1]; });
    clear(pane);
    // the two models: the same view in the other one (its page, this link)
    // v1 and v2 share their views; the temporal-bone model has its own (a view one does not have opens the default)
    const other = (dir: string) => `../${dir}/${encodeSkull({ ...s, sel: null })}`;
    pane.append(h('p', { class: 'chips-label' }, 'Model'),
      h('div', { class: 'chips model-chips', role: 'group', 'aria-label': 'Model' },
        ...MODELS.map(([m, dir, label]) => h('a', {
          class: 'chip', href: m === SB_MODEL ? '#' : other(dir), 'aria-pressed': String(m === SB_MODEL), 'data-v': m,
          onclick: m === SB_MODEL ? (e: Event) => e.preventDefault() : undefined,
        }, label))),
      h('p', { class: 'aside model-note' }, SB_MODEL === 'v3'
        ? 'The CT of v2 with its anatomy made to fit it: cranial nerves routed through its own foramina, sinuses traced in it, and a real ear’s structures (OpenEar specimen ALPHA) registered into each temporal bone.'
        : SB_MODEL === 'ct'
        ? 'Bone and the labelled vessels from one head CT angiogram; the cranial nerves, the other vessels and the landmark names fitted onto it from the Z-Anatomy model (approximate).'
        : 'The Z-Anatomy model (BodyParts3D). The detailed model shows a real CT’s bone and vessels.'));
    const g = viewGroup(s.grp, s.also);
    const shownSystems = SB_GROUP.get(s.grp)?.kind === 'system' ? [s.grp, ...s.also] : [];
    for (const [kind, label] of GROUP_ROWS) {
      const items = SB_GROUPS.filter((x) => x.kind === kind).map((x): [string, string] => [x.id, x.name]);
      if (!items.length) continue;
      pane.append(kind === 'system'
        ? h('p', { class: 'chips-label' }, label, h('span', { class: 'chips-hint' }, ' · tap to combine'))
        : h('p', { class: 'chips-label' }, label),
      kind === 'system'
        ? chips(items, shownSystems, (v) => this.toggleSystem(v), { label, cls: 'grp-chips' })
        : chips(items, s.grp, (v) => this.pickGroup(v), { label, cls: 'grp-chips' }));
    }
    if (g.kind === 'approach') pane.append(this.openingSliders(g));
    const boneIds = g.structures.filter((id) => SB.get(id)?.type === 'bone');
    const hidden = new Set(s.hidden);
    const btn = (id: string, extra = '') => h('button', {
      type: 'button', class: 'chip sb-item', 'aria-pressed': String(s.sel === id), 'data-id': id,
      onclick: () => this.update((st) => { st.sel = st.sel === id ? null : id; }),
    }, h('span', { class: 'swatch', style: `--c: var(--c-${LM.has(id) ? 'ctx' : tokenOf(id)})` }), nameOf(id), extra);
    const show = (ids: string[], on: boolean) => this.update((st) => { st.hidden = on ? st.hidden.filter((x) => !ids.includes(x)) : [...new Set([...st.hidden, ...ids])]; });
    const eye = (ids: string[], label: string) => {
      const off = ids.every((x) => hidden.has(x));
      return h('button', {
        type: 'button', class: 'eye', 'aria-pressed': String(!off), title: off ? 'Show' : 'Hide', 'aria-label': `${off ? 'Show' : 'Hide'} ${label}`,
        onclick: () => show(ids, off),
      }, eyeIcon(!off));
    };
    const region = g.kind === 'region' ? REGIONS.find((r) => `near_${r.landmark.toLowerCase().replace(/[^a-z0-9]+/g, '_')}` === g.id) : undefined;
    const dist = (id: string) => region?.structures.find((x) => x.id === id)?.distanceMm;
    const entry = (id: string) => h('span', { class: `sb-entry${hidden.has(id) ? ' off' : ''}` }, eye([id], nameOf(id)),
      btn(id, dist(id) !== undefined ? ` · ${fmtMm(dist(id)!)} mm` : ''));
    const listHead = (label: string, ids: string[]) => h('div', { class: 'list-head' }, h('p', { class: 'chips-label' }, `${label} (${ids.length})`),
      h('span', { class: 'list-actions' },
        h('button', { type: 'button', class: 'linklike', onclick: () => show(ids, true) }, 'Show all'),
        h('button', { type: 'button', class: 'linklike', onclick: () => show(ids, false) }, 'Hide all')));
    // vessels, nerves and soft tissue: one list per kind; cranial nerves (I-XII) and artery systems each under
    // their own heading
    for (const k of ['brain', 'removed', 'nerve', 'labyrinth', 'ossicle', 'membrane', 'artery', 'vein', 'soft'] as const) {
      const ids = g.structures.filter((id) => { const st = SB.get(id); return st && st.type !== 'bone' && kindOf(st) === k; });
      if (!ids.length) continue;
      pane.append(listHead(KIND_PLURAL[KIND_LABEL[k]] ?? KIND_LABEL[k], ids));
      if (k !== 'nerve' && k !== 'artery') { pane.append(h('div', { class: 'chips wrap sb-list' }, ...ids.map(entry))); continue; }
      const nums = k === 'nerve';
      for (const sg of subgroups(k, ids)) {
        if (sg.members.length === 1) { // no separate branches: one row
          pane.append(h('div', { class: `cn-head single${nums ? '' : ' no-num'}` }, nums ? h('span', { class: 'cn-num' }, sg.num) : null, entry(sg.members[0])));
          continue;
        }
        pane.append(h('div', { class: `cn-head${nums ? '' : ' no-num'}` }, nums ? h('span', { class: 'cn-num' }, sg.num) : null, eye(sg.members, sg.title),
          h('span', {}, sg.trunk ? `${sg.title} and branches` : sg.title)),
          h('div', { class: `chips wrap sb-list cn-list${nums ? '' : ' no-num'}` }, ...sg.members.map(entry)));
      }
    }
    if (boneIds.length && g.kind !== 'overview') pane.append(h('p', { class: 'chips-label' }, 'Bones'), h('div', { class: 'chips wrap sb-list' }, ...boneIds.map((id) => btn(id))));
    if (g.landmarks.length) pane.append(h('p', { class: 'chips-label' }, `Landmarks (${g.landmarks.length})`), h('div', { class: 'chips wrap sb-list' }, ...g.landmarks.map((id) => btn(id))));
    if (s.sel) pane.append(this.card(s.sel));
    const groupCard = h('article', { class: 'card' },
      h('p', { class: 'eyebrow' }, GROUP_ROWS.find(([k]) => k === g.kind)![1]),
      h('h2', {}, g.name),
      h('p', {}, g.description),
      g.kind === 'overview' && SB_MODEL === 'v3' ? this.fitReport() : null,
      g.kind === 'approach' && g.approach ? this.approachBody(g.approach) : null,
      g.kind === 'overview' && SB_MODEL !== 'v3' ? [
        SB_MODEL === 'ct'
          ? h('p', { class: 'aside' }, 'Not yet shown in this model (Z-Anatomy does not label these; the first model locates the foramina from what passes through them): ', NOT_YET_SHOWN.join(', '), '.')
          : h('p', { class: 'aside' }, 'Z-Anatomy does not label the superior orbital fissure, internal acoustic meatus, stylomastoid and jugular foramina, carotid canal, foramen lacerum or cribriform plate: they are located here from where the nerves and vessels that pass through them cross the bone (each card says how). Not yet shown: ', NOT_YET_SHOWN.join(', '), '.'),
        h('p', { class: 'aside' }, 'One adult male model (BodyParts3D), simplified by Z-Anatomy. Positions are millimetres from the model’s hypophysial fossa landmark; this is not MNI space and does not match the DBS and white-matter sections. Vessels and nerves are drawn with the calibre Z-Anatomy models, which is not measured.'),
      ] : null);
    if (s.sel) pane.append(h('details', { class: 'more' }, h('summary', {}, `About ${g.name}`), groupCard));
    else pane.append(groupCard);
  }

  private card(id: string): HTMLElement {
    const close = h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: () => this.update((s) => { s.sel = null; }) }, '×');
    const lm = LM.get(id);
    const st = SB.get(id);
    const def = definitionFor(lm ? lm.name : st?.name ?? '');
    const defBlock = def
      ? [h('dt', {}, 'Definition'), h('dd', {}, h('p', {}, def.text), h('p', { class: 'aside' }, 'From Wikipedia (CC BY-SA 3.0), as shipped with Z-Anatomy; not checked against the literature. ',
        def.url ? h('a', { href: def.url, target: '_blank', rel: 'noopener' }, 'Source page') : null))]
      : [h('dt', {}, 'Definition'), h('dd', {}, 'Z-Anatomy ships no definition for this structure.')];
    const regions = REGIONS.filter((r) => lm ? r.landmarks.includes(lm.name) : r.structures.some((x) => x.id === id))
      .map((r) => `${r.landmark}${lm ? '' : ` (${fmtMm(r.structures.find((x) => x.id === id)!.distanceMm)} mm)`}`);
    if (lm) return this.landmarkCard(lm, close, defBlock, regions);
    if (!st) return h('p', {}, '');
    const k = kindOf(st);
    if (st.approach || k === 'brain' || k === 'hindbrain' || k === 'ventricle') {
      const ap = st.approach ? APPROACH.get(st.approach) : undefined;
      return h('article', { class: 'card sel', style: `--accent: var(--c-${st.colour.token})` }, close,
        h('p', { class: 'eyebrow' }, ap ? `${KIND_LABEL[k]} · ${ap.name}` : KIND_LABEL[k]),
        h('h2', {}, h('span', { class: 'swatch', style: `--c: var(--c-${st.colour.token})` }), st.name),
        k === 'brain' ? h('p', { class: 'aside schematic-note' }, 'A template brain fitted into this skull and its arteries, not this patient’s own: the gyri and sulci are the template’s.') : null,
        k === 'hindbrain' || k === 'ventricle' ? h('p', { class: 'aside schematic-note' }, 'One adult’s anatomical model (Z-Anatomy) fitted into this skull and around its arteries, not this patient’s own.') : null,
        h('dl', {},
          k === 'removed' && st.approach ? [h('dt', {}, 'Volume'), h('dd', {}, `${APPROACH_GEOM[st.approach]?.removedMl} ml, measured on the model.`)] : null,
          k === 'brain' && st.name === 'Insula' ? [h('dt', {}, 'Notes'), h('dd', {}, this.claims(INSULA))] : null,
          (k === 'hindbrain' || k === 'ventricle') && definitionFor(st.name) ? [h('dt', {}, 'Definition'), h('dd', {}, h('p', {}, definitionFor(st.name)!.text),
            h('p', { class: 'aside' }, 'From Wikipedia (CC BY-SA 3.0), as shipped with Z-Anatomy; not checked against the literature.'))] : null,
          h('dt', {}, 'Geometry'), h('dd', {}, `${st.source}. ${st.derivation} `, h('a', { href: '#/credits' }, 'Licence and attribution'))));
    }
    return h('article', { class: 'card sel', style: `--accent: var(--c-${st.colour.token})` }, close,
      h('p', { class: 'eyebrow' }, KIND_LABEL[k]),
      h('h2', {}, h('span', { class: 'swatch', style: `--c: var(--c-${st.colour.token})` }), st.name),
      st.fitted ? h('p', { class: 'aside schematic-note' }, 'Approximate position: carried over from the Z-Anatomy model fitted onto this CT’s skull.') : '',
      st.schematic ? h('p', { class: 'aside schematic-note' }, 'Drawn by rule, not segmented: its course is illustrative.') : '',
      h('dl', {}, ...defBlock,
        notesList(st.name) ? [h('dt', {}, 'Notes'), h('dd', {}, notesList(st.name))] : null,
        SB_MODEL === 'v3' ? this.measured(st.name) : null,
        regions.length ? [h('dt', {}, 'Near (measured in the model)'), h('dd', {}, regions.join('; '))] : null,
        st.type === 'bone' ? [h('dt', {}, 'Labelled landmarks'), h('dd', {}, `${LANDMARKS.filter((l) => l.bone === st.name).length}; open the bone’s group to see them.`)] : null,
        h('dt', {}, 'Geometry'), h('dd', {}, `${st.source}. ${st.derivation} `, h('a', { href: '#/credits' }, 'Licence and attribution'))));
  }

  private claims(cl: ApproachClaim[]): HTMLElement {
    return h('ul', { class: 'evidence' }, ...cl.map((c) => h('li', {}, c.text, ' ', refLinksFrom(APPROACH_REF, c.refIds))));
  }

  /** The surgical view's sliders: one per shape of the brain it offers (named morph targets of the brain and of the
   * arteries that move with it). */
  private openingSliders(g: SbGroup): HTMLElement {
    const slider = (name: string) => {
      const ui = MORPH_UI[name];
      const id = `sb-m-${name}`;
      const pct = Math.round((this.s.morphs[name] ?? 0) * 100);
      const out = h('output', { for: id, class: 'open-out' }, `${pct} %`);
      const input = h('input', {
        type: 'range', id, min: 0, max: 100, step: 1, value: pct, 'aria-describedby': `${id}-note`, 'data-morph': name,
        oninput: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value);
          out.textContent = `${v} %`;
          this.update((st) => { st.morphs = { ...st.morphs, [name]: v / 100 }; });
        },
      });
      const note = ui.note();
      return [h('label', { for: id, class: 'chips-label' }, `${ui.label} (${ui.key.toUpperCase()})`), h('div', { class: 'open-row' }, input, out),
        note ? h('p', { class: 'aside', id: `${id}-note` }, note) : null];
    };
    return h('div', { class: 'open-slider' }, ...(g.morphs ?? []).flatMap(slider),
      h('p', { class: 'aside' }, 'Illustrative shapes, not measured retractions. The arteries stay where they are, except on the brain being moved, which they follow.'));
  }

  /** The surgical view's card: the sourced description, what this model measures, and how it was drawn here. */
  private approachBody(aid: string): HTMLElement[] {
    const ap = APPROACH.get(aid);
    const geom = APPROACH_GEOM[aid];
    const b = V3_FIT.brain;
    if (!ap || !geom) return [];
    const pctOf = (x: number) => `${Math.round(x * 100)} %`;
    const measured = (m: ApproachSection['measured']) => {
      if (!b || !m) return null;
      if (m === 'm1') return h('p', { class: 'aside' }, `On this CT: the M1 segment as TopBrain labels it measures ${fmtMm(b.m1LengthMm.R)} mm on the right (${fmtMm(b.m1LengthMm.L)} mm on the left), along its centre line. TopBrain’s labels stop at M3, so the cortical (M4) branches are not shown.`);
      if (m === 'tonsils') {
        const p = V3_FIT.pfossa;
        return p ? h('p', { class: 'aside' }, `In this model the tonsils lie ${fmtMm(p.telovelar.tonsilToMedullaMm.rest)} mm from the medulla at their closest, ${fmtMm(p.telovelar.tonsilToMedullaMm.moved)} mm when drawn apart.`) : null;
      }
      const third = b.aca.a3.includes('third');
      const sides = b.aca.a3.filter((x) => x !== 'third').map((x) => (x === 'R' ? 'the right' : 'the left'));
      return h('p', { class: 'aside' }, `On this CT TopBrain labels an A3 segment on ${sides.join(' and ') || 'neither side'}${third ? `, and a third anterior cerebral artery (A2 and A3) between the two, ${b.aca.thirdA2ToAcomMm === 0 ? 'its A2 starting at the anterior communicating artery (the labels touch), as the accessory (median) artery the sources describe does' : `its A2 starting ${fmtMm(b.aca.thirdA2ToAcomMm ?? 0)} mm from the anterior communicating artery`}` : ''}. The labels stop at A3, so the callosomarginal and cortical branches are not shown.`);
    };
    return [
      h('dl', {},
        ...ap.sections.map((x) => [h('dt', {}, x.title), h('dd', {}, this.claims(x.claims), measured(x.measured))]),
        h('dt', {}, 'How the craniotomy is drawn'), h('dd', {}, geom.how, ` Bone removed: ${geom.removedMl} ml (right side), drawn see-through.`),
        ap.brain === 'hindbrain' && V3_FIT.pfossa ? [h('dt', {}, 'How the cerebellum and brainstem are fitted'), h('dd', {}, (() => {
          const p = V3_FIT.pfossa!;
          return `Z-Anatomy’s model (one adult) carried onto this CT by the fit of that model to its bones, then deformed smoothly to fit its posterior fossa: the hull ${fmtMm(p.params.tableGapMm)} mm inside the cavity behind the petrous bones (median error ${fmtMm(p.fit.tableMedianMm)} mm), this patient’s basilar, vertebral, superior and posterior inferior cerebellar arteries outside it (${pctOf(p.fit.before.vesselInsideShare)} of their centre-line points inside before, ${pctOf(p.fit.vesselInsideShare)} after), the tentorium above. The vertices still in an artery’s or the bone’s way were then pushed clear (${p.clear.inVesselAfter} left within an artery’s reach). Its folia and lobules are the model’s.`;
        })())] : null,
        b && ap.brain !== 'hindbrain' ? [h('dt', {}, 'How the brain is fitted'), h('dd', {},
          `A template (the Lead-DBS MNI 2009b pial surface), deformed smoothly to fit this skull: its hull ${fmtMm(b.params.tableGapMm)} mm inside the cranial cavity (median error ${fmtMm(b.fit.tableMedianMm)} mm), every artery this CT labels outside the cortex (${pctOf(b.fit.vesselInCortexShare)} of their centre-line points still inside it before the final clearance, none after), the M2 segments on the insula (median ${fmtMm(b.fit.m2InsulaMedianMmR)} mm on the right) and the M3 segments in the Sylvian fissure (median ${fmtMm(b.fit.m3FissureMedianMmR)} mm). So the template’s fissure lies where this patient’s middle cerebral artery runs, but its gyri are the template’s.`)] : null,
        h('dt', {}, 'Not shown'), h('dd', {}, ap.notShown)),
      h('p', { class: 'aside schematic-note' }, 'Illustrative: drawn by rule on one CT’s skull from the published descriptions, with a template brain; not planned for a patient.'),
    ];
  }

  private landmarkCard(lm: Landmark, close: HTMLElement, defBlock: unknown[], regions: string[]): HTMLElement {
    const bone = SB_MANIFEST.structures.find((s) => s.name === lm.bone && !isApproachPart(s));
    return h('article', { class: 'card sel', style: '--accent: var(--c-ctx)' }, close,
      h('p', { class: 'eyebrow' }, 'Landmark'),
      h('h2', {}, lm.name),
      h('dl', {},
        h('dt', {}, 'Bone'), h('dd', {}, bone ? h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.sel = bone.id; }) }, lm.bone) : lm.bone, lm.part ? ` · ${lm.part}` : ''),
        ...(defBlock as HTMLElement[]),
        regions.length ? [h('dt', {}, 'In regions'), h('dd', {}, regions.join('; '))] : null,
        h('dt', {}, 'Position'), h('dd', {}, `${lm.ras.map(fmtMm).join(', ')} mm (right, anterior, superior of the hypophysial fossa)${SB_MODEL === 'v3' ? '' : `; ${fmtMm(lm.distanceToBoneMm)} mm from the bone surface`}.`),
        lm.how && SB_MODEL !== 'v3' ? [
          h('dt', {}, 'What passes through'), h('dd', {}, h('ul', { class: 'evidence' }, ...(FORAMEN_CONTENTS[lm.name] ?? []).map((c) => h('li', {}, c.text, ' ', refLinksFrom(FORAMEN_REF, c.refIds))))),
          h('dt', {}, 'How it was located'), h('dd', {}, lm.how, ' Nerves, vessels and bone are all the Z-Anatomy model’s.'),
        ] : null,
        lm.how && SB_MODEL === 'v3' ? [h('dt', {}, 'How it was located'), h('dd', {}, lm.how, ' The bone is this CT’s.')] : null,
        notesList(lm.name) ? [h('dt', {}, 'Notes'), h('dd', {}, notesList(lm.name))] : null,
        SB_MODEL === 'v3' ? this.measured(lm.name, lm.side === 'L' ? 'L' : 'R') : null,
        SB_MODEL === 'v3' ? this.crossCheck(lm) : null,
        lm.how ? null : h('dt', {}, 'Source'), lm.how ? null : h('dd', {}, SB_MODEL === 'v3'
          ? `${lm.boneFrom[0].toUpperCase()}${lm.boneFrom.slice(1)} (registered onto this CT; how is on the Sources page).`
          : SB_MODEL === 'ct'
          ? 'Z-Anatomy label point, fitted onto this CT’s skull with the model (approximate) and moved onto its bone where it lay on it.'
          : 'Z-Anatomy label point, anchored to the bone in the model.')));
  }

  /** v3: what this model measures for a structure or landmark, next to the published values on its notes. */
  private measured(name: string, side?: 'L' | 'R'): HTMLElement[] | null {
    const sides = side ? [side] : (['R', 'L'] as const);
    const seg = V3_FIT.facialSegmentsMm, rel = V3_FIT.relationsMm;
    let rows: string[] = [];
    if (name === 'Facial nerve (VII)') rows = sides.map((sd) => `${SIDE_NAME[sd]}: labyrinthine ${fmtMm(seg[sd].labyrinthine)} mm, tympanic ${fmtMm(seg[sd].tympanic)} mm, mastoid ${fmtMm(seg[sd].mastoid)} mm; second genu ${seg[sd].secondGenuAngle}°`);
    else if (name === 'Geniculate ganglion') rows = sides.map((sd) => `${SIDE_NAME[sd]}: ${fmtMm(rel[sd].geniculateToCochlea)} mm from the cochlea, ${fmtMm(rel[sd].geniculateToSuperiorCanal)} mm from the top of the superior semicircular canal`);
    else if (name === 'Greater petrosal nerve') rows = sides.map((sd) => `${SIDE_NAME[sd]}: drawn ${fmtMm(rel[sd].gspnLength)} mm long; its centre line comes within ${fmtMm(rel[sd].gspnToCarotid)} mm of the carried-over petrous carotid`);
    if (!rows.length) return null;
    return [h('dt', {}, 'On this model'), h('dd', {}, h('ul', { class: 'evidence' }, ...rows.map((r) => h('li', {}, r))),
      h('p', { class: 'aside' }, 'Measured on the registered specimen (centre lines and nearest surfaces), so they are this ear’s values, not averages.'))];
  }

  /** v3: where two other OpenEar ears, registered the same way, put this landmark. */
  private crossCheck(lm: Landmark): HTMLElement[] | null {
    const side = lm.side === 'L' ? 'L' : 'R';
    const rows = Object.entries(V3_FIT.crossCheck[side] ?? {}).map(([spec, r]) => r.failed || !r.distanceMm
      ? `${spec}: its registration failed on this side (correlation ${r.correlation}), so it is not compared`
      : r.distanceMm[lm.name] !== undefined ? `${spec}: ${fmtMm(r.distanceMm[lm.name])} mm away` : null).filter((r): r is string => !!r);
    if (!rows.some((r) => r.includes('mm away'))) return null;
    return [h('dt', {}, 'Another ear'), h('dd', {}, h('ul', { class: 'evidence' }, ...rows.map((r) => h('li', {}, r))),
      h('p', { class: 'aside' }, 'Two other OpenEar specimens registered onto this CT the same way: how far from this point their own landmark falls.'))];
  }

  /** v3 overview: how well the specimen fits each ear. */
  private fitReport(): HTMLElement {
    const f = V3_FIT.fit;
    return h('div', {},
      h('p', { class: 'aside' }, 'Registration (pipeline/skullbase_v3.py): ',
        (['R', 'L'] as const).map((sd) => `${SIDE_NAME[sd]} ear: correlation of bone ${f[sd].correlation}, scale ${f[sd].scale}${f[sd].mirrored ? ', mirrored' : ''}; the meatus’ contents fall at ${f[sd].checksHU['Nerves in the internal acoustic meatus (VII, VIII)']} HU (fluid) and the carotid at ${f[sd].checksHU['Internal carotid artery (petrous part)']} HU (the contrast-filled lumen) on the CT`).join('. '), '.'),
      h('p', { class: 'aside' }, 'The bone and the TopBrain vessels are this CT’s; the facial nerve, the meatus’ nerves, the inner ear, ossicles, tympanic membrane and petrous carotid are the specimen’s, which is a different person: expect a millimetre or two of difference from where this patient’s own are. The greater petrosal nerve is drawn by rule.'));
  }

  // ---------------------------------------------------------------- legend, labels, readout
  private renderLegend(): void {
    const p = this.viewer.currentPlan();
    clear(this.legend);
    if (!p) return;
    const hidden = new Set(this.s.hidden);
    const kinds = new Map<string, string[]>();
    for (const id of [...p.looks].filter(([id, l]) => (l === 'primary' || (l === 'ghost' && SB.get(id)?.approach)) && ['soft', 'tube'].includes(SB.get(id)?.type ?? '')).map(([id]) => id)) {
      const k = KIND_LABEL[kindOf(SB.get(id)!)];
      kinds.set(k, [...(kinds.get(k) ?? []), id]);
    }
    const row = (cls: string, token: string, text: string, ids: string[]) => {
      const off = ids.every((x) => hidden.has(x));
      return h('li', { class: off ? 'off' : '' },
        h('button', {
          type: 'button', class: 'eye', 'aria-pressed': String(!off), title: off ? 'Show' : 'Hide', 'aria-label': `${off ? 'Show' : 'Hide'} ${text}`,
          onclick: () => this.update((s) => { s.hidden = off ? s.hidden.filter((x) => !ids.includes(x)) : [...new Set([...s.hidden, ...ids])]; }),
        }, eyeIcon(!off)),
        h('span', { class: `sw ${cls}`, style: `--c: var(--c-${token})` }), h('span', { class: 'lg-text' }, text));
    };
    const bones = [...p.looks].filter(([id, l]) => l !== 'hidden' && SB.get(id)?.type === 'bone').map(([id]) => id);
    if (this.s.layers.nuclei.on && bones.length) this.legend.append(row('solid', 'sbBone', `Bones (${bones.length})`, bones));
    for (const [k, ids] of kinds) {
      this.legend.append(row(k === 'Soft tissue' ? 'patch' : 'solid', tokenOf(ids[0]), `${KIND_PLURAL[k] ?? k} (${ids.length})`, ids));
      if (k !== KIND_LABEL.nerve && k !== KIND_LABEL.artery) continue;
      // each cranial nerve (I-XII) and each artery system on its own row, with its branches
      for (const sg of subgroups(k === KIND_LABEL.nerve ? 'nerve' : 'artery', ids)) {
        const r = row('solid', tokenOf(sg.members[0]), subLabel(sg), sg.members);
        r.classList.add('lg-sub');
        this.legend.append(r);
      }
    }
    if (p.markers.length && this.s.layers.targets.on) this.legend.append(row('dot', 'ctx', `Landmarks (${p.markers.length})`, p.markers.map((m) => m.targetId)));
    if (this.s.hidden.length) this.legend.append(h('li', { class: 'lg-actions' }, h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.hidden = []; }) }, `Show all (${this.s.hidden.length} hidden)`)));
  }

  private placeLabels(): void {
    drawGizmo(this.gizmo, this.viewer.axesScreen());
    const mode = this.s?.labels ?? 'hover';
    const items: LabelItem[] = [];
    const have = new Set<string>();
    const add = (id: string, text: string, ax: number, ay: number, cls: string) => { if (!have.has(id)) { have.add(id); items.push({ id, text, ax, ay, cls }); } };
    if (mode === 'all') {
      for (const m of this.viewer.markerScreen()) add(m.id, LM.get(m.id)?.name ?? '', m.x, m.y, 'mlabel');
      // vessels and nerves are named in the regions (in the system groups there would be too many)
      if (SB_GROUP.get(this.s.grp)?.kind === 'region') for (const p of this.viewer.structureScreen()) if (SB.get(p.id)?.type === 'tube') add(p.id, nameOf(p.id), p.x, p.y, 'slabel primary');
    }
    if (mode !== 'off') for (const id of [this.legendHover, this.s?.sel]) {
      if (!id || have.has(id)) continue;
      const a = this.viewer.anchorFor(id);
      if (a) add(id, nameOf(id), a.x, a.y, LM.has(id) ? 'mlabel' : 'slabel primary');
    }
    layoutLabels(items, this.stage.clientWidth, this.stage.clientHeight, this.labels, this.leaders);
  }

  private showTip(info: PickInfo | null, x: number, y: number): void {
    if (!info) { this.tip.hidden = true; return; }
    const r = this.stage.getBoundingClientRect();
    this.tip.hidden = false;
    this.tip.textContent = info.name + (info.side && info.kind === 'structure' ? (info.side === 'L' ? ' (left)' : ' (right)') : '');
    this.tip.style.transform = `translate(${Math.round(x - r.left + 14)}px, ${Math.round(y - r.top + 14)}px)`;
  }

  private showReadout(ras: THREE.Vector3 | null): void {
    if (!ras) return;
    clear(this.readout);
    this.readout.append(h('span', { class: 'k' }, 'From the hypophysial fossa'), ` x ${fmtMm(ras.x)}  y ${fmtMm(ras.y)}  z ${fmtMm(ras.z)} mm`);
  }

  private toggleMeasure(): void {
    const on = this.measureBtn.getAttribute('aria-pressed') !== 'true';
    this.measureBtn.setAttribute('aria-pressed', String(on));
    this.viewer.setMeasuring(on);
    this.measurePts = [];
    this.measureOut.hidden = !on;
    this.measureOut.textContent = on ? 'Click or tap two points on any bone, vessel or nerve.' : '';
  }

  private showMeasure(): void {
    const [a, b] = this.measurePts;
    this.measureOut.hidden = false;
    if (!b) { this.measureOut.textContent = `Point A: ${[a.x, a.y, a.z].map(fmtMm).join(', ')}. Pick point B.`; return; }
    this.measureOut.textContent = `Distance ${fmtMm(a.distanceTo(b))} mm (in this model)`;
  }

  private async copyLink(btn: HTMLElement): Promise<void> {
    try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Link copied'; }
    catch { window.prompt('Copy this link', location.href); }
    setTimeout(() => { btn.textContent = 'Copy link'; }, 1600);
  }

  // ---------------------------------------------------------------- layers and cut
  private renderLayers(): void {
    const pane = this.tabs.layers;
    const s = this.s;
    if (!pane.childElementCount) {
      const rows = LAYERS.map(([k, label]) => h('div', { class: 'layer', 'data-layer': k },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e: Event) => this.update((st) => { st.layers[k].on = (e.target as HTMLInputElement).checked; }) }), label),
        h('label', { class: 'range' }, h('span', { class: 'vh' }, `${label} opacity`),
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, oninput: (e: Event) => this.update((st) => { st.layers[k].opacity = parseFloat((e.target as HTMLInputElement).value); }) }))));
      const out = h('output', { class: 'mm', 'data-k': 'cz-out' });
      pane.append(h('h3', {}, 'Layers'), ...rows,
        h('p', { class: 'aside' }, 'Lower the bone opacity to see vessels and nerves inside the canals.'),
        h('h3', {}, 'Cut away'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-k': 'cz-on', onchange: (e: Event) => this.update((st) => { st.cutAbove = (e.target as HTMLInputElement).checked ? (st.cutAbove ?? FLOOR_CUT_MM) : null; }) }), 'Remove everything above a height'),
        h('label', { class: 'range wide' }, h('span', {}, 'z = ', out, ' (from the hypophysial fossa)'),
          h('input', { type: 'range', min: -60, max: 90, step: 1, 'data-k': 'cz', oninput: (e: Event) => this.update((st) => { st.cutAbove = parseFloat((e.target as HTMLInputElement).value); }) })),
        h('fieldset', { class: 'seg-field' }, h('legend', {}, 'Cut away a side'),
          ...([['none', 'Nothing'], ['L', 'Left half'], ['R', 'Right half']] as const).map(([v, label]) =>
            h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'sbcut', value: v, onchange: () => this.update((st) => { st.cutSide = v; }) }), label))));
    }
    for (const [k] of LAYERS) {
      const row = pane.querySelector(`[data-layer="${k}"]`)!;
      (row.querySelector('input[type=checkbox]') as HTMLInputElement).checked = s.layers[k].on;
      (row.querySelector('input[type=range]') as HTMLInputElement).value = String(s.layers[k].opacity);
    }
    (pane.querySelector('[data-k=cz-on]') as HTMLInputElement).checked = s.cutAbove !== null;
    const cz = pane.querySelector('[data-k=cz]') as HTMLInputElement;
    cz.disabled = s.cutAbove === null;
    cz.value = String(s.cutAbove ?? FLOOR_CUT_MM);
    (pane.querySelector('[data-k=cz-out]') as HTMLOutputElement).textContent = s.cutAbove === null ? 'off' : `${fmtMm(s.cutAbove)} mm`;
    pane.querySelectorAll<HTMLInputElement>('input[name=sbcut]').forEach((r) => { r.checked = r.value === s.cutSide; });
  }

  // ---------------------------------------------------------------- keyboard
  handleKey(e: KeyboardEvent): boolean {
    const k = e.key;
    const preset = PRESETS.find((p) => p[2] === k);
    if (preset) { this.update((s) => { s.cam = { preset: preset[0] }; }, { camera: true }); return true; }
    if (k === 'h' || k === 'H') { this.update((s) => { s.hemi = s.hemi === 'both' ? 'L' : s.hemi === 'L' ? 'R' : 'both'; }); return true; }
    if (k === 'm' || k === 'M') { this.toggleMeasure(); return true; }
    if (k === 'n' || k === 'N') { this.update((s) => { s.labels = s.labels === 'hover' ? 'all' : s.labels === 'all' ? 'off' : 'hover'; }); return true; }
    if (k === 'c' || k === 'C') { this.update((s) => { s.cutAbove = s.cutAbove === null ? FLOOR_CUT_MM : null; }); return true; }
    // a surgical view: each shape's key opens or closes it; [ and ] step the first one by a tenth
    const morphs = SB_GROUP.get(this.s.grp)?.morphs ?? [];
    const hit = morphs.find((n) => MORPH_UI[n].key === k.toLowerCase());
    if (hit) { this.update((s) => { s.morphs = { ...s.morphs, [hit]: (s.morphs[hit] ?? 0) > 0 ? 0 : 1 }; }); return true; }
    if (morphs.length && (k === '[' || k === ']')) {
      const n = morphs[0];
      this.update((s) => { s.morphs = { ...s.morphs, [n]: Math.min(1, Math.max(0, Math.round(((s.morphs[n] ?? 0) + (k === ']' ? 0.1 : -0.1)) * 10) / 10)) }; });
      return true;
    }
    if (k === 'Escape') {
      if (this.measureBtn.getAttribute('aria-pressed') === 'true') { this.toggleMeasure(); return true; }
      if (this.s.sel) { this.update((s) => { s.sel = null; }); return true; }
    }
    return false;
  }

  onShow(): void { this.viewer.invalidate(); }
}
