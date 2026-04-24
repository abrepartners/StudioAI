/**
 * api/flux-twilight.ts  —  DAY TO DUSK (v5, brightened prompts)
 *
 * HISTORY:
 *  - v1: Flux 2 Pro + 2 images (user + reference). Different house.
 *  - v2: Flux 2 Pro + 1 image. Still hallucinating.
 *  - v3: IC-Light background relighting.
 *  - v4: prompt-only Flux 2 Pro, no reference images.
 *  - v5 (this file): brightened all 3 style prompts. v4 was pushing Flux
 *    toward late blue hour / near-night exposure. v5 targets CIVIL
 *    TWILIGHT — sun just below horizon, sky still warm, architectural
 *    details still clearly visible. Added an explicit brightness
 *    guardrail to the main prompt structure.
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

// CIVIL TWILIGHT: the brightest of the three twilight phases, sun just
// below the horizon, sky still colorful, all exterior details still visible.
// This is what MLS / Architectural Digest twilight shots actually look like.
// Avoids the "blue hour silhouette" trap where Flux flattens everything to
// near-black.
const STYLE_ATMOSPHERE: Record<TwilightStyle, string> = {
  'warm-classic':
    'Magic hour exterior, CIVIL TWILIGHT (sun just set, sky still warm and bright). Warm peach-amber horizon fading to soft violet at the top of frame. Warm amber 2700K light glowing from every visible window. Existing porch lights and path lights ON with soft warm halos. Gentle lingering warm daylight still illuminating the siding, trim, and landscaping — NOT dark, NOT silhouetted. Exterior details remain clearly visible and pleasant. Think Architectural Digest twilight cover shot, Sotheby\'s real estate magazine, magic hour photography — not late night.',
  'modern-dramatic':
    'Dramatic civil twilight, luxury Sotheby\'s-style real estate photography. Deep blue-violet sky with a strong magenta-pink horizon band. Bright warm interior glow from every window (noticeably brighter than ambient) spilling warm light onto nearby walls, porches, and ground. Architectural sconces, recessed soffit lights, and path lights ON. Shadows are cool but NOT crushed — siding texture, landscaping, and architectural features all clearly visible. Overall exposure is bright enough to read every detail of the house. Magazine-quality luxury listing at dusk, not night.',
  'golden-luxury':
    'Soft golden hour transitioning into the first minute of dusk. Still BRIGHT. Warm peach-pink sunset sky with lingering daylight. Warm amber 2700K window glow in every window. Golden fill light on the whole scene — siding, trim, and landscaping warmly lit from the horizon. Soft pastel palette, elegant and airy. This is the "last 15 minutes of sunlight" look real estate photographers chase, not late dusk.',
};

function buildTwilightPrompt(style: TwilightStyle): string {
  const atmosphere = STYLE_ATMOSPHERE[style];
  return `LIGHTING-ONLY EDIT. This is a photo restoration / relighting task, not a creative regeneration task. Take the input photograph and change only the lighting and sky. Everything else must remain pixel-accurate.

TARGET LIGHTING ATMOSPHERE:
${atmosphere}

BRIGHTNESS / EXPOSURE GUARDRAIL (critical):
- MEDIUM-HIGH exposure. The frame must stay bright enough that the siding, trim, windows, landscaping, and architectural details are all clearly visible WITHOUT squinting or needing to brighten the output.
- DO NOT render this as night, late blue hour, or silhouette. This is CIVIL TWILIGHT / magic hour — the colorful, luminous window of dusk where MLS listing shots are captured.
- Shadows should be soft and readable, not crushed black.
- Overall scene should read 2-3 f-stops BRIGHTER than a "moody night" edit.

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
- Only change: sky (to the target atmosphere), exterior ambient light level, interior window glow, and reflections that follow naturally from the new lighting.

Output the same photograph relit to the target atmosphere. Treat the input as immutable geometry and change only the light energy in the scene — keeping exposure bright and details visible.`;
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
    console.log(`[flux-twilight] Starting Flux 2 Pro v5 brightened (${style})`);
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
