import { BS_MANIFEST, BS_REFS, CONTEXT, DEFINITIONS } from '../brainstem';
import { h } from './h';

/** Sources and Credits of the brainstem section. */

export function bsSourcesPage() {
  const el = h('div', { class: 'page wrap' });
  const za = BS_MANIFEST.datasets.zanatomy;
  const aan = BS_MANIFEST.datasets.aan;
  const f = BS_MANIFEST.fit;
  const urls = [...new Set(Object.values(DEFINITIONS).map((x) => x.url).filter((u): u is string => !!u))].sort();
  el.append(
    h('h1', {}, 'Sources'),
    h('section', { class: 'card' },
      h('h2', {}, 'References'),
      h('p', {}, 'Every statement on the cards cites its source. Statements citing a reference with an open-access full text (PMC) were checked against that text; the others against their abstracts.'),
      h('ul', { class: 'refs' }, ...BS_REFS.map((r) => h('li', {}, r.citation, ' ',
        h('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'DOI'), ' · ',
        h('a', { href: `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`, target: '_blank', rel: 'noopener' }, 'PubMed'),
        r.pmcid ? [' · ', h('a', { href: `https://pmc.ncbi.nlm.nih.gov/articles/${r.pmcid}/`, target: '_blank', rel: 'noopener' }, 'full text')] : null)))),
    h('section', { class: 'card' },
      h('h2', {}, 'Anatomy'),
      h('p', {}, h('strong', {}, 'Brainstem, cranial nerves, nuclei, arteries: '), za.name, '. ', za.note),
      h('p', {}, 'The fit (pipeline/brainstem_fit.py): the ICBM 2009b T2 template, averaged with its mirror image, gives the boundary between brainstem tissue and the surrounding fluid (cisterns, aqueduct, fourth ventricle). The model’s brainstem and ventricle walls are matched to it where their normals agree: first by a similarity transform kept on the midline (a rotation about the left–right axis, a shift and one scale), then by a smooth deformation, symmetric between the sides. ',
        `Result: scale ${f.scale}, rotation ${f.rotationDeg}°; of the model’s surface points, ${Math.round(f.warpedMatchedShare * 100)} % found a matching boundary within 4 mm (the rest are the model’s cut faces towards the diencephalon and cerebellum, where the template has no boundary), and these lie a median ${f.warpedMedianMm} mm from it (90 % within ${f.warpedP90Mm} mm). `,
        `An independent check: ${Math.round(f.cstInsideShare * 1000) / 10} % of the points of the white-matter section’s corticospinal tract (HCP-1065 tractography, built separately) between z ${f.cstLevels[0]} and ${f.cstLevels[1]} mm lie inside the fitted pons and medulla.`),
      h('p', {}, h('strong', {}, 'Arousal network nuclei: '), aan.name, '. ', aan.note),
      h('p', {}, h('strong', {}, 'From the other sections: '), CONTEXT.map((s) => s.name).join(', '), '. See those sections for their sources.'),
      h('p', {}, h('strong', {}, 'Safe entry zones: '), 'drawn by rule on the fitted surface from the published definitions (the rule for each is on its card); the facial colliculus and the sulcus limitans on the floor of the fourth ventricle are placed by the proportions measured by Erginoglu et al. 2026.')),
    h('section', { class: 'card' },
      h('h2', {}, 'Definitions'),
      h('p', {}, `The definitions on the cards of the model’s structures (${Object.keys(DEFINITIONS).length}) are the Wikipedia texts that Z-Anatomy ships with its model, under CC BY-SA 3.0, shortened to their lead section. They have not been checked against the literature.`),
      h('details', { class: 'more' }, h('summary', {}, `Wikipedia source pages (${urls.length})`),
        h('ul', { class: 'refs' }, ...urls.map((u) => h('li', {}, h('a', { href: u, target: '_blank', rel: 'noopener' }, decodeURIComponent(u.replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//, '')).replace(/_/g, ' '))))))),
  );
  return { el, render() { /* stateless */ } };
}

export function bsCreditsPage() {
  const el = h('div', { class: 'page wrap' });
  const za = BS_MANIFEST.datasets.zanatomy;
  const aan = BS_MANIFEST.datasets.aan;
  el.append(
    h('h1', {}, 'Credits and licences'),
    h('section', { class: 'card', id: 'zanatomy' },
      h('h2', {}, 'Z-Anatomy (BodyParts3D)'),
      h('p', {}, h('strong', {}, 'Licence: '), za.licence, '. These files (public/assets/brainstem/ except the arousal network nuclei, bs-*.json) are not under the GPL like the project’s code: adapted versions must stay under CC BY-SA with attribution.'),
      h('p', {}, 'Attribution, as the authors ask:'),
      h('ul', {}, ...za.attribution.map((a) => h('li', {}, a))),
      h('p', { class: 'aside' }, 'Authors of the original model: Kousaku Okubo (BodyParts3D); Gauthier Kervyn (Z-Anatomy design, 3D, anatomy); Marcin Zielinski (Blender add-on); Lluis Vinent (Unity development).'),
      h('p', { class: 'aside' }, 'Changes made: the brainstem, its surface features, ventricles, cranial nerve nuclei, cranial nerves III–XII and the arteries around the brainstem exported from the Z-Anatomy Blender file; fitted into MNI space (a similarity transform and a smooth deformation onto the ICBM 2009b template); midline structures cut at the midline; nerves and arteries rebuilt as tubes around their centre lines with the modelled radius and kept near the brainstem; safe entry zones drawn on the fitted surface; files converted to compressed glTF; definitions shortened to their lead section.'),
      ...za.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', h('a', { href: za.citationUrls[i], target: '_blank', rel: 'noopener' }, 'DOI'))),
      h('p', {}, h('a', { href: za.url, target: '_blank', rel: 'noopener' }, 'Z-Anatomy repository'))),
    h('section', { class: 'card', id: 'aan' },
      h('h2', {}, aan.name),
      h('p', {}, h('strong', {}, 'Licence: '), aan.licence, ' (public domain dedication). Changes made: each label’s surface taken after linear resampling to 0.5 mm; midline nuclei cut at the midline.'),
      h('ul', {}, ...aan.attribution.map((a) => h('li', {}, a))),
      ...aan.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', h('a', { href: aan.citationUrls[i], target: '_blank', rel: 'noopener' }, 'DOI')))),
    h('section', { class: 'card' },
      h('h2', {}, 'Template'),
      h('p', {}, 'The fit and the slices use the ICBM 2009b nonlinear asymmetric templates (McGill University, Montreal Neurological Institute), under their own notice: see the DBS section’s credits.')),
    h('section', { class: 'card' },
      h('h2', {}, 'From the other sections'),
      h('p', {}, 'The tracts (HCP-1065 atlas, CC BY-SA 4.0, with the WU-Minn HCP data use terms) and the deep nuclei (Lead-DBS atlases, GPL-3.0, non-commercial at their owners’ request) are the white-matter and DBS sections’ files, under their licences: see those sections’ credits.')),
    h('section', { class: 'card' },
      h('h2', {}, 'Software'),
      h('p', {}, 'three.js, zod, Vite and glTF-Transform (MIT), meshoptimizer (MIT); Blender (GPL) to read the model during the build. Font: Atkinson Hyperlegible, SIL Open Font License 1.1, self-hosted. The source code is GPL-3.0.')),
  );
  return { el, render() { /* stateless */ } };
}
