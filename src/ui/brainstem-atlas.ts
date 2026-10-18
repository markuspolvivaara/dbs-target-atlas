import * as THREE from 'three';
import type { CameraPreset, ManifestStructure } from '../data/schema';
import type { Hemi, LayerKey } from '../state';
import { BS, BS_MANIFEST, BS_REF, DEFINITIONS, kindOf, KIND_LABEL, MEASURED, OWN, ZONE_GEOM, ZONE_TEXT, type Kind } from '../brainstem';
import { AAN_GENERAL, AAN_TRANSMITTER, NERVE_COMPONENTS, NOT_DRAWN, SEZ_GENERAL } from '../brainstem/content';
import { BS_GROUP, BS_GROUPS, type BsGroup } from '../brainstem/groups';
import { bsScene, type BsPlan } from '../brainstem/scene';
import type { Claim } from '../brainstem/schema';
import type { BsState } from '../brainstem/state';
import { SITE_ROOT } from '../brand';
import { Viewer, type PickInfo } from '../viewer/Viewer';
import { h } from './h';
import { refLinksFrom } from './reflinks';
import { bindSheetDrag, buildSlicesPane, drawGizmo, layoutLabels, syncSlicesPane, type LabelItem } from './stage';
import { chips, clear, eyeIcon, fmtMm } from './widgets';

type Update = (fn: (s: BsState) => void, opts?: { camera?: boolean }) => void;

const PRESETS: [CameraPreset, string, string, string][] = [
  ['coronal', 'Front', '1', 'Front'], ['posterior', 'Back', '2', 'Back'], ['sagittal', 'Side', '3', 'Side'],
  ['posteriorOblique', 'Back oblique', '4', 'Obl'], ['axial', 'From above', '5', 'Above'],
];
const LAYERS: [LayerKey, string][] = [['cortex', 'Brainstem surface'], ['nuclei', 'Nuclei'], ['tracts', 'Nerves, arteries and tracts'], ['targets', 'Safe entry zones']];
const GROUP_ROWS: [BsGroup['kind'], string][] = [['overview', 'Overview'], ['inside', 'Inside the brainstem'], ['zones', 'Safe entry zones']];
const REGION_LABEL = { midbrain: 'Midbrain', pons: 'Ventral pons', floor: 'Floor of the fourth ventricle', medulla: 'Medulla' } as const;
const LIST_ORDER: Kind[] = ['sez', 'cnNucleus', 'aan', 'nerve', 'dbs', 'tract', 'artery', 'feature', 'csf', 'surface'];
const LIST_LABEL: Record<Kind, string> = {
  sez: 'Safe entry zones', cnNucleus: 'Cranial nerve nuclei', aan: 'Arousal network nuclei', nerve: 'Cranial nerves', dbs: 'Deep nuclei',
  tract: 'Tracts', artery: 'Arteries', feature: 'Surface features', csf: 'Fluid spaces', surface: 'Brainstem',
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const nameOf = (id: string) => {
  const m = BS.get(id);
  if (!m) return id;
  return m.abbr ? `${m.name} (${m.abbr})` : m.name;
};
const tokenOf = (id: string) => BS.get(id)?.colour.token ?? 'ctx';
const refs = (ids: string[]) => refLinksFrom(BS_REF, ids);
const claimList = (cl: Claim[]) => h('ul', { class: 'evidence' }, ...cl.map((c) => h('li', {}, c.text, ' ', refs(c.refIds))));
const section = (title: string, cl: Claim[]) => (cl.length ? [h('dt', {}, title), h('dd', {}, claimList(cl))] : null);
const pos = (v: unknown) => (Array.isArray(v) ? `${v.map((x) => fmtMm(Number(x))).join(', ')} mm` : String(v));

/** The 3D page of the brainstem section: views, structure and entry-zone cards, layers and slices. */
export class BrainstemAtlasPage {
  readonly el: HTMLElement;
  viewer!: Viewer<BsState, BsPlan>;
  private s!: BsState;
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
      ...([['all', 'All', 'Label everything highlighted in this view'], ['hover', 'Hover', 'Label only what you point at, select or hover in the legend'], ['off', 'Off', 'No name labels']] as const)
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
    this.readout.textContent = 'Point at a structure for its MNI position';

    this.viewer = new Viewer<BsState, BsPlan>(host, {
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
    }, bsScene);
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
    const names: [string, string][] = [['overview', 'Anatomy'], ['layers', 'Layers'], ['slices', 'Slices']];
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
  render(s: BsState, opts: { camera: boolean }): void {
    const prev = this.s;
    this.s = s;
    this.viewer.apply(s, { animateCamera: opts.camera }).then(() => this.renderLegend());
    this.stage.querySelectorAll<HTMLButtonElement>('[data-hemi]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hemi === s.hemi)));
    this.stage.querySelectorAll<HTMLButtonElement>('.toolbar [data-labels]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.labels === s.labels)));
    this.stage.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.toggleAttribute('data-active', b.dataset.preset === s.cam.preset));
    const key = `${s.grp}|${s.sel}|${s.hidden.join(',')}`;
    if (key !== this.lastKey || !prev) { this.lastKey = key; this.renderOverview(); }
    this.renderLayers();
    this.renderSlices();
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
    const g = BS_GROUP.get(s.grp)!;
    for (const [kind, label] of GROUP_ROWS) {
      pane.append(h('p', { class: 'chips-label' }, label),
        chips(BS_GROUPS.filter((x) => x.kind === kind).map((x) => [x.id, x.name]), g.id, (v) => this.pickGroup(v), { label, cls: 'grp-chips' }));
    }
    const hidden = new Set(s.hidden);
    const show = (ids: string[], on: boolean) => this.update((st) => { st.hidden = on ? st.hidden.filter((x) => !ids.includes(x)) : [...new Set([...st.hidden, ...ids])]; });
    const eye = (ids: string[], label: string) => {
      const off = ids.every((x) => hidden.has(x));
      return h('button', {
        type: 'button', class: 'eye', 'aria-pressed': String(!off), title: off ? 'Show' : 'Hide', 'aria-label': `${off ? 'Show' : 'Hide'} ${label}`,
        onclick: () => show(ids, off),
      }, eyeIcon(!off));
    };
    const entry = (id: string) => h('span', { class: `sb-entry${hidden.has(id) ? ' off' : ''}` }, eye([id], nameOf(id)),
      h('button', {
        type: 'button', class: 'chip sb-item', 'aria-pressed': String(s.sel === id), 'data-id': id,
        onclick: () => this.update((st) => { st.sel = st.sel === id ? null : id; }),
      }, h('span', { class: 'swatch', style: `--c: var(--c-${tokenOf(id)})` }), nameOf(id)));
    const listed = [...new Set(g.key)];
    for (const k of LIST_ORDER) {
      let ids = listed.filter((id) => kindOf(id) === k);
      if (!ids.length) continue;
      if (k === 'cnNucleus' || k === 'nerve') ids = ids.sort((a, b) => (BS.get(a)?.cranialNerve ?? 0) - (BS.get(b)?.cranialNerve ?? 0));
      pane.append(h('div', { class: 'list-head' }, h('p', { class: 'chips-label' }, `${LIST_LABEL[k]} (${ids.length})`),
        h('span', { class: 'list-actions' },
          h('button', { type: 'button', class: 'linklike', onclick: () => show(ids, true) }, 'Show all'),
          h('button', { type: 'button', class: 'linklike', onclick: () => show(ids, false) }, 'Hide all'))),
      h('div', { class: 'chips wrap sb-list' }, ...ids.map(entry)));
    }
    if (s.sel && BS.has(s.sel)) pane.append(this.card(s.sel));
    const groupCard = h('article', { class: 'card' },
      h('p', { class: 'eyebrow' }, GROUP_ROWS.find(([k]) => k === g.kind)![1]),
      h('h2', {}, g.name),
      h('p', {}, g.description),
      g.kind === 'zones' ? [
        h('h3', {}, 'About safe entry zones'), claimList(SEZ_GENERAL),
        g.id === 'sez_all' ? h('p', { class: 'aside' }, 'Named in the sources but not drawn here (no definition this atlas could place): ',
          ...NOT_DRAWN.flatMap((n, i) => [i ? '; ' : '', n.name, ' ', refs(n.refIds)]), '.') : null,
        h('p', { class: 'aside' }, 'Each zone is drawn by rule on the brainstem of a model fitted to the MNI template, from the published definition; how is stated on its card. Zones are for orientation and teaching, not for planning an entry.'),
      ] : null,
      g.id === 'arousal' ? [h('h3', {}, 'The network'), claimList(AAN_GENERAL)] : null,
      g.kind === 'overview' && g.id === 'overview' ? h('p', { class: 'aside' },
        `Model fitted to the ICBM 2009b template’s brainstem: the surface lies within ${fmtMm(BS_MANIFEST.fit.warpedMedianMm)} mm (median; 90 % within ${fmtMm(BS_MANIFEST.fit.warpedP90Mm)} mm) of the template’s tissue–fluid boundary where both are matched. Nerves, arteries and the model’s nuclei are carried along: approximate.`) : null);
    if (s.sel) pane.append(h('details', { class: 'more' }, h('summary', {}, `About ${g.name}`), groupCard));
    else pane.append(groupCard);
  }

  private card(id: string): HTMLElement {
    const close = h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: () => this.update((s) => { s.sel = null; }) }, '×');
    const st = BS.get(id)!;
    const k = kindOf(id);
    const head = (eyebrow: string) => [close, h('p', { class: 'eyebrow' }, eyebrow),
      h('h2', {}, h('span', { class: 'swatch', style: `--c: var(--c-${st.colour.token})` }), nameOf(id))];
    const geometry = [h('dt', {}, 'Geometry'), h('dd', {}, `${st.source}. ${st.derivation} `, h('a', { href: '#/credits' }, 'Licence and attribution'))];
    const def = DEFINITIONS[st.name];
    const defBlock = def
      ? [h('dt', {}, 'Definition'), h('dd', {}, h('p', {}, def.text), h('p', { class: 'aside' }, 'From Wikipedia (CC BY-SA 3.0), as shipped with Z-Anatomy; not checked against the literature. ',
        def.url ? h('a', { href: def.url, target: '_blank', rel: 'noopener' }, 'Source page') : null))]
      : null;
    const style = `--accent: var(--c-${st.colour.token})`;
    if (k === 'sez') {
      const t = ZONE_TEXT.get(id)!;
      const geo = ZONE_GEOM.get(id)!;
      return h('article', { class: 'card sel', style }, ...head(`Safe entry zone · ${REGION_LABEL[geo.region]}`),
        h('p', { class: 'aside schematic-note' }, 'Drawn by rule from the published definition on a model fitted to the template: a guide to where the zone lies, not a measured position.'),
        h('p', {}, t.summary),
        h('dl', {}, ...(section('Where it lies', t.borders) ?? []), ...(section('Approach', t.approach) ?? []),
          ...(section('Risks and outcomes', t.risks) ?? []), ...(section('Published measurements', t.measures) ?? []),
          h('dt', {}, 'How it is drawn here'), h('dd', {}, geo.construction),
          ...this.measuredRows(id),
          ...geometry));
    }
    if (k === 'aan') {
      const tx = AAN_TRANSMITTER[st.abbr ?? ''];
      return h('article', { class: 'card sel', style }, ...head('Ascending arousal network'),
        h('dl', {}, tx ? [h('dt', {}, 'Neurotransmitter'), h('dd', {}, tx.text, ' ', refs(tx.refIds))] : null,
          h('dt', {}, 'The network'), h('dd', {}, claimList(AAN_GENERAL)),
          ...geometry));
    }
    if (k === 'cnNucleus' || k === 'nerve') {
      const cn = st.cranialNerve ?? 0;
      const comp = NERVE_COMPONENTS[cn];
      const nerve = BS_MANIFEST.structures.find((x) => x.category === 'nerve' && x.cranialNerve === cn);
      const nuclei = BS_MANIFEST.structures.filter((x) => x.category === 'cnNucleus' && x.cranialNerve === cn);
      const link = (x: ManifestStructure) => h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.sel = x.id; }) }, x.name);
      return h('article', { class: 'card sel', style }, ...head(`${KIND_LABEL[k]} · ${ROMAN[cn]}`),
        h('p', { class: 'aside schematic-note' }, k === 'nerve'
          ? 'The model’s nerve fitted to the template with the brainstem: its exit point and course are approximate.'
          : 'The model’s nucleus is a simple shape for its position and extent, fitted to the template with the brainstem: approximate.'),
        h('dl', {}, comp ? [h('dt', {}, `Cranial nerve ${ROMAN[cn]}: functional components`), h('dd', {}, comp.text, ' ', refs(comp.refIds))] : null,
          k === 'cnNucleus' && nerve ? [h('dt', {}, 'Nerve'), h('dd', {}, link(nerve))] : null,
          k === 'nerve' ? [h('dt', {}, 'Nuclei in this model'), h('dd', {}, ...(nuclei.length ? nuclei.flatMap((x, i) => [i ? ', ' : '', link(x)]) : ['The model has none for this nerve.']))] : null,
          ...(defBlock ?? []), ...this.measuredRows(id), ...geometry));
    }
    if (!OWN.has(id)) {
      const wm = st.type === 'tract';
      return h('article', { class: 'card sel', style }, ...head(KIND_LABEL[k]),
        h('dl', {}, h('dt', {}, 'From'), h('dd', {}, wm ? 'The white-matter section (HCP-1065 tractography atlas, Yeh 2018). ' : 'The DBS section’s atlases. ',
          h('a', { href: `${SITE_ROOT}${wm ? 'tracts' : 'dbs'}/` }, wm ? 'Open the white-matter section' : 'Open the DBS section'), ' for its card with sources.'),
          h('dt', {}, 'Licence'), h('dd', {}, st.licence)));
    }
    return h('article', { class: 'card sel', style }, ...head(KIND_LABEL[k]),
      st.fitted ? h('p', { class: 'aside schematic-note' }, 'From the Z-Anatomy model fitted to the template: approximate.') : '',
      h('dl', {}, ...(defBlock ?? [h('dt', {}, 'Definition'), h('dd', {}, 'Z-Anatomy ships no definition for this structure.')]), ...geometry));
  }

  /** The model's own measurements that bear on a structure (bs-zones.json). */
  private measuredRows(id: string): HTMLElement[] {
    const m = MEASURED as Record<string, unknown>;
    const rows: [string, string][] = [];
    const side = (key: string, label: string) => { if (m[`${key}R`] !== undefined) rows.push([label, `right ${pos(m[`${key}R`])}; left ${pos(m[`${key}L`])}`]); };
    const fc = m.facialColliculus as { rostralMarginZ: number; caudalMarginZ: number } | undefined;
    switch (id) {
      case 'sez_perioculomotor': case 'bs_cn_oculomotor_nerve': side('oculomotorExit', 'Oculomotor nerve exit (MNI x, y, z)'); break;
      case 'sez_infracollicular': case 'bs_cn_trochlear_nerve': side('trochlearExit', 'Trochlear nerve where it runs furthest back (MNI x, y, z)'); break;
      case 'sez_peritrigeminal': case 'bs_cn_trigeminal_nerve': side('trigeminalEntry', 'Trigeminal nerve entry (MNI x, y, z)'); side('facialExit', 'Facial nerve exit (MNI x, y, z)'); break;
      case 'bs_cn_facial_nerve': side('facialExit', 'Facial nerve exit (MNI x, y, z)'); break;
      case 'sez_lateral_mesencephalic_sulcus': side('lmsLength', 'Length drawn (mm)'); break;
      case 'sez_supratrigeminal': side('pontomesencephalicSulcusZ', 'Pontomesencephalic sulcus at that level, z (mm)'); break;
      case 'sez_suprafacial': case 'sez_infrafacial': case 'sez_median_sulcus':
        rows.push(['Floor of the fourth ventricle in this model', `${fmtMm(m.floorLengthMm as number)} mm from the aqueduct (z ${fmtMm(m.aqueductOpeningZ as number)}) to the obex (z ${fmtMm(m.obexZ as number)})`]);
        if (fc) rows.push(['Facial colliculus placed at', `z ${fmtMm(fc.rostralMarginZ)} to ${fmtMm(fc.caudalMarginZ)} mm`]);
        side('abducensNucleusZ', 'The model’s abducens nucleus, z (mm)');
        break;
      case 'sez_anterolateral_sulcus': case 'bs_cn_hypoglossal_nerve': side('hypoglossalRootlets', 'Hypoglossal rootlets found leaving the medulla'); break;
    }
    return rows.length ? [h('dt', {}, 'Measured in this model'), h('dd', {}, h('ul', { class: 'plain' }, ...rows.map(([a, b]) => h('li', {}, `${a}: ${b}`))))] : [];
  }

  // ---------------------------------------------------------------- legend, labels, readout
  private renderLegend(): void {
    const p = this.viewer.currentPlan();
    clear(this.legend);
    if (!p) return;
    const hidden = new Set(this.s.hidden);
    const shown = new Map<Kind, string[]>();
    const add = (id: string) => { const k = kindOf(id); shown.set(k, [...(shown.get(k) ?? []), id]); };
    for (const [id, l] of p.looks) if (l === 'primary' && kindOf(id) !== 'surface') add(id);
    for (const [id, r] of p.tracts) if (r === 'key') add(id);
    const row = (cls: string, token: string, text: string, ids: string[]) => {
      const off = ids.every((x) => hidden.has(x));
      return h('li', { class: off ? 'off' : '' },
        h('button', {
          type: 'button', class: 'eye', 'aria-pressed': String(!off), title: off ? 'Show' : 'Hide', 'aria-label': `${off ? 'Show' : 'Hide'} ${text}`,
          onclick: () => this.update((s) => { s.hidden = off ? s.hidden.filter((x) => !ids.includes(x)) : [...new Set([...s.hidden, ...ids])]; }),
        }, eyeIcon(!off)),
        h('span', { class: `sw ${cls}` , style: `--c: var(--c-${token})` }), h('span', { class: 'lg-text' }, text));
    };
    const surf = [...p.looks].filter(([id, l]) => l !== 'hidden' && kindOf(id) === 'surface').map(([id]) => id);
    if (surf.length && this.s.layers.cortex.on) this.legend.append(row('patch', 'bsSurface', 'Brainstem', surf));
    for (const k of LIST_ORDER) {
      const ids = shown.get(k);
      if (!ids?.length) continue;
      if (k === 'tract' || k === 'dbs') { for (const id of ids) this.legend.append(row(k === 'tract' ? 'line' : 'solid', tokenOf(id), nameOf(id), [id])); continue; }
      this.legend.append(row(k === 'sez' || k === 'feature' || k === 'csf' ? 'patch' : 'solid', tokenOf(ids[0]), `${LIST_LABEL[k]} (${ids.length})`, ids));
    }
    if (this.s.hidden.length) this.legend.append(h('li', { class: 'lg-actions' }, h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.hidden = []; }) }, `Show all (${this.s.hidden.length} hidden)`)));
  }

  private placeLabels(): void {
    drawGizmo(this.gizmo, this.viewer.axesScreen());
    const mode = this.s?.labels ?? 'hover';
    const items: LabelItem[] = [];
    const have = new Set<string>();
    const add = (id: string, text: string, ax: number, ay: number, cls: string) => { if (!have.has(id)) { have.add(id); items.push({ id, text, ax, ay, cls }); } };
    if (mode === 'all') {
      const g = BS_GROUP.get(this.s.grp);
      const key = new Set(g?.key ?? []);
      for (const p of this.viewer.structureScreen()) if (key.has(p.id) && kindOf(p.id) !== 'surface') add(p.id, nameOf(p.id), p.x, p.y, 'slabel primary');
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
    this.readout.append(h('span', { class: 'k' }, 'MNI'), ` x ${fmtMm(ras.x)}  y ${fmtMm(ras.y)}  z ${fmtMm(ras.z)} mm`);
  }

  private toggleMeasure(): void {
    const on = this.measureBtn.getAttribute('aria-pressed') !== 'true';
    this.measureBtn.setAttribute('aria-pressed', String(on));
    this.viewer.setMeasuring(on);
    this.measurePts = [];
    this.measureOut.hidden = !on;
    this.measureOut.textContent = on ? 'Click or tap two points on any structure or slice.' : '';
  }

  private showMeasure(): void {
    const [a, b] = this.measurePts;
    this.measureOut.hidden = false;
    if (!b) { this.measureOut.textContent = `Point A: ${[a.x, a.y, a.z].map(fmtMm).join(', ')}. Pick point B.`; return; }
    this.measureOut.textContent = `Distance ${fmtMm(a.distanceTo(b))} mm (on the template)`;
  }

  private async copyLink(btn: HTMLElement): Promise<void> {
    try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Link copied'; }
    catch { window.prompt('Copy this link', location.href); }
    setTimeout(() => { btn.textContent = 'Copy link'; }, 1600);
  }

  // ---------------------------------------------------------------- layers and slices
  private renderLayers(): void {
    const pane = this.tabs.layers;
    const s = this.s;
    if (!pane.childElementCount) {
      const rows = LAYERS.map(([k, label]) => h('div', { class: 'layer', 'data-layer': k },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e: Event) => this.update((st) => { st.layers[k].on = (e.target as HTMLInputElement).checked; }) }), label),
        h('label', { class: 'range' }, h('span', { class: 'vh' }, `${label} opacity`),
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, oninput: (e: Event) => this.update((st) => { st.layers[k].opacity = parseFloat((e.target as HTMLInputElement).value); }) }))));
      pane.append(h('h3', {}, 'Layers'), ...rows,
        h('p', { class: 'aside' }, 'Lower the brainstem surface’s opacity to see the nuclei and tracts inside it.'));
    }
    for (const [k] of LAYERS) {
      const row = pane.querySelector(`[data-layer="${k}"]`)!;
      (row.querySelector('input[type=checkbox]') as HTMLInputElement).checked = s.layers[k].on;
      (row.querySelector('input[type=range]') as HTMLInputElement).value = String(s.layers[k].opacity);
    }
  }

  private renderSlices(): void {
    const pane = this.tabs.slices;
    if (!pane.childElementCount) {
      buildSlicesPane<BsState>(pane, this.update, {
        cut: 'Removes everything on that side of the midline (x = 0). The slices stay whole.',
        seq: 'ICBM 2009b templates, the brain the model was fitted to. Each sequence loads on first use (about 3 MB).',
        footer: 'Slices show the ICBM 2009b nonlinear asymmetric templates at 1.5 mm around the brainstem (0.5 mm in a box over the midbrain).',
      });
    }
    syncSlicesPane(pane, this.s);
  }

  // ---------------------------------------------------------------- keyboard
  handleKey(e: KeyboardEvent): boolean {
    const k = e.key;
    const preset = PRESETS.find((p) => p[2] === k);
    if (preset) { this.update((s) => { s.cam = { preset: preset[0] }; }, { camera: true }); return true; }
    if (k === 'h' || k === 'H') { this.update((s) => { s.hemi = s.hemi === 'both' ? 'L' : s.hemi === 'L' ? 'R' : 'both'; }); return true; }
    if (k === 'm' || k === 'M') { this.toggleMeasure(); return true; }
    if (k === 'n' || k === 'N') { this.update((s) => { s.labels = s.labels === 'hover' ? 'all' : s.labels === 'all' ? 'off' : 'hover'; }); return true; }
    if (k === 's' || k === 'S') { this.update((s) => { s.clip.axial.on = !s.clip.axial.on; }); return true; }
    if (k === 'Escape') {
      if (this.measureBtn.getAttribute('aria-pressed') === 'true') { this.toggleMeasure(); return true; }
      if (this.s.sel) { this.update((s) => { s.sel = null; }); return true; }
    }
    return false;
  }

  onShow(): void { this.viewer.invalidate(); }
}
