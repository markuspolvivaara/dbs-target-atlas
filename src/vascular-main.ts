import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { SECTIONS } from './brand';
import { VA } from './vascular';
import { VA_GROUP } from './vascular/groups';
import { decodeVa, encodeVa, type VaState } from './vascular/state';
import { VascularAtlasPage } from './ui/vascular-atlas';
import { vaCreditsPage, vaGradingPage, vaSourcesPage } from './ui/vascular-pages';
import { bootSection } from './ui/section';

function sanitize(s: VaState): VaState {
  if (!VA_GROUP.has(s.grp)) s.grp = 'normal';
  if (s.sel && !VA.has(s.sel)) s.sel = null;
  return s;
}

bootSection({
  section: SECTIONS.find((s) => s.id === 'vascular')!,
  nav: [['atlas', 'Atlas'], ['grading', 'Grading'], ['sources', 'Sources'], ['credits', 'Credits']],
  disclaimer: 'One adult’s normal CT angiogram: the vessels are this patient’s; every aneurysm, malformation and fistula is drawn onto them by rule, and the angiogram’s timing is a drawing. For teaching, not for diagnosis or planning.',
  fromLink: (hash) => sanitize(decodeVa(hash)),
  pageOf: (hash) => decodeVa(hash).page,
  encode: encodeVa,
  sanitize,
  linkFields: { g: 'grp', sel: 'sel' },
  atlas: (update) => new VascularAtlasPage(update),
  pages: () => ({ grading: vaGradingPage(), sources: vaSourcesPage(), credits: vaCreditsPage() }),
  atlasTitle: (s) => (s.sel ? (VA.get(s.sel)?.name ?? '') : VA_GROUP.get(s.grp)!.name),
  help: {
    rows: [
      ['1 – 5', 'Camera: front, side, from above, front oblique, over the forehead'],
      ['H', 'Side: both → left → right'], ['A', 'Angiogram on or off'], ['Space', 'Play or pause the angiogram'],
      ['N', 'Name labels: hover → all → off'], ['M', 'Measure distance'], ['Esc', 'Close card or stop measuring'], ['?', 'This help'],
    ],
    tap: 'a structure',
  },
  afterRender: (s) => {
    // the Grading page opened at one of its tables (#/grading?to=borden)
    const to = s.page === 'grading' ? /[?&]to=([a-z-]+)/.exec(location.hash)?.[1] : undefined;
    if (to) document.getElementById(to)?.scrollIntoView();
  },
});
