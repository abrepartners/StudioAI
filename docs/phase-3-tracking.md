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
| D2 | Structural Lock toggle | todo | Already enforced server-side; expose as UI switch |
| D3 | Reference-image prompt | todo | "Use this sofa" — add moodboard image alongside text |

---

## Cluster G — Content systems (Phase 3 D7)
**Lead:** `agent-g`
**Scope:** Per-pack reference images (Fork #10 locked Option B).

| # | Title | Status | Notes |
|---|---|---|---|
| D7 | Static pack preview images | todo | 7 packs × 1 reference render per pack. Zero Gemini cost at runtime |

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

## Cluster I — Batch UX + adversarial hardening
**Lead:** `agent-i`
**Scope:** Orphan items from Phase 2 user feedback + real-world testing.

| # | Title | Status | Notes |
|---|---|---|---|
| X2 | Per-image batch action picker | todo | Aryeo-style — user raised this explicitly |
| X3 | UI gating on narrow-room packs | todo | Adversarial edge case from real-world QA |
| X4 | Post-gen alignment check for Cleanup | todo | Catches S09-class framing drift on flash tier |
| X5 | F10/F12 polish sweeps | todo | 211 `text-[Npx]` + ~15 custom radii; gated on Playwright (X1) |

---

## Deferred (later Phase 3)

- D1 Listing Score (XL)
- D4 Listing Kit one-click (XL)
- D5 Public API (XL)
- D6 GHL native integration
- D8 Thumbnail pipeline
- D10 Community Gallery
- D11 Reveal video productization
- D12 SEO blog
- D14-D26 (per backlog)

---

## Collaboration

_Tag with @agent-x._
