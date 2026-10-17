import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Relative base: the static build runs from any path on a plain web server.
// Pages: index.html (home) and dbs/index.html (DBS targets).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      // one page per section; shared code and assets
      input: { home: resolve(__dirname, 'index.html'), dbs: resolve(__dirname, 'dbs/index.html') },
      output: { manualChunks: { three: ['three'] } },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
} as never);
