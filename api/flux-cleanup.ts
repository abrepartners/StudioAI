/**
 * api/flux-cleanup.ts
 *
 * Smart Cleanup via Replicate: Flux 2 Pro → Real-ESRGAN 4x.
 *
 * Uses the Replicate Node SDK (already in package.json) instead of raw
 * fetch, because Flux's input_images field only accepts HTTPS URLs — not
 * data URIs. The SDK transparently uploads the data URI to Replicate's
 * temp file storage and passes the resulting URL.
 *
 * Input (POST JSON):
 *   { imageBase64: string, prompt: string, skipUpscale?: boolean }
 *
 * Output (200 JSON):   { ok: true, resultBase64: string, latencyMs: number }
 * Output (200 JSON):   { ok: false, error: string }
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
    // --- Step 1: Flux 2 Pro cleanup ------------------------------------------
    // SDK auto-uploads the data URI to Replicate's temp storage and passes
    // the resulting HTTPS URL — this is the fix for the 422 schema error.
    console.log('[flux-cleanup] Starting Flux 2 Pro...');
    const fluxOutput = await replicate.run('black-forest-labs/flux-2-pro', {
      input: {
        input_images: [dataUrl],
        prompt,
        output_format: 'jpg',
        aspect_ratio: 'match_input_image',
      },
    });

    const cleanUrl = await extractUrl(fluxOutput);
    if (!cleanUrl) {
      json(res, 200, { ok: false, error: 'Flux returned no image URL' });
      return;
    }
    console.log(`[flux-cleanup] Flux done in ${Date.now() - t0}ms → ${cleanUrl.slice(0, 60)}...`);

    // --- Step 2 (optional): Real-ESRGAN 4x upscale -------------------------
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

    // --- Step 3: Fetch final URL and return base64 -------------------------
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
