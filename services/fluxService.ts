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
  `Remove all clutter, personal items, decorations, framed photos, artwork, wall signs, letters, initials, pillows with patterns, throw blankets, books, shelving contents, clothing, shoes, toys, accessories, backpacks, hanging items, calendars, notes, canopies, and any personal belongings from this ${selectedRoom}.

CRITICAL RULES — DO NOT VIOLATE:
- DO NOT add any new furniture or objects that were not in the original photo.
- DO NOT replace existing furniture with different furniture (do not swap a dresser for a desk, a bed for a different bed, etc).
- DO NOT restyle or redecorate.
- DO NOT change bedding style, color, or pattern beyond making the bed look neatly made.
- DO NOT invent architectural details not present in the original.

Leave existing major furniture (beds, chairs, tables, desks, dressers, bookshelves) exactly where it is — same position, same size, same style, same type — just clear their surfaces completely. Empty all bookshelf shelves. Make beds look neatly made with their EXISTING bedding visible (just tidied, not replaced).

Preserve exactly: walls, floor, ceiling, doors, windows, window treatments (including any pink, patterned, or colored curtains), lighting fixtures, built-ins, and all architectural elements. Preserve exactly: the position, size, shape, and TYPE of every piece of existing furniture.

The room should look clean, empty, and depersonalized — ready for an MLS listing. Lighting, perspective, color palette, and all architectural details must match the original exactly.`;

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
