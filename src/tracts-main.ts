import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { BRAND, SECTIONS } from './brand';
import { GROUP, TOPIC } from './tracts';
import { decodeTracts, defaultTractsState, encodeTracts, type TractsPage, type TractsState } from './tracts/state';
import { h } from './ui/h';
import { disclaimerNote, siteHeader } from './ui/shell';
import { applyTheme, injectPaletteCss, paletteFor, storeTheme, storedTheme, VIEWER, type ThemePref } from './ui/theme';
import { TractsAtlasPage } from './ui/tracts-atlas';
import { tractCreditsPage, tractRefsPage } from './ui/tracts-pages';

const SECTION = SECTIONS.find((s) => s.id === 'tracts')!;

injectPaletteCss();
let theme: ThemePref = storedTheme();
let resolved = applyTheme(theme);

/** A link without `h` uses the group's own hemisphere (language: left, SLF complex: right ...). */
function fromHash(hash: string, base: TractsState): TractsState {
  const { state, hasHemi } = decodeTracts(hash, base);
  const s = sanitize(state);
  if (!hasHemi) s.hemi = GROUP.get(s.grp)!.hemi;
  return s;
}

function sanitize(s: TractsState): TractsState {
  if (!GROUP.has(s.grp)) s.grp = 'language';
  if (s.sel && !TOPIC.has(s.sel)) s.sel = null;
  return s;
}

let state: TractsState = fromHash(location.hash, defaultTractsState());

// ---------------------------------------------------------------- shell
const NAV: [TractsPage, string][] = [['atlas', 'Atlas'], ['refs', 'References'], ['credits', 'Credits']];
const app = document.getElementById('app')!;
const navLinks = NAV.map(([p, label]) => h('a', { href: `#/${p}`, class: 'navlink', 'data-page': p }, label));
const themeBtn = h('button', { type: 'button', class: 'theme-btn', onclick: () => cycleTheme() });
const header = siteHeader({ section: SECTION, nav: navLinks, themeBtn });
const disclaimer = disclaimerNote();

const update = (fn: (s: TractsState) => void, opts: { camera?: boolean } = {}) => {
  const next = structuredClone(state);
  fn(next);
  setState(sanitize(next), { camera: opts.camera ?? false, fromCamera: opts.camera === false });
};
const atlas = new TractsAtlasPage(update);
const pages: Record<TractsPage, { el: HTMLElement; render(s: TractsState): void }> = {
  atlas: { el: atlas.el, render: (s) => atlas.render(s, { camera: pendingCamera }) },
  refs: tractRefsPage(),
  credits: tractCreditsPage(),
};

const main = h('main', { id: 'main' }, ...Object.values(pages).map((p) => p.el));
new ResizeObserver(() => document.documentElement.style.setProperty('--disc-h', `${disclaimer.offsetHeight}px`)).observe(disclaimer);
const help = buildHelp();
app.append(h('a', { class: 'skip', href: '#main' }, 'Skip to content'), header, disclaimer, main, help);

let pendingCamera = true;
let hashTimer = 0;

function setState(next: TractsState, opts: { camera: boolean; fromCamera?: boolean }): void {
  const pageChanged = next.page !== state.page;
  state = next;
  pendingCamera = opts.camera;
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    const hsh = encodeTracts(state);
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
  const atlasTitle = state.sel ? TOPIC.get(state.sel)!.name : GROUP.get(state.grp)!.name;
  const titles: Record<TractsPage, string> = { atlas: atlasTitle, refs: 'References', credits: 'Credits' };
  document.title = `${titles[state.page]} · ${SECTION.name} · ${BRAND.name}`;
  if (pageChanged) window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
  if (location.hash === encodeTracts(state)) return;
  // A link with parameters is a complete view description; a bare page link (#/atlas) keeps the current view.
  const bare = !location.hash.includes('?');
  const next = bare ? { ...structuredClone(state), page: decodeTracts(location.hash).state.page } : fromHash(location.hash, defaultTractsState());
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
    ['1 – 5', 'Camera: lateral (from outside the shown hemisphere), medial (from the midline), coronal, axial (anterior up), posterior-oblique'],
    ['H', 'Hemisphere: both → left → right'], ['[ / ]', 'Previous / next tract in the group'],
    ['N', 'Name labels: all → hover → off'], ['S', 'Toggle axial slice'], ['M', 'Measure distance'], ['Esc', 'Close card or stop measuring'], ['?', 'This help'],
  ];
  return h('dialog', { class: 'help', 'aria-labelledby': 'help-title' },
    h('h2', { id: 'help-title' }, 'Keyboard shortcuts'),
    h('dl', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
    h('p', { class: 'aside' }, 'Touch: one finger rotates, two fingers pinch to zoom and drag to pan. Tap a tract for its card.'),
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
history.replaceState(null, '', encodeTracts(state));
atlas.viewer.preload().then(() => {
  pendingCamera = !state.cam.pos;
  pages.atlas.render(state);
  document.body.dataset.ready = '1';
});
(window as unknown as { __atlas: unknown }).__atlas = { viewer: atlas.viewer, state: () => state };
