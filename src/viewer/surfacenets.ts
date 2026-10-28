import * as THREE from 'three';

/**
 * Surface nets over a uint8 field on a grid, in chunks (what the drilling rebuilds where it cut): a vertex in each cell
 * the surface crosses (the mean of where it crosses the cell's edges), a quad across each crossed edge, wound to face out
 * of the field; normals from the field's gradient, colours per vertex. Positions in the grid's frame.
 */
export const CHUNK_VOX = 16;
export type Colour = (p: THREE.Vector3, n: THREE.Vector3, ijk: THREE.Vector3) => [number, number, number];
export interface FieldGrid {
  readonly nx: number; readonly ny: number; readonly nz: number;
  /** voxel -> frame, and the matrix taking a gradient in voxel steps to a direction in the frame */
  readonly toRas: THREE.Matrix4;
  readonly normalM: THREE.Matrix3;
  /** a field's value at a point in voxel coordinates (trilinear) */
  sample(f: Uint8Array, x: number, y: number, z: number): number;
}

/**
 * One chunk of a field's surface (its `iso` level) (null if the surface does not pass through it). Faced out of the
 * field (towards lower values); `flip`: into it (a cavity's walls seen from inside, as the endoscope draws them: their
 * normals pointing away from the cavity).
 */
export function meshChunk(grid: FieldGrid, f: Uint8Array, iso: number, ci: number, cj: number, ck: number, colour: Colour, flip = false): THREE.BufferGeometry | null {
  const CHUNK = CHUNK_VOX;
  const idx = (i: number, j: number, k: number) => (i * grid.ny + j) * grid.nz + k;
  const x0 = ci * CHUNK, y0 = cj * CHUNK, z0 = ck * CHUNK;
  const x1 = Math.min(x0 + CHUNK, grid.nx - 1), y1 = Math.min(y0 + CHUNK, grid.ny - 1), z1 = Math.min(z0 + CHUNK, grid.nz - 1);
  // cells from one before the chunk (its quads reach back one cell) to its end
  const bx = Math.max(x0 - 1, 0), by = Math.max(y0 - 1, 0), bz = Math.max(z0 - 1, 0);
  const sx = x1 - bx, sy = y1 - by, sz = z1 - bz;
  const vid = new Int32Array(sx * sy * sz).fill(-1);
  const pos: number[] = [], nor: number[] = [], col: number[] = [], ind: number[] = [];
  const g = (i: number, j: number, k: number) => f[idx(i, j, k)];
  const P = new THREE.Vector3(), N = new THREE.Vector3(), Q = new THREE.Vector3();
  const E: [number, number, number, number, number, number][] = [
    [0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
  const cellVertex = (i: number, j: number, k: number): number => {
    const ci2 = ((i - bx) * sy + (j - by)) * sz + (k - bz);
    if (vid[ci2] !== -1) return vid[ci2];
    let n = 0, px = 0, py = 0, pz = 0;
    for (const [a, b, c, d, e, h] of E) {
      const va = g(i + a, j + b, k + c), vb = g(i + d, j + e, k + h);
      if ((va >= iso) === (vb >= iso)) continue;
      const t = (iso - va) / (vb - va);
      px += i + a + (d - a) * t; py += j + b + (e - b) * t; pz += k + c + (h - c) * t; n++;
    }
    if (!n) return (vid[ci2] = -2);
    Q.set(px / n, py / n, pz / n);
    // outward normal: down the field's gradient, to the frame
    const s = (dx: number, dy: number, dz: number) => grid.sample(f, Q.x + dx, Q.y + dy, Q.z + dz);
    N.set(s(-0.5, 0, 0) - s(0.5, 0, 0), s(0, -0.5, 0) - s(0, 0.5, 0), s(0, 0, -0.5) - s(0, 0, 0.5)).applyMatrix3(grid.normalM).normalize();
    if (flip) N.negate();
    P.copy(Q).applyMatrix4(grid.toRas);
    const id = pos.length / 3;
    pos.push(P.x, P.y, P.z); nor.push(N.x, N.y, N.z); col.push(...colour(P, N, Q));
    return (vid[ci2] = id);
  };
  const inside = (i: number, j: number, k: number) => (g(i, j, k) >= iso) !== flip;
  const quad = (a: number, b: number, c: number, d: number, out: THREE.Vector3) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // wound so its face points out of the bone (`out`): the quad's normal from its diagonals (one of its triangles
    // can be a sliver)
    const at = (x: number) => new THREE.Vector3(pos[x * 3], pos[x * 3 + 1], pos[x * 3 + 2]);
    const fn = at(c).sub(at(a)).cross(at(d).sub(at(b)));
    if (fn.dot(out) >= 0) ind.push(a, b, c, a, c, d); else ind.push(a, c, b, a, d, c);
  };
  const dirOut = (i: number, j: number, k: number, di: number, dj: number, dk: number) => {
    const o = new THREE.Vector3(di, dj, dk).applyMatrix3(new THREE.Matrix3().setFromMatrix4(grid.toRas));
    return inside(i, j, k) ? o : o.negate();
  };
  for (let i = x0; i < x1; i++) for (let j = y0; j < y1; j++) for (let k = z0; k < z1; k++) {
    // the edges from voxel (i, j, k) along each axis; each crossed one gets the quad of the four cells round it
    if (i + 1 < grid.nx && j >= 1 && k >= 1 && inside(i, j, k) !== inside(i + 1, j, k))
      quad(cellVertex(i, j - 1, k - 1), cellVertex(i, j, k - 1), cellVertex(i, j, k), cellVertex(i, j - 1, k), dirOut(i, j, k, 1, 0, 0));
    if (j + 1 < grid.ny && i >= 1 && k >= 1 && inside(i, j, k) !== inside(i, j + 1, k))
      quad(cellVertex(i - 1, j, k - 1), cellVertex(i, j, k - 1), cellVertex(i, j, k), cellVertex(i - 1, j, k), dirOut(i, j, k, 0, 1, 0));
    if (k + 1 < grid.nz && i >= 1 && j >= 1 && inside(i, j, k) !== inside(i, j, k + 1))
      quad(cellVertex(i - 1, j - 1, k), cellVertex(i, j - 1, k), cellVertex(i, j, k), cellVertex(i - 1, j, k), dirOut(i, j, k, 0, 0, 1));
  }
  if (!ind.length) return null;
  // a vertex on a wall thinner than the gradient's reach can take its normal from the far side: turned round, it would
  // shade unlit; such normals are taken from the faces round the vertex instead
  const fsum = new Float32Array(pos.length);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let t = 0; t < ind.length; t += 3) {
    A.fromArray(pos, ind[t] * 3); B.fromArray(pos, ind[t + 1] * 3); C.fromArray(pos, ind[t + 2] * 3);
    const fn = B.sub(A).cross(C.sub(A));   // (as wound: facing out)
    for (let k = 0; k < 3; k++) { const v = ind[t + k] * 3; fsum[v] += fn.x; fsum[v + 1] += fn.y; fsum[v + 2] += fn.z; }
  }
  for (let v = 0; v < nor.length; v += 3) {
    if (nor[v] * fsum[v] + nor[v + 1] * fsum[v + 1] + nor[v + 2] * fsum[v + 2] >= 0) continue;
    N.set(fsum[v], fsum[v + 1], fsum[v + 2]).normalize();
    nor[v] = N.x; nor[v + 1] = N.y; nor[v + 2] = N.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(ind);
  geo.computeBoundingSphere();
  return geo;
}
