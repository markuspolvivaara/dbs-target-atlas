import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { BRAND, SECTIONS, SITE_ROOT } from './brand';
import { h } from './ui/h';
import { disclaimerNote, siteHeader } from './ui/shell';
import { applyTheme, injectPaletteCss, resolvedTheme, storeTheme, storedTheme, type ThemePref } from './ui/theme';

/** Home page of the Open Neuroanatomy Atlas: introduction and the sections. Light: no 3D code. */

// Links shared before the site had sections (…/#/atlas?…) belong to the DBS section. The inline
// script in index.html handles fresh loads; this also covers a hash change on an open home page.
const LEGACY = /^#\/(atlas|imaging|coords|refs|credits|settings)\b/;
window.addEventListener('hashchange', () => { if (LEGACY.test(location.hash)) location.replace(`${SITE_ROOT}dbs/${location.hash}`); });

injectPaletteCss();
let theme: ThemePref = storedTheme();
applyTheme(theme);

const themeBtn = h('button', { type: 'button', class: 'theme-btn', onclick: () => {
  const r = resolvedTheme(theme);
  theme = theme === 'system' ? (r === 'dark' ? 'light' : 'dark') : theme === 'light' ? 'dark' : 'system';
  storeTheme(theme); applyTheme(theme); label();
} });
function label() {
  themeBtn.textContent = theme === 'system' ? 'Theme: auto' : theme === 'light' ? 'Theme: light' : 'Theme: dark';
  themeBtn.setAttribute('aria-label', `Colour theme: ${theme}. Change theme`);
}
label();

const dbs = SECTIONS.find((s) => s.id === 'dbs')!;
const nav = [
  h('a', { href: `${SITE_ROOT}${dbs.path}#/settings`, class: 'navlink' }, 'Settings'),
];

// each module's card: the whole card is the link, over a view of the module itself (public/assets/home/<id>.webp)
const cards = SECTIONS.map((s) => {
  const live = s.status === 'live';
  // absolute: a url() inside a custom property resolves against the stylesheet that uses it, not this page
  const style = `--img: url('${new URL(`${SITE_ROOT}assets/home/${s.id}.webp`, location.href).href}')`;
  const body = [
    h('h2', {}, s.name, live ? null : h('span', { class: 'badge' }, 'Coming soon')),
    h('p', {}, s.summary),
    live ? h('span', { class: 'open', 'aria-hidden': 'true' }, `Open ${s.name} →`) : h('p', { class: 'aside' }, 'In development.'),
  ];
  return live
    ? h('a', { class: 'section-card', 'data-section': s.id, href: `${SITE_ROOT}${s.path}`, style }, ...body)
    : h('article', { class: 'section-card soon', 'data-section': s.id, style }, ...body);
});

const main = h('main', { id: 'main', class: 'home wrap' },
  h('h1', {}, BRAND.name),
  h('p', { class: 'lede' }, BRAND.tagline),
  h('div', { class: 'section-grid' }, ...cards),
  h('section', { class: 'card about' },
    h('h2', {}, 'About'),
    h('p', {}, 'All 3D anatomy comes from published atlases, converted by an open pipeline and checked against its sources; nothing is hand-modelled. Every clinical statement links to its reference.'),
    h('p', {}, 'Open source under GPL-3.0; the white-matter tract data are CC BY-SA 4.0. ', h('a', { href: BRAND.repo, target: '_blank', rel: 'noopener' }, 'Source code'), '.'),
    h('p', {}, 'Data, licences and credits: ', ...SECTIONS.flatMap((s, i) => [i ? ' · ' : '', h('a', { href: `${SITE_ROOT}${s.path}#/credits` }, s.name)]), '.')),
);

document.getElementById('app')!.append(
  h('a', { class: 'skip', href: '#main' }, 'Skip to content'),
  siteHeader({ section: null, nav, themeBtn }),
  disclaimerNote(),
  main,
);
document.body.dataset.page = 'home';
document.body.dataset.ready = '1';
