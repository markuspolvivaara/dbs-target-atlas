import type { Axis } from '../state';
import type { ViewState } from '../viewer/scene';
import { h } from './h';
import { fmtMm } from './widgets';

/** Pieces of the 3D stage shared by every section: axis gizmo, name labels, slices panel, mobile sheet. */

const NS = 'http://www.w3.org/2000/svg';

export type ScreenAxes = Record<'R' | 'A' | 'S', { x: number; y: number; toward: boolean }>;

/** R/L, A/P, S/I letters showing how the patient axes lie on screen (from Viewer.axesScreen()). */
export function drawGizmo(svg: SVGSVGElement, ax: ScreenAxes): void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const items: { pos: string; neg: string; d: { x: number; y: number; toward: boolean } }[] = [
    { pos: 'R', neg: 'L', d: ax.R }, { pos: 'A', neg: 'P', d: ax.A }, { pos: 'S', neg: 'I', d: ax.S },
  ];
  for (const it of items) {
    const len = Math.hypot(it.d.x, it.d.y);
    for (const [letter, sgn] of [[it.pos, 1], [it.neg, -1]] as [string, number][]) {
      if (len < 0.2) {
        // axis points at the viewer: show the near letter in the centre
        if ((sgn === 1) !== it.d.toward) continue;
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', '0'); t.setAttribute('y', '4'); t.setAttribute('class', 'gz-c');
        t.textContent = letter; svg.append(t);
        continue;
      }
      const x = sgn * it.d.x * 26, y = sgn * it.d.y * 26;
      if (sgn === 1) {
        const l = document.createElementNS(NS, 'line');
        l.setAttribute('x1', String(-x)); l.setAttribute('y1', String(-y)); l.setAttribute('x2', String(x)); l.setAttribute('y2', String(y));
        svg.append(l);
      }
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', String(x * 1.25)); t.setAttribute('y', String(y * 1.25 + 4));
      t.setAttribute('class', letter === 'L' || letter === 'R' ? 'gz-lr' : '');
      t.textContent = letter;
      svg.append(t);
    }
  }
}

export interface LabelItem { id: string; text: string; ax: number; ay: number; cls: string }

/**
 * Lay out name labels with leader lines. Labels sit a little away from their anchor, pushed
 * outwards from the view centre, and are nudged apart so they do not overlap.
 */
export function layoutLabels(items: LabelItem[], W: number, H: number, labels: HTMLElement, leaders: SVGSVGElement): void {
  const placed: { x: number; y: number; w: number; h: number; left: boolean; ax: number; ay: number }[] = [];
  for (const it of items) {
    let dx = it.ax - W / 2, dy = it.ay - H / 2;
    const len = Math.hypot(dx, dy);
    if (len < 24) { dx = 0.7; dy = -0.7; } else { dx /= len; dy /= len; }
    const w = Math.min(220, it.text.length * 6.6 + 14), hgt = 20;
    const left = dx < 0; // label extends leftwards from its attach point
    let x = it.ax + dx * 44, y = it.ay + dy * 34 - hgt / 2;
    const box = () => ({ x0: left ? x - w : x, x1: left ? x : x + w, y0: y, y1: y + hgt });
    for (let guard = 0; guard < 12; guard++) {
      const b = box();
      const hit = placed.find((q) => b.x0 < q.x + q.w && b.x1 > q.x && b.y0 < q.y + q.h && b.y1 > q.y);
      if (!hit) break;
      y = dy >= 0 ? hit.y + hit.h + 4 : hit.y - hgt - 4;
    }
    y = Math.max(46, Math.min(H - hgt - 4, y));
    const b = box();
    placed.push({ x: b.x0, y: b.y0, w, h: hgt, left, ax: it.ax, ay: it.ay });
  }
  while (labels.children.length < items.length) labels.append(h('span', {}));
  [...labels.children].forEach((el, i) => {
    const e = el as HTMLElement;
    const it = items[i], q = placed[i];
    if (!it) { e.hidden = true; return; }
    e.hidden = false;
    e.className = it.cls;
    e.textContent = it.text;
    e.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(q.y)}px)`;
    e.style.maxWidth = `${q.w + 20}px`;
  });
  while (leaders.firstChild) leaders.removeChild(leaders.firstChild);
  placed.forEach((q) => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(q.ax)); l.setAttribute('y1', String(q.ay));
    l.setAttribute('x2', String(q.left ? q.x + q.w : q.x)); l.setAttribute('y2', String(q.y + q.h / 2));
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', String(q.ax)); c.setAttribute('cy', String(q.ay)); c.setAttribute('r', '2');
    leaders.append(l, c);
  });
}

/** Swipe up / down on the sheet handle (phones). */
export function bindSheetDrag(handle: HTMLElement, set: (st: 'peek' | 'full') => void): void {
  let y0 = 0, dragging = false;
  handle.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; dragging = true; }, { passive: true });
  handle.addEventListener('touchend', (e) => {
    if (!dragging) return;
    dragging = false;
    const dy = e.changedTouches[0].clientY - y0;
    if (dy < -30) set('full');
    else if (dy > 30) set('peek');
  });
}

// ---------------------------------------------------------------- slices panel
export const SLICE_AXES: [Axis, string, [number, number], string][] = [
  ['axial', 'Axial', [-60, 85], 'z'],
  ['coronal', 'Coronal', [-115, 75], 'y'],
  ['sagittal', 'Sagittal', [-75, 75], 'x'],
];

type ViewUpdate<S extends ViewState> = (fn: (s: S) => void) => void;

/** Build the slices tab once: cut-away side, sequence, and one slider per plane. */
export function buildSlicesPane<S extends ViewState>(pane: HTMLElement, update: ViewUpdate<S>, notes: { cut: string; seq: string; footer: string }): void {
  pane.append(h('h3', {}, 'Clip planes with T1 slices'),
    h('fieldset', { class: 'seg-field', 'data-k': 'cutside' }, h('legend', {}, 'Cut away'),
      ...([['none', 'Nothing'], ['L', 'Patient’s left half'], ['R', 'Patient’s right half']] as const).map(([v, label]) =>
        h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'cutside', value: v, onchange: () => update((st) => { st.cutSide = v; }) }), label))),
    h('p', { class: 'aside' }, notes.cut),
    h('fieldset', { class: 'seg-field', 'data-k': 'seq' }, h('legend', {}, 'Image'),
      ...([['t1', 'T1'], ['t2', 'T2'], ['pd', 'PD']] as const).map(([v, label]) =>
        h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'sliceseq', value: v, onchange: () => update((st) => { st.sliceSeq = v; }) }), label))),
    h('p', { class: 'aside' }, notes.seq));
  for (const [axis, label, [lo, hi], coord] of SLICE_AXES) {
    const out = h('output', { class: 'mm' });
    pane.append(h('fieldset', { class: 'slice', 'data-axis': axis },
      h('legend', {}, label),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-k': 'on', onchange: (e: Event) => update((st) => { st.clip[axis].on = (e.target as HTMLInputElement).checked; }) }), `Show ${label.toLowerCase()} slice`),
      h('label', { class: 'range wide' }, h('span', {}, `${coord} = `, out),
        h('input', { type: 'range', min: lo, max: hi, step: 0.5, 'data-k': 'mm', oninput: (e: Event) => update((st) => { st.clip[axis].mm = parseFloat((e.target as HTMLInputElement).value); }) })),
    ));
  }
  pane.append(h('p', { class: 'aside' }, notes.footer), h('p', { class: 'aside slice-status' }));
}

export function syncSlicesPane(pane: HTMLElement, s: ViewState): void {
  pane.querySelectorAll<HTMLInputElement>('input[name=cutside]').forEach((r) => { r.checked = r.value === s.cutSide; });
  pane.querySelectorAll<HTMLInputElement>('input[name=sliceseq]').forEach((r) => { r.checked = r.value === s.sliceSeq; });
  for (const [axis] of SLICE_AXES) {
    const f = pane.querySelector(`[data-axis="${axis}"]`)!;
    const c = s.clip[axis];
    (f.querySelector('[data-k=on]') as HTMLInputElement).checked = c.on;
    (f.querySelector('[data-k=mm]') as HTMLInputElement).value = String(c.mm);
    (f.querySelector('output') as HTMLOutputElement).textContent = `${fmtMm(c.mm)} mm`;
    (f.querySelector('[data-k=mm]') as HTMLInputElement).disabled = !c.on;
  }
}
