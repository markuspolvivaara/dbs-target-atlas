import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { IND, SYM } from './data';
import { decode, defaultState, encode, type AppState, type Page } from './state';
import { AtlasPage } from './ui/atlas';
import { h } from './ui/dom';
import { coordsPage, creditsPage, imagingPage, refsPage, settingsPage } from './ui/pages';
import { leadPrefFor, onPrefsChange, visibleIndications } from './ui/prefs';
import { primaryTargetId } from './viewer/selection';
import { applyTheme, injectPaletteCss, paletteFor, storeTheme, storedTheme, VIEWER, type ThemePref } from './ui/theme';

injectPaletteCss();
let theme: ThemePref = storedTheme();
let resolved = applyTheme(theme);

let state: AppState = sanitize(decode(location.hash, defaultState()));
// a link without an explicit lead position uses the remembered placement for its target
if (!new URLSearchParams(location.hash.split('?')[1] ?? '').has('lead')) applyLeadPref(state);

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

// ---------------------------------------------------------------- shell
const NAV: [Page, string][] = [['atlas', 'Atlas'], ['imaging', 'Imaging'], ['coords', 'Coordinates'], ['refs', 'References'], ['credits', 'Credits'], ['settings', 'Settings']];
const app = document.getElementById('app')!;
const navLinks = NAV.map(([p, label]) => h('a', { href: `#/${p}`, class: 'navlink', 'data-page': p }, label));
const themeBtn = h('button', { type: 'button', class: 'theme-btn', onclick: () => cycleTheme() });
const header = h('header', { class: 'top' },
  h('a', { class: 'brand', href: '#/atlas' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), 'DBS target atlas'),
  h('nav', { class: 'nav', 'aria-label': 'Sections' }, ...navLinks),
  themeBtn,
);
const disclaimer = h('p', { class: 'disclaimer', role: 'note' },
  h('strong', {}, 'Teaching tool. '), 'Atlas-based (MNI 2009b) group anatomy; individual anatomy varies. Not for surgical planning.');

const pages: Record<Page, { el: HTMLElement; render(s: AppState): void }> = {} as never;
const update = (fn: (s: AppState) => void, opts: { camera?: boolean } = {}) => {
  const next = structuredClone(state);
  fn(next);
  // moving to a view with a different target marker restores that target's remembered lead placement
  if (primaryTargetId(next.ind, next.sym) !== primaryTargetId(state.ind, state.sym)) applyLeadPref(next);
  // structures hidden from the legend belong to one view
  if (next.ind !== state.ind || next.sym !== state.sym) next.hidden = [];
  setState(sanitize(next), { camera: opts.camera ?? false, fromCamera: opts.camera === false });
};
const atlas = new AtlasPage(update);
pages.atlas = { el: atlas.el, render: (s) => atlas.render(s, { camera: pendingCamera }) };
pages.imaging = imagingPage(update);
pages.coords = coordsPage();
pages.refs = refsPage();
pages.credits = creditsPage();
pages.settings = settingsPage(update, { get: () => theme, set: (t) => setThemePref(t) });

const main = h('main', { id: 'main' }, ...Object.values(pages).map((p) => p.el));
// the stage height depends on the (wrapping) disclaimer height
new ResizeObserver(() => document.documentElement.style.setProperty('--disc-h', `${disclaimer.offsetHeight}px`)).observe(disclaimer);
const help = buildHelp();
app.append(h('a', { class: 'skip', href: '#main' }, 'Skip to content'), header, disclaimer, main, help);

let pendingCamera = true;
let hashTimer = 0;

function setState(next: AppState, opts: { camera: boolean; fromCamera?: boolean }): void {
  const pageChanged = next.page !== state.page;
  state = next;
  pendingCamera = opts.camera;
  // camera moves are frequent: debounce the URL write; skip re-rendering panels
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    const hsh = encode(state);
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
  const titles: Record<Page, string> = { atlas: IND.get(state.ind)!.name, imaging: 'Imaging', coords: 'Coordinates', refs: 'References', credits: 'Credits', settings: 'Settings' };
  document.title = `${titles[state.page]} · DBS target atlas`;
  if (pageChanged) window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
  if (location.hash === encode(state)) return;
  // A link with parameters is a complete view description; a bare page link (#/atlas) keeps the current view.
  const bare = !location.hash.includes('?');
  const next = sanitize(bare ? { ...structuredClone(state), page: decode(location.hash).page } : decode(location.hash, defaultState()));
  if (!bare && !new URLSearchParams(location.hash.split('?')[1] ?? '').has('lead')) applyLeadPref(next);
  setState(next, { camera: !bare || next.page !== state.page });
});

// a change of visible indications refreshes the atlas chips
onPrefsChange((kind) => { if (kind === 'indications') atlas.refreshChips(); else atlas.refreshLead(); });

// ---------------------------------------------------------------- theme
function cycleTheme(): void {
  setThemePref(theme === 'system' ? (resolved === 'dark' ? 'light' : 'dark') : theme === 'light' ? 'dark' : 'system');
}
function setThemePref(t: ThemePref): void {
  theme = t;
  storeTheme(theme);
  resolved = applyTheme(theme);
  syncTheme();
  if (state.page === 'settings') pages.settings.render(state);
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
    ['1 – 5', 'Camera: coronal (from the front), sagittal (anterior left), axial (anterior up), posterior-oblique, surgeon’s view'],
    ['H', 'Hemisphere: both → left → right'], ['[ / ]', 'Previous / next indication'], [', / .', 'Previous / next symptom'],
    ['L', 'Show or hide the lead'], ['S', 'Toggle axial slice'], ['M', 'Measure distance'], ['Esc', 'Close card or stop measuring'], ['?', 'This help'],
  ];
  const d = h('dialog', { class: 'help', 'aria-labelledby': 'help-title' },
    h('h2', { id: 'help-title' }, 'Keyboard shortcuts'),
    h('dl', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
    h('p', { class: 'aside' }, 'Touch: one finger rotates, two fingers pinch to zoom and drag to pan. Tap a structure for its card.'),
    h('form', { method: 'dialog' }, h('button', { class: 'btn' }, 'Close')));
  return d as HTMLDialogElement;
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
history.replaceState(null, '', encode(state));
atlas.viewer.preload().then(() => {
  pendingCamera = !state.cam.pos;
  pages.atlas.render(state);
  document.body.dataset.ready = '1';
});
(window as unknown as { __atlas: unknown }).__atlas = { viewer: atlas.viewer, state: () => state };
