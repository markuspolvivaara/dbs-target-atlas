import { BRAND, type Section } from '../brand';
import type { Viewer } from '../viewer/Viewer';
import type { ViewState } from '../viewer/scene';
import { addressSync } from './address';
import { h } from './h';
import { bindHelp, viewHelp } from './help';
import { lostFromLink, showLinkNote } from './linknote';
import { disclaimerNote, siteHeader } from './shell';
import { bootFailed } from './stage';
import { textGroups, textViewContent } from './textview';
import { applyTheme, injectPaletteCss, paletteFor, storeTheme, storedTheme, VIEWER, type ThemePref } from './theme';

/**
 * The frame every section's page shares: the colour theme and its button, the header with the section's page tabs,
 * the notice under it, the pages and the switching between them, the document title, the address both ways (a link
 * read in, the view's hash written out), the help dialog and the keys. Eight entry scripts held a copy each, and the
 * copies had begun to drift (the site audit's P1-14); each is now this frame's configuration: its pages, how its links
 * read and write, its help, and whatever else is its own.
 */

/** the link keys whose change is another view (indication, group, view, region): a new history entry (see setState) */
const VIEW_KEYS = ['i', 'g', 'v', 'r'];

/** A change to the view. `camera: false` marks the camera's own moves (the address follows them a moment later),
 * `camera: true` a change that moves the camera to the new view; left out, the camera stays where it is. */
export type Update<S> = (fn: (s: S) => void, opts?: { camera?: boolean }) => void;

/** A page beside the atlas (sources, credits ...). */
export interface SectionPage<S> {
  el: HTMLElement;
  render(s: S): void;
  /** the page shows the colour theme (the DBS section's settings): drawn again when the reader changes the theme while
   * it is shown (with its own control or the header's button) */
  showsTheme?: boolean;
}

/** What the frame uses of a section's atlas page. */
export interface SectionAtlas<S> {
  el: HTMLElement;
  viewer: Pick<Viewer, 'renderer' | 'setTheme' | 'handleKey' | 'preload' | 'currentPlan' | 'catalogue' | 'shownIds'>;
  render(s: S, opts: { camera: boolean }): void;
  onShow(): void;
  /** the section's own keys; true when the key was used */
  handleKey(e: KeyboardEvent): boolean;
}

/** The colour theme as a page can read and set it. */
export interface ThemeControl { get(): ThemePref; set(t: ThemePref): void }

export interface SectionConfig<P extends string, S extends ViewState & { page: P }, A extends SectionAtlas<S>> {
  /** the section, from SECTIONS in brand.ts */
  section: Section;
  /** the header's page tabs, in order. A page's document title is its tab's label (the atlas's is atlasTitle). */
  nav: [P, string][];
  /** the notice under the header (left out: the MNI atlas one) */
  disclaimer?: string;
  /** The view a link describes, settled: decoded, made valid, and completed by the section's own rules for what a link
   * leaves out. At the start and for every link with parameters. */
  fromLink(hash: string): S;
  /** the page a bare link (`#/sources`) names: such a link changes the page and keeps the view */
  pageOf(hash: string): P;
  encode(s: S): string;
  /** a view made valid: a group or structure the section does not have falls back, what depends on the rest follows */
  sanitize(s: S): S;
  /** for the note on a link that names what the section does not have: link key → state field (see linknote.ts) */
  linkFields: Record<string, string>;
  atlas(update: Update<S>): A;
  /** the other pages, in the order they stand in the page */
  pages(update: Update<S>, theme: ThemeControl): Record<Exclude<P, 'atlas'>, SectionPage<S>>;
  /** the atlas page's document title: its view, or the structure selected in it */
  atlasTitle(s: S): string;
  /** the help dialog: the section's keys, and what a click or tap in the 3D view selects ("a structure") */
  help: { rows: [string, string][]; tap: string };
  /** a change made on the page, before it is made valid (`prev`: the view it changes) */
  onChange?(next: S, prev: S): void;
  /** after every render */
  afterRender?(s: S): void;
  /** a structure's definition, for the text version of the view (its first sentence is shown); left out: names only */
  define?(id: string, name: string): string | null | undefined;
}

/** Build the section's page from its configuration and start it. Returns the atlas page, for what else the section
 * wires to it. */
export function bootSection<P extends string, S extends ViewState & { page: P }, A extends SectionAtlas<S>>(cfg: SectionConfig<P, S, A>): { atlas: A } {
  injectPaletteCss();
  let theme: ThemePref = storedTheme();
  let resolved = applyTheme(theme);

  let state = cfg.fromLink(location.hash);
  let pendingCamera = true;
  let hashTimer = 0;

  // ---------------------------------------------------------------- shell
  const app = document.getElementById('app')!;
  const navLinks = cfg.nav.map(([p, label]) => h('a', { href: `#/${p}`, class: 'navlink', 'data-page': p }, label));
  const tabLabel = new Map<string, string>(cfg.nav);
  const themeBtn = h('button', { type: 'button', class: 'theme-btn', onclick: () => cycleTheme() });
  const header = siteHeader({ section: cfg.section, nav: navLinks, themeBtn });
  const disclaimer = disclaimerNote(cfg.disclaimer);

  const update: Update<S> = (fn, opts = {}) => {
    const next = structuredClone(state);
    fn(next);
    cfg.onChange?.(next, state);
    setState(cfg.sanitize(next), { camera: opts.camera ?? false, fromCamera: opts.camera === false, fromPage: true });
  };
  const atlas = cfg.atlas(update);
  const atlasPage: SectionPage<S> = { el: atlas.el, render: (s) => atlas.render(s, { camera: pendingCamera }) };
  const pages = { atlas: atlasPage, ...cfg.pages(update, { get: () => theme, set: (t) => setThemePref(t) }) } as Record<P, SectionPage<S>>;

  const main = h('main', { id: 'main' }, ...Object.values<SectionPage<S>>(pages).map((p) => p.el));
  // the stage height depends on the (wrapping) disclaimer height
  new ResizeObserver(() => document.documentElement.style.setProperty('--disc-h', `${disclaimer.offsetHeight}px`)).observe(disclaimer);
  // the text version of the 3D view (the audit's UI-20): filled from the view each time it is opened
  const textBody = h('div', { class: 'textview-body' });
  const textDialog = h('dialog', { class: 'textview', 'aria-labelledby': 'textview-title' },
    textBody, h('form', { method: 'dialog' }, h('button', { class: 'btn' }, 'Close'))) as HTMLDialogElement;
  const openText = () => {
    const v = atlas.viewer, p = v.currentPlan();
    textBody.replaceChildren(...textViewContent(p?.title ?? cfg.section.name,
      p ? textGroups(p, v.catalogue(), new Set(v.shownIds()), cfg.define?.bind(cfg)) : []));
    if (!textDialog.open) textDialog.showModal();
    textDialog.querySelector<HTMLElement>('h2')?.focus();
  };
  const help = helpDialog(cfg.help.rows, cfg.help.tap, () => { help.close(); openText(); });
  bindHelp(help);
  // the atlas page's heading, for screen readers and outlines (its other pages have their own)
  atlas.el.prepend(h('h1', { class: 'vh' }, `${cfg.section.name}: 3D atlas`));
  app.append(...skipLinks(openText), header, disclaimer, main, help, textDialog);

  const address = addressSync();   // (the address is written only over the hash this page last wrote or read)

  /** What a history entry stands for: the page and the view on it (its indication, group or region: the link keys
   * VIEW_KEYS, by the section's linkFields), not the camera, a slider or a selection. */
  const viewOf = (s: S): string => [s.page, ...VIEW_KEYS.map((k) => cfg.linkFields[k]).filter(Boolean).map((f) => String((s as Record<string, unknown>)[f]))].join('\n');

  function setState(next: S, opts: { camera: boolean; fromCamera?: boolean; fromPage?: boolean }): void {
    const pageChanged = next.page !== state.page;
    // another view chosen on the page is a new history entry, so that Back returns to the one left (a link, Back
    // itself and the address bar have made their own). The entry left first takes the view as it was left: its camera
    // may still be waiting for its timer.
    const push = !!opts.fromPage && viewOf(next) !== viewOf(state);
    if (push) address.write(cfg.encode(state));
    state = next;
    pendingCamera = opts.camera;
    // the address follows a change at once, and the camera, which moves in bursts, a moment after its last move (with a
    // timer for every change, the camera's moves put off another change's while the view was still settling)
    clearTimeout(hashTimer);
    if (opts.fromCamera) hashTimer = window.setTimeout(() => address.write(cfg.encode(state)), 400);
    else address.write(cfg.encode(state), push);
    if (opts.fromCamera) return;
    render(pageChanged);
  }

  function render(pageChanged = false): void {
    for (const [p, v] of Object.entries<SectionPage<S>>(pages)) v.el.hidden = p !== state.page;
    navLinks.forEach((a) => (a.dataset.page === state.page ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    document.body.dataset.page = state.page;
    pages[state.page].render(state);
    if (state.page === 'atlas') atlas.onShow();
    document.title = `${state.page === 'atlas' ? cfg.atlasTitle(state) : tabLabel.get(state.page)} · ${cfg.section.name} · ${BRAND.name}`;
    if (pageChanged) window.scrollTo(0, 0);
    cfg.afterRender?.(state);
  }

  showLinkNote(header, lostFromLink(location.hash, state, cfg.linkFields));

  window.addEventListener('hashchange', () => {
    address.read();
    if (location.hash === cfg.encode(state)) return;
    // A link with parameters is a complete view description; a bare page link (#/atlas) keeps the current view.
    const bare = !location.hash.includes('?');
    const next = bare ? cfg.sanitize({ ...structuredClone(state), page: cfg.pageOf(location.hash) }) : cfg.fromLink(location.hash);
    showLinkNote(header, lostFromLink(location.hash, next, cfg.linkFields));
    setState(next, { camera: !bare || next.page !== state.page });
  });

  // ---------------------------------------------------------------- theme
  function cycleTheme(): void {
    setThemePref(theme === 'system' ? (resolved === 'dark' ? 'light' : 'dark') : theme === 'light' ? 'dark' : 'system');
  }
  function setThemePref(t: ThemePref): void {
    theme = t;
    storeTheme(theme);
    resolved = applyTheme(theme);
    syncTheme();
    if (pages[state.page].showsTheme) pages[state.page].render(state);
  }
  function syncTheme(): void {
    themeBtn.textContent = theme === 'system' ? 'Theme: auto' : theme === 'light' ? 'Theme: light' : 'Theme: dark';
    themeBtn.setAttribute('aria-label', `Colour theme: ${theme}. Change theme`);
    atlas.viewer.setTheme(paletteFor(resolved), VIEWER[resolved].bg, VIEWER[resolved].ghost);
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { resolved = applyTheme(theme); syncTheme(); });

  // ---------------------------------------------------------------- keyboard
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (t.closest('input, select, textarea, [contenteditable]')) return;
    if (e.key === '?') { help.open ? help.close() : help.showModal(); e.preventDefault(); return; }
    if (state.page !== 'atlas' || help.open) return;
    // the section's own keys first; then, with the 3D view in focus, the viewer's (arrows turn it, + and - zoom)
    if (atlas.handleKey(e) || (document.activeElement === atlas.viewer.renderer.domElement && atlas.viewer.handleKey(e))) e.preventDefault();
  });

  // ---------------------------------------------------------------- boot
  syncTheme();
  render(true);
  history.replaceState(null, '', cfg.encode(state));
  address.read();
  atlas.viewer.preload().then(() => {
    pendingCamera = !state.cam.pos;
    atlasPage.render(state);
    document.body.dataset.ready = '1';
  }).catch(bootFailed);
  (window as unknown as { __atlas: unknown }).__atlas = { viewer: atlas.viewer, state: () => state };
  return { atlas };
}

/** The skip links: to the content, to the atlas page's panel, and the text version of its 3D view. */
function skipLinks(openText: () => void): HTMLElement[] {
  return [
    h('a', { class: 'skip', href: '#main' }, 'Skip to content'),
    h('a', { class: 'skip skip-panel', href: '#panel', onclick: (e: Event) => { e.preventDefault(); document.getElementById('panel')?.focus(); } }, 'Skip to the panel'),
    h('a', { class: 'skip skip-text', href: '#textview', 'aria-haspopup': 'dialog', onclick: (e: Event) => { e.preventDefault(); openText(); } }, 'Text version of this view'),
  ];
}

/** The help dialog: the section's keys, then what the mouse, touch and keyboard do in the 3D view. */
function helpDialog(rows: [string, string][], tap: string, openText: () => void): HTMLDialogElement {
  return h('dialog', { class: 'help', 'aria-labelledby': 'help-title' },
    h('h2', { id: 'help-title' }, 'Keys, mouse and touch'),
    h('dl', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
    ...viewHelp(tap),
    h('p', {}, 'Without the 3D view: ', h('button', { type: 'button', class: 'linklike', 'aria-haspopup': 'dialog', onclick: () => openText() }, 'a text version of this view'),
      ' lists what it draws, as do the legend and the panel.'),
    h('form', { method: 'dialog' }, h('button', { class: 'btn' }, 'Close'))) as HTMLDialogElement;
}
