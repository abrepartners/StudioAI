/**
 * services/reveEditService.ts
 *
 * Client wrapper for reve/edit image editing (/api/reve-edit).
 * Used by whiten (white balance) and lawn (landscaping) tools.
 */

import { resizeForUpload } from "../utils/resizeForUpload";

const FLUX_UPLOAD_MAX_EDGE = 1280;

export interface ReveEditResult {
  resultBase64: string;
  latencyMs: number;
}

export interface ReveEditOptions {
  /** Skip the server-side Pruna upscale (editing phase only — export upscales). */
  skipUpscale?: boolean;
}

export async function reveEdit(
  imageBase64: string,
  prompt: string,
  isExterior: boolean,
  abortSignal?: AbortSignal,
  options: ReveEditOptions = {},
): Promise<ReveEditResult> {
  const shrunk = await resizeForUpload(imageBase64, FLUX_UPLOAD_MAX_EDGE);
  const res = await fetch("/api/reve-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: shrunk,
      prompt,
      isExterior,
      skipUpscale: Boolean(options.skipUpscale),
    }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`reve-edit HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "reve-edit failed");
  console.log(`[reveEditService] reve/edit done in ${data.latencyMs}ms`);
  return { resultBase64: data.resultBase64, latencyMs: data.latencyMs };
}
