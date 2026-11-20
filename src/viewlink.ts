import type { CameraPreset } from './data/schema';
import type { Axis, V3 } from './state';
import { okCamera, type ViewState } from './viewer/scene';

/**
 * The parts of a view's link (`#/atlas?g=…&h=B&c=…&ly=…`) that the sections' state modules write and read the same way:
 * the page, the side, the camera, the layers, the slice planes and the hidden structures. Each module had its own copy
 * (the site audit's P1-14). What a section writes its own way stays in its module; the order of a link's parameters
 * is each module's, so these write one parameter each.
 */

/** a millimetre value in a link, to a tenth */
export const r1 = (n: number): number => Math.round(n * 10) / 10;

/** A hash's page (one of `pages`; anything else is the atlas, which every section has) and its parameters. */
export function readHash<P extends string>(hash: string, pages: readonly P[]): { page: P; p: URLSearchParams } {
  const m = hash.replace(/^#\/?/, '').split('?');
  return { page: pages.includes(m[0] as P) ? (m[0] as P) : ('atlas' as P), p: new URLSearchParams(m[1] ?? '') };
}

/** The hash of a page and its parameters (with none, the bare page link). */
export function hashOf(page: string, p: URLSearchParams): string {
  const q = p.toString();
  return `#/${page}${q ? '?' + q : ''}`;
}

/** The side shown: `h=L`, `R` or `B` (both), always written (the DBS section writes its own: no `h` for both). */
export function encodeHemi(p: URLSearchParams, hemi: ViewState['hemi']): void {
  p.set('h', hemi === 'both' ? 'B' : hemi);
}

/** ... read back; any other value leaves the state's own. */
export function decodeHemi(p: URLSearchParams, s: ViewState): void {
  const h = p.get('h');
  if (h === 'L' || h === 'R') s.hemi = h; else if (h === 'B') s.hemi = 'both';
}

/** The camera: `c=` a preset's name, or six numbers (its position, then its target). */
export function encodeCamera(p: URLSearchParams, cam: ViewState['cam']): void {
  if (cam.pos && cam.tgt) p.set('c', [...cam.pos, ...cam.tgt].map(r1).join(','));
  else if (cam.preset) p.set('c', cam.preset);
}

/** ... read back: six sound numbers (see okCamera), or one of the section's `presets`; anything else leaves the state's. */
export function decodeCamera(p: URLSearchParams, s: ViewState, presets: readonly string[]): void {
  const c = p.get('c');
  if (!c) return;
  const parts = c.split(',').map(Number);
  if (okCamera(parts)) s.cam = { preset: null, pos: parts.slice(0, 3) as V3, tgt: parts.slice(3) as V3 };
  else if (presets.includes(c)) s.cam = { preset: c as CameraPreset };
}

/** A section's layers in its links: each one's letter (`[layer, letter]`). */
export type LayerCodes = readonly [keyof ViewState['layers'], string][];

/** The layers: `ly=n1,t1,c0:0.50`, each layer's letter, 1 or 0 for on or off, and its opacity where it is not 1;
 * written when it differs from the section's defaults written the same way (the spine's viscera default to 0.6). */
export function encodeLayers(p: URLSearchParams, layers: ViewState['layers'], defaults: ViewState['layers'], codes: LayerCodes): void {
  const code = (ls: ViewState['layers']) => codes.map(([k, c]) => `${c}${ls[k]!.on ? 1 : 0}${ls[k]!.opacity !== 1 ? ':' + ls[k]!.opacity.toFixed(2) : ''}`).join(',');
  if (code(layers) !== code(defaults)) p.set('ly', code(layers));
}

/** ... read back: each layer the link names (an opacity that is not a number is 1, others are held to 0 to 1). */
export function decodeLayers(p: URLSearchParams, layers: ViewState['layers'], codes: LayerCodes): void {
  const ly = p.get('ly');
  if (ly) for (const tok of ly.split(',')) {
    const e = codes.find(([, code]) => code === tok[0]);
    if (!e) continue;
    const [on, op] = tok.slice(1).split(':');
    const o = op !== undefined && Number.isFinite(parseFloat(op)) ? parseFloat(op) : 1;
    layers[e[0]] = { on: on === '1', opacity: Math.min(1, Math.max(0, o)) };
  }
}

/** the slice planes' parameters */
export const CLIP_PARAMS: [Axis, string][] = [['axial', 'ax'], ['coronal', 'co'], ['sagittal', 'sa']];

/** The slice planes shown: `ax=-4` (mm), and `co`, `sa`. */
export function encodeClip(p: URLSearchParams, clip: ViewState['clip']): void {
  for (const [a, code] of CLIP_PARAMS) if (clip[a].on) p.set(code, `${r1(clip[a].mm)}`);
}

/** ... read back: a plane the link names is shown, at the state's own position where its value is not a number. (The
 * cortex section reads its own: there a value that is not a number leaves the plane off.) */
export function decodeClip(p: URLSearchParams, clip: ViewState['clip']): void {
  for (const [a, code] of CLIP_PARAMS) {
    const v = p.get(code);
    if (v !== null) clip[a] = { on: true, mm: Number.isFinite(parseFloat(v)) ? parseFloat(v) : clip[a].mm };
  }
}

/** The structures hidden from the legend: `hid=id,id`. */
export function encodeHidden(p: URLSearchParams, hidden: string[]): void {
  if (hidden.length) p.set('hid', hidden.join(','));
}

/** ... read back: only ids made of lower-case letters, digits and `_:-`. */
export function decodeHidden(p: URLSearchParams): string[] {
  return (p.get('hid') ?? '').split(',').filter((x) => /^[a-z0-9_:-]+$/.test(x));
}
