# 08 — Interaction Design Audit

**Specialist:** Interaction Design
**Date:** 2026-04-17
**Codebase snapshot:** App.tsx (2779 LOC) + 25 components + index.css (610 LOC)
**Scope:** top 20 actions × 9 states, loading quality, error recovery, empty states, destructive guards, keyboard, micro-interactions, feedback loops, reference benchmarks.

---

## Headline finding

StudioAI has a **good foundation** (well-designed CSS transition tokens, working toast system, polished `.cta-primary`/`.cta-secondary` with hover/focus/active, carefully staged MLS Export button with 5 distinct visual states) but is **interaction-incomplete**: destructive actions have zero guard rails, there is no way to cancel a running generation, the only keyboard shortcuts are ⌘Z/⌘⇧Z/⌘Y, error toasts are vague single-sentence apologies with no "retry" affordance, and most "light-touch" actions (Save, Share, Apply Pack tile hover) rely on a single "the button dims" signal. The app currently *tells* users what's happening; it does not *converse* with them.

---

## 1. State matrix — top 20 actions × 9 states

Legend: ✓ designed · WEAK state exists but thin · ✗ missing

| # | Action | Idle | Hover | Focus | Active/Pressed | Loading | Success | Error | Disabled | Empty |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Upload — click | ✓ | ✓ | ✓ | ✓ | ✓ (Analyzing Space spinner) | ✓ (canvas fills) | ✗ (silent fail on non-image) | ✓ (opacity 75) | ✓ (hero drop zone copy) |
| 2 | Upload — drag-drop | ✓ | ✗ (no dragover visual) | n/a | ✗ (no drop-accepted flash) | ✓ | ✓ | ✗ | ✓ | ✓ |
| 3 | Upload — paste (⌘V) | ✗ NOT IMPLEMENTED | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 4 | Generate Design (first) | ✓ | ✓ | ✓ | ✓ | ✓ (3-line typing overlay + timer) | ✓ (compare slider appears) | WEAK (toast: "Generation failed. Try again.") | ✓ | ✓ (prompt helper chips) |
| 5 | Build on Current (text) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | WEAK (same vague toast) | ✓ | ✓ |
| 6 | Apply Pack | ✓ | WEAK (generic opacity) | ✗ (no visible focus ring on tile) | ✗ (no press scale) | ✓ | ✓ | WEAK | ✓ | ✓ |
| 7 | Commit & Continue | ✓ (amber badge primes it) | ✓ | ✓ | ✓ | ✗ (instant, no confirm animation) | ✗ (silent — no toast "Base locked in") | n/a | ✓ | n/a |
| 8 | Start from Original | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | n/a | ✓ | n/a |
| 9 | Day to Dusk | ✓ | ✓ | ✓ | ✓ | ✓ (generic overlay) | ✓ | WEAK | ✓ (Pro gate) | n/a |
| 10 | Sky Replacement (4 presets) | ✓ | ✓ | ✗ (no focus ring on tile) | WEAK (no per-tile selected state before fire) | ✓ | ✓ | WEAK | ✓ | n/a |
| 11 | Smart Cleanup | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | WEAK | ✓ | n/a |
| 12 | Virtual Renovation submit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | WEAK | ✓ (empty fields) | WEAK (no "fill at least one" hint) |
| 13 | Listing Copy generate | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | WEAK | ✓ | ✓ |
| 14 | MLS Export → Download | ✓ | ✓ | ✓ | ✓ | ✓ (Processing N/M counter) | ✓ ("Downloaded" green flash) | ✗ (no user-visible error state) | ✓ (text greys when 0 selected) | ✓ |
| 15 | Social Pack render | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (download fires) | WEAK | ✓ | ✓ (template tiles) |
| 16 | Brand Kit save | ✓ | ✓ | ✓ | ✓ | ✗ (no save spinner) | WEAK (no toast, just closes) | ✗ | ✓ | ✓ (strong onboarding copy) |
| 17 | Undo (⌘Z) | ✓ | ✓ | ✓ | ✓ | n/a | ✗ (silent — no "reverted to v2" toast) | ✗ | ✓ (disabled at history[0]) | ✓ |
| 18 | Redo (⌘⇧Z / ⌘Y) | ✓ | ✓ | ✓ | ✓ | n/a | ✗ | ✗ | ✓ | ✓ |
| 19 | Open Help (?) | ✓ | ✓ | ✓ | ✓ | n/a | ✓ (modal animates in) | n/a | ✓ | ✓ (tutorial has 3 slides) |
| 20 | Upgrade to Pro | ✓ | ✓ | ✓ | ✓ | ✓ (Stripe redirect spinner) | ✓ | WEAK | ✓ | ✓ |
| 21 | Log out | ✓ | ✓ | ✓ | ✓ | ✗ (instant, no "Signing out…") | ✗ (cold reload) | ✗ | ✓ | n/a |
| 22 | Delete saved stage | ✓ | ✓ (dark overlay reveal) | ✗ | ✗ | n/a | ✗ (silent — card just vanishes) | ✗ | ✓ | n/a |

Count across 22 cells-per-row × 9 columns = ~60 ✗ / WEAK. Biggest clusters: **Error** column (12 WEAK, 5 ✗), **Success** column (6 silent), **Focus** column (weak on preset tiles), **Paste upload** (totally missing).

---

## 2. Loading quality

**Generate / Build on Current** is the app's best loading state — 3-line typing cascade ("Reading the room…" → "Placing furniture…" → "Polishing the final render") plus an elapsed-time counter. That is gracious. Two problems:

- **No cancel.** `handleGenerate` has no `AbortController`. If Gemini stalls at 90 seconds and the user wants out, the only escape is a hard refresh, which destroys unsaved session queue state. Grep for `abort|cancel` in App.tsx returns zero matches outside FAQ copy.
- **Three lines run on a fixed `animationDelay` timeline** (0s / 0.8s / 1.6s). They don't reflect real backend progress. For a 45-second generation this looks honest; for a 90-second one it looks stuck because the third line has been sitting there for 85 seconds.

**Pro AI Tools** (Day to Dusk, Sky Replacement, Smart Cleanup, Virtual Renovation) share the same overlay — good consistency, but the copy is "Reading the room" even when the task is sky replacement. A sky-rep user sees "Placing furniture…" and reasonably thinks something is wrong.

**MLS Export** loading is the cleanest — `Processing 3/12…` with a real counter that comes from the actual batch loop. Copy this pattern into generation where possible.

**Social Pack render** shows `isRendering` but no progress counter even though the `/api/render-template` call is sequential per template — add a counter.

---

## 3. Error recovery

Four error messages in the codebase. All toast-only, 2.5s auto-dismiss, no retry button:

1. `'Generation timed out — try again'` — tells user to retry but there is no retry button; they must re-type the prompt.
2. `'Service temporarily unavailable'` — masks three different failure modes (API_KEY_REQUIRED, Requested entity not found, API_KEY_INVALID). A user hitting a key rotation sees the same message as a user exhausting Gemini quota.
3. `'Generation failed. Try again.'` — default catch-all; hides rate limits, malformed prompts, and network errors.
4. `'Failed to save'` — for localStorage full. Does not explain *that* localStorage is full or offer to prune saved stages.

**What's missing:**

- No "Retry" CTA inside the toast (toasts auto-dismiss at 2.5s anyway — too short for a retry decision).
- No differentiated copy for quota (409 / 429) vs. transient 5xx.
- No offline banner if `navigator.onLine === false`.
- No error state on the canvas itself — only a toast in the top-right. If the user has scrolled, they may miss it.

---

## 4. Empty states

| Surface | Empty state quality | Notes |
|---|---|---|
| Pre-upload hero | ✓ STRONG — "Drop a room photo / or choose an option below" + Upload & Camera buttons + drag-drop zone | The single cleanest moment in the app. |
| History panel (before first edit) | ✗ MISSING — history simply doesn't render | No copy, no illustration, no onboarding nudge. |
| Saved stages tab | WEAK — "No saved stages. Use ♥ to save designs." | Correct info, but zero personality. No thumbnail of "what a saved stage looks like." |
| Team tab (brokerage / no invites) | WEAK — empty list with no helper | A brokerage admin who clicks here with zero agents invited sees a blank list. |
| Showcase (before user has submitted) | WEAK | No "submit your first" nudge. |
| Listing Copy (before any generation) | ✓ | Tone picker + char-count targets visible. |

---

## 5. Destructive action guards

**Three true destructive paths. Zero confirmations.**

1. **Start from Original** — nukes every edit in the chain plus the redo stack. Click in `EditingBadge.tsx:94` fires `onStartOver()` instantly with a single click on a button labeled "Start from original." No modal, no undo-toast, no 5-second "Undo" opportunity.
2. **Delete saved stage** — `App.tsx:2574` filters the array and writes to localStorage in the same synchronous click handler. No confirm, no undo.
3. **Refresh / Reset session** (top bar) — wipes the entire session queue if the user doesn't realize they're going to lose unsaved work.

**Recommendation:** add the Linear "undo toast" pattern — let the destruction happen, but show a 6-second toast with an inline Undo button that restores from a captured snapshot. Only fall back to a modal confirm on Brand Kit reset (which can't be recovered from browser state).

---

## 6. Keyboard shortcuts

**Currently implemented** (App.tsx:554–563):

- ⌘Z / Ctrl+Z → undo
- ⌘⇧Z → redo
- ⌘Y → redo (Windows convention)

**That's it.** Zero `key === 'Escape'` handler anywhere in the codebase (grep confirms). Modals can only be closed with the X button.

### Recommended shortcut map

| Shortcut | Action | Priority |
|---|---|---|
| ⌘Z / ⌘⇧Z | undo / redo | ✓ live |
| Esc | close any open modal, cancel mask draw, exit Cleanup panel | MUST ADD |
| ⌘S | save stage (replaces heart click) | HIGH |
| ⌘E | open Export modal | HIGH |
| ⌘Enter | Generate / Build on Current (from textarea) | HIGH |
| ⌘K | command palette (future) — reserve | MEDIUM |
| 1 / 2 / 3 | Text / Packs / Furnish mode switch | MEDIUM |
| G | jump to Design Studio panel | MEDIUM |
| C | jump to Cleanup panel | MEDIUM |
| X | jump to MLS Export panel | MEDIUM |
| ? | open Help overlay | MEDIUM |
| [ / ] | prev / next image in session queue | HIGH (batch users) |
| ⌘⇧D | duplicate current stage | LOW |
| Space (held) | temporarily show "before" in compare slider | LOW — Krea pattern |

Add a single discoverability affordance: `?` opens a "Keyboard shortcuts" sheet (Linear style). Show it in the Help menu.

---

## 7. Micro-interaction polish

| # | Current | Issue | Recommended value |
|---|---|---|---|
| 1 | Button press scale | `.cta-primary:active { transform: translateY(0) }` — no scale | Add `transform: scale(0.98)` on active; 120ms duration; keeps it subtle, not cheesy |
| 2 | Tooltip delay | Native `title=` attribute — browser default ≈1000ms, and no styling | Build a `<Tooltip>` primitive; 400ms open delay, 100ms close, dark glass bg. Linear uses ~200ms. |
| 3 | Modal transitions | `.modal-content` uses `animate-fade-in 0.25s` — open feels abrupt | Swap to `scale(0.96) → scale(1)` + fade over 220ms cubic-bezier(0.2, 0.9, 0.3, 1.05). Close in 150ms. |
| 4 | Mask brush cursor | `cursor: crosshair` in MaskCanvas — no size indication | Render a custom DOM circle that follows the mouse and matches brush radius; white ring 1px + subtle shadow. This is table stakes for any cleanup tool (see Photoshop, Canva Magic Eraser). |
| 5 | Compare slider handle | Static white circle | On hover, pulse-scale 1.0 → 1.08 over 200ms; show "← →" affordance on first render for 2s then auto-fade. |
| 6 | Drag-drop feedback | `onDragOver` only calls `e.preventDefault()` — no visual | Add `isDraggingOver` state → tint the hero card border to `--color-primary`, raise shadow, show "Drop to upload" overlay. |
| 7 | Toast duration | Fixed 2500ms for both success and error | Success 2500ms is fine. Error should be 6000ms + a Retry button; user needs time to read + decide. |
| 8 | Nav item hover | Sidebar expands from 64px → 220px with labels fading in | This is already good — keep. The *item* hover inside it (`group-hover/item:scale-110`) is slightly over-eager at 300ms; tighten to 180ms. |
| 9 | Pack tile selection | Tile clicks fire `onGenerate` immediately — no "selected" pause | Two-step: first click selects tile (ring appears), second click (or Generate button) fires. Matches how Krea / Midjourney treat style presets. |
| 10 | "Downloaded" success state on MLS button | 2-second green flash then reverts | Perfect pattern — copy this into every other action (Save, Share to Gallery, Render Social Pack). |

### Top-5 ranked with specific values

1. **Tooltip delay 1000ms (native) → 400ms custom** — biggest perceived-speed win. Native tooltips feel sluggish; build a React `<Tooltip>` with 400ms open / 100ms close.
2. **Mask brush cursor: crosshair → real-size circle** — biggest perceived-quality win. Users cannot currently see how big their brush is until they start painting. Add a DOM circle that tracks `mousemove` and scales to `brushSize`.
3. **Drag-over visual state: none → border-glow + "Drop to upload" overlay** — biggest first-impression win for new users.
4. **Modal open: fade → scale(0.96 → 1) + fade, 220ms** — biggest polish win. Costs 8 lines of CSS. Linear-grade.
5. **Error toast: 2.5s auto-dismiss → 6s + inline Retry button** — biggest recovery-UX win. One button swap saves users from re-typing the entire prompt.

---

## 8. Feedback loops

The toast system is the right primitive — `showToast(icon, label)` is called in 10+ places and animates in/out smoothly (`.animate-toast` with 2.5s toast-in-out keyframe). Problems are **coverage**, not plumbing:

- Undo / Redo fire **no toast**. User can hammer ⌘Z six times and not know what state they're on. Add `showToast(<Undo/>, 'Reverted to v2')`.
- Brand Kit save fires **no toast**. Form closes silently.
- Save stage (heart) fires a toast ✓ — keep.
- Delete saved stage fires **no toast**. No "Stage removed · Undo" affordance.
- Navigating between session images in the queue fires **no toast**. A user with 12 photos can get lost.
- "Commit & Continue" fires **no toast**. This is a significant state change (chain depth 3 → 0, new anchor baseline) and deserves a visible "Base locked in as v4" confirmation.

The fix is purely additive — wire toasts into the six silent code paths.

---

## 9. Reference benchmarks

**Linear** nails three things relevant here (general knowledge of their published patterns):

1. **Keyboard-first**. Every action has a shortcut. `?` opens the shortcut sheet. `Esc` closes anything that opened. `⌘K` is the command palette. StudioAI should adopt at least `?` and `Esc` in this overhaul.
2. **Optimistic UI + undo toast**. Destructive actions happen immediately, then a toast offers Undo for ~6 seconds. This beats modal confirmations for perceived speed and is the pattern to copy for Start from Original and Delete Saved Stage.
3. **Transitions around 150–220ms cubic-bezier(0.2, 0.8, 0.2, 1)**. StudioAI already defines `--transition-smooth: 400ms cubic-bezier(0.2, 0.8, 0.2, 1)` — it's on the slow side of this benchmark; tighten modal open/close to the 220ms band.

**Krea** nails two things:

1. **Generation progress is informative**. Percentage + preview thumbnail that gradually sharpens as the run completes + visible cancel button. StudioAI has the elapsed timer and the 3-line typing cascade but not a thumbnail or cancel.
2. **Press-and-hold Space toggles between input and result**. Much faster than grabbing the compare slider. Trivial to add — listen for `keydown`/`keyup` on space when a result exists and temporarily swap the displayed image.

---

## Top 10 interaction gaps, ranked

1. **No cancel for in-flight generations.** Blocks users with no escape for ~90s runs. (ADD `AbortController` + red "Cancel" in overlay.)
2. **Start from Original has zero guard and no undo.** Destroys work on a single click.
3. **Delete saved stage has zero guard and no undo toast.** Permanent + silent.
4. **Esc does nothing, anywhere.** Modals / popovers / Cleanup / mask draw are all un-escapable with the keyboard.
5. **Error toasts are vague + no retry button + 2.5s dismiss.** User must re-type the prompt to try again.
6. **Drag-drop upload has no "dragging over" visual.** User doesn't know the drop will land.
7. **Paste (⌘V) upload is not implemented at all.** Should be trivial to add for agents pasting from Dropbox / MLS.
8. **Mask brush has no size-indicator cursor.** Users paint blind until a stroke lands.
9. **Pack / preset tiles have no focus ring + no "selected" pre-fire state.** Keyboard navigation is broken; accidental fires happen.
10. **Silent success on six paths** (undo, redo, session nav, brand kit save, commit, delete). Users don't know their action took effect.

---

## Summary

**Biggest interaction gap:** no cancel for in-flight generations — users are locked out for up to 90 seconds with no escape, and the same painful dead-end repeats on every Pro AI Tool.

**Worst UX dead-end:** clicking "Start from Original" (one click, no confirm, no undo) destroys the entire chain and redo stack with a silent transition — the user has no idea it was destructive until they try to ⌘Z and it doesn't work.

**Highest perceived-quality micro-fix:** replace the native `title=` tooltips (≈1000ms delay) with a React `<Tooltip>` primitive at 400ms open / 100ms close delay — this single change makes every hover-reveal in the app feel Linear-grade instead of browser-default.
