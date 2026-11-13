import { defineConfig, devices } from '@playwright/test';

/**
 * Visual smoke tests against the production build (vite preview of dist/). Run `npm run build` first.
 * In CI (Linux) the picture comparisons are skipped: the baselines are taken on macOS, and a picture rendered by another
 * platform's software WebGL is not the same picture. Every other assertion runs there: no console error, no request
 * leaving the site, card texts, links that survive a reload. One retry in CI, for a runner that stalls, and four times
 * the wait in every assertion: a runner whose cores are shared with the other worker's software WebGL has gone four
 * seconds without drawing a frame after a click, and the usual five seconds ran out while the panel was still
 * scrolling to the card (the retry, on the same runner, failed the same way).
 *
 * The browser is Chromium itself in its new headless mode (channel 'chromium'), not Playwright's default headless shell.
 * The shell of Chromium 158 (Playwright 1.65) gives a page its next animation frame without waiting for software WebGL
 * to finish the last one: on two cores the DBS view queued 23 frames of about a second each in two seconds, and the next
 * snapshot waited 30 to 60 s for them. Chromium 130's shell (Playwright 1.48) and Chromium 158 in new headless mode
 * hold the page back (3 and 6 frames; the snapshot 2.5 s).
 */
const CI = !!process.env.CI;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: CI ? 120_000 : 60_000,
  expect: { timeout: CI ? 20_000 : 5_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  ignoreSnapshots: CI,
  retries: CI ? 1 : 0,
  fullyParallel: false,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:4173/',
    channel: 'chromium',
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
