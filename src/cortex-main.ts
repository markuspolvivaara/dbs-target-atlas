import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { SECTIONS } from './brand';
import { CTX, shortName } from './cortex';
import { VIEW, VIEWS } from './cortex/views';
import { decodeCortex, encodeCortex, type CortexState } from './cortex/state';
import { CortexAtlasPage } from './ui/cortex-atlas';
import { cortexCreditsPage, cortexSourcesPage } from './ui/cortex-pages';
import { bootSection } from './ui/section';

function sanitize(s: CortexState): CortexState {
  if (!VIEW.has(s.view)) s.view = 'lateral';
  if (s.sel && !CTX.has(s.sel)) s.sel = null;
  return s;
}

/** A link that names a label but no view (from the white-matter section's tract cards) opens a view that shows it. */
function fromLink(hash: string): CortexState {
  const s = sanitize(decodeCortex(hash));
  if (s.sel && !/[?&]v=/.test(hash)) s.view = (VIEWS.find((v) => v.labels.includes(s.sel!)) ?? VIEW.get(s.view)!).id;
  return s;
}

bootSection({
  section: SECTIONS.find((s) => s.id === 'cortex')!,
  nav: [['atlas', 'Atlas'], ['sources', 'Sources'], ['credits', 'Credits']],
  disclaimer: 'One template brain (MNI 2009b average) with automatic labels; the pattern of gyri and sulci varies between people. Not for surgical planning.',
  fromLink,
  pageOf: (hash) => decodeCortex(hash).page,
  encode: encodeCortex,
  sanitize,
  linkFields: { v: 'view', sel: 'sel' },
  atlas: (update) => new CortexAtlasPage(update),
  pages: () => ({ sources: cortexSourcesPage(), credits: cortexCreditsPage() }),
  atlasTitle: (s) => (s.sel ? shortName(s.sel) : `${VIEW.get(s.view)!.name} view`),
  help: {
    rows: [
      ['1 – 5', 'Camera: lateral, medial, basal, superior, anterior'],
      ['H', 'Hemisphere: both → left → right'], ['I', 'Surface: pial ↔ inflated'],
      ['N', 'Name labels: hover → all → off'], ['M', 'Measure distance'], ['Esc', 'Close card or stop measuring'], ['?', 'This help'],
    ],
    tap: 'a gyrus or sulcus',
  },
});
