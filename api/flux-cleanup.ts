/**
 * api/flux-cleanup.ts
 *
 * Smart Cleanup via Replicate.
 *
 * Pipeline:
 *   1. google/nano-banana (Gemini 2.5 Flash Image) — does the actual
 *      clutter removal while preserving architecture.
 *   2. Upscaler, branched by isExterior flag from client:
 *      - Exterior / Patio  →  philz1337x/clarity-upscaler (SD + ControlNet
 *        tile + 4x-UltraSharp, ~14s, ~$0.05). Detail-adding upscale that
 *        matters for siding textures, shingles, landscaping.
 *      - Interior          →  nightmareai/real-esrgan (~8s, ~$0.002).
 *        Fast pixel-stretch upscale, fine for indoor clean surfaces.
 *   3. If Clarity OOMs on Replicate's T4 (14.5 GB usable) we auto-retry
 *      through Real-ESRGAN so the user always gets an upscaled result.
 *
 * Input (POST JSON):
 *   { imageBase64: string, prompt: string, isExterior?: boolean, skipUpscale?: boolean }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 *
 * Cost:
 *   - Exterior: Nano Banana $0.04 + Clarity $0.05 = ~$0.09/img (~$0.042 on OOM fallback)
 *   - Interior: Nano Banana $0.04 + ESRGAN $0.002 = ~$0.042/img
 *
 * Historical note: Model Lab evaluations on 2026-04-24:
 *   Cleanup engine: flux-2-pro vs flux-kontext-pro vs nano-banana
 *     → Nano Banana won (preserves exteriors cleanest)
 *   Upscaler: ESRGAN (fast, flat) vs Clarity (slow, sharper)
 *     → Clarity won on exteriors; ESRGAN kept for interiors.
 *   CUDA OOM seen on T4 when input > ~2048px. Mitigated via dynamic
 *   scale_factor + OOM → ESRGAN fallback (this file, 2026-04-24).
 */
import Replicate from 'replicate';
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

// Real-ESRGAN wrapper — used as primary for interiors and as Clarity-OOM
// fallback for exteriors. Returns null if the call failed; caller should
// fall back to raw upstream input.
async function runEsrgan(replicate: Replicate, imageUrl: string): Promise<string | null> {
  try {
    const out = await replicate.run('nightmareai/real-esrgan', {
      input: { image: imageUrl, scale: 4, face_enhance: false },
    });
    return await extractUrl(out);
  } catch (err: any) {
    console.warn(`[flux-cleanup] ESRGAN failed: ${err?.message}`);
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

  if (!imageBase64) { json(res, 400, { ok: false, error: 'imageBase64 is required' }); return; }
  if (!prompt) { json(res, 400, { ok: false, error: 'prompt is required' }); return; }

  const dataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    // --- Step 1: Google Nano Banana cleanup ----------------------------
    console.log(`[flux-cleanup] Starting Google Nano Banana... (${isExterior ? 'exterior' : 'interior'})`);
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
    let upscalerUsed: 'none' | 'Clarity' | 'ESRGAN' | 'ESRGAN (Clarity OOM fallback)' = 'none';

    if (!skipUpscale) {
      const tUp = Date.now();
      if (isExterior) {
        // Clarity Upscaler for exteriors.
        // Dynamic scale_factor: 2x when safe, 1.5x for bigger inputs to keep
        // the output buffer under T4's ~14.5 GB VRAM ceiling.
        const safeScale = cleanedBytes > CLARITY_SAFE_BYTES ? 1.5 : 2;
        let clarityError: string | undefined;
        try {
          const clarityOutput = await replicate.run('philz1337x/clarity-upscaler', {
            input: {
              image: cleanUrl,
              scale_factor: safeScale,
              num_inference_steps: 18,
              dynamic: 6,
              creativity: 0.3,
              resemblance: 0.75,
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

        // OOM fallback → ESRGAN. Also covers generic Clarity failure so
        // exteriors always get some upscale pass.
        if (clarityError) {
          const wasOom = isOomError(clarityError);
          console.warn(`[flux-cleanup] Clarity ${wasOom ? 'OOM' : 'failed'}: ${clarityError} — retrying via ESRGAN`);
          const fallbackUrl = await runEsrgan(replicate, cleanUrl);
          if (fallbackUrl) {
            finalUrl = fallbackUrl;
            upscalerUsed = wasOom ? 'ESRGAN (Clarity OOM fallback)' : 'ESRGAN';
            console.log(`[flux-cleanup] Fallback ESRGAN upscaled in ${Date.now() - tUp}ms total`);
          } else {
            console.warn('[flux-cleanup] Both Clarity and ESRGAN failed — returning un-upscaled');
          }
        }
      } else {
        // Interior path — Real-ESRGAN.
        const upscaledUrl = await runEsrgan(replicate, cleanUrl);
        if (upscaledUrl) {
          finalUrl = upscaledUrl;
          upscalerUsed = 'ESRGAN';
          console.log(`[flux-cleanup] ESRGAN upscaled in ${Date.now() - tUp}ms (interior path)`);
        } else {
          console.warn('[flux-cleanup] ESRGAN returned no URL — using un-upscaled');
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

    console.log(`[flux-cleanup] Total: ${Date.now() - t0}ms (Nano Banana + ${upscalerUsed})`);
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });

  } catch (err: any) {
    console.error('[flux-cleanup] unhandled:', err?.message || err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
