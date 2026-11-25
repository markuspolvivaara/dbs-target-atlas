import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { SECTIONS } from './brand';
import { CTX, LABEL, shortName } from './cortex';
import { VIEW, VIEWS } from './cortex/views';
import { decodeCortex, encodeCortex, type CortexState } from './cortex/state';
import { REGION, regionTract } from './cortex/regions';
import { SYNDROME } from './cortex/syndromes';
import { CortexAtlasPage } from './ui/cortex-atlas';
import { cortexCreditsPage, cortexSourcesPage } from './ui/cortex-pages';
import { bootSection } from './ui/section';

function sanitize(s: CortexState): CortexState {
  if (!VIEW.has(s.view)) s.view = 'lateral';
  // (a selection is a label, or a tract the surgical region draws)
  if (s.sel && !CTX.has(s.sel) && !regionTract(s.region, s.sel)) s.sel = null;
  if (s.region) s.inflate = 0;
  // (distances are measured on the pial surface: the inflated one has no Measure tool, so a link's measurement goes)
  if (s.inflate) delete s.measured;
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
  linkFields: { v: 'view', r: 'region', sel: 'sel' },
  atlas: (update) => new CortexAtlasPage(update),
  pages: () => ({ sources: cortexSourcesPage(), credits: cortexCreditsPage() }),
  atlasTitle: (s) => (s.sel ? shortName(s.sel) : s.region ? REGION.get(s.region)!.name : s.syn ? SYNDROME.get(s.syn)!.name : `${VIEW.get(s.view)!.name} view`),
  // (the text version of the view: each label's definition; a surgical region's tracts are listed by name)
  define: (id) => LABEL.get(id)?.definition?.text,
  help: {
    rows: [
      ['1 – 5', 'Camera: lateral, medial, basal, superior, anterior'],
      ['H', 'Hemisphere: both → left → right'], ['I', 'Surface: pial ↔ inflated'],
      ['N', 'Name labels: hover → all → off'], ['M', 'Measure distance'], ['Esc', 'Close card or stop measuring'], ['?', 'This help'],
    ],
    tap: 'a gyrus or sulcus',
  },
});
