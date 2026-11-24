import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { SECTIONS } from './brand';
import { LM, SB, SB_MODEL } from './skullbase';
import { DEFAULT_GROUP, SB_GROUP, viewGroup } from './skullbase/groups';
import { decodeSkull, encodeSkull, type SkullState } from './skullbase/state';
import { SkullbaseAtlasPage, surgicalKeyRows } from './ui/skullbase-atlas';
import { skullCreditsPage, skullGradingPage, skullSourcesPage } from './ui/skullbase-pages';
import { bootSection } from './ui/section';

// (one entry script for the three models: the default (v3), v1 on Z-Anatomy's model and v2 on a CT angiogram)

function sanitize(s: SkullState): SkullState {
  // (v2 has no tumour views, so no Grading page: the audit's P1-24)
  if (SB_MODEL === 'ct' && s.page === 'grading') s.page = 'atlas';
  if (!SB_GROUP.has(s.grp)) s.grp = DEFAULT_GROUP;
  s.also = SB_GROUP.get(s.grp)!.kind === 'system' ? s.also.filter((id) => id !== s.grp && SB_GROUP.get(id)?.kind === 'system') : [];
  if (s.sel && !SB.has(s.sel) && !LM.has(s.sel)) s.sel = null;
  if (s.from && !LM.has(s.from)) s.from = null;
  // (the endoscope's place and pieces belong to the endonasal view: its panel keeps them while another view is shown)
  if (!SB_GROUP.get(s.grp)!.endonasal) delete s.endo;
  // a view with a section (the Knosp grades) is cut at it while the reader keeps the cut on
  const sec = SB_GROUP.get(s.grp)!.section;
  s.cutPlane = sec && s.section ? { normal: sec.normal, point: sec.point } : null;
  return s;
}

bootSection({
  section: SECTIONS.find((s) => s.id === (SB_MODEL === 'v3' ? 'skullbase' : SB_MODEL === 'ct' ? 'skullbase-ct' : 'skullbase-v1'))!,
  nav: SB_MODEL === 'v3' || SB_MODEL === 'zanatomy'
    ? [['atlas', 'Atlas'], ['grading', 'Grading'], ['sources', 'Sources'], ['credits', 'Credits']]
    : [['atlas', 'Atlas'], ['sources', 'Sources'], ['credits', 'Credits']],
  disclaimer: SB_MODEL === 'v3'
    ? 'One adult’s CT with another person’s ear (a cadaver specimen) registered into it: positions are approximate to a millimetre or two. Individual anatomy varies. Not for surgical planning.'
    : SB_MODEL === 'ct'
    ? 'One adult’s CT angiogram; nerves and landmarks fitted from a model (approximate). Individual anatomy varies. Not for surgical planning.'
    : 'Single-model anatomy (Z-Anatomy / BodyParts3D, one adult); individual anatomy varies. Not for surgical planning.',
  fromLink: (hash) => sanitize(decodeSkull(hash)),
  pageOf: (hash) => decodeSkull(hash).page,
  encode: encodeSkull,
  sanitize,
  linkFields: { g: 'grp', sel: 'sel' },
  atlas: (update) => new SkullbaseAtlasPage(update),
  // (the Grading page is built on v2 too, where no tab leads to it and sanitize turns it back to the atlas)
  pages: () => ({ grading: skullGradingPage(), sources: skullSourcesPage(), credits: skullCreditsPage() }),
  atlasTitle: (s) => (s.sel ? (SB.get(s.sel)?.name ?? LM.get(s.sel)?.name ?? '') : viewGroup(s.grp, s.also).name),
  help: {
    rows: [
      SB_MODEL === 'v3' ? ['1 – 6', 'Camera: from above, from below, lateral, anterior, posterior-oblique, surgical (anterolateral)'] : ['1 – 5', 'Camera: from above, from below, lateral, anterior, posterior-oblique'],
      ['H', 'Side: both → left → right'], ['C', 'Cut away above the cranial floor: on / off'],
      ['N', 'Name labels: hover → all → off'], ['M', 'Measure distance'], ['Esc', 'Close card or stop measuring'], ['?', 'This help'],
      // (the surgical views' keys, on v1 as on the default model; v2 has no surgical views)
      ...(SB_MODEL !== 'ct' ? surgicalKeyRows() : []),
      // (the endonasal view's endoscope: EndonasalPanel.onKey; said in its panel, and here with the other keys)
      ...(SB_GROUP.has('endonasal') ? [['← → ↑ ↓', 'Endonasal view: turn the endoscope'], ['W  S', 'Endonasal view: the endoscope in and out'], ['Q  E', 'Endonasal view: rotate its picture']] as [string, string][] : []),
    ],
    tap: 'a structure or landmark',
  },
});
