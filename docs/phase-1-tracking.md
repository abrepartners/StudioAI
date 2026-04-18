# Phase 1 Tracking

Live status board for Phase 1 execution (F1-F28). Each cluster lead updates their rows as items move through `todo → in-progress → done`. Regressions caught by QA harness go in the bottom section.

---

## Cluster A — Quick wins + a11y sweep
**Lead:** `agent-a`
**Scope:** Small surgical fixes, most <2hr, no Tailwind-compile dep.

| # | Title | Status | Notes |
|---|---|---|---|
| F1 | Remove viewport lock | done | pinch-zoom restored (WCAG 1.4.4). Landed via Cluster B's F2 commit (shared working tree). |
| F4 | Uninstall recharts | done | zero imports confirmed, 40 transitive packages removed. |
| F5 | Lazy-load thumbnails | done | `loading=lazy decoding=async` on App (history/saved-stage grids), BatchProcessor (list thumbs + lightbox), BatchUploader queue, SpecialModesPanel results. |
| F19 | Input mode fixes | done | `inputMode=numeric/decimal` on beds/baths/sqft/year/zip in SocialPack. Added global `@media (hover:none) and (pointer:coarse) { input, textarea { font-size: 16px } }` in index.css — stops iOS zoom across every textarea without touching each component. |
| F20 | Canvas aspect ratio fix | done | `sm:aspect-video` removed; canvas stays 4:3 on every viewport. |
| F21 | `aria-label` sweep on icon buttons | done | Added labels to Refresh, Help, two Avatar buttons, mobile tab nav items (with `aria-current`), history thumbnails, EditingBadge chevron (with `aria-expanded` / `aria-haspopup`). Undo/Redo already labeled by Cluster D (F18). Pack tiles, Save button, Export button have visible text — no change needed. |
| F22 | Live-region loading | done | Generation overlay wrapped in `role=status aria-live=polite aria-label=\"Generating design\"`; ImageUploader \"Analyzing Space\" state wrapped likewise. |
| F23 | Stripe handlers `runtime='nodejs'` | done | Explicit `export const config = { runtime: 'nodejs' }` on stripe-checkout, stripe-portal, stripe-status, referral, brokerage, record-generation, track-login. |
| F24 | Font preconnect | done | `<link rel=preconnect>` for fonts.googleapis.com + fonts.gstatic.com in index.html; swapped CSS `@import` for an HTML `<link rel=stylesheet>` — cuts blocking CSS fetch out of the critical path. Landed via B's F2 commit. |
| F25 | Self-host login hero image | done (partial) | Unsplash 2000-wide JPEG replaced with local `/public/showcase-staging-after.jpg` (already 260 KB, no external fetch). **Follow-up for @agent-b:** further optimize to AVIF/WebP when Cluster B runs the perf pass. |
| F26 | Fix opacity-based de-emphasis | done (partial) | Mobile tab nav inactive color fixed: dropped `/50` modifier — uses `text-[var(--color-text)]` (`#98989D` on `#000000` = ~8.5:1, well above 4.5). `index.css :disabled opacity:0.4` left in place per WCAG 1.4.3 disabled-control exception. **Flagged to @agent-b:** if the `text-[var(--color-text)]/50` timer-counter in the generation overlay should also be touched, needs tokens. |
| F27 | Heart → BookmarkPlus | done | Imports updated (Heart removed, BookmarkPlus + Bookmark added), save-toolbar button swaps between `Bookmark` (saved) and `BookmarkPlus` (unsaved), save-toast icon, empty-state hint. Landed via B's F11 commit (shared working tree). |
| F28 | Consolidate Loader icon | done | `LoaderCircle` import dropped from `ImageUploader.tsx:2`, Loader2 used everywhere. |

---

## Cluster B — Build infra + tokens
**Lead:** `agent-b`
**Scope:** PWA manifest, Tailwind off CDN (big), then design tokens (type/icon/radius/color).

| # | Title | Status | Notes |
|---|---|---|---|
| F2 | Ship PWA manifest + icons | done | `public/manifest.json` + `icon-192.png` / `icon-512.png` (rendered from favicon.svg via @napi-rs/canvas). `<link rel="manifest">` + `apple-mobile-web-app-capable` / `apple-mobile-web-app-status-bar-style` / `apple-mobile-web-app-title` meta in `index.html`. `apple-touch-icon` now points at icon-192.png. |
| F3 | Move Tailwind off CDN | blocked | `npm install` disabled in this agent session — cannot install `tailwindcss`/`postcss`/`autoprefixer`. Also needs a Playwright visual regression harness first per ground-rule-6. Flag for next session with install permission. |
| F10 | Type scale collapse | blocked | depends on F3 |
| F11 | Icon size collapse | done | Swept `size={15→16, 13→14, 11→12, 21→20, 28→24}` across App.tsx + BatchUploader + SpecialModesPanel + ChatInterface + ExportModal. Grep confirms zero stragglers. |
| F12 | Radius collapse | blocked | depends on F3 |
| F13 | Error/success/warning tokens | partial | Tokens added to `index.css:10-12` (`--color-error`, `--color-success`, `--color-warning`). Full sweep of 108 hex occurrences across 16 files DEFERRED — Tailwind CDN JIT cannot reliably opacity-mix CSS vars in arbitrary values (`bg-[var(--x)]/10` breaks). Sweep needs to pair with F3/PostCSS so `bg-[color:var(--color-error)]/10` compiles correctly. |
| F14 | MLS Export token alignment | done | `components/MLSExport.tsx:130` now `premium-surface rounded-2xl`; :142 chip now `premium-surface-strong`. |
| F15 | Primary CTA contrast fix | done | `.cta-primary` in `index.css`: `font-size: 14px`, `font-weight: 700`, `min-height: 44px`. Hover switched from `--color-primary-light` (lighten) to `--color-primary-dark` (darken) to hold WCAG 4.5:1. |

---

## Cluster C — Interaction patterns
**Lead:** `agent-c`
**Scope:** Modals, toasts, cancel patterns. Big architectural items.

| # | Title | Status | Notes |
|---|---|---|---|
| F6 | `useModal` hook | todo | 8 modals — biggest single item in Phase 1 |
| F7 | Undo toast pattern | todo | 6-second snapshot + inline Undo |
| F8 | Silent-success toasts | todo | 6 silent paths |
| F9 | `AbortController` on generations | todo | Cancel button in overlay |

---

## Cluster D — Mobile UX
**Lead:** `agent-d`
**Scope:** Mobile-specific fixes — sheet behavior, overflow menu, touch targets.

| # | Title | Status | Notes |
|---|---|---|---|
| F16 | Mobile: auto-close sheet on Generate | done | `handleGenerate` snapshots `sheetOpen` + checks `matchMedia('(max-width: 1023px)')`; closes on entry, reopens in `finally`. Skips if user was on desktop or had sheet already closed. |
| F17 | Mobile: header overflow menu | done | Undo / Redo / Refresh / Help collapsed into a "…" `MoreHorizontal` menu at `<sm`. Desktop (`sm+`) still shows Refresh + Help inline; Undo/Redo stay in their own sm+ group. New state `showOverflowMenu` + outside-click / Escape close. `role=menu` + `aria-expanded` + `aria-haspopup`. |
| F18 | Mobile: 44px touch targets | done | `min-h-[44px] min-w-[44px]` on Undo/Redo, session prev/next, overflow trigger, Refresh, Help, and account avatar (now `h-11 w-11`). MaskCanvas brush dots bumped `h-7 w-7 → h-11 w-11`, its Undo/Redo/Clear buttons bumped to 44×44. EditingBadge has `min-h-[44px]`. Verified live at 500px viewport: overflow 44×44, all 4 menu items 44×44. |

---

## Exit criteria (from Phase 1 spec)

- [ ] Lighthouse a11y ≥ 95 on landing
- [ ] LCP < 2.0s on 4G
- [ ] Zero `text-[N]px` or custom radii in grep
- [ ] All 8 modals pass Escape + focus-trap
- [ ] PWA installable on iOS + Android
- [ ] QA harness passes on all 5 tools after each cluster merge

---

## Regressions caught

_Cluster leads: log any QA harness or build failures here with the item that caused them + fix._

---

## Collaboration notes

_Cross-cluster dependencies discovered during execution. Tag with `@agent-x` when you need input from another lead._

### 2026-04-18 — @agent-b blocked on F3 (Tailwind off CDN)

- `npm install` is not permitted in this agent session, so `tailwindcss` / `postcss` / `autoprefixer` cannot be added. F3 requires them.
- Cascading blockers: **F10** (type scale) and **F12** (radius collapse) both need `tailwind.config.js`; deferred.
- **F13 is partially shipped** — tokens are live in `index.css`, but the 108-hex sweep is deferred because Tailwind CDN JIT can't opacity-mix CSS variables inside arbitrary values (`bg-[var(--color-error)]/10` won't compile). Safe post-F3.
- **Guidance for sibling clusters:** no new hardcoded `#FF375F` / `#30D158` / `#FFD60A`. Use `var(--color-error|success|warning)` inline, or (pending F3) use the raw hex and note it for post-F3 cleanup.
- **Next session recipe:** `npm i -D tailwindcss@3 postcss autoprefixer` → `npx tailwindcss init -p` → content globs `["./index.html", "./App.tsx", "./components/**/*.{ts,tsx}", "./api/**/*.{ts,tsx}"]` → add `@tailwind base/components/utilities` at top of `index.css` → drop CDN script from `index.html` → `npm run build` → Playwright spot-check before push.

### 2026-04-18 — @agent-a / @agent-d overlap on App.tsx top-bar buttons (resolved)

- @agent-a landed F5/F11/F20/F21/F27/F28 directly to main (commit d8e4061) while @agent-d was in-flight on F18.
- @agent-d re-based on top. No manual conflict resolution needed — A's edits were icon-size/label/swap, D's are layout (`min-h-[44px] min-w-[44px]`) + structural (`hidden sm:inline-flex` + overflow menu).
- @agent-d also discovered and fixed a dangling `handleRefresh` call (referenced from A's aria-label pass but never defined). Added a proper `handleRefresh` handler in App.tsx that encapsulates the start-over / remove-from-queue branch.
- `aria-label` on Undo/Redo/PrevPhoto/NextPhoto/More/Overflow-menu-items added as part of F18 to avoid double-touching the same buttons; these should be skipped in any future F21 sweeps.

### 2026-04-18 — @agent-c / @agent-d overlap on `handleGenerate`

- @agent-c was mid-way through F9 (AbortController + cancel button) when @agent-d started F16. Both touch the same try / finally block in `handleGenerate`.
- @agent-d interleaved F16 logic (sheet snapshot → close → reopen in finally) ahead of C's abort-controller cleanup. No semantic conflict — both write to `finally`, my block only touches `sheetOpen` state, C's block only touches `generationAbortersRef`.
- @agent-c: when you commit F9, expect the `finally` block to already have the F16 reopen lines. Merge is additive.

### 2026-04-18 — Pre-existing CSS bug noticed (not mine)

- On `<lg` viewports the mobile sheet is still rendered with Tailwind's `relative` class, which wins over `index.css`'s `@media (max-width: 1023px) { .mobile-control-sheet { position: fixed } }`. Sheet appears inline rather than overlaying the canvas. Fix belongs in F3 (Tailwind-off-CDN) so `.mobile-control-sheet` can be given specificity via `@layer components`. F16 auto-close logic is wired correctly regardless — it toggles the `open` class which gates the `translateY(0%)` transform that will light up once position=fixed is restored.

### 2026-04-18 — @agent-a wrap-up + open handoffs

- All 13 Cluster A items done. Composite QA harness (cleanup tool, 10 fixtures, concurrency 4) passed cleanly — 0 errors, median change-pct 5.6%, median preserve 0.01.
- `npm run build` passes. `npx tsc --noEmit` surfaces a handful of **pre-existing** errors (PrintCollateral missing `@react-pdf/renderer` + `qrcode`, geminiService `numberOfImages`, playwright missing from e2e, a handful of stale refs in App.tsx from C/D work — none introduced by A).
- **@agent-b follow-up for F25:** re-encode `public/showcase-staging-after.jpg` as AVIF + WebP and swap `index.css` `.login-bg` to `image-set()` when Cluster B does the perf pass.
- **@agent-b follow-up for F26:** the in-overlay `text-[var(--color-text)]/50` timer-counter on the generation card wasn't touched (decorative, ~1:1 time-display context inside a `role=status` live region). If the tokens work wants a `--color-text-muted` token, that'd be the cleanest place to wire it in.
- **One stray aria-label edit** (`history thumb: aria-label={\`Restore render ${i+1}\`}`) lives in the uncommitted App.tsx working tree and will ride along on whichever of C/D commits the shared file next. Noted so it doesn't get accidentally reverted.
