/**
 * services/fluxService.ts
 *
 * Client wrapper for Flux 2 Pro. This is the cleanup engine for
 * Smart Cleanup. Exteriors and interiors now use separate prompts because
 * Flux 2 Pro hallucinates architecture when given a generic "keep as-is"
 * instruction on exteriors — the open canvas (grass, siding, sky, roof)
 * gives it too much room to repaint. Interior prompt stayed narrow by accident.
 */

import { resizeForUpload } from '../utils/resizeForUpload';

// Vercel's body limit is ~4.5 MB; 1280 edge keeps us safely under.
const FLUX_UPLOAD_MAX_EDGE = 1280;

// Room types that are outdoor / architecturally open-ended. These need a
// much stricter preservation prompt because Flux 2 Pro will happily regenerate
// grass, siding, roofs, landscaping, and sky if given "remove clutter" latitude.
const EXTERIOR_ROOMS = new Set<string>(['Exterior', 'Patio']);

// Interior prompt — what worked in production before the exterior regression.
const INTERIOR_CLEANUP_PROMPT = (room: string) =>
  `Remove all clutter, personal items, and temporary objects from this ${room}. Keep all furniture and architecture exactly as-is. Do not add anything.`;

// Exterior prompt — surgical. Every line is a preservation guardrail because
// Flux 2 Pro treats unconstrained surface area as creative license.
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

export interface FluxCleanupResult {
  resultBase64: string;
  latencyMs: number;
}

export interface FluxCleanupOptions {
  /** When true, skip the server-side Real-ESRGAN 4x finalization. */
  skipUpscale?: boolean;
  /** Override the default cleanup prompt (used by Design Direction toggle). */
  customPrompt?: string;
}

/**
 * Run Flux 2 Pro cleanup on a room photo. Server chains a silent
 * Real-ESRGAN 4x finalization unless `options.skipUpscale === true`.
 * Prompt is selected from INTERIOR_CLEANUP_PROMPT vs EXTERIOR_CLEANUP_PROMPT
 * based on selectedRoom — exteriors get heavy preservation language because
 * Flux 2 Pro overfits on open-canvas scenes otherwise.
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
      prompt: options.customPrompt || buildCleanupPrompt(selectedRoom),
      skipUpscale: Boolean(options.skipUpscale),
    }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`flux-cleanup HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'flux-cleanup failed');
  console.log(`[fluxService] Flux+ESRGAN done in ${data.latencyMs}ms (${selectedRoom})`);
  return {
    resultBase64: data.resultBase64,
    latencyMs: data.latencyMs,
  };
}
