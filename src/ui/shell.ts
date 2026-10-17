import { BRAND, SECTIONS, SITE_ROOT, type Section } from '../brand';
import { h } from './h';

/**
 * Header shared by every page of the Open Neuroanatomy Atlas: the brand (links to the
 * home page), the current section, that section's own tabs, and the theme button.
 */
export function siteHeader(opts: { section: Section | null; nav: HTMLElement[]; themeBtn: HTMLElement }): HTMLElement {
  return h('header', { class: 'top' },
    h('a', { class: 'brand', href: SITE_ROOT, title: `${BRAND.name}: home` },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, BRAND.name)),
    opts.section ? sectionSwitch(opts.section) : null,
    opts.nav.length ? h('nav', { class: 'nav', 'aria-label': `${opts.section?.name ?? BRAND.name} pages` }, ...opts.nav) : h('span', { class: 'nav' }),
    opts.themeBtn,
  );
}

export function disclaimerNote(text = 'Atlas-based (MNI 2009b) group anatomy; individual anatomy varies. Not for surgical planning.'): HTMLElement {
  return h('p', { class: 'disclaimer', role: 'note' }, h('strong', {}, 'Teaching tool. '), text);
}

/** The current section as a menu button: switch to another section or go to the home page. */
function sectionSwitch(current: Section): HTMLElement {
  const links = [
    ...SECTIONS.filter((s) => s.status === 'live').map((s) => h('a', {
      role: 'menuitem', href: `${SITE_ROOT}${s.path}`, class: 'section-item', tabindex: -1,
      ...(s.id === current.id ? { 'aria-current': 'page' } : {}),
    }, s.name)),
    h('a', { role: 'menuitem', href: SITE_ROOT, class: 'section-item home', tabindex: -1 }, 'All sections (home)'),
  ];
  const menu = h('div', { class: 'section-menu', role: 'menu', id: 'section-menu', hidden: true }, ...links);
  const btn = h('button', {
    type: 'button', class: 'section-chip', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'section-menu',
    title: 'Switch section',
  }, current.name, h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾')) as HTMLButtonElement;
  const wrap = h('div', { class: 'section-switch' }, btn, menu);
  const open = (focus: number | null) => {
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    if (focus !== null) (links[focus] as HTMLElement).focus();
  };
  const close = (refocus = false) => {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus();
  };
  btn.addEventListener('click', () => (menu.hidden ? open(null) : close()));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(0); }
  });
  menu.addEventListener('keydown', (e) => {
    const i = (links as HTMLElement[]).indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      (links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length] as HTMLElement).focus();
    } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close();
  });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target as Node)) close(); });
  return wrap;
}
