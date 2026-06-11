/**
 * services/stagingService.ts
 *
 * Client wrapper for Seedream 4 virtual staging (/api/flux-staging).
 */

import { resizeForUpload } from "../utils/resizeForUpload";

// Seedream's output resolution tracks the input (with aspect_ratio
// match_input_image, size:4K does NOT force 4096 — it follows the input). So
// the upload edge is now the real resolution lever. 2048px keeps the JSON body
// well under Vercel's ~4.5 MB limit (a 2048px JPEG base64 lands ~0.8–1.5 MB)
// while roughly doubling the staged output vs the old 1280 cap. Other tools
// keep their own 1280 edge; this bump is staging-only.
const FLUX_UPLOAD_MAX_EDGE = 2048;

export interface StagingResult {
  resultBase64: string;
  latencyMs: number;
  /** Which server engine produced the frame: "flux-fill" | "seedream". */
  engine?: string;
}

export interface StagingOptions {
  /** Skip the server-side Pruna upscale (editing phase only — export upscales). */
  skipUpscale?: boolean;
}

export async function fluxStaging(
  imageBase64: string,
  prompt: string,
  abortSignal?: AbortSignal,
  options: StagingOptions = {},
): Promise<StagingResult> {
  const shrunk = await resizeForUpload(imageBase64, FLUX_UPLOAD_MAX_EDGE);
  // Engine A/B override: open the app with ?engine=nano (or seedream) to route
  // staging through an alternate engine for this session. No param = fill.
  const engineOverride =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("engine")
      : null;
  const res = await fetch("/api/flux-staging", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: shrunk,
      prompt,
      skipUpscale: Boolean(options.skipUpscale),
      ...(engineOverride ? { engine: engineOverride } : {}),
    }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`flux-staging HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "flux-staging failed");
  console.log(
    `[stagingService] staging done in ${data.latencyMs}ms (engine: ${data.engine || "unknown"})`,
  );
  return {
    resultBase64: data.resultBase64,
    latencyMs: data.latencyMs,
    engine: data.engine,
  };
}
