import path from 'node:path';
import { test, expect } from '@playwright/test';

const sampleImage = path.resolve(process.cwd(), 'public/showcase-staging-after.jpg');

async function seedAuth(page: any) {
  await page.addInitScript(() => {
    localStorage.setItem('studioai_google_user', JSON.stringify({
      name: 'P0 Tester',
      email: 'p0tester@example.com',
      picture: 'https://example.com/avatar.png',
      sub: 'p0-user-1',
    }));
  });
}

test.describe('P0 trust and differentiation', () => {
  test('pricing and features routes resolve for authenticated users without hash trampoline', async ({ page }) => {
    await seedAuth(page);

    await page.goto('/pricing');
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page.getByText('One price. Every tool. No per-photo math.')).toBeVisible();

    await page.goto('/features');
    await expect(page).toHaveURL(/\/features$/);
    await expect(page.getByRole('heading', { name: 'Features' })).toBeVisible();
  });

  test('try route only consumes free try on successful generation path', async ({ page }) => {
    await page.goto('/try?ff_try_real_generation=0');

    await page.locator('input[type="file"]').first().setInputFiles(sampleImage);
    await page.getByRole('button', { name: 'Run my free stage' }).click();

    await expect(page.getByText('Free try complete.')).toBeVisible();
    const tryCount = await page.evaluate(() => localStorage.getItem('studioai_try_count'));
    expect(tryCount).toBe('1');
  });

  test('try route does not consume free try when generation fails', async ({ page }) => {
    await page.route('**/*generativelanguage.googleapis.com/**', (route) => route.abort());

    await page.goto('/try?ff_try_real_generation=1');
    await page.evaluate(() => localStorage.setItem('studioai_try_count', '0'));

    await page.locator('input[type="file"]').first().setInputFiles(sampleImage);
    await page.getByRole('button', { name: 'Run my free stage' }).click();

    await expect(page.getByText(/Try mode is temporarily unavailable|Could not generate your free try/)).toBeVisible();
    const tryCount = await page.evaluate(() => localStorage.getItem('studioai_try_count'));
    expect(tryCount).toBe('0');
  });

  test('settings billing shows live plan details from subscription API', async ({ page }) => {
    await seedAuth(page);
    await page.route('**/api/stripe-status**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          subscribed: true,
          plan: 'team',
          interval: 'year',
          seats: 3,
          generationsUsed: 0,
          generationsLimit: -1,
          lifetimeFreeGensUsed: 0,
          lifetimeFreeGensCap: 5,
        }),
      });
    });

    await page.goto('/settings/billing');
    await expect(page.getByText('Current plan')).toBeVisible();
    await expect(page.getByText('Team')).toBeVisible();
    await expect(page.getByText(/Interval: Annual/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage billing' })).toBeVisible();
  });

  test('route shell links navigate without hard reload state loss', async ({ page }) => {
    await seedAuth(page);
    await page.route('**/api/stripe-status**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          subscribed: false,
          plan: 'free',
          generationsUsed: 0,
          generationsLimit: 5,
          lifetimeFreeGensUsed: 0,
          lifetimeFreeGensCap: 5,
        }),
      });
    });

    await page.goto('/settings/brand');
    await page.evaluate(() => {
      (window as any).__p0Marker = 'stays-in-memory';
    });

    await page.getByRole('link', { name: 'Listings' }).click();
    await expect(page).toHaveURL(/\/listings$/);

    const marker = await page.evaluate(() => (window as any).__p0Marker);
    expect(marker).toBe('stays-in-memory');
  });

  test('cleanup confidence guidance is visible in cleanup panel', async ({ page }) => {
    await seedAuth(page);
    await page.route('**/api/stripe-status**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          subscribed: false,
          plan: 'free',
          generationsUsed: 0,
          generationsLimit: 5,
          lifetimeFreeGensUsed: 0,
          lifetimeFreeGensCap: 5,
        }),
      });
    });

    await page.goto('/?ff_cleanup_confidence_ui=1');
    await page.evaluate(() => localStorage.setItem('studioai_tutorial_seen', 'true'));
    await page.locator('input[type="file"]').first().setInputFiles(sampleImage);
    await expect(page.getByRole('button', { name: 'Cleanup' })).toBeVisible();
    await page.getByRole('button', { name: 'Cleanup' }).click();
    await expect(page.getByText('Cleanup Guidance')).toBeVisible();
  });
});
