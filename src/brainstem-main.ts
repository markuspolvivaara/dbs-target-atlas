import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { SECTIONS } from './brand';
import { BS, DEFINITIONS } from './brainstem';
import { BS_GROUP } from './brainstem/groups';
import { decodeBs, encodeBs, type BsState } from './brainstem/state';
import { BrainstemAtlasPage } from './ui/brainstem-atlas';
import { bsCreditsPage, bsSourcesPage } from './ui/brainstem-pages';
import { bootSection } from './ui/section';

function sanitize(s: BsState): BsState {
  if (!BS_GROUP.has(s.grp)) s.grp = 'overview';
  if (s.sel && !BS.has(s.sel)) s.sel = null;
  return s;
}

bootSection({
  section: SECTIONS.find((s) => s.id === 'brainstem')!,
  nav: [['atlas', 'Atlas'], ['sources', 'Sources'], ['credits', 'Credits']],
  disclaimer: 'One model fitted to a template brain; nerves, nuclei and entry zones are approximate and individual anatomy varies. Not for surgical planning.',
  fromLink: (hash) => sanitize(decodeBs(hash)),
  pageOf: (hash) => decodeBs(hash).page,
  encode: encodeBs,
  sanitize,
  linkFields: { g: 'grp', sel: 'sel' },
  atlas: (update) => new BrainstemAtlasPage(update),
  pages: () => ({ sources: bsSourcesPage(), credits: bsCreditsPage() }),
  atlasTitle: (s) => (s.sel ? (BS.get(s.sel)?.name ?? '') : BS_GROUP.get(s.grp)!.name),
  // (the text version of the view: each structure's definition, by name, as on its card)
  define: (_id, name) => DEFINITIONS[name]?.text,
  help: {
    rows: [
      ['1 – 5', 'Camera: front, back, side, back-oblique, from above'],
      ['H', 'Side: both → left → right'], ['S', 'Axial slice: on / off'],
      ['N', 'Name labels: hover → all → off'], ['M', 'Measure distance'], ['Esc', 'Close card or stop measuring'], ['?', 'This help'],
    ],
    tap: 'a structure or entry zone',
  },
});
