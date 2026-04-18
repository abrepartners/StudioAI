# 09 — Accessibility & Performance

Specialist: A11y & Perf
Scope: WCAG 2.1 AA review + Core Web Vitals estimate from code review. No metrics measured against a running instance; everything below is read off the source at `/Users/camillebrown/StudioAI`.

---

## 1. Color contrast audit (WCAG 2.1 AA)

Palette pulled from `index.css:3-41`. True black background (`#000000`), primary ink `#F5F5F7`, muted text `#98989D`, Apple blue `#0A84FF`, Apple red `#FF375F`, success `#30D158`, warning `#FFD60A`, plus Tailwind zinc/gray shades used throughout the JSX.

| Foreground | Hex | Background | Ratio | AA body 4.5:1 | AA large 3:1 | Notes / worst offenders |
|---|---|---|---|---|---|---|
| `--color-ink` | #F5F5F7 | #000000 | 19.8:1 | PASS | PASS | Headings, primary labels |
| `--color-text` | #98989D | #000000 | 7.6:1 | PASS | PASS | Most secondary copy (good) |
| `--color-text` | #98989D | #1C1C1E surface | 6.4:1 | PASS | PASS | Panel bodies |
| zinc-400 (#a1a1aa) | | #000000 | 8.6:1 | PASS | PASS | CompareSlider "Before"/"After" labels `CompareSlider.tsx:98,102` |
| zinc-500 (#71717a) | | #000000 | 4.8:1 | PASS (barely) | PASS | History empty-state, pricing small print `App.tsx:1887,2538` |
| zinc-500 (#71717a) | | #1C1C1E surface | 4.0:1 | **FAIL** | PASS | Any zinc-500 on `premium-surface` — e.g. History empty text if rendered inside elevated card |
| zinc-600 (#52525b) | | #000000 | 3.3:1 | **FAIL** | PASS (barely) | Pipe separators `CompareSlider.tsx:99,101` — decorative, OK; but `text-zinc-600` used elsewhere (`SocialPack.tsx`) on body copy — **FAIL** |
| zinc-300 on black | #d4d4d8 | #000000 | 13.6:1 | PASS | PASS | Pill chips `App.tsx:2325` |
| Text-primary button | #FFFFFF | #0A84FF | 3.5:1 | **FAIL** for body | PASS (large) | `cta-primary` — WCAG says 4.5:1 for text <18pt/bold-14pt. Our CTA labels are ~14px 600w — borderline large; fails if anyone ships non-bold <14px |
| Text on primary hover | #FFFFFF | #409CFF (lightened) | 2.8:1 | **FAIL** | **FAIL** | `.cta-primary:hover` — drops below even large-text threshold |
| Accent button | #FFFFFF | #FF375F | 3.6:1 | **FAIL** body | PASS large | Upgrade / CTA surfaces |
| Primary accent text | #0A84FF | #000000 | 5.5:1 | PASS | PASS | "Try a Demo" link `App.tsx:2310` |
| Primary accent text | #0A84FF | #1C1C1E surface | 4.6:1 | PASS (barely) | PASS | Nav active state |
| Accent text | #FF375F | #000000 | 5.4:1 | PASS | PASS | |
| Success green | #30D158 | #000000 | 12.3:1 | PASS | PASS | Status dots, copy-confirm |
| Warning yellow | #FFD60A | #000000 | 17.1:1 | PASS | PASS | Rendering indicator |
| Placeholder text | zinc-500-ish in inputs | #1C1C1E | 3.6:1 | **FAIL** | PASS | Placeholders doubling as labels (see §6) |
| Disabled nav item | opacity 0.4 of #98989D | #1C1C1E | ~2.3:1 | **FAIL** | **FAIL** | `nav-item:disabled` `index.css:443`, `Furnish (SOON)` tab |
| Mobile tab text inactive | `text-[var(--color-text)]/50` = ~#989890 @ 50% | #000000 | 2.6:1 | **FAIL** | **FAIL** | `App.tsx:2375` — half the bottom nav on mobile is unreadable |
| Drop-shadow separator | rgba(255,255,255,0.08) | #000000 | <1.5:1 | — | — | Decorative; fine |

**Net**: the brand palette is solid against pure black, but three recurring patterns fail AA:

1. **White on Apple blue `#0A84FF`** is 3.5:1 — passes only for large text. Every `cta-primary` with <18px normal-weight text fails AA body. Hover state worsens to 2.8:1.
2. **Opacity-based de-emphasis** (`/50`, `opacity-40`) drops text below 3:1.
3. **zinc-500/600 on elevated surface** drops sub-4.5:1.

---

## 2. Accessibility audit

### Top 10 issues (ranked by user impact)

1. **No modals are focus-trapped and none respond to Escape.** `Grep` for `role="dialog"` / `aria-modal` / `Escape` returns zero matches repo-wide. Affects ExportModal (`components/ExportModal.tsx`), QuickStartTutorial (`components/QuickStartTutorial.tsx`), FurnitureRemover (`components/FurnitureRemover.tsx`), BrandKit, ManageTeam, ReferralDashboard, AdminShowcase. Keyboard users cannot close, focus leaks into background, and screen readers don't announce the dialog role. **This is the single biggest a11y failure.**
2. **CompareSlider has zero keyboard accessibility.** `components/CompareSlider.tsx:54-104`: a `<div>` with mouse/touch handlers, no `role="slider"`, no `tabIndex`, no `aria-valuenow`, no arrow-key handler. A core "before/after" interaction is mouse-only.
3. **Mask-draw Cleanup is mouse-only.** `components/MaskCanvas.tsx` has undo/redo/clear buttons (good: `aria-label` present on those) but the canvas itself has no keyboard alternative. This is hard to make fully keyboard-accessible, but at minimum we should offer a "Smart Cleanup auto-detect" fallback exposed as an a11y-equivalent path (already exists in Pro AI Tools — just announce the pairing).
4. **Icon-only buttons across the top bar and nav have no `aria-label` most places.** `App.tsx` imports ~80 lucide icons; only one `aria-label` on the desktop nav (`App.tsx:2352`). Top-bar Plus/Export/Save/Add/Pro/Refresh/Help/Profile, mobile bottom nav (`App.tsx:2367-2382`), EditingBadge chevron, style pack tiles, history thumbnails, and the mobile sheet toggle (`App.tsx:2596-2602`) — all icon-only, all unlabeled. Screen readers announce "button, button, button."
5. **Loading state is silent to assistive tech.** The `Generating Design` overlay (`App.tsx:2391-2399`) and "Analyzing Space" (`ImageUploader.tsx:57-60`) don't use `aria-live="polite"` or `role="status"`. Blind users don't know when the 30-second generation finishes.
6. **Forms: placeholder-as-label + missing `htmlFor`.** `<label>` / `htmlFor` appears in only 8 files; most inputs (SocialPack property fields, BrandKit phone/email/website, ExportModal disclaimer text, BetaFeedbackForm) rely on placeholders. Placeholders disappear on focus and their contrast is sub-4.5:1 (§1). Form errors are also not wired with `aria-describedby` — when export validation fails, screen readers don't get the reason.
7. **Status colors depend on color alone.** Status dots (`.status-dot-live` green vs `.status-dot-rendering` yellow) and the amber "chain full" EditingBadge state communicate meaning purely with hue. Needs an icon + text pairing for colorblind users.
8. **Focus rings are customised but inconsistent.** `index.css:74-81` defines a `:focus-visible` box-shadow ring globally, but `.cta-primary`, `.cta-secondary`, nav items, sidebar buttons, and most Tailwind-styled buttons throughout override `outline: none` and then set their own `box-shadow` only on some states. Many Tailwind-only buttons (`text-sm font-bold uppercase tracking-wider`, etc. — e.g. `App.tsx:2308-2315`) have no visible focus indicator.
9. **Decorative images without `alt=""`.** `App.tsx:1267` is the rare one done right. But the gradient/overlay `<img>` at `App.tsx:1523-1524` (mockup frames) has meaningful alt text that a screen reader will read aloud redundantly. And many CTA backgrounds in landing (`App.tsx:1391-1421`) use "Before"/"After" as alt — correct semantically, but paired rows announce "Before After Before After" in a loop without a `<figure>` wrapper.
10. **`prefers-reduced-motion` is partially honoured.** `index.css:602-610` wipes animations — good. But JS-driven motion (slider drag, shimmer overlays, mockup-step timers via `mockup-step-upload`/`mockup-step-bar`/`mockup-step-result`) still runs at full speed because it's not gated by the media query in JS. Also, the auto-appearing Quick-Start Tutorial modal (`QuickStartTutorial.tsx:68-78`) animates in even with reduced motion because the mount isn't conditioned on it.

### Other notes

- `index.html:5`: `maximum-scale=1.0, user-scalable=no` — blocks pinch-zoom, a WCAG 1.4.4 (Resize text) violation on mobile.
- `html` and `body` both set `overflow: hidden` (`index.css:46-64`). Prevents document scroll entirely; on small viewports if a modal's content is taller than the screen, users can't reach the bottom. ExportModal is 821 lines of JSX — very likely to overflow on mobile.
- No `lang` on `<html>`? Actually `index.html:2` has `lang="en"` — good.
- No skip-link. Given the sidebar + nav + tools + canvas structure, a "Skip to canvas" link would help keyboard users.

---

## 3. Performance audit

### Build baseline
- Single chunk: `dist/assets/index-DPmnuOcQ.js` — **877 KB raw / ~224 KB gzipped**.
- One CSS file: `index-G-0FMhaI.css` — 12 KB (fine).
- Tailwind is loaded as a runtime `<script src="https://cdn.tailwindcss.com">` in `index.html:28` — this is the Tailwind Play CDN, JIT-compiling classes in the browser. Adds ~60–70 KB of JS on top of the 224 KB app bundle, blocks first paint, and is explicitly marked "not for production" by Tailwind.
- `recharts ^3.5.1` is in `package.json` but there are **zero imports** in the app (only CSV reference docs). That's ~90 KB gzipped of dead weight if the bundler fails to tree-shake, which it sometimes does for recharts due to its side-effectful entry.
- No code-splitting anywhere: `Grep` for `React.lazy` / `Suspense` returns nothing in production code. The admin panels (ManageTeam, AdminShowcase, ReferralDashboard, BrandKit, ManageTeam, ListingDescription, SocialPack, ExportModal) are all imported statically in `App.tsx:8-26`.

### Top 10 performance opportunities (size/time estimates are directional)

1. **Remove the Tailwind CDN, compile at build.** Swap `<script src="cdn.tailwindcss.com">` for the official Tailwind+PostCSS build already standard in Vite. Kills ~60–70 KB of runtime JS, unblocks FCP by ~150–300 ms on slow 4G, removes ~20 ms of main-thread JIT on every page load, and gives us purge-based CSS (probably <15 KB). **Biggest single win.**
2. **Code-split admin + rarely-used panels.** `React.lazy` around `ManageTeam`, `AdminShowcase`, `ReferralDashboard`, `BrandKit`, `ListingDescription`, `SocialPack`, `BatchProcessor`, `ExportModal`, `PrintCollateral`, `ListingDashboard`, `BetaFeedbackForm`, `QuickStartTutorial` trims ~80–120 KB gz from initial JS (these add up to ~130 KB of source each is roughly 4–8 KB gzipped). Users on Free tier never open ManageTeam or AdminShowcase.
3. **Drop `recharts`.** `npm uninstall recharts` — no usage. Cuts ~90 KB gz if currently bundled.
4. **Import lucide icons by path, not barrel.** All 17 files use `import { X, Y } from 'lucide-react'`. Vite + ESM does tree-shake these reasonably well, but App.tsx imports ~45 icons in one statement — still fine. Low-leverage unless we find the barrel dragging `createLucideIcon` internals. Potential 20–30 KB gz.
5. **Client-side resize before Gemini.** `components/ImageUploader.tsx:21-27` and `App.tsx:652-656` read a raw `File` with `FileReader.readAsDataURL` and pass it straight through. A 4000×3000 listing photo from an iPhone is 8–12 MB base64; we pay upload + main-thread encoding + memory. Resize to a 2048-long-edge JPEG at 0.85 pre-upload — cuts payload ~5–8×, shortens Gemini time, reduces CLS risk. Huge win for "first-gen latency perceived by user."
6. **History and saved-stages grids aren't virtualised.** `App.tsx:2541-2555` and `2563-2585` render every thumbnail as a full `<img src={dataURL}>`. With 20+ saved stages each a 500 KB+ data URL, the DOM carries ~10+ MB of decoded bitmaps. Browser will happily try to paint them all. Generate and cache small JPEG thumbnails (256×192 at 0.7) on save; use those here and keep the full-res in memory only when restored.
7. **`<img src>` on data URLs forces synchronous decode.** Add `loading="lazy" decoding="async"` to every thumbnail `<img>` in history/saved/batch grids (`App.tsx:2548,2565`, `BatchProcessor.tsx:407`, `SpecialModesPanel.tsx:240`, `BatchUploader.tsx:357`). Cuts LCP contention when user opens History panel.
8. **Fonts are not preconnected or preloaded.** `index.css:1` imports `fonts.googleapis.com` via CSS `@import`, which blocks CSS render. Add `<link rel="preconnect" href="https://fonts.googleapis.com">` and `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` in `index.html`. Replace the CSS `@import` with `<link rel="stylesheet">` — saves one waterfall hop (~80–150 ms on 4G).
9. **Login hero image is a 2000×wide remote Unsplash URL.** `index.css:268` downloads a ~400 KB JPEG on every cold login. Self-host a 1600-wide WebP or AVIF on Vercel — probably ~80 KB. Add `background-image: image-set()` with `preload`.
10. **Google Identity SDK and Vercel Analytics load eagerly.** `index.html:29` loads `accounts.google.com/gsi/client` with `async defer` (good, but still in head). Defer until user actually clicks "Sign in" (dynamic script injection on intent). Same for `@vercel/analytics` — import it after first interaction or first visible paint. Saves ~30 KB gz from main bundle and removes a third-party origin from critical path.

### Image and render performance notes

- **`MaskCanvas` history snapshots** (`components/MaskCanvas.tsx:31-41`): every stroke pushes a full `ImageData` (canvas.width × canvas.height × 4 bytes) into `historyRef`. A 4032×3024 image = 48 MB per history entry, capped only by the user running out of undo patience. Should downscale the history snapshot to a visible working size, or store stroke paths and replay, not raster snapshots.
- **`useCallback`/`useMemo` usage** (40 occurrences across 16 files) is decent, but `App.tsx` alone has 2779 lines and 17 `useCallback`s — there are large render closures that aren't memoized. The giant `App` component holds all state; every keystroke in the custom-prompt textarea re-renders the whole canvas + panels tree. A migration toward per-panel state/context would help INP significantly.
- **CompareSlider** state updates fire on every `mousemove` (`components/CompareSlider.tsx:26`). At 120 Hz this is 120 setState calls/sec; React batches, but the slider image-width CSS recompute still chews layout work. Wrap `setSliderPosition` in `requestAnimationFrame` for smoother INP.
- **Polling/base64 decode during Gemini wait**: `services/geminiService.ts` is 43 KB; haven't audited the polling loop specifically, but the elapsed-time UI (`App.tsx:2398`) re-renders the whole editor shell every second — likely fine, but trivially moveable to CSS counter or a tiny memoised `<GenerationTimer>` component.

### Core Web Vitals (estimate, not measured)

- **LCP**: on the app route, LCP is the canvas frame once the user uploads and staging completes. Pre-upload it's the uploader card, which is small and fast. On the **landing** (pre-auth), LCP is the Unsplash hero background loaded via CSS — estimated **2.8–3.4 s on 4G** because of the 2000-wide JPEG and blocking Tailwind CDN. Self-hosting + removing Tailwind CDN should drop this under 2.0 s.
- **CLS**: moderate risk. EditingBadge mounts late (after `detectRoomType` resolves), shifting the room pill row. The mobile sheet transform animations don't cause CLS (transforms don't). Fonts are loaded without `font-display: swap` explicitly — `@import` inherits default `swap` from `display=swap` in the URL — so FOIT is avoided. **Probable CLS 0.05–0.10, acceptable.**
- **INP**: main risk is large setState in drag handlers and the generating-overlay re-render every second. Upload/drop triggers `FileReader.readAsDataURL` on the main thread, which for 10 MB files stalls UI for ~200–400 ms. **Likely INP 250–450 ms** on mid-tier Android — fails the 200 ms "good" threshold.

### Edge vs Node

- `api/render-template.ts` declares Edge via `@vercel/og` — correct, lightweight, fast.
- `api/stripe-*.ts`, `api/brokerage.ts`, `api/referral.ts`, `api/showcase.ts`, `api/record-generation.ts`, `api/track-login.ts` — all use the Stripe SDK, which pulls Node streams. These should be Node functions, not Edge. If any are accidentally on Edge the Stripe client will fail at cold start. Quick sanity check: add `export const runtime = 'nodejs'` explicitly to Stripe handlers.

---

## 4. Quick wins (<1 hr each)

1. Remove `recharts` from `package.json`. (5 min, saves up to 90 KB gz.)
2. Add `aria-label` to every icon-only button in `App.tsx` top bar and mobile nav. (30 min.)
3. Add `aria-live="polite"` wrapper around the "Generating Design" + "Analyzing Space" overlays. (15 min.)
4. Add `loading="lazy" decoding="async"` to thumbnail `<img>` tags. (15 min, grep + replace ~8 spots.)
5. Drop `maximum-scale=1, user-scalable=no` from `index.html:5`. (2 min, fixes WCAG 1.4.4.)
6. Add `role="dialog"` + `aria-modal="true"` + `aria-labelledby` to ExportModal, QuickStartTutorial, FurnitureRemover, BrandKit, ManageTeam. (45 min total.)
7. Add `Escape` key handler to every modal — one `useEffect` with `keydown` listener. (30 min, shared hook.)
8. Replace `text-[var(--color-text)]/50` with a static color that hits ≥4.5:1. (10 min.)
9. Add `<link rel="preconnect">` for fonts. (2 min.)
10. Gate the Tailwind CDN behind a build step (move to Vite Tailwind plugin). (1 hr setup.)

## 5. Big rocks (>1 day each)

1. **Full code-split pass** with `React.lazy` + a `<Suspense>` boundary per panel. Requires refactoring the giant `App.tsx` router-free tab switch into lazy-loaded panels. ~1–2 days.
2. **Accessible CompareSlider rewrite** as `<input type="range">` under the hood, or native `role="slider"` with arrow-key + Home/End + Page Up/Down support, `aria-valuenow/min/max`, and a `aria-label`. ~0.5 day.
3. **Modal focus management hook** — shared `useModal()` that traps focus, returns focus to trigger, binds Escape, applies `aria-modal`, and scrolls the panel not the page. Roll out across 8 modals. ~1.5 days.
4. **Thumbnail pipeline for history/saved grids.** Generate 256-wide JPEG thumbnails on every save/result; store alongside full-res; swap all grid `<img>`s to thumbnails. ~1 day.
5. **Client-side image resize before upload.** New `utils/resizeForUpload.ts`, wire into `ImageUploader`, `BatchUploader`, `App.tsx` drag-drop. ~1 day including testing against Gemini's preferred dims.
6. **Form a11y sweep.** Replace every placeholder-as-label with real `<label htmlFor>`, add `aria-describedby` for validation messages, visible error states, and required-field markers. Touches BrandKit, SocialPack, ManageTeam, ListingDescription, ExportModal, BetaFeedbackForm. ~1.5 days.
7. **Decouple `App.tsx` into per-panel contexts** so that a keystroke in the prompt textarea doesn't re-render CompareSlider, history, batch. ~2–3 days and a real refactor.

---

## 3-sentence exec summary

- **Biggest a11y failure**: none of the eight modal surfaces have `role="dialog"`, focus trapping, Escape-to-close, or focus return — keyboard and screen-reader users literally cannot use ExportModal, the Upgrade modal, QuickStartTutorial, BrandKit, ManageTeam, FurnitureRemover, AdminShowcase, or ReferralDashboard.
- **Biggest perf opportunity**: the Tailwind Play CDN in `index.html:28` plus a single unsplit 877 KB / 224 KB gz bundle (with unused `recharts` riding along) is dragging LCP to an estimated 2.8–3.4 s on 4G and INP past 200 ms; removing the CDN, tree-shaking recharts, and lazy-loading admin panels should drop initial JS by 30–40 % and bring LCP under 2 s.
- **One fix that improves both**: add a shared `useModal` hook that wraps `React.lazy`+`Suspense` around every modal component (code-split the 821-line ExportModal, BrandKit, ManageTeam etc. out of the main bundle) while simultaneously applying focus trap, Escape close, `aria-modal`, `aria-labelledby`, and scroll-lock — one abstraction buys both the biggest a11y and biggest perf wins in a single day's work.
