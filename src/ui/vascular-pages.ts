import { DSA, LESIONS, VA_MANIFEST, VA_REFS } from '../vascular';
import { h } from './h';

/** Sources and Credits of the vascular section. */

const link = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

export function vaSourcesPage() {
  const el = h('div', { class: 'page wrap' });
  const n = (k: string) => LESIONS.filter((l) => l.kind === k).length;
  el.append(
    h('h1', {}, 'Sources'),
    h('section', { class: 'card' },
      h('h2', {}, 'References'),
      h('p', {}, 'Every statement on the cards cites its source, checked against the open-access full text (PMC).'),
      h('ul', { class: 'refs' }, ...VA_REFS.map((r) => h('li', {}, r.citation, ' ', link(r.url, 'DOI'), ' · ',
        link(`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`, 'PubMed'),
        r.pmcid ? [' · ', link(`https://pmc.ncbi.nlm.nih.gov/articles/${r.pmcid}/`, 'full text')] : null)))),
    h('section', { class: 'card' },
      h('h2', {}, 'How the model is made'),
      h('p', {}, h('strong', {}, 'The vessels: '), 'Skull base v3’s, from one adult’s CT angiogram (TopBrain 2025 case 011), in its frame (millimetres from the fitted hypophysial fossa): the arteries and deep veins as TopBrain’s experts labelled them, the dural sinuses, the middle meningeal artery and the carotid’s petrous part traced in the CT, the cervical carotids and jugular veins segmented by TotalSegmentator, and the small vessels the skull base fits from the Z-Anatomy model or draws by rule (the cavernous sinus and its veins, the Sylvian veins, the perforators). Each card says which.'),
      h('p', {}, h('strong', {}, 'The lesions (pipeline/vascular_lesions.py): '), `drawn by rule onto that normal angiogram, none of them a patient’s: ${n('aneurysm')} aneurysms where its arteries branch (saccular ones as a dome on a neck, joined smoothly; a fusiform one widening the basilar trunk all round; a blister on the internal carotid’s dorsal wall), ${n('avm')} arteriovenous malformations (a nidus drawn as a network after a theoretical model (Jain 2019): tortuous plexiform vessels between junctions in an irregular, lobulated envelope of the chosen greatest diameter, a compartment for each feeder, larger fistulous channels from a feeder to a draining vein, compact or diffuse (Wu 2024), in a place on the fitted template brain chosen for its Spetzler–Martin points, with dilated feeders from the nearest of this CT’s arteries that supply it and draining veins to its sinuses), a dural fistula at the right transverse–sigmoid junction and two carotid-cavernous fistulas. Sizes and shapes are illustrative.`),
      h('p', {}, h('strong', {}, 'The angiogram: '), `a drawing of the order in which contrast reaches the vessels, not of their transit times: arteries from the injection (both carotid and both vertebral arteries at once; the external carotid’s branches from the foramen spinosum, ${'a little later'}) in order of their distance along the vessels, the farthest at ${DSA.artSpanS} s; veins from ${DSA.venStartS} s, upstream ends first, the jugular veins by ${(DSA.venStartS + DSA.venSpanS).toFixed(1)} s; each vessel stays dark for ${DSA.dwellArtS} s (arteries) or ${DSA.dwellVenS} s (veins) and then fades. A lesion’s shunt fills its veins, and the sinuses downstream, straight after its nidus or fistula (with no capillary bed between: Naranbhai 2023). The phases named under the scrubber follow this drawing.`)),
  );
  return { el, render() { /* stateless */ } };
}

export function vaCreditsPage() {
  const el = h('div', { class: 'page wrap' });
  const d = VA_MANIFEST.dataset;
  el.append(
    h('h1', {}, 'Credits and licences'),
    h('section', { class: 'card', id: 'topbrain' },
      h('h2', {}, d.name),
      h('p', {}, h('strong', {}, 'Licence: '), d.licence, '. The vessels (public/assets/vascular/) are Skull base v3’s meshes with the angiogram’s timing added; the lesions are this project’s drawings on them (GPL-3.0), and their fit uses the TopBrain data (non-commercial). The bone and the fitted brain are Skull base v3’s files: see its credits.'),
      h('ul', {}, ...d.attribution.map((a) => h('li', {}, a))),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', link(d.citationUrls[i], 'DOI')))),
    h('section', { class: 'card' },
      h('h2', {}, 'From the other sections'),
      h('p', {}, 'The template brain (Lead-DBS, GPL-3.0; its FreeSurfer labels for research use), the Z-Anatomy model’s small vessels (CC BY-SA 4.0) and TotalSegmentator’s segmentations are the skull-base section’s files and data, under their licences: see the skull base’s credits.')),
    h('section', { class: 'card' },
      h('h2', {}, 'Software'),
      h('p', {}, 'three.js, zod, Vite and glTF-Transform (MIT), meshoptimizer (MIT), scikit-image (BSD). Font: Atkinson Hyperlegible, SIL Open Font License 1.1, self-hosted. The source code is GPL-3.0.')),
  );
  return { el, render() { /* stateless */ } };
}
