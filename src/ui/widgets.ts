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

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Show/hide toggle icon: an open eye when shown, the eye struck through when hidden. */
export function eyeIcon(shown: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'eye-icon');
  svg.setAttribute('aria-hidden', 'true');
  const add = (tag: string, attrs: Record<string, string>) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  };
  add('path', { d: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' });
  add('circle', { cx: '12', cy: '12', r: '3' });
  if (!shown) add('line', { x1: '4', y1: '20', x2: '20', y2: '4', class: 'slash' });
  return svg;
}
