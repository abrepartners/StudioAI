# Phase 1 Tracking

Live status board for Phase 1 execution (F1-F28). Each cluster lead updates their rows as items move through `todo → in-progress → done`. Regressions caught by QA harness go in the bottom section.

---

## Cluster A — Quick wins + a11y sweep
**Lead:** `agent-a`
**Scope:** Small surgical fixes, most <2hr, no Tailwind-compile dep.

| # | Title | Status | Notes |
|---|---|---|---|
| F1 | Remove viewport lock | todo | `index.html:5` |
| F4 | Uninstall recharts | todo | `package.json` |
| F5 | Lazy-load thumbnails | todo | 8 `<img>` tags |
| F19 | Input mode fixes | todo | beds/baths/sqft + 16px textareas |
| F20 | Canvas aspect ratio fix | todo | remove `sm:aspect-video` |
| F21 | `aria-label` sweep on icon buttons | todo | ~30 additions |
| F22 | Live-region loading | todo | `role="status" aria-live="polite"` |
| F23 | Stripe handlers `runtime='nodejs'` | todo | api/stripe-*.ts + others |
| F24 | Font preconnect | todo | `index.html`, `index.css` |
| F25 | Self-host login hero image | todo | replace Unsplash JPEG |
| F26 | Fix opacity-based de-emphasis | todo | `text-.../50` contrast fail |
| F27 | Heart → BookmarkPlus | todo | save-to-history |
| F28 | Consolidate Loader icon | todo | drop `LoaderCircle` |

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
| F16 | Mobile: auto-close sheet on Generate | in-progress | reopens on completion |
| F17 | Mobile: header overflow menu | in-progress | move Undo/Redo/Refresh/Help into "…" |
| F18 | Mobile: 44px touch targets | in-progress | top bar, mask brush, session nav |

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

### 2026-04-18 — @agent-a / @agent-d overlap on App.tsx top-bar buttons

- @agent-d is adding `min-h-[44px] min-w-[44px]` (F18) to the same top-bar icon buttons that @agent-a touched for F27 (Heart → BookmarkPlus swap), F20 (canvas aspect ratio), F11 (icon size collapse 15→16 / 13→14), and F5 (lazy-loaded thumbnails).
- No conflict on semantics — A's edits are orthogonal (icon swaps + size tweaks), D adds layout classes.
- D is building on top of A's current working-tree state (uncommitted). Change has been merged-in-place in the same working tree. Result will ship as part of D's commits; A should rebase mentally but does not need to do anything if they commit/push before D.
- Open item: F21 (aria-label sweep) — D added `aria-label` on Undo and Redo top-bar buttons while implementing F18 to avoid duplicate work. @agent-a: these two are done, please skip them in your F21 pass.
