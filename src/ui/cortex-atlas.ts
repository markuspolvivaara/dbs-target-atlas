import * as THREE from 'three';
import type { CameraPreset } from '../data/schema';
import type { Hemi } from '../state';
import { CTX, CTX_REFS, DBS_PARCEL, DK_NAMES, FN_GROUPS, FUNCTIONS, LABEL, LOBE, LOBES, MEDIAL_WALL, METHOD, shortName, type CtxLabel, type FnGroupId, type LobeId } from '../cortex';
import { cortexScene, viewLabels, type CortexPlan } from '../cortex/scene';
import type { ColourMode, CortexState } from '../cortex/state';
import { VIEW, VIEWS, type ViewId } from '../cortex/views';
import { Viewer, type PickInfo } from '../viewer/Viewer';
import { h } from './h';
import { refLinksFrom } from './reflinks';
import { bindSheetDrag, drawGizmo, layoutLabels, type LabelItem } from './stage';
import { chips, clear, eyeIcon, fmtMm } from './widgets';

type Update = (fn: (s: CortexState) => void, opts?: { camera?: boolean }) => void;

const PRESETS: [CameraPreset, string, string, string][] = [
  ['lateral', 'Lateral', '1', 'Lat'], ['medial', 'Medial', '2', 'Med'], ['inferior', 'Basal', '3', 'Bas'],
  ['axial', 'Superior', '4', 'Sup'], ['coronal', 'Anterior', '5', 'Ant'],
];
const VIEW_WORD: Record<string, string> = { S: 'superior', A: 'anterior', L: 'lateral', P: 'posterior', M: 'medial', I: 'inferior' };
const KIND_LABEL: Record<CtxLabel['kind'], string> = { gyrus: 'Gyrus', sulcus: 'Sulcus', 'gyrus and sulcus': 'Gyrus and sulcus', pole: 'Pole' };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const lobeName = (id: LobeId) => LOBE.get(id)!.name;
const tokenOf = (id: string) => CTX.get(id)?.colour.token ?? 'cortex';

/** The 3D page of the cortex section: views, lobes, label cards and the pial / inflated surface. */
export class CortexAtlasPage {
  readonly el: HTMLElement;
  viewer!: Viewer<CortexState, CortexPlan>;
  private s!: CortexState;
  private stage: HTMLElement;
  private panel: HTMLElement;
  private tabs: Record<string, HTMLElement> = {};
  private tabBtns: Record<string, HTMLButtonElement> = {};
  private tip = h('div', { class: 'tip', role: 'tooltip', hidden: true });
  private readout = h('div', { class: 'readout', 'aria-live': 'off' });
  private measureOut = h('div', { class: 'measure-out', 'aria-live': 'polite', hidden: true });
  private legend = h('ul', { class: 'legend3d' });
  private labels = h('div', { class: 'labels', 'aria-hidden': 'true' });
  private surfLabels = h('div', { class: 'labels surf-labels', 'aria-hidden': 'true' });
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
        onclick: () => this.update((s) => { s.cam = { preset: p }; if (p === 'medial' && s.hemi === 'both') s.hemi = 'L'; }, { camera: true }),
      }, h('span', { class: 'long' }, label), h('span', { class: 'short', 'aria-hidden': 'true' }, short)));
    }
    const hemiGroup = h('div', { class: 'tgroup seg', role: 'group', 'aria-label': 'Hemisphere' });
    for (const [v, label, short] of [['L', 'Left', 'L'], ['both', 'Both', 'L+R'], ['R', 'Right', 'R']] as [Hemi, string, string][]) {
      hemiGroup.append(h('button', {
        type: 'button', class: 'tbtn', 'data-hemi': v, 'aria-pressed': 'false', title: `${label} hemisphere (H cycles)`, 'aria-label': `${label} hemisphere`,
        onclick: () => this.update((s) => { s.hemi = v; }),
      }, h('span', { class: 'long' }, label), h('span', { class: 'short', 'aria-hidden': 'true' }, short)));
    }
    const surfGroup = h('div', { class: 'tgroup seg', role: 'group', 'aria-label': 'Surface' },
      ...([[0, 'Pial', 'The brain surface as it is (pial surface)'], [1, 'Inflated', 'Smoothed so the sulci open up; light = gyral crown, dark = sulcal depth']] as const)
        .map(([v, label, title]) => h('button', { type: 'button', class: 'tbtn', 'data-inflate': String(v), 'aria-pressed': 'false', title: `${title} (I toggles)`, onclick: () => this.setInflate(v) }, label)));
    this.measureBtn = h('button', { type: 'button', class: 'tbtn', 'aria-pressed': 'false', title: 'Measure distance between two points on the pial surface (M)', onclick: () => this.toggleMeasure() }, 'Measure');
    const share = h('button', { type: 'button', class: 'tbtn', title: 'Copy a link to this exact view', onclick: () => this.copyLink(share) }, 'Copy link');
    const labelGroup = h('div', { class: 'tgroup seg', role: 'group', 'aria-label': 'Name labels' },
      h('span', { class: 'tlabel' }, 'Labels'),
      ...([['all', 'All', 'Name every highlighted label that faces you'], ['hover', 'Hover', 'Name only what you point at, select or hover in the list'], ['off', 'Off', 'No name labels']] as const)
        .map(([v, label, title]) => h('button', { type: 'button', class: 'tbtn', 'data-labels': v, 'aria-pressed': 'false', title: `${title} (N cycles)`, onclick: () => this.update((s) => { s.labels = v; }) }, label)));
    toolbar.append(presetGroup, hemiGroup, surfGroup, labelGroup, h('div', { class: 'tgroup' }, this.measureBtn, share));
    this.gizmo.setAttribute('viewBox', '-40 -40 80 80');
    this.gizmo.setAttribute('class', 'gizmo');
    this.gizmo.setAttribute('aria-hidden', 'true');
    const legendOpen = window.matchMedia('(min-width: 900px) and (min-height: 700px)').matches;
    const bottom = h('div', { class: 'stage-bottom' },
      h('details', { class: 'legend-box', open: legendOpen }, h('summary', {}, 'Legend'), this.legend),
      h('div', { class: 'readout-box' }, this.measureOut, this.readout));
    this.leaders.setAttribute('class', 'leaders');
    this.leaders.setAttribute('aria-hidden', 'true');
    this.stage.append(host, toolbar, this.surfLabels, this.leaders, this.labels, this.gizmo, bottom, this.tip, this.status);
    this.readout.textContent = 'Point at the surface for its MNI position';

    this.viewer = new Viewer<CortexState, CortexPlan>(host, {
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
    }, cortexScene);
    const origRender = this.viewer.renderer.render.bind(this.viewer.renderer);
    this.viewer.renderer.render = (sc, cam) => { origRender(sc, cam); this.placeLabels(); };
  }

  private setInflate(v: number): void {
    if (v && this.measureBtn.getAttribute('aria-pressed') === 'true') this.toggleMeasure();
    this.update((s) => { s.inflate = v; });
  }

  // ---------------------------------------------------------------- panel
  private buildPanel(): void {
    const handle = h('button', {
      type: 'button', class: 'sheet-handle', 'aria-label': 'Expand or collapse panel', 'aria-expanded': 'false',
      onclick: () => this.setSheet(this.sheetState === 'peek' ? 'full' : 'peek'),
    }, h('span', { class: 'grip' }));
    bindSheetDrag(handle, (st) => this.setSheet(st));
    const tablist = h('div', { class: 'ptabs', role: 'tablist', 'aria-label': 'Panel' });
    const names: [string, string][] = [['overview', 'Anatomy'], ['display', 'Display']];
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
  render(s: CortexState, opts: { camera: boolean }): void {
    const prev = this.s;
    this.s = s;
    this.viewer.apply(s, { animateCamera: opts.camera }).then(() => this.renderLegend());
    this.stage.querySelectorAll<HTMLButtonElement>('[data-hemi]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hemi === s.hemi)));
    this.stage.querySelectorAll<HTMLButtonElement>('.toolbar [data-labels]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.labels === s.labels)));
    this.stage.querySelectorAll<HTMLButtonElement>('[data-inflate]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.inflate) === s.inflate)));
    this.stage.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.toggleAttribute('data-active', b.dataset.preset === s.cam.preset));
    this.measureBtn.disabled = s.inflate > 0;
    const key = `${s.view}|${s.lobe}|${s.fn}|${s.sel}|${s.colour}`;
    if (key !== this.lastKey || !prev) { this.lastKey = key; this.renderOverview(); }
    this.renderDisplay();
    if (prev && prev.sel !== s.sel && s.sel) this.selectTab('overview', false);
  }

  private pickView(id: ViewId): void {
    this.update((st) => {
      const v = VIEW.get(id)!;
      st.view = id; st.hemi = v.hemi; st.cam = { preset: null }; st.sel = null; st.hidden = [];
    }, { camera: true });
  }

  private renderOverview(): void {
    const s = this.s;
    const pane = this.tabs.overview;
    clear(pane);
    const v = VIEW.get(s.view)!;
    pane.append(h('p', { class: 'chips-label' }, 'View'),
      chips(VIEWS.map((x) => [x.id, x.name]), v.id, (id) => this.pickView(id), { label: 'View', cls: 'grp-chips' }));
    pane.append(h('p', { class: 'chips-label' }, 'Lobe'),
      chips<string>([['all', 'All'], ...LOBES.map((l): [string, string] => [l.id, l.name])], s.lobe ?? 'all',
        (id) => this.update((st) => { st.lobe = id === 'all' ? null : (id as LobeId); st.sel = null; }), { label: 'Lobe', cls: 'grp-chips lobe-chips' }));
    pane.append(h('p', { class: 'chips-label' }, 'Function'),
      chips<string>([['none', 'None'], ...FN_GROUPS.map((g): [string, string] => [g.id, g.name])], s.fn ?? 'none',
        (id) => this.update((st) => { st.fn = id === 'none' ? null : (id as FnGroupId); st.sel = null; }), { label: 'Function', cls: 'grp-chips fn-chips' }));
    if (s.fn) pane.append(this.fnCard(s.fn));
    const ids = viewLabels(s);
    const btn = (id: string) => h('button', {
      type: 'button', class: 'chip sb-item', 'aria-pressed': String(s.sel === id), 'data-id': id,
      onclick: () => this.update((st) => { st.sel = st.sel === id ? null : id; }),
      onmouseenter: () => { this.legendHover = id; this.viewer.invalidate(); },
      onmouseleave: () => { this.legendHover = null; this.viewer.invalidate(); },
    }, h('span', { class: 'swatch', style: this.swatchStyle(id) }), shortName(id));
    pane.append(h('p', { class: 'chips-label' }, `Gyri and sulci in this view (${ids.length})`),
      h('div', { class: 'chips wrap sb-list' }, ...ids.map(btn)));
    if (s.sel) pane.append(s.sel === MEDIAL_WALL ? this.medialWallCard() : this.card(s.sel));
    const viewCard = h('article', { class: 'card' },
      h('p', { class: 'eyebrow' }, 'View'),
      h('h2', {}, `${v.name} view`),
      h('p', {}, v.description),
      h('p', { class: 'aside' }, 'Labels: the Destrieux 2009 parcellation of FreeSurfer, run on the MNI 2009b template brain shipped with Lead-DBS. One template, not an individual brain: the pattern of sulci varies between people.'));
    const lobeCard = s.lobe ? this.lobeCard(s.lobe) : null;
    if (s.sel) pane.append(h('details', { class: 'more' }, h('summary', {}, `About the ${v.name.toLowerCase()} view`), viewCard, lobeCard));
    else pane.append(...(lobeCard ? [lobeCard] : []), viewCard);
  }

  private swatchStyle(id: string): string {
    const l = LABEL.get(id);
    return this.s.colour === 'atlas' && l ? `--c: ${l.atlasColour}` : `--c: var(--c-${tokenOf(id)})`;
  }

  private defBlock(def: { text: string; url: string | null; scope?: string | null } | null, what: string): HTMLElement[] {
    if (!def) return [h('dt', {}, 'Definition'), h('dd', {}, `Z-Anatomy ships no definition for ${what}.`)];
    return [h('dt', {}, def.scope ? `About ${def.scope}` : 'Definition'), h('dd', {}, h('p', {}, def.text),
      h('p', { class: 'aside' }, 'From Wikipedia (CC BY-SA 3.0), as shipped with Z-Anatomy; not checked against the literature. ',
        def.url ? h('a', { href: def.url, target: '_blank', rel: 'noopener' }, 'Source page') : null))];
  }

  private card(id: string): HTMLElement {
    const close = h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: () => this.update((s) => { s.sel = null; }) }, '×');
    const l = LABEL.get(id);
    if (!l) return h('p', {}, '');
    const link = (to: string, text: string) => h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.sel = to; }) }, text);
    const lobes = l.lobes.map((x) => `${lobeName(x.lobe).toLowerCase()} ${pct(x.share)}`).join(', ');
    const borders = l.borders.filter((b) => b.id !== MEDIAL_WALL);
    return h('article', { class: 'card sel', style: `--accent: var(--c-${tokenOf(id)})` }, close,
      h('p', { class: 'eyebrow' }, `${KIND_LABEL[l.kind]} · ${l.lobes.map((x) => lobeName(x.lobe)).join(' / ')}`),
      h('h2', {}, h('span', { class: 'swatch', style: this.swatchStyle(id) }), shortName(id)),
      h('p', { class: 'aside' }, `Destrieux name: ${l.name} (${l.short}).`),
      h('dl', {},
        ...this.defBlock(l.definition, 'this label'),
        h('dt', {}, 'Seen on'), h('dd', {}, `${l.views.map((v) => VIEW_WORD[v]).join(', ')} views (Destrieux et al. 2010, Table 1).`),
        h('dt', {}, 'Lobe'), h('dd', {},
          l.lobeBy === 'name' ? `Shown with the ${lobeName(l.lobe).toLowerCase()}, as its Destrieux name places it. ` : '',
          `Measured: ${lobes} of its surface, by the Desikan-Killiany regions it overlaps, grouped into lobes as in Klein & Tourville 2012.`),
        borders.length ? [h('dt', {}, 'Borders (measured)'), h('dd', {}, h('ul', { class: 'plain' },
          ...borders.map((b) => h('li', {}, link(b.id, shortName(b.id)), ` · ${pct(b.share)} of its outline`))))] : null,
        l.dk.length ? [h('dt', {}, 'Desikan-Killiany regions (measured)'), h('dd', {}, h('ul', { class: 'plain' },
          ...l.dk.map((r) => h('li', {}, `${DK_NAMES[r.region]}: ${pct(r.labelInRegion)} of this label (${pct(r.regionInLabel)} of that region)`))))] : null,
        l.parcels.length ? [h('dt', {}, 'DBS section’s cortical areas (measured)'), h('dd', {}, h('ul', { class: 'plain' },
          ...l.parcels.map((p) => h('li', {}, `${DBS_PARCEL.get(p.id)!.name}: ${pct(p.labelInParcel)} of this label lies in it; ${pct(p.parcelInLabel)} of that area lies here`))),
          h('p', { class: 'aside' }, 'Overlap only: the DBS section’s motor areas come from HMAT (Mayka 2006), the cingulate and orbitofrontal ones from Desikan-Killiany; neither is the same thing as a Destrieux gyrus or sulcus.'))] : null,
        h('dt', {}, 'Surface area'), h('dd', {}, `Left ${fmtMm(l.areaCm2.L)} cm², right ${fmtMm(l.areaCm2.R)} cm² on this template; mean left ${fmtMm(l.paperAreaCm2.L)}, right ${fmtMm(l.paperAreaCm2.R)} cm² in the 12 manually labelled brains of Destrieux et al. 2010 (Table 1).`),
        h('dt', {}, 'Source'), h('dd', {}, 'Destrieux et al. 2010 parcellation (FreeSurfer aparc.a2009s) on the Lead-DBS template surface. ', h('a', { href: '#/credits' }, 'Licence and attribution'))));
  }

  private medialWallCard(): HTMLElement {
    const close = h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: () => this.update((s) => { s.sel = null; }) }, '×');
    return h('article', { class: 'card sel', style: '--accent: var(--c-cortex)' }, close,
      h('p', { class: 'eyebrow' }, 'Not cortex'),
      h('h2', {}, 'Medial wall'),
      h('p', {}, 'The part of the medial surface the Destrieux parcellation leaves unlabelled. In Destrieux et al. 2010 this “Medial_wall” groups non-cortical structures on the midline, including the hippocampus, thalamus, ventricles and corpus callosum, and is left out of their measurements.'));
  }

  private fnCard(id: FnGroupId): HTMLElement {
    const g = FN_GROUPS.find((x) => x.id === id)!;
    const areas = FUNCTIONS.filter((f) => f.group === id);
    const one = (n: number) => n.toFixed(1);
    return h('article', { class: 'card fn-card' },
      h('p', { class: 'eyebrow' }, 'Function'),
      h('h2', {}, g.name),
      h('ul', { class: 'fn-areas' }, ...areas.map((f) => h('li', {},
        h('span', { class: 'swatch', style: `--c: var(--c-${f.token})` }), h('strong', {}, f.name),
        ` · ${one(f.areaCm2.L)} cm² left, ${one(f.areaCm2.R)} cm² right on this surface`,
        f.labels.length ? h('span', { class: 'aside' }, ` (${f.labels.map(shortName).join(', ')})`) : ''))),
      h('p', {}, g.text, ' ', refLinksFrom(CTX_REFS, g.refIds)),
      h('p', { class: 'aside' }, 'Group-level definitions on one template brain, not an individual’s functional map: in a patient these areas are located by imaging or mapping, not by anatomy alone.'));
  }

  private lobeCard(id: LobeId): HTMLElement {
    const lb = LOBE.get(id)!;
    return h('article', { class: 'card', style: `--accent: var(--c-${lb.token})` },
      h('p', { class: 'eyebrow' }, 'Lobe'),
      h('h2', {}, h('span', { class: 'swatch', style: `--c: var(--c-${lb.token})` }), lb.name),
      h('dl', {}, ...this.defBlock(lb.definition, 'this lobe'),
        h('dt', {}, 'Labels'), h('dd', {}, `${lb.labels.length} Destrieux labels have at least 25% of their surface in this lobe (by Desikan-Killiany region, lobes as in Klein & Tourville 2012), or are named after it; a label on a lobe boundary belongs to both lobes.`)));
  }

  // ---------------------------------------------------------------- legend, labels, readout
  private renderLegend(): void {
    clear(this.legend);
    const s = this.s;
    const hidden = new Set(s.hidden);
    const row = (style: string, text: string, ids: string[]) => {
      const off = ids.length > 0 && ids.every((x) => hidden.has(x));
      return h('li', { class: off ? 'off' : '' },
        ids.length ? h('button', {
          type: 'button', class: 'eye', 'aria-pressed': String(!off), title: off ? 'Show' : 'Hide', 'aria-label': `${off ? 'Show' : 'Hide'} ${text}`,
          onclick: () => this.update((st) => { st.hidden = off ? st.hidden.filter((x) => !ids.includes(x)) : [...new Set([...st.hidden, ...ids])]; }),
        }, eyeIcon(!off)) : h('span', { class: 'eye-space' }),
        h('span', { class: 'sw patch', style }), h('span', { class: 'lg-text' }, text));
    };
    if (s.fn) {
      for (const f of FUNCTIONS.filter((x) => x.group === s.fn)) this.legend.append(row(`--c: var(--c-${f.token})`, f.name, [f.id]));
    } else if (s.colour === 'lobe') {
      // a label is coloured by the lobe holding most of it
      for (const lb of LOBES) this.legend.append(row(`--c: var(--c-${lb.token})`, lb.name, [...LABEL.values()].filter((l) => l.lobe === lb.id).map((l) => l.id)));
    } else if (s.colour === 'atlas') {
      this.legend.append(row('--c: conic-gradient(#dc143c, #ffd700, #3cb371, #4169e1, #9932cc, #dc143c)', 'Destrieux atlas colours (FreeSurfer colour table)', []));
    } else {
      this.legend.append(row('--c: var(--c-cortex)', 'Plain: only the selected label is coloured', []));
    }
    this.legend.append(row('--c: var(--c-cortex)', 'Medial wall (unlabelled)', [MEDIAL_WALL]));
    this.legend.append(h('li', { class: 'lg-note' }, 'Shading: light = gyral crown, dark = sulcal depth'));
    if (s.hidden.length) this.legend.append(h('li', { class: 'lg-actions' }, h('button', { type: 'button', class: 'linklike', onclick: () => this.update((st) => { st.hidden = []; }) }, `Show all (${s.hidden.length} hidden)`)));
  }

  private placeLabels(): void {
    drawGizmo(this.gizmo, this.viewer.axesScreen());
    const mode = this.s?.labels ?? 'hover';
    // "All": names written on the surface at each facing label's anchor, larger labels first, skipping overlaps
    clear(this.surfLabels);
    if (mode === 'all') {
      const W = this.stage.clientWidth;
      const pts = this.viewer.surfaceScreen().filter((p) => p.look === 'primary' && p.id !== this.s.sel)
        .sort((a, b) => (LABEL.get(b.id)?.areaCm2[b.side] ?? 0) - (LABEL.get(a.id)?.areaCm2[a.side] ?? 0));
      const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
      for (const p of pts) {
        const text = shortName(p.id);
        const w = Math.min(160, text.length * 6.2 + 8), hh = 16;
        const b = { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - hh / 2, y1: p.y + hh / 2 };
        if (b.x0 < 0 || b.x1 > W || b.y0 < 44) continue;
        if (boxes.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0)) continue;
        boxes.push(b);
        const el = h('span', { class: 'onsurf' }, text);
        el.style.transform = `translate(${Math.round(b.x0)}px, ${Math.round(b.y0)}px)`;
        el.style.width = `${Math.round(w)}px`;
        this.surfLabels.append(el);
      }
    }
    const items: LabelItem[] = [];
    if (mode !== 'off') for (const id of [this.legendHover, this.s?.sel]) {
      if (!id || items.some((x) => x.id === id)) continue;
      const a = this.viewer.anchorFor(id);
      if (a) items.push({ id, text: shortName(id), ax: a.x, ay: a.y, cls: 'slabel primary' });
    }
    layoutLabels(items, this.stage.clientWidth, this.stage.clientHeight, this.labels, this.leaders);
  }

  private showTip(info: PickInfo | null, x: number, y: number): void {
    if (!info || !info.id) { this.tip.hidden = true; return; }
    const r = this.stage.getBoundingClientRect();
    this.tip.hidden = false;
    this.tip.textContent = shortName(info.id) + (info.side ? (info.side === 'L' ? ' (left)' : ' (right)') : '');
    this.tip.style.transform = `translate(${Math.round(x - r.left + 14)}px, ${Math.round(y - r.top + 14)}px)`;
  }

  private showReadout(ras: THREE.Vector3 | null): void {
    if (!ras) return;
    clear(this.readout);
    if (this.s.inflate > 0) { this.readout.textContent = 'Inflated surface: positions are not MNI coordinates'; return; }
    this.readout.append(h('span', { class: 'k' }, 'MNI'), ` x ${fmtMm(ras.x)}  y ${fmtMm(ras.y)}  z ${fmtMm(ras.z)} mm`);
  }

  private toggleMeasure(): void {
    const on = this.measureBtn.getAttribute('aria-pressed') !== 'true';
    this.measureBtn.setAttribute('aria-pressed', String(on));
    this.viewer.setMeasuring(on);
    this.measurePts = [];
    this.measureOut.hidden = !on;
    this.measureOut.textContent = on ? 'Click or tap two points on the pial surface (straight-line distance).' : '';
  }

  private showMeasure(): void {
    const [a, b] = this.measurePts;
    this.measureOut.hidden = false;
    if (!b) { this.measureOut.textContent = `Point A: ${[a.x, a.y, a.z].map(fmtMm).join(', ')}. Pick point B.`; return; }
    this.measureOut.textContent = `Distance ${fmtMm(a.distanceTo(b))} mm (straight line, template brain)`;
  }

  private async copyLink(btn: HTMLElement): Promise<void> {
    try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Link copied'; }
    catch { window.prompt('Copy this link', location.href); }
    setTimeout(() => { btn.textContent = 'Copy link'; }, 1600);
  }

  // ---------------------------------------------------------------- display
  private renderDisplay(): void {
    const pane = this.tabs.display;
    const s = this.s;
    if (!pane.childElementCount) {
      const modes: [ColourMode, string, string][] = [
        ['lobe', 'By lobe', 'each label in the colour of the lobe holding most of it (cingulate and circular insular labels: the lobe their name gives)'],
        ['atlas', 'Atlas colours', 'each label in its own colour (FreeSurfer’s Destrieux colour table)'],
        ['plain', 'Plain', 'grey surface; only the selected label is coloured'],
      ];
      pane.append(h('h3', {}, 'Colour'),
        h('fieldset', { class: 'seg-field' }, h('legend', { class: 'vh' }, 'Colour'),
          ...modes.map(([v, label, note]) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'ctxcol', value: v, onchange: () => this.update((st) => { st.colour = v; }) }), h('span', {}, h('strong', {}, label), ` · ${note}`)))),
        h('h3', {}, 'Surface'),
        h('label', { class: 'range wide' }, h('span', {}, 'Opacity'),
          h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, 'data-k': 'op', oninput: (e: Event) => this.update((st) => { st.layers.cortex.opacity = parseFloat((e.target as HTMLInputElement).value); }) })),
        h('fieldset', { class: 'seg-field' }, h('legend', {}, 'Cut away a hemisphere'),
          ...([['none', 'Nothing'], ['L', 'Left'], ['R', 'Right']] as const).map(([v, label]) =>
            h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'ctxcut', value: v, onchange: () => this.update((st) => { st.cutSide = v; }) }), label))),
        h('p', { class: 'aside' }, `The inflated surface is computed for this site by smoothing the pial surface (${this.methodNote()}); it is not FreeSurfer’s inflated surface, and positions on it are not MNI coordinates.`));
    }
    pane.querySelectorAll<HTMLInputElement>('input[name=ctxcol]').forEach((r) => { r.checked = r.value === s.colour; });
    pane.querySelectorAll<HTMLInputElement>('input[name=ctxcut]').forEach((r) => { r.checked = r.value === s.cutSide; });
    (pane.querySelector('[data-k=op]') as HTMLInputElement).value = String(s.layers.cortex.opacity);
  }

  private methodNote(): string {
    return `${METHOD.inflateIterations} steps, each moving every vertex halfway toward the average of its neighbours, keeping the overall size`;
  }

  // ---------------------------------------------------------------- keyboard
  handleKey(e: KeyboardEvent): boolean {
    const k = e.key;
    const preset = PRESETS.find((p) => p[2] === k);
    if (preset) { this.update((s) => { s.cam = { preset: preset[0] }; if (preset[0] === 'medial' && s.hemi === 'both') s.hemi = 'L'; }, { camera: true }); return true; }
    if (k === 'h' || k === 'H') { this.update((s) => { s.hemi = s.hemi === 'both' ? 'L' : s.hemi === 'L' ? 'R' : 'both'; }); return true; }
    if (k === 'i' || k === 'I') { this.setInflate(this.s.inflate ? 0 : 1); return true; }
    if ((k === 'm' || k === 'M') && !this.s.inflate) { this.toggleMeasure(); return true; }
    if (k === 'n' || k === 'N') { this.update((s) => { s.labels = s.labels === 'hover' ? 'all' : s.labels === 'all' ? 'off' : 'hover'; }); return true; }
    if (k === 'Escape') {
      if (this.measureBtn.getAttribute('aria-pressed') === 'true') { this.toggleMeasure(); return true; }
      if (this.s.sel) { this.update((s) => { s.sel = null; }); return true; }
    }
    return false;
  }

  onShow(): void { this.viewer.invalidate(); }
}
