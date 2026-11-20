import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { SECTIONS } from './brand';
import { LM, VE } from './ventricles';
import { VE_GROUP } from './ventricles/groups';
import { decodeVe, encodeVe, type VeState } from './ventricles/state';
import { VentriclesAtlasPage } from './ui/ventricles-atlas';
import { veCreditsPage, veSourcesPage } from './ui/ventricles-pages';
import { bootSection } from './ui/section';

function sanitize(s: VeState): VeState {
  if (!VE_GROUP.has(s.grp)) s.grp = 'ventricles';
  if (s.sel && !VE.has(s.sel)) s.sel = null;
  return s;
}

bootSection({
  section: SECTIONS.find((s) => s.id === 'ventricles')!,
  nav: [['atlas', 'Atlas'], ['sources', 'Sources'], ['credits', 'Credits']],
  disclaimer: 'One young adult’s CT: the ventricles are this patient’s where the CT shows them (narrow, approximate to about a millimetre) and a fitted model where it cannot; trajectories are simulated on it. Not for surgical planning.',
  fromLink: (hash) => sanitize(decodeVe(hash)),
  pageOf: (hash) => decodeVe(hash).page,
  encode: encodeVe,
  sanitize,
  linkFields: { g: 'grp', sel: 'sel' },
  atlas: (update) => new VentriclesAtlasPage(update),
  pages: () => ({ sources: veSourcesPage(), credits: veCreditsPage() }),
  atlasTitle: (s) => (s.sel ? (VE.get(s.sel)?.name ?? LM.get(s.sel)?.name ?? '') : VE_GROUP.get(s.grp)!.name),
  help: {
    rows: [
      ['1 – 5', 'Camera: front, side, from above, front oblique, over the forehead'],
      ['H', 'Side: both → left → right'], ['T', 'In the ventriculostomy view: the next aim'], ['S', 'In the ventriculostomy view: the other side'],
      ['N', 'Name labels: hover → all → off'], ['M', 'Measure distance'], ['Esc', 'Close card or stop measuring'], ['?', 'This help'],
    ],
    tap: 'a structure',
  },
});
