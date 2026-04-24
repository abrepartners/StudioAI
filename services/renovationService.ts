/**
 * services/renovationService.ts
 *
 * Client wrapper for /api/flux-renovation (Flux 2 Pro virtual renovation).
 * Handles image resize-for-upload and typed renovation details payload.
 *
 * Paired with RENOVATION_COMPOSITE in postProcessToolOutput on the
 * consumer side — the composite pass brings back non-edited pixels
 * byte-identical to catch any residual contrast/exposure drift from
 * Flux's global re-render tendency.
 */

import { resizeForUpload } from '../utils/resizeForUpload';

const RENOVATION_UPLOAD_MAX_EDGE = 1280;

export interface RenovationDetails {
  cabinets?: string;
  countertops?: string;
  flooring?: string;
  walls?: string;
}

export interface RenovationResult {
  resultBase64: string;
  latencyMs: number;
}

export async function fluxRenovation(
  imageBase64: string,
  details: RenovationDetails,
  abortSignal?: AbortSignal,
): Promise<RenovationResult> {
  const shrunk = await resizeForUpload(imageBase64, RENOVATION_UPLOAD_MAX_EDGE);
  const res = await fetch('/api/flux-renovation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: shrunk,
      cabinets: details.cabinets || undefined,
      countertops: details.countertops || undefined,
      flooring: details.flooring || undefined,
      walls: details.walls || undefined,
    }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`flux-renovation HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'flux-renovation failed');
  console.log(`[renovationService] Flux renovation done in ${data.latencyMs}ms`);
  return {
    resultBase64: data.resultBase64,
    latencyMs: data.latencyMs,
  };
}
