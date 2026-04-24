/**
 * api/flux-cleanup.ts
 *
 * Smart Cleanup via Replicate.
 *
 * Pipeline:
 *   1. google/nano-banana (Gemini 2.5 Flash Image) — does the actual
 *      clutter removal while preserving architecture.
 *   2. philz1337x/clarity-upscaler — upscales with juggernaut_reborn +
 *      ControlNet tile + 4x-UltraSharp + DPM++ 3M SDE Karras to add
 *      real photographic detail (not just pixel stretch).
 *
 * Input (POST JSON):
 *   { imageBase64: string, prompt: string, skipUpscale?: boolean }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 *
 * Cost: Nano Banana ~$0.04 + Clarity ~$0.05 = ~$0.09/img.
 * Latency: ~20-25s (Nano Banana) + ~14s (Clarity) = ~35-40s end-to-end.
 *
 * Historical note: we evaluated flux-2-pro, flux-kontext-pro, and
 * google/nano-banana in the Model Lab. Nano Banana won cleanup
 * (2026-04-24). Upscaler evaluated: Real-ESRGAN (fast, flat) vs
 * Clarity Upscaler (slower, sharper). Clarity won on real estate
 * interiors (2026-04-24).
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
    console.log('[flux-cleanup] Starting Google Nano Banana...');
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

    // --- Step 2 (optional): Clarity Upscaler ---------------------------
    // philz1337x/clarity-upscaler: SD-based detail-adding upscaler.
    // Runs juggernaut_reborn + ControlNet tile (control_v11f1e_sd15_tile)
    // + 4x-UltraSharp + DPM++ 3M SDE Karras. Unlike ESRGAN which just
    // does pixel interpolation, Clarity actually generates new detail
    // through the SD diffusion pass — textures, edges, materials all
    // read sharper. Cost ~$0.05 vs ESRGAN's $0.002 but quality jump is
    // worth it for cleanup where fidelity matters most.
    //
    // scale_factor: 2 (not 4) — Clarity adds detail per pixel, so 2x
    // from 1280px source lands at ~2560px which is plenty for MLS.
    // All other params use Clarity's defaults (creativity 0.35,
    // resemblance 0.6, 18 inference steps) which match the playground
    // config Thomas validated.
    let finalUrl = cleanUrl;
    if (!skipUpscale) {
      const tUp = Date.now();
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
          console.log(`[flux-cleanup] Clarity upscaled in ${Date.now() - tUp}ms`);
        } else {
          console.warn('[flux-cleanup] Clarity no URL — using un-upscaled');
        }
      } catch (upErr: any) {
        console.warn(`[flux-cleanup] Clarity failed: ${upErr?.message} — using un-upscaled`);
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

    console.log(`[flux-cleanup] Total: ${Date.now() - t0}ms (Nano Banana + Clarity)`);
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });

  } catch (err: any) {
    console.error('[flux-cleanup] unhandled:', err?.message || err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
