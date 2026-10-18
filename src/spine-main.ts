import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { BRAND, SECTIONS } from './brand';
import { SP } from './spine';
import { GEOM_BY_LEVEL, TECHNIQUES } from './spine/content';
import { screwCut } from './spine/screw';
import { REGION } from './spine/regions';
import { decodeSpine, encodeSpine, type SpinePage, type SpineState } from './spine/state';
import { h } from './ui/h';
import { disclaimerNote, siteHeader } from './ui/shell';
import { SpineAtlasPage } from './ui/spine-atlas';
import { spineCreditsPage, spineSourcesPage } from './ui/spine-pages';
import { applyTheme, injectPaletteCss, paletteFor, storeTheme, storedTheme, VIEWER, type ThemePref } from './ui/theme';

const SECTION = SECTIONS.find((s) => s.id === 'spine')!;

injectPaletteCss();
let theme: ThemePref = storedTheme();
let resolved = applyTheme(theme);

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

let state: SpineState = sanitize(decodeSpine(location.hash));

// ---------------------------------------------------------------- shell
const NAV: [SpinePage, string][] = [['atlas', 'Atlas'], ['sources', 'Sources'], ['credits', 'Credits']];
const app = document.getElementById('app')!;
const navLinks = NAV.map(([p, label]) => h('a', { href: `#/${p}`, class: 'navlink', 'data-page': p }, label));
const themeBtn = h('button', { type: 'button', class: 'theme-btn', onclick: () => cycleTheme() });
const header = siteHeader({ section: SECTION, nav: navLinks, themeBtn });
const disclaimer = disclaimerNote('One adult CT (VerSe); anatomy, pedicle sizes and vessel positions vary between people and with deformity. Illustrative, not for surgical planning.');

const update = (fn: (s: SpineState) => void, opts: { camera?: boolean } = {}) => {
  const next = structuredClone(state);
  fn(next);
  setState(sanitize(next), { camera: opts.camera ?? false, fromCamera: opts.camera === false });
};
const atlas = new SpineAtlasPage(update);
const pages: Record<SpinePage, { el: HTMLElement; render(s: SpineState): void }> = {
  atlas: { el: atlas.el, render: (s) => atlas.render(s, { camera: pendingCamera }) },
  sources: spineSourcesPage(),
  credits: spineCreditsPage(),
};

const main = h('main', { id: 'main' }, ...Object.values(pages).map((p) => p.el));
new ResizeObserver(() => document.documentElement.style.setProperty('--disc-h', `${disclaimer.offsetHeight}px`)).observe(disclaimer);
const help = buildHelp();
app.append(h('a', { class: 'skip', href: '#main' }, 'Skip to content'), header, disclaimer, main, help);

let pendingCamera = true;
let hashTimer = 0;

function setState(next: SpineState, opts: { camera: boolean; fromCamera?: boolean }): void {
  const pageChanged = next.page !== state.page;
  state = next;
  pendingCamera = opts.camera;
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    const hsh = encodeSpine(state);
    if (hsh !== location.hash) history.replaceState(null, '', hsh);
  }, opts.fromCamera ? 400 : 0);
  if (opts.fromCamera) return;
  render(pageChanged);
}

function render(pageChanged = false): void {
  for (const [p, v] of Object.entries(pages)) v.el.hidden = p !== state.page;
  navLinks.forEach((a) => (a.dataset.page === state.page ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.body.dataset.page = state.page;
  pages[state.page].render(state);
  if (state.page === 'atlas') atlas.onShow();
  const atlasTitle = state.sel ? (SP.get(state.sel)?.name ?? '') : state.level ? state.level : REGION.get(state.region)!.title;
  const titles: Record<SpinePage, string> = { atlas: atlasTitle, sources: 'Sources', credits: 'Credits' };
  document.title = `${titles[state.page]} · ${SECTION.name} · ${BRAND.name}`;
  if (pageChanged) window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
  if (location.hash === encodeSpine(state)) return;
  const bare = !location.hash.includes('?');
  const next = bare ? { ...structuredClone(state), page: decodeSpine(location.hash).page } : sanitize(decodeSpine(location.hash));
  setState(next, { camera: !bare || next.page !== state.page });
});

// ---------------------------------------------------------------- theme
function cycleTheme(): void {
  theme = theme === 'system' ? (resolved === 'dark' ? 'light' : 'dark') : theme === 'light' ? 'dark' : 'system';
  storeTheme(theme);
  resolved = applyTheme(theme);
  syncTheme();
}
function syncTheme(): void {
  themeBtn.textContent = theme === 'system' ? 'Theme: auto' : theme === 'light' ? 'Theme: light' : 'Theme: dark';
  themeBtn.setAttribute('aria-label', `Colour theme: ${theme}. Change theme`);
  atlas.viewer.setTheme(paletteFor(resolved), VIEWER[resolved].bg, VIEWER[resolved].ghost);
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { resolved = applyTheme(theme); syncTheme(); });

// ---------------------------------------------------------------- keyboard
function buildHelp(): HTMLDialogElement {
  const rows: [string, string][] = [
    ['1 – 5', 'Camera: lateral, posterior-oblique, anterior, from above, from below'],
    ['↑ ↓', 'Previous / next level'], ['H', 'Side: both → left → right'],
    ['N', 'Name labels: hover → all → off'], ['M', 'Measure distance'], ['Esc', 'Close card or stop measuring'], ['?', 'This help'],
  ];
  return h('dialog', { class: 'help', 'aria-labelledby': 'help-title' },
    h('h2', { id: 'help-title' }, 'Keyboard shortcuts'),
    h('dl', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
    h('p', { class: 'aside' }, 'Touch: one finger rotates, two fingers pinch to zoom and drag to pan. Tap a structure for its card.'),
    h('form', { method: 'dialog' }, h('button', { class: 'btn' }, 'Close'))) as HTMLDialogElement;
}

window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (t.closest('input, select, textarea, [contenteditable]')) return;
  if (e.key === '?') { help.open ? help.close() : help.showModal(); e.preventDefault(); return; }
  if (state.page !== 'atlas' || help.open) return;
  if (atlas.handleKey(e)) e.preventDefault();
});

// ---------------------------------------------------------------- boot
syncTheme();
render(true);
history.replaceState(null, '', encodeSpine(state));
atlas.viewer.preload().then(() => {
  pendingCamera = !state.cam.pos;
  pages.atlas.render(state);
  document.body.dataset.ready = '1';
});
(window as unknown as { __atlas: unknown }).__atlas = { viewer: atlas.viewer, state: () => state };
