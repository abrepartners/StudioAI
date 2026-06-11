/**
 * services/fluxService.ts
 *
 * Client wrapper for the Smart Cleanup endpoint (/api/flux-cleanup).
 *
 * Two-engine architecture (swapped 2026-04-28 after bake-off):
 *   - bria/fibo-edit (default) — targeted clutter removal, preserves furniture
 *   - reve/edit ("Full Clean") — total room clearing, removes everything
 *
 * Exteriors and interiors use separate prompts because cleanup models
 * hallucinate architecture when given a generic "keep as-is" instruction
 * on exteriors. Exteriors route through Clarity Upscaler, interiors
 * use Pruna.
 */

import { resizeForUpload } from '../utils/resizeForUpload';

// Vercel's body limit is ~4.5 MB; 1280 edge keeps us safely under.
const FLUX_UPLOAD_MAX_EDGE = 1280;

// Room types that are outdoor / architecturally open-ended. These need a
// much stricter preservation prompt because cleanup models will happily
// regenerate grass, siding, roofs, landscaping, and sky if given "remove
// clutter" latitude. Also drives the upscaler branch: exteriors get
// Clarity for detail-adding upscale, interiors get Real-ESRGAN for speed.
// 'Exterior' kept here (but removed from the Vellum room picker) so that
// photos labeled 'Exterior' before May 2026 still route through the exterior
// path. No new uploads can pick 'Exterior' — old IndexedDB rows still work.
const EXTERIOR_ROOMS = new Set<string>(['Exterior', 'Patio', 'Pool', 'Backyard', 'Front Yard']);

// Per-room-type clutter removal targets. Each list is specific to what
// agents actually encounter in listing shoots — including items that are
// out of place for that room type.
const ROOM_CLUTTER: Record<string, string> = {
  'Living Room':
    'remote controls, magazines, newspapers, tissue boxes, cups, bottles, cans on tables, ' +
    'phone chargers and cables, shoes, slippers, pet toys, blankets/throws draped messily, ' +
    'laundry baskets, backpacks, shopping bags, coats on furniture, kids\' toys, exercise equipment, ' +
    'stacks of mail, open laptops or tablets, game controllers, candles with soot marks',
  'Dining Room':
    'mail and papers, phone chargers, random boxes, kids\' cups and plates, stained placemats, ' +
    'laundry baskets, backpacks, school bags, shoes, grocery bags, piles of clothes, ' +
    'open laptops, pens and office supplies, unfolded napkins, condiment bottles left out, ' +
    'pet bowls, highchair food mess, centerpieces with dead flowers',
  'Kitchen':
    'dish rack and drying dishes, sponges, soap bottles, paper towel rolls, fridge magnets and papers, ' +
    'small appliance clutter (toaster crumbs, blender left out), fruit past prime, ' +
    'open food packaging, spice bottles on counter, knife blocks, pet bowls and mats, ' +
    'mail piles, kids\' art on fridge, cleaning supplies left out, trash can visible, ' +
    'phone chargers, reusable bags hanging from handles',
  'Bedroom':
    'clothes on floor, bed, or chairs, phone chargers and cables, water bottles, tissue boxes, ' +
    'personal items on nightstands, unmade bedding wrinkles, shoes scattered, ' +
    'laundry basket overflowing, exercise equipment, ironing board, ' +
    'stacks of books or magazines, open closet doors showing clutter, ' +
    'kids\' toys, pet beds, suitcases, shopping bags',
  'Bathroom':
    'toiletries on counter (toothbrush, toothpaste, razors, lotions, makeup), towels on floor, ' +
    'toilet seat up, soap residue, shower bottles and loofahs visible, ' +
    'plunger visible, trash can overflow, scale on floor, ' +
    'cleaning supplies left out, personal hygiene items, kids\' bath toys, ' +
    'hair products, wet floor mats bunched up',
  'Office':
    'cable clutter, stacks of papers and folders, coffee cups, food wrappers, ' +
    'sticky notes covering surfaces, overflowing trash, personal photos in cheap frames, ' +
    'tangled headphones, open drawers showing clutter, dust on screens',
  'Laundry Room':
    'piles of dirty/clean laundry on surfaces, detergent bottles and dryer sheets left out, ' +
    'lint on floor, open cabinets showing clutter, cleaning supply bottles, ' +
    'ironing board, hangers scattered, pet items',
  'Garage':
    'visible trash and recycling, scattered tools, oil stains, cobwebs, ' +
    'boxes piled haphazardly, sporting equipment scattered, holiday decorations half-stored, ' +
    'pesticide and chemical containers, old paint cans',
};

// Fallback for room types not in the matrix
const GENERIC_INTERIOR_CLUTTER =
  'personal items, trash, clutter, cables and cords, shoes, bags, ' +
  'cleaning supplies, toiletries, scattered mail, laundry, kids\' toys, pet items';

const INTERIOR_CLEANUP_PROMPT = (room: string, filter?: string, custom?: string) => {
  const clutterList = ROOM_CLUTTER[room] || GENERIC_INTERIOR_CLUTTER;

  let prompt: string;
  if (filter === 'fullclean') {
    prompt = `Remove all furniture, decor, rugs, curtains, wall art, and personal items from this ${room}. Leave only the bare empty room: walls, floor, ceiling, windows, doors, built-in fixtures (cabinets, counters, appliances), and light fixtures. Reconstruct revealed surfaces by extending the SAME material visible at the edges of each removed area — match the grain, color, pattern, and reflectivity. If the floor is hardwood, fill with hardwood at the same plank angle. If tile, continue the tile pattern and grout lines. Do not add any new items.`;
  } else if (filter === 'personal') {
    prompt = `Remove only personal and identifying items from this ${room}: family photos, toiletries, medication, mail with names, phone chargers, and personal belongings. Keep all furniture, decor, and general clutter in place. Reconstruct revealed surfaces by extending the SAME material visible at the edges of each removed area — match the exact texture, color, and pattern.`;
  } else if (filter === 'surfaces') {
    prompt = `Remove all items sitting on counters, tables, shelves, and other flat surfaces in this ${room}. Leave floor items and furniture as-is. Reconstruct revealed surfaces by extending the SAME material visible at the edges of each removed area. If a countertop is granite, fill with granite. If wood, fill with wood at the same grain angle.`;
  } else {
    prompt = `Remove the following from this ${room}: ${clutterList}. Also remove any item that clearly does not belong in a ${room}. Keep all furniture, built-in fixtures, and architecture exactly as-is. Reconstruct revealed surfaces by extending the SAME material visible at the edges of each removed area — match the grain, color, pattern, and reflectivity exactly.`;
  }

  if (custom) {
    prompt += `\n\nADDITIONALLY, specifically remove: ${custom}.`;
  }

  return prompt;
};

const EXTERIOR_CLEANUP_PROMPT = (room: string, filter?: string, custom?: string) => {
  let prompt: string;

  if (filter === 'yard') {
    prompt = `Remove yard clutter from this ${room}: trash cans, recycling bins, garden tools, hoses, ladders, kids' outdoor toys, pet items, scattered lawn equipment, and seasonal decorations. Keep all vehicles, signs, and permanent fixtures.`;
  } else if (filter === 'vehicles') {
    prompt = `Remove all vehicles, trash cans, recycling bins, and dumpsters from this ${room}. Keep landscaping, signs, outdoor furniture, and all other items.`;
  } else if (filter === 'signs') {
    prompt = `Remove for-sale signs, open house signs, construction debris, temporary fencing, port-a-potties, and any temporary or promotional items from this ${room}. Keep vehicles, landscaping, and permanent fixtures.`;
  } else {
    prompt = `Remove only movable clutter from this ${room}: trash cans, tools, hoses, ladders, construction debris, for-sale signs, vehicles in driveway, portable furniture, kids' outdoor toys, pet items, and seasonal decorations.`;
  }

  if (custom) {
    prompt += `\n\nADDITIONALLY, specifically remove: ${custom}.`;
  }

  prompt += `\n\nGROUND SURFACE PRESERVATION (CRITICAL):
- Identify the EXISTING ground material in this photo: dirt, gravel, concrete, mulch, dead grass, patchy lawn, bare soil, or healthy grass. Whatever is there, KEEP IT.
- Fill revealed areas with the SAME material visible in surrounding ground — match color, texture, and grain exactly.
- If the ground is dirt, fill with dirt. If gravel, fill with gravel. If patchy, keep it patchy.
- NEVER replace existing ground with grass, turf, or landscaping that does not already exist in the photo.

Do not change the house, roof, siding, windows, doors, driveway, walkways, fences, or sky. Do not add, improve, or enhance any landscaping. Do not make the yard look "better" — only remove the specified clutter and reconstruct with the same surface material.`;

  return prompt;
};

export function buildCleanupPrompt(
  selectedRoom: string,
  filter?: string,
  customRemoval?: string,
): string {
  const room = (selectedRoom || '').trim();
  const custom = (customRemoval || '').trim() || undefined;
  if (EXTERIOR_ROOMS.has(room)) return EXTERIOR_CLEANUP_PROMPT(room, filter, custom);
  return INTERIOR_CLEANUP_PROMPT(room || 'room', filter, custom);
}

export function isExteriorRoom(selectedRoom: string): boolean {
  return EXTERIOR_ROOMS.has((selectedRoom || '').trim());
}

export interface FluxCleanupResult {
  resultBase64: string;
  latencyMs: number;
  /** Engine that actually produced the result (bria | reve | nano). */
  engine?: string;
}

export interface FluxCleanupOptions {
  skipUpscale?: boolean;
  customPrompt?: string;
  /** Declutter filter: 'fullclean', 'personal', or 'surfaces'. Omit for standard room clutter. */
  filter?: string;
  /** User-typed specific items to remove (appended to room prompt). */
  customRemoval?: string;
  /** Optional SAM2 mask (data URL or raw base64). When provided, Bria only edits masked pixels. */
  maskBase64?: string;
  /** Engine override. Default routing: mask present → 'bria', else 'nano'. */
  engine?: 'nano' | 'bria' | 'reve';
}

export async function fluxCleanup(
  imageBase64: string,
  selectedRoom: string,
  abortSignal?: AbortSignal,
  options: FluxCleanupOptions = {},
): Promise<FluxCleanupResult> {
  const shrunk = await resizeForUpload(imageBase64, FLUX_UPLOAD_MAX_EDGE);
  const isExterior = isExteriorRoom(selectedRoom);
  // Nano Banana Pro is PRIMARY for declutter (promoted 2026-06-11 after the
  // re-run bake-off: 100% targeted removal with furniture, layered rugs, and
  // architecture preserved — prompt-only, no SAM, no mask, no composite).
  // Bria runs only when a mask is present (Precision Select — the user-picked
  // mask IS the feature). 'reve' (flux-kontext-pro) stays reachable as an
  // explicit override for debugging.
  const engine =
    options.engine || (options.maskBase64 ? 'bria' : 'nano');
  const prompt = options.customPrompt
    || buildCleanupPrompt(selectedRoom, options.filter, options.customRemoval);
  const res = await fetch('/api/flux-cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: shrunk,
      prompt,
      engine,
      skipUpscale: Boolean(options.skipUpscale),
      isExterior,
      maskBase64: options.maskBase64 || undefined,
    }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`flux-cleanup HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'flux-cleanup failed');
  const upscalerLabel = isExterior ? 'Clarity' : 'Pruna';
  console.log(`[fluxService] ${engine}+${upscalerLabel} done in ${data.latencyMs}ms (${selectedRoom})`);
  return {
    resultBase64: data.resultBase64,
    latencyMs: data.latencyMs,
    engine: data.engine,
  };
}
