import { h } from './h';

/**
 * A link that names a page, view, structure, region or level this section does not have opened the default view
 * without a word (the site audit's P1-24: an old link, or one made on another model). Each section's main compares the
 * link with the state it settled on and says what it did not find, under the header, until the reader dismisses it
 * or follows another link.
 */

const WHAT: Record<string, string> = { i: 'indication', s: 'symptom', g: 'view', v: 'view', r: 'region', lv: 'level', sel: 'structure' };

/** What the link `hash` named that the state does not hold: its page, then each of `fields` (link key → state field). */
export function lostFromLink(hash: string, state: object, fields: Record<string, string>): string[] {
  const [path, query] = hash.replace(/^#\/?/, '').split('?');
  const s = state as Record<string, unknown>;
  const out: string[] = [];
  if (path && path !== s.page) out.push(`the page “${decodeURIComponent(path)}”`);
  const p = new URLSearchParams(query ?? '');
  for (const [k, field] of Object.entries(fields)) {
    const v = p.get(k);
    if (v && s[field] !== v) out.push(`the ${WHAT[k] ?? k} “${v}”`);
  }
  return out;
}

/** Say (or stop saying) under the header what the last link named that this section does not have. */
export function showLinkNote(header: HTMLElement, lost: string[]): void {
  document.querySelector('.link-note')?.remove();
  if (!lost.length) return;
  const list = lost.length === 1 ? lost[0] : `${lost.slice(0, -1).join(', ')} and ${lost[lost.length - 1]}`;
  const note = h('div', { class: 'link-note', role: 'status' },
    `This link names ${list}, which this section does not have: the nearest view is shown instead. `,
    h('button', { type: 'button', class: 'linklike', onclick: () => note.remove() }, 'Dismiss'));
  header.after(note);
}
