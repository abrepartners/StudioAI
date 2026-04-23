/**
 * api/flux-twilight.ts
 *
 * Day-to-Dusk via Flux 2 Pro with reference image style transfer.
 * Sends the user's daytime exterior + a curated twilight reference photo
 * to Flux 2 Pro, which relights the scene to match the reference style.
 * Chains Real-ESRGAN 4x for final resolution.
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

type TwilightStyle = 'warm-classic' | 'modern-dramatic' | 'golden-luxury';

const STYLE_FILES: Record<TwilightStyle, string> = {
  'warm-classic': 'warm-classic.jpg',
  'modern-dramatic': 'modern-dramatic.jpg',
  'golden-luxury': 'golden-luxury.jpg',
};

const STYLE_PROMPTS: Record<TwilightStyle, string> = {
  'warm-classic': JSON.stringify({
    scene: 'Same house and property as image 1, transformed to twilight/dusk matching image 2',
    lighting: 'Soft blue hour sky with warm peach-pink sunset horizon. Every visible window glows warm amber (2700K). Porch lights and exterior fixtures turned on with warm halos. Wet surface reflections of warm light.',
    style: 'Professional real estate twilight photography, magazine-quality blue hour',
    camera: 'Identical framing, angle, field of view, and perspective as image 1. Do not reframe or zoom.',
    color_palette: ['#1e2d5a', '#4a5c8a', '#e8956a', '#ffd166', '#ffa64d'],
  }),
  'modern-dramatic': JSON.stringify({
    scene: 'Same house and property as image 1, transformed to dramatic deep dusk matching image 2',
    lighting: 'Deep blue-purple twilight sky. Strong warm interior glow through all windows, bright enough to cast light spill on nearby walls and ground. Wall sconces and architectural lighting on. Deep cool shadows under eaves and overhangs.',
    style: 'Dramatic architectural photography, luxury listing, Sotheby\'s quality',
    camera: 'Identical framing, angle, field of view, and perspective as image 1. Do not reframe or zoom.',
    color_palette: ['#1a1040', '#3d2d7a', '#6b4fa0', '#ffb347', '#fff0c4'],
  }),
  'golden-luxury': JSON.stringify({
    scene: 'Same house and property as image 1, transformed to golden twilight matching image 2',
    lighting: 'Soft pastel pink-peach sunset sky fading to light blue. Warm golden window glow (2700K) in every visible window. Exterior fixtures with soft warm light. Gentle warm color cast on light-colored surfaces facing the horizon.',
    style: 'Elegant luxury real estate photography, soft golden hour transitioning to blue hour',
    camera: 'Identical framing, angle, field of view, and perspective as image 1. Do not reframe or zoom.',
    color_palette: ['#2a3a6a', '#8a7ab0', '#f0a080', '#ffd699', '#ffe4b5'],
  }),
};

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
    const refDataUrl = loadReferenceImage(style);
    const stylePrompt = STYLE_PROMPTS[style];

    console.log(`[flux-twilight] Starting Flux 2 Pro (${style})...`);
    const fluxOutput = await replicate.run('black-forest-labs/flux-2-pro', {
      input: {
        input_images: [userDataUrl, refDataUrl],
        prompt: `Transform image 1 into a professional twilight/dusk real estate photo matching the lighting atmosphere of image 2. This is a LIGHTING-ONLY edit of image 1 — relight the scene to dusk/twilight.

${stylePrompt}

CRITICAL RULES:
- Preserve the EXACT architecture, landscaping, driveway, walkways, and all physical objects from image 1.
- Do NOT add any new objects, plants, furniture, lights, or decorations not already in image 1.
- Do NOT change the camera angle, framing, perspective, or field of view from image 1.
- Every visible window must glow with warm interior light.
- Turn on any existing exterior light fixtures with warm halos.
- Roof edges and architectural silhouettes should have subtle warm rim lighting from the dusk sky.
- Deepen shadows under eaves and overhangs to cool blue-violet tones.`,
        output_format: 'jpg',
        aspect_ratio: 'match_input_image',
      },
    });

    const cleanUrl = await extractUrl(fluxOutput);
    if (!cleanUrl) {
      json(res, 200, { ok: false, error: 'Flux returned no image URL' });
      return;
    }
    console.log(`[flux-twilight] Flux done in ${Date.now() - t0}ms → ${cleanUrl.slice(0, 60)}...`);

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
