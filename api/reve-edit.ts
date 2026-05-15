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
const CLARITY_SAFE_BYTES = 400 * 1024;

function isOomError(msg: string | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('cuda out of memory') || m.includes('oom') || m.includes('out of memory');
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
        factor: 2,
        target: 5,
        upscale_mode: 'factor',
        output_format: 'jpg',
        output_quality: 95,
        enhance_details: false,
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

    let finalUrl = editUrl;
    let upscalerUsed = 'none';

    if (!skipUpscale) {
      let editedBytes = 0;
      try {
        const head = await fetch(editUrl, { method: 'HEAD' });
        const len = head.headers.get('content-length');
        if (len) editedBytes = parseInt(len, 10) || 0;
      } catch { /* non-fatal */ }

      const tUp = Date.now();
      if (isExterior) {
        const safeScale = editedBytes > CLARITY_SAFE_BYTES ? 1.5 : 2;
        let clarityError: string | undefined;
        try {
          const clarityOutput = await replicate.run('philz1337x/clarity-upscaler', {
            input: {
              image: editUrl,
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
          const upUrl = await extractUrl(clarityOutput);
          if (upUrl) {
            finalUrl = upUrl;
            upscalerUsed = 'Clarity';
            console.log(`[reve-edit] Clarity upscaled in ${Date.now() - tUp}ms (scale ${safeScale}x)`);
          } else {
            clarityError = 'no URL returned';
          }
        } catch (upErr: any) {
          clarityError = upErr?.message || 'unknown';
        }

        if (clarityError) {
          const wasOom = isOomError(clarityError);
          console.warn(`[reve-edit] Clarity ${wasOom ? 'OOM' : 'failed'}: ${clarityError} — retrying via Pruna`);
          const fallbackUrl = await runPruna(replicate, editUrl);
          if (fallbackUrl) {
            finalUrl = fallbackUrl;
            upscalerUsed = wasOom ? 'Pruna (Clarity OOM fallback)' : 'Pruna';
          }
        }
      } else {
        const upUrl = await runPruna(replicate, editUrl);
        if (upUrl) {
          finalUrl = upUrl;
          upscalerUsed = 'Pruna';
          console.log(`[reve-edit] Pruna upscaled in ${Date.now() - tUp}ms`);
        }
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
