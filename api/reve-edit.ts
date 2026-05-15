/**
 * api/reve-edit.ts  —  Generic image editing via reve/edit
 *
 * Used for whiten (white balance correction) and lawn (landscaping
 * enhancement). Both are instruction-following edit tasks that don't
 * need full image regeneration — reve/edit preserves the input well.
 *
 * Upscale branch mirrors flux-cleanup:
 *   - isExterior=true  → Clarity (with Pruna OOM fallback)
 *   - isExterior=false → Pruna
 *
 * Input (POST JSON):
 *   { imageBase64: string, prompt: string, isExterior?: boolean, skipUpscale?: boolean }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
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

async function runPruna(replicate: Replicate, imageUrl: string): Promise<string | null> {
  try {
    const out = await replicate.run('prunaai/p-image-upscale', {
      input: {
        image: imageUrl,
        factor: 2,
        target: 5,
        upscale_mode: 'factor',
        output_format: 'jpg',
        output_quality: 95,
        enhance_details: true,
        enhance_realism: false,
      },
    });
    return extractUrl(out);
  } catch (err: any) {
    console.warn(`[reve-edit] Pruna failed: ${err?.message}`);
    return null;
  }
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
  const isExterior = Boolean(body.isExterior);
  const skipUpscale = Boolean(body.skipUpscale);

  if (!imageBase64) { json(res, 400, { ok: false, error: 'imageBase64 is required' }); return; }
  if (!prompt) { json(res, 400, { ok: false, error: 'prompt is required' }); return; }

  const dataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    console.log(`[reve-edit] Starting reve/edit (${isExterior ? 'exterior' : 'interior'})...`);
    const output = await replicate.run('reve/edit', {
      input: {
        image: dataUrl,
        prompt,
        output_format: 'jpg',
      },
    });

    const editUrl = await extractUrl(output);
    if (!editUrl) {
      json(res, 200, { ok: false, error: 'reve/edit returned no image URL' });
      return;
    }
    console.log(`[reve-edit] reve done in ${Date.now() - t0}ms`);

    // Pruna 2x with enhance_realism:false for both interior and exterior.
    // (See flux-cleanup.ts for the rationale on dropping Clarity from exteriors.)
    let finalUrl = editUrl;
    let upscalerUsed = 'none';

    if (!skipUpscale) {
      const tUp = Date.now();
      const upUrl = await runPruna(replicate, editUrl);
      if (upUrl) {
        finalUrl = upUrl;
        upscalerUsed = 'Pruna';
        console.log(`[reve-edit] Pruna upscaled in ${Date.now() - tUp}ms (${isExterior ? 'exterior' : 'interior'})`);
      }
    }

    const imgRes = await fetch(finalUrl);
    if (!imgRes.ok) {
      json(res, 200, { ok: false, error: `result fetch ${imgRes.status}` });
      return;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const resultBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;

    console.log(`[reve-edit] Total: ${Date.now() - t0}ms (upscaler: ${upscalerUsed})`);
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });

  } catch (err: any) {
    console.error('[reve-edit] unhandled:', err?.message || err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
