/**
 * api/upscale.ts — Standalone upscale endpoint
 *
 * Deferred upscale step, called on export instead of inline during editing.
 * Routes to the appropriate upscaler based on isExterior flag:
 *   - Interior  →  prunaai/p-image-upscale  (<1s, $0.005)
 *   - Exterior  →  philz1337x/clarity-upscaler (~14s, ~$0.012)
 *   - Clarity OOM fallback → Pruna
 *
 * Input (POST JSON):
 *   { imageBase64: string, isExterior?: boolean }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 */
import Replicate from 'replicate';
import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs', maxDuration: 120 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';

function isOomError(msg: string | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes('cuda out of memory') ||
    m.includes('outofmemoryerror') ||
    m.includes('out of memory') ||
    m.includes('cuda_error_out_of_memory')
  );
}

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
        factor: 4,
        target: 5,
        upscale_mode: 'factor',
        output_format: 'jpg',
        output_quality: 100,
        enhance_details: false,
        enhance_realism: true,
      },
    });
    return await extractUrl(out);
  } catch (err: any) {
    console.warn(`[upscale] Pruna failed: ${err?.message}`);
    return null;
  }
}

const CLARITY_SAFE_BYTES = 400 * 1024;

async function runClarity(replicate: Replicate, imageUrl: string, inputBytes: number): Promise<string | null> {
  const safeScale = inputBytes > CLARITY_SAFE_BYTES ? 1.5 : 2;
  const out = await replicate.run('philz1337x/clarity-upscaler', {
    input: {
      image: imageUrl,
      scale_factor: safeScale,
      num_inference_steps: 18,
      dynamic: 6,
      creativity: 0.35,
      resemblance: 2,
      prompt: 'masterpiece, best quality, highres, <lora:more_details:0.5> <lora:SDXLrender_v2.0:1>',
      negative_prompt: '(worst quality, low quality, normal quality:2) JuggernautNegative-neg',
      scheduler: 'DPM++ 3M SDE Karras',
      sd_model: 'juggernaut_reborn.safetensors [338b85bc4f]',
      tiling_width: 112,
      tiling_height: 144,
      output_format: 'jpg',
      sharpen: 0,
      handfix: 'disabled',
    },
  });
  return await extractUrl(out);
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
  const isExterior = Boolean(body.isExterior);

  if (!imageBase64) { json(res, 400, { ok: false, error: 'imageBase64 is required' }); return; }

  const dataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    // Probe input size for Clarity scale_factor decision
    let inputBytes = 0;
    try {
      inputBytes = Math.round(dataUrl.length * 0.75);
    } catch { /* non-fatal */ }

    let finalUrl: string | null = null;
    let upscalerUsed = 'none';

    if (isExterior) {
      let clarityError: string | undefined;
      try {
        finalUrl = await runClarity(replicate, dataUrl, inputBytes);
        if (finalUrl) {
          upscalerUsed = 'Clarity';
        } else {
          clarityError = 'no URL returned';
        }
      } catch (err: any) {
        clarityError = err?.message || 'unknown';
      }

      if (clarityError) {
        const wasOom = isOomError(clarityError);
        console.warn(`[upscale] Clarity ${wasOom ? 'OOM' : 'failed'}: ${clarityError} — falling back to Pruna`);
        finalUrl = await runPruna(replicate, dataUrl);
        if (finalUrl) upscalerUsed = 'Pruna (fallback)';
      }
    } else {
      finalUrl = await runPruna(replicate, dataUrl);
      if (finalUrl) upscalerUsed = 'Pruna';
    }

    if (!finalUrl) {
      json(res, 200, { ok: false, error: 'All upscalers failed' });
      return;
    }

    const imgRes = await fetch(finalUrl);
    if (!imgRes.ok) {
      json(res, 200, { ok: false, error: `result fetch ${imgRes.status}` });
      return;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const resultBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;

    console.log(`[upscale] Done in ${Date.now() - t0}ms (${upscalerUsed})`);
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });

  } catch (err: any) {
    console.error('[upscale] unhandled:', err?.message || err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
