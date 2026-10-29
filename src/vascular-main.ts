import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { BRAND, SECTIONS } from './brand';
import { VA } from './vascular';
import { VA_GROUP } from './vascular/groups';
import { decodeVa, encodeVa, type VaPage, type VaState } from './vascular/state';
import { VascularAtlasPage } from './ui/vascular-atlas';
import { vaCreditsPage, vaSourcesPage } from './ui/vascular-pages';
import { h } from './ui/h';
import { disclaimerNote, siteHeader } from './ui/shell';
import { applyTheme, injectPaletteCss, paletteFor, storeTheme, storedTheme, VIEWER, type ThemePref } from './ui/theme';

const SECTION = SECTIONS.find((s) => s.id === 'vascular')!;

injectPaletteCss();
let theme: ThemePref = storedTheme();
let resolved = applyTheme(theme);

function sanitize(s: VaState): VaState {
  if (!VA_GROUP.has(s.grp)) s.grp = 'normal';
  if (s.sel && !VA.has(s.sel)) s.sel = null;
  return s;
}

let state: VaState = sanitize(decodeVa(location.hash));

// ---------------------------------------------------------------- shell
const NAV: [VaPage, string][] = [['atlas', 'Atlas'], ['sources', 'Sources'], ['credits', 'Credits']];
const app = document.getElementById('app')!;
const navLinks = NAV.map(([p, label]) => h('a', { href: `#/${p}`, class: 'navlink', 'data-page': p }, label));
const themeBtn = h('button', { type: 'button', class: 'theme-btn', onclick: () => cycleTheme() });
const header = siteHeader({ section: SECTION, nav: navLinks, themeBtn });
const disclaimer = disclaimerNote('One adult’s normal CT angiogram: the vessels are this patient’s; every aneurysm, malformation and fistula is drawn onto them by rule, and the angiogram’s timing is a drawing. For teaching, not for diagnosis or planning.');

const update = (fn: (s: VaState) => void, opts: { camera?: boolean } = {}) => {
  const next = structuredClone(state);
  fn(next);
  setState(sanitize(next), { camera: opts.camera ?? false, fromCamera: opts.camera === false });
};
const atlas = new VascularAtlasPage(update);
const pages: Record<VaPage, { el: HTMLElement; render(s: VaState): void }> = {
  atlas: { el: atlas.el, render: (s) => atlas.render(s, { camera: pendingCamera }) },
  sources: vaSourcesPage(),
  credits: vaCreditsPage(),
};

const main = h('main', { id: 'main' }, ...Object.values(pages).map((p) => p.el));
new ResizeObserver(() => document.documentElement.style.setProperty('--disc-h', `${disclaimer.offsetHeight}px`)).observe(disclaimer);
const help = buildHelp();
app.append(h('a', { class: 'skip', href: '#main' }, 'Skip to content'), header, disclaimer, main, help);

let pendingCamera = true;
let hashTimer = 0;

function setState(next: VaState, opts: { camera: boolean; fromCamera?: boolean }): void {
  const pageChanged = next.page !== state.page;
  state = next;
  pendingCamera = opts.camera;
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    const hsh = encodeVa(state);
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
  const atlasTitle = state.sel ? (VA.get(state.sel)?.name ?? '') : VA_GROUP.get(state.grp)!.name;
  const titles: Record<VaPage, string> = { atlas: atlasTitle, sources: 'Sources', credits: 'Credits' };
  document.title = `${titles[state.page]} · ${SECTION.name} · ${BRAND.name}`;
  if (pageChanged) window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
  if (location.hash === encodeVa(state)) return;
  const bare = !location.hash.includes('?');
  const next = bare ? { ...structuredClone(state), page: decodeVa(location.hash).page } : sanitize(decodeVa(location.hash));
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
    ['1 – 5', 'Camera: front, side, from above, front oblique, over the forehead'],
    ['H', 'Side: both → left → right'], ['A', 'Angiogram on or off'], ['Space', 'Play or pause the angiogram'],
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
history.replaceState(null, '', encodeVa(state));
atlas.viewer.preload().then(() => {
  pendingCamera = !state.cam.pos;
  pages.atlas.render(state);
  document.body.dataset.ready = '1';
});
(window as unknown as { __atlas: unknown }).__atlas = { viewer: atlas.viewer, state: () => state };
