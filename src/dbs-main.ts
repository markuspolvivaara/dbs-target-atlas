import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { IND, SYM } from './data';
import { decode, defaultState, encode, type AppState } from './state';
import { AtlasPage } from './ui/atlas';
import { coordsPage, creditsPage, imagingPage, refsPage, settingsPage } from './ui/pages';
import { leadPrefFor, onPrefsChange, visibleIndications } from './ui/prefs';
import { primaryTargetId } from './viewer/selection';
import { SECTIONS } from './brand';
import { bootSection } from './ui/section';

/** Put the remembered anchor / depth / spacing for the view's target into the state. */
function applyLeadPref(s: AppState): void {
  const { pref } = leadPrefFor(primaryTargetId(s.ind, s.sym));
  s.lead = { ...s.lead, anchor: pref.anchor, depth: pref.depth, spacing: pref.spacing };
}

function sanitize(s: AppState): AppState {
  if (!IND.has(s.ind)) s.ind = visibleIndications()[0].id;
  if (s.sym && SYM.get(s.sym)?.indicationId !== s.ind) s.sym = null;
  return s;
}

function fromLink(hash: string): AppState {
  const s = sanitize(decode(hash, defaultState()));
  // a link without an explicit lead position uses the remembered placement for its target
  if (!new URLSearchParams(hash.split('?')[1] ?? '').has('lead')) applyLeadPref(s);
  return s;
}

const { atlas } = bootSection({
  section: SECTIONS.find((s) => s.id === 'dbs')!,
  nav: [['atlas', 'Atlas'], ['imaging', 'Imaging'], ['coords', 'Coordinates'], ['refs', 'References'], ['credits', 'Credits'], ['settings', 'Indications shown']],
  fromLink,
  pageOf: (hash) => decode(hash).page,
  encode,
  sanitize,
  linkFields: { i: 'ind', s: 'sym', sel: 'sel' },
  atlas: (update) => new AtlasPage(update),
  pages: (update, theme) => ({
    imaging: imagingPage(update), coords: coordsPage(), refs: refsPage(), credits: creditsPage(),
    settings: { ...settingsPage(update, theme), showsTheme: true },
  }),
  atlasTitle: (s) => IND.get(s.ind)!.name,
  help: {
    rows: [
      ['1 – 5', 'Camera: coronal (from the front), sagittal (anterior left), axial (anterior up), posterior-oblique, surgeon’s view'],
      ['H', 'Hemisphere: both → left → right'], ['[ / ]', 'Previous / next indication'], [', / .', 'Previous / next symptom'],
      ['L', 'Show or hide the lead'], ['N', 'Name labels: hover → all → off'], ['S', 'Toggle axial slice'], ['M', 'Measure distance'], ['Esc', 'Close card or stop measuring'], ['?', 'This help'],
    ],
    tap: 'a structure',
  },
  onChange: (next, prev) => {
    // moving to a view with a different target marker restores that target's remembered lead placement
    if (primaryTargetId(next.ind, next.sym) !== primaryTargetId(prev.ind, prev.sym)) applyLeadPref(next);
    // structures hidden from the legend belong to one view
    if (next.ind !== prev.ind || next.sym !== prev.sym) { next.hidden = []; delete next.opacity; }
  },
});

// a change of visible indications refreshes the atlas chips
onPrefsChange((kind) => { if (kind === 'indications') atlas.refreshChips(); else atlas.refreshLead(); });
