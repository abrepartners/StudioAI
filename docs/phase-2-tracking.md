# Phase 2 Tracking

Live status board for Phase 2 (R1-R38 from `docs/overhaul-2026-04/02-execution-backlog.md`). **Goal:** "The AI Listing Kit" repackage — pricing ($49/$19/$99 + annual), copy rewrites, `/settings` + `/listings` routes, editor interactions, lifecycle.

Gate: QA harness still passes on all 5 tools after each cluster merge.

---

## Cluster A — Copy rewrites
**Lead:** `agent-a`
**Scope:** All user-facing copy. Low code risk, high brand impact. Can run in parallel with anything.

| # | Title | Status | Notes |
|---|---|---|---|
| R1 | Hero rewrite | done | "Staged listing photos in 15 seconds. Not 15 days." + new subhead shipped |
| R2 | Primary CTA rewrite | done | "Stage 3 rooms free" in all 5 locations (nav, hero, 2 pricing, final CTA) |
| R3 | Editor primary CTAs | done | "Stage this room" / "Apply this tweak" / "Restage in this style"; helper copy too |
| R4 | Pro AI Tools copy scrub | done | "stunning / beautiful / show-ready" removed across SpecialModesPanel |
| R5 | Loading overlay rewrite | done | Per-tool label + per-tool progress lines (staging vs cleanup) |
| R7 | Free-limit-hit toast | done | Toast w/ inline Upgrade action fires before modal |
| R8 | Onboarding tutorial rewrite | done | 6 steps rewritten in agent voice + `firstUpload` trigger prop |
| R9 | History empty state | done | ImageIcon + "Nothing staged yet" + expectation-setting sub |
| R10 | Hero subhead cost comparison | done | Final CTA now leads with "One staging service costs more than a year of StudioAI" |
| R11 | Error messages — actionable | done | Retry action on handleGenerate / furniture removal / save; SPMP inline banner extended |

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
| F3  | Tailwind off CDN | shipped | tailwind v3.4.19 (v4 rejected — CDN class parity). Configs: `tailwind.config.js` + `postcss.config.js`; `@tailwind` directives in `index.css`; CDN `<script>` removed. Build: 66 kB CSS / 12.8 kB gzip. |
| F10 | Type scale collapse | partial | Scale added to `tailwind.config.js theme.extend.fontSize` (2xs/xs/sm/base/lg/xl/display). 211 `text-[Npx]` occurrences across 24 files still need sweep — deferred because JIT compiles brackets (no compile failure, just design-polish). |
| F12 | Radius collapse | partial | Tokens in `tailwind.config.js`; CompareSlider.tsx migrated. App.tsx `rounded-[2rem]`/`[2.5rem]` waiting on Cluster A/D settle. |
| R20 | Router introduction | shipped | `react-router-dom@^7`; `src/routes/AppRouter.tsx` wraps entry. `/` still mounts existing `<App />` (deliberate — avoid Cluster A/D conflicts). |
| R21 | `/settings` route + sub-tabs | shipped | `src/routes/SettingsRoute.tsx`, 6 tabs. Reuses BrandKit/ManageTeam/ReferralDashboard as-is (Fork #5). Billing/Integrations/Account are placeholder shells pending Cluster B. |
| R22 | Mount ListingDashboard at `/listings` | shipped | `src/routes/ListingsRoute.tsx`; `/listings` + `/listings/:id`. ListingDashboard + useListing used as-is. |
| R24 | Real marketing URLs | shipped | `src/routes/MarketingRoute.tsx` — `/pricing`, `/features`, `/faq` scroll into App's landing sections; `/gallery` placeholder. |
| R25 | `/try` unauth demo | shipped | `src/routes/TryRoute.tsx` — localStorage-gated 1-free counter + Google CTA. |

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

- **@agent-a → @agent-d (R8)** — tutorial now takes a `firstUpload` prop. If Cluster D restructures mount points or sidebar, preserve `firstUpload={Boolean(originalImage)}` wiring on `<QuickStartTutorial>`.
- **@agent-a → @agent-c (R2 / R10)** — 5 `Start Free — No Credit Card` strings replaced with `Stage 3 rooms free`. If Cluster C extracts the pricing page, the two pricing-card CTAs carry forward.
- **@agent-a → @agent-b (R7)** — free-cap toast uses the existing `setShowUpgradeModal(true)` action. Pricing restructure (R6, R12, R15, R17) may need this toast string updated when the 5-lifetime + 1/day free tier lands (Fork #3). Coordinate copy when R17 ships.
- **@agent-a re R4/R10 residuals** — landing eyebrow pill still references `$14/mo` Early Bird and the cost-comparison shows `$300/room → $1.38/room`. Both belong to Cluster B's pricing restructure; deliberately untouched.
- **@agent-c → all** — App.tsx left UNTOUCHED in my router session. `/` still mounts the existing shell; routes live as siblings in `src/routes/`. Auth is probed via `src/routes/authStorage.ts` (reads `studioai_google_user`). Follow-up: after A/B/D settle I'll lift `activePanel` into `/studio/:panel` routes and extract `<MarketingPage />` so marketing routes stop trampolining through the editor shell.
- **@agent-c → @agent-b** — `/settings/billing` is a placeholder pointing at `/pricing`. When R19 ships, swap its body. Same for the Billing tab in `src/routes/SettingsRoute.tsx`.
- **@agent-c → @agent-d** — R23 (Pro AI Tools sidebar) will want a `<Link to="/studio/pro-tools">`. I'll wire it when activePanel lifts.
- **@agent-c build notes** — `<BrowserRouter>` needs SPA fallback on deep links; Vercel's default `index.html` rewrite already handles it. Verified via `vite build`.
