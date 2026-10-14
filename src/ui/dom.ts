import { REF } from '../data';

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)> & { style?: string };

/** Tiny hyperscript helper: h('button', {class: 'chip', onclick: fn}, 'Label') */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v as EventListener);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** "(Akram 2017, Rajamani 2024)" with each label linking to its source. */
export function refLinks(ids: string[], paren = true): DocumentFragment {
  const f = document.createDocumentFragment();
  if (!ids.length) return f;
  if (paren) f.append('(');
  ids.forEach((id, i) => {
    const r = REF.get(id);
    if (i) f.append(', ');
    if (!r) { f.append(id); return; }
    f.append(h('a', { class: 'src', href: r.url, target: '_blank', rel: 'noopener', title: r.citation }, r.shortLabel));
  });
  if (paren) f.append(')');
  return f;
}

export function fmtMm(n: number): string {
  const s = (Math.round(n * 10) / 10).toFixed(1);
  return s.replace('-', '−');
}

export function clear(el: Element): void { while (el.firstChild) el.removeChild(el.firstChild); }

export function chips<T extends string>(
  items: [T, string][], current: T | null, onPick: (v: T) => void, opts: { label: string; cls?: string },
): HTMLElement {
  const g = h('div', { class: `chips ${opts.cls ?? ''}`, role: 'group', 'aria-label': opts.label });
  for (const [v, label] of items) {
    g.append(h('button', {
      type: 'button', class: 'chip', 'aria-pressed': v === current ? 'true' : 'false', 'data-v': v,
      onclick: () => onPick(v),
    }, label));
  }
  return g;
}
