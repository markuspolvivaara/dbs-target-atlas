import { CTX_MANIFEST, LABELS, LOBES, METHOD } from '../cortex';
import { h } from './h';

/** Sources and Credits of the cortex section. */

const a = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

export function cortexSourcesPage() {
  const el = h('div', { class: 'page wrap' });
  const d = CTX_MANIFEST.dataset;
  const defs = LABELS.filter((l) => l.definition).length;
  const urls = [...new Set([...LABELS.map((l) => l.definition?.url), ...LOBES.map((l) => l.definition?.url)].filter((u): u is string => !!u))].sort();
  el.append(
    h('h1', {}, 'Sources'),
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
        h('li', {}, 'Lobe: the share of a label’s vertices in Desikan-Killiany regions (FreeSurfer aparc, also shipped with Lead-DBS) of each lobe, with the regions grouped into lobes as in Klein & Tourville 2012 (Table 2; the insula on its own). A label belongs to every lobe holding at least 25% of it and is coloured by the largest, except the five parts of the cingulate gyrus and the three segments of the circular sulcus of the insula, which are shown with the cingulate cortex and the insula as their Destrieux names place them.'),
        h('li', {}, 'Borders: the share of a label’s outline it shares with each neighbour (at least 3%).'),
        h('li', {}, `Overlap with the DBS section’s cortical areas: HMAT (Mayka 2006) labels within ${METHOD.hmatMaxDistMm} mm of the surface, and Desikan-Killiany regions, as the DBS section draws them.`),
        h('li', {}, `Insular view: on the pial surface, triangles lying at least ${METHOD.operLateralMm} mm lateral of the insula within its outline seen from the side (plus ${METHOD.operMarginMm} mm) are left out.`),
        h('li', {}, `Inflated surface: ${METHOD.inflateIterations} smoothing steps of the decimated pial surface, rescaled to its size; the shading is how far the pial surface lies inside it (sulcal depth).`))),
    h('section', { class: 'card' },
      h('h2', {}, 'Definitions'),
      h('p', {}, `${defs} of the ${LABELS.length} labels have a definition: the Wikipedia text Z-Anatomy ships for the matching structure (CC BY-SA 3.0), shortened to its lead. Where the text describes a larger structure (the whole cingulate cortex, the insula, the superior temporal gyrus), the card says so. They have not been checked against the literature yet.`),
      h('details', { class: 'more' }, h('summary', {}, `Wikipedia source pages (${urls.length})`),
        h('ul', { class: 'refs' }, ...urls.map((u) => h('li', {}, a(u, decodeURIComponent(u.replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//, '')).replace(/_/g, ' '))))))),
  );
  return { el, render() { /* stateless */ } };
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
    h('section', { class: 'card' },
      h('h2', {}, 'Definitions'),
      h('p', {}, 'Wikipedia - CC BY-SA 3.0, as shipped with Z-Anatomy (CC BY-SA 4.0); the source page is linked on each definition.')),
    h('section', { class: 'card' },
      h('h2', {}, 'Lobe grouping'),
      h('p', {}, 'Klein A, Tourville J. 101 labeled brain images and a consistent human cortical labeling protocol. Front Neurosci. 2012;6:171 (CC BY 3.0). ', a('https://doi.org/10.3389/fnins.2012.00171', 'DOI'))),
    h('section', { class: 'card' },
      h('h2', {}, 'Software'),
      h('p', {}, 'three.js, zod, Vite and glTF-Transform (MIT), meshoptimizer (MIT); trimesh, SciPy and NumPy in the build. Font: Atkinson Hyperlegible, SIL Open Font License 1.1, self-hosted. The source code is GPL-3.0.')),
  );
  return { el, render() { /* stateless */ } };
}
