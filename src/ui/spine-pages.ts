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
      h('p', {}, 'Every structure comes from one CT of one adult: a whole-spine trauma scan of the VerSe 2020 dataset (sub-verse823, 0.72 × 0.72 × 0.7 mm). Nothing is drawn by hand; elements drawn by rule are marked schematic on their card. The exception is the craniocervical junction, whose field of view that CT does not cover (it ends just above C1): it comes from a second adult CT of the same dataset, a cervical scan (sub-gl090, 0.27 × 0.27 × 1.25 mm), and is shown on its own.'),
      h('ul', {},
        h('li', {}, 'Vertebrae C1–L5: the CT’s bone surface, assigned to each vertebra by VerSe’s hand-corrected masks (the masks themselves step every few slices, so the surface is taken from the CT).'),
        h('li', {}, 'Sacrum (with S1), pelvis, intervertebral discs and spinal canal contents: TotalSegmentator segmentations of the same CT, run by the pipeline (pipeline/spine_segment.py). Discs are split by level between the vertebrae they lie between.'),
        h('li', {}, 'The neck (cervical region): common and internal carotid arteries, internal jugular veins, trachea, oesophagus, thyroid gland, larynx (thyroid and cricoid cartilages), prevertebral muscles and sternocleidomastoids, from TotalSegmentator’s open tasks on the same CT, kept between the T1 body and C1.')),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', a(d.citationUrls[i], 'DOI'))),
      h('p', { class: 'aside' }, d.note)),
    h('section', { class: 'card' },
      h('h2', {}, 'Measured on the CT'),
      h('ul', {},
        h('li', {}, 'Vertebral canal per level: the hole enclosed by the vertebra in planes through its body centre normal to the spine (a ±3 mm slab merged so the ring closes): width, depth, area.'),
        h('li', {}, 'Intervertebral foramina (lumbar): the gap in the bone-and-disc profile of parasagittal planes from the canal edge outward that is roofed by the upper vertebra and floored by the lower one (3 mm gaps in its wall bridged): height along the spine, greatest antero-posterior extent, area. The method does not capture the L5–S1 foramen or the sacral foramina of this CT; there the root exit is estimated and labelled so. In the thoracic region the same gap only places the roots: without the rib heads, which form part of the foramen’s wall, it runs on into the costotransverse region, so its size is not reported.'),
        h('li', {}, 'Disc height at the disc centre.'),
        h('li', {}, 'Pedicles T1–T12 and L1–L5 (pipeline/spine_screw.py): the narrowest width and height at the isthmus through the pedicle’s axis, its transverse and sagittal angle, and the chord from the dorsal entry to the anterior cortex. Published values beside them are read from the papers’ tables (pipeline/spine_published.py); the thoracic approach exposures from the abstract of Kshettry 2015.'),
        h('li', {}, 'Foramina transversaria C1–C7: per side the region the vertebra’s bone encloses (rays in 14 of 16 directions meet bone within 6 mm, in axial planes), its area, width and depth; the vertebral artery’s entry level is inferred from their size (those that carry it are larger).'),
        h('li', {}, 'Lateral masses C3–C6: the posterior face seen from behind, between the junction with the lamina (where the lamina’s slope meets the face), the outer edge and the facet joint lines, with a plane fitted to it; the facet joints’ inclination from planes fitted to their joint surfaces. They set the lateral mass screws’ start positions.'),
        h('li', {}, 'C1 and C2 for the C1–C2 screws: the atlas’s ring plane, its lateral mass’s medial border and the lower edge of its posterior arch, its anterior tubercle; the axis’s frame from the C2–C3 disc, the medial end of the C2–C3 facet joint, its lamina’s centre line and upper border; the C2 isthmus height (the narrowest height of the bone between the superior articular surface and the inferior facet, 3 mm lateral to the canal) and the bone over the foramen transversarium.'),
        h('li', {}, 'Neck landmarks: the level the hyoid’s and the thyroid cartilage’s centres and the cricoid’s lowest point project to perpendicularly on the spine (the vertebral body or disc nearest along its axis), from TotalSegmentator’s hyoid, thyroid and cricoid cartilage on this CT.'),
        h('li', {}, 'Craniocervical junction (second CT; pipeline/spine_ccj.py): the occipital bone around the foramen magnum is the CT’s bone surface within reach of TotalSegmentator’s skull (cut 50 mm around the middle of the foramen magnum), C1–C3 as the other vertebrae, the canal contents TotalSegmentator’s. In the midsagittal plane (landmarks within 1.5 mm of it): the dens’s tip (its highest point), the basion (the lowest point of the clivus), the opisthion (the point of the foramen magnum’s posterior margin closest to the basion), the closest points between the C1 arches and the dens, the posterior axial line (a line through the back of the C2 body, slice by slice) and the clivus line (through the clivus’s posterior surface); the ADI, PADI, McRae’s line, BDI, BAI and the clivus–canal angle between them, defined as Fidan 2026 defines them. The card’s image is the CT averaged over a 2 mm slab in that plane.'),
        h('li', {}, 'Thoracic screw start sizes: diameter 80% of the measured pedicle width, length to 80% of the vertebral body’s depth along the screw (rules summarised by Mandelka 2023).'),
        h('li', {}, 'Drilling (pipeline/spine_drill.py): for each pair of cervical vertebrae (C2–C3 to C7–T1) and lumbar ones (L1–L2 to L4–L5; not L5–S1, whose sacrum is drawn from another segmentation), each vertebra’s bone on the CT’s own grid, built as its drawn surface (the CT within its mask, its core held above 200 HU, smoothed; its surface lies a median 0.23–0.25 mm from the drawn one), the CT itself to colour cut bone, and the distance from each point to the dural sac (segmented) and to the roots and, in the neck, the vertebral arteries (schematic). The burr (round, 4 mm in the neck and 5 mm in the lumbar spine) and how fast it goes in (a slider; at first 4 mm a second in the neck, 8 in the lumbar spine) are drawing choices; bone is simply taken away. At an anterior discectomy the disc is not drawn and the two vertebrae can be drawn apart along the spine (a distraction; the structures at risk stay where they lie). Bone no longer joined to its vertebral body (through bone touching at least at a corner, on the CT’s grid) is a loose piece, to be lifted off or, the halves of a split spinous process, drawn straight out to the sides; bits of bone the CT itself shows unjoined count as joined. Each spinous process’s base is put a fifth of the way from the canal’s back wall to its tip, both found in a 3-mm midline strip of the vertebra’s mask; the rongeur takes it off there in one bite, the osteotome’s cuts are 1.5 mm wide (drawing choices). A laminoplasty’s hinge is the bone within 2 mm of the hinge trough; the door, the bone still joined to the spinous process without passing through it, turns as one rigid piece about a line along the vertebra’s axis through the hinge (drawing choices).'))),
    h('section', { class: 'card' },
      h('h2', {}, 'Schematic elements'),
      h('p', {}, 'The roots and their ganglia (C3–C8, T1–T12, L1–S1) are not segmented: they are drawn by rule from the measurements above and the cited descriptions, and their cards say so. Lumbar roots leave the dural sac at the disc above, run in the lateral recess and exit in the upper part of their foramen; thoracic roots leave the sac level with the upper part of their foramen and run straight out beneath the pedicle; cervical roots leave at their own disc and pass through the lower part of the foramen, found in planes turned 30° forwards. Their thickness and the ganglia’s size are drawing sizes, not measurements. Distances from the virtual screw to them are schematic too.'),
      h('p', {}, 'The vertebral artery is not segmented either (the CT has no contrast): it is drawn from the subclavian artery through the foramina transversaria measured on the CT, from the level inferred from their size, then behind the lateral mass of the atlas and over the groove on its posterior arch, and a short way towards the foramen magnum.')),
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
      h('p', {}, h('strong', {}, 'Licence: '), 'CC BY-SA 4.0. The spine section’s files are derived from two VerSe CTs (sub-verse823; sub-gl090 for the craniocervical junction) and are distributed under CC BY-SA 4.0 as well, not under the GPL like the project’s code. ', a('https://osf.io/4skx2/', 'VerSe 2020 on OSF')),
      h('p', {}, 'VerSe asks that its three papers be cited:'),
      ...d.citation.slice(0, 3).map((c, i) => h('p', { class: 'cite' }, c, ' ', a(d.citationUrls[i], 'DOI'))),
      h('p', { class: 'aside' }, 'Changes made: bone surfaces extracted from the CT at a fixed threshold within reach of the vertebra masks; soft tissue segmented with TotalSegmentator; meshes smoothed, decimated, split at the midline and converted to compressed glTF; coordinates moved to the centre of the L5 vertebral body.')),
    h('section', { class: 'card' },
      h('h2', {}, 'TotalSegmentator'),
      h('p', {}, 'Models: Apache-2.0 (the open tasks used: “total”, “vertebrae_body”, “headneck_bones_vessels”, “headneck_muscles”, “craniofacial_structures”). ', a('https://github.com/wasserth/TotalSegmentator', 'TotalSegmentator on GitHub')),
      h('p', { class: 'cite' }, d.citation[3], ' ', a(d.citationUrls[3], 'DOI'))),
    h('section', { class: 'card' },
      h('h2', {}, 'Software'),
      h('p', {}, 'three.js, zod, Vite and glTF-Transform (MIT), meshoptimizer (MIT); nibabel, scikit-image, trimesh, SciPy and NumPy, and TotalSegmentator with PyTorch, in the build. Font: Atkinson Hyperlegible, SIL Open Font License 1.1, self-hosted. The source code is GPL-3.0.')),
  );
  return { el, render() { /* stateless */ } };
}
