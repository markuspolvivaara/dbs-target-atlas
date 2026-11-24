import { fmtMm } from './widgets';

/** A landmark as the read-out names it: its name, and its side where it has one. */
export function landmarkLabel(lm: { name: string; side: 'L' | 'R' | 'M' }): string {
  return lm.side === 'M' ? lm.name : `${lm.name} (${lm.side === 'R' ? 'right' : 'left'})`;
}

/**
 * Where a point lies from a landmark, in words: right or left, in front or behind, above or below (the patient's
 * directions, as the frames' x, y and z run), and the straight distance. Coordinates in mm, right-anterior-superior.
 */
export function offsetWords(p: { x: number; y: number; z: number }, from: readonly [number, number, number]): string {
  const d = [p.x - from[0], p.y - from[1], p.z - from[2]];
  const part = (v: number, plus: string, minus: string) => (Math.abs(v) < 0.05 ? `0 mm ${plus === 'right' ? 'across' : plus === 'in front' ? 'front to back' : 'up or down'}`
    : `${fmtMm(Math.abs(v))} mm ${v > 0 ? plus : minus}`);
  const straight = Math.hypot(d[0], d[1], d[2]);
  return `${part(d[0], 'right', 'left')} · ${part(d[1], 'in front', 'behind')} · ${part(d[2], 'above', 'below')} · ${fmtMm(straight)} mm in a straight line`;
}
