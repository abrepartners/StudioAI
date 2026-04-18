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
| R6 | Upgrade modal rewrite | shipped | `App.tsx` modal — "Unlimited listings, forever." + per-photo framing + annual hint + grandfather note. Reuses `useModal` (Phase 1 F6). |
| R12 | Stripe Pro price → $49 | shipped | `PLAN_CATALOG.pro.month=4900`. Early Bird honored forever via `metadata.studioai_grandfather=early_bird`. Legacy Pro $29 for 12mo from 2026-04-18. |
| R13 | Stripe Starter $19 product | shipped | 40/mo metered; `plan==='starter'` wired in `useSubscription` + `record-generation` (monthly window). |
| R14 | Stripe Team $99 product | shipped | 3-seat product (`PLAN_CATALOG.team.seats=3`); quantity passes through checkout. |
| R15 | Annual plans + 20% toggle | shipped | `interval:'year'` plumbed through checkout. Starter $180 / Pro $468 / Team $948. PricingPage toggle default-on. |
| R16 | Credit pack reprice | shipped | `CREDIT_PACKS`: 10/$15, 25/$29, 75/$69 (was 10/$19, 25/$39, 50/$69). |
| R17 | Free-tier rewrite | shipped (code) / pending (migration) | 5 lifetime then 1/day. Migration at `docs/migrations/2026-04-18_free_tier_rewrite.sql` — **needs apply via Supabase dashboard**. |
| R18 | Pause subscription action | shipped | `action:'pause_subscription'` + `'resume_subscription'` (pause_collection.behavior=void, 30/60/90 day). |
| R19 | Pricing page component | shipped | `components/PricingPage.tsx`. 4 tiers decoy-ordered (Team, Pro, Starter, Free), annual default-on, per-photo framing, grandfathering footnote. Early Bird teaser kept off-grid. |

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
| R23 | Promote Pro AI Tools to sidebar | shipped | `proTools` nav item (Sparkles icon) + standalone render branch in App.tsx. Pro users get a one-time "Pro Tools now in the sidebar" toast after first gen. |
| R26 | Retry button in error toasts | shipped | Toast primitive already had `action` (F7). Cluster A's R11 wired 6s duration + Retry into every handleGenerate error branch. No Cluster D change needed. |
| R27 | Keyboard shortcut map | shipped | `hooks/useKeyboardShortcuts.ts` — Esc / ⌘S / ⌘E / ⌘Enter / `[` / `]` / `?` / Space-hold. Help modal renders `KEYBOARD_SHORTCUTS` list. Space peeks original image. |
| R28 | Custom tooltip primitive | shipped | `components/Tooltip.tsx` — 400ms/100ms, viewport-clamped, ARIA described-by. Swept 7 native `title=` usages in BatchUploader/ManageTeam/FurnitureRemover/AdminShowcase/BatchProcessor. App.tsx title= conversions staged to avoid Cluster C conflict. |
| R29 | Drag-over visual state | shipped | ImageUploader uses drag-counter (no flicker), primary border + "Drop to upload" overlay. |
| R30 | Modal open transition | shipped | `index.css` — `modal-content-in` 220ms scale(0.96→1) + `modal-overlay-in` fade. Honors `prefers-reduced-motion`. |
| R31 | Mask brush size cursor | shipped | DOM circle follows mouse, scales by canvas display ratio. `cursor-none` when active, shown onMouseEnter / hidden onMouseLeave. |
| R32 | `<PanelHeader>` extraction | shipped | `components/PanelHeader.tsx`. Used in StyleControls (4), SpecialModesPanel (1), BrandKit (1), MLSExport (1). |
| R33 | `<Button>`/`<Badge>`/`<Pill>` | shipped | `components/ui/{Button,Badge,Pill}.tsx`. Top ~6 usages migrated (SOON badge, prompt pills, Pro-tool Cancel, Brand-kit status). Remaining button sweep deferred to avoid merge hell. |
| R34 | Pack tile "selected" pre-fire | shipped | First click on preset → ring + "Click again to generate"; second click → `buildPrompt()`. Respects `isGenerating` / `feedbackRequired` gates. |
| R35 | Per-tool progress copy | shipped | Main overlay refactored to `toolCopy.headline` + `lines` per `activePanel`. Pro Tools (Sky/Twilight/Declutter/Renovation) already have their own in-panel loaders in SpecialModesPanel — those already read per-tool. |

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

- **@agent-d → @agent-c (2026-04-18)**: R23 lands the new `proTools` nav item + auto-expand. Only App.tsx edits are (1) `activePanel` union adds `'proTools'`, (2) `navItems` array gets a Sparkles entry, (3) new render branch mirrors the existing `tools` branch. Minimal overlap with R20 router scaffolding; review needed once Cluster C routes Pro Tools through `/editor/pro`.
- **@agent-d → @agent-a (2026-04-18)**: R11 already wired inline Retry into `handleGenerate` error branches (6s, `action: retryAction`). R26 marked shipped on that basis. If R11 is rolled back, R26 regresses.
- **@agent-d deferred**: ~25 remaining `title=` attributes in App.tsx + SettingsRoute staged for Tooltip sweep AFTER Cluster C's router refactor finishes — avoids merge hell.

- **@agent-a → @agent-d (R8)** — tutorial now takes a `firstUpload` prop. If Cluster D restructures mount points or sidebar, preserve `firstUpload={Boolean(originalImage)}` wiring on `<QuickStartTutorial>`.
- **@agent-a → @agent-c (R2 / R10)** — 5 `Start Free — No Credit Card` strings replaced with `Stage 3 rooms free`. If Cluster C extracts the pricing page, the two pricing-card CTAs carry forward.
- **@agent-a → @agent-b (R7)** — free-cap toast uses the existing `setShowUpgradeModal(true)` action. Pricing restructure (R6, R12, R15, R17) may need this toast string updated when the 5-lifetime + 1/day free tier lands (Fork #3). Coordinate copy when R17 ships.
- **@agent-a re R4/R10 residuals** — landing eyebrow pill still references `$14/mo` Early Bird and the cost-comparison shows `$300/room → $1.38/room`. Both belong to Cluster B's pricing restructure; deliberately untouched.

### Cluster B — Stripe Dashboard actions required

Code ships the product/price creation idempotently on first checkout (looked up by `metadata.studioai_meta`). But these one-time dashboard actions unblock full functionality:

1. **Tag Early Bird customers** — for every existing Early Bird subscriber, set `metadata.studioai_grandfather=early_bird` on their Stripe Customer. Optionally pin their current Stripe Price id to `metadata.studioai_pinned_price_id` so the server reuses it verbatim.
2. **Tag legacy Pro customers (optional)** — they're auto-detected by creation date, but an explicit `metadata.studioai_grandfather=legacy_pro` is safer if any were imported from another system.
3. **Apply Supabase migration** — `docs/migrations/2026-04-18_free_tier_rewrite.sql` (adds `users.lifetime_free_gens_used` + `bump_lifetime_free_gens` RPC). Free-tier fallback works without it (0 lifetime → daily cap kicks in immediately), but new accounts need the column to honor the 5-lifetime promise.
4. **Billing Portal — pause + cancellation survey** — enable `pause_collection` toggle in Stripe → Billing → Customer Portal config (R18 code calls the API; Portal can expose it too). Add cancellation-reason survey per R37 (already deferred).
5. **Retire legacy prices (optional)** — old $29/mo Pro price remains valid for grandfathering; don't archive it. New customers always hit the $49 price because `ensurePrice` matches by exact amount.

### @agent-b → @agent-c + @agent-d

- Cluster C's `MarketingRoute` targets `#pricing`, which is the `id` on `<PricingPage>`. Anchor still works.
- `SettingsRoute` Billing tab should use `subscription.pauseSubscription(30|60|90)` + `resumeSubscription()` from `useSubscription` when it gets built out (currently placeholder).
- New plan shape: `plan: 'free' | 'starter' | 'pro' | 'team' | 'credits'`. Any UI branching on `plan === 'pro'` needs to also handle `'team'` for unlimited behavior.
- **@agent-c → all** — App.tsx left UNTOUCHED in my router session. `/` still mounts the existing shell; routes live as siblings in `src/routes/`. Auth is probed via `src/routes/authStorage.ts` (reads `studioai_google_user`). Follow-up: after A/B/D settle I'll lift `activePanel` into `/studio/:panel` routes and extract `<MarketingPage />` so marketing routes stop trampolining through the editor shell.
- **@agent-c → @agent-b** — `/settings/billing` is a placeholder pointing at `/pricing`. When R19 ships, swap its body. Same for the Billing tab in `src/routes/SettingsRoute.tsx`.
- **@agent-c → @agent-d** — R23 (Pro AI Tools sidebar) will want a `<Link to="/studio/pro-tools">`. I'll wire it when activePanel lifts.
- **@agent-c build notes** — `<BrowserRouter>` needs SPA fallback on deep links; Vercel's default `index.html` rewrite already handles it. Verified via `vite build`.
