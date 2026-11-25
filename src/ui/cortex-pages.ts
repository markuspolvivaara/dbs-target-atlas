import { CTX_MANIFEST, CTX_REFS, LABELS, LOBES, METHOD, shortName } from '../cortex';
import { REGIONS } from '../cortex/regions';
import { SYN_REFS, SYNDROMES } from '../cortex/syndromes';
import { abbreviationList, h } from './h';
import { linkLicences, UPSTREAM_NOTE } from './licences';

/** Sources and Credits of the cortex section. */

const a = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

export function cortexSourcesPage() {
  const el = h('div', { class: 'page wrap' });
  const d = CTX_MANIFEST.dataset;
  const defs = LABELS.filter((l) => l.definition && !l.definition.refIds).length;
  // texts written for this atlas where Z-Anatomy ships none (the site audit's B-014)
  const own = LABELS.filter((l) => l.definition?.refIds).length;
  const ownLobes = LOBES.filter((l) => l.definition?.refIds).map((l) => l.name.toLowerCase());
  const edited = [...LABELS.filter((l) => l.definition?.edits?.length).map((l) => shortName(l.id)),
    ...LOBES.filter((l) => l.definition?.edits?.length).map((l) => l.name)].map((n) => n.toLowerCase());
  const urls = [...new Set([...LABELS.map((l) => l.definition?.url), ...LOBES.map((l) => l.definition?.url)].filter((u): u is string => !!u))].sort();
  el.append(
    h('h1', {}, 'Sources'),
    // (the cingulate labels' abbreviations: the audit's B-022)
    abbreviationList([['ACC', 'anterior cingulate cortex'], ['aMCC', 'anterior midcingulate cortex'], ['dPCC', 'dorsal posterior cingulate cortex'],
      ['pMCC', 'posterior midcingulate cortex'], ['vPCC', 'ventral posterior cingulate cortex']]),
    h('section', { class: 'card' },
      h('h2', {}, 'Surface and labels'),
      h('p', {}, `The surface is the pial surface of the MNI ICBM 2009b template brain shipped with Lead-DBS; the ${LABELS.length} gyri and sulci are FreeSurfer’s Destrieux 2009 parcellation (aparc.a2009s) of that template, also shipped with Lead-DBS. Nothing is drawn by hand. The pipeline (pipeline/cortex_build.py) reduces each hemisphere to ${METHOD.faces / 1000}k triangles, smooths the few places where that reduction made opposite banks of a tight sulcus pass through each other (about 9,000 vertices per hemisphere move, by at most 4 mm) until no triangles cross, carries the labels over from the full-resolution surface, evens out stray vertices along the borders (each vertex takes the label most of its neighbours carry, twice) and cuts the triangles on a border at their edge midpoints, so borders run smoothly instead of following the triangle edges.`),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', a(d.citationUrls[i], 'DOI'))),
      h('p', { class: 'aside' }, d.note)),
    h('section', { class: 'card' },
      h('h2', {}, 'Names, views and areas'),
      h('p', {}, 'The long name of each label, the views on which it is visible, and the mean areas quoted on the cards come from Table 1 of Destrieux et al. 2010 (means of the 12 manually labelled brains of their training set). The four views of the atlas list the labels that table gives for the lateral, medial and inferior views; the insular view lists the insula and its circular sulcus.')),
    h('section', { class: 'card' },
      h('h2', {}, 'Measured on the template'),
      h('p', {}, 'Lobes, borders, areas and overlaps are measured by the pipeline on this one surface and say nothing about other brains:'),
      h('ul', {},
        h('li', {}, 'Lobe: the share of a label’s vertices in Desikan-Killiany regions (FreeSurfer aparc, also shipped with Lead-DBS) of each lobe, with the regions grouped into lobes as in Klein & Tourville 2012 (Table 2; the insula on its own). A label belongs to every lobe holding at least 25% of it and is coloured by the largest, except the five parts of the cingulate gyrus, the three segments of the circular sulcus of the insula, and the superior occipital gyrus and sulcus, which are shown with the cingulate cortex, the insula and the occipital lobe as their Destrieux names place them (Desikan-Killiany’s parietal regions reach further back than the parietal lobe of Destrieux et al. 2010, who define both on the lateral aspect of the occipital lobe).'),
        h('li', {}, 'Borders: the share of a label’s outline it shares with each neighbour (at least 3%).'),
        h('li', {}, `Overlap with the DBS section’s cortical areas: HMAT (Mayka 2006) labels within ${METHOD.hmatMaxDistMm} mm of the surface, and Desikan-Killiany regions, as the DBS section draws them.`),
        h('li', {}, `Insular view: on the pial surface, triangles lying at least ${METHOD.operLateralMm} mm lateral of the insula within its outline seen from the side (plus ${METHOD.operMarginMm} mm) are left out.`),
        h('li', {}, `Inflated surface: ${METHOD.inflateIterations} smoothing steps of the decimated pial surface, rescaled to its size; the shading is how far the pial surface lies inside it (sulcal depth).`))),
    h('section', { class: 'card' },
      h('h2', {}, 'Definitions'),
      h('p', {}, `${defs} of the ${LABELS.length} labels have a definition from the Wikipedia text Z-Anatomy ships for the matching structure (CC BY-SA 3.0), shortened to its lead. Where the text describes a larger structure (the whole cingulate cortex, the limbic lobe, the insula, the superior temporal gyrus) or a neighbouring one (the olfactory tract under the olfactory sulcus), the card says so. They have not been checked against the literature as a whole${edited.length ? `; passages found to be wrong, garbled or without a source were corrected or left out in ${edited.length === 1 ? 'one text' : `${edited.length} texts`} (${edited.join(', ')}), and the card shows the corrected text and says what was changed and why` : ''}.`),
      own ? h('p', {}, `Z-Anatomy ships no text for the other ${own} labels${ownLobes.length ? ` or for the ${ownLobes.join(' and the ')}` : ''}: their cards have a short text written for this atlas from the full text of Destrieux et al. 2010, and say which sections it comes from.`) : null,
      h('details', { class: 'more' }, h('summary', {}, `Wikipedia source pages (${urls.length})`),
        h('ul', { class: 'refs' }, ...urls.map((u) => h('li', {}, a(u, decodeURIComponent(u.replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//, '')).replace(/_/g, ' '))))))),
    // the syndrome cards (src/cortex/syndromes.ts)
    h('section', { class: 'card' },
      h('h2', {}, 'Syndromes'),
      h('p', {}, `The ${SYNDROMES.length} syndrome cards are written for this atlas: every sentence comes from one of the papers below, each read in open full text, and cites it. The areas drawn for a syndrome are the motor template’s areas where the papers name one (the supplementary motor areas), else the Destrieux labels nearest to the regions those papers name; each card lists them with the reason, and says that they approximate a region, not the extent of a lesion.`),
      h('ul', { class: 'refs' }, ...Object.values(SYN_REFS).sort((x, y) => x.citation.localeCompare(y.citation)).map((r) => h('li', {}, r.citation, ' ', a(r.url, linkWord(r.url)))))),
    // the surgical regions (src/cortex/regions.ts)
    h('section', { class: 'card' },
      h('h2', {}, 'Surgical regions'),
      h('p', {}, `The ${REGIONS.length} surgical-region cards are written for this atlas in the same way, from the papers below (some also cited by the syndrome cards). The tracts drawn with them are the white-matter section’s, from the HCP-1065 atlas, whose sources are on that section’s Sources page.`),
      h('ul', { class: 'refs' }, ...regionRefs().map((r) => h('li', {}, r.citation, ' ', a(r.url, linkWord(r.url)))))),
  );
  return { el, render() { /* stateless */ } };
}

const linkWord = (url: string) => (url.includes('doi.org') ? 'DOI' : 'Full text');

/** every paper the region cards cite, once, by citation */
function regionRefs() {
  const ids = new Set(REGIONS.flatMap((r) => [...r.mapped, ...r.deficits, ...r.course, ...r.limits, ...r.labels, ...r.fns, ...r.tracts].flatMap((c) => c.refIds ?? [])));
  return [...ids].map((id) => CTX_REFS.get(id)!).sort((x, y) => x.citation.localeCompare(y.citation));
}

export function cortexCreditsPage() {
  const el = h('div', { class: 'page wrap' });
  const d = CTX_MANIFEST.dataset;
  el.append(
    h('h1', {}, 'Credits and licences'),
    h('section', { class: 'card', id: 'destrieux' },
      h('h2', {}, d.name),
      h('p', {}, h('strong', {}, 'Licence: '), d.licence, '.'),
      h('p', {}, 'The template surface and its FreeSurfer annotations (Destrieux and Desikan-Killiany) are distributed with ', a('https://www.lead-dbs.org', 'Lead-DBS'), ' (GPL-3). FreeSurfer’s licence allows use, modification and redistribution with its notices kept, for research purposes; it is not intended for clinical use.'),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', a(d.citationUrls[i], 'DOI'))),
      h('p', { class: 'aside' }, 'Changes made: surfaces decimated and split by label, an inflated surface and sulcal-depth shading computed, files converted to compressed glTF.')),
    h('section', { class: 'card', id: 'mri' },
      h('h2', {}, 'MRI slices'),
      h('p', {}, 'The Slices tab shows the ICBM 2009b nonlinear asymmetric templates (T1, T2, PD), the DBS section’s files. Copyright (C) 1993–2004 Louis Collins, McConnell Brain Imaging Centre, Montreal Neurological Institute, McGill University. Permission to use, copy, modify, and distribute this software and its documentation for any purpose and without fee is hereby granted, provided that the above copyright notice appear in all copies. The authors and McGill University make no representations about the suitability of this software for any purpose. It is provided “as is” without express or implied warranty.')),
    h('section', { class: 'card' },
      h('h2', {}, 'Definitions'),
      h('p', {}, 'Wikipedia - CC BY-SA 3.0, as shipped with Z-Anatomy (CC BY-SA 4.0); the source page is linked on each definition that has one (four do not: those of the inferior frontal gyrus’s opercular and orbital parts, the occipital pole and the temporal pole). The texts written for this atlas where Z-Anatomy ships none are not Wikipedia’s: they come from Destrieux et al. 2010, which their cards cite.'),
      h('p', { class: 'aside' }, UPSTREAM_NOTE)),
    h('section', { class: 'card' },
      h('h2', {}, 'Lobe grouping'),
      h('p', {}, 'Klein A, Tourville J. 101 labeled brain images and a consistent human cortical labeling protocol. Front Neurosci. 2012;6:171 (CC BY 3.0). ', a('https://doi.org/10.3389/fnins.2012.00171', 'DOI'))),
    h('section', { class: 'card' },
      h('h2', {}, 'Software'),
      h('p', {}, 'three.js, zod, Vite and glTF-Transform (MIT), meshoptimizer (MIT); trimesh, SciPy and NumPy in the build. Font: Atkinson Hyperlegible, SIL Open Font License 1.1, self-hosted. The source code is GPL-3.0.')),
  );
  // every licence named on the page links to its text, and every printed address is a link
  linkLicences(el);
  return { el, render() { /* stateless */ } };
}
