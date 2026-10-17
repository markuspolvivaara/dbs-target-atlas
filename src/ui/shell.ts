import { BRAND, SITE_ROOT, type Section } from '../brand';
import { h } from './h';

/**
 * Header shared by every page of the Open Neuroanatomy Atlas: the brand (links to the
 * home page), the current section, that section's own tabs, and the theme button.
 */
export function siteHeader(opts: { section: Section | null; nav: HTMLElement[]; themeBtn: HTMLElement }): HTMLElement {
  return h('header', { class: 'top' },
    h('a', { class: 'brand', href: SITE_ROOT, title: `${BRAND.name}: home` },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, BRAND.name)),
    opts.section ? h('a', { class: 'section-chip', href: SITE_ROOT, title: 'All sections' }, opts.section.name) : null,
    opts.nav.length ? h('nav', { class: 'nav', 'aria-label': `${opts.section?.name ?? BRAND.name} pages` }, ...opts.nav) : h('span', { class: 'nav' }),
    opts.themeBtn,
  );
}

export function disclaimerNote(): HTMLElement {
  return h('p', { class: 'disclaimer', role: 'note' },
    h('strong', {}, 'Teaching tool. '), 'Atlas-based (MNI 2009b) group anatomy; individual anatomy varies. Not for surgical planning.');
}
