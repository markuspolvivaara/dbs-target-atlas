import * as THREE from 'three';
import { CONTENT, IND, MAN, MANIFEST, STRUCT, SYM, TGT } from '../data';
import { mniToAcpc } from '../data/acpc';
import type { CameraPreset, Evidence } from '../data/schema';
import { IMAGING } from '../data/imaging';
import type { AppState, Hemi, LayerKey } from '../state';
import { DEFAULT_LEAD, LEAD_ANCHORS, type LeadAnchor } from '../state';
import { LEAD } from '../viewer/lead';
import { dbsScene, LANDMARKS, type Plan } from '../viewer/selection';
import { Viewer, type PickInfo } from '../viewer/Viewer';
import { chips, clear, fmtMm, h, refLinks } from './dom';
import { clearAllLeadPrefs, clearLeadPref, isHidden, leadPrefFor, saveLeadDefault, saveLeadPref, visibleIndications } from './prefs';
import { primaryTargetId } from '../viewer/selection';
import { bindSheetDrag, buildSlicesPane, drawGizmo, layoutLabels, syncSlicesPane, type LabelItem } from './stage';

type Update = (fn: (s: AppState) => void, opts?: { camera?: boolean }) => void;

const PRESETS: [CameraPreset, string, string, string][] = [
  ['coronal', 'Coronal', '1', 'Cor'], ['sagittal', 'Sagittal', '2', 'Sag'], ['axial', 'Axial', '3', 'Ax'],
  ['posteriorOblique', 'Post-oblique', '4', 'Obl'], ['surgeon', "Surgeon's view", '5', 'Surg'],
];
const LAYERS: [LayerKey, string][] = [['nuclei', 'Nuclei'], ['tracts', 'Tracts'], ['cortex', 'Cortex'], ['targets', 'Targets'], ['electrode', 'Electrode']];

const ANCHOR_LABEL: Record<LeadAnchor, string> = {
  centre: 'Centre of the contact array', c0: 'Centre of C0 (deepest contact)', c1: 'Centre of C1', c2: 'Centre of C2',
  c3: 'Centre of C3 (shallowest contact)', tip: 'Lead tip',
};

export class AtlasPage {
  readonly el: HTMLElement;
  viewer!: Viewer<AppState, Plan>;
  private s!: AppState;
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
  /** Structure / marker whose legend row the pointer is over: labelled in 3D in "hover" mode. */
  private legendHover: string | null = null;
  private gizmo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite', hidden: true });
  private measureBtn!: HTMLButtonElement;
  private leadInfo = h('div', { class: 'lead-info' });
  private sheetState: 'peek' | 'full' = 'peek';
  private measurePts: THREE.Vector3[] = [];
  private lastPlanKey = '';

  constructor(private update: Update) {
    this.stage = h('section', { class: 'stage', 'aria-label': '3D viewer' });
    this.panel = h('aside', { class: 'panel', 'aria-label': 'Indication and tools', 'data-sheet': 'peek' });
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
        onclick: () => this.update((s) => { s.hemi = v; }),
      }, h('span', { class: 'long' }, label), h('span', { class: 'short', 'aria-hidden': 'true' }, short)));
    }
    this.measureBtn = h('button', {
      type: 'button', class: 'tbtn', 'aria-pressed': 'false', title: 'Measure distance between two points (M)',
      onclick: () => this.toggleMeasure(),
    }, 'Measure');
    const share = h('button', { type: 'button', class: 'tbtn', title: 'Copy a link to this exact view', onclick: () => this.copyLink(share) }, 'Copy link');
    const labelGroup = h('div', { class: 'tgroup seg', role: 'group', 'aria-label': 'Name labels' },
      h('span', { class: 'tlabel' }, 'Labels'),
      ...([['all', 'All', 'Always show name labels'], ['hover', 'Hover', 'Label only what you point at, select or hover in the legend'], ['off', 'Off', 'No name labels (clean images)']] as const)
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
    this.readout.textContent = 'Point at a structure for MNI coordinates';

    this.viewer = new Viewer<AppState, Plan>(host, {
      hover: (info, x, y) => this.showTip(info, x, y),
      pick: (info) => this.onPick(info),
      readout: (ras) => this.showReadout(ras),
      measure: (pts) => { this.measurePts = pts; this.showMeasure(); },
      cameraChanged: (pos, tgt) => this.update((s) => {
        s.cam = { preset: s.cam.preset, pos: [pos.x, pos.y, pos.z], tgt: [tgt.x, tgt.y, tgt.z] };
      }, { camera: false }),
      leadMoved: (d) => this.editLead((s) => { s.lead.depth = d; }),
      status: (t) => { this.status.hidden = !t; this.status.textContent = t ?? ''; },
      lead: (c) => this.showLead(c),
      moving: (on) => this.stage.classList.toggle('moving', on),
    }, dbsScene);
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
    const names: [string, string][] = [['overview', 'Overview'], ['layers', 'Layers'], ['slices', 'Slices'], ['lead', 'Lead']];
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
  render(s: AppState, opts: { camera: boolean }): void {
    const prev = this.s;
    this.s = s;
    this.viewer.apply(s, { animateCamera: opts.camera }).then(() => this.renderLegend());
    this.stage.querySelectorAll<HTMLButtonElement>('[data-hemi]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hemi === s.hemi)));
    this.stage.querySelectorAll<HTMLButtonElement>('.toolbar [data-labels]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.labels === s.labels)));
    this.stage.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.toggleAttribute('data-active', b.dataset.preset === s.cam.preset));
    const key = `${s.ind}|${s.sym}|${s.sel}`;
    if (key !== this.lastPlanKey || !prev) { this.lastPlanKey = key; this.renderOverview(); }
    this.renderLayers();
    this.renderSlices();
    this.renderLead();
    if (prev && prev.sel !== s.sel && s.sel) this.selectTab('overview', false);
  }

  private renderOverview(): void {
    const s = this.s;
    const pane = this.tabs.overview;
    clear(pane);
    const ind = IND.get(s.ind)!;
    pane.append(chips(visibleIndications(ind.id).map((i) => [i.id, isHidden(i.id) ? `${i.label} (hidden)` : i.label]), ind.id, (v) => this.update((st) => {
      st.ind = v; st.sym = null; st.sel = null; st.cam = { preset: null };
    }, { camera: true }), { label: 'Indication', cls: 'ind-chips' }));
    if (ind.symptomIds.length) {
      const items: [string, string][] = [['', 'Whole indication'], ...ind.symptomIds.map((id) => [id, SYM.get(id)!.name] as [string, string])];
      pane.append(h('p', { class: 'chips-label' }, 'Symptom'));
      pane.append(chips(items, s.sym ?? '', (v) => this.update((st) => { st.sym = v || null; st.sel = null; st.cam = { preset: null }; }, { camera: true }), { label: 'Symptom', cls: 'sym-chips' }));
    }
    if (s.sel) pane.append(this.selectionCard(s.sel));
    const sym = s.sym ? SYM.get(s.sym) : null;
    if (sym) pane.append(this.symptomCard(sym.id));
    const card = this.indicationCard(ind.id);
    if (sym) pane.append(h('details', { class: 'more' }, h('summary', {}, `About ${ind.name}`), card));
    else pane.append(card);
  }

  private evidenceList(ev: Evidence[]): HTMLElement {
    return h('ul', { class: 'evidence' }, ...ev.map((e) => h('li', {}, e.claim, ' ', refLinks(e.refIds))));
  }

  private indicationCard(id: string): HTMLElement {
    const d = IND.get(id)!;
    const dl = h('dl', {},
      h('dt', {}, 'Target'), h('dd', {}, d.target),
      h('dt', {}, 'Alternatives'), h('dd', {}, d.alternatives),
      h('dt', {}, 'Why here'), h('dd', {}, d.why),
      d.howToChoose ? [h('dt', {}, 'How to choose'), h('dd', {}, d.howToChoose)] : null,
      h('dt', {}, 'Imaging'), h('dd', {}, d.imaging, ' ', this.imagingLinks(d.primaryTargets)),
      h('dt', {}, 'Evidence'), h('dd', {}, this.evidenceList(d.evidence)),
    );
    const card = h('article', { class: 'card', style: `--accent: var(--c-${d.accent})` },
      h('h2', {}, d.name), dl,
      h('p', { class: 'caveat' }, h('strong', {}, 'Watch out. '), d.caveat, d.caveatRefIds.length ? ' ' : '', refLinks(d.caveatRefIds)),
      this.shownList(), this.missing(d.missingTracts),
    );
    return card;
  }

  private symptomCard(id: string): HTMLElement {
    const d = SYM.get(id)!;
    const ind = IND.get(d.indicationId)!;
    const t = d.targetId ? TGT.get(d.targetId) : null;
    return h('article', { class: 'card', style: `--accent: var(--c-${ind.accent})` },
      h('p', { class: 'eyebrow' }, ind.name),
      h('h2', {}, d.name),
      h('p', { class: 'lead-text' }, d.summary),
      t ? h('p', {}, h('strong', {}, 'Marker: '), t.label, ' ', this.kindBadge(t.kind), ' ', refLinks([t.refId])) : null,
      h('dl', {}, h('dt', {}, 'Evidence'), h('dd', {}, this.evidenceList(d.evidence))),
      d.note ? h('p', { class: 'caveat' }, h('strong', {}, 'Shown here. '), d.note, d.noteRefIds.length ? ' ' : '', refLinks(d.noteRefIds)) : null,
      this.shownList(),
    );
  }

  private kindBadge(kind: 'sweetSpot' | 'atlasCoordinate'): HTMLElement {
    return h('span', { class: `badge ${kind}` }, kind === 'sweetSpot' ? 'Published sweet spot' : 'Atlas coordinate');
  }

  private imagingLinks(ids: string[]): DocumentFragment {
    const f = document.createDocumentFragment();
    const imgs = IMAGING.filter((m) => ids.includes(m.structureId));
    if (!imgs.length) return f;
    imgs.forEach((m, i) => {
      f.append(i ? ', ' : 'See ');
      f.append(h('a', { href: `#/imaging?t=${m.id}` }, `imaging: ${m.label}`));
    });
    f.append('.');
    return f;
  }

  /** What the 3D view is showing, with provenance of each element. */
  private shownList(): HTMLElement {
    const p = this.viewer.currentPlan();
    const d = h('details', { class: 'shown' }, h('summary', {}, 'Sources of the 3D elements'));
    if (!p) return d;
    const ids = [
      ...[...p.looks].filter(([, l]) => l !== 'ghost' && l !== 'hidden').map(([id]) => id),
      ...p.tracts.keys(), ...p.parcels.keys(),
    ];
    const ul = h('ul', { class: 'prov' });
    for (const id of ids) {
      const m = MAN.get(id);
      if (!m) continue;
      ul.append(h('li', {}, h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.sel = id; }) }, m.name), ' — ', m.source, '.'));
    }
    for (const mk of p.markers) {
      const t = TGT.get(mk.targetId);
      if (t) ul.append(h('li', {}, h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.sel = t.id; }) }, `Marker: ${t.label}`), ' — ', t.method));
    }
    d.append(ul);
    return d;
  }

  private missing(names: string[]): HTMLElement | null {
    if (!names.length) return null;
    return h('p', { class: 'aside' }, 'Named in the circuit but not drawn, because no tract file is distributed: ', names.join('; '), '.');
  }

  // ---------------------------------------------------------------- selection card
  private selectionCard(id: string): HTMLElement {
    const close = h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: () => this.update((s) => { s.sel = null; }) }, '×');
    const t = TGT.get(id);
    if (t) {
      const m = MAN.get(t.structureId);
      const row = (side: 'left' | 'right') => {
        const v = t.mni[side];
        const a = mniToAcpc(v);
        return h('tr', {}, h('th', { scope: 'row' }, side === 'left' ? 'Left' : 'Right'),
          h('td', {}, v.map(fmtMm).join(', ')), h('td', {}, a.map(fmtMm).join(', ')));
      };
      return h('article', { class: 'card sel', style: `--accent: var(--c-${m?.colour.token ?? 'ctx'})` }, close,
        h('p', { class: 'eyebrow' }, 'Target marker'),
        h('h2', {}, t.label), h('p', {}, this.kindBadge(t.kind), ' ', refLinks([t.refId])),
        h('table', { class: 'coords' },
          h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { scope: 'col' }, 'MNI 2009b x, y, z (mm)'), h('th', { scope: 'col' }, 'AC–PC ≈ (mm, from MCP)'))),
          h('tbody', {}, row('left'), row('right'))),
        h('p', { class: 'aside' }, t.method),
        h('p', { class: 'aside' }, 'AC–PC values are approximate: template-space conversion with the Lead-DBS method (see Credits). Individual anatomy varies.'),
      );
    }
    const st = STRUCT.get(id);
    const m = MAN.get(id);
    if (!st || !m) return h('p', {}, '');
    const roles: HTMLElement[] = [];
    for (const ind of CONTENT.indications) {
      const r = ind.primaryTargets.includes(id) ? 'primary target' : ind.alternativeTargets.includes(id) ? 'alternative' :
        ind.keyTracts.includes(id) ? 'key tract' : ind.alternativeTracts.includes(id) ? 'tract for the alternative target' :
          ind.corticalAreas.includes(id) ? 'connected cortex' : ind.contextStructures.includes(id) ? 'connected region' : null;
      if (r) roles.push(h('li', {}, h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.ind = ind.id; s.sym = null; s.cam = { preset: null }; }, { camera: true }) }, ind.name), `: ${r}`));
    }
    const img = IMAGING.find((x) => x.structureId === id);
    const stream = m.streamlines ? `${m.streamlines.L + m.streamlines.R} of ${m.sourceStreamlines!.L + m.sourceStreamlines!.R} source streamlines shown.` : '';
    return h('article', { class: 'card sel', style: `--accent: var(--c-${m.colour.token})` }, close,
      h('p', { class: 'eyebrow' }, m.category ?? { nucleus: 'Nucleus', cortex: 'Cortical area', tract: 'Tract', target: 'Sweet-spot volume' }[m.type]),
      h('h2', {}, h('span', { class: 'swatch', style: `--c: var(--c-${m.colour.token})` }), m.name),
      m.aliases.length ? h('p', { class: 'aside' }, 'Also: ', m.aliases.join(', ')) : null,
      h('dl', {},
        h('dt', {}, 'Role and DBS relevance'),
        h('dd', {}, st.description ?? 'Not discussed in the source content; shown for anatomical context.', ' ', refLinks(st.refIds.filter((r) => CONTENT.references.find((x) => x.id === r)?.topic !== 'atlas'))),
        roles.length ? [h('dt', {}, 'In this atlas'), h('dd', {}, h('ul', { class: 'roles' }, ...roles))] : null,
        img ? [h('dt', {}, 'Imaging'), h('dd', {}, h('a', { href: `#/imaging?t=${img.id}` }, `Sequences and tractography for ${img.label}`))] : null,
        h('dt', {}, 'Geometry'),
        h('dd', {}, m.source, '. ', m.derivation, ' ', stream, ' ', h('a', { href: '#/credits' }, 'Licence and citation')),
        m.hcp ? [h('dt', {}, 'Human Connectome Project'), h('dd', {}, m.hcp === 'confirmed'
          ? 'Generated from HCP diffusion data; also subject to the HCP Open Access Data Use Terms. '
          : 'Probably generated from HCP data (the atlas family is built on HCP templates); treated as subject to the HCP Open Access Data Use Terms. ',
          h('a', { href: '#/credits' }, 'Acknowledgement'))] : null,
        m.centroid ? [h('dt', {}, 'Centroid, MNI (mm)'), h('dd', {}, `L ${m.centroid.L.map(fmtMm).join(', ')} · R ${m.centroid.R.map(fmtMm).join(', ')}`)] : null,
      ),
    );
  }

  private onPick(info: PickInfo): void {
    if (info.kind === 'structure' && info.id) this.update((s) => { s.sel = info.id; });
    else if (info.kind === 'marker' && info.id) this.update((s) => { s.sel = info.id; });
  }

  // ---------------------------------------------------------------- legend, labels, readout
  private renderLegend(): void {
    const p: Plan | null = this.viewer.currentPlan();
    clear(this.legend);
    if (!p) return;
    const hidden = new Set(this.s.hidden);
    /** One legend row: eye toggle (show/hide), swatch, and the name (click = highlight + card). */
    const li = (cls: string, token: string, text: string, id: string, also: string[] = []) => {
      const ids = [id, ...also];
      const off = hidden.has(id);
      const on = this.s.sel === id;
      const hover = (v: string | null) => () => { this.legendHover = v; this.viewer.invalidate(); };
      return h('li', { class: `${off ? 'off' : ''} ${on ? 'on' : ''}`, onmouseenter: hover(id), onmouseleave: hover(null), onfocusin: hover(id), onfocusout: hover(null) },
        h('button', {
          type: 'button', class: 'eye', 'aria-pressed': String(!off), title: off ? 'Show' : 'Hide', 'aria-label': `${off ? 'Show' : 'Hide'} ${text}`,
          onclick: () => this.update((s) => {
            const set = new Set(s.hidden);
            ids.forEach((x) => (off ? set.delete(x) : set.add(x)));
            s.hidden = [...set];
            if (!off && s.sel && ids.includes(s.sel)) s.sel = null;
          }),
        }, h('span', { 'aria-hidden': 'true' }, off ? '○' : '●')),
        h('span', { class: `sw ${cls}`, style: `--c: var(--c-${token})` }),
        h('button', {
          type: 'button', class: 'lg-item', 'aria-pressed': String(on), title: on ? 'Remove highlight' : 'Highlight and open card',
          onclick: () => this.update((s) => {
            s.sel = s.sel === id ? null : id;
            if (s.sel) s.hidden = s.hidden.filter((x) => !ids.includes(x)); // highlighting a hidden item shows it again
          }),
        }, text));
    };
    for (const [id, look] of p.looks) {
      const m = MAN.get(id);
      if (!m || m.type !== 'nucleus') continue;
      if (look === 'primary') this.legend.append(li('solid', m.colour.token, m.name, id));
    }
    for (const [id, look] of p.looks) {
      const m = MAN.get(id);
      if (m && m.type === 'nucleus' && look === 'alt') this.legend.append(li('outline', m.colour.token, `${m.name} (alternative)`, id));
    }
    for (const [id, look] of p.looks) {
      const m = MAN.get(id);
      if (m && m.type === 'nucleus' && look === 'context') this.legend.append(li('patch', m.colour.token, `${m.name} (${LANDMARKS.has(id) ? 'landmark' : 'context'})`, id));
    }
    for (const mk of p.markers) {
      const t = TGT.get(mk.targetId)!;
      // hiding a sweet-spot marker also hides its published map volume
      const also = t.kind === 'sweetSpot' ? [t.structureId] : [];
      this.legend.append(li(mk.primary ? 'dot' : 'ring', mk.primary ? 'ctx' : MAN.get(t.structureId)?.colour.token ?? p.accent, `${t.label}${mk.primary ? '' : ' (alternative)'}`, t.id, also));
    }
    for (const [id, look] of p.looks) {
      const m = MAN.get(id);
      if (m?.type === 'target' && look === 'context' && !p.markers.some((mk) => TGT.get(mk.targetId)?.structureId === id))
        this.legend.append(li('patch', m.colour.token, `${m.name} (published map, no single target point)`, id));
    }
    if (this.s.layers.tracts.on) for (const [id, role] of p.tracts) {
      const m = MAN.get(id)!;
      this.legend.append(li(`line ${role}`, m.colour.token, m.name + (role === 'alt' ? ', for the alternative target' : role === 'border' ? ' (border)' : ''), id));
    }
    if (this.s.layers.cortex.on) for (const id of p.parcels.keys()) {
      const m = MAN.get(id)!;
      this.legend.append(li('patch', m.colour.token, m.name, id));
    }
    if (!p.tracts.size) this.legend.append(h('li', { class: 'none' }, 'No tract has been mapped at scale for this indication yet.'));
    if (this.s.hidden.length || this.s.sel) {
      this.legend.append(h('li', { class: 'lg-actions' },
        this.s.hidden.length ? h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.hidden = []; }) }, `Show all (${this.s.hidden.length} hidden)`) : null,
        this.s.sel ? h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.sel = null; }) }, 'Clear highlight') : null));
    }
  }

  /**
   * Name labels with leader lines. "all": every highlighted structure and primary marker;
   * "hover": only the item hovered in the legend and the selected one; "off": none.
   * They fade while the camera moves (CSS .moving).
   */
  private placeLabels(): void {
    drawGizmo(this.gizmo, this.viewer.axesScreen());
    const mode = this.s?.labels ?? 'hover';
    const items: LabelItem[] = [];
    const have = new Set<string>();
    const add = (id: string, text: string, ax: number, ay: number, cls: string) => { if (!have.has(id)) { have.add(id); items.push({ id, text, ax, ay, cls }); } };
    if (mode === 'all') {
      for (const p of this.viewer.markerScreen()) if (p.primary) add(p.id, TGT.get(p.id)?.label ?? '', p.x, p.y, 'mlabel');
      for (const p of this.viewer.structureScreen()) {
        const m = MAN.get(p.id)!;
        add(p.id, (m.aliases[0] ?? m.name) + (p.look === 'alt' ? ' (alt.)' : ''), p.x, p.y, `slabel ${p.look}`);
      }
    }
    if (mode !== 'off') {
      for (const id of [this.legendHover, this.s?.sel]) {
        if (!id || have.has(id)) continue;
        const a = this.viewer.anchorFor(id);
        const name = TGT.get(id)?.label ?? MAN.get(id)?.name;
        if (a && name) add(id, name, a.x, a.y, TGT.has(id) ? 'mlabel' : 'slabel primary');
      }
    }
    layoutLabels(items, this.stage.clientWidth, this.stage.clientHeight, this.labels, this.leaders);
    if (this.measurePts.length === 2) {
      const q = this.viewer.measureScreen();
      this.measureOut.dataset.x = q ? String(q.x) : '';
    }
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
    const a = mniToAcpc([ras.x, ras.y, ras.z]);
    clear(this.readout);
    this.readout.append(
      h('span', { class: 'k' }, 'MNI'), ` x ${fmtMm(ras.x)}  y ${fmtMm(ras.y)}  z ${fmtMm(ras.z)} mm`,
      h('br'), h('span', { class: 'k' }, 'AC–PC ≈'), ` ${fmtMm(a[0])}, ${fmtMm(a[1])}, ${fmtMm(a[2])} mm from MCP (approximate, template)`,
    );
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
    this.measureOut.textContent = `Distance ${fmtMm(a.distanceTo(b))} mm  (A ${[a.x, a.y, a.z].map(fmtMm).join(', ')} → B ${[b.x, b.y, b.z].map(fmtMm).join(', ')})`;
  }

  private async copyLink(btn: HTMLElement): Promise<void> {
    try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Link copied'; }
    catch { window.prompt('Copy this link', location.href); }
    setTimeout(() => { btn.textContent = 'Copy link'; }, 1600);
  }

  // ---------------------------------------------------------------- layers tab
  private renderLayers(): void {
    const pane = this.tabs.layers;
    const s = this.s;
    if (!pane.childElementCount) {
      const rows = LAYERS.map(([k, label]) => h('div', { class: 'layer', 'data-layer': k },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e: Event) => this.update((st) => { st.layers[k].on = (e.target as HTMLInputElement).checked; }) }), label),
        h('label', { class: 'range' }, h('span', { class: 'vh' }, `${label} opacity`),
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, oninput: (e: Event) => this.update((st) => { st.layers[k].opacity = parseFloat((e.target as HTMLInputElement).value); }) }))));
      pane.append(h('h3', {}, 'Layers'), ...rows,
        h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-borders': '1', onchange: (e: Event) => this.update((st) => { st.borders = (e.target as HTMLInputElement).checked; }) }),
          'Show landmarks: corticospinal tract and medial lemniscus around Vim/PSA targets, optic tract beneath GPi targets, red nucleus beside STN targets'),
        h('p', { class: 'aside' }, 'Unselected nuclei stay as faint ghosts for orientation. Tracts and cortex load when first needed.'),
        h('h3', {}, 'All structures'), this.structureIndex());
    }
    for (const [k] of LAYERS) {
      const row = pane.querySelector(`[data-layer="${k}"]`)!;
      (row.querySelector('input[type=checkbox]') as HTMLInputElement).checked = s.layers[k].on;
      (row.querySelector('input[type=range]') as HTMLInputElement).value = String(s.layers[k].opacity);
    }
    (pane.querySelector('[data-borders]') as HTMLInputElement).checked = s.borders;
  }

  private structureIndex(): HTMLElement {
    const groups: [string, string][] = [['nucleus', 'Nuclei'], ['tract', 'Tracts'], ['cortex', 'Cortex'], ['target', 'Sweet-spot volumes']];
    const wrap = h('div', { class: 'index' });
    for (const [type, label] of groups) {
      const list = MANIFEST.structures.filter((m) => m.type === type && m.id !== 'cortex');
      wrap.append(h('details', {}, h('summary', {}, `${label} (${list.length})`),
        h('ul', {}, ...list.map((m) => h('li', {}, h('span', { class: 'swatch', style: `--c: var(--c-${m.colour.token})` }),
          h('button', { type: 'button', class: 'linklike', onclick: () => this.update((s) => { s.sel = m.id; }) }, m.name))))));
    }
    return wrap;
  }

  // ---------------------------------------------------------------- slices tab
  private renderSlices(): void {
    const pane = this.tabs.slices;
    const s = this.s;
    if (!pane.childElementCount) {
      buildSlicesPane<AppState>(pane, this.update, {
        cut: 'Removes all structures on that side of the midline (x = 0): nuclei, tracts, cortex, markers and the lead. The slices stay whole, so one half shows the slice unobstructed and the other half slice plus anatomy.',
        seq: 'ICBM 2009b templates, all in the same space. On T2 the STN appears as a hypointense structure; proton-density images give higher pallidal contrast (see Imaging). Each sequence loads on first use (about 3 MB).',
        footer: 'Slices show the ICBM 2009b nonlinear asymmetric templates: 0.5 mm inside a subcortical box, 1.5 mm elsewhere.',
      });
    }
    syncSlicesPane(pane, s);
  }

  // ---------------------------------------------------------------- lead tab
  private renderLead(): void {
    const pane = this.tabs.lead;
    const s = this.s;
    if (!pane.childElementCount) {
      const num = (k: 'depth' | 'ring' | 'tilt' | 'radius', min: number, max: number, step: number, label: string) =>
        h('label', { class: 'range wide' }, h('span', {}, label, ' ', h('output', { 'data-out': k })),
          h('input', { type: 'range', min, max, step, 'data-k': k, oninput: (e: Event) => (k === 'depth' ? this.editLead.bind(this) : this.update)((st) => { st.lead[k] = parseFloat((e.target as HTMLInputElement).value); }) }));
      pane.append(
        h('h3', {}, 'Generic quadripolar lead'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-k': 'on', onchange: (e: Event) => this.update((st) => { st.layers.electrode.on = (e.target as HTMLInputElement).checked; }) }), 'Show lead at the selected target'),
        h('p', { class: 'aside' }, `${LEAD.diameter} mm diameter, four ${LEAD.contactLength} mm contacts, contact 0 at the tip. Choose which part of the lead sits on the primary target marker, then fine-tune with the offset or by dragging the lead along its axis in the viewer.`),
        h('fieldset', { class: 'seg-field' }, h('legend', {}, 'Contact spacing'),
          ...([0.5, 1.5] as const).map((v) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'spacing', value: v, onchange: () => this.editLead((st) => { st.lead.spacing = v; }) }), `${v} mm`))),
        h('label', { class: 'select' }, 'On the target: ', h('select', { 'data-k': 'anchor', onchange: (e: Event) => this.editLead((st) => { st.lead.anchor = (e.target as HTMLSelectElement).value as LeadAnchor; }) },
          ...LEAD_ANCHORS.map((a) => h('option', { value: a }, ANCHOR_LABEL[a])))),
        num('depth', -15, 15, 0.5, 'Offset from that point (+ deeper)'),
        h('div', { class: 'lead-pref', 'aria-live': 'polite' }),
        h('fieldset', { class: 'traj' }, h('legend', {}, 'Trajectory (illustrative)'),
          num('ring', 30, 90, 1, 'Angle above AC–PC line'),
          num('tilt', 0, 40, 1, 'Lateral tilt from midline'),
          h('p', { class: 'aside' }, 'Default angles are illustrative only. None of the sources gives a typical trajectory; set these to match your own planning convention.'),
          h('button', { type: 'button', class: 'btn', onclick: () => this.update((st) => { st.lead.ring = DEFAULT_LEAD.ring; st.lead.tilt = DEFAULT_LEAD.tilt; st.lead.depth = 0; }) }, 'Reset trajectory')),
        h('fieldset', { class: 'stim' }, h('legend', {}, 'Stimulation sphere'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-k': 'stim', onchange: (e: Event) => this.update((st) => { st.lead.stim = (e.target as HTMLInputElement).checked; }) }), 'Show sphere around one contact'),
          h('label', { class: 'select' }, 'Contact ', h('select', { 'data-k': 'contact', onchange: (e: Event) => this.update((st) => { st.lead.contact = parseInt((e.target as HTMLSelectElement).value, 10); }) },
            ...[0, 1, 2, 3].map((k) => h('option', { value: k }, `C${k}`)))),
          num('radius', 0.5, 6, 0.1, 'Radius (mm)'),
          h('p', { class: 'warn' }, 'Illustrative sphere only. Not a volume-of-tissue-activated model.')),
        this.leadInfo,
      );
    }
    (pane.querySelector('[data-k=on]') as HTMLInputElement).checked = s.layers.electrode.on;
    pane.querySelectorAll<HTMLInputElement>('input[name=spacing]').forEach((r) => { r.checked = parseFloat(r.value) === s.lead.spacing; });
    for (const k of ['depth', 'ring', 'tilt', 'radius'] as const) {
      (pane.querySelector(`[data-k=${k}]`) as HTMLInputElement).value = String(s.lead[k]);
      (pane.querySelector(`[data-out=${k}]`) as HTMLOutputElement).textContent = k === 'ring' || k === 'tilt' ? `${s.lead[k]}°` : `${fmtMm(s.lead[k])} mm`;
    }
    (pane.querySelector('[data-k=anchor]') as HTMLSelectElement).value = s.lead.anchor;
    this.renderLeadPref();
    (pane.querySelector('[data-k=stim]') as HTMLInputElement).checked = s.lead.stim;
    (pane.querySelector('[data-k=contact]') as HTMLSelectElement).value = String(s.lead.contact);
  }

  /** Lead edits that define placement (anchor, offset, spacing) are remembered for the current target. */
  private editLead(fn: (s: AppState) => void): void {
    this.update(fn);
    const t = primaryTargetId(this.s.ind, this.s.sym);
    if (t) saveLeadPref(t, { anchor: this.s.lead.anchor, depth: this.s.lead.depth, spacing: this.s.lead.spacing });
  }

  /** Called when stored preferences change (e.g. after saving). */
  refreshLead(): void { if (this.s) this.renderLeadPref(); }

  private renderLeadPref(): void {
    const box = this.tabs.lead.querySelector('.lead-pref');
    if (!box || !this.s) return;
    clear(box);
    const t = primaryTargetId(this.s.ind, this.s.sym);
    const label = t ? TGT.get(t)?.label ?? t : null;
    const { pref, source } = leadPrefFor(t);
    const l = this.s.lead;
    const matches = pref.anchor === l.anchor && pref.depth === l.depth && pref.spacing === l.spacing;
    const what = `${ANCHOR_LABEL[l.anchor]} on the target${l.depth ? `, ${fmtMm(Math.abs(l.depth))} mm ${l.depth > 0 ? 'deeper' : 'shallower'}` : ''}, ${l.spacing} mm spacing`;
    box.append(h('p', { class: 'aside' },
      !t ? 'This view has no primary target, so nothing is remembered here.' :
        matches && source === 'target' ? `Remembered for ${label} in this browser: ${what}.` :
          matches && source === 'default' ? `Using your default placement (nothing saved for ${label} yet): ${what}.` :
            matches ? `Built-in placement (array centre on ${label}). Change it and it is remembered for this target.` :
              `From the link: ${what}. Change it here to remember it for ${label}.`));
    box.append(h('div', { class: 'set-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => saveLeadDefault({ anchor: l.anchor, depth: l.depth, spacing: l.spacing }) }, 'Use as default for other targets'),
      t && source === 'target' ? h('button', { type: 'button', class: 'btn', onclick: () => { clearLeadPref(t); const p = leadPrefFor(t).pref; this.update((st) => { st.lead = { ...st.lead, ...p }; }); } }, `Forget for ${label}`) : null,
      h('button', { type: 'button', class: 'btn', onclick: () => { if (confirm('Forget all remembered lead placements in this browser?')) { clearAllLeadPrefs(); this.update((st) => { st.lead = { ...st.lead, anchor: 'centre', depth: 0, spacing: 0.5 }; }); } } }, 'Forget all')));
  }

  private showLead(c: Record<'L' | 'R', THREE.Vector3[]> | null): void {
    clear(this.leadInfo);
    if (!c) {
      if (this.s?.layers.electrode.on) this.leadInfo.append(h('p', { class: 'aside' }, 'This view has no primary target marker to place the lead on.'));
      return;
    }
    const tbl = h('table', { class: 'coords' }, h('thead', {}, h('tr', {}, h('th', {}, 'Contact'), h('th', {}, 'MNI x, y, z'), h('th', {}, 'AC–PC ≈'))));
    const body = h('tbody');
    for (const side of ['L', 'R'] as const) {
      if (this.s.hemi !== 'both' && this.s.hemi !== side) continue;
      c[side].forEach((v, k) => {
        const a = mniToAcpc([v.x, v.y, v.z]);
        body.append(h('tr', { class: this.s.lead.stim && k === this.s.lead.contact ? 'active' : '' }, h('th', { scope: 'row' }, `${side} C${k}`),
          h('td', {}, [v.x, v.y, v.z].map(fmtMm).join(', ')), h('td', {}, a.map(fmtMm).join(', '))));
      });
    }
    tbl.append(body);
    this.leadInfo.append(tbl, h('p', { class: 'aside' }, 'AC–PC values approximate (template-space Lead-DBS method).'));
  }

  // ---------------------------------------------------------------- keyboard
  handleKey(e: KeyboardEvent): boolean {
    const k = e.key;
    const preset = PRESETS.find((p) => p[2] === k);
    if (preset) { this.update((s) => { s.cam = { preset: preset[0] }; }, { camera: true }); return true; }
    if (k === 'h' || k === 'H') { this.update((s) => { s.hemi = s.hemi === 'both' ? 'L' : s.hemi === 'L' ? 'R' : 'both'; }); return true; }
    if (k === 'l' || k === 'L') { this.update((s) => { s.layers.electrode.on = !s.layers.electrode.on; }); return true; }
    if (k === 'm' || k === 'M') { this.toggleMeasure(); return true; }
    if (k === 'n' || k === 'N') { this.update((s) => { s.labels = s.labels === 'hover' ? 'all' : s.labels === 'all' ? 'off' : 'hover'; }); return true; }
    if (k === 's' || k === 'S') { this.update((s) => { s.clip.axial.on = !s.clip.axial.on; }); return true; }
    if (k === ']' || k === '[') {
      const list = visibleIndications(this.s.ind);
      const i = list.findIndex((x) => x.id === this.s.ind);
      const n = list[(i + (k === ']' ? 1 : -1) + list.length) % list.length];
      this.update((s) => { s.ind = n.id; s.sym = null; s.sel = null; s.cam = { preset: null }; }, { camera: true });
      return true;
    }
    if (k === '.' || k === ',') {
      const ids = [null, ...IND.get(this.s.ind)!.symptomIds];
      if (ids.length < 2) return false;
      const i = ids.indexOf(this.s.sym);
      const n = ids[(i + (k === '.' ? 1 : -1) + ids.length) % ids.length];
      this.update((s) => { s.sym = n; s.sel = null; s.cam = { preset: null }; }, { camera: true });
      return true;
    }
    if (k === 'Escape') {
      if (this.measureBtn.getAttribute('aria-pressed') === 'true') { this.toggleMeasure(); return true; }
      if (this.s.sel) { this.update((s) => { s.sel = null; }); return true; }
    }
    return false;
  }

  onShow(): void { this.viewer.invalidate(); }

  /** Re-render the indication chips after the visible-indication setting changes. */
  refreshChips(): void { if (this.s) { this.lastPlanKey = ''; this.renderOverview(); } }
}

