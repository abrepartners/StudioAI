/**
 * services/twilightService.ts
 *
 * Client wrapper for Flux 2 Pro twilight conversion (v4, prompt-only).
 * No reference image is used — the server builds a detailed atmosphere
 * prompt from the user's style choice alone.
 */

import { resizeForUpload } from '../utils/resizeForUpload';

const FLUX_UPLOAD_MAX_EDGE = 1280;

export type TwilightStyle = 'warm-classic' | 'modern-dramatic' | 'golden-luxury';

export interface TwilightStyleOption {
  key: TwilightStyle;
  label: string;
  description: string;
}

export const TWILIGHT_STYLES: TwilightStyleOption[] = [
  {
    key: 'warm-classic',
    label: 'Warm Classic',
    description: 'Blue hour with warm amber glow and sunset horizon',
  },
  {
    key: 'modern-dramatic',
    label: 'Deep Dramatic',
    description: 'Purple-blue sky with strong interior light spill',
  },
  {
    key: 'golden-luxury',
    label: 'Golden Luxury',
    description: 'Soft pink-peach sunset with elegant golden glow',
  },
];

export interface TwilightResult {
  resultBase64: string;
  latencyMs: number;
}

export async function fluxTwilight(
  imageBase64: string,
  style: TwilightStyle,
  abortSignal?: AbortSignal,
): Promise<TwilightResult> {
  const shrunk = await resizeForUpload(imageBase64, FLUX_UPLOAD_MAX_EDGE);
  const res = await fetch('/api/flux-twilight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: shrunk, style }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`flux-twilight HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'flux-twilight failed');
  console.log(`[twilightService] Flux twilight (${style}) done in ${data.latencyMs}ms`);
  return {
    resultBase64: data.resultBase64,
    latencyMs: data.latencyMs,
  };
}
