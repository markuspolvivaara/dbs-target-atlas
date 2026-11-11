import type { Axis } from '../state';
import type { ViewState } from '../viewer/scene';
import { h } from './h';
import { requestHelp } from './help';
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

/**
 * The stage's status line: what is loading (the viewer's status event), and under it, for as long as it is true, which
 * structures of the view could not be loaded, with a button to try again (the viewer's loadFailed event). A view with a
 * part missing must not pass for a complete one.
 */
export function stageStatus(retry: () => void): { el: HTMLElement; set(text: string | null): void; failed(names: string[]): void } {
  const line = h('div', { class: 'status-line', role: 'status', 'aria-live': 'polite', hidden: true });
  const what = h('span', {});
  const again = h('button', { type: 'button', class: 'btn btn-small', onclick: () => retry() }, 'Retry');
  const fail = h('div', { class: 'status-failed', role: 'alert', hidden: true }, what, again);
  const el = h('div', { class: 'status' }, line, fail);
  const sync = () => { el.hidden = line.hidden && fail.hidden; };
  sync();
  return {
    el,
    set(text) { line.hidden = !text; line.textContent = text ?? ''; sync(); },
    failed(names) {
      fail.hidden = !names.length;
      // (names hold commas of their own: "STN, sensorimotor zone")
      const shown = names.slice(0, 3).join('; ') + (names.length > 3 ? `; and ${names.length - 3} more` : '');
      what.textContent = names.length ? `${names.length === 1 ? 'One structure' : `${names.length} structures`} of this view could not be loaded: ${shown}. ` : '';
      sync();
    },
  };
}

/** The toolbar's last group, the same in every section: the camera back to where the view opens (key 0), and the help
 * with the mouse, touch and keyboard controls (key ?), which until now only that key opened. */
export function viewButtons(reset: () => void): HTMLElement {
  return h('div', { class: 'tgroup' },
    h('button', { type: 'button', class: 'tbtn', 'data-reset-view': '', title: 'Reset view: the camera back to where this view opens (0)', 'aria-label': 'Reset view', onclick: () => reset() },
      h('span', { class: 'long' }, 'Reset view'), h('span', { class: 'short', 'aria-hidden': 'true' }, 'Reset')),
    h('button', { type: 'button', class: 'tbtn help-btn', title: 'Help: mouse, touch and keyboard controls (?)', 'aria-label': 'Help: mouse, touch and keyboard controls', 'aria-haspopup': 'dialog', onclick: () => requestHelp() }, '?'));
}

/** Bring the card of the structure just selected to the top of the panel's scrolling pane: it is drawn after the
 * view's lists, thousands of pixels down in the larger sections, and on a phone below the part of the sheet that
 * shows. Called when the selection changes; waits for the panel to be drawn. */
export function revealCard(panel: HTMLElement): void {
  requestAnimationFrame(() => {
    const card = panel.querySelector<HTMLElement>('.card.sel');
    const pane = card?.closest<HTMLElement>('.pane');
    if (!card || !pane || pane.hidden) return;
    const top = card.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 8;
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    pane.scrollTo({ top: Math.max(0, top), behavior: calm ? 'auto' : 'smooth' });
  });
}

/**
 * A row that scrolls sideways on a narrow screen (the page tabs, the toolbar, the panel's tabs) shows where more of it
 * lies: its edge fades on that side (styles.css, by data-more). Without it nothing says that the row scrolls.
 */
export function scrollHint(el: HTMLElement): void {
  const sync = () => {
    const left = el.scrollLeft > 4, right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    el.dataset.more = left && right ? 'both' : left ? 'left' : right ? 'right' : 'none';
  };
  el.addEventListener('scroll', sync, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(sync).observe(el);
  window.addEventListener('resize', sync);
  requestAnimationFrame(sync);
}

export interface LabelItem { id: string; text: string; ax: number; ay: number; cls: string }

interface Box { x: number; y: number; w: number; h: number }
/** What the page draws over the stage (toolbar, legend, read-out, compass, status, the angiogram's bar): a label under
 * one of them cannot be read. Measured at most twice a second per stage. */
const OVERLAYS = '.tgroup, .legend-box, .readout-box, .gizmo, .status-line, .status-failed, .dsa-bar';
const overlayCache = new WeakMap<Element, { t: number; boxes: Box[] }>();
function overlayBoxes(stage: Element | null): Box[] {
  if (!stage) return [];
  const now = performance.now();
  const hit = overlayCache.get(stage);
  if (hit && now - hit.t < 500) return hit.boxes;
  const sr = stage.getBoundingClientRect();
  const boxes = [...stage.querySelectorAll<HTMLElement>(OVERLAYS)].map((e) => e.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0).map((r) => ({ x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height }));
  overlayCache.set(stage, { t: now, boxes });
  return boxes;
}

/** Labels are laid out when a frame is drawn. When one of the page's overlays on the stage changes its size (the legend
 * is filled or opened, the toolbar wraps, a status appears) they must be laid out again: the measured boxes are
 * forgotten and a frame is asked for. */
export function watchOverlays(stage: HTMLElement, redraw: () => void): void {
  if (typeof ResizeObserver !== 'function') return;
  const ro = new ResizeObserver(() => { overlayCache.delete(stage); redraw(); });
  for (const e of stage.querySelectorAll(OVERLAYS)) ro.observe(e);
}

/**
 * Lay out name labels with leader lines. Labels sit a little away from their anchor, pushed outwards from the view
 * centre, and are nudged apart so they do not overlap each other or lie under the page's own overlays. A label that
 * still finds no free place is left out rather than drawn over another (on a phone most of a crowded view's labels),
 * except those of `keep` (the selected and the pointed-at structure), which are placed first and always drawn.
 */
export function layoutLabels(items: LabelItem[], W: number, H: number, labels: HTMLElement, leaders: SVGSVGElement, keep: (string | null | undefined)[] = []): void {
  const kept = new Set(keep.filter((x): x is string => !!x));
  const blocked = overlayBoxes(labels.parentElement);
  const placed: { it: LabelItem; x: number; y: number; w: number; h: number; left: boolean }[] = [];
  const over = (b: { x0: number; x1: number; y0: number; y1: number }, q: Box) => b.x0 < q.x + q.w && b.x1 > q.x && b.y0 < q.y + q.h && b.y1 > q.y;
  for (const it of [...items.filter((i) => kept.has(i.id)), ...items.filter((i) => !kept.has(i.id))]) {
    let dx = it.ax - W / 2, dy = it.ay - H / 2;
    const len = Math.hypot(dx, dy);
    if (len < 24) { dx = 0.7; dy = -0.7; } else { dx /= len; dy /= len; }
    const w = Math.min(220, it.text.length * 7.2 + 14, Math.max(60, W - 8)), hgt = 21;
    const left = dx < 0; // label extends leftwards from its attach point
    let x = it.ax + dx * 44, y = it.ay + dy * 34 - hgt / 2;
    // inside the stage: a label cut by its edge cannot be read
    x = left ? Math.max(w + 4, Math.min(W - 4, x)) : Math.max(4, Math.min(W - w - 4, x));
    const box = () => ({ x0: left ? x - w : x, x1: left ? x : x + w, y0: y, y1: y + hgt });
    const hitOf = () => { const b = box(); return placed.find((q) => over(b, q)) ?? blocked.find((q) => over(b, q)); };
    for (let guard = 0; guard < 12; guard++) {
      const hit = hitOf();
      if (!hit) break;
      y = dy >= 0 ? hit.y + hit.h + 4 : hit.y - hgt - 4;
    }
    y = Math.max(4, Math.min(H - hgt - 4, y));
    if (!kept.has(it.id) && hitOf()) continue;
    const b = box();
    placed.push({ it, x: b.x0, y: b.y0, w, h: hgt, left });
  }
  while (labels.children.length < placed.length) labels.append(h('span', {}));
  [...labels.children].forEach((el, i) => {
    const e = el as HTMLElement;
    const q = placed[i];
    if (!q) { e.hidden = true; return; }
    e.hidden = false;
    e.className = q.it.cls;
    e.textContent = q.it.text;
    e.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(q.y)}px)`;
    e.style.maxWidth = `${q.w + 20}px`;
  });
  while (leaders.firstChild) leaders.removeChild(leaders.firstChild);
  placed.forEach((q) => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(q.it.ax)); l.setAttribute('y1', String(q.it.ay));
    l.setAttribute('x2', String(q.left ? q.x + q.w : q.x)); l.setAttribute('y2', String(q.y + q.h / 2));
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', String(q.it.ax)); c.setAttribute('cy', String(q.it.ay)); c.setAttribute('r', '2');
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
