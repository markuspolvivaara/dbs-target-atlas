/** DOM helpers with no data dependencies (safe for the light home page). */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)> & { style?: string };

/** Tiny hyperscript helper: h('button', {class: 'chip', onclick: fn}, 'Label') */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v as EventListener);
    // (a style through the CSS object model, which a strict content security policy allows; a style attribute it
    // drops: the audit's P2S-20)
    else if (k === 'style') el.style.cssText = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** "Tap" on a touch screen, where there is nothing to point with or click, "Point at" / "Click" otherwise (the audit's
 * UI-27: the read-out said "Point at a structure" on phones). */
export const touch = (): boolean => window.matchMedia('(pointer: coarse)').matches;
export const pointAt = (): string => (touch() ? 'Tap' : 'Point at');

/** Say `text` to a screen reader (a polite live region of the page's own; the audit's UI-13: a copied link was shown
 * on the button only, which a screen reader does not read out). */
export function announce(text: string): void {
  let live = document.getElementById('announcer');
  if (!live) {
    live = h('div', { id: 'announcer', class: 'vh', 'aria-live': 'polite', role: 'status' });
    document.body.append(live);
  }
  live.textContent = '';
  setTimeout(() => { live!.textContent = text; }, 50);
}
