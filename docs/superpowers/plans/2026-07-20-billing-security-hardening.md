# Vellum Billing Security Hardening (Phase 0.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five unauthenticated money endpoints, make credit fulfillment idempotent, derive subscription prices server-side, add a signature-verified Stripe webhook, and restore the marketing routes that are currently redirecting 90% of prospects away from the pricing page.

**Architecture:** Reuse the existing session layer (`api/_lib/session.ts` + `api/_lib/auth-middleware.ts`) that already gates all 12 generation endpoints. Add one new helper, `requireBillingSession`, that additionally binds the caller's session email to the email they are acting on — closing the IDOR class where knowing someone's email is sufficient authorization. Money mutations get an idempotency table. Prices stop coming from the request body and start coming from `shared/monetization.ts`.

**Tech Stack:** TypeScript, Vercel Node serverless functions (`api/*.ts`), Supabase Postgres via PostgREST, Stripe REST API called directly with `fetch` (no Stripe SDK in this repo), vitest for unit tests.

## Global Constraints

- **No em dashes** in any generated copy or client-facing string. Use commas, colons, or parentheses.
- **One PR per change, reviewed. Never push or merge to `main` directly.** Every change ships through a PR.
- **Production ships only on Thomas's explicit go.** A green build is not permission to deploy.
- **Never print or commit secret values.** Environment variable names only.
- Every `api/` import of a local module must carry a `.js` extension (Vercel Node ESM requirement). Violating this 500s the endpoint in production — this exact bug took down three endpoints once already.
- Run `npm run check:api` before any commit that touches `api/`.
- All amounts are integers in **cents**. `shared/monetization.ts` `PLAN_PRICING_USD` is in **dollars** and must be multiplied by 100.
- Tests live in `tests/unit/**/*.test.ts` (vitest `include` glob). A test placed anywhere else will not run.
- Endpoints capture `process.env` at module load, so tests must set env vars **before** the dynamic `import()` of the handler.

## Preconditions (Task 0 is a hard gate)

This plan is worthless if `AUTH_ENFORCE=log-only` in production, because `requireSession` then returns a synthetic anonymous identity and every gate added here silently passes. Task 0 verifies this before any code is written.

---

### Task 0: Verify AUTH_ENFORCE is enforcing (GATE — do not skip)

**Files:** none (verification only)

**Interfaces:**

- Consumes: nothing
- Produces: a go/no-go decision for Tasks 3-9

`api/_lib/auth-middleware.ts:59` reads:

```ts
const ENFORCE = process.env.AUTH_ENFORCE !== "log-only";
```

So any value other than the exact string `log-only` enforces. `AUTH_ENFORCE` **is** set in Vercel Production (confirmed present via `vercel env ls`), but its value is encrypted and was deliberately rolled out as `log-only` first per `docs/DEPLOY-SESSION-AUTH.md`.

- [ ] **Step 1: Probe a session-gated endpoint that costs nothing**

`api/jobs.ts` is session-gated and touches only Postgres (no Replicate spend), making it the safe probe.

Run:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://vellum.homes/api/jobs \
  -H 'Content-Type: application/json' -d '{}'
```

Expected if enforcing: `401`
Expected if log-only: `400` or `422` (request passed auth, failed validation)
Expected if misconfigured: `503`

- [ ] **Step 2: Record the result and branch**

If `401`: enforcement is on. Proceed to Task 1.

If `400`/`422`: **STOP.** Report to Thomas: "AUTH_ENFORCE is still `log-only`, so adding auth gates changes nothing until it is flipped." The flip is a one-line Vercel env change, but it is a production auth change and needs his go. Do not proceed to Tasks 3-9 until it is enforcing.

If `503`: **STOP.** `SESSION_SECRET` is missing or malformed. Report and stop.

- [ ] **Step 3: No commit** (verification only)

---

### Task 1: Restore the marketing routes (highest revenue impact, lowest risk)

**Files:**

- Modify: `src/routes/MarketingRoute.tsx:70-73`
- Test: `tests/unit/feature-flags.test.ts` (create)

**Interfaces:**

- Consumes: `getFeatureFlag` from `src/config/featureFlags.ts`
- Produces: nothing consumed by later tasks

**Why this is first:** `src/config/featureFlags.ts:9` sets `DEFAULT_PERCENT_PROD = 10`. `getFeatureFlag` returns `inRolloutPercent(...)` in production regardless of the `DEFAULTS` entry being `true`. No `VITE_FF_PERCENT_ROUTE_LINK_STABILITY` variable exists in the Vercel production environment (verified via `vercel env ls`), so `pct` resolves to `10`. `MarketingRoute.tsx` then does `window.location.replace('/')` for everyone outside the bucket. Net effect: roughly **90% of visitors to /pricing, /features, /faq, and /gallery are bounced to the homepage.** On a site whose mission is collecting $50,000, the pricing page is dark for nine of every ten prospects.

The flag was clearly intended as a stability guard, not a traffic limiter — `DEFAULTS.route_link_stability` is `true`. The percentage rollout is what betrays the intent.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/feature-flags.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// featureFlags reads import.meta.env at call time, so stub PROD per-test.
beforeEach(() => {
  vi.resetModules();
  (globalThis as any).localStorage = {
    _d: new Map<string, string>(),
    getItem(k: string) {
      return this._d.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      this._d.set(k, v);
    },
    removeItem(k: string) {
      this._d.delete(k);
    },
  };
  (globalThis as any).window = { location: { search: "" } };
});
afterEach(() => vi.restoreAllMocks());

describe("route_link_stability must not gate marketing routes by percentage", () => {
  it("is enabled for every production visitor regardless of seed", async () => {
    vi.stubEnv("PROD", "true");
    const { getFeatureFlag } = await import("../../src/config/featureFlags");

    // 200 distinct seeds stand in for distinct visitors. With a 10% rollout
    // roughly 180 of these would be false, which is the live bug.
    const seeds = Array.from(
      { length: 200 },
      (_, i) => `visitor-${i}@example.com`,
    );
    const enabled = seeds.filter((s) =>
      getFeatureFlag("route_link_stability", { seed: s }),
    );

    expect(enabled.length).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/feature-flags.test.ts`
Expected: FAIL. Received something near `20`, expected `200`.

- [ ] **Step 3: Make the route no longer depend on a percentage rollout**

The narrowest correct fix is to stop treating a stability guard as an experiment. Edit `src/routes/MarketingRoute.tsx`, replacing lines 70-73:

```tsx
const routeLinkStability = useMemo(
  () => getFeatureFlag("route_link_stability", { seed: user?.email }),
  [user?.email],
);
```

with:

```tsx
// Marketing routes are not an experiment. This was gated behind a 10%
// percentage rollout (featureFlags DEFAULT_PERCENT_PROD), which redirected
// roughly 90% of pricing, features, FAQ, and gallery visitors back to the
// homepage. A URL override is kept so the old bounce behavior stays
// reproducible for debugging: /pricing?ff_route_link_stability=0
const routeLinkStability = useMemo(
  () => readFeatureFlagOverride("route_link_stability") ?? true,
  [],
);
```

Then add the override reader to `src/config/featureFlags.ts` (it currently has `readUrlOverride` and `readLocalOverride` as private functions). Append this export:

```ts
/** Public override reader: URL param wins, then localStorage, else null. */
export function readFeatureFlagOverride(key: FeatureFlagKey): boolean | null {
  const urlOverride = readUrlOverride(key);
  if (urlOverride !== null) return urlOverride;
  return readLocalOverride(key);
}
```

Add the import in `src/routes/MarketingRoute.tsx` alongside the existing `getFeatureFlag` import:

```tsx
import {
  getFeatureFlag,
  readFeatureFlagOverride,
} from "../config/featureFlags";
```

- [ ] **Step 4: Update the test to match the shipped behavior**

Replace the test body from Step 1 with one that tests the real contract:

```ts
describe("route_link_stability override contract", () => {
  it("defaults on with no override present", async () => {
    const { readFeatureFlagOverride } =
      await import("../../src/config/featureFlags");
    expect(readFeatureFlagOverride("route_link_stability") ?? true).toBe(true);
  });

  it("honors an explicit URL opt-out for debugging", async () => {
    (globalThis as any).window = {
      location: { search: "?ff_route_link_stability=0" },
    };
    const { readFeatureFlagOverride } =
      await import("../../src/config/featureFlags");
    expect(readFeatureFlagOverride("route_link_stability")).toBe(false);
  });
});
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/unit/feature-flags.test.ts && npx tsc --noEmit`
Expected: 2 passed, 0 TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/MarketingRoute.tsx src/config/featureFlags.ts tests/unit/feature-flags.test.ts
git commit -m "fix(marketing): stop bouncing 90% of pricing visitors to the homepage

route_link_stability resolved through inRolloutPercent, which defaults to
DEFAULT_PERCENT_PROD=10 when no VITE_FF_PERCENT_* env var is set. No such var
exists in production, so roughly 9 of 10 visitors to /pricing, /features,
/faq, and /gallery hit window.location.replace('/'). Marketing routes are not
an experiment; default them on and keep a URL override for debugging."
```

---

### Task 2: Remove the fabricated social proof

**Files:**

- Modify: `components/PricingPage.tsx:255-260`

**Interfaces:**

- Consumes: nothing
- Produces: nothing

**Why:** `components/PricingPage.tsx:258-259` renders a hardcoded `4.9/5` "from verified agents". There is no review source anywhere in the repository, and Vellum's entire customer base is two dormant early-bird subscribers plus one comped account. This is invented social proof on a live commercial page. It is explicitly on the master brief's permanently-prohibited list ("Fake reviews, testimonials, results, followers, scarcity, or engagement") and it is an FTC endorsement-guide exposure. `PricingPage` is rendered by both `src/vellum/VellumLanding.tsx:356` and `src/routes/MarketingRoute.tsx:110`, so it is on the live landing page.

- [ ] **Step 1: Read the surrounding block**

Run: `sed -n '245,270p' components/PricingPage.tsx`
Expected: a trust/rating row containing the `4.9/5` and `from verified agents` spans.

- [ ] **Step 2: Delete the rating element**

Remove the entire rating element (the star row, the `4.9/5` span at line 258, and the `from verified agents` span at line 259). Do not replace it with a different unsourced claim. If a trust signal is wanted in that slot, the honest available one is the virtual-staging disclosure commitment, but adding new marketing copy is Thomas's call, so leave the slot empty.

- [ ] **Step 3: Verify no other fabricated proof survives**

Run:

```bash
grep -rniE "[0-9]\.[0-9]/5|verified agents|trusted by [0-9]|[0-9,]+ agents use" \
  --include="*.tsx" --include="*.ts" components src | grep -v node_modules
```

Expected: no hits that assert a quantity, rating, or testimonial. Report any hit to Thomas rather than silently editing marketing claims.

- [ ] **Step 4: Build and typecheck**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/PricingPage.tsx
git commit -m "fix(pricing): remove unsourced 4.9/5 rating claim

No review source exists in the repo or in any connected system, and the live
customer base cannot support an aggregate rating. Unsourced ratings on a
commercial page are an FTC endorsement exposure."
```

---

### Task 3: Add the billing auth helper and fix the origin allowlist

**Files:**

- Create: `api/_lib/billing-auth.ts`
- Modify: `api/_lib/auth-middleware.ts:21-25`
- Test: `tests/unit/billing-auth.test.ts` (create)

**Interfaces:**

- Consumes: `requireSession`, `applyCors` from `api/_lib/auth-middleware.js`; `isAdminEmail` from `../../shared/monetization.js`
- Produces:
  - `requireBillingSession(req, res, opts?: { actingOn?: string }): Promise<SessionClaims | null>` — returns claims, or null after writing 401/403.

**Why the extra helper:** plain `requireSession` proves _someone_ is logged in. It does not prove they are the person whose billing they are touching. `api/stripe-portal.ts` takes an arbitrary `email` and opens that customer's Stripe portal; a logged-in attacker could still open Lawson's portal. `requireBillingSession` binds the two.

**Origin fix:** `api/_lib/auth-middleware.ts:21-25` lists `studioai.averyandbryant.com` and localhost. The app now lives at `vellum.homes`, and the preview regex only matches `studioai-*`. Same-origin browser calls are unaffected (cookies ride along and CORS is not consulted), but any future cross-origin or tooling call from the real domain would be rejected. Fix it in the same task since we are touching the file.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/billing-auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.AUTH_ENFORCE = "enforce";

function makeRes() {
  const res: any = { _status: 0, _body: "", _headers: {} };
  res.status = (s: number) => {
    res._status = s;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res._headers[k] = v;
    return res;
  };
  res.send = (b: string) => {
    res._body = b;
    return res;
  };
  res.end = () => res;
  return res;
}

async function signedCookieFor(email: string): Promise<string> {
  const { signSession } = await import("../../api/_lib/session");
  const token = await signSession({ email, sub: `sub-${email}` });
  return `vellum_session=${token}`;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("requireBillingSession", () => {
  it("rejects an anonymous caller with 401", async () => {
    const { requireBillingSession } =
      await import("../../api/_lib/billing-auth");
    const res = makeRes();
    const claims = await requireBillingSession({ headers: {} }, res);
    expect(claims).toBeNull();
    expect(res._status).toBe(401);
  });

  it("rejects acting on another customer's email with 403", async () => {
    const { requireBillingSession } =
      await import("../../api/_lib/billing-auth");
    const res = makeRes();
    const req = {
      headers: { cookie: await signedCookieFor("attacker@example.com") },
    };
    const claims = await requireBillingSession(req, res, {
      actingOn: "lawson@hdhomesar.com",
    });
    expect(claims).toBeNull();
    expect(res._status).toBe(403);
  });

  it("allows acting on your own email", async () => {
    const { requireBillingSession } =
      await import("../../api/_lib/billing-auth");
    const res = makeRes();
    const req = {
      headers: { cookie: await signedCookieFor("owner@example.com") },
    };
    const claims = await requireBillingSession(req, res, {
      actingOn: "OWNER@example.com",
    });
    expect(claims?.email).toBe("owner@example.com");
    expect(res._status).toBe(0);
  });

  it("allows an admin to act on any email", async () => {
    const { requireBillingSession } =
      await import("../../api/_lib/billing-auth");
    const res = makeRes();
    const req = {
      headers: { cookie: await signedCookieFor("book@averyandbryant.com") },
    };
    const claims = await requireBillingSession(req, res, {
      actingOn: "someone@else.com",
    });
    expect(claims?.email).toBe("book@averyandbryant.com");
    expect(res._status).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/billing-auth.test.ts`
Expected: FAIL, cannot resolve `../../api/_lib/billing-auth`.

- [ ] **Step 3: Create the helper**

Create `api/_lib/billing-auth.ts`:

```ts
/**
 * api/_lib/billing-auth.ts — the gate every money endpoint runs first.
 *
 * requireSession proves that SOMEONE is signed in. It does not prove they are
 * the customer whose billing they are touching. Every billing endpoint in this
 * repo historically identified the customer by an email in the request body,
 * which made "know an email" equivalent to "authorized". requireBillingSession
 * binds the session identity to the record being acted on, and lets admins
 * through for support work.
 */
import { requireSession } from "./auth-middleware.js";
import type { SessionClaims } from "./session.js";
import { isAdminEmail } from "../../shared/monetization.js";

export type BillingAuthOptions = {
  /** The customer email this request will read or mutate, if any. */
  actingOn?: string;
};

function norm(email: string | null | undefined): string {
  return (email || "").toLowerCase().trim();
}

/**
 * Require a valid session AND, when `actingOn` is supplied, require that the
 * session belongs to that customer (or to an admin). Returns claims, or null
 * after writing 401 (not signed in) or 403 (signed in as someone else).
 */
export async function requireBillingSession(
  req: any,
  res: any,
  opts: BillingAuthOptions = {},
): Promise<SessionClaims | null> {
  const claims = await requireSession(req, res);
  if (!claims) return null; // requireSession already wrote 401/503

  const target = norm(opts.actingOn);
  if (!target) return claims;

  const caller = norm(claims.email);
  if (caller === target) return claims;
  if (isAdminEmail(caller)) return claims;

  console.warn(
    `[billing-auth] denied: ${caller} attempted to act on ${target}`,
  );
  res.status(403);
  res.setHeader("Content-Type", "application/json");
  res.send(
    JSON.stringify({
      ok: false,
      error: "not authorized for this account",
      code: "forbidden",
    }),
  );
  return null;
}
```

- [ ] **Step 4: Add vellum.homes to the origin allowlist**

Edit `api/_lib/auth-middleware.ts`, replacing lines 21-25:

```ts
const APP_ORIGINS = [
  "https://vellum.homes",
  "https://www.vellum.homes",
  "https://studioai.averyandbryant.com",
  "http://localhost:3000",
  "http://localhost:3100",
];
```

- [ ] **Step 5: Run tests, typecheck, and the api contract check**

Run: `npx vitest run tests/unit/billing-auth.test.ts && npx tsc --noEmit && npm run check:api`
Expected: 4 passed, 0 TS errors, contract check clean.

If the cookie name in the test does not match `readSessionCookie`'s expectation, read `api/_lib/session.ts` for the actual cookie name and correct the test's `signedCookieFor` helper. Do not change production code to match a guessed test.

- [ ] **Step 6: Commit**

```bash
git add api/_lib/billing-auth.ts api/_lib/auth-middleware.ts tests/unit/billing-auth.test.ts
git commit -m "feat(auth): add requireBillingSession and allowlist vellum.homes

Binds session identity to the customer record being acted on so that knowing
an email is no longer equivalent to being authorized. Admins bypass for support."
```

---

### Task 3b: Close the unmetered Replicate faucet (`/api/lab-run`)

**Files:**

- Modify: `api/lab-run.ts` (auth block around line 53)
- Test: `tests/unit/lab-run-auth.test.ts` (create)

**Interfaces:**

- Consumes: `isAdminEmail` from `../shared/monetization.js`
- Produces: nothing

**Why this jumped the queue:** `api/lab-run.ts` accepts an arbitrary Replicate `modelSlug` and an arbitrary `input` payload, then calls `replicate.run(...)` with **no quota reservation**. Its own header comment says "requires a verified session ... so this generic Replicate proxy isn't an anonymous faucet" and "No quota decrement — Model Lab is an internal admin surface". Both halves are true, and together they are the bug: the endpoint is gated by `requireSession` alone, and there is no server-side admin check anywhere in the file. The admin gate is client-side only.

So any person who signs up for the free tier with a Google account can run **any model on Replicate**, including the expensive video models, at unlimited volume, billed to the shared Avery & Bryant Replicate account. That account funds the morph engine and every other project. The repository's own `CLAUDE.md` states the rule this violates: "Replicate is one shared account across projects, so a runaway in one place drains the shared bill. Every paid generation path reserves quota or has a per-day cap on our side."

For scale: the accidental morph polling loop burned roughly $298 in duplicate clips. That was a bug firing the same cheap clip repeatedly. This is a deliberate caller choosing the model.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lab-run-auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.REPLICATE_API_TOKEN = "r8_dummy";
process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.AUTH_ENFORCE = "enforce";

const handler = (await import("../../api/lab-run")).default;

function makeRes() {
  const res: any = { _status: 0, _body: "", _headers: {} };
  res.status = (s: number) => {
    res._status = s;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res._headers[k] = v;
    return res;
  };
  res.send = (b: string) => {
    res._body = b;
    return res;
  };
  res.end = () => res;
  return res;
}

async function signedCookieFor(email: string): Promise<string> {
  const { signSession } = await import("../../api/_lib/session");
  return `vellum_session=${await signSession({ email, sub: `sub-${email}` })}`;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("lab-run is admin-only", () => {
  it("refuses an ordinary signed-in user with 403", async () => {
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("freeuser@gmail.com") },
        body: { modelSlug: "some/expensive-video-model", input: {} },
      },
      res,
    );
    expect(res._status).toBe(403);
  });

  it("allows an admin", async () => {
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("book@averyandbryant.com") },
        body: { modelSlug: "", input: {} }, // empty slug: fails validation, not auth
      },
      res,
    );
    expect(res._status).toBe(400); // got past the auth gate
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/lab-run-auth.test.ts`
Expected: FAIL. The ordinary user is not rejected with 403.

- [ ] **Step 3: Add the server-side admin check**

In `api/lab-run.ts`, add to the imports:

```ts
import { isAdminEmail } from "../shared/monetization.js";
```

Immediately after the existing `const session = await requireSession(req, res);` block (line 53) and its null check, insert:

```ts
// Model Lab runs arbitrary Replicate models with no quota reservation, so a
// valid session is not sufficient authorization. Without this check any free
// signup can pick an expensive model and bill the shared Replicate account.
if (!isAdminEmail(session.email)) {
  console.warn(`[lab-run] denied non-admin ${session.email}`);
  json(res, 403, { ok: false, error: "not authorized", code: "forbidden" });
  return;
}
```

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run tests/unit/lab-run-auth.test.ts && npx tsc --noEmit && npm run check:api`
Expected: 2 passed, clean.

- [ ] **Step 5: Gate the two remaining open write endpoints**

`api/record-generation.ts` and `api/usage.ts` are both unauthenticated with wildcard CORS and take `email` from the request. `record-generation` writes cost rows into `generation_logs`, so an anonymous caller can pollute the only cost data the business has. Apply the same treatment as Task 5: swap `setCors` for `applyCors`, then add

```ts
const claims = await requireBillingSession(req, res, {
  actingOn:
    (body.email || req.query?.email || "").toLowerCase().trim() || undefined,
});
if (!claims) return;
```

after the body parse in each.

Run: `npx vitest run && npx tsc --noEmit && npm run check:api`
Expected: full suite green.

- [ ] **Step 6: Commit**

```bash
git add api/lab-run.ts api/record-generation.ts api/usage.ts tests/unit/lab-run-auth.test.ts
git commit -m "fix(security): make Model Lab admin-only and gate usage writes

lab-run proxied arbitrary Replicate models with no quota reservation behind a
plain session check, so any free signup could bill the shared Replicate
account without limit. The admin gate existed only on the client."
```

---

### Task 4: Close the billing portal IDOR

**Files:**

- Modify: `api/stripe-portal.ts` (whole file)
- Test: `tests/unit/stripe-portal.test.ts` (create)

**Interfaces:**

- Consumes: `requireBillingSession` from `./_lib/billing-auth.js`, `applyCors` from `./_lib/auth-middleware.js`
- Produces: nothing

**Why:** `api/stripe-portal.ts:19-24` accepts `email` from the body with no authentication, looks up that Stripe customer, and returns a billing portal URL. That URL lets the holder view invoices, change the payment method, and cancel the subscription. Any stranger who knows a customer's email address can do this today.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/stripe-portal.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.AUTH_ENFORCE = "enforce";

const handler = (await import("../../api/stripe-portal")).default;

function makeRes() {
  const res: any = { _status: 0, _body: "", _headers: {} };
  res.status = (s: number) => {
    res._status = s;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res._headers[k] = v;
    return res;
  };
  res.send = (b: string) => {
    res._body = b;
    return res;
  };
  res.end = () => res;
  return res;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("stripe-portal authorization", () => {
  it("refuses an unauthenticated request and never calls Stripe", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const res = makeRes();
    await handler(
      { method: "POST", headers: {}, body: { email: "victim@example.com" } },
      res,
    );
    expect(res._status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/stripe-portal.test.ts`
Expected: FAIL. Status is 400 or 404, and Stripe was called.

- [ ] **Step 3: Rewrite the handler**

Replace the whole of `api/stripe-portal.ts`:

```ts
import { json, rejectMethod, parseBody } from "./utils.js";
import { applyCors } from "./_lib/auth-middleware.js";
import { requireBillingSession } from "./_lib/billing-auth.js";

export const config = { runtime: "nodejs" };

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "POST,OPTIONS")) return;
  if (rejectMethod(req, res, "POST")) return;

  if (!STRIPE_SECRET_KEY) {
    json(res, 500, { ok: false, error: "Stripe not configured" });
    return;
  }

  try {
    const body = parseBody(req.body);

    // The portal is always opened for the signed-in customer. An email in the
    // body is ignored for identity; it is only honored for admins doing
    // support, and even then it must pass requireBillingSession.
    const requested = (body.email || "").toLowerCase().trim();
    const claims = await requireBillingSession(req, res, {
      actingOn: requested || undefined,
    });
    if (!claims) return;

    const email = requested || (claims.email || "").toLowerCase().trim();
    if (!email) {
      json(res, 400, { ok: false, error: "email is required" });
      return;
    }

    // returnUrl is attacker-controllable, so never reflect it. Stripe redirects
    // the customer here after they finish, which makes it an open-redirect
    // vector if taken from the body.
    const origin = "https://vellum.homes";

    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'`,
      { headers: { Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ":")}` } },
    ).then((r) => r.json());

    if (!searchRes.data || searchRes.data.length === 0) {
      json(res, 404, { ok: false, error: "No customer found" });
      return;
    }

    const portalRes = await fetch(
      "https://api.stripe.com/v1/billing_portal/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(STRIPE_SECRET_KEY + ":")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: searchRes.data[0].id,
          return_url: origin,
        }).toString(),
      },
    ).then((r) => r.json());

    json(res, 200, { ok: true, url: portalRes.url });
  } catch (err: any) {
    console.error("Portal error:", err);
    json(res, 500, { ok: false, error: err.message || "Internal error" });
  }
}
```

- [ ] **Step 4: Run tests and checks**

Run: `npx vitest run tests/unit/stripe-portal.test.ts && npx tsc --noEmit && npm run check:api`
Expected: 1 passed, clean.

- [ ] **Step 5: Confirm the client still works**

Run: `grep -rn "stripe-portal" --include="*.tsx" --include="*.ts" src components | grep -v node_modules`
Expected: relative-path `fetch('/api/stripe-portal', ...)` calls. Relative paths are same-origin, so the session cookie is sent by default and no `credentials` option is required. If any caller uses an absolute URL, it must add `credentials: 'include'`.

- [ ] **Step 6: Commit**

```bash
git add api/stripe-portal.ts tests/unit/stripe-portal.test.ts
git commit -m "fix(billing): require session to open a Stripe billing portal

Anyone who knew a customer's email could open that customer's portal and view
invoices, change the card, or cancel the subscription. Also stops reflecting a
body-supplied return_url, which was an open redirect."
```

---

### Task 5: Close the pause/resume and status IDORs

**Files:**

- Modify: `api/stripe-checkout.ts` (handler dispatch at 415-427, `handlePauseSubscription` at 339, `handleResumeSubscription`)
- Modify: `api/stripe-status.ts` (handler entry)
- Test: `tests/unit/stripe-checkout-auth.test.ts` (create)

**Interfaces:**

- Consumes: `requireBillingSession` from `./_lib/billing-auth.js`
- Produces: nothing

**Why:** `handlePauseSubscription` (`api/stripe-checkout.ts:339-344`) takes `email` and pauses that customer's subscription with no authentication. `handleResumeSubscription` mirrors it. `api/stripe-status.ts` returns plan, credits, and Stripe identifiers for any email supplied.

Note the asymmetry to preserve: `subscribe` and `credits` actions create a checkout for the _caller_, so they must also be bound to the session, but a brand-new user has a session (they signed in with Google before reaching pricing), so gating them is safe.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/stripe-checkout-auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.SUPABASE_URL = "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "dummy_service_key";
process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.AUTH_ENFORCE = "enforce";

const handler = (await import("../../api/stripe-checkout")).default;

function makeRes() {
  const res: any = { _status: 0, _body: "", _headers: {} };
  res.status = (s: number) => {
    res._status = s;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res._headers[k] = v;
    return res;
  };
  res.send = (b: string) => {
    res._body = b;
    return res;
  };
  res.end = () => res;
  return res;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("stripe-checkout authorization", () => {
  for (const action of [
    "pause_subscription",
    "resume_subscription",
    "fulfill",
  ]) {
    it(`refuses anonymous ${action} without calling Stripe`, async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;
      const res = makeRes();
      await handler(
        {
          method: "POST",
          headers: {},
          body: {
            action,
            email: "victim@example.com",
            days: 90,
            sessionId: "cs_test_1",
          },
        },
        res,
      );
      expect(res._status).toBe(401);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/stripe-checkout-auth.test.ts`
Expected: FAIL, all three actions reached Stripe.

- [ ] **Step 3: Gate the dispatcher**

In `api/stripe-checkout.ts`, add the import at the top alongside the existing imports:

```ts
import { applyCors } from "./_lib/auth-middleware.js";
import { requireBillingSession } from "./_lib/billing-auth.js";
```

Then in the default handler, replace the action dispatch block (currently lines 419-427) with:

```ts
const action = body.action || "subscribe";

// Every action here either moves money or changes a subscription, so all of
// them require a session bound to the email being acted on.
const claims = await requireBillingSession(req, res, {
  actingOn: (body.email || "").toLowerCase().trim() || undefined,
});
if (!claims) return;

if (action === "subscribe") return await handleSubscribe(body, res);
if (action === "credits") return await handleCreditCheckout(body, res);
if (action === "fulfill") return await handleFulfillCredits(body, res, claims);
if (action === "pause_subscription")
  return await handlePauseSubscription(body, res);
if (action === "resume_subscription")
  return await handleResumeSubscription(body, res);

json(res, 400, { ok: false, error: `Unknown action: ${action}` });
```

Also replace the `setCors(res, ...)` call at the top of the handler with `if (applyCors(req, res, 'POST,OPTIONS')) return;` and delete the now-unused `setCors`/`handleOptions` imports if nothing else in the file uses them.

Note: `handleFulfillCredits` gains a third parameter here. Task 6 rewrites that function to use it. If Task 6 has not run yet, add `claims: any` to its signature and ignore it so this task compiles standalone.

- [ ] **Step 4: Gate stripe-status the same way**

In `api/stripe-status.ts`, add the same two imports, swap `setCors` for `applyCors`, and immediately after parsing the body insert:

```ts
const claims = await requireBillingSession(req, res, {
  actingOn:
    (body.email || req.query?.email || "").toLowerCase().trim() || undefined,
});
if (!claims) return;
```

`stripe-status` accepts the email via query string as well as body, so both must be covered.

- [ ] **Step 5: Run the full unit suite**

Run: `npx vitest run && npx tsc --noEmit && npm run check:api`
Expected: all tests pass, including the pre-existing `tests/unit/stripe-status.test.ts`.

`stripe-status.test.ts` will now fail, because it calls the handler with no session. Fix it by adding a signed session cookie to the mock request, using the same `signedCookieFor` helper pattern from Task 3. Do not weaken production code to keep an old test green.

- [ ] **Step 6: Commit**

```bash
git add api/stripe-checkout.ts api/stripe-status.ts tests/unit/stripe-checkout-auth.test.ts tests/unit/stripe-status.test.ts
git commit -m "fix(billing): require a bound session for pause, resume, status, and checkout

Pause and resume accepted any email with no auth, letting anyone suspend
another customer's subscription. Status leaked plan, credits, and Stripe IDs."
```

---

### Task 6: Make credit fulfillment idempotent

**Files:**

- Create: `docs/migrations/2026-07-20_credit_fulfillments.sql`
- Modify: `api/stripe-checkout.ts` `handleFulfillCredits` (currently lines 306-334)
- Test: `tests/unit/credit-fulfillment.test.ts` (create)

**Interfaces:**

- Consumes: `claims` from the dispatcher gate added in Task 5
- Produces: nothing

**Why:** `handleFulfillCredits` confirms with Stripe that a session is paid, then calls the `add_credits` RPC, which is a bare increment. There is no record that the session was ever fulfilled. Replaying the same `sessionId` grants credits again, without limit. This is a browser-triggered callback, so the caller controls when and how often it fires.

**The fix shape:** claim the session id in a table with a unique constraint _before_ granting. If the insert conflicts, the session was already fulfilled and we return the original result without granting again. This is the same `sbClaim` pattern that fixed the morph engine's ~$298 runaway, applied to money instead of compute.

- [ ] **Step 1: Write the migration**

Create `docs/migrations/2026-07-20_credit_fulfillments.sql`:

```sql
-- Idempotency ledger for Stripe credit-pack fulfillment.
-- The primary key IS the idempotency guarantee: a second fulfillment attempt
-- for the same checkout session conflicts and is rejected before any credits
-- are granted.
create table if not exists public.credit_fulfillments (
  stripe_session_id text primary key,
  user_email        text        not null,
  credits           integer     not null check (credits > 0),
  amount_cents      integer,
  fulfilled_at      timestamptz not null default now()
);

create index if not exists credit_fulfillments_email_idx
  on public.credit_fulfillments (user_email, fulfilled_at desc);

-- Service-role only. No anon or authenticated access: this is a financial
-- record and the app reaches it exclusively through the service key.
alter table public.credit_fulfillments enable row level security;
```

- [ ] **Step 2: Apply the migration**

This is an additive, reversible change (a new table, no data migration, no column drops), so it does not hit the master brief's "irreversible database changes" approval gate. Apply it to the Vellum Supabase project `pvaalbzrorkonzgkvvnv` via the Supabase MCP `apply_migration`, or paste it into the SQL editor.

Verify:

```sql
select count(*) from public.credit_fulfillments;
```

Expected: `0`, no error.

Note for the record: this repo has 19 migrations applied live but only one checked in. Adding this file starts closing that gap; it does not fix the existing history.

- [ ] **Step 3: Write the failing test**

Create `tests/unit/credit-fulfillment.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.SUPABASE_URL = "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "dummy_service_key";
process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.AUTH_ENFORCE = "enforce";

const handler = (await import("../../api/stripe-checkout")).default;

function makeRes() {
  const res: any = { _status: 0, _body: "", _headers: {} };
  res.status = (s: number) => {
    res._status = s;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res._headers[k] = v;
    return res;
  };
  res.send = (b: string) => {
    res._body = b;
    return res;
  };
  res.end = () => res;
  return res;
}

async function signedCookieFor(email: string): Promise<string> {
  const { signSession } = await import("../../api/_lib/session");
  return `vellum_session=${await signSession({ email, sub: `sub-${email}` })}`;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("credit fulfillment idempotency", () => {
  it("grants once and refuses the replay without calling add_credits again", async () => {
    let claimed = false;
    const addCreditsCalls: string[] = [];

    global.fetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      if (u.includes("/checkout/sessions/")) {
        return {
          ok: true,
          json: async () => ({
            payment_status: "paid",
            amount_total: 1500,
            metadata: { credits: "10", email: "buyer@example.com" },
          }),
        } as any;
      }
      if (u.includes("/rest/v1/credit_fulfillments")) {
        if (claimed) {
          // Postgres unique violation on replay.
          return {
            ok: false,
            status: 409,
            text: async () => "duplicate key",
          } as any;
        }
        claimed = true;
        return { ok: true, status: 201, text: async () => "[]" } as any;
      }
      if (u.includes("/rpc/add_credits")) {
        addCreditsCalls.push(String(init?.body || ""));
        return { ok: true, json: async () => ({}) } as any;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as any;

    const cookie = await signedCookieFor("buyer@example.com");
    const req = () => ({
      method: "POST",
      headers: { cookie },
      body: {
        action: "fulfill",
        sessionId: "cs_test_replay",
        email: "buyer@example.com",
      },
    });

    const first = makeRes();
    await handler(req(), first);
    expect(first._status).toBe(200);
    expect(addCreditsCalls.length).toBe(1);

    const second = makeRes();
    await handler(req(), second);
    expect(JSON.parse(second._body).already_fulfilled).toBe(true);
    expect(addCreditsCalls.length).toBe(1); // still 1: no second grant
  });
});
```

- [ ] **Step 3b: Run the test to verify it fails**

Run: `npx vitest run tests/unit/credit-fulfillment.test.ts`
Expected: FAIL, `addCreditsCalls.length` is 2 after the replay.

- [ ] **Step 4: Rewrite handleFulfillCredits**

Replace `api/stripe-checkout.ts` lines 305-334 with:

```ts
// ─── Post-purchase credit fulfillment ───────────────────────────────────────
// Idempotent by construction: the checkout session id is claimed in
// credit_fulfillments (primary key) BEFORE any credits are granted. A replay
// of the same sessionId conflicts on insert and returns without granting.
async function handleFulfillCredits(body: any, res: any, claims: any) {
  const { sessionId } = body;
  if (!sessionId || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(res, 400, { ok: false, error: "Missing params" });
  }

  const session = await stripeFetch(`/checkout/sessions/${sessionId}`);
  if (session.payment_status !== "paid") {
    return json(res, 400, { ok: false, error: "Payment not completed" });
  }

  const creditAmount = parseInt(session.metadata?.credits || "0", 10);
  const customerEmail = (
    session.metadata?.email ||
    session.customer_email ||
    ""
  ).toLowerCase();
  if (!creditAmount || !customerEmail) {
    return json(res, 400, {
      ok: false,
      error: "Missing credit/email metadata",
    });
  }

  // A signed-in user may only fulfill their own purchase. Admins may fulfill
  // on a customer's behalf for support.
  const caller = (claims?.email || "").toLowerCase().trim();
  const isAdmin = ADMIN_EMAIL_DOMAINS.some((d: string) =>
    caller.endsWith(`@${d}`),
  );
  if (caller !== customerEmail && !isAdmin) {
    return json(res, 403, {
      ok: false,
      error: "not authorized for this purchase",
    });
  }

  // Claim first. Conflict means someone already fulfilled this session.
  const claim = await fetch(`${SUPABASE_URL}/rest/v1/credit_fulfillments`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      stripe_session_id: sessionId,
      user_email: customerEmail,
      credits: creditAmount,
      amount_cents: session.amount_total ?? null,
    }),
  });

  if (!claim.ok) {
    if (claim.status === 409) {
      console.warn(`[credits] replay blocked for session ${sessionId}`);
      return json(res, 200, {
        ok: true,
        already_fulfilled: true,
        credits: creditAmount,
      });
    }
    const text = await claim.text();
    console.error(`[credits] claim failed ${claim.status}: ${text}`);
    return json(res, 500, { ok: false, error: "Could not record fulfillment" });
  }

  await fetch(`${SUPABASE_URL}/rest/v1/rpc/add_credits`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_email: customerEmail, amount: creditAmount }),
  });

  return json(res, 200, { ok: true, credits: creditAmount });
}
```

Add `ADMIN_EMAIL_DOMAINS` to the existing `shared/monetization.js` import at the top of the file.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/credit-fulfillment.test.ts && npx tsc --noEmit && npm run check:api`
Expected: 1 passed, clean.

- [ ] **Step 6: Commit**

```bash
git add docs/migrations/2026-07-20_credit_fulfillments.sql api/stripe-checkout.ts tests/unit/credit-fulfillment.test.ts
git commit -m "fix(billing): make credit fulfillment idempotent and owner-bound

Replaying a paid checkout sessionId minted credits every time, without limit.
The session id is now claimed in credit_fulfillments before any grant, and the
caller must own the purchase."
```

---

### Task 7: Derive subscription price server-side in the referral flow

**Files:**

- Modify: `api/referral.ts` `checkout` action (lines 240-345)
- Test: `tests/unit/referral-checkout.test.ts` (create)

**Interfaces:**

- Consumes: `PLAN_PRICING_USD`, `EARLY_BIRD_MONTHLY_USD` from `../shared/monetization.js`; `requireBillingSession` from `./_lib/billing-auth.js`
- Produces: nothing

**Why:** `api/referral.ts:249` is `const priceInCents = body.price || 2900;`. That value is used to find or create a Stripe price and to build a subscription checkout. A caller can name any price. Worse, the created subscription carries `price_locked` metadata but **no `studioai_plan`**, and `api/_lib/quota.ts:53-56` falls back to `"pro"` for any active subscription without plan metadata. So a one-cent subscription resolves to Pro, which `hasUnlimitedGeneration` treats as unlimited generation against the shared Replicate account.

**Server-derived rule:** the only two legitimate prices in this flow are the standard Pro monthly rate and the early-bird rate, and eligibility for early bird is a server-side fact (an unclaimed `early_bird_slots` row or existing grandfather metadata). The client gets no say.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/referral-checkout.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.SUPABASE_URL = "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "dummy_service_key";
process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.AUTH_ENFORCE = "enforce";

const handler = (await import("../../api/referral")).default;

function makeRes() {
  const res: any = { _status: 0, _body: "", _headers: {} };
  res.status = (s: number) => {
    res._status = s;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res._headers[k] = v;
    return res;
  };
  res.send = (b: string) => {
    res._body = b;
    return res;
  };
  res.end = () => res;
  return res;
}

async function signedCookieFor(email: string): Promise<string> {
  const { signSession } = await import("../../api/_lib/session");
  return `vellum_session=${await signSession({ email, sub: `sub-${email}` })}`;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("referral checkout pricing", () => {
  it("ignores a client-supplied price and uses the server catalog", async () => {
    const createdPrices: Record<string, string>[] = [];

    global.fetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      if (u.includes("/customers/search"))
        return {
          ok: true,
          json: async () => ({ data: [{ id: "cus_1" }] }),
        } as any;
      if (u.includes("/subscriptions?"))
        return { ok: true, json: async () => ({ data: [] }) } as any;
      if (u.includes("/products/search"))
        return { ok: true, json: async () => ({ data: [] }) } as any;
      if (u.includes("/rest/v1/early_bird_slots"))
        return { ok: true, text: async () => "[]" } as any;
      if (u.includes("/v1/products"))
        return { ok: true, json: async () => ({ id: "prod_1" }) } as any;
      if (u.includes("/v1/prices")) {
        const parsed = Object.fromEntries(
          new URLSearchParams(String(init?.body || "")),
        );
        createdPrices.push(parsed as Record<string, string>);
        return { ok: true, json: async () => ({ id: "price_1" }) } as any;
      }
      if (u.includes("/checkout/sessions")) {
        return {
          ok: true,
          json: async () => ({ url: "https://stripe.test/x", id: "cs_1" }),
        } as any;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as any;

    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("buyer@example.com") },
        body: {
          action: "checkout",
          email: "buyer@example.com",
          userId: "u1",
          price: 1,
        },
      },
      res,
    );

    // $59.00 Pro, never the 1 cent the caller asked for.
    expect(createdPrices.some((p) => p.unit_amount === "1")).toBe(false);
    expect(createdPrices.some((p) => p.unit_amount === "5900")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/referral-checkout.test.ts`
Expected: FAIL, a price with `unit_amount === "1"` was created.

- [ ] **Step 3: Replace the price derivation**

At the top of `api/referral.ts`, add:

```ts
import { applyCors } from "./_lib/auth-middleware.js";
import { requireBillingSession } from "./_lib/billing-auth.js";
import {
  PLAN_PRICING_USD,
  EARLY_BIRD_MONTHLY_USD,
} from "../shared/monetization.js";

const PRO_MONTHLY_CENTS = PLAN_PRICING_USD.pro.month * 100; // 5900
const EARLY_BIRD_CENTS = EARLY_BIRD_MONTHLY_USD * 100; // 1400
```

Inside the `checkout` action, delete the line `const priceInCents = body.price || 2900;` and insert, after `email` and `userId` are read and validated:

```ts
// Price is a server fact, never a client input. Early-bird eligibility
// is decided here by looking for an unclaimed slot; everyone else pays
// the catalog Pro rate. A body-supplied `price` is ignored entirely.
const slots = await supaFetch(
  `early_bird_slots?claimed_by=eq.${encodeURIComponent(email)}&select=id`,
).catch(() => null);
const isEarlyBird = Array.isArray(slots) && slots.length > 0;
const priceInCents = isEarlyBird ? EARLY_BIRD_CENTS : PRO_MONTHLY_CENTS;
```

Then change the product-name line from the old `2900` comparison to:

```ts
const productName = isEarlyBird ? "Vellum Pro (Early Bird)" : "Vellum Pro";
```

and the description ternary from `priceInCents === 2900 ? ... : ...` to `isEarlyBird ? 'Early bird unlimited AI staging, locked-in rate' : 'Unlimited AI staging for real estate agents'`.

Finally, in the `/checkout/sessions` call, add the plan marker so `quota.ts` never has to guess:

```ts
          'subscription_data[metadata][studioai_plan]': 'pro',
          'subscription_data[metadata][studioai_user_id]': userId,
          'subscription_data[metadata][price_locked]': String(priceInCents),
```

- [ ] **Step 4: Gate the endpoint**

Replace the `setCors(...)` call in the default handler with `if (applyCors(req, res, 'GET,POST,OPTIONS')) return;`, and for the `checkout` and `claim` actions add before any Stripe work:

```ts
const claims = await requireBillingSession(req, res, {
  actingOn: (body.email || "").toLowerCase().trim() || undefined,
});
if (!claims) return;
```

Leave the read-only `my_code` and `early_bird_status` actions ungated for now; they expose no money mutation. Note them in the PR description as a follow-up for information disclosure review.

- [ ] **Step 5: Run tests and checks**

Run: `npx vitest run tests/unit/referral-checkout.test.ts && npx tsc --noEmit && npm run check:api`
Expected: 1 passed, clean.

- [ ] **Step 6: Commit**

```bash
git add api/referral.ts tests/unit/referral-checkout.test.ts
git commit -m "fix(billing): derive referral checkout price server-side

body.price flowed straight into Stripe price creation, so any caller could
subscribe to Pro at any amount. Combined with quota.ts defaulting a
metadata-less subscription to pro, that bought unlimited generation for cents.
Price now comes from shared/monetization.ts and the plan is stamped explicitly."
```

---

### Task 8: Authenticate the brokerage endpoint and stop underselling Team

**Files:**

- Modify: `api/brokerage.ts:170-183` (handler entry) and `handleCheckout` price selection (lines 92-110)
- Test: `tests/unit/brokerage-auth.test.ts` (create)

**Interfaces:**

- Consumes: `requireBillingSession` from `./_lib/billing-auth.js`
- Produces: nothing

**Why, part one (auth):** `api/brokerage.ts:178` derives `adminEmail` from the request body or query and treats it as identity. Anyone can `POST {action:"create", adminEmail:"<their own>"}` to create a brokerage, then `add_agent` themselves into it. Membership in `brokerage_agents` is what `checkBrokerageAccess` reads to grant Pro-unlimited. So this endpoint hands out free unlimited generation to anyone who calls it. The same lack of auth lets a stranger call `remove_agent` against Lawson's brokerage and evict her agents.

**Why, part two (price):** `handleCheckout` selects `prices.data[0].id` with no check that the price amount matches the tier. `TIERS.team.price` is `14900` ($149), but the live Stripe `Vellum Team` product carries a price at **$119/mo**, so every Team subscription is created 20% under list. Match on `unit_amount` instead of taking whatever comes back first.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/brokerage-auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.SUPABASE_URL = "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "dummy_service_key";
process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.AUTH_ENFORCE = "enforce";

const handler = (await import("../../api/brokerage")).default;

function makeRes() {
  const res: any = { _status: 0, _body: "", _headers: {} };
  res.status = (s: number) => {
    res._status = s;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res._headers[k] = v;
    return res;
  };
  res.send = (b: string) => {
    res._body = b;
    return res;
  };
  res.end = () => res;
  return res;
}

async function signedCookieFor(email: string): Promise<string> {
  const { signSession } = await import("../../api/_lib/session");
  return `vellum_session=${await signSession({ email, sub: `sub-${email}` })}`;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("brokerage authorization", () => {
  it("refuses an anonymous brokerage creation", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          action: "create",
          adminEmail: "attacker@example.com",
          name: "Free Co",
        },
      },
      res,
    );
    expect(res._status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses acting as a different admin", async () => {
    global.fetch = vi.fn() as any;
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("attacker@example.com") },
        body: {
          action: "remove_agent",
          adminEmail: "lawson@hdhomesar.com",
          agentEmail: "agent@x.com",
        },
      },
      res,
    );
    expect(res._status).toBe(403);
  });
});

describe("brokerage tier pricing", () => {
  it("never selects a Stripe price whose amount differs from the tier", async () => {
    const sessions: Record<string, string>[] = [];
    global.fetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      if (u.includes("/customers/search"))
        return {
          ok: true,
          json: async () => ({ data: [{ id: "cus_1" }] }),
        } as any;
      if (u.includes("/subscriptions?"))
        return { ok: true, json: async () => ({ data: [] }) } as any;
      if (u.includes("/products/search"))
        return {
          ok: true,
          json: async () => ({ data: [{ id: "prod_team" }] }),
        } as any;
      if (u.includes("/v1/prices?product=")) {
        // The live account's stale $119 price, which must NOT be chosen.
        return {
          ok: true,
          json: async () => ({
            data: [{ id: "price_119", unit_amount: 11900 }],
          }),
        } as any;
      }
      if (u.includes("/v1/prices"))
        return { ok: true, json: async () => ({ id: "price_149" }) } as any;
      if (u.includes("/checkout/sessions")) {
        sessions.push(
          Object.fromEntries(
            new URLSearchParams(String(init?.body || "")),
          ) as Record<string, string>,
        );
        return {
          ok: true,
          json: async () => ({ url: "https://stripe.test/x", id: "cs_1" }),
        } as any;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as any;

    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("admin@example.com") },
        body: {
          action: "checkout",
          adminEmail: "admin@example.com",
          tier: "team",
        },
      },
      res,
    );

    expect(sessions[0]?.["line_items[0][price]"]).toBe("price_149");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/brokerage-auth.test.ts`
Expected: FAIL on all three.

- [ ] **Step 3: Gate the handler**

In `api/brokerage.ts`, add the imports:

```ts
import { applyCors } from "./_lib/auth-middleware.js";
import { requireBillingSession } from "./_lib/billing-auth.js";
```

Replace `setCors(res, ...)`/`handleOptions` at the handler entry with `if (applyCors(req, res, 'GET,POST,OPTIONS')) return;`, and immediately after `adminEmail` is derived (line 178) and the empty check passes, insert:

```ts
// adminEmail is a claim, not an identity. Bind it to the session.
const claims = await requireBillingSession(req, res, { actingOn: adminEmail });
if (!claims) return;
```

- [ ] **Step 4: Fix the price selection**

In `handleCheckout`, replace the price-selection block (lines 96-104) with:

```ts
  let priceId: string;
  if (products.data && products.data.length > 0) {
    const prices = await stripeFetch(
      `/prices?product=${products.data[0].id}&active=true&type=recurring`
    );
    // Match the amount. Taking prices.data[0] blindly is how Team ended up
    // selling at a stale $119 against a $149 catalog entry.
    const exact = prices.data?.find((p: any) => p.unit_amount === tierConfig.price);
    if (exact) {
      priceId = exact.id;
    } else {
      const price = await stripeRequest('/prices', {
        product: products.data[0].id,
        unit_amount: String(tierConfig.price),
        currency: 'usd',
        'recurring[interval]': 'month',
      });
      priceId = price.id;
    }
```

- [ ] **Step 5: Run tests and checks**

Run: `npx vitest run tests/unit/brokerage-auth.test.ts && npx tsc --noEmit && npm run check:api`
Expected: 3 passed, clean.

- [ ] **Step 6: Commit**

```bash
git add api/brokerage.ts tests/unit/brokerage-auth.test.ts
git commit -m "fix(billing): authenticate brokerage endpoint and match tier price exactly

adminEmail from the request body was treated as identity, so anyone could
create a brokerage, seat themselves into unlimited Pro, or evict another
brokerage's agents. Checkout also picked prices.data[0] with no amount check,
selling Team at a stale \$119 against the \$149 catalog price."
```

---

### Task 9: Add a signature-verified, idempotent Stripe webhook

**Files:**

- Create: `api/stripe-webhook.ts`
- Create: `docs/migrations/2026-07-20_stripe_events.sql`
- Test: `tests/unit/stripe-webhook.test.ts` (create)

**Interfaces:**

- Consumes: `node:crypto` `createHmac`, `timingSafeEqual`
- Produces: nothing consumed by later tasks

**Why:** there is no Stripe webhook anywhere in this repository (verified by grep across the tree; the only webhook is a Linear feedback hook in a form component). Nothing reacts to a failed payment, a cancellation, or a dispute. Plan state is resolved by querying Stripe live on every quota check, which is both slow and fragile. For the master brief's revenue operator, payment events are the foundational input — none of the reconciliation, margin, or churn work is possible without them.

**Implementation note:** this repo has no Stripe SDK dependency and calls the REST API directly with `fetch`. Rather than add the SDK for one function, implement the documented signature scheme with `node:crypto`, which the codebase already uses (`timingSafeEqual` in `auth-middleware.ts`). The scheme: the `Stripe-Signature` header is `t=<unix>,v1=<hex hmac>`; the signed payload is `${t}.${rawBody}`; the MAC is HMAC-SHA256 keyed with the endpoint secret.

**Raw body warning:** Vercel's Node runtime parses `req.body` lazily from a buffered copy of the request (`getBodyParser` in `@vercel/node`). Accessing `req.body` yields parsed JSON, and re-serializing it will **not** reproduce the exact bytes Stripe signed, so signature verification would always fail. This function must therefore read the raw stream and must never touch `req.body`. Step 5 proves this works against a real Stripe test event before we rely on it.

- [ ] **Step 1: Write the migration**

Create `docs/migrations/2026-07-20_stripe_events.sql`:

```sql
-- Idempotency + audit ledger for inbound Stripe webhooks.
-- Stripe retries aggressively and may deliver the same event more than once;
-- the primary key makes reprocessing a no-op.
create table if not exists public.stripe_events (
  id           text        primary key,   -- Stripe event id, evt_...
  type         text        not null,
  payload      jsonb       not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists stripe_events_type_idx
  on public.stripe_events (type, received_at desc);

alter table public.stripe_events enable row level security;
```

Apply it the same way as Task 6 and verify with `select count(*) from public.stripe_events;` returning `0`.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/stripe-webhook.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
process.env.SUPABASE_URL = "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "dummy_service_key";

const handler = (await import("../../api/stripe-webhook")).default;

function makeRes() {
  const res: any = { _status: 0, _body: "", _headers: {} };
  res.status = (s: number) => {
    res._status = s;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res._headers[k] = v;
    return res;
  };
  res.send = (b: string) => {
    res._body = b;
    return res;
  };
  res.end = () => res;
  return res;
}

/** A request object that yields the raw body via async iteration. */
function rawReq(body: string, signatureHeader: string) {
  return {
    method: "POST",
    headers: { "stripe-signature": signatureHeader },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(body);
    },
  };
}

function sign(body: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  const mac = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${mac}`;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const EVENT = JSON.stringify({
  id: "evt_1",
  type: "invoice.payment_failed",
  data: { object: {} },
});

describe("stripe webhook signature verification", () => {
  it("rejects a bad signature with 400 and never writes", async () => {
    const writes: string[] = [];
    global.fetch = vi.fn(async (u: any) => {
      writes.push(String(u));
      return { ok: true, status: 201, text: async () => "[]" } as any;
    }) as any;
    const res = makeRes();
    await handler(rawReq(EVENT, sign(EVENT, "whsec_WRONG")), res);
    expect(res._status).toBe(400);
    expect(writes.length).toBe(0);
  });

  it("rejects a stale timestamp outside tolerance", async () => {
    global.fetch = vi.fn(
      async () => ({ ok: true, status: 201, text: async () => "[]" }) as any,
    ) as any;
    const res = makeRes();
    const old = Math.floor(Date.now() / 1000) - 3600;
    await handler(rawReq(EVENT, sign(EVENT, "whsec_test_secret", old)), res);
    expect(res._status).toBe(400);
  });

  it("accepts a valid signature and records the event", async () => {
    const writes: string[] = [];
    global.fetch = vi.fn(async (u: any) => {
      writes.push(String(u));
      return { ok: true, status: 201, text: async () => "[]" } as any;
    }) as any;
    const res = makeRes();
    await handler(rawReq(EVENT, sign(EVENT, "whsec_test_secret")), res);
    expect(res._status).toBe(200);
    expect(writes.some((w) => w.includes("stripe_events"))).toBe(true);
  });

  it("returns 200 on a duplicate delivery without reprocessing", async () => {
    global.fetch = vi.fn(
      async () =>
        ({ ok: false, status: 409, text: async () => "duplicate key" }) as any,
    ) as any;
    const res = makeRes();
    await handler(rawReq(EVENT, sign(EVENT, "whsec_test_secret")), res);
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body).duplicate).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/unit/stripe-webhook.test.ts`
Expected: FAIL, cannot resolve `../../api/stripe-webhook`.

- [ ] **Step 4: Create the webhook**

Create `api/stripe-webhook.ts`:

```ts
/**
 * api/stripe-webhook.ts — the only trusted inbound channel for payment events.
 *
 * Raw-body warning: Vercel's Node runtime buffers the request and parses
 * req.body lazily. Re-serializing parsed JSON does NOT reproduce the bytes
 * Stripe signed, so this handler reads the stream directly and never touches
 * req.body. Body parsing is disabled below.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const config = { runtime: "nodejs", api: { bodyParser: false } };

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

/** Stripe's default replay window. */
const TOLERANCE_SECONDS = 300;

function send(res: any, status: number, body: Record<string, unknown>) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(body));
}

async function readRawBody(req: any): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Parse `t=...,v1=...` (there may be several v1 entries during secret rotation). */
function parseSignatureHeader(header: string): { t: number; v1: string[] } {
  const out = { t: 0, v1: [] as string[] };
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") out.t = parseInt(v, 10);
    if (k === "v1") out.v1.push(v);
  }
  return out;
}

function safeEqHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST")
    return send(res, 405, { ok: false, error: "Method not allowed" });

  if (!STRIPE_WEBHOOK_SECRET) {
    // Fail closed. An unverifiable webhook is worse than no webhook.
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set");
    return send(res, 503, { ok: false, error: "webhook not configured" });
  }

  const header = String(req.headers?.["stripe-signature"] || "");
  if (!header) return send(res, 400, { ok: false, error: "missing signature" });

  let raw: string;
  try {
    raw = await readRawBody(req);
  } catch (err: any) {
    console.error("[stripe-webhook] could not read raw body:", err?.message);
    return send(res, 400, { ok: false, error: "unreadable body" });
  }

  const { t, v1 } = parseSignatureHeader(header);
  if (!t || v1.length === 0)
    return send(res, 400, { ok: false, error: "malformed signature" });

  const age = Math.abs(Math.floor(Date.now() / 1000) - t);
  if (age > TOLERANCE_SECONDS) {
    console.warn(`[stripe-webhook] rejected stale event, age ${age}s`);
    return send(res, 400, { ok: false, error: "timestamp outside tolerance" });
  }

  const expected = createHmac("sha256", STRIPE_WEBHOOK_SECRET)
    .update(`${t}.${raw}`)
    .digest("hex");

  if (!v1.some((candidate) => safeEqHex(expected, candidate))) {
    console.warn("[stripe-webhook] rejected bad signature");
    return send(res, 400, { ok: false, error: "signature mismatch" });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return send(res, 400, { ok: false, error: "invalid json" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error(
      "[stripe-webhook] Supabase not configured, event dropped:",
      event.id,
    );
    return send(res, 500, { ok: false, error: "storage not configured" });
  }

  // Claim the event id. A conflict means Stripe redelivered something we
  // already have, so acknowledge and stop.
  const claim = await fetch(`${SUPABASE_URL}/rest/v1/stripe_events`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ id: event.id, type: event.type, payload: event }),
  });

  if (!claim.ok) {
    if (claim.status === 409) {
      return send(res, 200, { ok: true, duplicate: true });
    }
    const text = await claim.text();
    console.error(`[stripe-webhook] persist failed ${claim.status}: ${text}`);
    // Non-2xx tells Stripe to retry, which is what we want on a storage failure.
    return send(res, 500, { ok: false, error: "could not record event" });
  }

  // Phase 0.5 records events only. Reacting to them (dunning, churn tagging,
  // entitlement revocation) is deliberately deferred so this PR stays a
  // security fix rather than a behavior change.
  console.log(`[stripe-webhook] recorded ${event.type} ${event.id}`);
  return send(res, 200, { ok: true, recorded: true });
}
```

- [ ] **Step 5: Run tests and checks**

Run: `npx vitest run tests/unit/stripe-webhook.test.ts && npx tsc --noEmit && npm run check:api`
Expected: 4 passed, clean.

- [ ] **Step 6: Prove the raw-body approach on a real preview deploy (REQUIRED)**

Unit tests use a synthetic async-iterable request, which does not prove that Vercel leaves the stream readable in production. This step is not optional; if it fails, the webhook is decorative.

1. Push the branch and let Vercel build a preview.
2. In the Stripe dashboard, add a webhook endpoint pointing at `<preview-url>/api/stripe-webhook`, subscribed to `invoice.payment_failed` and `customer.subscription.deleted`. Copy the signing secret.
3. Add `STRIPE_WEBHOOK_SECRET` to the Vercel **Preview** environment with that value. Do not touch Production yet.
4. Use "Send test webhook" from the Stripe dashboard.
5. Confirm the delivery shows `200` in Stripe, and that a row exists:
   ```sql
   select id, type, received_at from public.stripe_events order by received_at desc limit 5;
   ```
6. Send the same test event again and confirm Stripe still shows `200` and no duplicate row was created.

If step 5 returns `400 signature mismatch`, the raw body is being altered. Do not paper over it by re-serializing `req.body`. Report it, and the fallback is to add the `stripe` npm package and use `constructEventAsync`, which handles runtime differences.

- [ ] **Step 7: Commit**

```bash
git add api/stripe-webhook.ts docs/migrations/2026-07-20_stripe_events.sql tests/unit/stripe-webhook.test.ts
git commit -m "feat(billing): add signature-verified idempotent Stripe webhook

No webhook existed, so failed payments, cancellations, and disputes were
invisible to the app. Records events only for now; reacting to them is a
separate change."
```

---

## Out of scope, deliberately

These were found during the audit and are real, but they do not belong in a security PR. Each needs its own change.

1. **Sign-out never clears the session cookie.** `clearSessionCookieHeader()` exists in `api/_lib/session.ts` and is never called, so the next page load silently signs the user back in. There is no revocation path at all. Real risk on shared machines. Small fix, but it is an auth behavior change that deserves its own review.
2. **The free tier advertised as "5 then 1/day" is not implemented.** `reserve_generation` has no daily window, so exhausted free users are blocked forever while the UI promises a daily allowance. This is a product and copy mismatch, not a vulnerability.
3. **Grandfathering lives only in Stripe customer metadata** with no local ledger. A customer merge erases the entitlement silently.
4. **The comped annual customer** (`sub_1Ttos3…`, active to 2027-07-15, refunded $564) is a business decision for Thomas: cancel it or comp it deliberately.
5. **`CLAUDE.md` is 495 lines and substantially wrong** (stale URL, wrong engine, wrong prices, shipped tasks marked not-started). The master brief asks for under 200 lines. Fixing it is high-value for every future session but is documentation, not security.
6. **No error monitoring anywhere.** No Sentry, no React error boundary, no `/api/health`. Nothing alerts on any of the failures this PR now logs.

## Self-review notes

- Every task's tests live under `tests/unit/`, matching the vitest `include` glob.
- Env vars are set before dynamic `import()` in every test, matching the existing `stripe-status.test.ts` convention, because handlers capture env at module load.
- All new `api/` imports of local modules carry `.js` extensions.
- `requireBillingSession` is defined in Task 3 and consumed by Tasks 4, 5, 7, 8 with a consistent signature.
- `handleFulfillCredits` gains its third parameter in Task 5 and uses it in Task 6; Task 5 notes the standalone-compile case.
- Task 0 is a gate: if `AUTH_ENFORCE=log-only`, Tasks 3 through 9 are cosmetic and must not be presented as fixes.
