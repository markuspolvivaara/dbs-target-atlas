import { boxHeight, BOX_PAD, LINE_H, type Circuit, type EdgeKind } from '../data/circuits';

/**
 * A circuit's schematic (data/circuits.ts): boxes for its nodes, arrows for its connections. A box or an arrow that
 * stands for a structure drawn in this section is a button: it selects that structure (its card opens). A box with
 * a dashed outline is not drawn here. Inhibitory connections end in a bar, the others in an arrowhead; dopamine's is
 * dotted; a connection whose sign the sources do not give is drawn lighter.
 */
const NS = 'http://www.w3.org/2000/svg';
let seq = 0;

function el(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/** the marker each kind ends in, and its class */
const END: Record<EdgeKind, 'arrow' | 'bar'> = { excitatory: 'arrow', inhibitory: 'bar', dopamine: 'arrow', plain: 'arrow' };
export const KIND_TEXT: Record<EdgeKind, string> = {
  excitatory: 'excitatory (glutamatergic)', inhibitory: 'inhibitory (GABAergic)', dopamine: 'dopamine', plain: 'connection (sign not shown)',
};

function markers(uid: string): SVGElement {
  const defs = el('defs', {});
  for (const tone of ['ink', 'muted'] as const) {
    const arrow = el('marker', { id: `${uid}-arrow-${tone}`, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, markerUnits: 'userSpaceOnUse', orient: 'auto' });
    arrow.append(el('path', { d: 'M0,0 L8,4 L0,8 z', class: `cx-mark ${tone}` }));
    defs.append(arrow);
  }
  const bar = el('marker', { id: `${uid}-bar-ink`, viewBox: '0 0 4 10', refX: 3, refY: 5, markerWidth: 4, markerHeight: 10, markerUnits: 'userSpaceOnUse', orient: 'auto' });
  bar.append(el('path', { d: 'M3,0 L3,10', class: 'cx-bar' }));
  defs.append(bar);
  return defs;
}
const tone = (k: EdgeKind) => (k === 'plain' || k === 'dopamine' ? 'muted' : 'ink');
const endOf = (uid: string, k: EdgeKind) => `url(#${uid}-${END[k]}-${END[k] === 'bar' ? 'ink' : tone(k)})`;

/** make an SVG group a button that runs `fn` (click, Enter, Space) */
function button(g: SVGElement, label: string, fn: () => void): void {
  g.setAttribute('tabindex', '0');
  g.setAttribute('role', 'button');
  g.setAttribute('aria-label', label);
  g.addEventListener('click', fn);
  g.addEventListener('keydown', (ev) => {
    const k = (ev as KeyboardEvent).key;
    if (k === 'Enter' || k === ' ') { ev.preventDefault(); fn(); }
  });
}

/**
 * The schematic. `select` opens a structure's card; `nameOf` gives a structure's name (for the buttons' labels);
 * `selected` is the structure whose card is open (its box is marked).
 */
export function circuitSvg(c: Circuit, select: (id: string) => void, nameOf: (id: string) => string | undefined, selected: string | null): SVGSVGElement {
  const uid = `cx${++seq}`;
  const svg = el('svg', { viewBox: `0 0 ${c.width} ${c.height}`, class: 'circuit-svg', role: 'group', 'aria-label': `Schematic: ${c.name}` }) as SVGSVGElement;
  svg.append(markers(uid));
  for (const e of c.edges) {
    const g = el('g', { class: `cx-edge ${e.kind}${e.links?.length ? ' linked' : ''}` });
    const target = e.links?.[0];
    const name = target ? nameOf(target) : undefined;
    g.append(el('title', {}, `${e.name} (${KIND_TEXT[e.kind]})${name ? `. Shows: ${name}` : ''}`));
    if (target) g.append(el('path', { d: e.d, class: 'cx-hit' }));
    g.append(el('path', { d: e.d, class: 'cx-line', 'marker-end': endOf(uid, e.kind) }));
    if (e.tag) g.append(el('text', { x: e.tag.x, y: e.tag.y, class: 'cx-tag', 'text-anchor': e.tag.anchor ?? 'middle' }, e.tag.text));
    if (target && name) button(g, `${e.name}: show ${name}`, () => select(target));
    svg.append(g);
  }
  for (const n of c.nodes) {
    const hgt = boxHeight(n), drawn = n.links.length > 0;
    const on = !!selected && n.links.includes(selected);
    const g = el('g', { class: `cx-node${drawn ? ' linked' : ' undrawn'}${on ? ' on' : ''}`, ...(n.token ? { style: `--c: var(--c-${n.token})` } : {}) });
    const label = n.label.join(' ');
    g.append(el('title', {}, drawn ? label : `${label} (not drawn in this section)`));
    g.append(el('rect', { x: n.x, y: n.y, width: n.w, height: hgt, rx: 6 }));
    n.label.forEach((line, i) => g.append(el('text', { x: n.x + n.w / 2, y: n.y + BOX_PAD / 2 + LINE_H * (i + 0.5) + 4, 'text-anchor': 'middle' }, line)));
    const name = drawn ? nameOf(n.links[0]) : undefined;
    if (drawn && name) button(g, `${label}: show ${name}`, () => select(n.links[0]));
    svg.append(g);
  }
  return svg;
}

/** A legend for the kinds of connection the schematic uses. */
export function circuitLegend(c: Circuit): HTMLElement {
  const kinds = (['excitatory', 'inhibitory', 'dopamine', 'plain'] as EdgeKind[]).filter((k) => c.edges.some((e) => e.kind === k));
  const wrap = document.createElement('p');
  wrap.className = 'cx-legend';
  for (const k of kinds) {
    const item = document.createElement('span');
    const uid = `cx${++seq}`;
    const s = el('svg', { viewBox: '0 0 30 10', width: 30, height: 10, 'aria-hidden': 'true', class: `cx-swatch cx-edge ${k}` });
    s.append(markers(uid), el('path', { d: 'M1,5 L27,5', class: 'cx-line', 'marker-end': endOf(uid, k) }));
    item.append(s, ` ${KIND_TEXT[k]}`);
    wrap.append(item);
  }
  return wrap;
}
