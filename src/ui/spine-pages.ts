import { SP_MANIFEST } from '../spine';
import { h } from './h';

/** Sources and Credits of the spine section. */

const a = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

export function spineSourcesPage() {
  const el = h('div', { class: 'page wrap' });
  const d = SP_MANIFEST.dataset;
  el.append(
    h('h1', {}, 'Sources'),
    h('section', { class: 'card' },
      h('h2', {}, 'Anatomy'),
      h('p', {}, 'Every structure comes from one CT of one adult: a whole-spine trauma scan of the VerSe 2020 dataset (sub-verse823, 0.72 × 0.72 × 0.7 mm). Nothing is drawn by hand; elements drawn by rule are marked schematic on their card.'),
      h('ul', {},
        h('li', {}, 'Vertebrae C1–L5: the CT’s bone surface, assigned to each vertebra by VerSe’s hand-corrected masks (the masks themselves step every few slices, so the surface is taken from the CT).'),
        h('li', {}, 'Sacrum (with S1), pelvis, intervertebral discs and spinal canal contents: TotalSegmentator segmentations of the same CT, run by the pipeline (pipeline/spine_segment.py). Discs are split by level between the vertebrae they lie between.')),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', a(d.citationUrls[i], 'DOI'))),
      h('p', { class: 'aside' }, d.note)),
    h('section', { class: 'card' },
      h('h2', {}, 'Measured on the CT'),
      h('ul', {},
        h('li', {}, 'Vertebral canal per level: the hole enclosed by the vertebra in planes through its body centre normal to the spine (a ±3 mm slab merged so the ring closes): width, depth, area.'),
        h('li', {}, 'Intervertebral foramina: the gap in the bone-and-disc profile of parasagittal planes from the canal edge outward that is roofed by the upper vertebra and floored by the lower one (3 mm gaps in its wall bridged): height along the spine, greatest antero-posterior extent, area. The method does not capture the L5–S1 foramen or the sacral foramina of this CT; there the root exit is estimated and labelled so.'),
        h('li', {}, 'Disc height at the disc centre.'),
        h('li', {}, 'Pedicles L1–L5 (pipeline/spine_screw.py): the narrowest width and height at the isthmus through the pedicle’s axis, its transverse and sagittal angle, and the chord from the dorsal entry to the anterior cortex.'))),
    h('section', { class: 'card' },
      h('h2', {}, 'Schematic elements'),
      h('p', {}, 'The lumbar roots and their ganglia are not segmented: they are drawn by rule from the measurements above and the cited descriptions, and their cards say so. Roots leave the dural sac at the disc above, run in the lateral recess and exit in the upper part of their foramen; their thickness and the ganglia’s size are drawing sizes, not measurements. Distances from the virtual screw to them are schematic too.')),
    h('section', { class: 'card' },
      h('h2', {}, 'References'),
      h('ul', { class: 'refs' }, ...Object.values(SP_MANIFEST.references).map((r) => h('li', {}, r.citation, ' ', a(r.url, 'DOI'))))),
  );
  return { el, render() { /* stateless */ } };
}

export function spineCreditsPage() {
  const el = h('div', { class: 'page wrap' });
  const d = SP_MANIFEST.dataset;
  el.append(
    h('h1', {}, 'Credits and licences'),
    h('section', { class: 'card', id: 'verse' },
      h('h2', {}, 'VerSe'),
      h('p', {}, h('strong', {}, 'Licence: '), 'CC BY-SA 4.0. The spine section’s files are derived from a VerSe CT and are distributed under CC BY-SA 4.0 as well, not under the GPL like the project’s code. ', a('https://osf.io/4skx2/', 'VerSe 2020 on OSF')),
      h('p', {}, 'VerSe asks that its three papers be cited:'),
      ...d.citation.slice(0, 3).map((c, i) => h('p', { class: 'cite' }, c, ' ', a(d.citationUrls[i], 'DOI'))),
      h('p', { class: 'aside' }, 'Changes made: bone surfaces extracted from the CT at a fixed threshold within reach of the vertebra masks; soft tissue segmented with TotalSegmentator; meshes smoothed, decimated, split at the midline and converted to compressed glTF; coordinates moved to the centre of the L5 vertebral body.')),
    h('section', { class: 'card' },
      h('h2', {}, 'TotalSegmentator'),
      h('p', {}, 'Models: Apache-2.0 (the open tasks “total” and “vertebrae_body”). ', a('https://github.com/wasserth/TotalSegmentator', 'TotalSegmentator on GitHub')),
      h('p', { class: 'cite' }, d.citation[3], ' ', a(d.citationUrls[3], 'DOI'))),
    h('section', { class: 'card' },
      h('h2', {}, 'Software'),
      h('p', {}, 'three.js, zod, Vite and glTF-Transform (MIT), meshoptimizer (MIT); nibabel, scikit-image, trimesh, SciPy and NumPy, and TotalSegmentator with PyTorch, in the build. Font: Atkinson Hyperlegible, SIL Open Font License 1.1, self-hosted. The source code is GPL-3.0.')),
  );
  return { el, render() { /* stateless */ } };
}
