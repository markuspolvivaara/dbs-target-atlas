import { h } from './h';

export interface RefLike { shortLabel: string; citation: string; url: string }

/** "(Akram 2017, Rajamani 2024)" with each label linking to its source, looked up in `refs`. */
export function refLinksFrom(refs: Map<string, RefLike>, ids: string[], paren = true): DocumentFragment {
  const f = document.createDocumentFragment();
  if (!ids.length) return f;
  if (paren) f.append('(');
  ids.forEach((id, i) => {
    const r = refs.get(id);
    if (i) f.append(', ');
    if (!r) { f.append(id); return; }
    f.append(h('a', { class: 'src', href: r.url, target: '_blank', rel: 'noopener', title: r.citation }, r.shortLabel));
  });
  if (paren) f.append(')');
  return f;
}
