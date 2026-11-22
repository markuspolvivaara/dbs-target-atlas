// Triangles that draw nothing, taken out of a mesh before it is encoded (the site audit's MB-16 and MC-12): a triangle
// with a corner repeated, one without area (its three corners on a line or at one point, in the mesh and in every
// shape it morphs to; a tube's end pinched to a point leaves rings of them, as each spinal root's 112), and the second
// and later copies of a triangle drawn twice over the same three corners in the same order (they fight for the same
// pixels); and a fin: two triangles over the same three corners facing opposite ways, with an edge no other triangle
// shares. A fin encloses nothing and hangs off the surface by its other edges as a flap without thickness (decimation
// and the cutting of the cortex's border triangles leave them: the site audit's MA-17 and MA-20, 167 in the shipped
// files). A back-to-back pair with other triangles on all three edges is kept: it is part of a two-sided sheet.
// The vertices are left as they are (positions, normals, colours and morph targets keep their order, and no other
// triangle changes). Used by compress.mjs and recompress.mjs before the mesh is encoded.
export function cleanTriangles(report = () => {}) {
  return (doc) => {
    let dropped = 0;
    const a = [], b = [], c = [], d = [], e = [], f = [];
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const P = prim.getAttribute('POSITION'), I = prim.getIndices();
        if (prim.getMode() !== 4 || !P || !I) continue;
        const targets = prim.listTargets().map((t) => t.getAttribute('POSITION')).filter(Boolean);
        const idx = I.getArray();
        const area = (i0, i1, i2, T) => {
          P.getElement(i0, a); P.getElement(i1, b); P.getElement(i2, c);
          if (T) {   // (a morph target's positions are offsets from the mesh's own)
            T.getElement(i0, d); T.getElement(i1, e); T.getElement(i2, f);
            for (let k = 0; k < 3; k++) { a[k] += d[k]; b[k] += e[k]; c[k] += f[k]; }
          }
          const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
          return Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
        };
        const seen = new Set(), keep = [];
        for (let t = 0; t < idx.length; t += 3) {
          const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
          if (i0 === i1 || i1 === i2 || i0 === i2) continue;
          if (area(i0, i1, i2) === 0 && targets.every((T) => area(i0, i1, i2, T) === 0)) continue;
          // (the same corners in the same order whichever corner it starts from)
          const r = i0 < i1 && i0 < i2 ? [i0, i1, i2] : i1 < i2 ? [i1, i2, i0] : [i2, i0, i1];
          const key = `${r[0]},${r[1]},${r[2]}`;
          if (seen.has(key)) continue;
          seen.add(key);
          keep.push(i0, i1, i2);
        }
        // fins: both triangles of a back-to-back pair that has a free edge
        const edgeKey = (u, v) => (u < v ? u * 4294967296 + v : v * 4294967296 + u);
        const edges = new Map(), sets = new Map();
        for (let t = 0; t < keep.length; t += 3) {
          const tri = [keep[t], keep[t + 1], keep[t + 2]];
          for (let k = 0; k < 3; k++) { const e = edgeKey(tri[k], tri[(k + 1) % 3]); edges.set(e, (edges.get(e) ?? 0) + 1); }
          const key = tri.slice().sort((x, y) => x - y).join(',');
          const at = sets.get(key);
          if (at) at.push(t); else sets.set(key, [t]);
        }
        const fin = new Set();
        for (const ts of sets.values()) {
          if (ts.length !== 2) continue;
          const tri = [keep[ts[0]], keep[ts[0] + 1], keep[ts[0] + 2]];
          if ([0, 1, 2].some((k) => edges.get(edgeKey(tri[k], tri[(k + 1) % 3])) === 2)) { fin.add(ts[0]); fin.add(ts[1]); }
        }
        if (fin.size) {
          const rest = [];
          for (let t = 0; t < keep.length; t += 3) if (!fin.has(t)) rest.push(keep[t], keep[t + 1], keep[t + 2]);
          keep.length = 0;
          for (const i of rest) keep.push(i);
        }
        if (keep.length === idx.length) continue;
        dropped += (idx.length - keep.length) / 3;
        // (an index list another primitive shares is left to it, and this one given its own)
        const shared = I.listParents().filter((p) => p !== doc.getRoot() && p !== prim).length > 0;
        if (shared) prim.setIndices(doc.createAccessor().setType('SCALAR').setBuffer(I.getBuffer()).setArray(new idx.constructor(keep)));
        else I.setArray(new idx.constructor(keep));
      }
    }
    report(dropped);
  };
}
