/**
 * api/flux-cleanup.ts
 *
 * Smart Cleanup via Replicate.
 *
 * Pipeline:
 *   1. google/nano-banana (Gemini 2.5 Flash Image) — does the actual
 *      clutter removal while preserving architecture.
 *   2. Upscaler, branched by isExterior flag from client:
 *      - Exterior / Patio  →  philz1337x/clarity-upscaler (SD + ControlNet
 *        tile + 4x-UltraSharp, ~14s, ~$0.05). Detail-adding upscale that
 *        matters for siding textures, shingles, landscaping.
 *      - Interior          →  nightmareai/real-esrgan (~8s, ~$0.002).
 *        Fast pixel-stretch upscale, fine for indoor clean surfaces.
 *
 * Input (POST JSON):
 *   { imageBase64: string, prompt: string, isExterior?: boolean, skipUpscale?: boolean }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 *
 * Cost:
 *   - Exterior: Nano Banana $0.04 + Clarity $0.05 = ~$0.09/img
 *   - Interior: Nano Banana $0.04 + ESRGAN $0.002 = ~$0.042/img
 *
 * Historical note: Model Lab evaluations on 2026-04-24:
 *   Cleanup engine: flux-2-pro vs flux-kontext-pro vs nano-banana
 *     → Nano Banana won (preserves exteriors cleanest)
 *   Upscaler: ESRGAN (fast, flat) vs Clarity (slow, sharper)
 *     → Clarity won on exteriors; ESRGAN kept for interiors.
 */
import Replicate from 'replicate';
import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs', maxDuration: 120 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';

async function extractUrl(output: unknown): Promise<string | null> {
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return extractUrl(output[0]);
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>;
    if (typeof o.url === 'function') {
      try { const u = (o.url as () => unknown)(); return typeof u === 'string' ? u : String(u); } catch { return null; }
    }
    if (typeof o.url === 'string') return o.url;
  }
  return null;
}

export default async function handler(req: any, res: any) {
  setCors(res, 'POST,OPTIONS');
  if (handleOptions(req, res)) return;
  if (rejectMethod(req, res, 'POST')) return;

  if (!REPLICATE_TOKEN) {
    json(res, 200, { ok: false, error: 'REPLICATE_API_TOKEN not configured' });
    return;
  }

  const body = parseBody(req.body);
  const imageBase64 = String(body.imageBase64 || '');
  const prompt = String(body.prompt || '');
  const skipUpscale = Boolean(body.skipUpscale);
  const isExterior = Boolean(body.isExterior);

  if (!imageBase64) { json(res, 400, { ok: false, error: 'imageBase64 is required' }); return; }
  if (!prompt) { json(res, 400, { ok: false, error: 'prompt is required' }); return; }

  const dataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    // --- Step 1: Google Nano Banana cleanup ----------------------------
    // Replicate SDK uploads the data URI to temp storage and passes the
    // resulting HTTPS URL to the model. Nano Banana's input field is
    // `image_input` (array), not `input_images` like Flux.
    console.log(`[flux-cleanup] Starting Google Nano Banana... (${isExterior ? 'exterior' : 'interior'})`);
    const nbOutput = await replicate.run('google/nano-banana', {
      input: {
        image_input: [dataUrl],
        prompt,
        output_format: 'jpg',
      },
    });

    const cleanUrl = await extractUrl(nbOutput);
    if (!cleanUrl) {
      json(res, 200, { ok: false, error: 'Nano Banana returned no image URL' });
      return;
    }
    console.log(`[flux-cleanup] Nano Banana done in ${Date.now() - t0}ms → ${cleanUrl.slice(0, 60)}...`);

    // --- Step 2 (optional): Upscale branch -----------------------------
    // Exteriors → Clarity (detail-adding). Interiors → Real-ESRGAN (fast).
    let finalUrl = cleanUrl;
    if (!skipUpscale) {
      const tUp = Date.now();
      if (isExterior) {
        // Clarity Upscaler for exteriors.
        // Runs juggernaut_reborn + ControlNet tile (control_v11f1e_sd15_tile)
        // + 4x-UltraSharp + DPM++ 3M SDE Karras. Generates real photographic
        // detail through SD diffusion instead of just interpolating pixels.
        // scale_factor: 2 (not 4) — Clarity adds detail per pixel, so 2x
        // from 1280px source lands at ~2560px which is plenty for MLS.
        try {
          const clarityOutput = await replicate.run('philz1337x/clarity-upscaler', {
            input: {
              image: cleanUrl,
              scale_factor: 2,
            },
          });
          const upscaledUrl = await extractUrl(clarityOutput);
          if (upscaledUrl) {
            finalUrl = upscaledUrl;
            console.log(`[flux-cleanup] Clarity upscaled in ${Date.now() - tUp}ms (exterior path)`);
          } else {
            console.warn('[flux-cleanup] Clarity no URL — using un-upscaled');
          }
        } catch (upErr: any) {
          console.warn(`[flux-cleanup] Clarity failed: ${upErr?.message} — using un-upscaled`);
        }
      } else {
        // Real-ESRGAN 4x for interiors. Fast (~8s), flat upscale.
        // Indoor scenes (clean surfaces, less fine texture) don't need
        // Clarity's detail-adding pass and don't justify its $0.05 cost.
        try {
          const esrOutput = await replicate.run('nightmareai/real-esrgan', {
            input: { image: cleanUrl, scale: 4, face_enhance: false },
          });
          const upscaledUrl = await extractUrl(esrOutput);
          if (upscaledUrl) {
            finalUrl = upscaledUrl;
            console.log(`[flux-cleanup] ESRGAN upscaled in ${Date.now() - tUp}ms (interior path)`);
          } else {
            console.warn('[flux-cleanup] ESRGAN no URL — using un-upscaled');
          }
        } catch (upErr: any) {
          console.warn(`[flux-cleanup] ESRGAN failed: ${upErr?.message} — using un-upscaled`);
        }
      }
    }

    // --- Step 3: Fetch final URL and return base64 ---------------------
    const imgRes = await fetch(finalUrl);
    if (!imgRes.ok) {
      json(res, 200, { ok: false, error: `result fetch ${imgRes.status}` });
      return;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const resultBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;

    const upscalerUsed = skipUpscale ? 'none' : (isExterior ? 'Clarity' : 'ESRGAN');
    console.log(`[flux-cleanup] Total: ${Date.now() - t0}ms (Nano Banana + ${upscalerUsed})`);
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });

  } catch (err: any) {
    console.error('[flux-cleanup] unhandled:', err?.message || err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
