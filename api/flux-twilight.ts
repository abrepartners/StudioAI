/**
 * api/flux-twilight.ts  —  DAY TO DUSK (v3, IC-Light background relighting)
 *
 * PREVIOUS ITERATIONS:
 *  - v1 (master): Flux 2 Pro + 2 images (user + reference). Result: reference
 *    used as creative target → different house in output.
 *  - v2 (round 1): Flux 2 Pro + 1 image + tight prompt. Result: still
 *    hallucinating because Flux 2 Pro is inherently a generative edit model,
 *    not a relighting model.
 *  - v3 (this file): zsxkib/ic-light-background. IC-Light is a dedicated
 *    relighting model that uses the subject as HARD ground truth and only
 *    modifies the light field. Cannot invent new architecture. The twilight
 *    reference image is passed as the background/lighting source, telling
 *    IC-Light how to relight the house.
 *
 * Fallback: set TWILIGHT_USE_FLUX=true in Vercel env to revert to v2 behavior
 * (Flux 2 Pro single-image) if IC-Light is worse on any archetype.
 *
 * Input (POST JSON):
 *   { imageBase64: string, style: 'warm-classic' | 'modern-dramatic' | 'golden-luxury' }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 */
import Replicate from 'replicate';
import { readFileSync } from 'fs';
import { join } from 'path';
import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs', maxDuration: 120 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';

// Fallback flag — set TWILIGHT_USE_FLUX=true in Vercel env to revert to the
// v2 Flux 2 Pro single-image path if IC-Light regresses on any archetype.
const USE_FLUX_FALLBACK = process.env.TWILIGHT_USE_FLUX === 'true';

type TwilightStyle = 'warm-classic' | 'modern-dramatic' | 'golden-luxury';

const STYLE_FILES: Record<TwilightStyle, string> = {
  'warm-classic': 'warm-classic.jpg',
  'modern-dramatic': 'modern-dramatic.jpg',
  'golden-luxury': 'golden-luxury.jpg',
};

// IC-Light prompts — tuned for real estate twilight. These describe the SCENE
// ATMOSPHERE (what lighting looks like), not the subject, because IC-Light
// preserves the subject pixel-accurately from subject_image.
const STYLE_PROMPTS: Record<TwilightStyle, string> = {
  'warm-classic':
    'professional real estate twilight photography, blue hour with warm peach sunset horizon, warm amber glow in every window, porch lights on with warm halos, cinematic dusk lighting, magazine-quality blue hour exterior',
  'modern-dramatic':
    'dramatic deep dusk twilight, luxury Sotheby\'s real estate photography, deep blue-purple sky, strong warm interior light spilling from every window, architectural sconces illuminated, deep cool shadows under eaves, high-end listing photography',
  'golden-luxury':
    'elegant golden hour real estate photography, soft pink-peach sunset fading to blue, warm 2700K window glow, soft golden fill on light surfaces, luxury listing exterior at magic hour, airy and elegant twilight',
};

const STYLE_NEG_PROMPT =
  'lowres, bad anatomy, bad architecture, worst quality, low quality, jpeg artifacts, cartoon, illustration, painting, extra windows, extra doors, different house, changed building, modified structure, different roof, different siding, different landscaping, changed perspective, wide angle, reframed';

function loadReferenceImage(style: TwilightStyle): string {
  const filename = STYLE_FILES[style];
  const refPath = join(process.cwd(), 'public', 'references', 'twilight', filename);
  const buf = readFileSync(refPath);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
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

// Flux 2 Pro single-image fallback path (same as v2).
async function runFluxFallback(
  replicate: Replicate,
  userDataUrl: string,
  style: TwilightStyle,
): Promise<string | null> {
  const atmosphere = STYLE_PROMPTS[style];
  const prompt = `LIGHTING-ONLY EDIT of this photo. Target atmosphere: ${atmosphere}. PRESERVE EXACTLY: the house architecture, siding, roof, windows, doors, landscaping, yard, driveway, camera angle, perspective. Only change: sky, ambient light, window glow, reflections from new lighting. Do not invent new objects. Do not change perspective.`;

  const output = await replicate.run('black-forest-labs/flux-2-pro', {
    input: {
      input_images: [userDataUrl],
      prompt,
      output_format: 'jpg',
      aspect_ratio: 'match_input_image',
    },
  });
  return extractUrl(output);
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
  const style = String(body.style || '') as TwilightStyle;

  if (!imageBase64) { json(res, 400, { ok: false, error: 'imageBase64 is required' }); return; }
  if (!STYLE_FILES[style]) { json(res, 400, { ok: false, error: `Invalid style: ${style}` }); return; }

  const userDataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    let cleanUrl: string | null = null;

    if (USE_FLUX_FALLBACK) {
      // ─── FLUX 2 PRO FALLBACK PATH (feature flag) ──────────────────
      console.log(`[flux-twilight] Using Flux 2 Pro fallback (${style})`);
      cleanUrl = await runFluxFallback(replicate, userDataUrl, style);
    } else {
      // ─── PRIMARY PATH: IC-Light background relighting ─────────────
      const refDataUrl = loadReferenceImage(style);
      const atmospherePrompt = STYLE_PROMPTS[style];

      console.log(`[flux-twilight] Starting IC-Light background relight (${style})`);
      const output = await replicate.run('zsxkib/ic-light-background', {
        input: {
          subject_image: userDataUrl,
          background_image: refDataUrl,
          prompt: atmospherePrompt,
          appended_prompt: 'best quality, photorealistic, real estate exterior, professional photography, architectural integrity, preserve subject',
          negative_prompt: STYLE_NEG_PROMPT,
          light_source: 'Use Background Image',
          steps: 30,
          cfg: 2,
          lowres_denoise: 0.9,
          highres_denoise: 0.3,
        },
      });

      cleanUrl = await extractUrl(output);

      if (!cleanUrl) {
        console.warn('[flux-twilight] IC-Light returned no URL — falling back to Flux 2 Pro');
        cleanUrl = await runFluxFallback(replicate, userDataUrl, style);
      }
    }

    if (!cleanUrl) {
      json(res, 200, { ok: false, error: 'Relight returned no image URL (both paths failed)' });
      return;
    }
    console.log(`[flux-twilight] Relight done in ${Date.now() - t0}ms`);

    let finalUrl = cleanUrl;
    const tEsr = Date.now();
    try {
      const esrOutput = await replicate.run('nightmareai/real-esrgan', {
        input: { image: cleanUrl, scale: 4, face_enhance: false },
      });
      const upscaledUrl = await extractUrl(esrOutput);
      if (upscaledUrl) {
        finalUrl = upscaledUrl;
        console.log(`[flux-twilight] Upscaled in ${Date.now() - tEsr}ms`);
      }
    } catch (esrErr: any) {
      console.warn(`[flux-twilight] ESRGAN failed: ${esrErr?.message} — using un-upscaled`);
    }

    const imgRes = await fetch(finalUrl);
    if (!imgRes.ok) {
      json(res, 200, { ok: false, error: `result fetch ${imgRes.status}` });
      return;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const resultBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;

    console.log(`[flux-twilight] Total: ${Date.now() - t0}ms (${style})`);
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });

  } catch (err: any) {
    console.error('[flux-twilight] unhandled:', err?.message || err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
