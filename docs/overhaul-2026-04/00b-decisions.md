# 00b — Strategic Fork Decisions (Locked)

**Date locked:** 2026-04-18
**Resolved by:** Thomas (delegated to synthesizer recommendation)

---

## Locked decisions

| Fork | Decision | What it means |
|---|---|---|
| **#1 — Primary ICP scope** | **A. Serious producer only** (10-50 sides/yr, 3+ yrs licensed) | Features that only serve A&B Media go to an Enterprise track, not the main product. Hard guardrail. |
| **#2 — Grandfathering** | **A+ hybrid** | Early Bird users at $14 honored **forever**. All other current Pro users honored for **12 months**, then re-priced to $49 with 30-day notice. |
| **#3 — Free tier** | **A+D combined** | Unauth `/try` = 1 free generation before sign-in. Authed free = 5 lifetime, then 1/day. |
| **#4 — Settings** | **A. Full route refactor** | Introduce `react-router-dom`, ship `/settings/brand`, `/settings/team`, `/settings/billing`, `/settings/referral`, `/settings/integrations`, `/settings/account`. Deep-linkable. |
| **#5 — Listing Dashboard** | **A. Mount existing code as-is** | `ListingDashboard.tsx` + `useListing.ts` wired at `/listings` in Phase 2. Polish iterates. |
| **#6 — Mobile** | **A. PWA in Phase 1, revisit native at 100+ installs** | Manifest + icons ship tomorrow. Native (Capacitor / React Native) deferred. |
| **#7 — Brand** | **A. Keep "StudioAI"** | Tagline becomes "The AI Listing Kit." No domain change. Revisit in Phase 3 if a B2B spin-off emerges. |
| **#8 — Tailwind CDN** | **A. Swap to compiled Tailwind in Phase 1** | Gated by Playwright visual regression pass. 1-day harness investment up front. |
| **#9 — Public API** | **A. Read-only + generate API in Phase 3** | Auth + rate limits (100/day/user) + 3 endpoints. GHL integration becomes a B+ option. |
| **#10 — Pre-gen preview** | **B. Static per-pack preview images in Phase 3** | Zero Gemini cost. Live real-time preview deferred to Phase 4. |

---

## Hard guardrails that fall out of these decisions

1. **A&B-only features → Enterprise track.** If a request only serves Avery & Bryant Media's workflow, it does not go into the main Phase 1/2/3 product. Enterprise is its own track — separate scope, separate timeline.
2. **"Rate never increases" promise is load-bearing for Early Bird.** Breaking it is off the table. Re-pricing logic in `api/stripe-checkout.ts` must special-case Early Bird subscribers indefinitely.
3. **Router introduction in Phase 1.** `react-router-dom` goes in before the settings / listings refactors. Touches auth gate + session state + mobile nav. Accept the risk; plan the migration.
4. **Tailwind CDN removal needs a visual regression safety net.** Playwright harness is a prerequisite, not a nice-to-have.
5. **Public API ships with abuse mitigations.** Rate limit per key (100 generations/day), Stripe usage metering on API calls, incident response runbook published before launch.

---

## Phase 1 starts Monday 2026-04-21

With all 10 forks resolved, the Phase 1 backlog in `02-execution-backlog.md` (F1-F28) is unblocked.

Phase 1 exit criteria (from backlog):
- Lighthouse a11y ≥ 95 on landing
- LCP < 2.0s on 4G
- Zero `text-[N]px` or custom radii in grep
- All 8 modals pass Escape + focus-trap
- PWA installable on iOS + Android
