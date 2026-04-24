/**
 * api/flux-twilight.ts  —  DAY TO DUSK (v2, single-image relight)
 *
 * PREVIOUS BEHAVIOR (broken): passed user image + a curated twilight reference
 * image to Flux 2 Pro as `input_images: [userImg, refImg]`. Flux 2 Pro in
 * multi-reference mode performs reference-based style transfer, not
 * relighting — it blends the two images as creative targets. Result:
 * entirely different houses in the output.
 *
 * NEW BEHAVIOR: pass ONLY the user image. Describe the twilight atmosphere
 * in the text prompt. Use very strict preservation language. This coerces
 * Flux 2 Pro into img2img mode with the user image as hard ground truth.
 *
 * If this still hallucinates for some exterior archetypes, the next step is
 * to swap the model to a true relighting model (IC-Light 2 on Replicate:
 * `zsxkib/ic-light-v2`), which is purpose-built to change lighting while
 * preserving architecture. Kept as a feature-flag swap at the bottom.
 *
 * Input (POST JSON):
 *   { imageBase64: string, style: 'warm-classic' | 'modern-dramatic' | 'golden-luxury' }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 */
import Replicate from 'replicate';
import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs', maxDuration: 120 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';

// Feature flag: flip to true once IC-Light v2 is validated on exteriors.
const USE_IC_LIGHT = process.env.TWILIGHT_USE_IC_LIGHT === 'true';

type TwilightStyle = 'warm-classic' | 'modern-dramatic' | 'golden-luxury';

// Style descriptors — baked into the prompt, no reference image needed.
const STYLE_DESCRIPTIONS: Record<TwilightStyle, string> = {
  'warm-classic':
    'Blue hour sky (deep saturated teal fading to warm peach-pink at the horizon). Warm amber (2700K) light behind every visible window. Subtle warm halos around any existing porch or exterior fixtures. Gentle warm rim lighting catching roof edges and architectural silhouettes. Deep cool blue-violet shadows under eaves and overhangs.',
  'modern-dramatic':
    'Deep blue-purple twilight sky with a hint of magenta at the horizon. Strong bright warm interior glow spilling out of every window, bright enough to cast visible warm light pools on nearby walls, porches, and the ground. Architectural sconces and path lights turned on. Deep cool shadows that read as luxury / Sotheby\'s-style listing photography.',
  'golden-luxury':
    'Soft pastel pink-peach sunset sky fading gently to light blue overhead. Warm golden window glow (2700K) in every visible window. Warm diffused fill on light-colored surfaces facing the horizon (stucco, light siding, trim). Soft golden hour transitioning into blue hour, elegant and airy.',
};

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

function buildTwilightPrompt(style: TwilightStyle): string {
  const atmosphere = STYLE_DESCRIPTIONS[style];
  return `LIGHTING-ONLY EDIT. This is a photo restoration / relighting task, not a creative regeneration task. Take the input photograph and change only the lighting and sky. Everything else must remain pixel-accurate.

TARGET LIGHTING ATMOSPHERE:
${atmosphere}

PRESERVE EXACTLY (must be pixel-identical to the input):
- House structure, silhouette, and all architectural features (walls, siding, trim, columns, porches, railings, roofs, chimneys, gutters, eaves).
- Siding material and color (do not change or "upgrade" materials).
- Every window: count, position, size, framing, mullions, glass.
- Every door: count, position, size, style, color, hardware.
- Roof: shape, pitch, material, shingle pattern.
- Yard, grass, driveway, walkways, hardscape, fences, mailbox.
- Existing trees, shrubs, flower beds — no additions or removals.
- Camera framing, angle, field of view, perspective, and crop.

STRICT RULES:
- Do NOT invent, add, or remove any physical object, plant, or architectural element.
- Do NOT change camera angle, zoom, or perspective.
- Do NOT upgrade, repaint, re-side, or re-roof the house.
- Do NOT regenerate grass, trees, or landscaping.
- Do NOT add new windows, doors, lights, cars, furniture, or decor.
- Only change: sky (to the target atmosphere), exterior ambient light, interior window glow, reflections that follow naturally from the new lighting.

Output the same photograph relit to the target atmosphere. Treat the input as immutable geometry and change only the light energy in the scene.`;
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
  if (!STYLE_DESCRIPTIONS[style]) { json(res, 400, { ok: false, error: `Invalid style: ${style}` }); return; }

  const userDataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    // ─── PRIMARY PATH: Flux 2 Pro single-image relight ─────────────────
    // Pass ONLY the user image. The twilight style is described entirely
    // in the text prompt. No reference image = no style-transfer blending.
    console.log(`[flux-twilight] Starting Flux 2 Pro single-image (${style})...`);
    let primaryOutput;
    if (USE_IC_LIGHT) {
      // ─── ALTERNATIVE PATH: IC-Light v2 (enable via env flag) ─────────
      // IC-Light is purpose-built for relighting: preserves subject
      // pixel-accurately and only modifies light energy. Swap-in when
      // validated on architectural exteriors.
      console.log('[flux-twilight] Using IC-Light v2 path');
      primaryOutput = await replicate.run('zsxkib/ic-light-v2', {
        input: {
          subject_image: userDataUrl,
          prompt: buildTwilightPrompt(style),
          num_samples: 1,
          image_width: 1280,
          image_height: 0, // auto from aspect
          steps: 25,
          lowres_denoise: 0.9,
          highres_denoise: 0.5,
        },
      });
    } else {
      primaryOutput = await replicate.run('black-forest-labs/flux-2-pro', {
        input: {
          input_images: [userDataUrl], // ← single image, no reference blending
          prompt: buildTwilightPrompt(style),
          output_format: 'jpg',
          aspect_ratio: 'match_input_image',
        },
      });
    }

    const cleanUrl = await extractUrl(primaryOutput);
    if (!cleanUrl) {
      json(res, 200, { ok: false, error: 'Primary relight returned no image URL' });
      return;
    }
    console.log(`[flux-twilight] Relight done in ${Date.now() - t0}ms`);

    // ─── Real-ESRGAN 4x upscale ────────────────────────────────────────
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
      } else {
        console.warn('[flux-twilight] ESRGAN no URL — using un-upscaled');
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
