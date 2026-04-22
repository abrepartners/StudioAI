/**
 * api/flux-cleanup.ts
 *
 * Server-side proxy to Replicate for Smart Cleanup. Runs two models in
 * sequence on the same Function invocation:
 *   1) black-forest-labs/flux-kontext-pro  — text-driven declutter
 *   2) nightmareai/real-esrgan             — silent 4x finalization
 *
 * Consolidated into one endpoint so the deploy fits the Vercel Hobby
 * function count limit (12). Chaining server-side also saves a client
 * round-trip and keeps the upscale gated behind `skipUpscale` for
 * batch paths that don't need it.
 *
 * Input (POST JSON):
 *   { imageBase64: string, prompt: string, skipUpscale?: boolean }
 *     imageBase64 can be raw base64 or a data URL.
 *     skipUpscale defaults to false — set true from batch/listing-kit
 *     paths where the output is about to be resized down anyway.
 *
 * Output (200 JSON):   { ok: true, resultBase64: string, latencyMs: number }
 * Output (200 JSON):   { ok: false, error: string }  — caller falls back
 *
 * Pricing reference: ~$0.04 Flux + ~$0.002 Real-ESRGAN per call.
 */
import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const FLUX_MODEL = 'black-forest-labs/flux-kontext-pro';
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

async function waitForReplicate(startResponse: any): Promise<any> {
  let final: any = startResponse;
  while (final.status === 'starting' || final.status === 'processing') {
    await new Promise((r) => setTimeout(r, 1500));
    const pollRes = await fetch(final.urls.get, {
      headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` },
    });
    final = await pollRes.json();
  }
  return final;
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
  if (!imageBase64) {
    json(res, 400, { ok: false, error: 'imageBase64 is required' });
    return;
  }
  if (!prompt) {
    json(res, 400, { ok: false, error: 'prompt is required' });
    return;
  }

  const dataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const t0 = Date.now();
  try {
    // --- Step 1: Flux Kontext cleanup -------------------------------------
    const fluxStart = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=40',
      },
      body: JSON.stringify({
        model: FLUX_MODEL,
        input: {
          input_image: dataUrl,
          prompt,
          output_format: 'jpg',
          safety_tolerance: 2,
        },
      }),
    });
    if (!fluxStart.ok) {
      const text = await fluxStart.text();
      console.warn(`[flux-cleanup] Flux ${fluxStart.status}: ${text.slice(0, 200)}`);
      json(res, 200, { ok: false, error: `Flux ${fluxStart.status}` });
      return;
    }
    const fluxFinal = await waitForReplicate(await fluxStart.json());
    if (fluxFinal.status !== 'succeeded' || !fluxFinal.output) {
      console.warn(`[flux-cleanup] flux status=${fluxFinal.status} error=${fluxFinal.error}`);
      json(res, 200, { ok: false, error: fluxFinal.error || `flux status: ${fluxFinal.status}` });
      return;
    }
    const cleanUrl = await extractUrl(fluxFinal.output);
    if (!cleanUrl) {
      json(res, 200, { ok: false, error: 'Flux returned no image URL' });
      return;
    }
    const fluxMs = Date.now() - t0;
    console.log(`[flux-cleanup] Flux done in ${fluxMs}ms`);

    // --- Step 2 (optional): Real-ESRGAN 4x upscale ------------------------
    let finalUrl = cleanUrl;
    if (!skipUpscale) {
      const tUpscale = Date.now();
      const esrStart = await fetch(
        `https://api.replicate.com/v1/models/${REAL_ESRGAN_MODEL}/predictions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${REPLICATE_TOKEN}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait=15',
          },
          body: JSON.stringify({
            input: {
              image: cleanUrl,
              scale: 4,
              face_enhance: false,
            },
          }),
        },
      );
      if (!esrStart.ok) {
        const text = await esrStart.text();
        console.warn(`[flux-cleanup] ESRGAN ${esrStart.status}: ${text.slice(0, 200)} — using un-upscaled`);
      } else {
        const esrFinal = await waitForReplicate(await esrStart.json());
        if (esrFinal.status === 'succeeded' && esrFinal.output) {
          const upscaledUrl = await extractUrl(esrFinal.output);
          if (upscaledUrl) {
            finalUrl = upscaledUrl;
            console.log(`[flux-cleanup] Upscaled in ${Date.now() - tUpscale}ms`);
          } else {
            console.warn('[flux-cleanup] ESRGAN returned no URL — using un-upscaled');
          }
        } else {
          console.warn(`[flux-cleanup] ESRGAN status=${esrFinal.status} error=${esrFinal.error} — using un-upscaled`);
        }
      }
    }

    // --- Step 3: Fetch final URL and return base64 ------------------------
    const imgRes = await fetch(finalUrl);
    if (!imgRes.ok) {
      json(res, 200, { ok: false, error: `result fetch ${imgRes.status}` });
      return;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const resultBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;

    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });
  } catch (err: any) {
    console.error('[flux-cleanup] unhandled:', err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
