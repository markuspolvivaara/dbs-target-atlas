import { DEFINITIONS, LANDMARKS, SB_MANIFEST, SB_MODEL } from '../skullbase';
import { FORAMEN_REFS } from '../skullbase/foramina';
import { h } from './h';

/** Sources and Credits of the skull-base section. */

export function skullSourcesPage() {
  const el = h('div', { class: 'page wrap' });
  const d = SB_MANIFEST.dataset;
  const urls = [...new Set(Object.values(DEFINITIONS).map((x) => x.url).filter((u): u is string => !!u))].sort();
  el.append(
    h('h1', {}, 'Sources'),
    h('section', { class: 'card' },
      h('h2', {}, 'Anatomy'),
      SB_MODEL === 'ct'
        ? h('p', {}, 'The detailed model: ', h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.name), '. The bone is the CT’s own surface and the arteries and deep veins are the surfaces of TopBrain’s expert labels of the same scan; what a CT does not show (the cranial nerves, the dural sinuses and arteries TopBrain does not label, the soft tissue and the landmark names) comes from the Z-Anatomy model, scaled and smoothly deformed onto this skull (pipeline/skullbase_ct.py), so those positions are approximate. Nothing is placed by hand.')
        : h('p', {}, 'All geometry and every landmark come from one model: ', h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.name), '. Nothing is placed by hand. The pipeline (pipeline/skullbase_export.py) reads the model in Blender and records how each point was derived.'),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', h('a', { href: d.citationUrls[i], target: '_blank', rel: 'noopener' }, 'DOI'))),
      h('p', { class: 'aside' }, d.note)),
    h('section', { class: 'card' },
      h('h2', {}, 'Definitions'),
      h('p', {}, `The definitions on the cards (${Object.keys(DEFINITIONS).length}) are the Wikipedia texts that Z-Anatomy ships with its model, under CC BY-SA 3.0, shortened to their lead section. They have not been checked against the literature yet; peer-reviewed teaching notes will be added on top of them.`),
      h('details', { class: 'more' }, h('summary', {}, `Wikipedia source pages (${urls.length})`),
        h('ul', { class: 'refs' }, ...urls.map((u) => h('li', {}, h('a', { href: u, target: '_blank', rel: 'noopener' }, decodeURIComponent(u.replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//, '')).replace(/_/g, ' '))))))),
    h('section', { class: 'card' },
      h('h2', {}, 'Landmarks'),
      h('p', {}, `${LANDMARKS.filter((l) => !l.how).length} labelled points on the cranial bones, each the point Z-Anatomy anchors to its bone (the label line’s hooked end), with the bone and part from Z-Anatomy’s anatomical hierarchy.`),
      SB_MODEL === 'ct' ? null : [
        h('p', {}, `${LANDMARKS.filter((l) => l.how).length} more points (both sides) mark foramina Z-Anatomy does not label: each is located where the nerves or vessels that pass through it cross the bone (pipeline/skullbase_foramina.py; the rule is on its card). What passes through each comes from these open-access sources:`),
        h('ul', { class: 'refs' }, ...FORAMEN_REFS.map((r) => h('li', {}, r.citation, ' ', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'DOI')))),
      ]),
  );
  return { el, render() { /* stateless */ } };
}

export function skullCreditsPage() {
  const el = h('div', { class: 'page wrap' });
  const d = SB_MANIFEST.dataset;
  el.append(
    h('h1', {}, 'Credits and licences'),
    h('section', { class: 'card', id: 'zanatomy' },
      h('h2', {}, d.name),
      h('p', {}, h('strong', {}, 'Licence: '), d.licence, SB_MODEL === 'ct'
        ? '. These files are not under the GPL like the project’s code: the TopBrain-derived parts may be used non-commercially with the source given (commercial use needs the data owner’s permission); the Z-Anatomy-derived parts stay under CC BY-SA with attribution.'
        : '. These files are not under the GPL like the project’s code: adapted versions must stay under CC BY-SA with attribution.'),
      h('p', {}, 'Attribution, as the authors ask:'),
      h('ul', {}, ...d.attribution.map((a) => h('li', {}, a))),
      h('p', { class: 'aside' }, 'Authors of the original model: Kousaku Okubo (BodyParts3D); Gauthier Kervyn (Z-Anatomy design, 3D, anatomy); Marcin Zielinski (Blender add-on); Lluis Vinent (Unity development).'),
      SB_MODEL === 'ct' ? h('p', { class: 'aside' }, 'Detailed model, changes made: the bone surface taken from the TopBrain CT angiogram (case 011) at 400 HU (thin bone down to 170 HU where it adjoins that bone, so partial volume does not open holes in it) within TotalSegmentator’s skull mask, with the walls of the air sinuses added as a thin shell (bone thinner than a voxel next to air, such as the sellar floor, falls below any threshold), the facial bones (cut off by the scan) left out, smoothed, decimated and named bone by bone after the fitted Z-Anatomy model; the TopBrain vessel labels meshed; the CT turned rigidly into the Z-Anatomy model’s frame; the Z-Anatomy nerves, the vessels TopBrain does not label, the soft tissue and the landmarks scaled and smoothly deformed onto this skull. Data source: TopBrain 2025 challenge, University Hospital Zurich (https://zenodo.org/records/16878417).') : '',
      h('p', { class: 'aside' }, 'Changes made: bones, soft tissue, vessels and cranial nerves of the head exported from the Z-Anatomy Blender file; coordinates converted to millimetres from the hypophysial fossa landmark (patient right, anterior, superior); midline structures cut at the midline; bones smoothed by one subdivision level, decimated and shaded with baked ambient occlusion; vessels and nerves rebuilt as tubes around their centre lines with Z-Anatomy’s modelled radius (at least 0.3 mm) and cropped to the head; files converted to compressed glTF; definitions shortened to their lead section.'),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', h('a', { href: d.citationUrls[i], target: '_blank', rel: 'noopener' }, 'DOI'))),
      h('p', {}, h('a', { href: d.url, target: '_blank', rel: 'noopener' }, 'Z-Anatomy repository'))),
    h('section', { class: 'card' },
      h('h2', {}, 'Software'),
      h('p', {}, 'three.js, zod, Vite and glTF-Transform (MIT), meshoptimizer (MIT); Blender (GPL) to read the model during the build. Font: Atkinson Hyperlegible, SIL Open Font License 1.1, self-hosted. The source code is GPL-3.0.')),
  );
  return { el, render() { /* stateless */ } };
}
