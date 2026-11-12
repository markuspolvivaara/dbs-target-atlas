import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * A short content hash for each folder of public/assets (and for each file directly in it): the version that
 * `assetUrl` (src/brand.ts) puts in every asset's address. The meshes and volumes keep their names when their contents
 * change, so without it their addresses could not be cached for long; with it an address changes when anything in
 * its folder does. Hidden files and a sync service's numbered copies ("name 2.glb") are left out, so that the hash
 * is the same on every machine with the same assets.
 */
function assetVersions(): Record<string, string> {
  const root = resolve(__dirname, 'public/assets');
  const keep = (name: string) => !name.startsWith('.') && !/ \d+\.[a-z0-9.]+$/i.test(name);
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).filter((e) => keep(e.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
  const out: Record<string, string> = {};
  for (const e of readdirSync(root, { withFileTypes: true }).filter((x) => keep(x.name))) {
    const h = createHash('sha256');
    for (const f of e.isDirectory() ? files(join(root, e.name)) : [join(root, e.name)]) {
      h.update(f.slice(root.length).replace(/\\/g, '/'));
      h.update(readFileSync(f));
    }
    out[e.name] = h.digest('hex').slice(0, 10);
  }
  return out;
}

// Relative base: the static build runs from any path on a plain web server.
// Pages: index.html (home), dbs/index.html (DBS targets), tracts/index.html (white-matter tracts), skullbase/index.html (skull base, its default model), skullbase-v1/index.html and skullbase-ct/index.html (its earlier versions, v1 and v2), cortex/index.html (cortical anatomy), spine/index.html (spine), brainstem/index.html (brainstem), ventricles/index.html (ventricles), vascular/index.html (vascular).
export default defineConfig({
  base: './',
  define: { __ASSET_VERSIONS__: JSON.stringify(assetVersions()) },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      // one page per section; shared code and assets
      input: { home: resolve(__dirname, 'index.html'), dbs: resolve(__dirname, 'dbs/index.html'), tracts: resolve(__dirname, 'tracts/index.html'), skullbase: resolve(__dirname, 'skullbase/index.html'), skullbaseV1: resolve(__dirname, 'skullbase-v1/index.html'), skullbaseCt: resolve(__dirname, 'skullbase-ct/index.html'), cortex: resolve(__dirname, 'cortex/index.html'), spine: resolve(__dirname, 'spine/index.html'), brainstem: resolve(__dirname, 'brainstem/index.html'), ventricles: resolve(__dirname, 'ventricles/index.html'), vascular: resolve(__dirname, 'vascular/index.html') },
      output: { manualChunks: { three: ['three'] } },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
} as never);
