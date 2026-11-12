// Re-encode shipped GLBs in place with the encoding compress.mjs now writes (meshopt "high": normals stored in 8-bit
// octahedral form with meshopt's filter), without the pipeline's build caches. For when the encoding changes and a
// section is not being rebuilt: the build caches are not in git, and a rebuild on another machine does not reproduce
// every shipped mesh bit for bit.
//   node pipeline/recompress.mjs            every folder of public/assets
//   node pipeline/recompress.mjs spine wm   only these
// Each file is read (its meshopt compression undone, its quantized values kept as they are) and written again with the
// filter method. Nothing is reordered or quantized again: positions, indices, colours and morph targets come out as they
// went in, value for value and in the same order; only the normals are stored anew (within about a degree; one
// without a direction is given one first, normals.mjs). A file that is not meshopt-compressed is left alone. Afterwards run each section's finalize, which fills in the file sizes.
import { NodeIO, Logger } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mendNormals } from './normals.mjs';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const glbs = (dir) => readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))
  .flatMap((e) => (e.isDirectory() ? glbs(join(dir, e.name)) : e.name.endsWith('.glb') ? [join(dir, e.name)] : []));
const kinds = process.argv.length > 2 ? process.argv.slice(2) : readdirSync(assets, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
let before = 0, after = 0, files = 0, skipped = 0, mended = 0;
for (const kind of kinds) {
  let b = 0, a = 0, n = 0;
  for (const f of glbs(join(assets, kind))) {
    const size = statSync(f).size;
    // (the JSON chunk says whether the file is meshopt-compressed: one that is not was not written by compress.mjs)
    const head = readFileSync(f);
    if (!head.subarray(20, 20 + head.readUInt32LE(12)).toString('utf8').includes('EXT_meshopt_compression')) {
      console.log(`left alone (not meshopt-compressed): ${relative(assets, f)}`);
      skipped++;
      continue;
    }
    const doc = await io.read(f);
    doc.setLogger(new Logger(Logger.Verbosity.WARN));
    await doc.transform(mendNormals((k) => { mended += k; }));
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
    writeFileSync(f, await io.writeBinary(doc));
    b += size; a += statSync(f).size; n++;
  }
  console.log(`${kind.padEnd(14)} ${String(n).padStart(4)} files  ${(b / 1048576).toFixed(2).padStart(7)} MB -> ${(a / 1048576).toFixed(2).padStart(7)} MB`);
  before += b; after += a; files += n;
}
console.log(`total          ${String(files).padStart(4)} files  ${(before / 1048576).toFixed(2).padStart(7)} MB -> ${(after / 1048576).toFixed(2).padStart(7)} MB${skipped ? `; ${skipped} left alone` : ''}; ${mended} normals without a direction given one`);
