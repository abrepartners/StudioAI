/**
 * staging-renovation-visual.spec.ts — Authenticated, screenshot-producing
 * smoke test for the Virtual Staging and Virtual Renovation fixes.
 *
 * Unlike chain-smoke.spec.ts (which only checks public/unauthenticated
 * surfaces), this drives the real authenticated tool flow end-to-end and
 * runs PAID generations, then saves before/after screenshots for visual
 * review. It exists to verify that:
 *   - Staging adds furniture without changing the room (perspective,
 *     kitchen, floor) and without erasing fireplaces / feature walls.
 *   - Renovation swaps the named surface without re-rendering the room.
 *
 * --------------------------------------------------------------------------
 * WHY IT'S OPT-IN: it spends credits and needs a real subscribed account, so
 * it is skipped unless SMOKE_USER_EMAIL is set. It is never part of normal CI.
 *
 * RUN (against prod, the only place the Replicate-backed API has a token):
 *
 *   SMOKE_USER_EMAIL="you@youraccount.com" \
 *   npx playwright test tests/e2e/staging-renovation-visual.spec.ts --reporter=list
 *
 * Optional env:
 *   BASE_URL            target host        (default https://studioai.averyandbryant.com)
 *   SMOKE_USER_NAME     display name       (default "Smoke Test")
 *   SMOKE_STYLES        comma list         (default "Contemporary,Mid-century")
 *   SMOKE_STAGING_IMAGE local image path   (default public/showcase-staging-before.jpg)
 *   SMOKE_RENO_IMAGE    local image path   (default public/showcase-reno-before.jpg)
 *   SMOKE_ARTIFACTS     output dir         (default test-artifacts/)
 *   SMOKE_SKIP_RENO     "1" to skip the renovation leg
 *
 * Screenshots land in SMOKE_ARTIFACTS for human review (this is a visual
 * check — there is no pixel assertion, since the whole point is judging
 * whether the AI output looks right).
 * --------------------------------------------------------------------------
 */

import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';

const BASE_URL = (process.env.BASE_URL || 'https://studioai.averyandbryant.com').replace(/\/$/, '');
const USER_EMAIL = process.env.SMOKE_USER_EMAIL || '';
const USER_NAME = process.env.SMOKE_USER_NAME || 'Smoke Test';
const STYLES = (process.env.SMOKE_STYLES || 'Contemporary,Mid-century').split(',').map((s) => s.trim()).filter(Boolean);
const STAGING_IMAGE = process.env.SMOKE_STAGING_IMAGE || path.resolve(process.cwd(), 'public/showcase-staging-before.jpg');
const RENO_IMAGE = process.env.SMOKE_RENO_IMAGE || path.resolve(process.cwd(), 'public/showcase-reno-before.jpg');
const ARTIFACTS = process.env.SMOKE_ARTIFACTS || path.resolve(process.cwd(), 'test-artifacts');
const SKIP_RENO = process.env.SMOKE_SKIP_RENO === '1';

// Generations + Pruna upscale can take a while; give them room.
const GEN_TIMEOUT = 180_000;

const AUTH_KEY = 'studioai_google_user';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  if (!USER_EMAIL) {
    // Make the skip reason obvious in the report.
    console.warn('[smoke] SMOKE_USER_EMAIL not set — skipping authenticated visual smoke.');
  }
  fs.mkdirSync(ARTIFACTS, { recursive: true });
});

/** Inject the same localStorage entry the app writes after Google sign-in. */
async function signInViaLocalStorage(context: import('@playwright/test').BrowserContext) {
  await context.addInitScript(
    ([key, email, name]) => {
      window.localStorage.setItem(key, JSON.stringify({ name, email, picture: '', sub: 'smoke-test' }));
    },
    [AUTH_KEY, USER_EMAIL, USER_NAME],
  );
}

/** Open the photo editor and confirm the auth wall is gone. */
async function openPhotoEditor(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/vellum#photo`, { waitUntil: 'domcontentloaded' });
  // If the app landed on the dashboard, click into the editor.
  const editorNav = page.getByText('Photo editor', { exact: false }).first();
  if (await editorNav.isVisible().catch(() => false)) {
    await editorNav.click().catch(() => {});
  }
  // The Google sign-in button must NOT be present (auth injection worked).
  await expect(page.getByText(/sign in with google/i)).toHaveCount(0, { timeout: 15_000 });
}

async function uploadPhoto(page: import('@playwright/test').Page, imagePath: string) {
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(imagePath);
  // Wait for the uploaded thumbnail / tool panel to render.
  await expect(page.getByText(/Apply ·/i).first()).toBeVisible({ timeout: 30_000 });
}

/** Click Apply and wait for the refined result to appear. */
async function applyAndWait(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^Apply ·/i }).first().click();
  // Completion: the refined-photo download button appears, or AFTER label shows.
  await expect(
    page.getByText(/Download refined photo/i).or(page.getByText(/^AFTER/i)),
  ).toBeVisible({ timeout: GEN_TIMEOUT });
}

test('staging — adds furniture, preserves room + fireplace/feature wall', async ({ page, context }) => {
  test.skip(!USER_EMAIL, 'SMOKE_USER_EMAIL not set');
  await signInViaLocalStorage(context);
  await openPhotoEditor(page);
  await uploadPhoto(page, STAGING_IMAGE);

  // Make sure the Virtual staging tool is selected.
  await page.getByText('Virtual staging', { exact: false }).first().click().catch(() => {});
  await page.screenshot({ path: path.join(ARTIFACTS, 'staging-00-before.png') });

  for (const style of STYLES) {
    await page.getByRole('button', { name: new RegExp(`^${style}$`, 'i') }).first().click();
    await applyAndWait(page);
    const safe = style.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await page.screenshot({ path: path.join(ARTIFACTS, `staging-${safe}.png`) });
    // Reset to original between styles so each is judged against the empty room.
    await page.getByRole('button', { name: /Reset to original/i }).first().click().catch(() => {});
  }
});

test('renovation — swaps a surface, preserves the rest of the room', async ({ page, context }) => {
  test.skip(!USER_EMAIL || SKIP_RENO, 'SMOKE_USER_EMAIL not set or renovation skipped');
  await signInViaLocalStorage(context);
  await openPhotoEditor(page);
  await uploadPhoto(page, RENO_IMAGE);

  await page.getByText('Virtual renovation', { exact: false }).first().click();
  await page.screenshot({ path: path.join(ARTIFACTS, 'renovation-00-before.png') });

  // Fill at least one renovation field. The renovation panel exposes
  // cabinets / countertops / flooring / walls inputs; set countertops.
  const counters = page.getByLabel(/countertop/i).or(page.getByPlaceholder(/countertop/i)).first();
  if (await counters.isVisible().catch(() => false)) {
    await counters.fill('white quartz with subtle veining');
  }
  await applyAndWait(page);
  await page.screenshot({ path: path.join(ARTIFACTS, 'renovation-after.png') });
});
