/**
 * api/flux-cleanup.ts
 *
 * Smart Cleanup via Replicate. Model switched from Flux 2 Pro to Google
 * Nano Banana (Gemini 2.5 Flash Image) for stronger architectural
 * preservation. Chains Real-ESRGAN 4x for final resolution unless
 * skipUpscale is set.
 *
 * Input (POST JSON):
 *   { imageBase64: string, prompt: string, skipUpscale?: boolean }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 *
 * Historical note: we evaluated flux-2-pro, flux-kontext-pro, and
 * google/nano-banana in the Model Lab. Nano Banana was the cleanest on
 * exteriors — preserves grass, siding, and architecture better than
 * Flux 2 Pro on open-canvas scenes. Similar cost (~$0.04/img), similar
 * or faster latency.
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

    // --- Step 2 (optional): Real-ESRGAN 4x upscale ---------------------
    let finalUrl = cleanUrl;
    if (!skipUpscale) {
      const tEsr = Date.now();
      try {
        const esrOutput = await replicate.run('nightmareai/real-esrgan', {
          input: { image: cleanUrl, scale: 4, face_enhance: false },
        });
        const upscaledUrl = await extractUrl(esrOutput);
        if (upscaledUrl) {
          finalUrl = upscaledUrl;
          console.log(`[flux-cleanup] Upscaled in ${Date.now() - tEsr}ms`);
        } else {
          console.warn('[flux-cleanup] ESRGAN no URL — using un-upscaled');
        }
      } catch (esrErr: any) {
        console.warn(`[flux-cleanup] ESRGAN failed: ${esrErr?.message} — using un-upscaled`);
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

    console.log(`[flux-cleanup] Total: ${Date.now() - t0}ms`);
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });

  } catch (err: any) {
    console.error('[flux-cleanup] unhandled:', err?.message || err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
