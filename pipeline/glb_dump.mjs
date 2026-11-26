// Read-only: decode shipped GLBs (meshopt-compressed, quantized) into plain arrays a Python script can read, for
// measurements on the meshes exactly as the site draws them (skullbase_trigeminal.py). Nothing under public/ is written.
//   node pipeline/glb_dump.mjs <outdir> <file>...      each <file> relative to public/assets (as a manifest's "file"
//                                                        without its "assets/" prefix)
// For the i-th file it writes <outdir>/<i>.json (its nodes: name, mesh name, primitive mode, vertex and index counts,
// byte offsets, the node's extras, its morph targets' names and offsets) and <outdir>/<i>.bin (per primitive: positions
// as float32 with the node's world matrix applied, indices as uint32, each morph target's position offsets as float32
// rotated and scaled by the same matrix). Quantized values come out as the viewer sees them (de-quantized).
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const [outdir, ...files] = process.argv.slice(2);
if (!outdir || !files.length) {
  console.error('usage: node pipeline/glb_dump.mjs <outdir> <file relative to public/assets>...');
  process.exit(2);
}
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
mkdirSync(outdir, { recursive: true });

for (const [i, f] of files.entries()) {
  const doc = await io.readBinary(new Uint8Array(readFileSync(join(assets, f))));
  const meta = { file: f, nodes: [] };
  const chunks = [];
  let off = 0;
  const push = (arr) => { const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); chunks.push(b); const o = off; off += b.length; return o; };
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const targetNames = (mesh.getExtras() || {}).targetNames || null;
    for (const prim of mesh.listPrimitives()) {
      const acc = prim.getAttribute('POSITION');
      const n = acc.getCount();
      const P = new Float32Array(n * 3);
      const el = [];
      for (let k = 0; k < n; k++) {
        acc.getElement(k, el);
        const [x, y, z] = el;
        P[3 * k] = m[0] * x + m[4] * y + m[8] * z + m[12];
        P[3 * k + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        P[3 * k + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      }
      const idx = prim.getIndices();
      const I = idx ? Uint32Array.from(idx.getArray()) : new Uint32Array(0);
      const rec = { name: node.getName(), mesh: mesh.getName(), mode: prim.getMode(), n, ni: I.length, pos: push(P), idx: push(I), targets: [], extras: node.getExtras() };
      prim.listTargets().forEach((t, k) => {
        const ta = t.getAttribute('POSITION');
        if (!ta) return;
        const D = new Float32Array(n * 3);
        for (let j = 0; j < n; j++) {
          ta.getElement(j, el);
          const [x, y, z] = el;
          D[3 * j] = m[0] * x + m[4] * y + m[8] * z;
          D[3 * j + 1] = m[1] * x + m[5] * y + m[9] * z;
          D[3 * j + 2] = m[2] * x + m[6] * y + m[10] * z;
        }
        rec.targets.push({ name: targetNames ? targetNames[k] : String(k), off: push(D) });
      });
      meta.nodes.push(rec);
    }
  }
  writeFileSync(join(outdir, `${i}.bin`), Buffer.concat(chunks));
  writeFileSync(join(outdir, `${i}.json`), JSON.stringify(meta));
}
