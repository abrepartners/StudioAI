/**
 * services/stagingService.ts
 *
 * Client wrapper for reve/edit virtual staging (/api/flux-staging).
 */

import { resizeForUpload } from '../utils/resizeForUpload';

const FLUX_UPLOAD_MAX_EDGE = 1280;

export interface StagingResult {
  resultBase64: string;
  latencyMs: number;
}

export async function fluxStaging(
  imageBase64: string,
  prompt: string,
  abortSignal?: AbortSignal,
): Promise<StagingResult> {
  const shrunk = await resizeForUpload(imageBase64, FLUX_UPLOAD_MAX_EDGE);
  const res = await fetch('/api/flux-staging', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: shrunk, prompt }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`flux-staging HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'flux-staging failed');
  console.log(`[stagingService] Flux staging done in ${data.latencyMs}ms`);
  return { resultBase64: data.resultBase64, latencyMs: data.latencyMs };
}
