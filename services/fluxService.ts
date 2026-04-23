/**
 * services/fluxService.ts
 *
 * Client wrapper for Flux Kontext Pro. This is the cleanup engine for
 * Smart Cleanup — replaces the old Gemini + SAM pipeline which hallucinated
 * objects and needed a mask selector to stay honest. Flux Kontext preserves
 * framing natively and does text-driven cleanup without inventing content.
 */

import { resizeForUpload } from '../utils/resizeForUpload';

// Vercel's body limit is ~4.5 MB; a 2048 JPEG base64s to 3-4 MB which can
// still punch through on photo-heavy rooms. 1280 keeps us safely under the
// ceiling — no visible quality loss since Real-ESRGAN 4x brings the final
// output to ~5120 px anyway.
const FLUX_UPLOAD_MAX_EDGE = 1280;

const CLEANUP_PROMPT = (selectedRoom: string) =>
  `Remove all clutter, personal items, temporary belongings, decorations, signage, gym equipment, weights, benches, power racks, exercise equipment, loose objects, and anything non-permanent from this ${selectedRoom}.

Specifically remove: wall art, paintings, framed photos, signs, motivational posters, whiteboards, calendars, notes, books, magazines, clothing, shoes, toys, backpacks, blankets, pillows, throws, accessories, shelving contents, trash bins, pet items (including pets themselves, bowls, beds), garden hoses, pool toys, garden tools, holiday decorations, lawn chairs, personal yard clutter, exercise mats, dumbbells, and any other portable or personal items.

Leave only major furniture and architectural elements. Empty all shelves, countertops, nightstands, and flat surfaces completely. Neutral MLS-ready staging.

CRITICAL PRESERVATION RULES:
- Preserve all fabric textures, material surfaces, and visible patterns exactly as they appear in the input (corduroy, leather, wood grain, tile, carpet, fabric weave, etc.). Do not smooth, blur, or re-interpret textures.
- Any mirrors in the image must show reflections consistent with the cleaned room. If a mirror reflection shows items that have been removed, update the reflection to match.
- Do not re-render, retexture, or subtly modify any unchanged areas. Walls, floors, ceilings, existing furniture, and all preserved elements must stay visually identical to the input.

Preserve exactly: walls, floors, ceilings, windows, curtains, blinds, doors, fixtures, lighting, mirrors, built-ins, and all major furniture exactly as-is. Do not redecorate, replace, or invent any new items.`;

export interface FluxCleanupResult {
  resultBase64: string;
  latencyMs: number;
}

export interface FluxCleanupOptions {
  /** When true, skip the server-side Real-ESRGAN 4x finalization. */
  skipUpscale?: boolean;
}

/**
 * Run Flux Kontext Pro cleanup on a room photo. Server chains a silent
 * Real-ESRGAN 4x finalization unless `options.skipUpscale === true`.
 * All the heavy lifting happens in one /api/flux-cleanup call — we
 * collapsed the pipeline to one endpoint to fit the Vercel Hobby
 * function count limit.
 *
 * Pass `{ skipUpscale: true }` from batch / listing-kit paths where the
 * output will be downsized for social anyway, to save the ~$0.002/img.
 */
export async function fluxCleanup(
  imageBase64: string,
  selectedRoom: string,
  abortSignal?: AbortSignal,
  options: FluxCleanupOptions = {},
): Promise<FluxCleanupResult> {
  const shrunk = await resizeForUpload(imageBase64, FLUX_UPLOAD_MAX_EDGE);
  const res = await fetch('/api/flux-cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: shrunk,
      prompt: CLEANUP_PROMPT(selectedRoom),
      skipUpscale: Boolean(options.skipUpscale),
    }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`flux-cleanup HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'flux-cleanup failed');
  console.log(`[fluxService] Flux+ESRGAN done in ${data.latencyMs}ms`);
  return {
    resultBase64: data.resultBase64,
    latencyMs: data.latencyMs,
  };
}
