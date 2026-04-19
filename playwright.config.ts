/**
 * playwright.config.ts — Playwright configuration for StudioAI.
 *
 * Two test surfaces:
 *   - tests/e2e/   — deploy-target smoke tests (run against prod or preview)
 *   - tests/visual/ — local visual regression harness (X1 from Cluster H)
 *
 * The visual harness boots the local dev server and snapshots every public
 * route at desktop + mobile viewports. Baselines live at tests/visual/baseline/
 * (auto-created on first run; committed to git after human review).
 *
 * Run:
 *   npm run test:visual          — compare against baseline (fails on >1% diff)
 *   npm run test:visual:update   — accept current renders as new baseline
 */

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const IS_VISUAL = process.env.PW_SUITE === 'visual';

export default defineConfig({
  testDir: IS_VISUAL ? './tests/visual' : './tests',
  // Visual baselines are colocated with the spec so they can be committed.
  // {projectName} segregates desktop vs mobile baselines — without it both
  // viewports collide on the same path and one always loses.
  snapshotPathTemplate: '{testDir}/baseline/{projectName}/{testFilePath}/{arg}{ext}',
  timeout: 60_000,
  expect: {
    // 1% pixel-diff tolerance (per Cluster H brief)
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      // Small threshold for anti-aliasing noise; diff ratio is the real gate.
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    // Reduce nondeterminism between runs (motion + caret).
    reducedMotion: 'reduce',
  },
  projects: IS_VISUAL
    ? [
        {
          name: 'desktop',
          use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
        },
        {
          name: 'mobile',
          use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } },
        },
      ]
    : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Only spin up the dev server for the visual suite. Deploy-smoke tests hit
  // an already-live URL.
  webServer: IS_VISUAL
    ? {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 90_000,
        stdout: 'ignore',
        stderr: 'pipe',
      }
    : undefined,
});
