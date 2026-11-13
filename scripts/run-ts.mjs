/**
 * Runs one TypeScript file of this project in Node through Vite's own module loader, with the project's Vite
 * configuration (JSON imports, `define`, extensionless imports). It stands in for `vite-node`, which vitest no longer
 * installs from version 3 on.
 *
 * Use: node scripts/run-ts.mjs scripts/check-palette.ts
 */
import { resolve } from 'node:path';
import { createServer } from 'vite';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/run-ts.mjs <file.ts>');
  process.exit(2);
}
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
try {
  await server.ssrLoadModule(resolve(file));
} finally {
  await server.close();
}
