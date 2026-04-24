/**
 * api/flux-twilight.ts  —  DAY TO DUSK (v4, prompt-only Flux 2 Pro)
 *
 * HISTORY:
 *  - v1: Flux 2 Pro + 2 images (user + reference). Different house in output.
 *  - v2: Flux 2 Pro + 1 image + tight prompt. Still hallucinating.
 *  - v3: IC-Light background relighting. Pinned version, functional but
 *    required a reference image as background_image.
 *  - v4 (this file): drop reference images entirely. Prompt-only Flux 2 Pro.
 *    User picks a style; backend maps it to a detailed atmosphere prompt.
 *    No background_image, no reference JPG loaded from disk. Simpler,
 *    matches Thomas's direction.
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

type TwilightStyle = 'warm-classic' | 'modern-dramatic' | 'golden-luxury';

const VALID_STYLES: ReadonlyArray<TwilightStyle> = [
  'warm-classic',
  'modern-dramatic',
  'golden-luxury',
];

const STYLE_ATMOSPHERE: Record<TwilightStyle, string> = {
  'warm-classic':
    'Blue hour sky (deep saturated teal fading to warm peach-pink at the horizon). Warm amber (2700K) light behind every visible window. Subtle warm halos around any existing porch or exterior fixtures. Gentle warm rim lighting catching roof edges and architectural silhouettes. Deep cool blue-violet shadows under eaves and overhangs. Cinematic real estate twilight photography, magazine-quality blue hour exterior.',
  'modern-dramatic':
    'Deep blue-purple twilight sky with a hint of magenta near the horizon. Strong bright warm interior glow spilling from every window, bright enough to cast warm light pools on nearby walls, porches, and the ground. Architectural sconces and path lights turned on. Deep cool shadows that read as luxury Sotheby\'s-style listing photography.',
  'golden-luxury':
    'Soft pastel pink-peach sunset sky fading gently to light blue overhead. Warm golden window glow (2700K) in every visible window. Warm diffused fill on light-colored surfaces facing the horizon. Soft golden hour transitioning into blue hour, elegant and airy luxury listing exterior.',
};

function buildTwilightPrompt(style: TwilightStyle): string {
  const atmosphere = STYLE_ATMOSPHERE[style];
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
  if (!VALID_STYLES.includes(style)) { json(res, 400, { ok: false, error: `Invalid style: ${style}` }); return; }

  const userDataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    console.log(`[flux-twilight] Starting Flux 2 Pro prompt-only (${style})`);
    const fluxOutput = await replicate.run('black-forest-labs/flux-2-pro', {
      input: {
        input_images: [userDataUrl],
        prompt: buildTwilightPrompt(style),
        output_format: 'jpg',
        aspect_ratio: 'match_input_image',
      },
    });

    const cleanUrl = await extractUrl(fluxOutput);
    if (!cleanUrl) {
      json(res, 200, { ok: false, error: 'Flux returned no image URL' });
      return;
    }
    console.log(`[flux-twilight] Flux done in ${Date.now() - t0}ms`);

    // Real-ESRGAN 4x upscale
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
