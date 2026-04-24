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

type SkyStyle = 'blue' | 'dramatic' | 'golden' | 'stormy';

const VALID_STYLES: ReadonlyArray<SkyStyle> = ['blue', 'dramatic', 'golden', 'stormy'];

const STYLE_SKY_DESCRIPTIONS: Record<SkyStyle, string> = {
  blue:
    'a vivid, clean deep blue sky with a few soft scattered cumulus clouds. Bright, sunny, MLS-ready daytime look',
  dramatic:
    'a dramatic moody sky — layered gray and blue-violet storm clouds with visible light shafts breaking through, cinematic contrast',
  golden:
    'a warm golden-hour sky — soft peach-pink sunset fading to warm amber near the horizon, lingering daylight',
  stormy:
    'heavy dark storm clouds, deep gray tones with dramatic texture and moody contrast',
};

function buildSkyPrompt(style: SkyStyle): string {
  const skyDesc = STYLE_SKY_DESCRIPTIONS[style];
  return `Replace ONLY the sky in this photograph with ${skyDesc}. Keep absolutely everything else pixel-identical: the house, siding, roof, windows, doors, landscaping, grass, trees, driveway, fence, mailbox, and every other non-sky element must be unchanged. Preserve the camera framing, perspective, and field of view exactly. Do not invent, add, or remove any physical object. Do not change any architectural features. Blend the new sky naturally with the existing scene — matching exposure so the house remains well-lit and visible against the new sky.`;
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

    // Real-ESRGAN 4x upscale for final resolution
    let finalUrl = cleanUrl;
    const tEsr = Date.now();
    try {
      const esrOutput = await replicate.run('nightmareai/real-esrgan', {
        input: { image: cleanUrl, scale: 4, face_enhance: false },
      });
      const upscaledUrl = await extractUrl(esrOutput);
      if (upscaledUrl) {
        finalUrl = upscaledUrl;
        console.log(`[sky-replace] Upscaled in ${Date.now() - tEsr}ms`);
      }
    } catch (esrErr: any) {
      console.warn(`[sky-replace] ESRGAN failed: ${esrErr?.message} — using un-upscaled`);
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
