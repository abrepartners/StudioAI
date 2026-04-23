/**
 * services/fluxService.ts
 *
 * Client wrapper for Flux 2 Pro. This is the cleanup engine for
 * Smart Cleanup — replaces the old Gemini + SAM pipeline which hallucinated
 * objects and needed a mask selector to stay honest. Flux 2 Pro preserves
 * framing natively and does text-driven cleanup without inventing content.
 */

import { resizeForUpload } from '../utils/resizeForUpload';

// Vercel's body limit is ~4.5 MB; a 2048 JPEG base64s to 3-4 MB which can
// still punch through on photo-heavy rooms. 1280 keeps us safely under the
// ceiling — no visible quality loss since Real-ESRGAN 4x brings the final
// output to ~5120 px anyway.
const FLUX_UPLOAD_MAX_EDGE = 1280;

const CLEANUP_PROMPT = (selectedRoom: string) =>
  `Remove all clutter, personal items, temporary belongings, decorations, signage, and anything non-permanent from this ${selectedRoom}.

Specifically remove these categories:
- Wall items: art, paintings, framed photos, signs, motivational posters, whiteboards, calendars, notes, hanging decorations
- Surface clutter: books, magazines, clothing, shoes, toys, backpacks, accessories, personal belongings, small electronics
- Soft goods: blankets, throws, pillows with patterns or decorative designs, rugs layered on top of flooring
- Exercise and hobby equipment: weights, dumbbells, benches, power racks, mats, cardio machines, bikes, musical instruments
- Pets and pet items: pets themselves, pet beds, bowls, toys, leashes, crates
- Kitchen clutter: small appliances on counters, dish racks, paper towels, food items, cutting boards (keep major appliances like fridges, stoves, dishwashers)
- Bathroom clutter: visible toiletries, hanging towels, shower accessories, bath toys
- Outdoor clutter: trash bins, garden hoses, pool toys, garden tools, portable furniture, umbrellas, grills, holiday decorations, yard signs

Leave only major furniture (beds, sofas, chairs, tables, desks, dressers, bookshelves) and architectural/structural elements. Empty all shelves, countertops, nightstands, and flat surfaces completely. Neutral MLS-ready staging.

CRITICAL PRESERVATION RULES:
- Preserve all fabric textures, material surfaces, and visible patterns exactly as they appear in the input (corduroy, leather, wood grain, tile, carpet, fabric weave, stainless steel, etc.). Do not smooth, blur, or re-interpret textures.
- Any mirrors in the image must show reflections consistent with the cleaned room. Update reflections to match the cleaned version.
- Do not re-render, retexture, or subtly modify any unchanged areas. Walls, floors, ceilings, major furniture, and all preserved elements must stay visually identical to the input.

Preserve exactly: walls, floors, ceilings, windows, curtains, blinds, doors, fixtures, lighting, mirrors, built-ins, and all major furniture. Do not redecorate, replace, or invent any new items.

END OF PROMPT.`;

export interface FluxCleanupResult {
  resultBase64: string;
  latencyMs: number;
}

export interface FluxCleanupOptions {
  /** When true, skip the server-side Real-ESRGAN 4x finalization. */
  skipUpscale?: boolean;
}

/**
 * Run Flux 2 Pro cleanup on a room photo. Server chains a silent
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
