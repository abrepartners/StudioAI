/**
 * services/twilightService.ts
 *
 * Client wrapper for Flux 2 Pro twilight conversion (v6, 2-axis).
 * Two independent axes:
 *   - Color style: pink | golden | purple | natural (sky palette)
 *   - Time of day: early-evening | sunset | twilight (brightness / exposure)
 */

import { resizeForUpload } from "../utils/resizeForUpload";

const FLUX_UPLOAD_MAX_EDGE = 1280;

export type TwilightColorStyle = "pink" | "golden" | "purple" | "natural";
export type TwilightTime = "early-evening" | "sunset" | "twilight";

export interface TwilightResult {
  resultBase64: string;
  latencyMs: number;
  /** Engine the server actually ran — nano-banana-pro, or flux-2-pro on
   *  the default path AND on a nano refusal/capacity fallback. Surfaced so
   *  telemetry and the A/B never mislabel a Flux fallback as a nano sample. */
  engine?: string;
}

export interface TwilightOptions {
  /** Skip the server-side Pruna upscale (editing phase only — export upscales). */
  skipUpscale?: boolean;
}

export async function fluxTwilight(
  imageBase64: string,
  style: TwilightColorStyle,
  timeOfDay: TwilightTime,
  abortSignal?: AbortSignal,
  options: TwilightOptions = {},
): Promise<TwilightResult> {
  const shrunk = await resizeForUpload(imageBase64, FLUX_UPLOAD_MAX_EDGE);
  // twilight runs nano-banana-pro by default (flux-2-pro stays as the
  // server-side fallback). The only override worth forwarding is the QA
  // escape: ?engine=flux forces the legacy flux path for side-by-side
  // checks. nano is the default, so no other value needs sending.
  const forceFlux =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("engine") === "flux";
  const res = await fetch("/api/flux-twilight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: shrunk,
      style,
      timeOfDay,
      skipUpscale: Boolean(options.skipUpscale),
      ...(forceFlux ? { engine: "flux" } : {}),
    }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`flux-twilight HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "flux-twilight failed");
  console.log(
    `[twilightService] Flux twilight (${style}/${timeOfDay}) done in ${data.latencyMs}ms`,
  );
  return {
    resultBase64: data.resultBase64,
    latencyMs: data.latencyMs,
    engine: data.engine,
  };
}
