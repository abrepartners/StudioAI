/**
 * api/sky-replace.ts
 *
 * Sky replacement via Google Nano Banana (Gemini 2.5 Flash Image) on
 * Replicate. Nano Banana is strong at localized edits — swap the sky
 * while leaving the house, landscaping, and perspective pixel-accurate.
 *
 * Input (POST JSON):
 *   { imageBase64: string, style: 'blue' | 'dramatic' | 'golden' | 'stormy' }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 */
import Replicate from 'replicate';
import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs', maxDuration: 120 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';

type SkyStyle = 'blue' | 'dramatic' | 'golden' | 'overcast' | 'stormy';

const VALID_STYLES: ReadonlyArray<SkyStyle> = ['blue', 'dramatic', 'golden', 'overcast', 'stormy'];

const STYLE_SKY_DESCRIPTIONS: Record<SkyStyle, string> = {
  blue:
    'a vivid, clean deep blue sky with a few soft scattered cumulus clouds. Bright, sunny, MLS-ready daytime look',
  dramatic:
    'a dramatic moody sky — layered gray and blue-violet storm clouds with visible light shafts breaking through, cinematic contrast',
  golden:
    'a warm golden-hour sky — soft peach-pink sunset fading to warm amber near the horizon, lingering daylight',
  overcast:
    'a soft, bright overcast sky — uniform light gray-white cloud cover, diffused gentle light, no harsh shadows, calm and even',
  stormy:
    'heavy dark storm clouds, deep gray tones with dramatic texture and moody contrast',
};

const ATMOSPHERIC_LIGHTING: Record<SkyStyle, string> = {
  blue: 'Bright neutral daylight — well-lit facades, crisp shadows.',
  dramatic: 'Moodier contrast with directional light through cloud breaks — slightly lower ambient, stronger highlights.',
  golden: 'Warm golden-hour side-lighting — warm tones on sun-facing surfaces, cool shadows.',
  overcast: 'Soft, even diffused light — minimal shadows, gentle illumination on all surfaces.',
  stormy: 'Lower ambient light, moody contrast — house still visible but under heavier cloud shadow.',
};

function buildSkyPrompt(style: SkyStyle): string {
  const skyDesc = STYLE_SKY_DESCRIPTIONS[style];
  const atmo = ATMOSPHERIC_LIGHTING[style];
  return `Replace ONLY the sky in this photograph with ${skyDesc}.

PIXEL PRESERVATION (non-sky regions):
Keep absolutely everything else pixel-identical: the house, siding, roof, windows, doors, landscaping, grass, trees, driveway, fence, mailbox, and every other non-sky element must be unchanged. Preserve the camera framing, perspective, and field of view exactly. Do not invent, add, or remove any physical object. Do not change any architectural features.

ATMOSPHERIC CONSISTENCY:
Adjust the ambient light on the house and ground to naturally match the new sky. ${atmo}
The house should look naturally photographed under this sky, not composited.

CRITICAL — NO GHOST ROOFLINE / NO DUPLICATED STRUCTURE:
- The sky region above the roof must contain ONLY sky and clouds. Nothing else.
- Do NOT draw, echo, duplicate, or silhouette the roofline, chimney, or house shape anywhere in the sky.
- Do NOT create cloud formations that mirror or follow the roofline contour.
- If a faint outline of the house appears in the sky, erase it — only sky and clouds should exist above the real roof edge.

Blend the new sky naturally at the roofline edge — soft, clean transition with no haloing or hard compositing line.`;
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
  const style = String(body.style || '') as SkyStyle;

  if (!imageBase64) { json(res, 400, { ok: false, error: 'imageBase64 is required' }); return; }
  if (!VALID_STYLES.includes(style)) { json(res, 400, { ok: false, error: `Invalid style: ${style}` }); return; }

  const userDataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    console.log(`[sky-replace] Starting Nano Banana sky replacement (${style})`);
    const nbOutput = await replicate.run('google/nano-banana', {
      input: {
        image_input: [userDataUrl],
        prompt: buildSkyPrompt(style),
        output_format: 'jpg',
      },
    });

    const cleanUrl = await extractUrl(nbOutput);
    if (!cleanUrl) {
      json(res, 200, { ok: false, error: 'Nano Banana returned no image URL' });
      return;
    }
    console.log(`[sky-replace] Nano Banana done in ${Date.now() - t0}ms`);

    // Pruna 2x upscale for final resolution (consistent with cleanup/staging/upscale).
    // Sky replace is always exterior, but Clarity OOMs on large input images and
    // Pruna's enhance_realism:false keeps the sky natural-looking.
    let finalUrl = cleanUrl;
    const tUp = Date.now();
    try {
      const upOutput = await replicate.run('prunaai/p-image-upscale', {
        input: {
          image: cleanUrl,
          factor: 2,
          target: 5,
          upscale_mode: 'factor',
          output_format: 'jpg',
          output_quality: 95,
          enhance_details: true,
          enhance_realism: false,
        },
      });
      const upscaledUrl = await extractUrl(upOutput);
      if (upscaledUrl) {
        finalUrl = upscaledUrl;
        console.log(`[sky-replace] Pruna upscaled in ${Date.now() - tUp}ms`);
      }
    } catch (upErr: any) {
      console.warn(`[sky-replace] Pruna failed: ${upErr?.message} — using un-upscaled`);
    }

    const imgRes = await fetch(finalUrl);
    if (!imgRes.ok) {
      json(res, 200, { ok: false, error: `result fetch ${imgRes.status}` });
      return;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const resultBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;

    console.log(`[sky-replace] Total: ${Date.now() - t0}ms (${style})`);
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });

  } catch (err: any) {
    console.error('[sky-replace] unhandled:', err?.message || err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
