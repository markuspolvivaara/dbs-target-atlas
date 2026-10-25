import { TRAJ, VE_MANIFEST, VE_REFS } from '../ventricles';
import { h } from './h';

/** Sources and Credits of the ventricles section. */

const link = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
const fmt = (x: number) => x.toFixed(1);

export function veSourcesPage() {
  const el = h('div', { class: 'page wrap' });
  const p = TRAJ.params;
  const v = TRAJ.ventricles;
  el.append(
    h('h1', {}, 'Sources'),
    h('section', { class: 'card' },
      h('h2', {}, 'References'),
      h('p', {}, 'Every statement on the cards cites its source, checked against the open-access full text (PMC); Jean 2019, which has none, against its abstract.'),
      h('ul', { class: 'refs' }, ...VE_REFS.map((r) => h('li', {}, r.citation, ' ', link(r.url, 'DOI'), ' · ',
        link(`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`, 'PubMed'),
        r.pmcid ? [' · ', link(`https://pmc.ncbi.nlm.nih.gov/articles/${r.pmcid}/`, 'full text')] : null)))),
    h('section', { class: 'card' },
      h('h2', {}, 'How the model is made'),
      h('p', {}, h('strong', {}, 'The CT and its bone: '), 'Skull base v2’s CT angiogram (TopBrain 2025 case 011), in its frame: millimetres from the fitted hypophysial fossa. The bone is v2’s.'),
      h('p', {}, h('strong', {}, 'The ventricles as the CT shows them (pipeline/ventricles_build.py): '), `in its brain window the ventricular fluid is darker than the brain around it; the fluid below ${p.csfHu} HU (the CT smoothed by ${p.smoothMm} mm), at least ${p.depthMm} mm inside the cranial cavity and away from the labelled vessels is taken: the lateral ventricles are its largest body (${v.volumeMl.R} ml right, ${v.volumeMl.L} ml left), the third ventricle the body of it on the midline below them (${v.volumeMl.third} ml). This patient’s ventricles are narrow: where they are a few millimetres wide the threshold sets their size, and what is narrower than the CT resolves (the temporal horns, the foramina of Monro, the third ventricle’s floor) it misses, as it misses the atria’s enhancing choroid plexus.`),
      h('p', {}, h('strong', {}, 'The ventricles as drawn: '), `the Z-Anatomy model’s lateral and third ventricles (one adult, BodyParts3D) fitted onto the CT’s: scaled as Skull base v2 scaled the model, a similarity, then a smooth deformation in which each point of the CT’s surface pulls the nearest point of the model’s within ${p.fitPairMm} mm and each point of the model’s is pulled onto the CT’s within ${p.fitBackMm} mm, so that where the CT shows no fluid the model stays. The CT’s surface lies a median ${v.fit.fitMedianMm} mm from the fitted model’s (${v.fit.fitP90Mm} mm at the 90th percentile), and the deformation does not fold it (its Jacobian at least ${v.fit.jacobianMin}). Along the fitted temporal horns the CT is ${v.fit.temporalHorn.R.insideHu} HU on the right and ${v.fit.temporalHorn.L.insideHu} HU on the left, against ${v.fit.temporalHorn.R.aroundHu} and ${v.fit.temporalHorn.L.aroundHu} HU in the brain 2.5 to 5 mm around: the right one lies on the CT’s faint fluid, the left one’s course is the model’s. The drawn surface is the union of the CT’s ventricles, the fitted model and the foramina, its signed distance smoothed by ${p.softMm} mm and drawn ${p.drawOutMm} mm outside it (softer and a little larger, within the CT’s uncertainty), the two lateral ventricles kept apart at the septum (${v.drawnMl.R} ml right, ${v.drawnMl.L} ml left, ${v.drawnMl.third} ml for the third ventricle).`),
      h('p', {}, h('strong', {}, 'The aqueduct and the fourth ventricle: '), `the fourth ventricle is this CT’s where it shows it, the fluid within reach of the model’s (${v.volumeMl.fourth} ml, its upper part), and the fitted model’s elsewhere: the CT’s part lies a median ${v.fit.fourthFitMedianMm} mm from it. This CT does not resolve the aqueduct: it is drawn along the fitted model’s course (${v.fit.aqueduct.modelLengthMm} mm, its ends ${v.fit.aqueduct.gapToThirdMm} and ${v.fit.aqueduct.gapToFourthMm} mm from the fitted third and fourth ventricles), run on into both (${v.fit.aqueduct.courseMm} mm in all), as a tube of the mean diameters Xiao 2025 measured in 30 healthy adults aged 61 to 88: ${p.aqueductMm[0]} mm where it leaves the third ventricle, ${p.aqueductMm[1]} mm at its narrowest (put midway, as the paper does not say clearly where) and ${p.aqueductMm[2]} mm where it opens into the fourth. So the drawn ventricles are one cavity, from the lateral ventricles to the fourth.`),
      h('p', {}, h('strong', {}, 'The foramina of Monro: '), `drawn by rule, as the CT does not resolve them: a tube of the mean cross-section Jean 2019 measured in 30 adults without hydrocephalus (${p.monroAreaMm2} mm², here a circle ${fmt(2 * v.fit.monroRadiusMm)} mm across) between the points where the fitted lateral ventricle comes closest to the fitted third ventricle (${v.fit.monro.R.gapMm} mm apart on the right, ${v.fit.monro.L.gapMm} mm on the left), at the third ventricle’s front upper corner, where Azab 2014 places them. Along them the CT is ${v.fit.monroCt.R.insideHu} and ${v.fit.monroCt.L.insideHu} HU, against ${v.fit.monroCt.R.aroundHu} and ${v.fit.monroCt.L.aroundHu} HU around: darker, so they lie where it shows fluid.`),
      h('p', {}, h('strong', {}, 'The brain around them: '), 'the template (Lead-DBS MNI 2009b pial surface) fitted into this CT in Skull base v3; see its Sources.'),
      h('p', {}, h('strong', {}, 'Landmarks: '), `the coronal suture where this CT’s frontal and parietal bones meet (named after the Z-Anatomy model fitted onto it, v2); Kocher’s point ${p.kocherAnteriorMm} mm in front of it along the outer table, ${p.kocher.chen} mm (Chen) or ${p.kocher.park} mm (Park) from the midline; the external acoustic meatus where the ear canal, the shortest way through air from the registered tympanic membrane (OpenEar, Skull base v3) to outside, leaves the bone. The CT stops at the forehead, so the medial canthi are placed ${TRAJ.canthusMm} mm from the midline, half Chen’s mean intercanthal distance (206 CTs), and projected onto the line between the two meatus as Chen does: only their distance from the midline matters.`),
      h('p', {}, h('strong', {}, 'Trajectories: '), `from Kocher’s point (and from points ${p.apOffsets.filter((x) => x).map((x) => Math.abs(x)).filter((x, i, a) => a.indexOf(x) === i).join(', ')} mm in front of and behind it) towards each target, followed ${p.maxDepthMm} mm from the outer table (Chen: with no fluid by 65 mm the catheter is withdrawn and re-aimed) to the first lateral ventricle, as drawn, it meets: which side, the depth from the outer table, and its course inside; if it meets none, how close it passes. The perpendicular trajectory follows the outer table’s normal at the entry.`)),
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
      h('p', {}, h('strong', {}, 'Licence: '), d.licence, '. The ventricles (public/assets/ventricles/) are segmented here from this CT and completed by the Z-Anatomy model fitted onto them; adapted from Z-Anatomy, they stay under CC BY-SA 4.0, and their fit uses the TopBrain data (non-commercial). The bone and the fitted brain are Skull base v2’s and v3’s files: see their credits.'),
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
