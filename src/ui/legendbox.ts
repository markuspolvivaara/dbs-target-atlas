/**
 * The legend's box, shared by every section (the audit's UI-14: open, the legend lay on the model). Two places, a
 * choice in View options kept in this browser:
 * - on the view (the default): a box at the stage's lower left that can be minimised from its title (remembered), and
 *   while it is open on a desktop the picture's centre moves right by half its width, so the model's middle is in the
 *   middle of what it leaves free;
 * - beside the view, on a wide screen: a column left of the stage, outside the picture; the stage is narrower and the
 *   camera frames what is left. Narrower windows keep the legend on the view.
 */
import { h } from './h';
import { onViewPrefs, setViewPrefs, viewPrefs } from '../viewer/viewprefs';

/** Where the legend starts open (as it always has), and where the minimised state is remembered. */
export const LEGEND_OPEN_MEDIA = '(min-width: 900px) and (min-height: 700px)';
/** Where the legend may stand beside the view. */
export const LEGEND_DOCK_MEDIA = '(min-width: 1200px)';

interface Shiftable { setViewShift(px: number): void }

/**
 * The legend's `<details>` holding `legend` (the list the section fills). `stage` is the section's stage, inside the
 * page's `.atlas` grid; `viewer` gives the 3D view once it exists. Put the box in the stage's bottom row as before;
 * it moves itself into a column beside the stage when docked, and back.
 */
export function legendBox(legend: HTMLElement, stage: HTMLElement, viewer: () => Shiftable | undefined): HTMLDetailsElement {
  const openMq = window.matchMedia(LEGEND_OPEN_MEDIA);
  const dockMq = window.matchMedia(LEGEND_DOCK_MEDIA);
  const box = h('details', { class: 'legend-box' },
    h('summary', { title: 'Minimise or show the legend' }, 'Legend',
      h('span', { class: 'lg-min', 'aria-hidden': 'true' }, 'Minimise')),
    legend) as HTMLDetailsElement;
  box.open = openMq.matches && !viewPrefs().legendShut;

  let home: { parent: Node; next: Node | null } | null = null;
  let dock: HTMLElement | null = null;

  const layout = () => {
    const atlas = stage.parentElement;
    if (!atlas || !box.isConnected) return;
    const docked = viewPrefs().legend === 'dock' && dockMq.matches;
    if (docked) {
      if (!home && box.parentNode !== dock) home = { parent: box.parentNode!, next: box.nextSibling };
      if (!dock) dock = h('div', { class: 'legend-dock' });
      if (dock.parentNode !== atlas) atlas.insertBefore(dock, stage);
      if (box.parentNode !== dock) dock.append(box);
      dock.classList.toggle('shut', !box.open);
    } else if (dock) {
      if (home) home.parent.insertBefore(box, home.next?.parentNode === home.parent ? home.next : null);
      dock.remove();
      dock = null;
    }
    atlas.classList.toggle('legend-docked', docked);
    const floatingOpen = !docked && box.open && openMq.matches;
    viewer()?.setViewShift(floatingOpen ? box.getBoundingClientRect().width / 2 : 0);
  };

  box.addEventListener('toggle', () => {
    // (remembered on a desktop; a change that came from the preference itself matches it already and is not written)
    if (openMq.matches && viewPrefs().legendShut === box.open) setViewPrefs({ legendShut: !box.open });
    layout();
  });
  onViewPrefs((p) => {
    // (View options, or another legend on this page: follow a changed minimised state on a desktop)
    if (openMq.matches && box.open === p.legendShut) box.open = !p.legendShut;
    layout();
  });
  openMq.addEventListener('change', layout);
  dockMq.addEventListener('change', layout);
  // the box's width changes with its rows, and it is in the page only after this returns
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => layout()).observe(box);
  requestAnimationFrame(layout);
  return box;
}
