# Phase 2 Tracking

Live status board for Phase 2 (R1-R38 from `docs/overhaul-2026-04/02-execution-backlog.md`). **Goal:** "The AI Listing Kit" repackage — pricing ($49/$19/$99 + annual), copy rewrites, `/settings` + `/listings` routes, editor interactions, lifecycle.

Gate: QA harness still passes on all 5 tools after each cluster merge.

---

## Cluster A — Copy rewrites
**Lead:** `agent-a`
**Scope:** All user-facing copy. Low code risk, high brand impact. Can run in parallel with anything.

| # | Title | Status | Notes |
|---|---|---|---|
| R1 | Hero rewrite | todo | "Staged listing photos in 15 seconds. Not 15 days." |
| R2 | Primary CTA rewrite | todo | "Stage 3 rooms free" in 5 locations |
| R3 | Editor primary CTAs | todo | "Stage this room" / "Apply this tweak" / "Restage in this style" |
| R4 | Pro AI Tools copy scrub | todo | Delete "stunning/beautiful" |
| R5 | Loading overlay rewrite | todo | Per-tool progress copy |
| R7 | Free-limit-hit toast | todo | currently silent |
| R8 | Onboarding tutorial rewrite | todo | 6 steps, fire after first upload |
| R9 | History empty state | todo | new illustration + copy |
| R10 | Hero subhead cost comparison | todo | final CTA section |
| R11 | Error messages — actionable | todo | + inline Retry button |

---

## Cluster B — Pricing + billing
**Lead:** `agent-b`
**Scope:** Stripe tier changes, subscription plumbing, pricing page. Needs grandfathering per Fork #2.

| # | Title | Status | Notes |
|---|---|---|---|
| R6 | Upgrade modal rewrite | todo | "Unlimited listings, forever." |
| R12 | Stripe Pro price → $49 | todo | `unit_amount: 4900` + grandfathering |
| R13 | Stripe Starter $19 product | todo | 40/mo metered |
| R14 | Stripe Team $99 product | todo | 3 seats |
| R15 | Annual plans + 20% discount toggle | todo | $180/$468/$948 |
| R16 | Credit pack reprice | todo | $15/10, $29/25, $69/75 |
| R17 | Free-tier rewrite | todo | 5-lifetime + 1/day (Fork #3) |
| R18 | Pause subscription action | todo | 30/60/90 day options |
| R19 | Pricing page component | todo | XL — 4 tiers, decoy, annual toggle |

---

## Cluster C — Router + routes + Phase 1 blockers
**Lead:** `agent-c`
**Scope:** Introduce `react-router-dom`, ship route tree, AND retry Phase 1 F3/F10/F12 (Tailwind off CDN blocked on `npm install` in prior session).

| # | Title | Status | Notes |
|---|---|---|---|
| F3  | Tailwind off CDN | blocked-retry | needs `npm install`; was blocked prior session |
| F10 | Type scale collapse | blocked-retry | depends on F3 |
| F12 | Radius collapse | blocked-retry | depends on F3 |
| R20 | Router introduction | todo | Fork #4 Option A = `react-router-dom` |
| R21 | `/settings` route + sub-tabs | todo | XL — brand/team/billing/referral/integrations/account |
| R22 | Mount ListingDashboard at `/listings` | todo | useListing.ts already exists |
| R24 | Real marketing URLs | todo | `/pricing`, `/features`, `/faq`, `/gallery` |
| R25 | `/try` unauth demo | todo | 1 free gen before sign-in gate |

---

## Cluster D — UX + primitives + interactions
**Lead:** `agent-d`
**Scope:** Design-system primitives, keyboard shortcuts, editor polish. Lots of small wins.

| # | Title | Status | Notes |
|---|---|---|---|
| R23 | Promote Pro AI Tools to sidebar | todo | Replace accordion, auto-expand for Pro |
| R26 | Retry button in error toasts | todo | Extend toast primitive |
| R27 | Keyboard shortcut map | todo | ⌘S/⌘E/⌘Enter/`[`/`]`/`?` |
| R28 | Custom tooltip primitive | todo | `<Tooltip>` component |
| R29 | Drag-over visual state | todo | ImageUploader border tint |
| R30 | Modal open transition | todo | 220ms scale+fade |
| R31 | Mask brush size cursor | todo | DOM circle follows mouse |
| R32 | `<PanelHeader>` extraction | todo | 4 inline copies |
| R33 | `<Button>`/`<Badge>`/`<Pill>` | todo | 4 variants × 2 sizes |
| R34 | Pack tile "selected" pre-fire | todo | 2-click pattern |
| R35 | Per-tool progress copy | todo | depends on R5 |

---

## Deferred (needs external system access)

- R36 GHL email nurture
- R37 Cancellation survey (Stripe Portal dashboard config)
- R38 Winback flow

---

## Exit criteria (Phase 2 spec)

- [ ] $49 Pro live in Stripe
- [ ] $19 Starter live
- [ ] Annual default-on on pricing page
- [ ] `/settings` + `/listings` + Pro-Tools-as-sidebar deployed
- [ ] All copy rewrites shipped
- [ ] QA harness still green on all 5 tools

---

## Regressions caught

_Cluster leads: log QA failures here._

---

## Collaboration

_Cross-cluster deps. Tag with @agent-x._
