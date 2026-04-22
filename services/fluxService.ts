/**
 * services/fluxService.ts
 *
 * Client wrapper for Flux Kontext Pro. This is the cleanup engine for
 * Smart Cleanup — replaces the old Gemini + SAM pipeline which hallucinated
 * objects and needed a mask selector to stay honest. Flux Kontext preserves
 * framing natively and does text-driven cleanup without inventing content.
 */

const CLEANUP_PROMPT = (selectedRoom: string) => `You are editing a real estate listing photo of a ${selectedRoom}. REMOVE all clutter, personal items, and distractions. Nothing else.

REMOVE:
- Shoes, slippers, coats, bags, umbrellas, backpacks, loose clothing
- Trash, recycling, food, dishes on surfaces, water bottles, cups
- Personal photos, framed family pictures, kids' artwork on walls or fridges
- Real estate signs, open-house signs, lockboxes
- Pets and pet accessories: food bowls, toys, crates, beds, leashes
- Magnets, sticky notes, papers, mail, keys
- Visible power cords, cables, power strips, chargers
- Dirt, scuff marks, water rings, dust bunnies on floors and counters
- Kids' toys, stuffed animals, play mats

PRESERVE EXACTLY:
- All furniture (sofas, chairs, beds, tables, dressers, nightstands)
- All artwork, wall decor, mirrors, landscape paintings — even if personal-style
- All built-ins: kitchen cabinets, bathroom vanities, closet shelving, fireplaces
- Appliances, fixtures, lighting, ceiling fans, vents
- Floors, walls, ceilings, doors, windows, trim, baseboards
- The room's exact geometry, camera angle, framing, and perspective

NEVER invent or add objects that weren't in the source photo. This is a REMOVAL-ONLY edit. If unsure whether an item is "personal clutter" or "staged decor," LEAVE IT. Photo-realistic. No stylistic changes. Same lighting. Same time of day.`;

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
  const res = await fetch('/api/flux-cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64,
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
