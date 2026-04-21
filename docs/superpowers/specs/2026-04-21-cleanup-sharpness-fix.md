# Spec — Smart Cleanup Output Is Not Sharp

**Date:** 2026-04-21
**Reporter:** Thomas
**Priority:** P0 (user-visible quality regression)

## The problem

When users run Smart Cleanup on a listing photo, the **entire output image looks soft / low-quality** — not just the area where clutter was removed. This happens even after the April 20 ghost/export/confidence fixes (`f201723`, `dc398c8`, `689fced`, `bcb7faa`).

This is **different from the previously-known "edit regions are softer than untouched regions" tradeoff** (which is a Gemini-resolution thing and expected). The user is reporting that *everything* looks soft, including walls, windows, trim, and other regions Gemini shouldn't have touched.

## What "sharp" means here (the contract)

The Phase C composite exists specifically so that:
- **Regions Gemini did not edit** stay **byte-identical to the user's original upload** (full input resolution, full sharpness, full grain).
- **Regions Gemini edited** are bicubic-upsampled Gemini output (softer — this is the known tradeoff).

If the *whole* image looks soft, that invariant is broken somewhere. **Untouched regions should be pixel-perfect copies of the original.**

## What to check (in order of likelihood)

### 1. Composite is bailing to Gemini-only

In `utils/stackComposite.ts` / `utils/compositePreserve.ts`, the composite has a "bail" path when the change-ratio exceeds a threshold (typically 0.95). When it bails, it ships the ENTIRE Gemini output instead of blending — which makes the whole image soft.

**Investigate:**
- What change-ratios are actual production cleanup runs producing?
- Is Codex's new `CLEANUP_COMPOSITE_OPTIONS` profile (from `utils/compositeProfiles.ts`) too permissive, treating too much of the image as "changed"?
- If change-ratio is consistently high (say >40%), that's the symptom — tighten the diff threshold or dilation so only true edit regions get flagged.

**Acceptance check:** add a debug log showing `change-ratio` + `bailed: boolean` for every cleanup run. A clean cleanup (e.g., removing a few countertop items from a 5000×3500 kitchen photo) should show change-ratio < 10% and bailed=false.

### 2. Gemini output dimensions vs. composite dimensions

Confirm the flow:
- Input: ~5400×3600 (user's photo at native res)
- `resizeForUpload` pre-processing: currently set to 3072 max (after our April 19 work) — confirm it's still there and hasn't been changed
- Gemini returns: ~1264×842 (Gemini native image output)
- Composite should run the PIXEL DIFF at Gemini's native resolution (1264×842), then upsample the change mask to input resolution, then blend Gemini's upsampled output only in the masked region, keeping the rest from the original

**Investigate:**
- Is the composite currently comparing at Gemini's resolution or at input resolution? (If input-resolution diffing with a bicubic-upsampled Gemini output, the diff will be noisier and flag too much as "changed" — causing the bail above.)
- Is the original source image being passed to the composite at FULL resolution, or is some earlier step downsampling it?

### 3. Sharpen amount regression

`utils/sharpen.ts` default is 0.2. Cleanup in `components/SpecialModesPanel.tsx::postProcessToolOutput` passes 0.4. Confirm the 0.4 is still being applied — recent refactors may have lost it.

### 4. Export JPEG quality

`utils/imageExport.ts` presets use 0.85–0.92 JPEG quality. For large high-res exports, even 0.92 can look soft on fine texture. Check: does the user see softness in the on-screen preview, or only in the downloaded file? If only downloaded → bump export quality to 0.95 or offer a "max quality" preset.

### 5. Display-vs-file mismatch

Browser canvas previews are often downsampled by the browser for performance. The on-screen image may look softer than the actual file bytes.

**Investigate:** have user download the file and inspect the raw JPEG at 100% zoom. If the file itself is sharp but the preview is soft, that's a UI issue (add `imageRendering: crisp-edges` or increase preview size), not a pipeline issue.

## Desired behavior (acceptance)

Given a 5000×3500 listing photo with clutter in 5–15% of pixels (e.g., a cluttered countertop or a few toys on the floor):

1. Run Smart Cleanup
2. Download the exported file
3. Open at 100% zoom
4. **In the regions Gemini did not edit**, pixels should be bit-identical to the original photo. Use image-diff tool to confirm: for a region like a window frame or wall corner that wasn't clutter, the diff should be zero.
5. **In the edit regions** (where clutter was), softness from Gemini's 1264-res output is acceptable but should be sharpened.

## Fast-path validation

Write a QA test script:
1. Take `public/showcase-cleanup-before.jpg`
2. Run through the real production cleanup pipeline
3. Diff the output against the input:
   - Pick 5 points known to be OUTSIDE the edit zone (e.g., upper-left wall corner, window frame, door trim)
   - At each point, pixel-diff the input against the output
   - Expected: diff = 0 (bit-identical)
4. If any point shows diff > 0 in untouched regions, the composite isn't preserving original pixels.

## Out of scope for this fix

- Edit-region softness (Gemini resolution ceiling — would require switching models or model upgrade)
- Export preset changes beyond quality tuning
- New alignment guards

## Why this matters — competitive context

The mask-based composite preservation pattern — keep original pixels bit-identical outside edit regions, only touch what Gemini actually changed — is not a nice-to-have. It is literally THE foundational technique every other serious product in this space relies on. This is not a StudioAI invention; it's the price of admission.

- **My Architect AI** — Stable Diffusion + MLSD/Canny/Depth ControlNet + inpainting. Their "Accurate Engine" marketing line ("keeps geometry and materials unchanged") is this exact pixel-preservation pattern, rebranded.
- **RoomGPT** (Nutlope/roomGPT, open-source on GitHub) — SD 1.5 + jagilley ControlNet on Replicate. Confirmed via source code.
- **Collov AI** — Stable Diffusion + spatial GNN + localized diffusion prompts for area-specific edits.
- **Interior AI (levelsio)** — SD + 3D depth + wall/floor/ceiling segmentation.
- **VirtualStagingAI** — SD 1.5 + inpainting ControlNet, trained on a public dataset of 491 empty/furnished pairs.

Every one of them is SD-based and uses a mask to bound the diffusion to the edit region. The untouched pixels are the user's original, untouched. That's why their outputs look "clean" — they aren't regenerating the frame, they're surgically editing it.

What makes StudioAI different: **we're on Gemini** (unique in this space). Gemini is a generative model, not a surgical editor — it regenerates the whole frame rather than preserving pixels. The Phase C composite is our bridge between "Gemini's generative nature" and "the pixel-preservation discipline every competitor relies on." **If the composite isn't working, we're shipping Gemini's soft whole-frame output with none of the competitive advantage the composite is supposed to provide.**

This isn't just a bug to fix. It's restoring the fundamental technique that makes our approach competitive at all.

## Related follow-up specs

Two companion specs will follow this one. Order matters — do them in sequence:

- `2026-04-21-sam2-cleanup-integration.md` — adds SAM 2 instance segmentation for pixel-precision clutter masks **before** sending to Gemini. Once the composite bug in THIS spec is fixed, SAM 2 gives users the final fidelity leap by ensuring Gemini knows exactly what to remove.
- `2026-04-21-clarity-upscaler-integration.md` — adds Clarity Upscaler on edit regions only, so the ~4× bicubic upsample of Gemini's 1264×842 output is replaced with real detail via SD-based upscaling. Complements, doesn't replace, the composite preservation.

Fix THIS spec first (composite audit), then SAM 2 (before Gemini), then Clarity (after Gemini). Each layer amplifies the next; doing them out of order means later layers are band-aiding an upstream bug.
