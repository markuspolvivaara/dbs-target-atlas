import { CONTENT, MANIFEST } from '../data';
import { ACPC, MCP, TEMPLATE_ACPC_LENGTH } from '../data/acpc';
import { CALC_LEDE, CALC_NOTE, fmt, rows, signed, validate, words, type Side } from '../data/calculator';
import { IMAGING, IMAGING_ASIDE } from '../data/imaging';
import { TOPICS } from '../data/references';
import type { Topic } from '../data/schema';
import type { AppState } from '../state';
import { chips, clear, fmtMm, h, refLinks } from './dom';
import { getPrefs, onPrefsChange, setHidden, storageAvailable, visibleIndications } from './prefs';

type Update = (fn: (s: AppState) => void) => void;

// ---------------------------------------------------------------- imaging
export function imagingPage(update: Update) {
  const el = h('div', { class: 'page wrap' });
  const chipsHost = h('div');
  const card = h('article', { class: 'card', 'aria-live': 'polite' });
  const aside = h('p', { class: 'aside' });
  IMAGING_ASIDE.forEach((a, i) => { aside.append(i ? ' ' : '', a.text, ' ', refLinks(a.refIds), '.'); });
  el.append(h('h1', {}, 'Imaging'), h('p', { class: 'lede' }, 'Sequences and tractography per target structure.'), chipsHost, card, aside);
  return {
    el,
    render(s: AppState) {
      const d = IMAGING.find((x) => x.id === s.img) ?? IMAGING[0];
      clear(chipsHost);
      chipsHost.append(chips(IMAGING.map((m) => [m.id, m.label]), d.id, (v) => update((st) => { st.img = v; }), { label: 'Target structure' }));
      clear(card);
      card.style.setProperty('--accent', `var(--c-${d.accent})`);
      card.append(h('h2', {}, d.title), h('dl', {},
        h('dt', {}, 'Sequences'),
        h('dd', {}, d.sequences.length ? h('ul', { class: 'seq' }, ...d.sequences.map((q) => h('li', {}, h('strong', {}, q.name), h('span', {}, q.note)))) : d.noSequences ?? ''),
        h('dt', {}, 'Tractography'), h('dd', {}, d.tract),
        h('dt', {}, 'Planning note'), h('dd', {}, d.note),
        h('dt', {}, 'Sources'), h('dd', {}, refLinks(d.refIds, false)),
      ), h('p', {}, h('a', { href: `#/atlas?i=${pickIndication(d.structureId)}&sel=${d.structureId}` }, `Show ${d.label} in the 3D atlas`)));
    },
  };
}

function pickIndication(structureId: string): string {
  return CONTENT.indications.find((i) => i.primaryTargets.includes(structureId))?.id
    ?? CONTENT.indications.find((i) => i.alternativeTargets.includes(structureId))?.id ?? 'pd';
}

// ---------------------------------------------------------------- coordinates
export function coordsPage() {
  const el = h('div', { class: 'page wrap' });
  const acpc = h('input', { type: 'number', id: 'acpc', inputmode: 'decimal', value: '25', min: '18', max: '35', step: '0.5' }) as HTMLInputElement;
  const v3 = h('input', { type: 'number', id: 'v3', inputmode: 'decimal', value: '6', min: '0', max: '20', step: '0.5' }) as HTMLInputElement;
  let side: Side = 'Left';
  const sideBtns = (['Left', 'Right'] as Side[]).map((sd) => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(sd === side), 'data-side': sd,
    onclick: () => { side = sd; sideBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === side))); renderCalc(); },
  }, sd));
  const out = h('div', { 'aria-live': 'polite' });
  const note = h('p', { class: 'aside' }, CALC_NOTE.pre, ' ', refLinks(CALC_NOTE.preRefs), CALC_NOTE.mid, ' ', refLinks(CALC_NOTE.midRefs), CALC_NOTE.post);
  const method = h('section', { class: 'card' },
    h('h2', {}, 'How the 3D viewer converts MNI to AC–PC'),
    h('p', {}, 'The live readout in the 3D atlas labels its AC–PC values as approximate. They use the method of Lead-DBS ', h('code', {}, 'ea_mni2acpc.m'),
      ': fixed AC, PC and mid-sagittal fiducials in the ICBM 2009b template define an orthonormal frame centred on the mid-commissural point. Lead-DBS warps these fiducials into each patient; the viewer does not, so values describe the template brain only.'),
    h('table', { class: 'coords' }, h('thead', {}, h('tr', {}, h('th', {}, 'Fiducial'), h('th', {}, 'MNI 2009b (mm)'))),
      h('tbody', {},
        h('tr', {}, h('th', { scope: 'row' }, 'AC'), h('td', {}, ACPC.AC.map(fmtMm).join(', '))),
        h('tr', {}, h('th', { scope: 'row' }, 'PC'), h('td', {}, ACPC.PC.map(fmtMm).join(', '))),
        h('tr', {}, h('th', { scope: 'row' }, 'Mid-sagittal point'), h('td', {}, ACPC.MSP.map(fmtMm).join(', '))),
        h('tr', {}, h('th', { scope: 'row' }, 'MCP (derived)'), h('td', {}, MCP.map(fmtMm).join(', '))))),
    h('p', { class: 'aside' }, `Template AC–PC length: ${fmtMm(TEMPLATE_ACPC_LENGTH)} mm. Source: `, h('a', { href: ACPC.url, target: '_blank', rel: 'noopener' }, ACPC.source), '.'),
  );
  el.append(
    h('h1', {}, 'Coordinates'),
    h('p', { class: 'lede' }, CALC_LEDE),
    h('div', { class: 'form' },
      h('label', {}, 'AC–PC length (mm)', acpc),
      h('label', {}, 'Third-ventricle width (mm)', v3),
      h('fieldset', { class: 'side' }, h('legend', {}, 'Side'), ...sideBtns)),
    out, note, method,
  );
  function renderCalc() {
    const L = parseFloat(acpc.value), w = parseFloat(v3.value);
    const err = validate(L, w);
    clear(out);
    if (err) { out.append(h('p', { class: 'err' }, err)); return; }
    for (const t of rows(L, w)) {
      const sg = signed(t, side);
      out.append(h('div', { class: 'coord', style: `--c: var(--c-${t.c})` },
        h('h3', {}, t.k),
        h('div', { class: 'xyz' },
          h('div', {}, h('span', { class: 'k' }, 'Lateral (mm)'), h('span', { class: 'v' }, fmt(t.lat)), h('span', { class: 'r' }, t.latR)),
          h('div', {}, h('span', { class: 'k' }, 'AP (mm)'), h('span', { class: 'v' }, fmt(t.ap)), h('span', { class: 'r' }, t.apR)),
          h('div', {}, h('span', { class: 'k' }, 'Vertical (mm)'), h('span', { class: 'v' }, fmt(t.z)), h('span', { class: 'r' }, t.zR))),
        h('p', { class: 'words' }, words(t, side)),
        h('p', { class: 'signed' }, `Signed, right/anterior/superior positive: x ${fmt(sg[0])}, y ${fmt(sg[1])}, z ${fmt(sg[2])}`)));
    }
  }
  acpc.addEventListener('input', renderCalc);
  v3.addEventListener('input', renderCalc);
  renderCalc();
  return { el, render() { /* stateless */ } };
}

// ---------------------------------------------------------------- references
export function refsPage() {
  const el = h('div', { class: 'page wrap' });
  let topic: Topic | 'all' = 'all';
  const q = h('input', { type: 'search', id: 'ref-q', placeholder: 'Author, title or topic' }) as HTMLInputElement;
  const list = h('ul', { class: 'refs' });
  const count = h('p', { class: 'count', 'aria-live': 'polite' });
  const empty = h('p', { hidden: true }, 'No references match. Clear the search or pick another topic.');
  const order: Topic[] = ['net', 'pd', 'tremor', 'dyst', 'ts', 'epi', 'img', 'atlas'];
  const topicName = Object.fromEntries(TOPICS) as Record<string, string>;
  const chipRow = chips(TOPICS, topic, (v) => {
    topic = v;
    chipRow.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String((c as HTMLElement).dataset.v === v)));
    render();
  }, { label: 'Topic' });
  el.append(h('h1', {}, 'References'), h('label', { class: 'search' }, 'Search references', q), chipRow, count, list, empty,
    h('p', { class: 'aside' }, '"Atlases and datasets" lists the sources of the 3D geometry; their citations are Crossref records for each DOI. "Epilepsy" references were added after the original teaching page (checked against PubMed). All other references come from the original teaching page.'));
  function render() {
    const s = q.value.trim().toLowerCase();
    const items = CONTENT.references
      .filter((r) => (topic === 'all' || r.topic === topic) && (!s || (r.citation + ' ' + r.shortLabel + ' ' + topicName[r.topic]).toLowerCase().includes(s)))
      .sort((a, b) => order.indexOf(a.topic) - order.indexOf(b.topic));
    clear(list);
    for (const r of items) list.append(h('li', { id: `ref-${r.id}` }, h('span', { class: 'tag' }, topicName[r.topic]), h('br'), h('span', {}, r.citation), h('br'),
      h('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'View source')));
    empty.hidden = items.length > 0;
    count.textContent = items.length ? `${items.length} ${items.length === 1 ? 'reference' : 'references'}` : '';
  }
  q.addEventListener('input', render);
  render();
  return { el, render() { /* stateless */ } };
}

// ---------------------------------------------------------------- credits
export function creditsPage() {
  const el = h('div', { class: 'page wrap' });
  const used = new Set(MANIFEST.structures.map((s) => s.dataset));
  used.add('leaddbs'); used.add('icbm2009b');
  const ds = Object.entries(MANIFEST.datasets).filter(([k]) => used.has(k));
  el.append(
    h('h1', {}, 'Credits and licences'),
    h('section', { class: 'card' },
      h('h2', {}, 'What this is'),
      h('p', {}, 'An atlas-based teaching tool. All geometry is in MNI ICBM 2009b nonlinear asymmetric space and comes from published atlases distributed with Lead-DBS; nothing is hand-modelled. Individual anatomy varies. This is not surgical planning software.'),
      h('h2', {}, 'Licence of the 3D assets'),
      h('p', {}, 'Lead-DBS states that the standard-space atlases it ships are released under the GNU GPL v3 at the request of their owners and should not be used commercially. The meshes, streamline subsets and coordinates here are derived from them and are distributed under GPL-3.0 for non-commercial use, with the full conversion pipeline as corresponding source.'),
      h('p', {}, 'T1 slices: ICBM 2009b template. Copyright (C) 1993–2004 Louis Collins, McConnell Brain Imaging Centre, Montreal Neurological Institute, McGill University. Permission to use, copy, modify, and distribute this software and its documentation for any purpose and without fee is hereby granted, provided that the above copyright notice appear in all copies. The authors and McGill University make no representations about the suitability of this software for any purpose. It is provided "as is" without express or implied warranty.'),
    ),
    h('h2', {}, 'Datasets'),
    ...ds.map(([k, d]) => h('section', { class: 'card dataset', id: `ds-${k}` },
      h('h3', {}, d.name),
      h('p', {}, h('strong', {}, 'Licence: '), d.licence),
      d.note ? h('p', { class: 'aside' }, d.note) : null,
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', h('a', { href: d.citationUrls[i], target: '_blank', rel: 'noopener' }, 'DOI'))),
      d.refIds?.length ? h('p', {}, 'Cite: ', refLinks(d.refIds, false)) : null,
      d.todo ? h('p', { class: 'warn' }, 'Open item: ', d.todo) : null,
      h('p', { class: 'aside' }, 'Used for: ', MANIFEST.structures.filter((s) => s.dataset === k).map((s) => s.name).join('; ') || (k === 'icbm2009b' ? 'T1 slices' : 'distribution of all atlases')),
      h('p', {}, h('a', { href: d.url, target: '_blank', rel: 'noopener' }, 'Dataset page')),
    )),
    h('section', { class: 'card' },
      h('h2', {}, 'Considered and not used'),
      h('ul', {},
        h('li', {}, 'Basal Ganglia Pathway Atlas, original OSF files (Petersen 2019): academic-use agreement without redistribution rights. Its pathways appear here only through the Dystonia Response Tract Atlas (Horn 2022) shipped with Lead-DBS.'),
        h('li', {}, 'DBS Tractography Atlas v2.1 (GitHub): no licence file, so redistribution rights are unclear. The Lead-DBS-distributed version (Middlebrooks 2020) is used.'),
        h('li', {}, 'Rajamani 2024 symptom tracts: not distributed as files. Symptom views show labelled, derived subsets of the Hollunder 2024 PD sweet streamlines.'),
        h('li', {}, 'Hammersmith atlas: licence forbids redistribution.'),
      )),
    h('section', { class: 'card' },
      h('h2', {}, 'Software'),
      h('p', {}, 'three.js, zod, Vite and glTF-Transform (MIT), meshoptimizer (MIT). Pipeline: nibabel, scikit-image, trimesh, fast-simplification, SciPy, NumPy, h5py. Font: Atkinson Hyperlegible, SIL Open Font License 1.1, self-hosted.'),
      h('p', {}, 'Full details: ATTRIBUTION.md in the source repository.')),
  );
  return { el, render() { /* stateless */ } };
}

// ---------------------------------------------------------------- settings
export function settingsPage(update: Update, theme: { get(): 'system' | 'light' | 'dark'; set(t: 'system' | 'light' | 'dark'): void }) {
  const el = h('div', { class: 'page wrap' });
  const list = h('div', { class: 'settings-list', role: 'group', 'aria-labelledby': 'set-ind-title' });
  const status = h('p', { class: 'aside', 'aria-live': 'polite' });
  const themeBox = h('fieldset', { class: 'seg-field' }, h('legend', {}, 'Colour theme'),
    ...([['system', 'Follow the device'], ['light', 'Light'], ['dark', 'Dark']] as const).map(([v, label]) =>
      h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'theme', value: v, onchange: () => theme.set(v) }), label)));
  el.append(
    h('h1', {}, 'Settings'),
    h('p', { class: 'lede' }, 'Choose which indications appear in the atlas. Settings are saved in this browser on this device.'),
    h('section', { class: 'card' },
      h('h2', { id: 'set-ind-title' }, 'Indications'),
      h('p', { class: 'aside' }, 'Hidden indications disappear from the indication chips and from keyboard cycling. A shared link to a hidden indication still opens it. At least one indication stays visible.'),
      h('div', { class: 'set-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => setHidden([]) }, 'Show all'),
        h('button', { type: 'button', class: 'btn', onclick: () => {
          // hide all but the first indication (at least one stays visible)
          setHidden(CONTENT.indications.slice(1).map((i) => i.id));
          leaveHidden();
        } }, 'Hide all but the first')),
      list, status),
    h('section', { class: 'card' }, themeBox),
  );
  /** If the atlas currently shows an indication that is now hidden, switch to the first visible one. */
  function leaveHidden() {
    const hidden = new Set(getPrefs().hiddenIndications);
    update((st) => { if (hidden.has(st.ind)) { st.ind = visibleIndications()[0].id; st.sym = null; st.sel = null; st.cam = { preset: null }; } });
  }
  function render() {
    clear(list);
    const hidden = new Set(getPrefs().hiddenIndications);
    const visibleCount = CONTENT.indications.length - hidden.size;
    for (const ind of CONTENT.indications) {
      const shown = !hidden.has(ind.id);
      list.append(h('label', { class: 'check set-row', style: `--accent: var(--c-${ind.accent})` },
        h('input', {
          type: 'checkbox', 'data-ind': ind.id, checked: shown,
          disabled: shown && visibleCount === 1,
          onchange: (e: Event) => {
            const on = (e.target as HTMLInputElement).checked;
            const next = new Set(getPrefs().hiddenIndications);
            if (on) next.delete(ind.id); else next.add(ind.id);
            setHidden([...next]);
            leaveHidden();
          },
        }),
        h('span', { class: 'set-swatch' }), h('span', {}, ind.name, ind.symptomIds.length ? h('span', { class: 'set-sub' }, ` · ${ind.symptomIds.length} symptom views`) : null)));
    }
    status.textContent = `${visibleCount} of ${CONTENT.indications.length} indications shown.` + (storageAvailable() ? '' : ' This browser blocks storage, so the choice will not be remembered.');
    el.querySelectorAll<HTMLInputElement>('input[name=theme]').forEach((r) => { r.checked = r.value === theme.get(); });
  }
  onPrefsChange(render);
  render();
  return { el, render };
}
