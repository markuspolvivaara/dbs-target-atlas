import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { SECTIONS } from './brand';
import { GROUP, TOPIC, WM } from './tracts';
import { decodeTracts, encodeTracts, type TractsState } from './tracts/state';
import { TractsAtlasPage } from './ui/tracts-atlas';
import { tractCreditsPage, tractRefsPage } from './ui/tracts-pages';
import { bootSection } from './ui/section';

/** A link without `h` uses the group's own hemisphere (language: left, SLF complex: right ...); one that names a tract
 * but no group (from the cortex section's cards) opens a group that holds the tract, the "all" group of its tier last. */
function fromLink(hash: string): TractsState {
  const { state, hasHemi, hasGroup } = decodeTracts(hash);
  const s = sanitize(state);
  if (!hasGroup && s.sel && !GROUP.get(s.grp)!.tractIds.includes(s.sel)) {
    const holds = WM.groups.filter((g) => g.tractIds.includes(s.sel!));
    s.grp = (holds.find((g) => g.kind !== 'all') ?? holds[0] ?? GROUP.get(s.grp)!).id;
  }
  if (!hasHemi) s.hemi = GROUP.get(s.grp)!.hemi;
  return s;
}

function sanitize(s: TractsState): TractsState {
  if (!GROUP.has(s.grp)) s.grp = 'language';
  if (s.sel && !TOPIC.has(s.sel)) s.sel = null;
  return s;
}

bootSection({
  section: SECTIONS.find((s) => s.id === 'tracts')!,
  nav: [['atlas', 'Atlas'], ['refs', 'References'], ['credits', 'Credits']],
  fromLink,
  pageOf: (hash) => decodeTracts(hash).state.page,
  encode: encodeTracts,
  sanitize,
  linkFields: { g: 'grp', sel: 'sel' },
  atlas: (update) => new TractsAtlasPage(update),
  pages: () => ({ refs: tractRefsPage(), credits: tractCreditsPage() }),
  atlasTitle: (s) => (s.sel ? TOPIC.get(s.sel)!.name : GROUP.get(s.grp)!.name),
  help: {
    rows: [
      ['1 – 5', 'Camera: lateral (from outside the shown hemisphere), medial (from the midline), coronal, axial (anterior up), posterior-oblique'],
      ['H', 'Hemisphere: both → left → right'], ['[ / ]', 'Previous / next tract in the group'],
      ['N', 'Name labels: all → hover → off'], ['S', 'Toggle axial slice'], ['M', 'Measure distance'], ['Esc', 'Close card or stop measuring'], ['?', 'This help'],
    ],
    tap: 'a tract',
  },
});
