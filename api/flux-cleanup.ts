/**
 * api/flux-cleanup.ts
 *
 * Smart Cleanup via Replicate — two-engine architecture.
 *
 * Pipeline:
 *   1. Cleanup engine (selected by `engine` field from client):
 *      - "bria"  →  bria/fibo-edit (default). Targeted clutter removal,
 *        preserves furniture and fixtures. Best for standard declutter.
 *      - "reve"  →  reve/edit. Total room clearing — removes ALL items
 *        including furniture. Used for "Full Clean" preset.
 *   2. Upscaler, branched by isExterior flag from client:
 *      - Exterior / Patio  →  philz1337x/clarity-upscaler (SD + ControlNet
 *        tile + 4x-UltraSharp, ~14s, ~$0.05).
 *      - Interior          →  prunaai/p-image-upscale (~1s, ~$0.005).
 *   3. If Clarity OOMs on Replicate's T4 we auto-retry through Pruna.
 *
 * Input (POST JSON):
 *   { imageBase64, prompt, engine?: 'bria'|'reve', isExterior?, skipUpscale? }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 *
 * Model bake-off (2026-04-28, Cody Garrett listing photos):
 *   Tested nano-banana vs bria/fibo-edit vs reve/edit vs qwen-image-edit-plus
 *   across 4 cluttered rooms. Nano Banana removed <40% of items on average.
 *   Bria removed clutter while preserving furniture. Reve cleared rooms
 *   completely. Qwen matched Bria quality but lower resolution output.
 *   → Bria for standard cleanup, Reve for full clean.
 */
import Replicate from 'replicate';
import sharp from 'sharp';
import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs', maxDuration: 120 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';

// Rough proxy: Nano Banana outputs over 400KB tend to be > 2048px longest
// side, which pushes Clarity's SD + ControlNet pipeline past T4 VRAM.
// We don't want to round-trip through sharp just for dimensions, so we
// use the fetched byte length as a cheap heuristic and downgrade
// scale_factor accordingly.
const CLARITY_SAFE_BYTES = 400 * 1024;

function isOomError(msg: string | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes('cuda out of memory') ||
    m.includes('outofmemoryerror') ||
    m.includes('out of memory') ||
    m.includes('cudaerrorcudnn') ||
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

// Pruna upscaler — primary for interiors. Fast (<1s), $0.005/run, good
// realism on interior surfaces. Also used as Clarity-OOM fallback.
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
    return await extractUrl(out);
  } catch (err: any) {
    console.warn(`[flux-cleanup] Pruna failed: ${err?.message}`);
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
  const skipUpscale = Boolean(body.skipUpscale);
  const isExterior = Boolean(body.isExterior);
  const engine = String(body.engine || 'bria');
  const maskBase64 = String(body.maskBase64 || '');

  if (!imageBase64) { json(res, 400, { ok: false, error: 'imageBase64 is required' }); return; }
  if (!prompt) { json(res, 400, { ok: false, error: 'prompt is required' }); return; }

  const dataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const maskDataUrl = maskBase64
    ? (maskBase64.startsWith('data:') ? maskBase64 : `data:image/png;base64,${maskBase64}`)
    : null;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    // --- Step 1: Cleanup engine (Bria default, Reve for full-clean) ----
    console.log(`[flux-cleanup] Starting ${engine} engine... (${isExterior ? 'exterior' : 'interior'})`);
    let cleanUrl: string | null = null;

    if (engine === 'reve') {
      const output = await replicate.run('reve/edit', {
        input: {
          image: dataUrl,
          prompt,
        },
      });
      cleanUrl = await extractUrl(output);
    } else {
      // Pass mask when available — Bria edits only masked areas, leaving the
      // rest of the image pixel-identical. Best path for Precision Select mode.
      const briaInput: Record<string, unknown> = {
        image: dataUrl,
        instruction: prompt,
        negative_prompt: 'Do not add any new objects, furniture, decor, or items. Do not change room architecture, wall colors, wall texture, flooring, ceiling, or fixtures. Do not alter lighting, shadows, or color grading. Only remove specified items and fill with matching surface texture.',
      };
      if (maskDataUrl) {
        briaInput.mask = maskDataUrl;
        console.log(`[flux-cleanup] Using SAM mask for precision edit`);
      }
      const output = await replicate.run('bria/fibo-edit', { input: briaInput });
      cleanUrl = await extractUrl(output);
    }

    if (!cleanUrl) {
      json(res, 200, { ok: false, error: `${engine} engine returned no image URL` });
      return;
    }
    console.log(`[flux-cleanup] ${engine} done in ${Date.now() - t0}ms → ${cleanUrl.slice(0, 60)}...`);

    // PRECISION GUARANTEE — when a mask was provided, pixel-replace the
    // unmasked areas with the ORIGINAL input. Bria treats `mask` as soft
    // guidance and can still drift on unmasked surfaces (e.g. re-rendering a
    // floor under a removed appliance). The composite below makes that
    // impossible: anywhere mask is black, original wins, byte-identical.
    if (maskDataUrl) {
      const tComp = Date.now();
      try {
        const briaRes = await fetch(cleanUrl);
        const briaBuf = Buffer.from(await briaRes.arrayBuffer());
        const meta = await sharp(briaBuf).metadata();
        const W = meta.width || 0;
        const H = meta.height || 0;
        if (W > 0 && H > 0) {
          // Decode original + mask, resize to Bria's output dimensions.
          const origRaw = dataUrl.split(',')[1] || dataUrl;
          const origBuf = Buffer.from(origRaw, 'base64');
          const maskRaw = maskDataUrl.split(',')[1] || maskDataUrl;
          const maskBuf = Buffer.from(maskRaw, 'base64');

          // Original at Bria resolution, no alpha channel
          const origAtBria = await sharp(origBuf)
            .resize(W, H, { fit: 'fill' })
            .removeAlpha()
            .toBuffer();

          // Mask at Bria resolution, single channel grayscale
          const maskRawData = await sharp(maskBuf)
            .resize(W, H, { fit: 'fill' })
            .greyscale()
            .raw()
            .toBuffer();

          // Use mask AS-IS as alpha for Bria output: white=opaque Bria, black=transparent.
          // Composite Bria-with-alpha OVER original. Where mask is black, original shows.
          const briaWithMask = await sharp(briaBuf)
            .removeAlpha()
            .joinChannel(maskRawData, { raw: { width: W, height: H, channels: 1 } })
            .png()
            .toBuffer();

          const composited = await sharp(origAtBria)
            .composite([{ input: briaWithMask, blend: 'over' }])
            .jpeg({ quality: 95 })
            .toBuffer();

          // Upload composited result back to Replicate as a data URL replacement.
          // The downstream upscale step will fetch from this URL, but since we now
          // have the bytes locally we'll inline-base64 instead.
          const composedDataUrl = `data:image/jpeg;base64,${composited.toString('base64')}`;
          cleanUrl = composedDataUrl; // upscale step accepts data URLs
          console.log(`[flux-cleanup] Mask composite done in ${Date.now() - tComp}ms (${W}×${H})`);
        }
      } catch (compErr: any) {
        console.warn(`[flux-cleanup] Mask composite failed: ${compErr?.message} — using raw Bria output`);
        // Fall through to upscale with Bria's raw output as before.
      }
    }

    // Probe cleaned image size to decide on safe Clarity scale_factor.
    // HEAD first; fall back to GET if the host doesn't honor HEAD.
    let cleanedBytes = 0;
    try {
      const head = await fetch(cleanUrl, { method: 'HEAD' });
      const len = head.headers.get('content-length');
      if (len) cleanedBytes = parseInt(len, 10) || 0;
    } catch { /* non-fatal */ }

    // --- Step 2 (optional): Upscale branch -----------------------------
    let finalUrl = cleanUrl;
    let upscalerUsed: 'none' | 'Clarity' | 'Pruna' | 'Pruna (Clarity OOM fallback)' = 'none';

    if (!skipUpscale) {
      const tUp = Date.now();
      if (isExterior) {
        // Clarity Upscaler for exteriors — full config from tested params.
        const safeScale = cleanedBytes > CLARITY_SAFE_BYTES ? 1.5 : 2;
        let clarityError: string | undefined;
        try {
          const clarityOutput = await replicate.run('philz1337x/clarity-upscaler', {
            input: {
              image: cleanUrl,
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
          const upscaledUrl = await extractUrl(clarityOutput);
          if (upscaledUrl) {
            finalUrl = upscaledUrl;
            upscalerUsed = 'Clarity';
            console.log(`[flux-cleanup] Clarity upscaled in ${Date.now() - tUp}ms (scale ${safeScale}x, ${cleanedBytes} bytes in)`);
          } else {
            clarityError = 'no URL returned';
          }
        } catch (upErr: any) {
          clarityError = upErr?.message || 'unknown';
        }

        // OOM fallback → Pruna. Also covers generic Clarity failure.
        if (clarityError) {
          const wasOom = isOomError(clarityError);
          console.warn(`[flux-cleanup] Clarity ${wasOom ? 'OOM' : 'failed'}: ${clarityError} — retrying via Pruna`);
          const fallbackUrl = await runPruna(replicate, cleanUrl);
          if (fallbackUrl) {
            finalUrl = fallbackUrl;
            upscalerUsed = wasOom ? 'Pruna (Clarity OOM fallback)' : 'Pruna';
            console.log(`[flux-cleanup] Fallback Pruna upscaled in ${Date.now() - tUp}ms total`);
          } else {
            console.warn('[flux-cleanup] Both Clarity and Pruna failed — returning un-upscaled');
          }
        }
      } else {
        // Interior path — Pruna (fast <1s, $0.005, good realism).
        const upscaledUrl = await runPruna(replicate, cleanUrl);
        if (upscaledUrl) {
          finalUrl = upscaledUrl;
          upscalerUsed = 'Pruna';
          console.log(`[flux-cleanup] Pruna upscaled in ${Date.now() - tUp}ms (interior path)`);
        } else {
          console.warn('[flux-cleanup] Pruna returned no URL — using un-upscaled');
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

    console.log(`[flux-cleanup] Total: ${Date.now() - t0}ms (${engine} + ${upscalerUsed})`);
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });

  } catch (err: any) {
    console.error('[flux-cleanup] unhandled:', err?.message || err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
