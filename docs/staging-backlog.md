# Staging enhancements — backlog

Parked ideas for virtual staging, specified enough to pick up later. Not
started. Delete an entry when it ships.

---

## 1. Open-concept multi-room staging (poor-man's, no engine rework)

**Problem:** staging takes ONE room type per photo. Open-concept shots
(kitchen + dining + living visible in one frame) can only be tagged as a single
zone, so the model only stages that one area.

**Approach (UI + prompt only):**
- Make the room-type selector **multi-select** (chips/checkboxes). Default stays
  single-select; multi only when the agent adds zones.
- When >1 zone is chosen, compose ONE staging prompt that names each zone and
  its furniture set: "open-concept space with a kitchen, dining area, and living
  room — stage each zone appropriately: <kitchen set>; <dining set>; <living
  set>; keep the room geometry, windows, and camera angle."

**Touch points:** room-type UI in `src/vellum/VellumPhotoEditor.tsx`; the
staging prompt builder (`buildStagingAssignment` in the stylePacks module —
already assembles furniture per room/pack; extend to concatenate zones).

**Size:** small. No new model or API surface.

---

## 2. Grouped-room consistent staging across multiple angles

**Problem:** a listing usually has several photos of the SAME room from different
angles. Staged independently, each looks like a *different* room (different
sofa, different layout).

**Approach (uses the multi-reference the engine already has):**
`google/nano-banana-pro` takes `image_input` as an **array** (up to ~14 images);
we currently pass one. Use that:
1. Group the same-room photos (agent tags them, or auto-detect by similarity).
2. Stage the **hero** angle normally.
3. For each other angle, pass **two** images — the empty photo to stage **and
   the staged hero as a reference** — with a prompt: "stage this to match the
   furniture and style in the reference image (same sofa, same pieces, same
   palette); keep THIS photo's room geometry and camera angle."

**Honest limit:** matches *style + furniture set* well (reads as the same staged
home across shots); does NOT guarantee the identical object in the exact same
physical spot per angle — it infers, it doesn't reconstruct 3D. Good for a
cohesive listing set, not architecturally exact.

**Touch points:** a "same room" grouping in the batch/project UI; the staging
service to pass the staged hero into the `image_input` array + a
match-the-reference prompt variant. `npm run check:api` already asserts the
`image_input` array field — keep it correct.

**Size:** medium. No new model/integration — extends the existing nano path.
**Explicitly NOT novel-view/3D synthesis** — we rely on the agent already having
the angles.

---

## Done (do not re-build)
- ✅ **"Media Room" room type** — shipped in #53 (theater furniture).
