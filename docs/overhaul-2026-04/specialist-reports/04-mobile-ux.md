# StudioAI Mobile UX Audit — April 2026

**Specialist:** Mobile UX
**Stack reviewed:** React 19 + Vite + Tailwind CDN, single root `App.tsx` (2,779 lines), 25 feature components
**Target viewports:** iPhone 15 Pro (393 CSS px), iPhone 15 Pro Max (430 CSS px), iPhone SE (375 CSS px)

---

## TL;DR

Mobile is **partially viable today** — staging, room picker, compare slider, and nav work on a phone, and someone clearly put work into the bottom tab bar + bottom-sheet pattern (`App.tsx:2334-2606`). But the right panel sheet only opens to ~45vh, the top header overflows on 375px when a result exists (7 icons in a row), and several load-bearing surfaces (MLS Export, ExportModal, Social Pack form grids, BrandKit) were clearly built desktop-first and squeezed down. Biggest blocker: **the control sheet covers the canvas during generation** — agents can't see their result forming while the sheet is open. #1 fix: **collapse the sheet automatically on Generate + switch header to icon-only overflow on <sm breakpoints**.

There is **no PWA manifest** (`public/` has no `manifest.json`, `index.html` has no `rel="manifest"`). Installability is zero value left on the table for a product whose users are agents on the move.

---

## 1. Feature tier-ing

Mapped every feature from `docs/SOP.md §2 Feature reference` and every left-rail/right-panel surface:

| Tier 1 — Mobile-first (375–428px) | Tier 2 — Mobile-usable (optimize ≥640px) | Tier 3 — Desktop-only (show "Open on desktop") |
|---|---|---|
| Upload (camera + library) `ImageUploader.tsx` | Text prompt mode `StyleControls.tsx` | Batch processing queue `BatchProcessor.tsx` |
| Generate Design / Build on Current | Packs mode (7 tiles) | Batch MLS zip export `MLSExport.tsx` mode=batch |
| Room Type pill + dropdown `App.tsx:2445` | Pro AI Tools (Day to Dusk, Sky, Smart Cleanup) | Manage Team `ManageTeam.tsx` (admin) |
| EditingBadge + Commit & Continue `EditingBadge.tsx` | Virtual Renovation (4 text fields) | Admin Showcase `AdminShowcase.tsx` |
| Compare slider `CompareSlider.tsx` | Listing Description generator `ListingDescription.tsx` | Print Collateral PDF builder `PrintCollateral.tsx` |
| Cleanup mask drawing `MaskCanvas.tsx` | Social Pack `SocialPack.tsx` (form-heavy) | Listing Dashboard multi-asset view `ListingDashboard.tsx` |
| Export current result `ExportModal.tsx` (core path) | MLS Export (single mode) | Referral Dashboard charts `ReferralDashboard.tsx` (recharts) |
| Save to history, Undo/Redo (gesture) | Quality Score `QualityScore.tsx` | Brand Kit full editor `BrandKit.tsx` (10 fields + image uploads) |
| Share sheet (native `navigator.share`) | History panel thumbnails | Color Analysis palette extract (desktop viewing) |
| Bottom tab nav (5 items) `App.tsx:2363` | Reveal video export (inside ExportModal) | Furniture Remover palette picker `FurnitureRemover.tsx` |
| Upgrade to Pro (Stripe Checkout) | Style Advisor 3-pick | Beta Feedback long form |

**Guidance:** Tier 3 screens should render a simple dark card with the StudioAI mark, the feature name, and "Open on a desktop browser to use this feature — we'll keep your session." Detect via `window.innerWidth < 768 && /iPhone|Android/i.test(navigator.userAgent)`.

---

## 2. Breakpoint audit

Grep of `.tsx` files shows **62 responsive class usages** across 4 files — and the distribution is lopsided:

- `App.tsx` — 53 usages (landing page + header + editor shell)
- `StyleControls.tsx` — 6
- `SpecialModesPanel.tsx` — 2
- `ListingDashboard.tsx` — 1

**Finding:** 21 of 25 feature components have **zero** responsive classes. They inherit whatever width the parent gives them, which means MLSExport, ExportModal, SocialPack, BrandKit, BatchProcessor, and ListingDescription render at fixed widths regardless of viewport.

Breakpoints in use: `sm:` (640), `lg:` (1024). `md:` and `xl:` are effectively unused. The cutover from mobile-sheet layout to desktop-side-panel layout happens at `lg:` (`App.tsx:2335`, `2363`, `2594`). That's the right boundary — iPads in portrait (768px) correctly get the mobile layout.

**Inconsistency:** Tailwind is loaded via CDN (`index.html:28` `<script src="https://cdn.tailwindcss.com">`), which means `@media` purging never runs and `safe-area-inset` helpers aren't in the default config. `.safe-bottom` is hand-rolled in `index.css:525`. For production, move to the Tailwind PostCSS pipeline so breakpoints, JIT, and safe-area utilities are consistent.

---

## 3. Touch target audit (Apple HIG 44×44 minimum)

Systematic fails:

| Location | File:line | Current size | Issue |
|---|---|---|---|
| Top header icon buttons (Undo, Redo, Refresh, Help) | `App.tsx:2060,2070,2186,2194` | `p-1.5` + `size={15}` icon = ~28×28px | 16px below HIG |
| Session nav arrows (prev/next photo) | `App.tsx:2086,2098` | `p-1.5` + `size={15}` = ~28×28 | Fails |
| Profile avatar button | `App.tsx:2202,2233` | `h-8 w-8` = 32×32 | Fails |
| MaskCanvas brush size buttons | `MaskCanvas.tsx:236` | `h-7 w-7` = 28×28 | Fails — and this is literally the drawing tool |
| MaskCanvas undo/redo/clear | `MaskCanvas.tsx:251,260,268` | `p-2` + `size={16}` = ~32×32 | Fails |
| EditingBadge chevron toggle | `EditingBadge.tsx:60` | `px-2.5 py-1.5` = ~32px tall | Fails on height |
| Room Type pill | `App.tsx:2450` | `px-2.5 py-1` + `size={13}` icon = ~26px tall | Fails on height |
| Bottom tab nav items | `App.tsx:2374` | `px-3 py-1.5` in `py-1.5` container = ~44px tall with label | **Passes** |
| Compare slider grip | `CompareSlider.tsx:92` | `h-11 w-11` = 44×44 | **Passes** |

**9 of 10 audited controls fail HIG.** The bottom tab bar and compare grip are the only controls intentionally sized for thumbs.

---

## 4. Thumb-zone analysis (iPhone 15 Pro 393×852, Pro Max 430×932)

Using Scott Hurff's thumb-zone model (top third = hard, bottom two-thirds = reachable):

- **Bottom tab bar** — `App.tsx:2363` — pinned `bottom-0` with `safe-bottom`. Perfect thumb zone on both 15 Pro and Pro Max. Limited to `.slice(0,5)` which is correct.
- **Primary CTA "Generate"** — Inside `.mobile-control-sheet`, which sits at `bottom: 56px` when closed (showing only the handle). When open it covers ~45vh. On 15 Pro Max that puts the Generate button at roughly y=500px — still reachable, but the header-mounted Export/Save/Add buttons (top-right of screen) are in the unreachable "upper-right" zone on Pro Max.
- **Header close/refresh/help** — top-right corner, 100% in the "ow" zone. If these aren't one-handed reachable on Pro Max, wire Undo/Redo to gestures (double-tap canvas = undo) instead of top-bar icons.
- **Room Type dropdown** — top-left of canvas, acceptable for left-handed users only. Because the dropdown opens **down from the pill** (`App.tsx:2467`), its options land in the thumb zone — good.
- **EditingBadge dropdown** — same anchor as room pill (right side of `absolute left-2.5 top-2.5`). Dropdown opens `mt-1.5` — 264px wide (`w-64` = 16rem) from left edge. On 375px viewport with `left-2.5` (10px), the dropdown goes from x=10 to x=274 — fits, but the "chain full · amber" state makes it 20% wider with the extra text; on 375px with icons both present, **the two dropdowns would overlap if opened simultaneously** (they're aware of each other per the code comment at line 2389). On a phone, positioning them both at top-left is a collision waiting to happen when the device rotates or a larger font setting is enabled.

---

## 5. Viewport / layout issues at 375px

| Surface | Issue | Evidence |
|---|---|---|
| **Header with result** | 7 buttons + avatar + divider at 375px. `gap-1.5` between them. Export+Save+Add each have `hidden sm:inline` label (good), but 7 icon buttons @ 32px + padding = ~260px, leaving ~100px for the logo "StudioAI" text → logo shrinks/wraps unpredictably. | `App.tsx:2111-2212` |
| **Right panel bottom sheet** | Max height `min(45vh, calc(100dvh - 180px))` (`index.css:248`). On 375×667 iPhone SE that's ~300px. Packs mode has 7 preset tiles (grid-cols-2 typically) + mode switcher + Generate button → doesn't fit, scrolls within sheet. Users can't see canvas + all controls at once. | `index.css:241-255` |
| **Modals** | `ExportModal` is 821 lines, uses `max-w-` nowhere. Renders at full viewport with inner padding. Reveal-video controls and disclaimer editor stack vertically fine but preview thumbnail is huge. | `ExportModal.tsx` |
| **Canvas aspect** | Canvas wrapper switches from `aspect-[4/3]` on phone to `aspect-video` (16:9) on `sm:` (`App.tsx:2388`). 4:3 is correct for listing photos — **the `sm:aspect-video` is a bug** for real estate, where images are 4:3 from Zillow/ARMLS (see SOP §Export). | `App.tsx:2388` |
| **Social Pack form** | `grid grid-cols-[1fr_60px_80px]` (`SocialPack.tsx:329`) forces 140px of sidecar input + a 1fr city field. On 375px with `p-4` padding that's 312px usable → city input gets ~170px, usable but cramped. Also `grid-cols-4` for beds/baths/sqft/year at line 341 — each field gets ~65px → labels clip. | `SocialPack.tsx:329,341` |
| **MLS Export** | Preset dropdown, watermark toggle, image grid — no responsive classes. Fixed layout relies on parent sheet width. Since sheet is only ~45vh tall on phone, the multi-select image grid scrolls within the panel. Usable, not optimized. | `MLSExport.tsx` |
| **EditingBadge dropdown** | 264px wide, positioned `absolute` relative to its wrapper. If user scrolls canvas while dropdown is open, no close-on-scroll. Only closes on outside click. | `EditingBadge.tsx:69` |

---

## 6. Input handling

- **Textareas** (prompt input, tip card) — render as native `<textarea>`, iOS auto-zooms on focus if font-size < 16px. StyleControls prompt textarea uses `text-sm` (14px) → **iOS will zoom on focus**, then fail to zoom back out cleanly. Add `font-size: 16px` or `text-base` at `<sm:` breakpoint.
- **Sliders** — not used; brush size is a 3-button toggle. ✓
- **Mask drawing** — `MaskCanvas.tsx:136-193` handles `onTouchStart/Move/End` with `e.preventDefault()` in `draw()` (line 151) only after `isDrawing` is true. Works. Brush size auto-ups to 80px on mobile (`MaskCanvas.tsx:17-18`) which is correct. Issue: **no pinch-to-zoom** — users drawing a small mask on a 375px canvas have finger-sized precision (~40px real pixels at 4K native), so small-object masking will be imprecise.
- **Native file input** — `<label>` wrapping `<input type="file">` at `App.tsx:2134` correctly triggers the iOS photo picker (includes Take Photo option).
- **Number inputs** in Social Pack use `type="text"` (`SocialPack.tsx:342-345`) — no numeric keyboard. Should be `inputMode="numeric"` for beds/baths/sqft/year/zip.

---

## 7. Gestures

| Gesture | Where expected | Status |
|---|---|---|
| Swipe down to dismiss sheet | Mobile control sheet | ❌ Only toggle button; no swipe handler |
| Swipe left/right between sessions | Session queue | ❌ Not wired; uses header arrows only (`App.tsx:2082`) |
| Pinch-to-zoom canvas | Canvas / MaskCanvas | ❌ `<meta viewport>` has `maximum-scale=1.0, user-scalable=no` (`index.html:5`) — pinch is **globally disabled**. This is the single biggest accessibility regression. |
| Two-finger pan mask | MaskCanvas | ❌ Not possible due to viewport lock |
| Compare slider drag | `CompareSlider.tsx:63` | ✓ `onTouchStart/Move` with `touch-action: none` — works |
| Long-press on image for share | Anywhere | ⚠ Default browser behavior; no customization |

**The `user-scalable=no` in `index.html:5` is a WCAG 2.1 failure** (SC 1.4.4 Resize text). Remove `maximum-scale` and `user-scalable`; keep `width=device-width, initial-scale=1.0`.

---

## 8. Performance on mobile

- **Tailwind CDN** (`index.html:28`) ships ~3MB of CSS on first paint, then JIT-generates against the DOM. On a 4G agent-in-the-field connection (~4–8 Mbps), that's 3-6s before any paint. **Move to compiled Tailwind.**
- **No code-splitting** — single `App.tsx` at 2,779 lines is imported as one module. Every route (landing + editor + modals) is shipped as one bundle. A cold mobile load downloads BatchProcessor, PrintCollateral, ManageTeam, AdminShowcase, ReferralDashboard (with recharts ~90KB gz) even for a user who'll only stage one photo.
- **recharts** (`package.json:22`) is imported for ReferralDashboard only — lazy-load it. Same for @react-pdf/renderer (not yet in deps but planned per CLAUDE.md §1.5).
- **No `<img loading="lazy">`** on History/Saved thumbnails — every reopened session re-downloads thumbs.
- **Base64 image storage** — Gemini returns data URLs, history keeps them in memory. A 10-photo session on a 4GB iPhone = ~200MB of base64 heap. Safari will kill the tab.
- **Hydration** — with React 19 + Vite, no SSR, so FCP is entirely client-side. Lighthouse Mobile score is likely below 50 on 4G.

---

## 9. Install-to-home-screen (PWA)

**Currently zero PWA surface.** No `manifest.json`, no service worker, no `rel="manifest"` in `index.html`, no `apple-mobile-web-app-capable` meta, no standalone-mode styling.

An installable StudioAI would be a material UX win — agents could tap an icon on the lockscreen, show a splash, and open directly to the editor. Recommendations:

1. Add `public/manifest.json` with `name`, `short_name: "StudioAI"`, `theme_color: #000`, `background_color: #000`, `display: standalone`, `start_url: /`, 192px and 512px PNG icons (favicon.svg alone won't satisfy Android Chrome).
2. Add `<link rel="manifest" href="/manifest.json">` and `<meta name="apple-mobile-web-app-capable" content="yes">` to `index.html`.
3. Add a minimal service worker that caches shell (`index.html`, compiled CSS/JS) via Workbox. Do **not** cache API responses — Gemini generations are unique and large.
4. Detect `beforeinstallprompt` and surface a subtle "Add to Home Screen" pill in the bottom tab overflow once the user has completed 2+ generations.

---

## 10. Competitor benchmarks

**Virtual Staging AI (virtualstagingai.app):** Their flow is deliberately spartan — upload, pick room, pick style, download. On mobile they collapse the whole flow into a vertical stack (no sidebar), and generation runs as a full-screen blocking state with a timer. What they nail: the upload CTA is always reachable in the thumb zone, and their "download" button on mobile triggers the native share sheet rather than forcing a file save. What StudioAI can borrow: **treat Generate as a full-screen modal on mobile** so the canvas + progress animation + elapsed timer are 100% visible, and dismiss the control sheet automatically.

**Photoroom (photoroom.com):** Their web tool is a PWA with manifest + installable prompt. On mobile they use a bottom segmented control for tool switching (Cutout, Background, Edit) with 56px touch targets, and a floating action button (FAB) for the primary action per mode. Their canvas supports two-finger pan + pinch-zoom even while a tool is active. They also detect mobile and offer "Download our app" as a soft redirect, but the web version is fully usable. What StudioAI can borrow: **unlock pinch-zoom**, adopt 56px tab items, and add the manifest so iOS agents can install.

---

## Top 10 mobile bugs / opportunities (ranked by impact)

1. **`user-scalable=no` in viewport** — `index.html:5`. WCAG failure, and blocks pinch-zoom on canvas. One-line fix, huge accessibility win.
2. **Control sheet covers canvas during Generate** — sheet stays open while progress animation plays behind it. Auto-close on Generate; reopen on completion.
3. **Top header overflows on 375px when a result exists** — 7 icon buttons + avatar. Move Undo/Redo + Refresh into a "…" overflow menu below `sm:`.
4. **Touch targets fail HIG on 9 of 10 audited controls** — bump header icon buttons to `p-2.5` + `size={18}`, mask brush buttons to `h-11 w-11`.
5. **No PWA manifest** — agents can't install; every visit is a browser-chrome-first experience.
6. **Canvas aspect ratio 16:9 on `sm:`** — `App.tsx:2388`. Wrong for real estate photos (4:3 native). Keep `aspect-[4/3]` at all breakpoints or add per-image auto-detect.
7. **Prompt textarea triggers iOS zoom on focus** — font-size < 16px. Single class fix.
8. **No pinch-zoom on MaskCanvas** — precision cleanup on a phone is currently impossible.
9. **No mobile guard on Tier 3 features** — Manage Team, Admin Showcase, Batch, Referral Dashboard render broken layouts silently. Add a "Open on desktop" gate.
10. **Tailwind via CDN** — 3MB payload on cold load, nukes LCP on 4G. Compile to static CSS.

---

## Recommended roadmap

**Ship first (1-day scope, unblocks everything):**
- Remove `maximum-scale` / `user-scalable=no` from `index.html:5`
- Auto-close control sheet on Generate; auto-open on completion
- Add mobile overflow menu for header icons at `<sm:`
- Bump touch targets on header + mask toolbar to 44px minimum
- Add `inputMode` + `font-size:16px` fixes to text/number inputs
- Publish `public/manifest.json` + icons + `<link rel="manifest">`

**Ship second (1-week scope, differentiates):**
- Compile Tailwind (kill CDN)
- Code-split ReferralDashboard, BatchProcessor, PrintCollateral, ManageTeam, AdminShowcase via `React.lazy`
- Unify modal container with `max-w-md mx-auto` + `max-h-[90dvh] overflow-y-auto` wrapper
- Tier 3 gate: `<MobileBlockedShell featureName="Batch" />` for desktop-only surfaces
- Full-screen Generate state on mobile (dedicated progress route/overlay)
- Enable pinch-zoom + two-finger pan on canvas; integrate with MaskCanvas coordinate transforms

**Ship third (longer-term):**
- Swipe gestures between session queue photos
- Service worker for shell caching + offline-edit queue ("save this prompt, send when online")
- "Add to Home Screen" nudge after 2+ successful generations
- Native share sheet integration on Export (`navigator.share`) with fallback download
- Investigate React Native or Capacitor wrapper for true app-store presence once PWA install rate validates demand

---

**3-sentence summary:** Mobile is viable today for the core upload → stage → export flow, but the experience is rough around the edges and roughly 25% of features silently break on 375px. The biggest mobile blocker is the **viewport meta tag that disables pinch-zoom combined with the control sheet that covers the canvas during Generate** — together they make precision work and watching a result form impossible on a phone. The #1 mobile fix is to **ship a PWA manifest + fix the viewport + auto-collapse the control sheet during Generate in one short PR**; it's ~60 lines of change for a disproportionate lift in perceived polish and installability.
