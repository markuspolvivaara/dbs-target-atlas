import { TRAJ, VE_MANIFEST, VE_REFS } from '../ventricles';
import { h } from './h';

/** Sources and Credits of the ventricles section. */

const link = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

export function veSourcesPage() {
  const el = h('div', { class: 'page wrap' });
  const p = TRAJ.params;
  const v = TRAJ.ventricles;
  el.append(
    h('h1', {}, 'Sources'),
    h('section', { class: 'card' },
      h('h2', {}, 'References'),
      h('p', {}, 'Every statement on the cards cites its source, checked against the open-access full text (PMC).'),
      h('ul', { class: 'refs' }, ...VE_REFS.map((r) => h('li', {}, r.citation, ' ', link(r.url, 'DOI'), ' · ',
        link(`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`, 'PubMed'),
        r.pmcid ? [' · ', link(`https://pmc.ncbi.nlm.nih.gov/articles/${r.pmcid}/`, 'full text')] : null)))),
    h('section', { class: 'card' },
      h('h2', {}, 'How the model is made'),
      h('p', {}, h('strong', {}, 'The CT and its bone: '), 'Skull base v2’s CT angiogram (TopBrain 2025 case 011), in its frame: millimetres from the fitted hypophysial fossa. The bone is v2’s.'),
      h('p', {}, h('strong', {}, 'The ventricles (pipeline/ventricles_build.py): '), `this CT’s own. In its brain window the ventricular fluid is darker than the brain around it; the fluid below ${p.csfHu} HU (the CT smoothed by ${p.smoothMm} mm), at least ${p.depthMm} mm inside the cranial cavity and away from the labelled vessels is taken, and the lateral ventricles are its largest body (${v.volumeMl.R} ml right, ${v.volumeMl.L} ml left), split at the falx’s plane; the third ventricle is the body of that fluid on the midline below and between them (${v.volumeMl.third} ml, as far as the CT shows it). The surfaces are drawn at ${p.csfHu} HU. This patient’s ventricles are narrow: where they are only a few millimetres wide the threshold sets their size, so they are approximate to about a millimetre.`),
      h('p', {}, h('strong', {}, 'The brain around them: '), 'the template (Lead-DBS MNI 2009b pial surface) fitted into this CT in Skull base v3; see its Sources.'),
      h('p', {}, h('strong', {}, 'Landmarks: '), `the coronal suture where this CT’s frontal and parietal bones meet (named after the Z-Anatomy model fitted onto it, v2); Kocher’s point ${p.kocherAnteriorMm} mm in front of it along the outer table, ${p.kocher.chen} mm (Chen) or ${p.kocher.park} mm (Park) from the midline; the external acoustic meatus where the ear canal, the shortest way through air from the registered tympanic membrane (OpenEar, Skull base v3) to outside, leaves the bone. The CT stops at the forehead, so the medial canthi are placed ${TRAJ.canthusMm} mm from the midline, half Chen’s mean intercanthal distance (206 CTs), and projected onto the line between the two meatus as Chen does: only their distance from the midline matters.`),
      h('p', {}, h('strong', {}, 'Trajectories: '), `from Kocher’s point (and from points ${p.apOffsets.filter((x) => x).map((x) => Math.abs(x)).filter((x, i, a) => a.indexOf(x) === i).join(', ')} mm in front of and behind it) towards each target, followed in ${p.maxDepthMm} mm into the brain to the first ventricle it meets: which side, the depth from the outer table, and its course inside; if it meets none, how close it passes. The perpendicular trajectory follows the outer table’s normal at the entry.`)),
  );
  return { el, render() { /* stateless */ } };
}

export function veCreditsPage() {
  const el = h('div', { class: 'page wrap' });
  const d = VE_MANIFEST.dataset;
  el.append(
    h('h1', {}, 'Credits and licences'),
    h('section', { class: 'card', id: 'topbrain' },
      h('h2', {}, d.name),
      h('p', {}, h('strong', {}, 'Licence: '), d.licence, '. The ventricles (public/assets/ventricles/) are segmented here from this CT; the bone and the fitted brain are Skull base v2’s and v3’s files: see their credits.'),
      h('ul', {}, ...d.attribution.map((a) => h('li', {}, a))),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', link(d.citationUrls[i], 'DOI')))),
    h('section', { class: 'card' },
      h('h2', {}, 'From the other sections'),
      h('p', {}, 'The template brain (Lead-DBS, GPL-3.0; its FreeSurfer labels for research use), the bone names (Z-Anatomy, CC BY-SA 4.0) and the registered tympanic membrane (OpenEar, CC BY 4.0) are the skull-base sections’ files and data, under their licences: see the skull base’s credits.')),
    h('section', { class: 'card' },
      h('h2', {}, 'Software'),
      h('p', {}, 'three.js, zod, Vite and glTF-Transform (MIT), meshoptimizer (MIT), scikit-image (BSD). Font: Atkinson Hyperlegible, SIL Open Font License 1.1, self-hosted. The source code is GPL-3.0.')),
  );
  return { el, render() { /* stateless */ } };
}
