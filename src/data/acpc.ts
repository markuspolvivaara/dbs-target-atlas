import coords from './generated/coordinates.json';
import { AcpcSchema } from './schema';

/**
 * Approximate MNI -> AC-PC conversion in the template brain.
 *
 * Method: Lead-DBS tools/acpc2mni/ea_mni2acpc.m. The template fiducials AC, PC
 * and a mid-sagittal point (MSP) define an orthonormal frame:
 *   x = normalise((MSP - AC) x (PC - AC))      lateral, right positive
 *   y = -normalise(PC - AC)                     anterior positive
 *   z = normalise(x x y)                        superior positive
 * and a point p maps to [x y z]^-1 (p - origin), with origin = MCP = (AC+PC)/2.
 * Lead-DBS first warps the fiducials into each patient; here they stay in
 * template space, so the result describes the average template brain only.
 */
export const ACPC = AcpcSchema.parse((coords as Record<string, unknown>)._acpc);

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const AC = ACPC.AC as V, PC = ACPC.PC as V, MSP = ACPC.MSP as V;
const xv = norm(cross(sub(MSP, AC), sub(PC, AC)));
const yv: V = norm(sub(PC, AC)).map((v) => -v) as V;
const zv = norm(cross(xv, yv));
/** AC-PC frame axes expressed in MNI (right, anterior, superior). */
export const ACPC_AXES = { x: xv, y: yv, z: zv };
export const MCP: V =[(AC[0] + PC[0]) / 2, (AC[1] + PC[1]) / 2, (AC[2] + PC[2]) / 2];
export const TEMPLATE_ACPC_LENGTH = Math.hypot(...sub(PC, AC));

/** Frame is orthonormal, so the inverse is the transpose. */
export function mniToAcpc(p: V): V {
  const d = sub(p, MCP);
  return [dot(d, xv), dot(d, yv), dot(d, zv)];
}

export function acpcToMni(a: V): V {
  return [
    MCP[0] + a[0] * xv[0] + a[1] * yv[0] + a[2] * zv[0],
    MCP[1] + a[0] * xv[1] + a[1] * yv[1] + a[2] * zv[1],
    MCP[2] + a[0] * xv[2] + a[1] * yv[2] + a[2] * zv[2],
  ];
}
