// Compress pipeline GLBs for the web: quantize vertex attributes
// (KHR_mesh_quantization) and apply meshopt compression (EXT_meshopt_compression).
// Input:  pipeline/data/build/{meshes,tracts,wm,skullbase,skullbase-ct,skullbase-v3,cortex,spine,brainstem,ventricles}/*.glb (or only the kind given as argument)
// Output: public/assets/{meshes,tracts,wm,skullbase,skullbase-ct,skullbase-v3,cortex,spine,brainstem,ventricles}/*.glb
import { NodeIO, Logger } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, quantize, dedup, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { readdirSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, '..');
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

let total = 0;
for (const kind of (process.argv[2] ? [process.argv[2]] : ['meshes', 'tracts', 'wm', 'skullbase', 'skullbase-ct', 'skullbase-v3', 'cortex', 'spine', 'brainstem', 'ventricles'])) {
  const src = join(root, 'data', 'build', kind);
  if (!existsSync(src)) continue; // a section not built yet
  const dst = join(repo, 'public', 'assets', kind);
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src).filter((f) => f.endsWith('.glb')).sort()) {
    const doc = await io.read(join(src, f));
    doc.setLogger(new Logger(Logger.Verbosity.WARN));
    await doc.transform(
      dedup(),
      prune({ keepExtras: true }),
      // 14-bit positions: < 0.02 mm error over the largest (cortex) bounding box
      quantize({ quantizePosition: 14, quantizeNormal: 10 }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    await io.write(join(dst, f), doc);
    const kb = statSync(join(dst, f)).size / 1024;
    total += kb;
    console.log(`${kind}/${f}`.padEnd(28), `${(statSync(join(src, f)).size / 1024).toFixed(0).padStart(6)} KB -> ${kb.toFixed(0).padStart(5)} KB`);
  }
}
console.log(`total ${(total / 1024).toFixed(2)} MB`);
