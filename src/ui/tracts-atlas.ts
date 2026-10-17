import * as THREE from 'three';
import type { CameraPreset } from '../data/schema';
import type { Hemi, LayerKey } from '../state';
import { connectedAreas, CONNECTOME, GROUP, TOPIC, WM, WM_MAN, WM_REF } from '../tracts';
import type { Claim, TractTopic } from '../tracts/schema';
import { CONTEXT_STRUCTURES, ORIENTATION_NUCLEI, tractsScene, type TractPlan } from '../tracts/scene';
import type { TractsState } from '../tracts/state';
import { Viewer, type PickInfo } from '../viewer/Viewer';
import { h } from './h';
import { refLinksFrom } from './reflinks';
import { bindSheetDrag, buildSlicesPane, drawGizmo, layoutLabels, syncSlicesPane, type LabelItem } from './stage';
import { chips, clear, fmtMm } from './widgets';

type Update = (fn: (s: TractsState) => void, opts?: { camera?: boolean }) => void;

const PRESETS: [CameraPreset, string, string, string][] = [
  ['lateral', 'Lateral', '1', 'Lat'], ['medial', 'Medial', '2', 'Med'], ['coronal', 'Coronal', '3', 'Cor'],
  ['axial', 'Axial', '4', 'Ax'], ['posteriorOblique', 'Post-oblique', '5', 'Obl'],
];
const LAYERS: [LayerKey, string][] = [['tracts', 'Tracts'], ['cortex', 'Cortex'], ['nuclei', 'Deep nuclei (orientation)']];
const TYPE_LABEL = { association: 'Association tract', projection: 'Projection tract', commissural: 'Commissural tract', cerebellar: 'Cerebellar tract' } as const;
const TIER_LABEL = { core: 'Core', extended: 'Extended', fossa: 'Posterior fossa' } as const;
const TIER_NOTE = { core: 'the tracts that matter most in surgery', extended: 'further tracts, less often decisive', fossa: 'cerebellar and brainstem pathways' } as const;
const CONTEXT = new Map(CONTEXT_STRUCTURES.map((m) => [m.id, m]));

const refs = (ids: string[]) => refLinksFrom(WM_REF, ids);
const claimList = (cl: Claim[]) => h('ul', { class: 'evidence' }, ...cl.map((c) => h('li', {}, c.text, ' ', refs(c.refIds))));
const nameOf = (id: string) => WM_MAN.get(id)?.name ?? CONTEXT.get(id)?.name ?? id;
const tokenOf = (id: string) => WM_MAN.get(id)?.colour.token ?? CONTEXT.get(id)?.colour.token ?? 'ctx';

/** The 3D page of the white-matter section: tract groups, tract cards, layers and slices. */
export class TractsAtlasPage {
  readonly el: HTMLElement;
  viewer!: Viewer<TractsState, TractPlan>;
  private s!: TractsState;
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
    this.panel = h('aside', { class: 'panel', 'aria-label': 'Tracts and tools', 'data-sheet': 'peek' });
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
    const hemiGroup = h('div', { class: 'tgroup seg', role: 'group', 'aria-label': 'Hemisphere' });
    for (const [v, label, short] of [['L', 'Left', 'L'], ['both', 'Both', 'L+R'], ['R', 'Right', 'R']] as [Hemi, string, string][]) {
      hemiGroup.append(h('button', {
        type: 'button', class: 'tbtn', 'data-hemi': v, 'aria-pressed': 'false', title: `${label} hemisphere (H cycles)`, 'aria-label': `${label} hemisphere`,
        onclick: () => this.update((s) => { s.hemi = v; s.cam = { preset: s.cam.preset }; }, { camera: true }),
      }, h('span', { class: 'long' }, label), h('span', { class: 'short', 'aria-hidden': 'true' }, short)));
    }
    this.measureBtn = h('button', {
      type: 'button', class: 'tbtn', 'aria-pressed': 'false', title: 'Measure distance between two points (M)',
      onclick: () => this.toggleMeasure(),
    }, 'Measure');
    const share = h('button', { type: 'button', class: 'tbtn', title: 'Copy a link to this exact view', onclick: () => this.copyLink(share) }, 'Copy link');
    const labelGroup = h('div', { class: 'tgroup seg', role: 'group', 'aria-label': 'Name labels' },
      h('span', { class: 'tlabel' }, 'Labels'),
      ...([['all', 'All', 'Label every tract in the group'], ['hover', 'Hover', 'Label only what you point at, select or hover in the legend'], ['off', 'Off', 'No name labels (clean images)']] as const)
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
    this.readout.textContent = 'Point at a tract for MNI coordinates';

    this.viewer = new Viewer<TractsState, TractPlan>(host, {
      hover: (info, x, y) => this.showTip(info, x, y),
      pick: (info) => { if ((info.kind === 'structure') && info.id && WM_MAN.has(info.id)) this.update((s) => { s.sel = info.id; }); },
      readout: (ras) => this.showReadout(ras),
      measure: (pts) => { this.measurePts = pts; this.showMeasure(); },
      cameraChanged: (pos, tgt) => this.update((s) => {
        s.cam = { preset: s.cam.preset, pos: [pos.x, pos.y, pos.z], tgt: [tgt.x, tgt.y, tgt.z] };
      }, { camera: false }),
      leadMoved: () => undefined,
      status: (t) => { this.status.hidden = !t; this.status.textContent = t ?? ''; },
      lead: () => undefined,
      moving: (on) => this.stage.classList.toggle('moving', on),
    }, tractsScene);
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
    const names: [string, string][] = [['overview', 'Tracts'], ['layers', 'Layers'], ['slices', 'Slices']];
    for (const [id, label] of names) {
      const b = h('button', {
        type: 'button', role: 'tab', class: 'ptab', id: `ptab-${id}`, 'aria-controls': `pane-${id}`,
        'aria-selected': id === 'overview' ? 'true' : 'false', tabindex: id === 'overview' ? 0 : -1,
        onclick: () => this.selectTab(id),
        onkeydown: (e: Event) => {
          const k = (e as KeyboardEvent).key;
          if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
          e.preventDefault();
          const i = names.findIndex(([n]) => n === id);
          const n = names[(i + (k === 'ArrowRight' ? 1 : -1) + names.length) % names.length][0];
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
  render(s: TractsState, opts: { camera: boolean }): void {
    const prev = this.s;
    this.s = s;
    this.viewer.apply(s, { animateCamera: opts.camera }).then(() => this.renderLegend());
    this.stage.querySelectorAll<HTMLButtonElement>('[data-hemi]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hemi === s.hemi)));
    this.stage.querySelectorAll<HTMLButtonElement>('.toolbar [data-labels]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.labels === s.labels)));
    this.stage.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.toggleAttribute('data-active', b.dataset.preset === s.cam.preset));
    const key = `${s.grp}|${s.sel}`;
    if (key !== this.lastKey || !prev) { this.lastKey = key; this.renderOverview(); }
    this.renderLayers();
    this.renderSlices();
    if (prev && prev.sel !== s.sel && s.sel) this.selectTab('overview', false);
  }

  private renderOverview(): void {
    const s = this.s;
    const pane = this.tabs.overview;
    clear(pane);
    const g = GROUP.get(s.grp)!;
    const pick = (v: string) => this.update((st) => {
      const ng = GROUP.get(v)!;
      st.grp = v; st.hemi = ng.hemi; st.cam = { preset: null }; st.hidden = [];
      if (st.sel && !ng.tractIds.includes(st.sel)) st.sel = null;
    }, { camera: true });
    const inTier = WM.groups.filter((x) => x.tier === g.tier);
    pane.append(
      h('div', { class: 'tier-switch', role: 'group', 'aria-label': 'Tract set' },
        ...(['core', 'extended', 'fossa'] as const).map((t) => h('button', {
          type: 'button', class: 'tier-btn', 'aria-pressed': String(g.tier === t), 'data-tier': t,
          onclick: () => { if (g.tier !== t) pick(WM.groups.find((x) => x.tier === t)!.id); },
        }, h('strong', {}, TIER_LABEL[t]), h('span', {}, TIER_NOTE[t])))),
      h('p', { class: 'chips-label' }, 'By function'),
      // "All" leads the function row so every tract of the set (e.g. the corpus callosum) is one click away
      chips(inTier.filter((x) => x.kind === 'all' || x.kind === 'function').sort((x, y) => Number(y.kind === 'all') - Number(x.kind === 'all'))
        .map((x) => [x.id, x.kind === 'all' ? 'All' : x.name]), g.id, pick, { label: 'Tracts by function', cls: 'grp-chips' }),
      h('p', { class: 'chips-label' }, 'By anatomy'),
      chips(inTier.filter((x) => x.kind === 'anatomy').map((x) => [x.id, x.name]), g.id, pick, { label: 'Tracts by anatomy', cls: 'grp-chips' }));
    pane.append(h('ul', { class: 'tract-list', 'aria-label': `Tracts in ${g.name}` }, ...g.tractIds.map((id) => h('li', {},
      h('button', {
        type: 'button', class: 'tract-btn', 'aria-pressed': String(s.sel === id), 'data-tract': id,
        onclick: () => this.update((st) => { st.sel = st.sel === id ? null : id; st.hidden = st.hidden.filter((x) => x !== id); }),
      }, h('span', { class: 'swatch', style: `--c: var(--c-${tokenOf(id)})` }), TOPIC.get(id)!.abbr, h('span', { class: 'tract-full' }, ` ${nameOf(id)}`))))));
    if (s.sel && TOPIC.has(s.sel)) pane.append(this.tractCard(TOPIC.get(s.sel)!));
    const groupCard = h('article', { class: 'card' },
      h('p', { class: 'eyebrow' }, `${TIER_LABEL[g.tier]} · ${g.kind === 'function' ? 'by function' : g.kind === 'anatomy' ? 'by anatomy' : 'overview'}`),
      h('h2', {}, g.name),
      g.rationale.length ? claimList(g.rationale) : h('p', {}, `Every ${TIER_LABEL[g.tier].toLowerCase()} tract. Pick a tract above for its card.`),
      h('details', { class: 'more' }, h('summary', {}, 'How far to trust a group-average atlas'), claimList(WM.general)));
    if (s.sel) pane.append(h('details', { class: 'more' }, h('summary', {}, `About ${g.name}`), groupCard));
    else pane.append(groupCard);
  }

  private tractCard(t: TractTopic): HTMLElement {
    const m = WM_MAN.get(t.id)!;
    const close = h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: () => this.update((s) => { s.sel = null; }) }, '×');
    const section = (title: string, cl: Claim[]) => (cl.length ? [h('dt', {}, title), h('dd', {}, claimList(cl))] : null);
    const areas = (side: 'L' | 'R') => connectedAreas(t.id, side).map((a) => a.area.replace(/^BA/, '')).join(', ');
    const measured = CONNECTOME.tracts[t.id]
      ? [h('dt', {}, 'Cortical connections measured in the atlas'),
        h('dd', {},
          h('p', { class: 'areas' }, h('strong', {}, 'Left: '), `BA ${areas('L')}`, h('br'), h('strong', {}, 'Right: '), `BA ${areas('R')}`),
          h('p', { class: 'aside' }, `Brodmann areas the tract reached in at least ${Math.round(CONNECTOME.min * 100)}% of the 1065 subjects, from the published tract-to-region table. Group-level tractography can include false connections.`, ' ', refs(['yeh2022'])))]
      : null;
    const groups = WM.groups.filter((g) => g.kind !== 'all' && g.tractIds.includes(t.id));
    return h('article', { class: 'card sel', style: `--accent: var(--c-${m.colour.token})` }, close,
      h('p', { class: 'eyebrow' }, `${TYPE_LABEL[t.type]} · ${TIER_LABEL[t.tier]}`),
      h('h2', {}, h('span', { class: 'swatch', style: `--c: var(--c-${m.colour.token})` }), `${t.name} (${t.abbr})`),
      t.aliases.length ? h('p', { class: 'aside' }, 'Also: ', t.aliases.join(', ')) : null,
      h('p', { class: 'lead-text' }, t.summary),
      h('dl', {},
        section('Course', t.course),
        section('Connections', t.connections),
        measured,
        section('Function', t.functions),
        section('Damage and stimulation', t.deficits),
        section('Surgical relevance', t.surgery),
        section('This atlas’s tract', t.atlas),
        t.measured.length ? [h('dt', {}, 'Checked by this project’s pipeline'), h('dd', {}, ...t.measured.map((m) => h('p', {}, m)))] : null,
        t.parcels.length ? [h('dt', {}, 'Cortex highlighted'), h('dd', {}, t.parcels.map(nameOf).join(', '), ' (HMAT, Mayka 2006; ', h('a', { href: '#/credits' }, 'credits'), ').')] : null,
        h('dt', {}, 'Geometry'),
        h('dd', {}, `${m.source}. ${m.derivation} Shown: ${m.streamlines!.L} of ${m.sourceStreamlines!.L} streamlines (left), ${m.streamlines!.R} of ${m.sourceStreamlines!.R} (right). `,
          h('a', { href: '#/credits' }, 'Licence (CC BY-SA 4.0) and HCP acknowledgement')),
        groups.length ? [h('dt', {}, 'In groups'), h('dd', {}, ...groups.flatMap((g, i) => [i ? ', ' : '',
          h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.grp = g.id; s.hemi = g.hemi; s.cam = { preset: null }; }, { camera: true }) }, g.name)]))] : null,
      ),
    );
  }

  // ---------------------------------------------------------------- legend, labels, readout
  private renderLegend(): void {
    const p = this.viewer.currentPlan();
    clear(this.legend);
    if (!p) return;
    const hidden = new Set(this.s.hidden);
    const li = (cls: string, id: string, text: string) => {
      const off = hidden.has(id);
      const on = this.s.sel === id;
      const hover = (v: string | null) => () => { this.legendHover = v; this.viewer.invalidate(); };
      return h('li', { class: `${off ? 'off' : ''} ${on ? 'on' : ''}`, onmouseenter: hover(id), onmouseleave: hover(null), onfocusin: hover(id), onfocusout: hover(null) },
        h('button', {
          type: 'button', class: 'eye', 'aria-pressed': String(!off), title: off ? 'Show' : 'Hide', 'aria-label': `${off ? 'Show' : 'Hide'} ${text}`,
          onclick: () => this.update((s) => {
            s.hidden = off ? s.hidden.filter((x) => x !== id) : [...s.hidden, id];
            if (!off && s.sel === id) s.sel = null;
          }),
        }, h('span', { 'aria-hidden': 'true' }, off ? '○' : '●')),
        h('span', { class: `sw ${cls}`, style: `--c: var(--c-${tokenOf(id)})` }),
        h('button', {
          type: 'button', class: 'lg-item', 'aria-pressed': String(on), title: on ? 'Remove highlight' : 'Highlight and open card',
          disabled: !TOPIC.has(id),
          onclick: () => this.update((s) => { s.sel = s.sel === id ? null : id; if (s.sel) s.hidden = s.hidden.filter((x) => x !== id); }),
        }, text));
    };
    if (this.s.layers.tracts.on) for (const id of p.tracts.keys()) this.legend.append(li('line key', id, `${TOPIC.get(id)?.abbr ?? ''} · ${nameOf(id)}`));
    if (this.s.layers.cortex.on) for (const id of p.parcels.keys()) this.legend.append(li('patch', id, nameOf(id)));
    if (this.s.hidden.length || this.s.sel) {
      this.legend.append(h('li', { class: 'lg-actions' },
        this.s.hidden.length ? h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.hidden = []; }) }, `Show all (${this.s.hidden.length} hidden)`) : null,
        this.s.sel ? h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.sel = null; }) }, 'Clear highlight') : null));
    }
  }

  private placeLabels(): void {
    drawGizmo(this.gizmo, this.viewer.axesScreen());
    const mode = this.s?.labels ?? 'all';
    const items: LabelItem[] = [];
    const have = new Set<string>();
    const add = (id: string, text: string, ax: number, ay: number, cls: string) => { if (!have.has(id)) { have.add(id); items.push({ id, text, ax, ay, cls }); } };
    if (mode === 'all') for (const p of this.viewer.structureScreen()) if (TOPIC.has(p.id)) add(p.id, TOPIC.get(p.id)!.abbr, p.x, p.y, 'slabel primary');
    if (mode !== 'off') {
      for (const id of [this.legendHover, this.s?.sel]) {
        if (!id || have.has(id)) continue;
        const a = this.viewer.anchorFor(id);
        if (a) add(id, TOPIC.get(id)?.abbr ?? nameOf(id), a.x, a.y, 'slabel primary');
      }
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
    this.readout.append(h('span', { class: 'k' }, 'MNI'), ` x ${fmtMm(ras.x)}  y ${fmtMm(ras.y)}  z ${fmtMm(ras.z)} mm`);
  }

  private toggleMeasure(): void {
    const on = this.measureBtn.getAttribute('aria-pressed') !== 'true';
    this.measureBtn.setAttribute('aria-pressed', String(on));
    this.viewer.setMeasuring(on);
    this.measurePts = [];
    this.measureOut.hidden = !on;
    this.measureOut.textContent = on ? 'Click or tap two points on any tract or slice.' : '';
  }

  private showMeasure(): void {
    const [a, b] = this.measurePts;
    this.measureOut.hidden = false;
    if (!b) { this.measureOut.textContent = `Point A: ${[a.x, a.y, a.z].map(fmtMm).join(', ')}. Pick point B.`; return; }
    this.measureOut.textContent = `Distance ${fmtMm(a.distanceTo(b))} mm  (A ${[a.x, a.y, a.z].map(fmtMm).join(', ')} → B ${[b.x, b.y, b.z].map(fmtMm).join(', ')})`;
  }

  private async copyLink(btn: HTMLElement): Promise<void> {
    try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Link copied'; }
    catch { window.prompt('Copy this link', location.href); }
    setTimeout(() => { btn.textContent = 'Copy link'; }, 1600);
  }

  // ---------------------------------------------------------------- layers / slices tabs
  private renderLayers(): void {
    const pane = this.tabs.layers;
    const s = this.s;
    if (!pane.childElementCount) {
      const rows = LAYERS.map(([k, label]) => h('div', { class: 'layer', 'data-layer': k },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e: Event) => this.update((st) => { st.layers[k].on = (e.target as HTMLInputElement).checked; }) }), label),
        h('label', { class: 'range' }, h('span', { class: 'vh' }, `${label} opacity`),
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, oninput: (e: Event) => this.update((st) => { st.layers[k].opacity = parseFloat((e.target as HTMLInputElement).value); }) }))));
      pane.append(h('h3', {}, 'Layers'), ...rows,
        h('p', { class: 'aside' }, `Deep nuclei shown faintly for orientation: ${ORIENTATION_NUCLEI.map(nameOf).join(', ')} (from the DBS section’s atlases). Tracts load when first needed.`),
        ...(['core', 'extended', 'fossa'] as const).flatMap((tier) => [h('h3', {}, `${TIER_LABEL[tier]} tracts`),
          h('ul', { class: 'index-flat' }, ...WM.topics.filter((t) => t.tier === tier).map((t) => h('li', {}, h('span', { class: 'swatch', style: `--c: var(--c-${tokenOf(t.id)})` }),
            h('button', { type: 'button', class: 'linklike', onclick: () => this.update((st) => { st.sel = t.id; }) }, `${t.name} (${t.abbr})`))))]));
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
      buildSlicesPane<TractsState>(pane, this.update, {
        cut: 'Removes everything on that side of the midline (x = 0): tracts, cortex and nuclei. The slices stay whole.',
        seq: 'ICBM 2009b templates. The tracts come from an atlas built in ICBM 2009a space; along each tract the 2009b T1 is white-matter bright and no 2 mm shift improves the fit (see Credits). Each sequence loads on first use (about 3 MB).',
        footer: 'Slices show the ICBM 2009b nonlinear asymmetric templates: 0.5 mm inside a subcortical box, 1.5 mm elsewhere.',
      });
    }
    syncSlicesPane(pane, this.s);
  }

  // ---------------------------------------------------------------- keyboard
  handleKey(e: KeyboardEvent): boolean {
    const k = e.key;
    const preset = PRESETS.find((p) => p[2] === k);
    if (preset) { this.update((s) => { s.cam = { preset: preset[0] }; }, { camera: true }); return true; }
    if (k === 'h' || k === 'H') { this.update((s) => { s.hemi = s.hemi === 'both' ? 'L' : s.hemi === 'L' ? 'R' : 'both'; s.cam = { preset: s.cam.preset }; }, { camera: true }); return true; }
    if (k === 'm' || k === 'M') { this.toggleMeasure(); return true; }
    if (k === 'n' || k === 'N') { this.update((s) => { s.labels = s.labels === 'all' ? 'hover' : s.labels === 'hover' ? 'off' : 'all'; }); return true; }
    if (k === 's' || k === 'S') { this.update((s) => { s.clip.axial.on = !s.clip.axial.on; }); return true; }
    if (k === ']' || k === '[') {
      const ids = GROUP.get(this.s.grp)!.tractIds;
      const i = this.s.sel ? ids.indexOf(this.s.sel) : -1;
      const n = ids[(i + (k === ']' ? 1 : -1) + ids.length) % ids.length];
      this.update((s) => { s.sel = n; });
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
