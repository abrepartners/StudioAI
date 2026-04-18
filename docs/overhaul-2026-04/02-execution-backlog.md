# 02 — Execution Backlog

**Author:** Executive Synthesizer
**Date:** 2026-04-17
**Purpose:** Numbered, prioritized, ready-to-execute work. Grouped by phase. Ranked by (impact × confidence) / effort.

---

## Legend

- **Effort:** S (<2 hr) · M (half-day) · L (1–3 days) · XL (week+)
- **Owner type:** dev · designer · copywriter · product
- **Deps:** other backlog items that must ship first
- **Impact/Conf:** 1–5 scale; used to sort within phase

---

## Phase 1 — Foundations (Weeks 1–2, ship by 2026-05-04)

**Goal:** Stop the surface from shifting. Make a11y/perf/interactions safe. No pricing, no positioning, no new features.

| # | Title | Description | Files | Effort | Owner | Impact | Conf | Deps |
|---|---|---|---|---|---|---|---|---|
| F1 | Remove viewport lock | Delete `maximum-scale=1, user-scalable=no` from viewport meta; restores pinch-zoom (WCAG 1.4.4). | `index.html:5` | S | dev | 5 | 5 | — |
| F2 | Ship PWA manifest + icons | Create `public/manifest.json` (name, theme, start_url, 192/512 PNG icons), add `<link rel="manifest">`, `apple-mobile-web-app-capable` meta. | `public/manifest.json`, `index.html` | M | dev | 4 | 5 | — |
| F3 | Move Tailwind off CDN | Swap `<script src="cdn.tailwindcss.com">` for Vite + PostCSS Tailwind. Run full Playwright visual regression. Depends on Fork #8. | `index.html:28`, `tailwind.config.js`, `postcss.config.js`, `vite.config.ts` | L | dev | 5 | 4 | Fork #8 |
| F4 | Uninstall recharts | `npm uninstall recharts` — zero imports in production code. | `package.json` | S | dev | 3 | 5 | — |
| F5 | Lazy-load thumbnails | Add `loading="lazy" decoding="async"` to 8 thumbnail `<img>` tags. | `App.tsx:2548,2565`, `BatchProcessor.tsx:407`, `BatchUploader.tsx:357`, `SpecialModesPanel.tsx:240` | S | dev | 3 | 5 | — |
| F6 | `useModal` hook | Shared hook: `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape handler, focus trap, focus return, scroll lock. Apply to 8 modals. | `hooks/useModal.ts` (new); `ExportModal.tsx`, `QuickStartTutorial.tsx`, `FurnitureRemover.tsx`, `BrandKit.tsx`, `ManageTeam.tsx`, `AdminShowcase.tsx`, `ReferralDashboard.tsx`, plus App.tsx Upgrade modal | L | dev | 5 | 5 | — |
| F7 | Undo toast pattern | 6-second snapshot + inline Undo button for destructive actions. | `App.tsx` (Start-from-Original, Delete Saved Stage, Refresh), `EditingBadge.tsx:94` | M | dev | 5 | 5 | — |
| F8 | Silent-success toasts | Wire `showToast` into 6 silent paths: undo (⌘Z), redo, brand kit save, commit-and-continue, session nav, delete saved stage. | `App.tsx:554-563`, `BrandKit.tsx`, `EditingBadge.tsx` | M | dev | 4 | 5 | — |
| F9 | `AbortController` on generations | Wire into every Gemini call + Pro AI Tools. Red "Cancel" button in generation overlay. | `App.tsx:handleGenerate`, `services/geminiService.ts`, `SpecialModesPanel.tsx` | M | dev | 5 | 5 | — |
| F10 | Type scale collapse | Add `2xs/xs/sm/base/lg/xl/display` to `tailwind.config.js`. Mechanical sweep deleting `text-[7/8/9/10/11/13]px`. | `tailwind.config.js`, all components | L | dev+designer | 5 | 5 | F3 |
| F11 | Icon size collapse | 6-value icon scale. Round 15→16, 13→14, 11→12, 21→20, 28→24. `grep -n 'size={15\|13\|11\|21\|28}'` sweep. | All components importing lucide-react | M | dev | 4 | 5 | — |
| F12 | Radius collapse | 3 values: `sm 8px / md 16px / full`. Kill `rounded-[2.5rem]`, `rounded-[2rem]`, `rounded-[10px]`, `rounded-[14px]`, `rounded-[1.25rem]`. | `App.tsx:2263,2388,2594`, `CompareSlider.tsx:57` | M | dev | 4 | 5 | F3 |
| F13 | Error/success/warning tokens | Add `--color-error #FF375F`, `--color-success #30D158`, `--color-warning #FFD60A` to `index.css`. Refactor ~30 hardcoded hex. | `index.css`, 12+ components | M | dev | 4 | 5 | — |
| F14 | MLS Export token alignment | Replace `bg-zinc-900 rounded-xl border-zinc-800` with `premium-surface rounded-2xl`. | `components/MLSExport.tsx:130,142` | S | dev | 4 | 5 | F12 |
| F15 | Primary CTA contrast fix | `cta-primary` passes 4.5:1: enforce 14px bold minimum, hover darkens not lightens. | `index.css` (`.cta-primary`, `.cta-primary:hover`) | S | designer+dev | 4 | 5 | — |
| F16 | Mobile: auto-close sheet on Generate | Sheet stays closed while progress animation plays; reopens on completion. | `App.tsx:2594-2606` (mobile sheet), `handleGenerate` | M | dev | 5 | 5 | — |
| F17 | Mobile: header overflow menu | At `<sm:`, move Undo/Redo/Refresh/Help into a "…" overflow. | `App.tsx:2060-2212` | M | dev+designer | 4 | 5 | — |
| F18 | Mobile: 44px touch targets | Bump top bar, mask brush buttons, session nav arrows to 44×44 min. | `App.tsx:2060,2070,2086,2098,2186,2194,2202`, `MaskCanvas.tsx:236,251,260,268`, `EditingBadge.tsx:60` | M | dev | 4 | 5 | — |
| F19 | Input mode fixes | `inputMode="numeric"` on beds/baths/sqft/year/zip; `font-size:16px` on all textareas to stop iOS zoom. | `SocialPack.tsx:342-345`, `StyleControls.tsx:247` | S | dev | 3 | 5 | — |
| F20 | Canvas aspect ratio fix | Remove `sm:aspect-video` (16:9) — listing photos are 4:3. | `App.tsx:2388` | S | dev | 3 | 5 | — |
| F21 | `aria-label` sweep on icon buttons | Add labels to every icon-only button in top bar + mobile nav + EditingBadge chevron + pack tiles + history thumbs. ~30 additions. | `App.tsx:2060-2382`, `EditingBadge.tsx`, `StyleControls.tsx` | M | dev | 4 | 5 | — |
| F22 | Live-region loading | Wrap generation overlay + "Analyzing Space" in `role="status" aria-live="polite"`. | `App.tsx:2391-2399`, `ImageUploader.tsx:57-60` | S | dev | 3 | 5 | — |
| F23 | Stripe handlers: `runtime='nodejs'` | Explicit runtime declaration on all Stripe API handlers to avoid accidental Edge cold-start failure. | `api/stripe-*.ts`, `api/referral.ts`, `api/brokerage.ts`, `api/record-generation.ts`, `api/track-login.ts` | S | dev | 4 | 5 | — |
| F24 | Font preconnect | `<link rel="preconnect">` for fonts.googleapis.com + fonts.gstatic.com; swap CSS `@import` for `<link rel="stylesheet">`. | `index.html`, `index.css:1` | S | dev | 3 | 5 | — |
| F25 | Self-host login hero image | Replace 2000-wide Unsplash JPEG with self-hosted 1600-wide AVIF/WebP. | `index.css:268`, `public/` | S | dev | 3 | 5 | — |
| F26 | Fix opacity-based de-emphasis | Replace `text-[var(--color-text)]/50` (fails 2.6:1 on mobile tab) with a static color that hits ≥4.5:1. | `App.tsx:2375`, `index.css:443` (disabled nav-item) | S | dev+designer | 3 | 5 | — |
| F27 | Delete Heart icon for "save" | Swap Heart for BookmarkPlus on save-to-history actions. | `App.tsx` save handlers, history toolbar | S | dev | 2 | 5 | — |
| F28 | Consolidate Loader icon | Delete `LoaderCircle` import in `ImageUploader.tsx:2`, use `Loader2` everywhere. | `ImageUploader.tsx` | S | dev | 2 | 5 | — |

**Phase 1 exit criteria:** Lighthouse a11y ≥ 95 on landing, LCP < 2.0s on 4G, zero `text-[N]px` or custom radii in grep, all 8 modals pass Escape + focus-trap.

---

## Phase 2 — Repackage (Weeks 3–6, ship by 2026-06-01)

**Goal:** StudioAI becomes "The AI Listing Kit." Pricing, IA, copy, and editor interactions all change.

| # | Title | Description | Files | Effort | Owner | Impact | Conf | Deps |
|---|---|---|---|---|---|---|---|---|
| R1 | Hero rewrite | Replace rotating `HeroHeadline` with `Staged listing photos in 15 seconds. Not 15 days.` + new subhead from Copy R2. | `App.tsx:146,176-188,1279-1281` | M | copywriter+dev | 5 | 5 | — |
| R2 | Primary CTA rewrite | Swap `Start Free — No Credit Card` for `Stage 3 rooms free` in all 5 locations. | `App.tsx:1256,1294,1622,1779,2257` | S | copywriter+dev | 5 | 5 | — |
| R3 | Editor primary CTAs | `Generate Design` → `Stage this room`; `Build on Current` → `Apply this tweak`; `Re-Generate (Replace)` → `Restage in this style`. | `components/StyleControls.tsx:331-346` | S | copywriter+dev | 4 | 5 | — |
| R4 | Pro AI Tools copy scrub | Delete "stunning," "beautiful" across SpecialModesPanel. Use Copy §1.4 replacements. | `components/SpecialModesPanel.tsx:253-431` | S | copywriter+dev | 3 | 5 | — |
| R5 | Loading overlay rewrite | `STAGING YOUR ROOM · {elapsed}` + Copy R13 lines that match the tool. Per-tool copy set (sky replacement says "Matching the sky," not "Placing furniture"). | `App.tsx:2391-2405`, `SpecialModesPanel.tsx` | M | copywriter+dev | 4 | 5 | — |
| R6 | Upgrade modal rewrite | `Unlimited listings, forever.` + Copy R7 supporting copy. | `App.tsx:1832-1887` | S | copywriter+dev | 4 | 5 | — |
| R7 | Free-limit-hit toast | Add user-facing toast when `useSubscription.canGenerate` returns false. Currently silent. | `App.tsx`, `hooks/useSubscription.ts:50` | M | dev+copywriter | 4 | 5 | — |
| R8 | Onboarding tutorial rewrite | 6 steps → Copy §9 R9 rewrite; fire AFTER first upload, not on first visit. | `components/QuickStartTutorial.tsx` | M | copywriter+dev | 4 | 5 | — |
| R9 | History empty state | Copy R14 rewrite + illustration. | `App.tsx:2538` | S | designer+copywriter | 2 | 5 | — |
| R10 | Hero subhead cost comparison | Copy R15 rewrite for final CTA section. | `App.tsx:1767-1770` | S | copywriter | 3 | 5 | — |
| R11 | Error messages — actionable | Replace 4 generic error toasts with Copy §7 + R10 rewrites (probable cause + next step). Add Retry button inline. | `App.tsx:868,875,877,921,923,1018`, `SpecialModesPanel.tsx:129,138,140` | M | copywriter+dev | 4 | 5 | — |
| R12 | Stripe Pro price → $49 | `api/stripe-checkout.ts:70` `unit_amount: '2900'` → `'4900'`. Grandfathering logic per Fork #2. | `api/stripe-checkout.ts` | M | dev | 5 | 5 | Fork #2 |
| R13 | Stripe Starter product $19 | New `stripe-checkout.ts` branch: Starter $1900. `hooks/useSubscription.ts`: add `plan === 'starter'` metered 40/mo. | `api/stripe-checkout.ts`, `hooks/useSubscription.ts` | L | dev | 5 | 5 | R12 |
| R14 | Stripe Team product $99 | New branch: Team $9900 + 3 seats. | `api/stripe-checkout.ts`, `hooks/useSubscription.ts` | L | dev | 4 | 4 | R13 |
| R15 | Annual plans + toggle | `interval: year` price objects for all 3 tiers at 20% off ($180/$468/$948). Pricing page toggle defaults annual. | `api/stripe-checkout.ts`, `components/PricingPage.tsx` (new or extracted) | L | dev+designer | 5 | 5 | R12 |
| R16 | Credit pack reprice | `CREDIT_PACKS` → starter $15/10, pro_pack $29/25, agency $69/75 (was 50). | `api/stripe-checkout.ts:7-11` | S | dev | 4 | 5 | — |
| R17 | Free-tier rewrite | 5-lifetime then 1/day (per Fork #3 resolution). Add `lifetime_free_gens_used` counter. | `hooks/useSubscription.ts`, Supabase schema | M | dev | 5 | 5 | Fork #3 |
| R18 | Pause subscription action | New `action: 'pause_subscription'` in stripe-checkout with 30/60/90 day options. Exposed from cancellation survey. | `api/stripe-checkout.ts`, Stripe Portal config | M | dev | 4 | 5 | — |
| R19 | Pricing page component | 4 tiers, decoy ordering (Team on left), per-photo framing, logo/testimonial strip. Annual toggle default-on. | `components/PricingPage.tsx` (new), extract from App.tsx lines 1592-1700 | XL | dev+designer+copywriter | 5 | 5 | R15 |
| R20 | Router introduction | Introduce client-side routing (per Fork #4). If Option A: `react-router-dom`. If Option B: hash-based. | `App.tsx`, `src/routes/` | L | dev | 5 | 4 | Fork #4 |
| R21 | `/settings` route with sub-tabs | `/settings/brand`, `/team`, `/billing`, `/referral`, `/integrations`, `/account`. Migrate current Access Panel content. | `src/routes/settings/*`, `components/BrandKit.tsx`, `ManageTeam.tsx`, `ReferralDashboard.tsx` | XL | dev+designer | 5 | 5 | R20 |
| R22 | Mount ListingDashboard | Wire `ListingDashboard.tsx` + `useListing.ts` at `/listings` and `/listings/[id]`. Sidebar nav item. | `src/routes/listings/*`, `App.tsx` sidebar | L | dev | 5 | 4 | R20, Fork #5 |
| R23 | Promote Pro AI Tools to sidebar | First-class left-rail item "Pro Tools" replacing the accordion. Auto-expanded on first-gen for Pro users. | `App.tsx` nav array, `SpecialModesPanel.tsx` | M | dev+designer | 5 | 5 | — |
| R24 | Real marketing URLs | `/pricing`, `/features`, `/faq`, `/gallery` accessible pre- and post-auth. | `src/routes/*` | M | dev | 4 | 5 | R20 |
| R25 | `/try` unauth demo | One free stage before sign-in gate. (Per Fork #3 Option D.) | `src/routes/try/*`, auth gate refactor | L | dev | 5 | 4 | R20, Fork #3 |
| R26 | Retry button in error toasts | Extend toast primitive with optional action button. 6s duration for errors. | `App.tsx` toast system | M | dev | 4 | 5 | — |
| R27 | Keyboard shortcut map | Escape (close modals), ⌘S (Save), ⌘E (Export), ⌘Enter (Generate), `[`/`]` (prev/next photo), `?` (shortcut sheet), Space-hold (before/after). | `hooks/useKeyboardShortcuts.ts` (new), `App.tsx` | L | dev | 4 | 5 | F6 |
| R28 | Custom tooltip primitive | `<Tooltip>` with 400ms open / 100ms close. Replace `title=` everywhere. | `components/Tooltip.tsx` (new), ~20 files | M | dev+designer | 4 | 5 | — |
| R29 | Drag-over visual state | `isDraggingOver` → tint border primary, raise shadow, "Drop to upload" overlay. | `components/ImageUploader.tsx` | S | dev+designer | 3 | 5 | — |
| R30 | Modal open transition | `scale(0.96 → 1)` + fade over 220ms cubic-bezier. | `index.css` `.modal-content`, `.modal-overlay` | S | designer+dev | 3 | 5 | F6 |
| R31 | Mask brush size cursor | DOM circle following mouse, scaled to `brushSize`. White ring 1px + subtle shadow. | `components/MaskCanvas.tsx` | M | dev | 4 | 5 | — |
| R32 | `<PanelHeader>` extraction | Extract 4 inline copies. | `components/PanelHeader.tsx` (new), `StyleControls.tsx:230-278`, `SpecialModesPanel.tsx:70`, `BrandKit.tsx`, `MLSExport.tsx` | M | dev | 3 | 5 | — |
| R33 | `<Button>` / `<Badge>` / `<Pill>` | 4 button variants (primary/secondary/ghost/icon × 2 sizes). 1 Badge component. 1 Pill component. Replace top 20 usages. | `components/ui/Button.tsx`, `Badge.tsx`, `Pill.tsx` | L | dev+designer | 4 | 5 | — |
| R34 | Pack tile "selected" pre-fire | Two-step: first click selects (ring appears), second click or explicit Generate fires. | `components/StyleControls.tsx` packs mode | M | dev+designer | 3 | 5 | — |
| R35 | Per-tool progress copy | Sky replacement says "Matching the sky," not "Placing furniture." | `App.tsx:2403-2405`, `SpecialModesPanel.tsx` | S | copywriter+dev | 3 | 5 | R5 |
| R36 | GHL email nurture | Day 0/2/5/7/14/30 sequence for free users. Admin-approved drafts only (per user memory rule). | GHL workflows + email templates | L | copywriter+dev | 4 | 4 | — |
| R37 | Cancellation survey | Stripe Portal config: "Too expensive" → 30% off, "Not enough listings" → pause, "Missing feature" → log. | Stripe Dashboard + `api/stripe-portal.ts` | M | product+dev | 4 | 5 | R18 |
| R38 | Winback flow | Day 7 / 30 / 90 post-cancel emails. | GHL workflows | M | copywriter | 3 | 4 | R36 |

**Phase 2 exit criteria:** $49 Pro live, $19 Starter live, annual default-on, `/settings` + `/listings` + Pro Tools-as-sidebar deployed, all 15 copy rewrites shipped, blended ARPU +30% in first 30-day cohort.

---

## Phase 3 — Differentiate (Weeks 7–12, ship by 2026-07-13)

**Goal:** The three category-defining primitives, the API, and the content moat.

| # | Title | Description | Files | Effort | Owner | Impact | Conf | Deps |
|---|---|---|---|---|---|---|---|---|
| D1 | Listing Score | User-facing 1–10 score on every result, with callouts ("MLS-ready: 8.2/10 — weaken watermark contrast"). Reuse SOP §8.4 SSIM pipeline. | `components/QualityScore.tsx` refactor, `api/score.ts` | XL | dev | 5 | 4 | — |
| D2 | Structural Lock toggle | Visible toggle on Design Studio: "Preserve walls/floors/fixtures: ON." Already enforced server-side; expose it. | `components/StyleControls.tsx`, `services/geminiService.ts` | M | dev+designer | 4 | 5 | — |
| D3 | Reference-image prompt | Drop a moodboard image alongside the text prompt: "use this image for the sofa." | `components/StyleControls.tsx`, `services/geminiService.ts`, Gemini multi-image request format | L | dev | 5 | 4 | — |
| D4 | Listing Kit one-click | Saved recipe: stage → dusk hero → smart cleanup batch → MLS export zip → social pack → listing copy. Single button. | `components/ListingKitPipeline.tsx` (new), `hooks/useListing.ts` | XL | dev+product | 5 | 4 | R22 |
| D5 | Public API (read-write min) | Auth, rate limits, 3 endpoints: POST /generate, GET /history, GET /download. Per Fork #9. | `api/v1/*`, developer-portal at `/developers` | XL | dev | 5 | 4 | Fork #9 |
| D6 | GHL native integration | Trigger a StudioAI generation from a GHL workflow. Use A&B's own GHL as testbed. | `api/v1/webhook/ghl.ts`, GHL custom action | L | dev+product | 4 | 4 | D5 |
| D7 | Static pack preview images | Reference render per pack (no live generation). Closes 80% of wait-loop anxiety at zero Gemini cost. (Per Fork #10 Option B.) | `public/pack-previews/*.jpg`, `StyleControls.tsx` | M | designer+dev | 4 | 5 | Fork #10 |
| D8 | Thumbnail pipeline | Generate 256-wide JPEG thumbs on save; store alongside full-res; swap all grid `<img>`s. | `utils/thumbnail.ts` (new), `App.tsx` save handlers, History panel | L | dev | 4 | 5 | — |
| D9 | Code-split admin panels | `React.lazy` + `<Suspense>` around ManageTeam, AdminShowcase, ReferralDashboard, BatchProcessor, PrintCollateral, ListingDashboard, QuickStartTutorial, ExportModal. | `App.tsx:8-26` (static imports → lazy) | L | dev | 4 | 5 | F6 |
| D10 | Community Gallery | Consumer-facing `/gallery` of approved submissions. Move Admin Showcase approval into `/admin`. | `src/routes/gallery/*`, `src/routes/admin/*` | XL | dev+designer | 3 | 4 | R20 |
| D11 | Reveal video productization | Track shares; analytics dashboard for reveal-video views. Extend ExportModal's existing reveal feature. | `components/ExportModal.tsx`, `api/track-reveal.ts` | L | dev | 3 | 4 | — |
| D12 | SEO blog with 12 articles | Cornerstone articles: listing-media pipeline, MLS compliance, AI staging disclosure, per-MLS export specs (Zillow, ARMLS, Generic). | `src/routes/blog/*` | XL | copywriter+dev | 4 | 3 | R20 |
| D13 | Client-side pre-upload resize | Resize to 2048-long-edge JPEG at 0.85 before Gemini. Cuts payload 5–8x. | `utils/resizeForUpload.ts` (new), `ImageUploader.tsx`, `BatchUploader.tsx`, `App.tsx` drag-drop | L | dev | 4 | 5 | — |
| D14 | Mask canvas history memory fix | Downscale history snapshots or store stroke paths not raster snapshots. | `components/MaskCanvas.tsx:31-41` | L | dev | 3 | 4 | — |
| D15 | Accessible CompareSlider | Native `role="slider"` with arrow-key + Home/End + Page Up/Down, `aria-valuenow/min/max`, `aria-label`. | `components/CompareSlider.tsx:54-104` | M | dev | 3 | 5 | — |
| D16 | Form a11y sweep | Replace placeholder-as-label with `<label htmlFor>`; `aria-describedby` for validation; visible error states. | `BrandKit.tsx`, `SocialPack.tsx`, `ManageTeam.tsx`, `ListingDescription.tsx`, `ExportModal.tsx`, `BetaFeedbackForm.tsx` | L | dev | 3 | 5 | — |
| D17 | Decouple App.tsx per-panel state | Each panel gets its own context; keystroke in prompt textarea stops re-rendering CompareSlider, history, batch. | `App.tsx` (2779 LOC) → per-panel contexts | XL | dev | 4 | 3 | — |
| D18 | Keyboard shortcuts sheet | `?` opens a Linear-style overlay listing all shortcuts. | `components/KeyboardShortcutsSheet.tsx` (new) | M | dev+designer | 3 | 5 | R27 |
| D19 | Canvas meta strip | Image name, dimensions, zoom level under the canvas (Photoroom/Krea parity). | `App.tsx` canvas frame | M | dev+designer | 3 | 5 | — |
| D20 | Suggest prompts for agents | Replace aesthetic-only chips with agent-language: "Stage for a family buyer," "Make it move-in ready," "Luxury buyer look." | `StyleControls.tsx:251-254` | S | copywriter | 3 | 5 | — |
| D21 | `/developers` portal | API docs, rate limits, auth guide, code samples (curl + JS + Python). | `src/routes/developers/*` | L | dev+copywriter | 3 | 4 | D5 |
| D22 | Status page | Public status at status.studioai.averyandbryant.com. Uptime for auth, Gemini, Stripe. | StatusPage.io or custom | M | dev | 3 | 5 | D5 |
| D23 | Google Identity defer | Load `accounts.google.com/gsi/client` on intent (click Sign In), not in head. | `index.html:29`, `App.tsx` auth flow | M | dev | 3 | 5 | — |
| D24 | Reveal video gallery | Public gallery of shared reveal videos (once tracking exists). Content moat piece. | `src/routes/reveals/*` | L | dev+designer | 3 | 3 | D11 |
| D25 | Inman/HousingWire outreach | Pitch 3 articles about StudioAI to trade press. Content moat distribution. | External | M | product | 4 | 3 | D12 |
| D26 | Referral dashboard rewrite | Move into `/settings/referral`, add code status, shareable link with `?ref=CODE` deep-link handling. | `components/ReferralDashboard.tsx`, `src/routes/settings/referral.tsx` | M | dev+designer | 3 | 5 | R21 |

**Phase 3 exit criteria:** 3+ Pro users using the API, Listing Score on every result, Structural Lock + reference-image live, blog shipping 2 articles/week, initial JS < 300 KB gz, INP < 200ms on mid-tier Android.

---

## Cross-phase ranking summary (top 15 by impact × confidence)

Useful if Thomas wants to compress scope to "just ship the 15 most important things."

| Rank | Phase | # | Title | Score (I×C) |
|---|---|---|---|---|
| 1 | P1 | F1 | Remove viewport lock | 25 |
| 2 | P1 | F6 | `useModal` hook | 25 |
| 3 | P1 | F7 | Undo toast pattern | 25 |
| 4 | P1 | F9 | `AbortController` on generations | 25 |
| 5 | P1 | F10 | Type scale collapse | 25 |
| 6 | P1 | F16 | Mobile: auto-close sheet on Generate | 25 |
| 7 | P2 | R1 | Hero rewrite | 25 |
| 8 | P2 | R2 | Primary CTA rewrite | 25 |
| 9 | P2 | R12 | Stripe Pro → $49 | 25 |
| 10 | P2 | R13 | Stripe Starter $19 | 25 |
| 11 | P2 | R15 | Annual plans + toggle | 25 |
| 12 | P2 | R17 | Free-tier rewrite | 25 |
| 13 | P2 | R19 | Pricing page component | 25 |
| 14 | P2 | R21 | `/settings` route | 25 |
| 15 | P2 | R23 | Promote Pro AI Tools | 25 |

If Phase 3 gets compressed or Thomas wants a 60-day plan instead of 90: cut Phase 3 items D10, D11, D12, D24, D25 (content moat, community gallery, blog) and defer them to a follow-on "Phase 3.5" sprint in Q3.

---

## Parallelization notes

Applying CLAUDE.md's lane model:

- **Lane A (client-side image utils / export / UI chrome):** F3, F5, F10–F15, F20, F24, F25, F27, F28, R3–R5, R29, R30, R32, R33, R34, R35, D8, D13, D14, D19
- **Lane B (data / state / routing / backend):** F23, R7, R12–R18, R20, R21, R22, R25, R37, R38, D5, D6, D9, D17, D22
- **Lane C (copy / AI / prompts / marketing):** R1, R2, R6, R8, R9, R10, R11, R36, D1, D2, D3, D4, D7, D12, D20, D25
- **Lane D (a11y / interaction / mobile polish):** F1, F2, F4, F6, F7, F8, F9, F16, F17, F18, F19, F21, F22, F26, R26, R27, R28, R31, D15, D16, D18, D23

Lanes A + C + D can mostly run in parallel. Lane B bottlenecks on router/auth refactor (R20) — ship F-series first, then R20, then fan out R21/R22/R24/R25 in parallel.

---

## Accountability

- Phase 1 owner: dev lead (Thomas or Claude Code)
- Phase 2 owners split: pricing/Stripe = dev; IA/routing = dev; copy = copywriter; design system = dev+designer
- Phase 3 owner: product lead (Thomas); API scope-gated per Fork #9

Weekly check-in at Monday 9am CT. Blockers reported to Thomas within 24 hours of discovery.

---

*End of backlog.*
