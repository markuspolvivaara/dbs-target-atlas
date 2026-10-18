import * as THREE from 'three';
import type { CameraPreset } from '../data/schema';
import type { Hemi } from '../state';
import { discBelow, LEVEL_ORDER, SP, SP_MANIFEST, SP_REFS, vertebraOf } from '../spine';
import {
  ACDF_STATEMENTS, affectedRoot, APPROACH_STATEMENTS, APPROACHES, exitingRoot, exposureRegion, GEOM_BY_LEVEL, LESION_ZONES, NECK_LANDMARKS,
  ROOT_FUNCTION, STATEMENTS, VERTEBRAL_ARTERY, type ApproachId, type LesionZone, type LevelGeom, type Statement,
} from '../spine/content';
import { bodyChart } from './body-chart';
import { ScrewPanel } from './spine-screw';
import published from '../data/generated/spine-published.json';
import { SCREW_LEVELS } from '../spine/screw';
import { refLinksFrom } from './reflinks';
import { REGION, REGIONS } from '../spine/regions';
import { spineScene, type SpinePlan } from '../spine/scene';
import type { SpineState } from '../spine/state';
import { Viewer, type PickInfo } from '../viewer/Viewer';
import { h } from './h';
import { bindSheetDrag, drawGizmo, layoutLabels, type LabelItem } from './stage';
import { chips, clear, eyeIcon, fmtMm } from './widgets';

type Update = (fn: (s: SpineState) => void, opts?: { camera?: boolean }) => void;
type SpineLayer = 'nuclei' | 'discs' | 'tracts' | 'vessels' | 'viscera';

const PRESETS: [CameraPreset, string, string, string][] = [
  ['lateral', 'Lateral', '1', 'Lat'], ['posteriorOblique', 'Post-oblique', '2', 'Obl'], ['coronal', 'Anterior', '3', 'Ant'],
  ['axial', 'From above', '4', 'Above'], ['inferior', 'From below', '5', 'Below'],
];
const LAYERS: [SpineLayer, string][] = [['nuclei', 'Bone'], ['discs', 'Discs'], ['tracts', 'Neural'], ['vessels', 'Vessels'], ['viscera', 'Viscera and muscles']];
/** list sections of the panel and legend, by category */
const GROUPS: [string, string, string[]][] = [
  ['bone', 'Bone', ['vertebra', 'bone']], ['disc', 'Discs', ['disc']], ['neural', 'Neural', ['neural']],
  ['root', 'Roots and ganglia (schematic)', ['root', 'ganglion']], ['vessel', 'Vessels', ['vessel']],
  ['soft', 'Viscera and muscles', ['viscera', 'muscle']],
];
const nameOf = (id: string) => SP.get(id)?.name ?? id;
const tokenOf = (id: string) => SP.get(id)?.colour.token ?? 'ctx';

/** The 3D page of the spine section: regions, levels, structure cards, layers. */
/** Whether a structure is not drawn: hidden on its own, or on a layer that is off (the neck's vessels and viscera
 * start off). */
function offTest(s: SpineState): (id: string) => boolean {
  const hidden = new Set(s.hidden);
  return (id) => {
    const layer = SP.get(id)?.layer as keyof SpineState['layers'] | undefined;
    return hidden.has(id) || (!!layer && s.layers[layer]?.on === false);
  };
}
/** Show or hide structures from their eye buttons: showing also turns their layers on. */
function showIds(st: SpineState, ids: string[], on: boolean): void {
  if (!on) { st.hidden = [...new Set([...st.hidden, ...ids])]; return; }
  st.hidden = st.hidden.filter((x) => !ids.includes(x));
  for (const id of ids) {
    const layer = SP.get(id)?.layer as keyof SpineState['layers'] | undefined;
    if (layer && st.layers[layer] && !st.layers[layer]!.on) st.layers[layer]!.on = true;
  }
}

/** A camera in front of the disc and 20 deg (a drawing choice) towards the approach side, a little from above. */
function acdfCamera(g: LevelGeom, side: 'L' | 'R'): SpineState['cam'] {
  const t = g.discCentre;
  const a = (20 * Math.PI) / 180, sx = side === 'L' ? -1 : 1, d = 260;
  return { preset: null, pos: [t[0] + sx * d * Math.sin(a), t[1] + d * Math.cos(a), t[2] + 30], tgt: [...t] };
}

/** A camera behind the disc and `deg` towards the approach side, a little from above. */
function approachCamera(g: LevelGeom, deg: number, side: 'L' | 'R'): SpineState['cam'] {
  const t = g.discCentre;
  const a = (deg * Math.PI) / 180, sx = side === 'L' ? -1 : 1, d = 230;
  return { preset: null, pos: [t[0] + sx * d * Math.sin(a), t[1] - d * Math.cos(a), t[2] + 30], tgt: [...t] };
}

export class SpineAtlasPage {
  readonly el: HTMLElement;
  viewer!: Viewer<SpineState, SpinePlan>;
  private s!: SpineState;
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
  private legendHover: string | null = null;
  private screw!: ScrewPanel;

  constructor(private update: Update) {
    this.stage = h('section', { class: 'stage', 'aria-label': '3D viewer' });
    this.panel = h('aside', { class: 'panel', 'aria-label': 'Anatomy and tools', 'data-sheet': 'peek' });
    this.el = h('div', { class: 'atlas' }, this.stage, this.panel);
    this.buildStage();
    this.buildPanel();
    this.screw = new ScrewPanel(this.update, (objs) => this.viewer.setOverlay(objs), nameOf);
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
      ...([['all', 'All', 'Name the vertebrae of the region'], ['hover', 'Hover', 'Name only what you point at or select'], ['off', 'Off', 'No name labels']] as const)
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

    this.viewer = new Viewer<SpineState, SpinePlan>(host, {
      hover: (info, x, y) => this.showTip(info, x, y),
      pick: (info) => { if (info.id && info.kind === 'structure') this.update((s) => { s.sel = s.sel === info.id ? null : info.id; }); },
      readout: (ras) => this.showReadout(ras),
      measure: (pts) => { this.measurePts = pts; this.showMeasure(); },
      cameraChanged: (pos, tgt) => this.update((s) => {
        s.cam = { preset: s.cam.preset, pos: [pos.x, pos.y, pos.z], tgt: [tgt.x, tgt.y, tgt.z] };
      }, { camera: false }),
      leadMoved: () => undefined,
      status: (t) => { this.status.hidden = !t; this.status.textContent = t ?? ''; },
      lead: () => undefined,
      moving: (on) => this.stage.classList.toggle('moving', on),
    }, spineScene);
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
  render(s: SpineState, opts: { camera: boolean }): void {
    const prev = this.s;
    this.s = s;
    this.viewer.apply(s, { animateCamera: opts.camera }).then(() => this.renderLegend());
    this.stage.querySelectorAll<HTMLButtonElement>('[data-hemi]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hemi === s.hemi)));
    this.stage.querySelectorAll<HTMLButtonElement>('.toolbar [data-labels]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.labels === s.labels)));
    this.stage.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.toggleAttribute('data-active', b.dataset.preset === s.cam.preset));
    const key = `${s.region}|${s.level}|${s.sel}|${s.hidden.join(',')}|${JSON.stringify(s.lesion)}|${s.cut}|${s.screw?.tech}|${s.screw?.side}|${JSON.stringify(s.approach)}|${Object.values(s.layers).map((l) => (l?.on ? 1 : 0)).join('')}`;
    if (key !== this.lastKey || !prev) { this.lastKey = key; this.renderOverview(); }
    this.screw.render(s);
    this.renderLayers();
    if (prev && prev.sel !== s.sel && s.sel) this.selectTab('overview', false);
  }

  private renderOverview(): void {
    const s = this.s;
    const pane = this.tabs.overview;
    const keep = [pane.scrollTop, this.panel.scrollTop];
    requestAnimationFrame(() => { pane.scrollTop = keep[0]; this.panel.scrollTop = keep[1]; });
    clear(pane);
    const r = REGION.get(s.region)!;
    pane.append(h('p', { class: 'chips-label' }, 'Region'),
      h('div', { class: 'chips grp-chips', role: 'group', 'aria-label': 'Region' }, ...REGIONS.map((x) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(x.id === r.id), 'data-v': x.id, disabled: !x.ready,
        title: x.ready ? undefined : 'Not built yet', onclick: () => this.update((st) => { st.region = x.id; st.level = null; st.lesion = null; st.screw = null; st.approach = null; st.sel = null; st.cam = { preset: null }; }, { camera: true }),
      }, x.name, x.ready ? '' : ' (later)'))));
    pane.append(h('p', { class: 'chips-label' }, 'Level'),
      chips<string>([['all', 'All'], ...r.levels.map((l): [string, string] => [l, l])], s.level ?? 'all',
        (v) => this.update((st) => { st.level = v === 'all' ? null : v; st.lesion = null; st.screw = null; st.approach = null; st.sel = null; st.cam = { preset: null }; }, { camera: true }), { label: 'Level', cls: 'grp-chips level-chips' }));
    if (s.sel) pane.append(this.card(s.sel));
    else if (s.level) pane.append(this.levelCard(s.level));
    // structures of the region by category, each with a show / hide toggle
    const isOff = offTest(s);
    const show = (ids: string[], on: boolean) => this.update((st) => showIds(st, ids, on));
    const eye = (ids: string[], label: string) => {
      const off = ids.every(isOff);
      return h('button', { type: 'button', class: 'eye', 'aria-pressed': String(!off), title: off ? 'Show' : 'Hide', 'aria-label': `${off ? 'Show' : 'Hide'} ${label}`, onclick: () => show(ids, off) }, eyeIcon(!off));
    };
    const entry = (id: string) => h('span', { class: `sb-entry${isOff(id) ? ' off' : ''}` }, eye([id], nameOf(id)),
      h('button', {
        type: 'button', class: 'chip sb-item', 'aria-pressed': String(s.sel === id), 'data-id': id,
        onclick: () => this.update((st) => { st.sel = st.sel === id ? null : id; }),
      }, h('span', { class: 'swatch', style: `--c: var(--c-${tokenOf(id)})` }), nameOf(id)));
    for (const [, label, cats] of GROUPS) {
      // cranial to caudal (a disc by its upper level), then by name
      const rank = (id: string) => {
        const lv = (SP.get(id)?.level ?? '').split('-')[0];
        const i = LEVEL_ORDER.indexOf(lv === 'C8' ? 'C7' : lv);
        return i < 0 ? LEVEL_ORDER.length : i + (lv === 'C8' ? 0.5 : 0);
      };
      const ids = r.structures.filter((id) => cats.includes(SP.get(id)?.category ?? ''))
        .sort((a, b) => rank(a) - rank(b) || nameOf(a).localeCompare(nameOf(b)));
      if (!ids.length) continue;
      pane.append(h('div', { class: 'list-head' }, h('p', { class: 'chips-label' }, `${label} (${ids.length})`),
        h('span', { class: 'list-actions' },
          h('button', { type: 'button', class: 'linklike', onclick: () => show(ids, true) }, 'Show all'),
          h('button', { type: 'button', class: 'linklike', onclick: () => show(ids, false) }, 'Hide all'))),
        h('div', { class: 'chips wrap sb-list' }, ...ids.map(entry)));
    }
    const regionCard = h('article', { class: 'card' },
      h('p', { class: 'eyebrow' }, 'Region'),
      h('h2', {}, `${r.name} spine`),
      h('p', {}, r.description),
      h('p', { class: 'aside' }, SP_MANIFEST.dataset.note));
    if (s.sel || s.level) pane.append(h('details', { class: 'more' }, h('summary', {}, `About the ${r.name.toLowerCase()} region`), regionCard));
    else pane.append(regionCard);
  }

  private stmt(st: Statement): HTMLElement {
    return h('p', {}, st.text, st.refIds.length ? ' ' : '', refLinksFrom(SP_REFS, st.refIds));
  }

  private link(id: string): HTMLElement {
    return h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.sel = id; }) }, nameOf(id));
  }

  private levelCard(level: string): HTMLElement {
    const v = vertebraOf(level);
    const d = discBelow(level);
    const g = GEOM_BY_LEVEL.get(level);
    const next = LEVEL_ORDER[LEVEL_ORDER.indexOf(level) + 1];
    const root = SP.get(`sp_root_${exitingRoot(level).toLowerCase()}`);
    const thoracic = level.startsWith('T');
    const cervical = level.startsWith('C');
    // the lumbar picture of an exiting and a traversing root at each disc; thoracic and cervical levels show the root
    // that leaves there
    const traversing = next && !thoracic && !cervical ? SP.get(`sp_root_${next.toLowerCase()}`) : undefined;
    const mm = (x: number) => `${fmtMm(x)} mm`;
    const fo = (sd: 'L' | 'R') => {
      const f = g?.foramen[sd];
      return f ? `${sd === 'L' ? 'Left' : 'Right'}: height ${mm(f.height)}, greatest antero-posterior extent ${mm(f.width)}, area ${Math.round(f.area)} mm²`
        : `${sd === 'L' ? 'Left' : 'Right'}: not captured by the measurement`;
    };
    return h('article', { class: 'card sel', style: '--accent: var(--c-spBone)' },
      h('p', { class: 'eyebrow' }, 'Level'),
      h('h2', {}, level),
      h('dl', {},
        v ? [h('dt', {}, 'Bone'), h('dd', {}, this.link(v.id))] : null,
        d ? [h('dt', {}, 'Disc below'), h('dd', {}, this.link(d.id), g?.discHeightMm ? ` · ${mm(g.discHeightMm)} high at its centre (measured)` : '',
          g ? h('p', {}, h('button', {
            type: 'button', class: 'chip disc-cut', 'aria-pressed': String(this.s.cut === 'disc'),
            onclick: () => this.update((s) => { s.cut = s.cut === 'disc' ? 'none' : 'disc'; if (s.cut === 'disc') s.cam = { preset: 'axial' }; }, { camera: this.s.cut !== 'disc' }),
          }, 'Cross-section at this disc, from above')) : null)] : null,
        g?.canal ? [h('dt', {}, 'Vertebral canal (measured)'), h('dd', {}, `${mm(g.canal.width)} wide, ${mm(g.canal.depth)} deep, ${Math.round(g.canal.area)} mm², in planes through the body centre normal to the spine`)] : null,
        g && g.foramenMeasured === false && cervical ? [h('dt', {}, `Foramen ${g.pair}`), h('dd', {}, this.stmt(STATEMENTS.cervicalForamen))]
          : g && g.foramenMeasured === false ? [h('dt', {}, `Foramen ${g.pair}`), h('dd', {}, this.stmt(STATEMENTS.thoracicForamen),
          h('p', { class: 'aside' }, 'Its size is not given here: the measurement works on the vertebrae and discs alone, without the rib heads.'))]
          : g ? [h('dt', {}, `Foramen ${g.pair} (measured)`), h('dd', {}, h('ul', { class: 'plain' }, h('li', {}, fo('L')), h('li', {}, fo('R'))))] : null,
        root || traversing ? [h('dt', {}, `${traversing ? 'Roots' : 'Root'} at ${g?.pair ?? level}`), h('dd', {},
          root ? [h('p', {}, 'Exiting: ', this.link(root.id))] : null,
          traversing ? [h('p', {}, 'Traversing: ', this.link(traversing.id))] : null,
          this.stmt(thoracic ? STATEMENTS.thoracicNerve : cervical ? STATEMENTS.cervicalRootRule : STATEMENTS.rootRule))] : null,
        cervical ? [h('dt', {}, 'Foramina transversaria (measured)'), h('dd', {}, this.transverseForamina(level))] : null,
        g?.lesions ? [h('dt', {}, `Disc herniation at ${g.pair}`), h('dd', {}, this.lesionTool(g))] : null,
        SCREW_LEVELS[level] ? [h('dt', {}, 'Virtual screw'), h('dd', {}, this.screw.el)] : null,
        SCREW_LEVELS[level]?.pedicle ? [h('dt', {}, 'Pedicles (measured) and published values'), h('dd', {}, this.morphometry(level))] : null,
        SCREW_LEVELS[level]?.lateralMass ? [h('dt', {}, 'Lateral masses (measured)'), h('dd', {}, this.lateralMasses(level))] : null,
        SCREW_LEVELS[level]?.isthmus ? [h('dt', {}, 'High-riding vertebral artery? (measured)'), h('dd', {}, this.highRiding(level))] : null,
        level === 'C1' || level === 'C2' ? [h('dt', {}, 'Craniocervical junction'), h('dd', {},
          h('p', {}, 'The occiput, the foramen magnum and the arteries and nerves above the atlas are in the ',
            h('a', { href: '../skullbase/' }, 'skull base section'), '.'))] : null,
        thoracic && g ? [h('dt', {}, `Dorsal approach to the ${g.pair} disc`), h('dd', {}, this.approachTool(level, g))] : null,
        cervical && g ? [h('dt', {}, `Anterior approach (ACDF) to the ${g.pair} disc`), h('dd', {}, this.acdfTool(level, g))] : null));
  }

  /** The pedicles measured on this CT beside published values (spine_screw.py, spine_published.py). */
  private morphometry(level: string): HTMLElement {
    const ped = SCREW_LEVELS[level].pedicle!;
    const row = (label: string, l: string, r: string, p: string) => h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, l), h('td', {}, r), h('td', {}, p));
    const deg = (x: number) => `${x.toFixed(1)}°`;
    // the axis into the body, tilted cranially or caudally from the endplate plane
    const sag = (x: number) => (Math.abs(x) < 0.05 ? '0°' : `${Math.abs(x).toFixed(1)}° ${x > 0 ? 'cranial' : 'caudal'}`);
    const head = h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { scope: 'col' }, 'Left'), h('th', { scope: 'col' }, 'Right'), h('th', { scope: 'col' }, 'Published')));
    const measured = (k: 'width' | 'height') => [`${fmtMm(ped.L[k])} mm`, `${fmtMm(ped.R[k])} mm`] as const;
    const chord = row('Chord, entry to anterior cortex', `${fmtMm(ped.L.chord)} mm`, `${fmtMm(ped.R.chord)} mm`, '—');
    if (level === 'C7') {
      const pub = published.cervical.C7;
      const ax = pub.axisJiang;
      const ms = ([m, sd]: number[]) => `${m.toFixed(1)} ± ${sd.toFixed(1)}`;
      const both = (k: 'width' | 'height' | 'length' | 'transverseAngle' | 'sagittalAngle', unit: string) => `${ms(ax[k].L)}${unit} left, ${ms(ax[k].R)}${unit} right (n = ${ax.n})`;
      const tr = Object.values(pub.studyMeans.transverseAngle);
      const sa = Object.values(pub.studyMeans.sagittalAngle);
      return h('div', {},
        h('table', { class: 'morph' }, head,
          h('tbody', {},
            row('Width', ...measured('width'), `screw width ${both('width', ' mm')}`),
            row('Height', ...measured('height'), `sagittal height ${both('height', ' mm')}`),
            row('Transverse angle', deg(ped.L.transverseAngle), deg(ped.R.transverseAngle),
              `${both('transverseAngle', '°')}; ${Math.min(...tr).toFixed(1)} to ${Math.max(...tr).toFixed(1)}° (${tr.length} studies)`),
            row('Sagittal angle', sag(ped.L.sagittalAngle), sag(ped.R.sagittalAngle), `${Math.min(...sa).toFixed(1)} to ${Math.max(...sa).toFixed(1)}° (${sa.length} studies)`),
            row('Chord, entry to anterior cortex', `${fmtMm(ped.L.chord)} mm`, `${fmtMm(ped.R.chord)} mm`, `screw length ${both('length', ' mm')}`))),
        this.stmt(STATEMENTS.pedicleMethod), this.stmt(STATEMENTS.publishedC7));
    }
    if (level.startsWith('T')) {
      type StudyMeans = Record<'widthStudyMeans' | 'heightStudyMeans' | 'transverseAngleStudyMeans' | 'sagittalAngleStudyMeans', Record<string, number>>;
      const pub = (published.thoracic as Record<string, StudyMeans>)[level];
      const span = (o: Record<string, number>, f: (x: number) => string, sep: string) => {
        const v = Object.values(o);
        return `${f(Math.min(...v))}${sep}${f(Math.max(...v))} (${v.length} studies)`;
      };
      const mmf = (x: number) => fmtMm(x);
      const degf = (x: number) => x.toFixed(1);
      return h('div', {},
        h('table', { class: 'morph' }, head,
          h('tbody', {},
            row('Width', ...measured('width'), span(pub.widthStudyMeans, mmf, '–').replace(' (', ' mm (')),
            row('Height', ...measured('height'), span(pub.heightStudyMeans, mmf, '–').replace(' (', ' mm (')),
            row('Transverse angle', deg(ped.L.transverseAngle), deg(ped.R.transverseAngle), span(pub.transverseAngleStudyMeans, degf, ' to ').replace(' (', '° (')),
            row('Sagittal angle', sag(ped.L.sagittalAngle), sag(ped.R.sagittalAngle), span(pub.sagittalAngleStudyMeans, degf, ' to ').replace(' (', '° (')),
            chord)),
        this.stmt(STATEMENTS.pedicleMethod), this.stmt(STATEMENTS.publishedThoracic));
    }
    const pub = (published.levels as Record<string, (typeof published.levels)['L1']>)[level];
    const range = (o: Record<string, number>) => `${fmtMm(Math.min(...Object.values(o)))}–${fmtMm(Math.max(...Object.values(o)))} mm`;
    const ms = ([m, sd]: number[]) => `${m.toFixed(1)} ± ${sd.toFixed(1)}°`;
    const mx = pub.transverseAngleMexico;
    return h('div', {},
      h('table', { class: 'morph' }, head,
        h('tbody', {},
          row('Width', ...measured('width'), `${range(pub.widthRegionalMeans)} (regional means)`),
          row('Height', ...measured('height'), `${range(pub.heightRegionalMeans)} (regional means)`),
          row('Transverse angle', deg(ped.L.transverseAngle), deg(ped.R.transverseAngle),
            `${ms(mx.L)} left, ${ms(mx.R)} right (n = ${mx.n}); ${ms(pub.transverseAngleNigeria.meanSd)} (n = ${pub.transverseAngleNigeria.n})`),
          row('Sagittal angle', sag(ped.L.sagittalAngle), sag(ped.R.sagittalAngle), '—'),
          chord)),
      this.stmt(STATEMENTS.pedicleMethod), this.stmt(STATEMENTS.published));
  }

  /** The C2 isthmus height and the bone over the vertebral artery's groove, beside the usual definition of a
   * high-riding artery. */
  private highRiding(level: string): HTMLElement {
    const m = SCREW_LEVELS[level].isthmus!;
    const row = (label: string, l: string, r: string) => h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, l), h('td', {}, r));
    const verdict = (sd: 'L' | 'R') => (m[sd].isthmusHeight <= 5 || m[sd].groove.height <= 2 ? 'high-riding by the definition' : 'not high-riding by the definition');
    return h('div', {},
      h('table', { class: 'morph' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { scope: 'col' }, 'Left'), h('th', { scope: 'col' }, 'Right'))),
        h('tbody', {},
          row('Isthmus height (≤ 5 mm: high-riding)', `${fmtMm(m.L.isthmusHeight)} mm`, `${fmtMm(m.R.isthmusHeight)} mm`),
          row('Bone over the groove (≤ 2 mm: high-riding)', `${fmtMm(m.L.groove.height)} mm`, `${fmtMm(m.R.groove.height)} mm`),
          row('Foramen transversarium, lateral of the canal', `${fmtMm(m.L.groove.lateralOfCanal)} mm`, `${fmtMm(m.R.groove.lateralOfCanal)} mm`),
          row('On this CT', verdict('L'), verdict('R')))),
      this.stmt(STATEMENTS.hrva), this.stmt(STATEMENTS.hrvaMethod), this.stmt(STATEMENTS.vaHighRiding));
  }

  /** The lateral masses of a subaxial level as measured for the lateral mass screws (spine_screw.py). */
  private lateralMasses(level: string): HTMLElement {
    const lm = SCREW_LEVELS[level].lateralMass!;
    const row = (label: string, l: string, r: string) => h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, l), h('td', {}, r));
    const fac = (x: number[]) => x.map((a) => `${a.toFixed(0)}°`).join(' / ');
    return h('div', {},
      h('table', { class: 'morph' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { scope: 'col' }, 'Left'), h('th', { scope: 'col' }, 'Right'))),
        h('tbody', {},
          row('Width of the posterior face', `${fmtMm(lm.L.width)} mm`, `${fmtMm(lm.R.width)} mm`),
          row('Height (facet line to facet line)', `${fmtMm(lm.L.height)} mm`, `${fmtMm(lm.R.height)} mm`),
          row('Facet joints, inclination (above / below)', fac(lm.L.facetInclination), fac(lm.R.facetInclination)))),
      this.stmt(STATEMENTS.lateralMassMethod));
  }

  /** The foramina transversaria of a cervical level, measured, and whether the vertebral artery runs through them
   * (inferred from their size: those that carry it are larger). */
  private transverseForamina(level: string): HTMLElement {
    const va = VERTEBRAL_ARTERY;
    const tf = va.foramina[level];
    const order = ['C7', 'C6', 'C5', 'C4', 'C3', 'C2', 'C1'];
    const side = (sd: 'L' | 'R') => {
      const f = tf?.[sd];
      const carries = order.indexOf(level) >= order.indexOf(va.entry[sd]);
      const name = sd === 'L' ? 'Left' : 'Right';
      if (!f) return `${name}: none found (the artery enters higher, at ${va.entry[sd]})`;
      return `${name}: ${Math.round(f.area)} mm² enclosed, ${fmtMm(f.width)} × ${fmtMm(f.depth)} mm; ${carries ? (level === va.entry[sd] ? 'the artery enters here (inferred)' : 'carries the artery (inferred)') : 'below the artery’s entry'}`;
    };
    return h('div', {},
      h('ul', { class: 'plain' }, h('li', {}, side('L')), h('li', {}, side('R'))),
      h('p', {}, this.link('sp_vertebral_artery')),
      this.stmt(STATEMENTS.vaEntry),
      level === 'C1' ? this.stmt(STATEMENTS.vaGroove) : '');
  }

  /** The anterior approach to a subaxial cervical disc: from either side, with the neck's vessels and viscera shown,
   * the landmarks' levels and the width between the vertebral arteries measured on this CT. */
  private acdfTool(level: string, g: LevelGeom): HTMLElement {
    const side = this.s.approach?.id === 'acdf' ? this.s.approach.side : null;
    const pick = chips<'none' | 'L' | 'R'>([['none', 'None'], ['L', 'From the left'], ['R', 'From the right']], side ?? 'none',
      (v) => this.update((st) => {
        st.approach = v === 'none' ? null : { id: 'acdf', side: v };
        if (st.approach) {
          st.layers.vessels = { ...(st.layers.vessels ?? { opacity: 1 }), on: true };
          st.layers.viscera = { ...(st.layers.viscera ?? { opacity: 0.6 }), on: true };
          st.cam = acdfCamera(g, v as 'L' | 'R');
        }
      }, { camera: v !== 'none' }), { label: 'Anterior approach', cls: 'acdf-chips' });
    const lm = NECK_LANDMARKS;
    const lvName = (x: string) => (x.includes('-') ? `the ${x.replace('-', '–')} disc` : x);
    const gap = VERTEBRAL_ARTERY.foramina[level]?.medialGap;
    const measured = h('ul', { class: 'plain' },
      h('li', {}, `On this CT the hyoid lies at ${lvName(lm.hyoid.level)}, the thyroid cartilage at ${lvName(lm.thyroidCartilage.level)}, the cricoid’s lower margin at ${lvName(lm.cricoidInferior.level)}.`),
      gap ? h('li', {}, `Between the foramina transversaria at ${level}: ${fmtMm(gap)} mm (medial edge to medial edge).`) : null);
    if (!side) return h('div', { class: 'approach' }, pick, h('p', { class: 'aside' }, 'Pick a side to see the approach from in front, with the carotid sheath, the trachea and oesophagus and the vertebral arteries.'), measured, this.stmt(ACDF_STATEMENTS.measured));
    return h('div', { class: 'approach' }, pick, measured,
      this.stmt(ACDF_STATEMENTS.plane), this.stmt(ACDF_STATEMENTS.side), this.stmt(ACDF_STATEMENTS.nerves),
      this.stmt(ACDF_STATEMENTS.landmarks), this.stmt(ACDF_STATEMENTS.approachByLandmark), this.stmt(ACDF_STATEMENTS.measured),
      this.stmt(ACDF_STATEMENTS.view));
  }

  /** Dorsal approaches to the thoracic disc below the level: what each removes, how much of the ventral canal it
   * exposes in cadavers, and a view from its side. */
  private approachTool(level: string, g: LevelGeom): HTMLElement {
    const a = this.s.approach && this.s.approach.id !== 'acdf' ? { id: this.s.approach.id, side: this.s.approach.side } : null;
    const set = (id: ApproachId | 'none', side: 'L' | 'R') => this.update((st) => {
      st.approach = id === 'none' ? null : { id, side };
      if (id !== 'none') st.cam = approachCamera(g, APPROACHES[id].viewAngle, side);
    }, { camera: id !== 'none' });
    const pick = chips<ApproachId | 'none'>([['none', 'None'], ...Object.values(APPROACHES).map((x): [ApproachId, string] => [x.id, x.name])], a?.id ?? 'none',
      (v) => set(v, a?.side ?? 'L'), { label: 'Approach', cls: 'approach-chips' });
    if (!a) {
      return h('div', { class: 'approach' }, pick,
        h('p', { class: 'aside' }, 'Pick an approach to see the disc from its side, what it removes and how much of the ventral canal it exposes.'),
        this.stmt(APPROACH_STATEMENTS.choice));
    }
    const region = exposureRegion(level);
    const ex = (published.approachExposure as Record<string, Record<string, number>>)[region];
    const steps: [string, string][] = [['laminectomy', 'Laminectomy'], ['medialFacetectomy', '50% medial facetectomy'], ['transpedicular', 'Transpedicular'],
      ['costotransversectomy', 'Costotransversectomy'], ['lateralExtracavitary', 'Lateral extracavitary']];
    const cur = APPROACHES[a.id].exposureStep;
    return h('div', { class: 'approach' }, pick,
      chips<'L' | 'R'>([['L', 'Left'], ['R', 'Right']], a.side, (v) => set(a.id, v), { label: 'Approach side', cls: 'approach-side' }),
      this.stmt(APPROACHES[a.id].removes),
      h('table', { class: 'morph exposure' },
        h('caption', {}, `Ventral canal exposed, ${region.replace('-', '–')} (cadavers)`),
        h('tbody', {}, ...steps.map(([k, label]) => h('tr', { class: k === cur ? 'cur' : '' },
          h('th', { scope: 'row' }, label), h('td', {}, `${ex[k].toFixed(1)}%`))))),
      this.stmt(APPROACH_STATEMENTS.exposure),
      this.stmt(APPROACH_STATEMENTS.adamkiewicz),
      this.stmt(APPROACH_STATEMENTS.choice),
      this.stmt(APPROACH_STATEMENTS.view));
  }

  /** Lesion-to-root: pick a herniation's kind and side at this disc; the affected root and its function follow. */
  private lesionTool(g: LevelGeom): HTMLElement {
    const les = this.s.lesion?.pair === g.pair ? this.s.lesion : null;
    const set = (zone: LesionZone | null, side: 'L' | 'R') => this.update((s) => { s.lesion = zone ? { pair: g.pair, zone, side } : null; });
    const side = les?.side ?? 'L';
    const wrap = h('div', { class: 'lesion' },
      h('div', { class: 'lesion-row' },
        chips<LesionZone | 'none'>([['none', 'None'], ...LESION_ZONES], les?.zone ?? 'none', (v) => set(v === 'none' ? null : v, side), { label: 'Herniation kind', cls: 'lesion-kind' })),
      h('div', { class: 'lesion-row' },
        chips<'L' | 'R'>([['L', 'Left'], ['R', 'Right']], les ? side : null, (v) => set(les?.zone ?? 'paracentral', v), { label: 'Herniation side', cls: 'lesion-side' })));
    if (!les) {
      wrap.append(h('p', { class: 'aside' }, 'Choose a kind and side to see which root it affects.'));
      return wrap;
    }
    const root = affectedRoot(g.pair, les.zone);
    const est = les.zone === 'foraminal' && g.lesions![les.side].foraminalEstimated;
    wrap.append(
      h('p', { class: 'lesion-result' }, 'Affected root: ', this.link(`sp_root_${root.toLowerCase()}`),
        ` (${les.zone === 'paracentral' ? 'traversing' : 'exiting'}), ${les.side === 'L' ? 'left' : 'right'}.`),
      this.stmt(les.zone === 'paracentral' ? STATEMENTS.lesionParacentral : STATEMENTS.lesionLateral),
      h('p', { class: 'aside' }, `The pink marker is a schematic position on this CT${est ? '; this foramen was not captured by the measurement, so it is estimated' : ''}. Real herniations vary in size and position, and a large one can reach both roots.`),
      ...this.rootFunction(root, les.side));
    return wrap;
  }

  /** What a root does, from the ISNCSCI worksheet, with its key sensory point on the chart. */
  private rootFunction(root: string, side: 'L' | 'R'): (HTMLElement | SVGSVGElement)[] {
    const f = ROOT_FUNCTION[root];
    if (!f) return [];
    return [
      h('p', {}, h('strong', {}, 'Key muscle: '), f.keyMuscle ?? 'none listed for this root on the worksheet'),
      f.otherMovements.length ? h('p', {}, h('strong', {}, 'Other movements: '), f.otherMovements.join('; ')) : h('p', {}),
      bodyChart(root, side),
      this.stmt(STATEMENTS.isncsci),
      this.stmt(STATEMENTS.dermatomes),
      h('p', { class: 'aside' }, 'Reflexes: to be added from a source whose text can be checked.'),
    ];
  }

  private card(id: string): HTMLElement {
    const st = SP.get(id);
    const close = h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: () => this.update((s) => { s.sel = null; }) }, '×');
    if (!st) return h('p', {}, '');
    return h('article', { class: 'card sel', style: `--accent: var(--c-${st.colour.token})` }, close,
      h('p', { class: 'eyebrow' }, `${st.category ?? ''}${st.level ? ' · ' + st.level : ''}`.replace(/^./, (c) => c.toUpperCase())),
      h('h2', {}, h('span', { class: 'swatch', style: `--c: var(--c-${st.colour.token})` }), st.name),
      st.schematic ? h('p', { class: 'aside schematic-note' }, 'Schematic: drawn by rule from the anatomy and published descriptions, not segmented.') : null,
      h('dl', {},
        ...this.extra(st.id, st.category ?? '', st.level),
        h('dt', {}, 'Geometry'), h('dd', {}, st.derivation),
        h('dt', {}, 'Source'), h('dd', {}, `${st.source}. `, h('a', { href: '#/credits' }, 'Licence and attribution'))));
  }

  /** Sourced statements and measurements for a structure's card. */
  private extra(id: string, category: string, level?: string): HTMLElement[] {
    const out: HTMLElement[] = [];
    const add = (dt: string, ...dd: (Element | string | null)[]) => out.push(h('dt', {}, dt), h('dd', {}, ...dd));
    const thoracic = (level ?? '').startsWith('T');
    const cervical = (level ?? '').startsWith('C');
    if (category === 'root' && cervical) {
      add('Exit', this.stmt(STATEMENTS.cervicalRootRule));
      add('Root and disc', this.stmt(STATEMENTS.cervicalRootDisc));
    }
    if (id === 'sp_vertebral_artery') {
      add('Course', this.stmt(STATEMENTS.vaSegments));
      add('Entry', `On this CT: the foramen of ${VERTEBRAL_ARTERY.entry.L} on the left and ${VERTEBRAL_ARTERY.entry.R} on the right (inferred from the foramina’s size).`, this.stmt(STATEMENTS.vaEntry));
      add('At the atlas', this.stmt(STATEMENTS.vaGroove));
      add('At the axis', this.stmt(STATEMENTS.vaHighRiding));
    }
    if (category === 'root' && thoracic) {
      add('Exit', this.stmt(STATEMENTS.thoracicNerve));
      add('Its foramen', this.stmt(STATEMENTS.thoracicForamen));
    }
    if (category === 'root' && !thoracic && !cervical) {
      add('Exit', this.stmt(STATEMENTS.rootRule));
      add('Ganglion and take-off', this.stmt(STATEMENTS.ganglia));
      if (level && ROOT_FUNCTION[level]) {
        const les = this.s.lesion && affectedRoot(this.s.lesion.pair, this.s.lesion.zone) === level ? this.s.lesion : null;
        add('Function (ISNCSCI)', ...this.rootFunction(level, les?.side ?? 'L'));
      }
      const g = level ? GEOM_BY_LEVEL.get(level) : undefined;
      if (g && (g.foramen.L || g.foramen.R)) add(`Its foramen (${g.pair}, measured)`, ['L', 'R'].map((sd) => {
        const f = g.foramen[sd as 'L' | 'R'];
        return f ? `${sd === 'L' ? 'left' : 'right'} ${fmtMm(f.height)} mm high` : `${sd === 'L' ? 'left' : 'right'} not captured`;
      }).join(', ') + '.');
    }
    if (category === 'ganglion') add('Ganglia', this.stmt(thoracic ? STATEMENTS.thoracicNerve : cervical ? STATEMENTS.cervicalRootRule : STATEMENTS.ganglia));
    if (id === 'sp_dural_sac') add('What this is', this.stmt(STATEMENTS.sac));
    return out;
  }

  // ---------------------------------------------------------------- legend, labels, readout
  private renderLegend(): void {
    const p = this.viewer.currentPlan();
    clear(this.legend);
    if (!p) return;
    const isOff = offTest(this.s);
    const shown = [...p.looks].filter(([, l]) => l !== 'hidden' && l !== 'ghost').map(([id]) => id);
    for (const [, label, cats] of GROUPS) {
      const ids = shown.filter((id) => cats.includes(SP.get(id)?.category ?? ''));
      if (!ids.length) continue;
      const off = ids.every(isOff);
      this.legend.append(h('li', { class: off ? 'off' : '' },
        h('button', {
          type: 'button', class: 'eye', 'aria-pressed': String(!off), title: off ? 'Show' : 'Hide', 'aria-label': `${off ? 'Show' : 'Hide'} ${label}`,
          onclick: () => this.update((s) => showIds(s, ids, off)),
        }, eyeIcon(!off)),
        h('span', { class: 'sw solid', style: `--c: var(--c-${tokenOf(ids[0])})` }), h('span', { class: 'lg-text' }, `${label} (${ids.length})`)));
    }
    if (this.s.hidden.length) this.legend.append(h('li', { class: 'lg-actions' }, h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.hidden = []; }) }, `Show all (${this.s.hidden.length} hidden)`)));
  }

  private placeLabels(): void {
    drawGizmo(this.gizmo, this.viewer.axesScreen());
    const mode = this.s?.labels ?? 'hover';
    const items: LabelItem[] = [];
    const add = (id: string) => {
      if (items.some((x) => x.id === id)) return;
      const a = this.viewer.anchorFor(id);
      if (a) items.push({ id, text: SP.get(id)?.category === 'vertebra' ? SP.get(id)!.level! : nameOf(id), ax: a.x, ay: a.y, cls: 'slabel primary' });
    };
    if (mode === 'all') for (const id of REGION.get(this.s.region)!.structures) if (SP.get(id)?.category === 'vertebra' && !this.s.hidden.includes(id)) add(id);
    if (mode !== 'off') for (const id of [this.legendHover, this.s?.sel]) if (id) add(id);
    layoutLabels(items, this.stage.clientWidth, this.stage.clientHeight, this.labels, this.leaders);
  }

  private showTip(info: PickInfo | null, x: number, y: number): void {
    if (!info || !info.id) { this.tip.hidden = true; return; }
    const r = this.stage.getBoundingClientRect();
    this.tip.hidden = false;
    this.tip.textContent = nameOf(info.id);
    this.tip.style.transform = `translate(${Math.round(x - r.left + 14)}px, ${Math.round(y - r.top + 14)}px)`;
  }

  private showReadout(ras: THREE.Vector3 | null): void {
    if (!ras) return;
    clear(this.readout);
    this.readout.append(h('span', { class: 'k' }, 'From the L5 body centre'), ` x ${fmtMm(ras.x)}  y ${fmtMm(ras.y)}  z ${fmtMm(ras.z)} mm`);
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
    this.measureOut.textContent = `Distance ${fmtMm(a.distanceTo(b))} mm (in this CT)`;
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
        h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e: Event) => this.update((st) => { st.layers[k]!.on = (e.target as HTMLInputElement).checked; }) }), label),
        h('label', { class: 'range' }, h('span', { class: 'vh' }, `${label} opacity`),
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, oninput: (e: Event) => this.update((st) => { st.layers[k]!.opacity = parseFloat((e.target as HTMLInputElement).value); }) }))));
      pane.append(h('h3', {}, 'Layers'), ...rows,
        h('fieldset', { class: 'seg-field' }, h('legend', {}, 'Cut away a side'),
          ...([['none', 'Nothing'], ['L', 'Left half'], ['R', 'Right half']] as const).map(([v, label]) =>
            h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'spcut', value: v, onchange: () => this.update((st) => { st.cutSide = v; }) }), label))),
        h('p', { class: 'aside' }, 'Cutting away a side opens the spinal canal and the foramina in a midsagittal view.'));
    }
    const regionIds = REGION.get(s.region)?.structures ?? [];
    for (const [k] of LAYERS) {
      const row = pane.querySelector<HTMLElement>(`[data-layer="${k}"]`)!;
      // the neck's vessels and soft tissue are drawn in the cervical region only
      row.hidden = (k === 'vessels' || k === 'viscera') && !regionIds.some((id) => SP.get(id)?.layer === k);
      (row.querySelector('input[type=checkbox]') as HTMLInputElement).checked = s.layers[k]!.on;
      (row.querySelector('input[type=range]') as HTMLInputElement).value = String(s.layers[k]!.opacity);
    }
    pane.querySelectorAll<HTMLInputElement>('input[name=spcut]').forEach((r) => { r.checked = r.value === s.cutSide; });
  }

  // ---------------------------------------------------------------- keyboard
  handleKey(e: KeyboardEvent): boolean {
    const k = e.key;
    const preset = PRESETS.find((p) => p[2] === k);
    if (preset) { this.update((s) => { s.cam = { preset: preset[0] }; }, { camera: true }); return true; }
    if (k === 'h' || k === 'H') { this.update((s) => { s.hemi = s.hemi === 'both' ? 'L' : s.hemi === 'L' ? 'R' : 'both'; }); return true; }
    if (k === 'm' || k === 'M') { this.toggleMeasure(); return true; }
    if (k === 'n' || k === 'N') { this.update((s) => { s.labels = s.labels === 'hover' ? 'all' : s.labels === 'all' ? 'off' : 'hover'; }); return true; }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      const lv = REGION.get(this.s.region)!.levels;
      const i = this.s.level ? lv.indexOf(this.s.level) : (k === 'ArrowUp' ? lv.length : -1);
      const j = Math.max(0, Math.min(lv.length - 1, i + (k === 'ArrowUp' ? -1 : 1)));
      this.update((s) => { s.level = lv[j]; s.lesion = null; s.screw = null; s.approach = null; s.sel = null; s.cam = { preset: null }; }, { camera: true });
      return true;
    }
    if (k === 'Escape') {
      if (this.measureBtn.getAttribute('aria-pressed') === 'true') { this.toggleMeasure(); return true; }
      if (this.s.sel) { this.update((s) => { s.sel = null; }); return true; }
      if (this.s.lesion) { this.update((s) => { s.lesion = null; }); return true; }
      if (this.s.approach) { this.update((s) => { s.approach = null; }); return true; }
      if (this.s.level) { this.update((s) => { s.level = null; }, { camera: true }); return true; }
    }
    return false;
  }

  onShow(): void { this.viewer.invalidate(); }
}
