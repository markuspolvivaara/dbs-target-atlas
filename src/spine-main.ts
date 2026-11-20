import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { SECTIONS } from './brand';
import { SP } from './spine';
import { GEOM_BY_LEVEL, TECHNIQUES } from './spine/content';
import { screwCut } from './spine/screw';
import { REGION } from './spine/regions';
import { decodeSpine, encodeSpine, type SpineState } from './spine/state';
import { SpineAtlasPage } from './ui/spine-atlas';
import { spineCreditsPage, spineSourcesPage } from './ui/spine-pages';
import { bootSection } from './ui/section';

function sanitize(s: SpineState): SpineState {
  if (!REGION.get(s.region)?.ready) s.region = 'cervical';
  if (s.sel && !SP.has(s.sel)) s.sel = null;
  if (s.screw && (!s.level || !TECHNIQUES[s.screw.tech].levels.includes(s.level))) s.screw = null;
  if (s.region !== 'ccj') s.measure = null;
  if (s.approach && !((s.level?.startsWith(s.approach.id === 'acdf' ? 'C' : 'T')) && GEOM_BY_LEVEL.get(s.level!))) s.approach = null;
  const disc = s.level ? GEOM_BY_LEVEL.get(s.level) : undefined;
  if ((s.cut === 'disc' && !disc) || (s.cut === 'screw' && !s.screw)) s.cut = 'none';
  s.cutAbove = s.cut === 'disc' ? disc!.discCentre[2] : null;
  if (s.cut === 'screw') {
    const { normal, point } = screwCut(s.level!, s.screw!);
    s.cutPlane = { normal, point };
  } else s.cutPlane = null;
  return s;
}

bootSection({
  section: SECTIONS.find((s) => s.id === 'spine')!,
  nav: [['atlas', 'Atlas'], ['sources', 'Sources'], ['credits', 'Credits']],
  disclaimer: 'One adult CT (VerSe); anatomy, pedicle sizes and vessel positions vary between people and with deformity. Illustrative, not for surgical planning.',
  fromLink: (hash) => sanitize(decodeSpine(hash)),
  pageOf: (hash) => decodeSpine(hash).page,
  encode: encodeSpine,
  sanitize,
  linkFields: { r: 'region', lv: 'level', sel: 'sel' },
  atlas: (update) => new SpineAtlasPage(update),
  pages: () => ({ sources: spineSourcesPage(), credits: spineCreditsPage() }),
  atlasTitle: (s) => (s.sel ? (SP.get(s.sel)?.name ?? '') : s.level ? s.level : REGION.get(s.region)!.title),
  help: {
    rows: [
      ['1 – 5', 'Camera: lateral, posterior-oblique, anterior, from above, from below'],
      ['↑ ↓', 'Previous / next level'], ['H', 'Side: both → left → right'],
      ['N', 'Name labels: hover → all → off'], ['M', 'Measure distance'], ['Esc', 'Close card or stop measuring'], ['?', 'This help'],
    ],
    tap: 'a structure',
  },
});
