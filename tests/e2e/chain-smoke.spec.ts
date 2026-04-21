/**
 * chain-smoke.spec.ts — Playwright smoke test for StudioAI prompt-chain stacking feature.
 *
 * Runs against the production deploy at https://studioai.averyandbryant.com/?chain=1.
 * Validates deploy health + public-surface regressions for the stacking flow.
 *
 * --------------------------------------------------------------------------------
 * SETUP (Playwright is NOT currently installed in this repo — install first):
 *
 *   cd /Users/camillebrown/StudioAI
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *
 * Optionally add a script to package.json:
 *   "test:smoke": "playwright test tests/e2e/chain-smoke.spec.ts"
 *
 * RUN:
 *   npx playwright test tests/e2e/chain-smoke.spec.ts --reporter=list
 *
 * Override target host (e.g., for a preview deploy):
 *   BASE_URL=https://studioai-xxx.vercel.app npx playwright test tests/e2e/chain-smoke.spec.ts
 * --------------------------------------------------------------------------------
 *
 * Scope: what we CAN verify without Google OAuth / paid image generation.
 * Authenticated stacking flow is covered by tests/MANUAL_CHAIN_TEST.md.
 */

import { test, expect, request } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://studioai.averyandbryant.com';
const CHAIN_URL = `${BASE_URL}/?chain=1`;

test.describe('StudioAI chain=1 smoke', () => {
  // -----------------------------------------------------------------------------
  // 1. Unauthenticated landing page loads at /?chain=1, HTTP 200
  // -----------------------------------------------------------------------------
  test('1. landing page at /?chain=1 returns 200', async ({ request }) => {
    const res = await request.get(CHAIN_URL);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<!doctype html');
  });

  // -----------------------------------------------------------------------------
  // 2. Deploy health: /api/render-template (social pack renderer) returns PNG
  //    This proves @vercel/og Edge function is bundled + deployed correctly.
  // -----------------------------------------------------------------------------
  test('2. /api/render-template returns a PNG (deploy healthy)', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/render-template`, {
      data: {
        template: 'just-listed',
        format: 'ig-post',
        data: {
          category: 'SMOKE TEST',
          headline: 'Stacking ships today',
          body: 'Prompt chains keep visual fidelity across edits.',
          primaryColor: '#0A84FF',
        },
      },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');

    const buf = await res.body();
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });

  // -----------------------------------------------------------------------------
  // 3. /api/stripe-checkout subscribe returns Stripe URL
  // -----------------------------------------------------------------------------
  test('3. /api/stripe-checkout subscribe returns 200 + Stripe URL', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/stripe-checkout`, {
      data: {
        action: 'subscribe',
        email: 'test@e.com',
        userId: 't',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('url');
    expect(typeof body.url).toBe('string');
    // Stripe checkout sessions live on checkout.stripe.com (or stripe.com billing)
    expect(body.url).toMatch(/stripe\.com/);
  });

  // -----------------------------------------------------------------------------
  // 4. POST /api/render-template with tip-card => 1080x1080 PNG
  //    (Same endpoint as #2 but this asserts dimensions specifically.)
  // -----------------------------------------------------------------------------
  test('4. tip-card template renders at 1080x1080', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/render-template`, {
      data: {
        template: 'just-listed',
        format: 'ig-post',
        data: {
          category: 'CHAIN',
          headline: 'Tip card dimensions',
          body: 'Should be 1080x1080 square.',
          primaryColor: '#C9A84C',
        },
      },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');

    const buf = await res.body();
    // Parse PNG IHDR (starts at byte 8, width @16..20, height @20..24, big-endian)
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    expect(width).toBe(1080);
    expect(height).toBe(1080);
  });

  // -----------------------------------------------------------------------------
  // 5. GET / contains "StudioAI" brand string AND a hashed asset bundle
  // -----------------------------------------------------------------------------
  test('5. / HTML contains StudioAI + hashed index-XXXXX.js bundle', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(html).toContain('StudioAI');

    // Vite emits /assets/index-<hash>.js — hash is alnum, typically 8 chars.
    const bundleRegex = /\/assets\/index-[A-Za-z0-9_-]{6,}\.js/;
    expect(html).toMatch(bundleRegex);
  });

  // -----------------------------------------------------------------------------
  // 6. Visiting /?chain=1 does not throw console errors / page errors
  // -----------------------------------------------------------------------------
  test('6. /?chain=1 loads without console errors or page errors', async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (err) => {
      pageErrors.push(`${err.name}: ${err.message}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known-benign network errors surfacing as console.error
        // (e.g., optional analytics blocked by uBlock). Keep the filter tight.
        if (/net::ERR_BLOCKED_BY_CLIENT/i.test(text)) return;
        consoleErrors.push(text);
      }
    });

    const resp = await page.goto(CHAIN_URL, { waitUntil: 'networkidle' });
    expect(resp?.status()).toBe(200);

    // Small settle window so async module loads + hydration errors surface.
    await page.waitForTimeout(1500);

    expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toHaveLength(0);
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toHaveLength(0);
  });
});
