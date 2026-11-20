// Triangles that draw nothing, taken out of a mesh before it is encoded (the site audit's MB-16 and MC-12): a triangle
// with a corner repeated, one without area (its three corners on a line or at one point, in the mesh and in every
// shape it morphs to; a tube's end pinched to a point leaves rings of them, as each spinal root's 112), and the second
// and later copies of a triangle drawn twice over the same three corners in the same order (they fight for the same
// pixels). A triangle drawn over the same corners in the other order is kept: it is the back face of a two-sided sheet.
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
