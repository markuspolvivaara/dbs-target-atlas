import { defineConfig, devices } from '@playwright/test';

/** Visual smoke tests against the production build (vite preview of dist/). Run `npm run build` first. */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.04 } },
  fullyParallel: false,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:4173/',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
  },
});
