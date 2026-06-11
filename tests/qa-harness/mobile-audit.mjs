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
 *      tests/e2e/non-stackable-cleanup.spec.ts) and mocks /api/* so the
 *      static preview server never 404s the app into an error state.
 *   4. Deep-links to /vellum#photo, uploads a fixture photo, dismisses the
 *      tag-room modal, and captures: empty editor, post-upload top, three
 *      scroll depths, Tools sheet, Adjust sheet.
 *
 * Output: tests/qa-harness/shots/*.png (gitignored). Review by eye — this is
 * a fast judgment loop for mobile work, not a pixel-diff gate. For regression
 * gating use `npm run test:visual`.
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
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await ctx.newPage();

// ── 3. Auth seed + API mocks ───────────────────────────────────────────────
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

await page.route("**/api/stripe-status**", (r) =>
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
await page.route("**/api/classify-room**", (r) =>
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
await page.route("**/api/**", (r) =>
  r.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  }),
);

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// ── 4. Capture sequence ────────────────────────────────────────────────────
await page.goto(`${BASE}/vellum#photo`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/01-editor-empty.png` });

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

await page.screenshot({ path: `${OUT}/02-after-upload-top.png` });
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
  await page.screenshot({ path: `${OUT}/0${i}-scroll.png` });
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
    await page.screenshot({ path: `${OUT}/06-tools-sheet.png` });
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
    await page.screenshot({ path: `${OUT}/07-adjust-sheet.png` });
  }
} catch (e) {
  console.log("adjust sheet:", String(e).slice(0, 120));
}

console.log("page errors:", errors.length ? errors : "none");
console.log(`shots → ${path.relative(ROOT, OUT)}/`);
await browser.close();
killServer();
