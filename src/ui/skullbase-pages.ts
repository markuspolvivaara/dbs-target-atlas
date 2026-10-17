import { DEFINITIONS, LANDMARKS, SB_MANIFEST } from '../skullbase';
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
      h('p', {}, 'All geometry and every landmark come from one model: ', h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.name), '. Nothing is placed by hand. The pipeline (pipeline/skullbase_export.py) reads the model in Blender and records how each point was derived.'),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', h('a', { href: d.citationUrls[i], target: '_blank', rel: 'noopener' }, 'DOI'))),
      h('p', { class: 'aside' }, d.note)),
    h('section', { class: 'card' },
      h('h2', {}, 'Definitions'),
      h('p', {}, `The definitions on the cards (${Object.keys(DEFINITIONS).length}) are the Wikipedia texts that Z-Anatomy ships with its model, under CC BY-SA 3.0, shortened to their lead section. They have not been checked against the literature yet; peer-reviewed teaching notes will be added on top of them.`),
      h('details', { class: 'more' }, h('summary', {}, `Wikipedia source pages (${urls.length})`),
        h('ul', { class: 'refs' }, ...urls.map((u) => h('li', {}, h('a', { href: u, target: '_blank', rel: 'noopener' }, decodeURIComponent(u.replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//, '')).replace(/_/g, ' '))))))),
    h('section', { class: 'card' },
      h('h2', {}, 'Landmarks'),
      h('p', {}, `${LANDMARKS.length} labelled points on the cranial bones, each the point Z-Anatomy anchors to its bone (the label line’s hooked end), with the bone and part from Z-Anatomy’s anatomical hierarchy.`)),
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
      h('p', {}, h('strong', {}, 'Licence: '), d.licence, '. These files are not under the GPL like the project’s code: adapted versions must stay under CC BY-SA with attribution.'),
      h('p', {}, 'Attribution, as the authors ask:'),
      h('ul', {}, ...d.attribution.map((a) => h('li', {}, a))),
      h('p', { class: 'aside' }, 'Authors of the original model: Kousaku Okubo (BodyParts3D); Gauthier Kervyn (Z-Anatomy design, 3D, anatomy); Marcin Zielinski (Blender add-on); Lluis Vinent (Unity development).'),
      h('p', { class: 'aside' }, 'Changes made: bones, soft tissue, vessels and cranial nerves of the head exported from the Z-Anatomy Blender file; coordinates converted to millimetres from the hypophysial fossa landmark (patient right, anterior, superior); midline structures cut at the midline; vessels and nerves reduced to centre lines and cropped to the head; files converted to compressed glTF; definitions shortened to their lead section.'),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', h('a', { href: d.citationUrls[i], target: '_blank', rel: 'noopener' }, 'DOI'))),
      h('p', {}, h('a', { href: d.url, target: '_blank', rel: 'noopener' }, 'Z-Anatomy repository'))),
    h('section', { class: 'card' },
      h('h2', {}, 'Software'),
      h('p', {}, 'three.js, zod, Vite and glTF-Transform (MIT), meshoptimizer (MIT); Blender (GPL) to read the model during the build. Font: Atkinson Hyperlegible, SIL Open Font License 1.1, self-hosted. The source code is GPL-3.0.')),
  );
  return { el, render() { /* stateless */ } };
}
