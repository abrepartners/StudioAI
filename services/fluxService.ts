/**
 * services/fluxService.ts
 *
 * Client wrapper for the Smart Cleanup endpoint (/api/flux-cleanup).
 *
 * NAMING NOTE: the file / function / endpoint still carry "flux" in the
 * name because they predate the model swap. The actual backend model is
 * google/nano-banana (Gemini 2.5 Flash Image), swapped in on 2026-04-24
 * after Model Lab testing showed Nano Banana preserved architecture,
 * grass, and siding more reliably on exteriors than Flux 2 Pro did.
 * Renaming the file would require updating ~20 imports — not worth the
 * friction for a cosmetic change.
 *
 * Exteriors and interiors use separate prompts because cleanup models
 * hallucinate architecture when given a generic "keep as-is" instruction
 * on exteriors — the open canvas (grass, siding, sky, roof) gives them
 * too much room to repaint. Interior prompt is narrower so it survives
 * with less scaffolding.
 *
 * Exteriors also route through Clarity Upscaler (detail-adding SD-based
 * upscale). Interiors use Real-ESRGAN (fast, flat, cheap). The
 * isExterior flag sent in the POST body drives the upscaler branch on
 * the backend.
 */

import { resizeForUpload } from '../utils/resizeForUpload';

// Vercel's body limit is ~4.5 MB; 1280 edge keeps us safely under.
const FLUX_UPLOAD_MAX_EDGE = 1280;

// Room types that are outdoor / architecturally open-ended. These need a
// much stricter preservation prompt because cleanup models will happily
// regenerate grass, siding, roofs, landscaping, and sky if given "remove
// clutter" latitude. Also drives the upscaler branch: exteriors get
// Clarity for detail-adding upscale, interiors get Real-ESRGAN for speed.
const EXTERIOR_ROOMS = new Set<string>(['Exterior', 'Patio']);

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

  let targets: string;
  if (filter === 'personal') {
    targets = 'personal items, toiletries, family photos, medication, mail with names, phone chargers, and any identifying personal belongings';
  } else if (filter === 'surfaces') {
    targets = 'all items sitting on counters, tables, shelves, and other flat surfaces — leave floor items and furniture as-is';
  } else {
    targets = clutterList;
  }

  let prompt = `Remove the following from this ${room}: ${targets}.

Also remove any item that clearly does not belong in a ${room} — for example, laundry baskets in a dining room, exercise equipment in a living room, pet bowls in a bedroom, or shoes in a kitchen. If it looks out of place for this room type, remove it.`;

  if (custom) {
    prompt += `\n\nADDITIONALLY, specifically remove: ${custom}.`;
  }

  prompt += `\n\nKeep all furniture, built-in fixtures, and architecture exactly as-is. Do not add anything. Reconstruct revealed surfaces from surrounding pixels. This is a photo-restoration task, not a styling task.`;

  return prompt;
};

const EXTERIOR_CLEANUP_PROMPT = (room: string, custom?: string) => {
  let prompt = `Remove only movable clutter from this ${room}: construction debris, tools, ladders, hoses, trash cans, personal yard items, for-sale signs, temporary objects, vehicles in driveway, portable furniture, kids' outdoor toys, pet items, and seasonal decorations. Leave everything else pixel-identical.`;

  if (custom) {
    prompt += `\n\nADDITIONALLY, specifically remove: ${custom}.`;
  }

  prompt += `

PRESERVE EXACTLY (must not change):
- The house: structure, siding material, siding color, trim, windows (count, position, size, mullions), doors, roof shape, roof pitch, roof material, chimney, gutters, eaves, porch, railings.
- The land: driveway, walkways, hardscape, retaining walls, fences, mailbox.
- The landscaping: grass color and texture, existing trees, existing shrubs, existing flower beds, mulch lines.
- Camera: exact framing, angle, field of view, perspective.
- Lighting: time of day, sun angle, shadow direction, sky conditions.

DO NOT:
- Repaint grass (no "healthier" or "greener" regeneration).
- Smooth, re-stucco, or re-texture siding.
- Re-roof or re-shingle.
- Add trees, shrubs, flowers, decorative rocks, or landscaping elements that are not in the input.
- Change the sky, clouds, or time of day.
- Change window glass tint, reflections, or frame color.

Output the input photograph with ONLY the listed clutter items erased and the revealed background reconstructed from surrounding pixels. Treat this as a photo-restoration task, not a styling task.`;

  return prompt;
};

export function buildCleanupPrompt(
  selectedRoom: string,
  filter?: string,
  customRemoval?: string,
): string {
  const room = (selectedRoom || '').trim();
  const custom = (customRemoval || '').trim() || undefined;
  if (EXTERIOR_ROOMS.has(room)) return EXTERIOR_CLEANUP_PROMPT(room, custom);
  return INTERIOR_CLEANUP_PROMPT(room || 'room', filter, custom);
}

export function isExteriorRoom(selectedRoom: string): boolean {
  return EXTERIOR_ROOMS.has((selectedRoom || '').trim());
}

export interface FluxCleanupResult {
  resultBase64: string;
  latencyMs: number;
}

export interface FluxCleanupOptions {
  skipUpscale?: boolean;
  customPrompt?: string;
  /** Declutter filter: 'full' (default), 'personal', or 'surfaces'. */
  filter?: string;
  /** User-typed specific items to remove (appended to room prompt). */
  customRemoval?: string;
}

export async function fluxCleanup(
  imageBase64: string,
  selectedRoom: string,
  abortSignal?: AbortSignal,
  options: FluxCleanupOptions = {},
): Promise<FluxCleanupResult> {
  const shrunk = await resizeForUpload(imageBase64, FLUX_UPLOAD_MAX_EDGE);
  const isExterior = isExteriorRoom(selectedRoom);
  const prompt = options.customPrompt
    || buildCleanupPrompt(selectedRoom, options.filter, options.customRemoval);
  const res = await fetch('/api/flux-cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: shrunk,
      prompt,
      skipUpscale: Boolean(options.skipUpscale),
      isExterior,
    }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`flux-cleanup HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'flux-cleanup failed');
  const upscalerLabel = isExterior ? 'Clarity' : 'Pruna';
  console.log(`[fluxService] Nano Banana+${upscalerLabel} done in ${data.latencyMs}ms (${selectedRoom})`);
  return {
    resultBase64: data.resultBase64,
    latencyMs: data.latencyMs,
  };
}
