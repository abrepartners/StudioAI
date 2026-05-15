/**
 * api/upscale.ts — Standalone upscale endpoint
 *
 * Deferred upscale step, called on export instead of inline during editing.
 * Both interior and exterior use Pruna 2x with enhance_realism:false.
 * Clarity was dropped because its more_details/SDXLrender LoRAs added an
 * HDR over-processed glossy look on exteriors.
 *
 * Input (POST JSON):
 *   { imageBase64: string, isExterior?: boolean }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 */
import Replicate from 'replicate';
import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs', maxDuration: 120 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';

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
        enhance_details: true,
        enhance_realism: false,
      },
    });
    return await extractUrl(out);
  } catch (err: any) {
    console.warn(`[upscale] Pruna failed: ${err?.message}`);
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
  const isExterior = Boolean(body.isExterior);

  if (!imageBase64) { json(res, 400, { ok: false, error: 'imageBase64 is required' }); return; }

  const dataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    // Pruna 2x with enhance_realism:false for both interior and exterior.
    // (Clarity dropped — its more_details/SDXLrender LoRAs + creativity:0.35
    // produced an HDR over-processed look on exteriors.)
    const finalUrl = await runPruna(replicate, dataUrl);
    const upscalerUsed = finalUrl ? 'Pruna' : 'none';

    if (!finalUrl) {
      json(res, 200, { ok: false, error: 'All upscalers failed' });
      return;
    }

    const imgRes = await fetch(finalUrl);
    if (!imgRes.ok) {
      json(res, 200, { ok: false, error: `result fetch ${imgRes.status}` });
      return;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const resultBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;

    console.log(`[upscale] Done in ${Date.now() - t0}ms (${upscalerUsed})`);
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });

  } catch (err: any) {
    console.error('[upscale] unhandled:', err?.message || err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
