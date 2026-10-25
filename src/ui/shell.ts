import { BRAND, SECTIONS, SITE_ROOT, type Section } from '../brand';
import { setViewPrefs, viewPrefs } from '../viewer/viewprefs';
import { h } from './h';

/**
 * Header shared by every page of the Open Neuroanatomy Atlas: the brand (links to the
 * home page), the current section, that section's own tabs, the viewer's settings (in a section) and the theme button.
 */
export function siteHeader(opts: { section: Section | null; nav: HTMLElement[]; themeBtn: HTMLElement }): HTMLElement {
  return h('header', { class: 'top' },
    h('a', { class: 'brand', href: SITE_ROOT, title: `${BRAND.name}: home` },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, BRAND.name)),
    opts.section ? sectionSwitch(opts.section) : null,
    opts.nav.length ? h('nav', { class: 'nav', 'aria-label': `${opts.section?.name ?? BRAND.name} pages` }, ...opts.nav) : h('span', { class: 'nav' }),
    opts.section ? viewSettings() : null,
    opts.themeBtn,
  );
}

/** The 3D viewer's settings, shared by every section and kept in this browser: a menu button with a short form. */
function viewSettings(): HTMLElement {
  const fade = h('input', { type: 'checkbox', id: 'set-fade-others' }) as HTMLInputElement;
  fade.checked = viewPrefs().fadeOthers;
  fade.addEventListener('change', () => setViewPrefs({ fadeOthers: fade.checked }));
  const panel = h('div', { class: 'view-settings-panel', id: 'view-settings', role: 'dialog', 'aria-label': 'Viewer settings', hidden: true },
    h('label', { class: 'view-setting', for: 'set-fade-others' }, fade,
      h('span', {}, h('strong', {}, 'Fade the rest when a structure is selected'),
        h('span', { class: 'view-setting-note' }, 'Off: the selected structure is outlined, and shown through whatever covers it.'))));
  const btn = h('button', {
    type: 'button', class: 'view-settings-btn', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'view-settings',
    title: 'Viewer settings',
  }, h('span', { class: 'gear', 'aria-hidden': 'true' }, '⚙'), h('span', { class: 'view-settings-label' }, 'Settings')) as HTMLButtonElement;
  const wrap = h('div', { class: 'view-settings' }, btn, panel);
  const close = (refocus = false) => {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus();
  };
  btn.addEventListener('click', () => {
    if (!panel.hidden) { close(); return; }
    fade.checked = viewPrefs().fadeOthers;
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    fade.focus();
  });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target as Node)) close(); });
  return wrap;
}

export function disclaimerNote(text = 'Atlas-based (MNI 2009b) group anatomy; individual anatomy varies. Not for surgical planning.'): HTMLElement {
  return h('p', { class: 'disclaimer', role: 'note' }, h('strong', {}, 'Teaching tool. '), text);
}

/** The current section as a menu button: switch to another section or go to the home page. */
function sectionSwitch(current: Section): HTMLElement {
  const item = (s: Section) => h('a', {
    role: 'menuitem', href: `${SITE_ROOT}${s.path}`, class: 'section-item', tabindex: -1,
    ...(s.id === current.id ? { 'aria-current': 'page' } : {}),
  }, s.name);
  const main = SECTIONS.filter((s) => s.status === 'live' && !s.alt).map(item);
  const alts = SECTIONS.filter((s) => s.status === 'live' && s.alt).map(item);
  const home = h('a', { role: 'menuitem', href: SITE_ROOT, class: 'section-item home', tabindex: -1 }, 'All sections (home)');
  // the menu items, in keyboard order; the alternative versions under their own label
  const links = [...main, ...alts, home];
  const menu = h('div', { class: 'section-menu', role: 'menu', id: 'section-menu', hidden: true }, ...main,
    alts.length ? h('p', { class: 'section-group', role: 'presentation' }, 'Alternative versions') : null, ...alts, home);
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
