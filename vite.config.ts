import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Relative base: the static build runs from any path on a plain web server.
// Pages: index.html (home), dbs/index.html (DBS targets), tracts/index.html (white-matter tracts), skullbase/index.html (skull base), skullbase-ct/index.html (the skull base's detailed model), cortex/index.html (cortical anatomy), spine/index.html (spine), brainstem/index.html (brainstem).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      // one page per section; shared code and assets
      input: { home: resolve(__dirname, 'index.html'), dbs: resolve(__dirname, 'dbs/index.html'), tracts: resolve(__dirname, 'tracts/index.html'), skullbase: resolve(__dirname, 'skullbase/index.html'), skullbaseCt: resolve(__dirname, 'skullbase-ct/index.html'), cortex: resolve(__dirname, 'cortex/index.html'), spine: resolve(__dirname, 'spine/index.html'), brainstem: resolve(__dirname, 'brainstem/index.html') },
      output: { manualChunks: { three: ['three'] } },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
} as never);
