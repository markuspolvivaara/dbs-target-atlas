import { h } from './h';

/**
 * The help every section shares: the event its toolbar's "?" button sends (the page's script owns the dialog), and the
 * lines on the mouse and touch that every section's dialog shows under its shortcuts.
 */
export const HELP_EVENT = 'atlas:help';

export function requestHelp(): void {
  window.dispatchEvent(new Event(HELP_EVENT));
}

/** Open the page's help dialog when the toolbar's button asks for it. */
export function bindHelp(help: HTMLDialogElement): void {
  window.addEventListener(HELP_EVENT, () => { if (!help.open) help.showModal(); });
}

/** What the mouse and touch do in the 3D view (the same in every section). `tap` names what a tap or a
 * click selects there. */
export function viewHelp(tap: string): HTMLElement[] {
  return [
    h('h3', {}, 'In the 3D view'),
    h('dl', {},
      h('dt', {}, 'Mouse'), h('dd', {}, `Drag to turn the view, turn the wheel to zoom, drag with the right button (or with Ctrl, Shift or ⌘ held) to move it. Click ${tap} for its card; point at it for its name.`),
      h('dt', {}, 'Touch'), h('dd', {}, `One finger turns the view, two fingers pinch to zoom and drag to move it. Tap ${tap} for its card.`),
      h('dt', {}, 'Keyboard'), h('dd', {}, 'With the 3D view in focus (Tab to it, or click it), the arrow keys turn the view, Shift with an arrow key moves it, and + and − zoom. Where a view has its own use for an arrow key (the spine’s levels, the endoscope), that comes first. In the toolbar the arrow keys move between its buttons.'),
      h('dt', {}, h('kbd', {}, '0')), h('dd', {}, 'Reset view: the camera back to where this view opens.')),
  ];
}
