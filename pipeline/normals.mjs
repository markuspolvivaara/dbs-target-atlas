// A vertex normal without a direction (the faces round the vertex cancel one another out, as at a pinch in a thin
// sheet, or have no area) cannot be kept as it is in meshopt's octahedral form: every such normal would come out as
// +z. mendNormals() gives it one: the area-weighted mean of the normals of the triangles round it or, where that has
// no direction either, the normal of the largest of them. Other normals are not touched. Used by compress.mjs and
// recompress.mjs before the mesh is encoded. (A node's transform in these files is a shift and one scale, so a
// direction found in the mesh's own coordinates is the direction in the scene.)
export function mendNormals(report = () => {}) {
  return (doc) => {
    let mended = 0;
    const a = [], b = [], c = [], el = [];
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), I = prim.getIndices();
        if (prim.getMode() !== 4 || !P || !N || !I) continue;
        const want = new Map();
        for (let v = 0; v < N.getCount(); v++) {
          N.getElement(v, el);
          if (Math.hypot(el[0], el[1], el[2]) < 0.5) want.set(v, { sum: [0, 0, 0], best: null, most: 0 });
        }
        if (!want.size) continue;
        const idx = I.getArray();
        for (let t = 0; t < idx.length; t += 3) {
          const tri = [idx[t], idx[t + 1], idx[t + 2]];
          if (!want.has(tri[0]) && !want.has(tri[1]) && !want.has(tri[2])) continue;
          P.getElement(tri[0], a); P.getElement(tri[1], b); P.getElement(tri[2], c);
          const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
          const f = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];   // the face's normal, twice its area long
          const len = Math.hypot(f[0], f[1], f[2]);
          for (const v of tri) {
            const w = want.get(v);
            if (!w) continue;
            w.sum[0] += f[0]; w.sum[1] += f[1]; w.sum[2] += f[2];
            if (len > w.most) { w.most = len; w.best = f; }
          }
        }
        for (const [v, w] of want) {
          const s = Math.hypot(w.sum[0], w.sum[1], w.sum[2]) > 0.05 * w.most ? w.sum : w.best;
          const len = s ? Math.hypot(s[0], s[1], s[2]) : 0;
          if (!(len > 0)) continue;   // (in no triangle with an area: nothing is drawn with it)
          N.setElement(v, [s[0] / len, s[1] / len, s[2] / len]);
          mended++;
        }
      }
    }
    report(mended);
  };
}
