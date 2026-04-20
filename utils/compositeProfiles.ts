import type { StackCompositeOptions } from './stackComposite';

// Cleanup removes discrete objects, so we want a more assertive changed-region
// mask and a tighter feather boundary to avoid "ghost" residues from the
// source image bleeding back in.
export const CLEANUP_COMPOSITE_OPTIONS: StackCompositeOptions = {
  threshold: 0.08,
  dilatePx: 6,
  featherPx: 8,
};

// Lighting-only tools (twilight / sky) repaint broad regions. Blending those
// back into the prior frame can create double-exposure overlays, so we skip
// composite and ship sharpened model output.
export function shouldSkipCompositeForTool(
  tool: 'twilight' | 'sky' | 'cleanup' | 'renovation' | 'stage' | 'staging'
): boolean {
  return tool === 'twilight' || tool === 'sky';
}
