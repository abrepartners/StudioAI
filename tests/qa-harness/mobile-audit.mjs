/**
 * mobile-audit.mjs — one-command visual audit of the Vellum photo editor at
 * an iPhone viewport, against the production build.
 *
 * Run:
 *   npm run build          (once, or after changes)
 *   npm run audit:mobile
 *
 * What it does:
 *   1. Spawns `vite preview --strictPort --port 3000` against ./dist and
 *      waits for it to answer.
 *   2. Opens headless Chromium at 393x852 (iPhone class, touch, DPR 2).
 *   3. Seeds auth + tutorial flags via localStorage (same pattern as
 *      tests/e2e/non-stackable-cleanup.spec.ts), mocks /api/* so the
 *      static preview server never 404s the app into an error state, and
 *      stubs external Google hosts (fonts, GIS) that are unreachable in
 *      sandboxed/CI runs — a failed Google Fonts @import in the vellum CSS
 *      chunk rejects the lazy route import and black-screens every shot.
 *   4. Deep-links to /vellum#photo, uploads a fixture photo, dismisses the
 *      tag-room modal, and captures: empty editor, post-upload top, three
 *      scroll depths, Tools sheet, Adjust sheet.
 *   5. Captures the non-editor surfaces: dashboard, projects, settings,
 *      billing, the New-listing modal, and the logged-out landing page
 *      (fresh context, no auth seed).
 *
 * Output: tests/qa-harness/shots/*.png (gitignored). Review by eye — this is
 * a fast judgment loop for mobile work, not a pixel-diff gate. For regression
 * gating use `npm run test:visual`.
 *
 * Exit code: non-zero if any page error was thrown or any captured shot is a
 * blank/black frame (body renders no text), so CI can't silently pass on a
 * broken bundle.
 *
 * Prereq: `npx playwright install chromium` (one-time per machine/CI).
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "tests/qa-harness/shots");
const IMG = path.join(ROOT, "public/showcase-staging-before.jpg");
const PORT = process.env.AUDIT_PORT || "3000";
const BASE = `http://localhost:${PORT}`;

if (!fs.existsSync(path.join(ROOT, "dist/index.html"))) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

// ── 1. Preview server ──────────────────────────────────────────────────────
const server = spawn("npx", ["vite", "preview", "--strictPort", "--port", PORT], {
  cwd: ROOT,
  stdio: "ignore",
});
const killServer = () => {
  try {
    server.kill("SIGTERM");
  } catch {}
};
process.on("exit", killServer);
process.on("SIGINT", () => {
  killServer();
  process.exit(130);
});

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/vellum`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `Preview server never answered on :${PORT}. Port busy? (strictPort is on)`,
  );
}
await waitForServer();

// ── 2. Browser at iPhone viewport ──────────────────────────────────────────
const DEVICE = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};
// PW_CHROMIUM_PATH: cloud/CI sessions ship a pinned system Chromium instead of
// the Playwright-managed download (which is blocked there). Local runs where
// `npx playwright install chromium` has been done need no env var.
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
});
const ctx = await browser.newContext(DEVICE);
const page = await ctx.newPage();

// ── 3. Auth seed + network mocks ───────────────────────────────────────────
await page.addInitScript(() => {
  localStorage.setItem(
    "studioai_google_user",
    JSON.stringify({
      name: "QA Audit",
      email: "audit@example.com",
      picture: "https://example.com/a.png",
      sub: "audit-1",
    }),
  );
  localStorage.setItem("studioai_tutorial_seen", "true");
  localStorage.setItem("studioai_gemini_key", "test-key");
});

// External Google hosts fail with cert errors in sandboxed/CI environments.
// Stub them BEFORE any navigation: an unanswered fonts.googleapis.com
// @import rejects the lazy vellum CSS chunk → pure black screenshots.
async function mockExternalHosts(target) {
  await target.route("**fonts.googleapis.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  await target.route("**fonts.gstatic.com/**", (r) =>
    r.fulfill({ status: 200, body: "" }),
  );
  await target.route("**accounts.google.com/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}}}};",
    }),
  );
}

async function mockApi(target) {
  await target.route("**/api/stripe-status**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        subscribed: true,
        plan: "pro",
        generationsUsed: 0,
        generationsLimit: -1,
        lifetimeFreeGensUsed: 0,
        lifetimeFreeGensCap: 5,
      }),
    }),
  );
  await target.route("**/api/classify-room**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        room: "Bedroom",
        location: "interior",
        furnished: false,
      }),
    }),
  );
  await target.route("**/api/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );
}

await mockExternalHosts(page);
await mockApi(page);

const errors = [];
const failures = [];
page.on("pageerror", (e) => errors.push(String(e)));

// Screenshot + cheap blank-frame detection: every audited route is expected
// to render text, so a zero-length body innerText means the bundle never
// painted (e.g. a rejected lazy chunk) and the shot is solid black.
async function snap(pg, name) {
  await pg.screenshot({ path: path.join(OUT, name) });
  const textLen = await pg
    .evaluate(() => document.body.innerText.trim().length)
    .catch(() => 0);
  if (textLen === 0) failures.push(`${name}: blank/black frame (body has no text)`);
}

// ── 4. Editor capture sequence ─────────────────────────────────────────────
await page.goto(`${BASE}/vellum#photo`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await snap(page, "01-editor-empty.png");

const input = page.locator('input[type="file"]').first();
if ((await input.count()) > 0) {
  await input.setInputFiles(IMG);
  await page.waitForTimeout(2500);
}
try {
  const done = page.getByRole("button", { name: "Done" });
  if (await done.isVisible({ timeout: 2000 })) {
    await done.click();
    await page.waitForTimeout(600);
  }
} catch {}

await snap(page, "02-after-upload-top.png");
for (const [i, y] of [
  [3, 800],
  [4, 1600],
  [5, 2600],
]) {
  await page.evaluate((yy) => {
    const el = document.querySelector(".v-editor-center");
    if (el) el.scrollTo({ top: yy });
    else window.scrollTo(0, yy);
  }, y);
  await page.waitForTimeout(400);
  await snap(page, `0${i}-scroll.png`);
}
await page.evaluate(() => {
  const el = document.querySelector(".v-editor-center");
  if (el) el.scrollTo({ top: 0 });
});

try {
  const tools = page.locator(".v-mobile-tabbar button", { hasText: "Tools" });
  if ((await tools.count()) > 0) {
    await tools.click({ timeout: 5000 });
    await page.waitForTimeout(700);
    await snap(page, "06-tools-sheet.png");
    await tools.click({ timeout: 5000 });
    await page.waitForTimeout(400);
  }
} catch (e) {
  console.log("tools sheet:", String(e).slice(0, 120));
}
try {
  const adjust = page.locator(".v-mobile-tabbar button", { hasText: "Adjust" });
  if ((await adjust.count()) > 0) {
    await adjust.click({ timeout: 5000 });
    await page.waitForTimeout(700);
    await snap(page, "07-adjust-sheet.png");
    await adjust.click({ timeout: 5000 });
    await page.waitForTimeout(400);
  }
} catch (e) {
  console.log("adjust sheet:", String(e).slice(0, 120));
}

// ── 5. Beyond the editor: dashboard, projects, settings, billing ──────────
// Each capture has its own try/catch so one failure doesn't abort the rest,
// but every failure is still recorded for the exit code.
for (const [hash, file] of [
  ["dashboard", "08-dashboard.png"],
  ["projects", "09-projects.png"],
  ["settings", "10-settings.png"],
  ["billing", "11-billing.png"],
]) {
  try {
    await page.goto(`${BASE}/vellum#${hash}`);
    await page.waitForTimeout(900);
    await snap(page, file);
  } catch (e) {
    failures.push(`${file}: ${String(e).slice(0, 160)}`);
  }
}

// New-listing modal off the dashboard.
try {
  await page.goto(`${BASE}/vellum#dashboard`);
  await page.waitForTimeout(900);
  await page
    .getByRole("button", { name: /New listing/i })
    .first()
    .click({ timeout: 5000 });
  await page.waitForTimeout(700);
  await snap(page, "12-new-listing-modal.png");
} catch (e) {
  failures.push(`12-new-listing-modal.png: ${String(e).slice(0, 160)}`);
}

// ── 6. Logged-out landing (fresh context — no studioai_google_user seed) ───
try {
  const anonCtx = await browser.newContext(DEVICE);
  const anon = await anonCtx.newPage();
  anon.on("pageerror", (e) => errors.push(`landing: ${String(e)}`));
  await mockExternalHosts(anon);
  await mockApi(anon);
  await anon.goto(`${BASE}/vellum-home`, { waitUntil: "networkidle" });
  await anon.waitForTimeout(1200);
  await snap(anon, "13-landing.png");
  await anonCtx.close();
} catch (e) {
  failures.push(`13-landing.png: ${String(e).slice(0, 160)}`);
}

// ── 7. Verdict ─────────────────────────────────────────────────────────────
await browser.close();
killServer();

if (errors.length) {
  console.error(`FAIL — ${errors.length} page error(s):`);
  for (const e of errors) console.error(`  ${e}`);
}
if (failures.length) {
  console.error(`FAIL — ${failures.length} capture failure(s):`);
  for (const f of failures) console.error(`  ${f}`);
}
if (errors.length || failures.length) process.exit(1);

console.log("page errors: none");
console.log(`shots → ${path.relative(ROOT, OUT)}/`);
