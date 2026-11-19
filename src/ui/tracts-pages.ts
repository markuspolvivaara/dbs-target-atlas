import { SECTIONS, SITE_ROOT } from '../brand';
import { END_PATCHES, WM_ENDS } from '../data/ends';
import { WM, WM_MANIFEST } from '../tracts';
import { CONTEXT_STRUCTURES } from '../tracts/scene';
import { abbreviationList, h } from './h';
import { linkLicences } from './licences';
import { clear } from './widgets';

/** References and Credits of the white-matter section. */

export function tractRefsPage() {
  const el = h('div', { class: 'page wrap' });
  const q = h('input', { type: 'search', id: 'ref-q', placeholder: 'Author, title or tract' }) as HTMLInputElement;
  const list = h('ul', { class: 'refs' });
  const count = h('p', { class: 'count', 'aria-live': 'polite' });
  const empty = h('p', { hidden: true }, 'No references match. Clear the search.');
  // which tract cards cite each reference
  const citedBy = new Map<string, Set<string>>();
  for (const t of WM.topics) {
    for (const c of [...t.course, ...t.connections, ...t.functions, ...t.deficits, ...t.surgery, ...t.atlas]) {
      for (const r of c.refIds) { if (!citedBy.has(r)) citedBy.set(r, new Set()); citedBy.get(r)!.add(t.abbr); }
    }
  }
  // (cited on every tract card, under where its streamlines end)
  for (const c of WM.endsCaveats) for (const r of c.refIds) { if (!citedBy.has(r)) citedBy.set(r, new Set()); citedBy.get(r)!.add('streamline ends'); }
  // (abbreviations the cards use without spelling out: the audit's B-022)
  const abbr: [string, string][] = [
    ['ADHD', 'attention deficit hyperactivity disorder'], ['DBS', 'deep brain stimulation'], ['DTI', 'diffusion tensor imaging'],
    ['HCP', 'the Human Connectome Project'], ['OCD', 'obsessive–compulsive disorder'], ['PET', 'positron emission tomography'],
    ['PTSD', 'post-traumatic stress disorder'], ['SMA', 'the supplementary motor area'],
    ...WM.topics.filter((t) => t.abbr && t.abbr !== t.name && /^[A-Z][A-Za-z0-9 ()-]*$/.test(t.abbr) && t.abbr.length <= 8).map((t): [string, string] => [t.abbr, t.name]),
  ];
  abbr.sort(([a], [b]) => a.localeCompare(b));
  el.append(h('h1', {}, 'References'), abbreviationList(abbr), h('label', { class: 'search' }, 'Search references', q), count, list, empty,
    // (what was read, said as it is: the audit's B-011)
    h('p', { class: 'aside' }, 'The statements on the tract cards cite these papers. Each record was retrieved from PubMed, and the statements were checked against its abstract; against the full text for the open-access papers read in full (Yeh 2018, Yeh 2022, Coenen 2021, Schilling 2018, Maier-Hein 2017). The summary at the top of each card restates what the card’s cited statements say and cites nothing itself; the figures marked measured come from the atlas’s files.'));
  function render() {
    const s = q.value.trim().toLowerCase();
    const tags = (id: string) => [...(citedBy.get(id) ?? [])].join(', ');
    const items = WM.references
      .filter((r) => !s || `${r.citation} ${r.shortLabel} ${tags(r.id)}`.toLowerCase().includes(s))
      .sort((a, b) => a.shortLabel.localeCompare(b.shortLabel));
    clear(list);
    for (const r of items) list.append(h('li', { id: `ref-${r.id}` },
      tags(r.id) ? [h('span', { class: 'tag' }, tags(r.id)), h('br')] : null,
      h('span', {}, r.citation), h('br'),
      h('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'View source'), ' · ',
      h('a', { href: `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`, target: '_blank', rel: 'noopener' }, `PubMed ${r.pmid}`)));
    empty.hidden = items.length > 0;
    count.textContent = items.length ? `${items.length} ${items.length === 1 ? 'reference' : 'references'}` : '';
  }
  q.addEventListener('input', render);
  render();
  return { el, render() { /* stateless */ } };
}

export function tractCreditsPage() {
  const el = h('div', { class: 'page wrap' });
  const d = WM_MANIFEST.dataset;
  const dbs = SECTIONS.find((s) => s.id === 'dbs')!;
  el.append(
    h('h1', {}, 'Credits and licences'),
    h('section', { class: 'card', id: 'hcp1065' },
      h('h2', {}, d.name),
      h('p', {}, 'Every tract in this section comes from this population-averaged tractography atlas, built from diffusion MRI of 1065 Human Connectome Project young adults. Nothing is hand-modelled.'),
      h('p', {}, h('strong', {}, 'Licence: '), d.licence, '. These files are not under the GPL like the rest of the project: adapted versions must stay under CC BY-SA 4.0 with attribution.'),
      h('p', { class: 'aside' }, d.note),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', h('a', { href: d.citationUrls[i], target: '_blank', rel: 'noopener' }, 'DOI'))),
      h('p', { class: 'aside' }, 'Changes made: the streamlines’ points moved by half a voxel (the files give them from the first voxel’s centre), streamlines subsampled (the same number per hemisphere) and resampled to 2 mm, the tracts stored as one file across the midline (the corpus callosum, the anterior commissure, the superior and middle cerebellar peduncles) cut at the midline, files converted to compressed glTF. The atlas’s volumes of the same tracts were used only to check the streamline files. Where each bundle’s streamlines end on the cortex (the tract cards, and the patches below) is measured by this project’s pipeline on all streamlines of each bundle (pipeline/wm_ends.py).'),
      h('p', {}, h('a', { href: d.url, target: '_blank', rel: 'noopener' }, 'Atlas page')),
    ),
    h('section', { class: 'card', id: 'wm-ends' },
      h('h2', {}, 'Where the tracts end: the patches of cortex'),
      h('p', {}, `Choosing a tract draws the patch of cortex where its streamlines end (${END_PATCHES.length} tracts have one). `, WM_ENDS.patches.derivation),
      h('p', {}, h('strong', {}, 'Licence: '), WM_ENDS.patches.licence, '. The files are public/assets/wm-ends/*.glb.'),
      h('p', { class: 'aside' }, `Source: ${WM_ENDS.patches.source}.`)),
    h('section', { class: 'card', id: 'hcp' },
      h('h2', {}, 'Human Connectome Project'),
      h('p', {}, 'The atlas is derived from HCP data, so these tracts are also subject to the WU-Minn HCP Open Access Data Use Terms: redistribution only under the same terms, acknowledgement when presenting results, and no attempt to identify or contact participants.'),
      h('blockquote', { class: 'ack' }, WM_MANIFEST.hcpAcknowledgement)),
    h('section', { class: 'card' },
      h('h2', {}, 'Context anatomy and slices'),
      h('p', {}, 'The cortex surface, motor cortex parcels, orientation nuclei and MRI slices are shared with the DBS section (GPL-3.0 Lead-DBS atlases; ICBM 2009b templates under the McGill/MNI notice): ',
        CONTEXT_STRUCTURES.map((s) => `${s.name} (${s.source})`).join('; '), '.'),
      h('p', {}, h('a', { href: `${SITE_ROOT}${dbs.path}#/credits` }, 'Full DBS-section credits and licences'), '.')),
    h('section', { class: 'card' },
      h('h2', {}, 'Software'),
      h('p', {}, 'three.js, zod, Vite and glTF-Transform (MIT), meshoptimizer (MIT). Pipeline: nibabel, NumPy, SciPy. Font: Atkinson Hyperlegible, SIL Open Font License 1.1, self-hosted. The source code is GPL-3.0.'),
      h('p', {}, h('a', { href: `${SITE_ROOT}THIRD_PARTY_LICENSES.txt`, target: '_blank', rel: 'noopener' }, 'Third-party licence texts'), '. Full details: LICENSE, NOTICE and ATTRIBUTION.md in the source repository.')),
  );
  // every licence named on the page links to its text, and every printed address is a link
  linkLicences(el);
  return { el, render() { /* stateless */ } };
}
