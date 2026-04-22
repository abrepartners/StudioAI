/**
 * api/flux-cleanup.ts
 *
 * Server-side proxy to Replicate's Flux Kontext Pro for Smart Cleanup.
 * Replaces the Gemini + SAM pipeline — Flux Kontext has native framing-lock
 * and does text-only cleanup without hallucinating new objects (the reason
 * SAM existed was to contain Gemini's "remove a painting you didn't ask
 * for" instincts).
 *
 * Input (POST JSON):   { imageBase64: string, prompt: string }
 *   imageBase64 can be a raw base64 string or a data URL.
 *
 * Output (200 JSON):   { ok: true, resultBase64: string, latencyMs: number }
 * Output (200 JSON):   { ok: false, error: string }  — caller handles fallback
 *
 * Pricing reference: ~$0.04 per prediction as of 2026-04-22.
 */
import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const FLUX_MODEL = 'black-forest-labs/flux-kontext-pro';

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
  const prompt = String(body.prompt || '');
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
    const predict = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=55',
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

    if (!predict.ok) {
      const text = await predict.text();
      console.warn(`[flux-cleanup] Replicate ${predict.status}: ${text.slice(0, 200)}`);
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
      console.warn(`[flux-cleanup] status=${final.status} error=${final.error}`);
      json(res, 200, { ok: false, error: final.error || `status: ${final.status}` });
      return;
    }

    const resultUrl = await extractUrl(final.output);
    if (!resultUrl) {
      json(res, 200, { ok: false, error: 'Flux returned no image URL' });
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
    console.error('[flux-cleanup] unhandled:', err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
