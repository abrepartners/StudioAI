/**
 * api/upscale.ts
 *
 * Silent 4x finalization pass via Real-ESRGAN. Chains after Flux Kontext
 * cleanup so the MLS/social export path receives a sharper image without
 * a second user-facing step. Own endpoint (not bolted onto flux-cleanup)
 * so future callers can upscale any source, not just post-Flux output.
 *
 * Input (POST JSON):   { imageBase64: string }
 *   imageBase64 can be a raw base64 string or a data URL.
 *
 * Output (200 JSON):   { ok: true, resultBase64: string, latencyMs: number }
 * Output (200 JSON):   { ok: false, error: string }  — caller falls back
 *                                                      to the un-upscaled image
 *
 * Pricing reference: ~$0.002 per prediction as of 2026-04-22.
 */
import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const REAL_ESRGAN_MODEL = 'nightmareai/real-esrgan';

async function extractUrl(output: any): Promise<string | null> {
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return extractUrl(output[0]);
  if (typeof output.url === 'function') {
    try {
      const u = output.url();
      return typeof u === 'string' ? u : String(u);
    } catch {
      return null;
    }
  }
  if (typeof output.url === 'string') return output.url;
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
  if (!imageBase64) {
    json(res, 400, { ok: false, error: 'imageBase64 is required' });
    return;
  }

  const dataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const t0 = Date.now();
  try {
    const predict = await fetch(
      `https://api.replicate.com/v1/models/${REAL_ESRGAN_MODEL}/predictions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${REPLICATE_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait=55',
        },
        body: JSON.stringify({
          input: {
            image: dataUrl,
            scale: 4,
            face_enhance: false,
          },
        }),
      },
    );

    if (!predict.ok) {
      const text = await predict.text();
      console.warn(`[upscale] Replicate ${predict.status}: ${text.slice(0, 200)}`);
      json(res, 200, { ok: false, error: `Replicate ${predict.status}` });
      return;
    }

    let final: any = await predict.json();
    while (final.status === 'starting' || final.status === 'processing') {
      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await fetch(final.urls.get, {
        headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` },
      });
      final = await pollRes.json();
    }
    if (final.status !== 'succeeded' || !final.output) {
      console.warn(`[upscale] status=${final.status} error=${final.error}`);
      json(res, 200, { ok: false, error: final.error || `status: ${final.status}` });
      return;
    }

    const resultUrl = await extractUrl(final.output);
    if (!resultUrl) {
      json(res, 200, { ok: false, error: 'Real-ESRGAN returned no image URL' });
      return;
    }
    const imgRes = await fetch(resultUrl);
    if (!imgRes.ok) {
      json(res, 200, { ok: false, error: `result fetch ${imgRes.status}` });
      return;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const resultBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;

    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });
  } catch (err: any) {
    console.error('[upscale] unhandled:', err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
