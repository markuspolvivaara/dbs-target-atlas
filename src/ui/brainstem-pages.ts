import { BS, BS_MANIFEST, BS_REFS, CONTEXT, DEFINITIONS, OWN_TRACTS, TRACT_FIT } from '../brainstem';
import { h } from './h';
import { linkLicences } from './licences';

/** Sources and Credits of the brainstem section. */

const pct = (share: number) => `${Math.round(share * 100)} %`;

export function bsSourcesPage() {
  const el = h('div', { class: 'page wrap' });
  const za = BS_MANIFEST.datasets.zanatomy;
  const aan = BS_MANIFEST.datasets.aan;
  const hcp = BS_MANIFEST.datasets.hcp842;
  const sides = OWN_TRACTS.flatMap((id) => [TRACT_FIT[id].L, TRACT_FIT[id].R]);
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
        `Two independent checks, one for each way of being wrong. Not too small: ${Math.round(f.cstInsideShare * 1000) / 10} % of the points of the white-matter section’s corticospinal tract (HCP-1065 tractography, built separately) between z ${f.cstLevels[0]} and ${f.cstLevels[1]} mm lie inside the fitted pons and medulla. `,
        `Not too large, and on the right wall: against the T2 template itself, ${Math.round(f.ownWallWithin1mmShare * 100)} % of the fitted surface lies within 1 mm of the brainstem’s own tissue–fluid boundary and ${Math.round(f.farWallWithin1mmShare * 100)} % within 1 mm of the far wall of a cistern; ${Math.round(f.solidFluidShare * 100)} % of the fitted solid is fluid on the template, and ${Math.round(f.ventricleFluidShare * 100)} % of the model’s fourth ventricle is. `,
        `Width of the model against the template’s tissue: ${f.widths.filter((w) => w.templateMm).map((w) => `${w.part} at z ${w.z} mm, ${w.modelMm} against ${w.templateMm} mm`).join('; ')}. `,
        'Until November 2026 the model was fitted to the far wall of the cisterns and was about 3 mm too large all round; the positions of the entry zones on the floor of the fourth ventricle changed with the correction.'),
      h('p', {}, h('strong', {}, 'Arousal network nuclei: '), aan.name, '. ', aan.note),
      h('p', { id: 'hcp-tracts' }, h('strong', {}, 'Medial longitudinal fasciculus, central tegmental tract, spinothalamic tract, lateral lemniscus: '), hcp.name, '. ', hcp.note),
      h('p', {}, 'How each of the four sits on this template (pipeline/brainstem_build.py tract_fit), left and right: the streamlines drawn, the share of their length at the fitted brainstem’s levels that lies inside the fitted brainstem, how far outside it the farthest point lies, and the share of all their length that is fluid on the T2 template (measured against the template itself, not against the fit).'),
      h('ul', {}, ...OWN_TRACTS.map((id) => {
        const t = TRACT_FIT[id];
        return h('li', {}, `${BS.get(id)!.name}: ${t.L.streamlines} and ${t.R.streamlines} streamlines; inside ${pct(t.L.insideShare)} and ${pct(t.R.insideShare)}; farthest outside ${t.L.outsideMaxMm} and ${t.R.outsideMaxMm} mm; fluid on the template ${pct(t.L.fluidShare)} and ${pct(t.R.fluidShare)}.`);
      })),
      h('p', {}, 'No shift was applied: these figures say how well the atlas’s space and this template agree for each tract.'),
      h('p', {}, `The streamline files give their points from the centre of the atlas’s first voxel, not from its corner as the TrackVis format has it. Read from the centre, ${(Math.min(...sides.map((x) => x.inOwnVolumeShare)) * 100).toFixed(1)} % or more of each bundle’s points within the atlas’s grid lie in the atlas’s own volume of the same tract (its NIfTI files); read from the corner, ${pct(Math.min(...sides.map((x) => x.cornerReadShare)))} to ${pct(Math.max(...sides.map((x) => x.cornerReadShare)))} would. Up to ${pct(Math.max(...sides.map((x) => x.belowGridShare)))} of a bundle’s points lie below the grid, where the spinothalamic tract’s streamlines run on.`),
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
  const hcp = BS_MANIFEST.datasets.hcp842;
  el.append(
    h('h1', {}, 'Credits and licences'),
    h('section', { class: 'card', id: 'zanatomy' },
      h('h2', {}, 'Z-Anatomy (BodyParts3D)'),
      h('p', {}, h('strong', {}, 'Licence: '), za.licence, '. These files (public/assets/brainstem/ except the arousal network nuclei and the four tracts of the HCP-YA atlas, bs-*.json) are not under the GPL like the project’s code: adapted versions must stay under CC BY-SA with attribution.'),
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
    h('section', { class: 'card', id: 'hcp842' },
      h('h2', {}, hcp.name),
      h('p', {}, h('strong', {}, 'Licence: '), hcp.licence, '. The four tract files (public/assets/brainstem/bs_t_*.glb) are not under the GPL like the project’s code: adapted versions must stay under CC BY-SA with attribution.'),
      h('p', {}, 'Those terms: redistribution only under the same terms, acknowledgement when presenting results, and no attempt to identify or contact participants.'),
      h('ul', {}, ...hcp.attribution.map((a) => h('li', {}, a))),
      h('p', { class: 'aside' }, 'Changes made: of the atlas’s streamline files, those of four tracts were used (the medial longitudinal fasciculus, the central tegmental tract, the spinothalamic tract and the lateral lemniscus, both sides); their points moved by half a voxel (the files give them from the first voxel’s centre), streamlines shorter than 10 mm left out, the rest resampled to 1 mm and drawn where the atlas has them; files converted to compressed glTF. The atlas’s volumes of the same tracts were used only to check the streamline files.'),
      ...hcp.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', h('a', { href: hcp.citationUrls[i], target: '_blank', rel: 'noopener' }, /doi\.org/.test(hcp.citationUrls[i]) ? 'DOI' : 'Source page')))),
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
  // every licence named on the page links to its text, and every printed address is a link
  linkLicences(el);
  return { el, render() { /* stateless */ } };
}
