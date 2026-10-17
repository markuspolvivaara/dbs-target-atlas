/** Small data-free UI pieces shared by every section. */
import { h } from './h';

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
