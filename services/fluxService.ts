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

// Interior prompt — short and narrow. Works because interiors have less
// open canvas for the model to hallucinate into.
const INTERIOR_CLEANUP_PROMPT = (room: string) =>
  `Remove all clutter, personal items, and temporary objects from this ${room}. Keep all furniture and architecture exactly as-is. Do not add anything.`;

// Exterior prompt — surgical. Every line is a preservation guardrail
// because exterior scenes have too much unconstrained surface area.
const EXTERIOR_CLEANUP_PROMPT = (room: string) =>
  `Remove only movable clutter from this ${room}: construction debris, tools, ladders, hoses, trash cans, personal yard items, for-sale signs, and temporary objects. Leave everything else pixel-identical.

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

export function buildCleanupPrompt(selectedRoom: string): string {
  const room = (selectedRoom || '').trim();
  if (EXTERIOR_ROOMS.has(room)) return EXTERIOR_CLEANUP_PROMPT(room);
  return INTERIOR_CLEANUP_PROMPT(room || 'room');
}

export function isExteriorRoom(selectedRoom: string): boolean {
  return EXTERIOR_ROOMS.has((selectedRoom || '').trim());
}

export interface FluxCleanupResult {
  resultBase64: string;
  latencyMs: number;
}

export interface FluxCleanupOptions {
  /** When true, skip the server-side upscale finalization. */
  skipUpscale?: boolean;
  /** Override the default cleanup prompt (used by Design Direction toggle). */
  customPrompt?: string;
}

/**
 * Run the Smart Cleanup pipeline on a room photo. Server calls
 * google/nano-banana and then chains an upscaler unless
 * `options.skipUpscale === true`.
 *
 * Upscaler routing (server-side, driven by isExterior flag below):
 *   - Exterior / Patio  →  philz1337x/clarity-upscaler  (~14s, $0.05)
 *   - Everything else    →  nightmareai/real-esrgan       (~8s,  $0.002)
 *
 * Prompt is selected from INTERIOR_CLEANUP_PROMPT vs
 * EXTERIOR_CLEANUP_PROMPT based on selectedRoom — exteriors get heavier
 * preservation language because cleanup models overfit on open-canvas
 * scenes otherwise.
 */
export async function fluxCleanup(
  imageBase64: string,
  selectedRoom: string,
  abortSignal?: AbortSignal,
  options: FluxCleanupOptions = {},
): Promise<FluxCleanupResult> {
  const shrunk = await resizeForUpload(imageBase64, FLUX_UPLOAD_MAX_EDGE);
  const isExterior = isExteriorRoom(selectedRoom);
  const res = await fetch('/api/flux-cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: shrunk,
      prompt: options.customPrompt || buildCleanupPrompt(selectedRoom),
      skipUpscale: Boolean(options.skipUpscale),
      isExterior,
    }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`flux-cleanup HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'flux-cleanup failed');
  const upscalerLabel = isExterior ? 'Clarity' : 'ESRGAN';
  console.log(`[fluxService] Nano Banana+${upscalerLabel} done in ${data.latencyMs}ms (${selectedRoom})`);
  return {
    resultBase64: data.resultBase64,
    latencyMs: data.latencyMs,
  };
}
