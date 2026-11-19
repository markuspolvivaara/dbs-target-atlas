import type { ViewState } from '../viewer/scene';
import { onViewPrefs, setViewPrefs, viewPrefs } from '../viewer/viewprefs';
import { h } from './h';

/**
 * The selected structure's bar (the site audit's UI-21; the roadmap, section 3: isolate, and per-structure
 * transparency), at the foot of every section's 3D view while a structure is selected: "Show only this" hides every
 * other structure drawn (pressed again, it brings back what it hid), "Fade the rest" turns the viewer's setting of that
 * name on or off, and a slider sets the structure's own opacity, which the view's link keeps (`sop`).
 */

export interface BarViewer {
  shownIds(): string[];
  nameOf(id: string): string | null;
  onApply(f: (s: ViewState) => void): void;
}

export function structureBar(viewer: BarViewer, stage: HTMLElement, update: (fn: (s: ViewState) => void) => void): HTMLElement {
  const name = h('span', { class: 'sbar-name' });
  const only = h('button', { type: 'button', class: 'tbtn', 'aria-pressed': 'false', title: 'Hide every other structure drawn' }, 'Show only this') as HTMLButtonElement;
  const fade = h('button', { type: 'button', class: 'tbtn', 'aria-pressed': 'false', title: 'Fade every other structure (the viewer setting of that name, in Settings)' }, 'Fade the rest') as HTMLButtonElement;
  const range = h('input', { type: 'range', min: '0', max: '100', step: '5', 'aria-label': 'Opacity of the selected structure' }) as HTMLInputElement;
  const out = h('output', { class: 'sbar-val' });
  const bar = h('div', { class: 'sbar', role: 'group', 'aria-label': 'The selected structure', hidden: true },
    name, h('div', { class: 'sbar-tools' }, only, fade, h('label', { class: 'sbar-op' }, h('span', {}, 'Opacity'), range, out)));
  let s: ViewState | null = null;
  // what "Show only this" hid, for whom: pressed again, it shows those again (and nothing the reader hid before)
  let only4: string | null = null;
  let hid: string[] = [];
  const isOnly = () => !!s && only4 === s.sel && hid.length > 0 && hid.every((x) => s!.hidden.includes(x));

  function sync(next: ViewState): void {
    s = next;
    const id = s.sel;
    const label = id ? viewer.nameOf(id) : null;
    bar.hidden = !label;
    if (!label || !id) return;
    name.textContent = label;
    only.setAttribute('aria-pressed', String(isOnly()));
    only.textContent = isOnly() ? 'Show all again' : 'Show only this';
    fade.setAttribute('aria-pressed', String(viewPrefs().fadeOthers));
    const v = Math.round((s.opacity?.[id] ?? 1) * 100);
    if (document.activeElement !== range) range.value = String(v);
    out.textContent = `${v}%`;
  }
  only.addEventListener('click', () => {
    if (!s?.sel) return;
    if (isOnly()) {
      const back = new Set(hid);
      only4 = null; hid = [];
      update((st) => { st.hidden = st.hidden.filter((x) => !back.has(x)); });
      return;
    }
    const sel = s.sel;
    hid = viewer.shownIds().filter((x) => x !== sel && !s!.hidden.includes(x));
    only4 = sel;
    update((st) => { st.hidden = [...st.hidden, ...hid]; });
  });
  fade.addEventListener('click', () => { setViewPrefs({ fadeOthers: !viewPrefs().fadeOthers }); });
  onViewPrefs(() => { if (s) sync(s); });
  range.addEventListener('input', () => {
    const id = s?.sel;
    if (!id) return;
    const v = Number(range.value) / 100;
    out.textContent = `${range.value}%`;
    update((st) => {
      const o = { ...(st.opacity ?? {}) };
      if (v >= 0.995) delete o[id]; else o[id] = v;
      if (Object.keys(o).length) st.opacity = o; else delete st.opacity;
    });
  });
  // (keys typed into the slider are the slider's, not the page's shortcuts)
  range.addEventListener('keydown', (e) => e.stopPropagation());
  viewer.onApply(sync);
  const bottom = stage.querySelector('.stage-bottom');
  if (bottom) bottom.prepend(bar); else stage.append(bar);
  return bar;
}
