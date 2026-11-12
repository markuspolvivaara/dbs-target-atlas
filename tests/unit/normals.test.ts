import { describe, expect, it } from 'vitest';
import { Document } from '@gltf-transform/core';

describe('a normal without a direction (pipeline/normals.mjs)', () => {
  it('gets the direction of the triangles round its vertex before a mesh is encoded; the others are left alone', async () => {
    // (meshopt's octahedral form cannot hold "no direction": such a normal would come out as +z)
    const path: string = '../../pipeline/normals.mjs';
    const { mendNormals } = (await import(path)) as { mendNormals: (report?: (n: number) => void) => (doc: Document) => void };
    const doc = new Document();
    const buf = doc.createBuffer();
    // one triangle in the plane x = 0 (its normal is +x), a second, larger one against it at the shared vertex 0, and
    // a vertex in no triangle
    const pos = doc.createAccessor().setType('VEC3').setBuffer(buf).setArray(new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -3, 0, 3, 0, 5, 5, 5]));
    const nrm = doc.createAccessor().setType('VEC3').setBuffer(buf).setArray(new Float32Array([0, 0, 0, 0, 0, 0, 0.6, 0, 0.8, 0, 0, 0, 1, 0, 0, 0, 0, 0]));
    const idx = doc.createAccessor().setType('SCALAR').setBuffer(buf).setArray(new Uint16Array([0, 1, 2, 0, 3, 4]));
    doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('NORMAL', nrm).setIndices(idx));
    let mended = -1;
    mendNormals((k) => { mended = k; })(doc);
    expect(mended).toBe(3);
    const N = Array.from(nrm.getArray() as Float32Array);
    const at = (v: number) => N.slice(3 * v, 3 * v + 3).map((x) => Math.round(x * 1000) / 1000);
    expect(at(0)).toEqual([1, 0, 0]);       // both triangles face +x: their mean
    expect(at(1)).toEqual([1, 0, 0]);       // the first triangle's
    expect(at(2)).toEqual([0.6, 0, 0.8]);   // had a direction: untouched
    expect(at(3)).toEqual([1, 0, 0]);
    expect(at(4)).toEqual([1, 0, 0]);       // untouched
    expect(at(5)).toEqual([0, 0, 0]);       // in no triangle: nothing is drawn with it
  });
});
