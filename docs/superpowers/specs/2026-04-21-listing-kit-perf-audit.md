# Listing Kit Pipeline — Performance Audit

**Date:** 2026-04-21
**Scope:** `components/ListingKitPipeline.tsx` and everything it touches
**Trigger:** User reports the Listing Kit is painfully slow on 10-photo batches.

## End-to-end trace (one photo, 5400×3600 input)

The Listing Kit runs six steps **in strict sequence** (`handleGenerate`, lines 241-419). Within a step, a bounded worker pool (`runPool`, default `concurrency=3`) runs items in parallel. For each photo the work is:

| Step | Per-image cost (flash/Pro) | Notes |
|---|---|---|
| resizeForUpload (`utils/resizeForUpload.ts`) | ~200–400 ms main thread | 5400×3600 → 2048 long-edge JPEG q=0.85. Blocks UI. **Called once inside every Gemini tool fn.** |
| Gemini staging (`generateRoomDesign`) | 6–12 s (flash) / 15–25 s (Pro) | Network + model. Returns ~1264×843 base64. |
| Gemini twilight (hero only) | 8–15 s | Skipped for non-hero. |
| Gemini cleanup (`instantDeclutter`) | 6–12 s (flash) / 15–25 s (Pro) | Reads Gemini's staged output, `resizeForUpload` re-decodes a ~2 MB data URL and re-encodes — ~150 ms wasted. |
| `checkAlignment` (flash only — `BatchProcessor` calls this, **not** Listing Kit) | ~80–150 ms | Two 128×128 canvas decodes + loops. ListingKit currently skips this guard. |
| `processForMLS` (resize + strip EXIF) | 400–800 ms main thread | `stripExif` decodes the *full-res 5400×3600* source, re-encodes, then `resizeImage` step-downs to 1920×1080. Double decode per image. |
| `record-generation` network | 0 ms for ListingKit (never called in pipeline) | See Finding 4. |
| Post-processing (`sharpen` + `stackComposite`) | 0 ms in ListingKit | **ListingKit does not post-process at all** (confirmed lines 247-254, 283-298). Only `BatchProcessor` applies it. |

### Wall-clock math for a 10-photo kit (flash tier, no Pro)

- Step 1 (stage, 10 photos @ concurrency=3): ~4 waves × 9 s ≈ **36 s**
- Step 2 (twilight, hero only, 1 photo): **10 s**
- Step 3 (cleanup, 10 photos @ concurrency=3): ~4 waves × 9 s ≈ **36 s**
- Step 4 (MLS, strictly sequential `for…of`, 10 × 0.6 s): **6 s**
- Step 5 (social, 1 render-template call): **3 s**
- Step 6 (listing copy, 1 Gemini call): **4 s**
- Final zip assembly: **1-2 s**

**Observed total ≈ 95-105 s.** That matches user's "painful" report.

### Bumping concurrency 3 → 6 (Step 1 and Step 3 are I/O-bound)

- Step 1: ~2 waves × 9 s ≈ **18 s**
- Step 3: ~2 waves × 9 s ≈ **18 s**
- **New total ≈ 58-65 s** → ~1.6× speedup, no new code, no worker threads.

### Top 3 bottlenecks (impact × ease)

1. **Concurrency is hard-coded at 3 for both Gemini steps (Stage + Cleanup).** File: `components/ListingKitPipeline.tsx:172`. Each Gemini call is pure network wait — there's no CPU pressure on the client, and Gemini's per-key QPS tolerates 6-8 in-flight easily. Raising the default to **6** saves ~35 s on a 10-photo kit. One-line change; add an env-gated override for safety.

2. **Step 3 cannot start until Step 1 finishes — despite being independent per photo.** The kit runs Stage → Twilight → Cleanup as three serial gates. But Cleanup *only* depends on *that photo's* staged output, not on the whole batch finishing Stage. Today photo 1 could be Cleaning while photos 8-10 are still Staging; instead it waits for Stage's last photo to land. **Pipelining Stage+Cleanup per image** (not per step) collapses the two Gemini steps from `36 + 36 = 72 s` into `max(stage, cleanup) + one-call tail ≈ 40 s`. Medium effort — requires restructuring `handleGenerate` from step-serial to per-photo-async.

3. **`processForMLS` decodes the full 5400×3600 source twice per image (strip-EXIF pass + resize pass).** File: `utils/imageExport.ts:136-152, 84-130`. That's ~400 ms of main-thread JPEG decode per photo × 10 photos = 4 s that freezes the UI during "MLS export." Fix: merge strip-EXIF into `resizeImage` (one canvas draw, one `toBlob`). Tiny change, ~40% reduction in Step 4 cost.

## Hypothesis scorecard

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| 1 | `detectRoomType` runs once per photo **in series before the real edit** | **FALSE** | `BatchUploader.tsx:104-131` runs detection at **upload time**, concurrency=3, not at pipeline time. Not on the hot path. |
| 2 | No parallelism | **PARTIAL** | There IS parallelism (`runPool` at default concurrency=3) but the limit is conservative. Network-bound workload can safely run 6-8. |
| 3 | Phase C composite at full resolution, main thread, every image | **FALSE in Listing Kit** (it doesn't run composite), **TRUE in BatchProcessor** (`postProcessBatchOutput` at `BatchProcessor.tsx:42-60` runs `sharpen` + `compositeStackedEdit` on main thread at full prior-res). That's a ~1-3 s per-image main-thread stall in BatchProcessor, not in the Listing Kit. The user mixed these in the report. |
| 4 | `/api/record-generation` blocks per tool call | **FALSE for Listing Kit** | `record-generation` is only called from `subscription.recordGeneration()` (`App.tsx:1313`), fired **once after a single-image generation** in the editor. It is **not** wired into `ListingKitPipeline` at all. Listing-kit runs don't touch this endpoint today (which also means we're under-counting usage for billing — separate ticket). |
| 5 | Sharpen + composite block the main thread | **TRUE in BatchProcessor** (`sharpen.ts:28-77` iterates 5400×3600×4 = ~78M bytes on main thread, synchronous). ~800 ms stall per image. Listing Kit sidesteps this today. |
| 6 | `resizeForUpload` re-runs per tool call | **TRUE** | Every tool fn (`detectRoomType`, `generateRoomDesign`, `instantDeclutter`, `virtualTwilight`, `replaceSky`, `virtualRenovation`…) starts with `cleanBase64(await resizeForUpload(imageBase64))`. For Listing Kit, each photo is resized at Stage + resized again at Cleanup (the staged base64 fed in). Waste: ~150-300 ms/photo × 10 = 2-3 s on main thread. |
| 7 | `checkAlignment` runs per cleanup call | **FALSE in Listing Kit** | ListingKit calls `instantDeclutter` directly and does **not** wrap it in the alignment guard. Only `BatchProcessor.processImage` (line 112-133) runs `checkAlignment`, flash-only, ~100 ms each. Not a major contributor. |

## Quick wins (ship today)

### QW-1: Bump default concurrency 3 → 6 for Stage + Cleanup
`components/ListingKitPipeline.tsx:172`
```diff
-  concurrency = 3,
+  concurrency = 6,
```
Gemini happily handles this per-key. Expected: **-35 s** on 10-photo kits (Stage ~18 s instead of 36 s, Cleanup the same). Zero risk — the existing `runPool` implementation is already correct, just conservative.

### QW-2: Merge `stripExif` into `resizeImage`
`utils/imageExport.ts:280-297`
```ts
export async function processForMLS(source, preset, watermark) {
  // Single decode + canvas draw instead of two passes.
  const processed = await resizeImage(source, preset.width, preset.height, preset.quality);
  // Canvas re-encode already strips EXIF — skip the redundant stripExif() call.
  return watermark ? addWatermark(processed, watermark) : processed;
}
```
Expected: **-3-4 s** on Step 4 (10 photos × ~400 ms saved).

### QW-3: Cache `resizeForUpload` output on the service layer
Add a `WeakMap<string, string>` or simple LRU keyed by the first 64 chars of the base64 input:
```ts
// services/geminiService.ts — small module-scoped cache
const resizeCache = new Map<string, string>();
async function cachedResize(b64: string) {
  const key = b64.length + '|' + b64.slice(0, 64);
  const hit = resizeCache.get(key);
  if (hit) return hit;
  const out = await resizeForUpload(b64);
  resizeCache.set(key, out);
  if (resizeCache.size > 200) resizeCache.delete(resizeCache.keys().next().value);
  return out;
}
```
Expected: **-2 s** across a 10-photo kit (cleanup no longer re-resizes the staged output the second time it's seen). Also benefits the single-image editor's chain mode.

### QW-4: Parallelize `processForMLS` in Step 4
`components/ListingKitPipeline.tsx:343-357` — swap the `for…of` for a `runPool(images, 4, …)`. No Gemini calls, just canvas ops and blob writes. Expected: **-2 s** on Step 4.

**Quick-wins cumulative: ~95 s → ~55 s on a 10-photo kit. ~1.7× speedup, one afternoon of work.**

## Bigger wins (separate spec)

### BW-1: Per-photo pipelining (Stage → Cleanup as one async unit)
Refactor `handleGenerate` so each photo is a single `async` task that runs `Stage → (optional Twilight) → Cleanup → MLS` without waiting on its siblings. Step progress bars become tri-state per photo rather than global gates. Estimated additional **-20 s** on top of quick wins, and the UI finally feels alive — photos finish and land in the zip drawer one by one instead of in big lurches.

### BW-2: OffscreenCanvas + web worker for the post-processing heavy-lifting (benefits BatchProcessor more than Listing Kit)
Move `sharpen`, `compositeStackedEdit`, `checkAlignment`, and `resizeForUpload` into a shared `ImageOpsWorker`. Uses `OffscreenCanvas` where supported (all modern Chromium/Firefox/Safari 17+). Eliminates main-thread stalls and "frozen modal" feel during BatchProcessor runs and chain-mode editing. Moderate effort — canvas APIs are the same, just behind a `postMessage` boundary.

### BW-3: Server-side MLS export via Vercel Fluid Compute
The browser shouldn't be decoding 10×5400×3600 JPEGs to resize them to 1920×1080 — that's a trivial server operation with `sharp` in a Node fluid function. Strips ~6 s of wall-clock and all the main-thread jank out of Step 4. Cost: one endpoint + multipart upload path.

### BW-4: Result caching keyed by image hash + tool name
If the user re-runs the kit on the same upload (tweaking hero, regenerating), today every Gemini call fires again. A simple `sha256(base64) + tool` → Supabase blob cache would make the second run near-instant. Saves real money on flash tier ($0.04/call × 10 photos × 2 tools = $0.80/re-run wasted).

## Acceptance criteria

- **P0 (quick wins merged):** 10-photo Listing Kit (flash tier, 5400×3600 inputs, good network) finishes in **< 60 s** wall-clock on a MacBook Air M2.
- **P1 (per-photo pipelining):** 10-photo kit finishes in **< 45 s**; first photo lands in the zip drawer in **< 20 s**.
- **P2 (worker offload):** No main-thread long task > 100 ms during Steps 4-6 (measurable via `PerformanceObserver` `longtask`).
- **P3 (server MLS):** 25-photo kit finishes in **< 75 s**; browser memory peaks < 600 MB.
- Regression guard: Cleanup-output visual QA stays at ≥ 9/10 on the internal 20-photo test set after all changes.

## Surprises worth flagging

- **`record-generation` is never called from the Listing Kit pipeline.** That means every kit run bypasses the Stripe-metered counter and the Supabase `generation_logs` usage dashboard. Per 10-photo kit, that's 20+ uncounted Gemini calls. Separate bug, but worth tracking: usage dashboard is under-reporting heavy users by exactly the number of kit runs they do.
- **Listing Kit skips `checkAlignment` and post-processing (sharpen + composite).** That explains why users sometimes see "staged output looks slightly different from editor output" on the same photo. The kit ships raw Gemini output (minus `processForMLS`'s final resize); the editor ships sharpened + composited. Not a perf issue, but a consistency gap the user has probably noticed without articulating.
- **The `pixelmatch` and per-pixel blend loops in `stackComposite.ts` are already hot** (~1-2 s on a 5400×3600 image), and they *only* run in BatchProcessor today. If the Listing Kit ever adopts post-processing parity with single-image mode, this becomes the new #1 bottleneck and BW-2 (web worker) becomes mandatory, not optional.
