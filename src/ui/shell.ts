import { BRAND, SECTIONS, SITE_ROOT, type Section } from '../brand';
import { setViewPrefs, viewPrefs, type LegendPlace } from '../viewer/viewprefs';
import { h } from './h';
import { scrollHint } from './stage';

/**
 * Header shared by every page of the Open Neuroanatomy Atlas: the brand (links to the
 * home page), the current section, that section's own tabs, the viewer's settings (in a section) and the theme button.
 */
export function siteHeader(opts: { section: Section | null; nav: HTMLElement[]; themeBtn: HTMLElement }): HTMLElement {
  const nav = opts.nav.length ? h('nav', { class: 'nav', 'aria-label': `${opts.section?.name ?? BRAND.name} pages` }, ...opts.nav) : h('span', { class: 'nav' });
  // on a phone the page tabs scroll sideways: their edge fades where more lie
  scrollHint(nav);
  return h('header', { class: 'top' },
    h('a', { class: 'brand', href: SITE_ROOT, title: `${BRAND.name}: home` },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, BRAND.name)),
    opts.section ? sectionSwitch(opts.section) : null,
    nav,
    opts.section ? viewSettings() : null,
    opts.themeBtn,
  );
}

/** The 3D viewer's settings, shared by every section and kept in this browser: a menu button with a short form. */
function viewSettings(): HTMLElement {
  const fade = h('input', { type: 'checkbox', id: 'set-fade-others' }) as HTMLInputElement;
  fade.checked = viewPrefs().fadeOthers;
  fade.addEventListener('change', () => setViewPrefs({ fadeOthers: fade.checked }));
  // where the legend sits (src/ui/legendbox.ts; the audit's UI-14)
  const place = (value: LegendPlace, title: string, note: string) => {
    const r = h('input', { type: 'radio', name: 'set-legend', id: `set-legend-${value}`, value }) as HTMLInputElement;
    r.addEventListener('change', () => { if (r.checked) setViewPrefs({ legend: value }); });
    return h('label', { class: 'view-setting', for: `set-legend-${value}` }, r,
      h('span', {}, h('strong', {}, title), h('span', { class: 'view-setting-note' }, note)));
  };
  const legendSet = h('fieldset', { class: 'view-setting-group' }, h('legend', {}, 'Legend'),
    place('float', 'On the view', 'At the lower left of the 3D view; its title minimises it. While it is open the picture moves right to leave it room.'),
    place('dock', 'Beside the view', 'In a column left of the 3D view, outside the picture, on a screen 1200 px wide or more; narrower windows keep it on the view.'));
  const syncLegend = () => legendSet.querySelectorAll<HTMLInputElement>('input').forEach((r) => { r.checked = r.value === viewPrefs().legend; });
  syncLegend();
  const panel = h('div', { class: 'view-settings-panel', id: 'view-settings', role: 'dialog', 'aria-label': 'View options', hidden: true },
    h('label', { class: 'view-setting', for: 'set-fade-others' }, fade,
      h('span', {}, h('strong', {}, 'Fade the rest when a structure is selected'),
        h('span', { class: 'view-setting-note' }, 'Off: the selected structure (or the spine’s chosen level) is outlined, and shown through whatever covers it. A selected tract fades the other tracts either way.'))),
    legendSet);
  const btn = h('button', {
    type: 'button', class: 'view-settings-btn', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'view-settings',
    // ("View options": the DBS section has a page of settings of its own, and two "Settings" in one header confused: the
    // audit's UI-19)
    title: 'View options: how the 3D view shows a selected structure, and where the legend sits',
  }, h('span', { class: 'gear', 'aria-hidden': 'true' }, '⚙'), h('span', { class: 'view-settings-label' }, 'View options')) as HTMLButtonElement;
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
    syncLegend();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    fade.focus();
  });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target as Node)) close(); });
  return wrap;
}

/** A notice's last sentence: the one that says what the site is not for ("Not for surgical planning."). */
export function lastSentence(text: string): string {
  const parts = text.trim().split(/(?<=[.!?])\s+(?=\S)/);
  return parts[parts.length - 1];
}

let noticeId = 0;

export function disclaimerNote(text = 'Atlas-based (MNI 2009b) group anatomy; individual anatomy varies. Not for surgical planning.'): HTMLElement {
  // (a landmark of its own: it sat outside every landmark, which screen readers' landmark lists skip)
  // On a phone the notice is "Teaching tool." and its own last sentence, with the rest a tap away: in full it took two to
  // four lines of an 844 px screen from the 3D stage (the audit's UI-27). The text is the same, only folded; the stage's
  // height follows the notice's (--disc-h). The short line and the full one are each hidden by the styles where the
  // other shows, so a screen reader reads one of them.
  const id = `notice-full-${++noticeId}`;
  const aside = h('aside', { class: 'disclaimer', 'aria-label': 'Notice' });
  const toggle = (open: boolean) => () => {
    aside.classList.toggle('open', open);
    (open ? less : more).focus();
  };
  const more = h('button', { type: 'button', class: 'disc-toggle', 'aria-expanded': 'false', 'aria-controls': id, onclick: toggle(true) }, 'More');
  // (each button shows in one state only, so each says its own: More folded, Less unfolded)
  const less = h('button', { type: 'button', class: 'disc-toggle', 'aria-expanded': 'true', 'aria-controls': id, onclick: toggle(false) }, 'Less');
  const short = lastSentence(text);
  aside.append(h('p', { class: 'disc-full', id }, h('strong', {}, 'Teaching tool. '), text, ' ', less));
  // (the full text when it is one sentence: nothing to fold)
  if (short === text.trim()) aside.classList.add('single');
  else aside.append(h('p', { class: 'disc-short' }, h('strong', {}, 'Teaching tool. '), short, ' ', more));
  return aside;
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
