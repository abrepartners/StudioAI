/**
 * services/skyService.ts
 *
 * Client wrapper for /api/sky-replace (Google Nano Banana sky swap).
 * Replaces the old Gemini replaceSky path — Nano Banana preserves the
 * house and landscaping more reliably while swapping only the sky region.
 */

import { resizeForUpload } from '../utils/resizeForUpload';

const SKY_UPLOAD_MAX_EDGE = 1280;

export type SkyStyle = 'blue' | 'dramatic' | 'golden' | 'stormy';

export interface SkyResult {
  resultBase64: string;
  latencyMs: number;
}

export async function nanoSky(
  imageBase64: string,
  style: SkyStyle,
  abortSignal?: AbortSignal,
): Promise<SkyResult> {
  const shrunk = await resizeForUpload(imageBase64, SKY_UPLOAD_MAX_EDGE);
  const res = await fetch('/api/sky-replace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: shrunk, style }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`sky-replace HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'sky-replace failed');
  console.log(`[skyService] Nano Banana sky (${style}) done in ${data.latencyMs}ms`);
  return {
    resultBase64: data.resultBase64,
    latencyMs: data.latencyMs,
  };
}
