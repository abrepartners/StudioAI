# Pack Verification Matrix

Admin-only visual audit surface for StudioAI Style Packs.

- **UI:** `/admin/pack-matrix` (admin-gated, see [Access](#access))
- **Generator:** `tests/qa-harness/generate-pack-verification-matrix.mjs`
- **Assets:** `public/pack-verification/`

---

## Why this exists

Every Style Pack is a thin wrapper around Gemini: a one-liner of style DNA plus the shared HARD PRESERVATION RULES block (defined in `components/StyleControls.tsx` `buildPrompt`). When we add a pack or touch that prompt, we need a fast, visual way to see how all packs render against representative rooms.

The matrix is **7 packs × 3 canonical rooms = 21 renders** laid out in a grid. One look tells you:

- whether a new pack actually produces a distinct aesthetic vs. the existing seven
- whether a prompt tweak broke preservation (cabinets / appliances / flooring drifting)
- whether a room type is systematically failing (e.g. every bedroom coming back with a kitchen)

---

## Canonical rooms

Three fixtures under `public/pack-verification/rooms/`. Post-Fix-1 (2026-04-18) the matrix is pure single-purpose rooms — open-concept + kitchen fixtures were swapped out because packs confuse zones and don't restyle cabinets.

| Slug | Label | Source | Why picked |
|---|---|---|---|
| `living-room` | Living Room | `Amber_photos_BM8A4996.jpg` | Pure empty living room — clear couch-zone floor, no kitchen, ceiling fan, double-window daylight, neutral walls. Packs have a defined footprint to work with. |
| `bedroom` | Bedroom | `Jordan_Roehrenbeck_..._NUR65764.jpg` | Master bedroom with tray ceiling, neutral walls, hardwood floor, French door. Lightly staged — tests the pack's ability to override existing decor. Best performer in the Apr 2026 baseline scoring. |
| `primary-bedroom` | Primary Bedroom | `Amber_photos_BM8A5021.jpg` | Empty primary bedroom — neutral walls, daylight window, vinyl plank floor. Replaced Kitchen fixture because packs are **decor-only** in kitchens (see Fix 2 in `StyleControls.tsx`) and the matrix should test the furniture-tier prompt. |

If you swap a fixture, update both this table **and** the `ROOMS` array in the generator.

### Room scope

Not every `FurnitureRoomType` is part of the matrix. The audit covers the three fixtures above only — they represent the **furniture tier** of `packTierFor()` in `components/StyleControls.tsx`. Other tiers:

| Tier | Rooms | Pack behavior in production | Covered by matrix? |
|---|---|---|---|
| `furniture` | Living Room, Bedroom, Primary Bedroom, Dining Room, Office, Nursery | Full furniture staging with HARD PRESERVATION RULES | Yes (3 of 6 sampled) |
| `decor-only` | Kitchen, Bathroom, Laundry Room | Accessories only — no furniture, no cabinet restyling, no appliance changes | No — separate manual spot-check; packs deliberately minimize visible change |
| `disabled` | Exterior, Patio, Garage, Basement, Closet | Pack mode gated in UI, toast directs to Text mode | No — nothing to render |

### Expected pack × room pairings

Which combos should score ≥6 after Fix 1 + Fix 2?

| Pack | Living Room | Bedroom | Primary Bedroom |
|---|---|---|---|
| Coastal Modern | strong (airy pack + empty LR) | strong (prior baseline 7.5) | strong |
| Urban Loft | moderate (dark pack may over-fill empty LR) | moderate | moderate |
| Farmhouse Chic | strong | strong (prior baseline 6.8) | strong |
| Minimalist | strong | strong (prior baseline 7.8) | strong |
| Mid-Century Modern | strong | strong | strong |
| Scandinavian | moderate (risk of washed-out result) | moderate | moderate |
| Bohemian | moderate | moderate | moderate |

Target: ≥14/21 cells score ≥6. Below that, something regressed.

---

## Generating / regenerating

```sh
node tests/qa-harness/generate-pack-verification-matrix.mjs
```

Requires `GEMINI_API_KEY` (or `VITE_GEMINI_API_KEY`) in `.env.local`. Runs sequentially; expect ~5–8 minutes for the full 21 calls. On transient failure a cell retries once before being marked `fail` in the manifest.

Output:

- `public/pack-verification/renders/<room-slug>__<pack-slug>.jpg` — 1024w JPEG, q=0.85
- `public/pack-verification/manifest.json` — timestamped metadata consumed by the admin UI

Commit both the renders and the manifest:

```sh
git add public/pack-verification/
git commit -m "chore: refresh pack verification matrix"
```

Cost: ~$0.04 per cell × 21 ≈ **$0.84 per full regen**.

---

## When to regenerate

- Adding a new Style Pack (also extend `PACK_DETAILS` in the script to match `components/StyleControls.tsx`).
- Changing the HARD PRESERVATION RULES block or any line of `buildPrompt`.
- Swapping the Gemini image model (currently `gemini-3.1-flash-image-preview`).
- Swapping a canonical room fixture.

Otherwise the committed renders are the source of truth. They survive deploys as static assets — no runtime AI cost, no cold starts.

---

## Admin UI

`/admin/pack-matrix` — React route at `src/routes/AdminPackMatrixRoute.tsx`, mounted in `src/routes/AppRouter.tsx`.

Layout:

- Top row: the three source room photos.
- Below: one row per pack. Left cell shows pack name + DNA summary. Right cells show the rendered result for each room.
- Click any cell to open a lightbox.
- Cells that failed generation render a red error card with the failure message.

The header strip surfaces manifest stats: `ok / total`, failure count, retry count, model name, and the generation timestamp.

---

## Access

Admin-only, same gate as `components/AdminShowcase.tsx`: `isAdmin(user)` from `src/routes/authStorage.ts` — i.e. `email.endsWith('@averyandbryant.com')`. Non-admins are redirected to `/`.

---

## Phase 2 — async regen endpoint (not shipped)

The current workflow assumes a developer runs the script locally. A future `/api/regen-pack-matrix` endpoint would:

1. Accept a POST from an admin (gated the same way).
2. Insert a row into a new `pack_matrix_jobs` Supabase table: `(id, status='running', started_at, completed_at, manifest_url)`.
3. Fire-and-forget a worker endpoint (`/api/pack-matrix-worker`) that runs the 21 calls, writes each render to Supabase Storage (or `public/pack-verification/renders/`), then updates `status='completed'`.
4. Return `{ jobId, status: 'running' }` with HTTP 202 immediately.

The admin UI would poll `GET /api/regen-pack-matrix?jobId=X` every 5s and flip to the new manifest when the job completes.

**Why not now:** 21 × ~15s = ~315s sequential, brushing up against Vercel's 300s Pro function cap. Committed PNGs give us visual regression testing for free without any of this infrastructure. Ship it when we actually need self-service refresh from the browser.

---

## Files

| Path | Role |
|---|---|
| `tests/qa-harness/generate-pack-verification-matrix.mjs` | Generator script (local run). Mirrors the room-type branching from production. |
| `tests/qa-harness/score-pack-matrix.mjs` | Second-pass scorer — grades renders 1-10 across 4 dimensions (architecture / lighting / perspective / staging). |
| `public/pack-verification/rooms/{living-room,bedroom,primary-bedroom}.jpg` | Canonical room fixtures (Fix 1 swapped kitchen → primary-bedroom). |
| `public/pack-verification/renders/*.jpg` | 21 static renders. |
| `public/pack-verification/manifest.json` | Metadata + per-cell scores consumed by admin UI. |
| `src/routes/AdminPackMatrixRoute.tsx` | Admin surface. |
| `src/routes/AppRouter.tsx` | Mounts `/admin/pack-matrix`. |
| `docs/SOP.md` §10.1 | SOP entry point. |
