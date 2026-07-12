/**
 * src/vellum/toolPostProcess.ts
 *
 * Shared, single-source CLIENT-side post-processing for the tools whose raw
 * model output is drift-fixed before it's shown to the agent. Both the
 * production editor (processOnePhoto) and the admin Model Lab import from here,
 * so the lab evaluates the SAME image an agent actually receives — not the
 * driftier raw model frame.
 *
 * Nano tools (staging, declutter, magicedit) ship RAW — staging gets a
 * server-side furniture-lock composite in /api/flux-staging and declutter is
 * mask-scoped server-side — so they are deliberately NOT in COMPOSITE_TOOLS.
 */

import { sharpenImage } from "../../utils/sharpen";
import { compositeStackedEdit } from "../../utils/stackComposite";

const RENOVATION_COMPOSITE = {
  threshold: 0.03,
  dilatePx: 8,
  featherPx: 12,
} as const;
// Whiten / sky / twilight repaint broad regions with subtle, global tonal
// shifts. A lighter, wide-feather preset preserves untouched texture without
// the double-exposure overlay that an aggressive mask would produce.
const LIGHT_COMPOSITE = {
  threshold: 0.1,
  dilatePx: 4,
  featherPx: 18,
} as const;

// Tools whose RAW output is sharpened + composited client-side before display.
const COMPOSITE_TOOLS = new Set([
  "renovation",
  "whiten",
  "sky",
  "twilight",
  "lawn",
]);

export function toolNeedsPostProcess(tool: string): boolean {
  return COMPOSITE_TOOLS.has(tool);
}

/**
 * Sharpen the soft diffusion output, then composite so unchanged regions come
 * byte-identical from the input buffer. Returns the raw frame unchanged for
 * tools that ship raw, and falls back to raw if the composite throws (matching
 * production's non-fatal drift-fix semantics exactly).
 */
export async function postProcessToolOutput(
  tool: string,
  inputImage: string,
  rawResultDataUrl: string,
): Promise<string> {
  if (!COMPOSITE_TOOLS.has(tool)) return rawResultDataUrl;
  try {
    const chainEnabled =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("chain") !== "0"
        : true;
    const fmt: "png" | "jpeg" = chainEnabled ? "png" : "jpeg";
    const sharpened = await sharpenImage(rawResultDataUrl, 0.4, 1, fmt);
    const compositeOpts =
      tool === "renovation" ? RENOVATION_COMPOSITE : LIGHT_COMPOSITE;
    return await compositeStackedEdit(inputImage, sharpened, {
      format: fmt,
      ...compositeOpts,
    });
  } catch (compErr) {
    console.warn(
      "[Vellum] composite drift-fix failed, using raw model output:",
      compErr,
    );
    return rawResultDataUrl;
  }
}
