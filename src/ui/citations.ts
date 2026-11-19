import { h } from './h';

/**
 * "Sources for this view" (the site audit's roadmap, section 3: a citation panel): every reference cited in the cards
 * of the panel's visible tab (the view's card and the selected structure's card), with its full citation and link,
 * sorted by its first author, and a button that copies them all as text. It sits folded at the foot of that tab and
 * follows the cards as they change. The references are read from the cards' citation links (`a.src`, which carry the
 * full citation as their title: refLinksFrom), so every section gets it the same way.
 */

export interface CitedRef { label: string; citation: string; url: string }

/** The references cited under `root`, each once, sorted by citation (its first author's surname first). */
export function citedIn(root: ParentNode): CitedRef[] {
  const seen = new Map<string, CitedRef>();
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a.src')) {
    if (a.closest('.view-sources')) continue;
    const citation = (a.title || a.textContent || '').trim();
    if (!citation) continue;
    if (!seen.has(citation)) seen.set(citation, { label: (a.textContent ?? '').trim(), citation, url: a.href });
  }
  return [...seen.values()].sort((x, y) => x.citation.localeCompare(y.citation, 'en'));
}

/** The references of the panel's visible tab (for an image's caption too). */
export function citedInView(): CitedRef[] {
  const pane = document.querySelector('.panel .pane:not([hidden])');
  return pane ? citedIn(pane) : [];
}

/** Keep a folded "Sources for this view" list at the foot of the panel's visible tab, up to date with its cards. */
export function citationPanel(panel: HTMLElement): void {
  const list = h('ol', { class: 'refs view-sources-list' });
  const copy = h('button', { type: 'button', class: 'linklike' }, 'Copy all') as HTMLButtonElement;
  const summary = h('summary', {}, 'Sources for this view');
  const block = h('details', { class: 'more view-sources' }, summary,
    h('p', { class: 'aside' }, 'Every reference cited in the cards above, once each. ', copy), list) as HTMLDetailsElement;
  let refs: CitedRef[] = [];
  const copyAll = async () => {
    const text = refs.map((r) => r.citation).join('\n');
    try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; } catch { window.prompt('Copy these references', text); }
    setTimeout(() => { copy.textContent = 'Copy all'; }, 1600);
  };
  copy.addEventListener('click', () => { void copyAll(); });
  let queued = false;
  const update = () => {
    queued = false;
    observer.disconnect();
    const pane = panel.querySelector<HTMLElement>('.pane:not([hidden])');
    refs = pane ? citedIn(pane) : [];
    if (pane && refs.length) {
      summary.textContent = `Sources for this view (${refs.length})`;
      list.replaceChildren(...refs.map((r) => h('li', {}, r.citation, ' ', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'View source'))));
      if (block.parentElement !== pane || pane.lastElementChild !== block) pane.append(block);
    } else block.remove();
    observer.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  };
  // (after the page has redrawn its cards; a timeout, not a frame: a hidden page draws none)
  const observer = new MutationObserver((ms) => {
    if (queued || ms.every((m) => block.contains(m.target))) return;
    queued = true;
    setTimeout(update, 0);
  });
  update();
}
