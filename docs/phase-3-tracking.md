# Phase 3 Tracking + Orphans

Phase 3 from `docs/overhaul-2026-04/02-execution-backlog.md` = Differentiate (D1-D26). **High-impact subset we're starting now** + orphan items surfaced during Phase 1/2 + real-world testing.

---

## Cluster E — GHL lifecycle (deferred from Phase 2)
**Lead:** `agent-e`
**Scope:** R36 + R38 — email drafts only, no publishing (per memory rule).

| # | Title | Status | Notes |
|---|---|---|---|
| R36 | GHL email nurture — Day 0/2/5/7/14/30 for free users | done | 6 templates in GHL, prefix `StudioAI_Nurture_`. See `docs/ghl-lifecycle-2026-04/README.md`. User wires workflow. |
| R38 | Winback emails — Day 7/30/90 post-cancel | done | 3 templates in GHL, prefix `StudioAI_Winback_`. D30 needs Stripe coupon `COMEBACK30` (user-generated). |
| R37 | Cancellation survey | manual | Stripe Portal Dashboard config. Not agent-doable. |

---

## Cluster F — Editor primitives (Phase 3 D2 + D3)
**Lead:** `agent-f`
**Scope:** Surface server-side enforcement as UI; add reference-image input path.

| # | Title | Status | Notes |
|---|---|---|---|
| D2 | Structural Lock toggle | done | Toggle in StyleControls (under mode tabs) + `structuralLock` state in App.tsx (localStorage-persisted) + branched `rulesBlock` in `generateRoomDesign`. OFF swaps in "gutted renovation" preamble; rules 1/2 (no flip, same camera) always stay. |
| D3 | Reference-image prompt | done | Drop-zone/file-picker in StyleControls text mode + `referenceImage` state in App.tsx + third `inlineData` part in `generateRoomDesign` gated by new `referenceImageBase64` param. Packs skip (single-image). IMAGE ROLES prompt updates when reference is attached. |

---

## Cluster G — Content systems (Phase 3 D7)
**Lead:** `agent-g`
**Scope:** Per-pack reference images (Fork #10 locked Option B).

| # | Title | Status | Notes |
|---|---|---|---|
| D7 | Static pack preview images | done | 7 packs × 1 reference render @ 1024x683 JPEG 0.85 → `public/pack-previews/<slug>.jpg`. Tile swapped to image bg + dark-gradient icon/label overlay. Fixture: `Lane_Photos_BM8A1572.jpg`. Generator: `tests/qa-harness/generate-pack-previews.mjs`. |

---

## Cluster H — Perf + infrastructure (D9 + D13 + Playwright)
**Lead:** `agent-h`
**Scope:** Bundle cut via lazy-load + pre-upload resize + visual regression harness (F3 shipped without this gate).

| # | Title | Status | Notes |
|---|---|---|---|
| D9  | Code-split admin panels | todo | `React.lazy` on 8 admin components → ~25% JS bundle cut |
| D13 | Client-side pre-upload resize | todo | 2048 long-edge JPEG 0.85 → 5-8x payload cut |
| X1  | Playwright visual regression harness | todo | Gate missing post-F3. Enables F10/F12 sweeps + future Tailwind work |

---

## Cluster J — User-facing Listing Score (Phase 3 D1)
**Lead:** `agent-j`
**Scope:** D1 — surface a 1-10 quality score on every staged result with per-dimension callouts.

| # | Title | Status | Notes |
|---|---|---|---|
| D1 | Listing Score | done | New `services/qualityScoreService.ts` (Gemini Flash, structured JSON schema, 4 dims × {score 1-10, callout}). Refactored `components/QualityScore.tsx` to a small color-coded badge (red <6, amber 6-8, green ≥8) mounted top-right of the canvas; hover/click expands to show per-dimension bars + callouts. Fires async after `handleGenerate` lands (non-blocking). Module-level cache keyed by FNV-1a hash of the image data URL — re-scoring the same pixels is a no-op. Flash model only (cost guard). |

---

## Cluster I — Batch UX + adversarial hardening
**Lead:** `agent-i`
**Scope:** Orphan items from Phase 2 user feedback + real-world testing.

| # | Title | Status | Notes |
|---|---|---|---|
| X2 | Per-image batch action picker | shipped | Per-row `<select>` dropdown on pending/error rows in BatchProcessor + "Apply to remaining" toolbar in progress header. processOne reads latest action via resultsRef. BatchUploader pre-sets Exterior→twilight / Interior→stage defaults. |
| X3 | UI gating on narrow-room packs | shipped | Pack-mode warns + blocks generation when aspect > 2.2 or < 0.6 |
| X4 | Post-gen alignment check for Cleanup | shipped | Edge-overlap check on 128x128 grayscale; flash-tier only, bails < 70% with user toast. Wired into App.tsx `handleGenerate` cleanup path + BatchProcessor cleanup case. |
| X5 | F10/F12 polish sweeps | shipped | F10: 247 `text-[Npx]` → tokens (7/8→2xs, 9/10→xs, 11/13→sm) across 27 files. F12: 5 `rounded-[…]` → tokens in App.tsx. All 10 X1 baselines updated post-sweep — diffs were the intended type-scale collapse, no regressions. |

---

## Cluster K — Listing Kit one-click (Phase 3 D4)
**Lead:** `agent-k`
**Scope:** Single "Generate Listing Kit" button that runs the saved A&B recipe end-to-end (stage → dusk hero → cleanup → MLS → social → copy) and returns a downloadable zip.

| # | Title | Status | Notes |
|---|---|---|---|
| D4 | Listing Kit one-click pipeline | shipped | `components/ListingKitPipeline.tsx` (new, lazy) + button + modal wired into App.tsx batch view (visible after batch upload). 6-step sequential orchestrator: staging + cleanup run a concurrency-3 worker pool, dusk + copy run single-call on the hero, social pack reuses `/api/render-template` with brand-kit auto-fill, copy via `generateListingCopy` (luxury default). AbortController cancel surfaces partial results. Output zip: `staged_photos/`, `cleanup_photos/`, `mls_exports/`, `social_pack/`, `listing_description.txt`. Chunk = 14.4 kB gz 5.13 kB. |

---

## Cluster M — Polish (D8 + D14)
**Lead:** `cluster-m-lead`
**Scope:** thumbnail pipeline + MaskCanvas memory fix. (X5 lives under Cluster I above.)

| # | Title | Status | Notes |
|---|---|---|---|
| D8  | Thumbnail pipeline | shipped | New `utils/thumbnail.ts` (256-wide JPEG 0.85). Wired into `handleSaveStage` (App.tsx) + both BatchProcessor save sites (export auto-save + processOne). `SavedStage.thumbnail?` optional for back-compat. History grid prefers thumbnail; backfills full-res-only stages on first display + writes back to localStorage. |
| D14 | MaskCanvas history memory fix | shipped | Fix path A (vector strokes). `MaskStroke = { points, brushSize, closed }` replaces `ImageData[]`. `renderFromHistory()` replays 0..index on undo/redo from a cleared canvas. Memory drops ~3 orders of magnitude (16 MB/snapshot → ~24 B/point). Blank state is now `historyIndex === -1`. |

---

## Deferred (later Phase 3)

- D1 Listing Score (XL)
- D5 Public API (XL)
- D6 GHL native integration
- D10 Community Gallery
- D11 Reveal video productization
- D12 SEO blog
- D15-D26 (per backlog)

---

## Collaboration

_Tag with @agent-x._
