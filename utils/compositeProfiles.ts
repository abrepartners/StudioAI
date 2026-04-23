import type { StackCompositeOptions } from './stackComposite';

// Cleanup removes discrete objects. Balance between two failure modes:
//   - threshold too low (0.04) → pixelmatch flags bicubic-downsample noise as
//     "change", mask covers 90%+ of frame → most pixels blend soft Gemini
//     output, whole image looks soft
//   - threshold too high → misses subtle ghost halos, source clutter bleeds
//     back in
// Empirical test on showcase-cleanup-before fixture:
//   threshold=0.04, dilate=12 → 91% mask (whole-image softness bug)
//   threshold=0.15, dilate=8  → 35% mask (sharp unchanged regions + covers ghosts)
// The higher dilate (vs default 3) keeps Codex's anti-ghost intent — we catch
// ghost halos via dilation, not via an overly sensitive diff threshold.
export const CLEANUP_COMPOSITE_OPTIONS: StackCompositeOptions = {
  threshold: 0.15,
  dilatePx: 8,
  featherPx: 10,
};

// Flux Kontext cleanup: model is pixel-precise so we can run a tighter diff.
// threshold: 0.05 — catches subtle Flux re-renders on carpet/walls without
//   flagging the whole frame like 0.04 did on the old Gemini tests.
// dilatePx: 2 — minimal dilation; Flux edges are crisp, no SAM shadow halos.
// featherPx: 10 — keep smooth boundary blend same as Gemini cleanup.
export const FLUX_CLEANUP_COMPOSITE_OPTIONS: StackCompositeOptions = {
  threshold: 0.05,
  dilatePx: 2,
  featherPx: 10,
  // Flux retextures the whole frame subtly — without raising the bail bound,
  // the default 95% bail fires and ships raw Flux output (no composite, ghosts survive).
  maxChangeBail: 0.99,
};

// Lighting-only tools (twilight / sky) repaint broad regions. Blending those
// back into the prior frame can create double-exposure overlays, so we skip
// composite and ship sharpened model output.
export function shouldSkipCompositeForTool(
  tool: 'twilight' | 'sky' | 'cleanup' | 'renovation' | 'stage' | 'staging'
): boolean {
  return tool === 'twilight' || tool === 'sky';
}
