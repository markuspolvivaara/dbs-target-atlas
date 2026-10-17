import * as THREE from 'three';
import type { CameraPreset } from '../data/schema';
import type { Hemi, LayerKey } from '../state';
import { definitionFor, kindOf, LANDMARKS, LM, NOT_YET_SHOWN, REGIONS, SB, SB_MANIFEST, type Landmark } from '../skullbase';
import { FLOOR_CUT_MM, SB_GROUP, SB_GROUPS, type SbGroup } from '../skullbase/groups';
import { skullScene, type SkullPlan } from '../skullbase/scene';
import type { SkullState } from '../skullbase/state';
import { Viewer, type PickInfo } from '../viewer/Viewer';
import { h } from './h';
import { bindSheetDrag, drawGizmo, layoutLabels, type LabelItem } from './stage';
import { chips, clear, eyeIcon, fmtMm } from './widgets';

type Update = (fn: (s: SkullState) => void, opts?: { camera?: boolean }) => void;

const PRESETS: [CameraPreset, string, string, string][] = [
  ['axial', 'From above', '1', 'Above'], ['inferior', 'From below', '2', 'Below'], ['lateral', 'Lateral', '3', 'Lat'],
  ['coronal', 'Anterior', '4', 'Ant'], ['posteriorOblique', 'Post-oblique', '5', 'Obl'],
];
const LAYERS: [LayerKey, string][] = [['nuclei', 'Bones'], ['tracts', 'Vessels and nerves'], ['cortex', 'Soft tissue'], ['targets', 'Landmarks']];
const KIND_LABEL = { bone: 'Bone', soft: 'Soft tissue', artery: 'Artery', vein: 'Vein or dural sinus', nerve: 'Nerve' } as const;
const KIND_PLURAL: Record<string, string> = { 'Soft tissue': 'Soft tissue', Artery: 'Arteries', 'Vein or dural sinus': 'Veins and dural sinuses', Nerve: 'Nerves' };
const GROUP_ROWS: [SbGroup['kind'], string][] = [['overview', 'Overview'], ['region', 'Regions'], ['system', 'Systems'], ['bone', 'Bones and their landmarks']];
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
    const key = `${s.grp}|${s.sel}|${s.hidden.join(',')}`;
    if (key !== this.lastKey || !prev) { this.lastKey = key; this.renderOverview(); }
    this.renderLayers();
    if (prev && prev.sel !== s.sel && s.sel) this.selectTab('overview', false);
  }

  private pickGroup(id: string): void {
    this.update((st) => {
      const g = SB_GROUP.get(id)!;
      st.grp = id; st.hemi = g.hemi; st.cutAbove = g.cutAbove; st.cam = { preset: null }; st.hidden = []; st.sel = null;
    }, { camera: true });
  }

  private renderOverview(): void {
    const s = this.s;
    const pane = this.tabs.overview;
    // the lists re-render on every toggle: keep the reader's place
    const keep = [pane.scrollTop, this.panel.scrollTop];
    requestAnimationFrame(() => { pane.scrollTop = keep[0]; this.panel.scrollTop = keep[1]; });
    clear(pane);
    const g = SB_GROUP.get(s.grp)!;
    for (const [kind, label] of GROUP_ROWS) {
      pane.append(h('p', { class: 'chips-label' }, label),
        chips(SB_GROUPS.filter((x) => x.kind === kind).map((x) => [x.id, x.name]), g.id, (v) => this.pickGroup(v), { label, cls: 'grp-chips' }));
    }
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
    // vessels, nerves and soft tissue: one list per kind; cranial nerves in order I-XII, each under its own heading
    for (const k of ['nerve', 'artery', 'vein', 'soft'] as const) {
      const ids = g.structures.filter((id) => { const st = SB.get(id); return st && st.type !== 'bone' && kindOf(st) === k; });
      if (!ids.length) continue;
      pane.append(listHead(KIND_PLURAL[KIND_LABEL[k]] ?? KIND_LABEL[k], ids));
      if (k !== 'nerve') { pane.append(h('div', { class: 'chips wrap sb-list' }, ...ids.map(entry))); continue; }
      for (const [cn, members] of byCranialNerve(ids)) {
        if (members.length === 1) { // a nerve without separate branches: one row
          pane.append(h('div', { class: 'cn-head single' }, h('span', { class: 'cn-num' }, cn <= 12 ? ROMAN[cn - 1] : ''), entry(members[0])));
          continue;
        }
        pane.append(h('div', { class: 'cn-head' }, h('span', { class: 'cn-num' }, ROMAN[cn - 1]), eye(members, `cranial nerve ${ROMAN[cn - 1]}`),
          h('span', {}, `${cnName(cn, members)} and branches`)),
          h('div', { class: 'chips wrap sb-list cn-list' }, ...members.map(entry)));
      }
    }
    if (boneIds.length && g.kind !== 'overview') pane.append(h('p', { class: 'chips-label' }, 'Bones'), h('div', { class: 'chips wrap sb-list' }, ...boneIds.map((id) => btn(id))));
    if (g.landmarks.length) pane.append(h('p', { class: 'chips-label' }, `Landmarks (${g.landmarks.length})`), h('div', { class: 'chips wrap sb-list' }, ...g.landmarks.map((id) => btn(id))));
    if (s.sel) pane.append(this.card(s.sel));
    const groupCard = h('article', { class: 'card' },
      h('p', { class: 'eyebrow' }, GROUP_ROWS.find(([k]) => k === g.kind)![1]),
      h('h2', {}, g.name),
      h('p', {}, g.description),
      g.kind === 'overview' ? [
        h('p', { class: 'aside' }, 'Not yet shown (Z-Anatomy does not label these; they will be added from a labelled source): ', NOT_YET_SHOWN.join(', '), '.'),
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
    return h('article', { class: 'card sel', style: `--accent: var(--c-${st.colour.token})` }, close,
      h('p', { class: 'eyebrow' }, KIND_LABEL[k]),
      h('h2', {}, h('span', { class: 'swatch', style: `--c: var(--c-${st.colour.token})` }), st.name),
      h('dl', {}, ...defBlock,
        regions.length ? [h('dt', {}, 'Near (measured in the model)'), h('dd', {}, regions.join('; '))] : null,
        st.type === 'bone' ? [h('dt', {}, 'Labelled landmarks'), h('dd', {}, `${LANDMARKS.filter((l) => l.bone === st.name).length}; open the bone’s group to see them.`)] : null,
        h('dt', {}, 'Geometry'), h('dd', {}, `${st.source}. ${st.derivation} `, h('a', { href: '#/credits' }, 'Licence and attribution'))));
  }

  private landmarkCard(lm: Landmark, close: HTMLElement, defBlock: unknown[], regions: string[]): HTMLElement {
    const bone = SB_MANIFEST.structures.find((s) => s.name === lm.bone);
    return h('article', { class: 'card sel', style: '--accent: var(--c-ctx)' }, close,
      h('p', { class: 'eyebrow' }, 'Landmark'),
      h('h2', {}, lm.name),
      h('dl', {},
        h('dt', {}, 'Bone'), h('dd', {}, bone ? h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.sel = bone.id; }) }, lm.bone) : lm.bone, lm.part ? ` · ${lm.part}` : ''),
        ...(defBlock as HTMLElement[]),
        regions.length ? [h('dt', {}, 'In regions'), h('dd', {}, regions.join('; '))] : null,
        h('dt', {}, 'Position'), h('dd', {}, `${lm.ras.map(fmtMm).join(', ')} mm (right, anterior, superior of the hypophysial fossa); ${fmtMm(lm.distanceToBoneMm)} mm from the bone surface.`),
        h('dt', {}, 'Source'), h('dd', {}, 'Z-Anatomy label point, anchored to the bone in the model.')));
  }

  // ---------------------------------------------------------------- legend, labels, readout
  private renderLegend(): void {
    const p = this.viewer.currentPlan();
    clear(this.legend);
    if (!p) return;
    const hidden = new Set(this.s.hidden);
    const kinds = new Map<string, string[]>();
    for (const id of [...p.looks].filter(([id, l]) => l === 'primary' && ['soft', 'tube'].includes(SB.get(id)?.type ?? '')).map(([id]) => id)) {
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
      if (k !== KIND_LABEL.nerve) continue;
      // each cranial nerve on its own row (with its branches), I-XII
      for (const [cn, members] of byCranialNerve(ids)) {
        const r = row('solid', tokenOf(members[0]), `${cn <= 12 ? ROMAN[cn - 1] + ' ' : ''}${cnName(cn, members)}${members.length > 1 ? ` (+${members.length - 1} branches)` : ''}`, members);
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
    if (k === 'Escape') {
      if (this.measureBtn.getAttribute('aria-pressed') === 'true') { this.toggleMeasure(); return true; }
      if (this.s.sel) { this.update((s) => { s.sel = null; }); return true; }
    }
    return false;
  }

  onShow(): void { this.viewer.invalidate(); }
}
