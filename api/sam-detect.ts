/**
 * api/sam-detect.ts
 *
 * Server-side proxy to Replicate's Meta SAM 2 automatic mask generator.
 * Called from the client during Smart Cleanup flow — never expose the
 * REPLICATE_API_TOKEN to the browser.
 *
 * Input (POST JSON):  { imageBase64: string }
 *     imageBase64 can be a raw base64 string or a data URL.
 *
 * Output (200 JSON):
 *   { ok: true,
 *     combinedMaskBase64: string,          // data:image/png;base64,...
 *     individualMasksBase64: string[],     // one data URL per detected object
 *     maskCount: number,
 *     latencyMs: number }
 *
 * Output (200 JSON on graceful failure — caller falls back):
 *   { ok: false, error: string, fallback: 'no-mask' }
 *
 * Pricing reference: ~$0.0066 per prediction as of 2026-04-21.
 */
import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const SAM_VERSION = 'cbd95fb76192174268b6b303aeeb7a736e8dab0cbc38177f09db79b2299da30b';

export default async function handler(req: any, res: any) {
  setCors(res, 'POST,OPTIONS');
  if (handleOptions(req, res)) return;
  if (rejectMethod(req, res, 'POST')) return;

  if (!REPLICATE_TOKEN) {
    json(res, 200, { ok: false, error: 'REPLICATE_API_TOKEN not configured', fallback: 'no-mask' });
    return;
  }

  const body = parseBody(req.body);
  const imageBase64 = String(body.imageBase64 || '');
  if (!imageBase64) {
    json(res, 400, { ok: false, error: 'imageBase64 is required' });
    return;
  }

  const dataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const t0 = Date.now();
  try {
    const predict = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=55',
      },
      body: JSON.stringify({
        version: SAM_VERSION,
        input: {
          image: dataUrl,
          points_per_side: 32,
          pred_iou_thresh: 0.92,
        },
      }),
    });

    if (!predict.ok) {
      const text = await predict.text();
      console.warn(`[sam-detect] Replicate returned ${predict.status}: ${text.slice(0, 200)}`);
      json(res, 200, {
        ok: false,
        error: `Replicate ${predict.status}`,
        fallback: 'no-mask',
      });
      return;
    }

    const result = await predict.json();

    // With Prefer: wait, we usually get the finished result inline. If not,
    // poll until succeeded/failed up to our maxDuration ceiling.
    let final = result;
    while (final.status === 'starting' || final.status === 'processing') {
      await new Promise((r) => setTimeout(r, 1200));
      const pollRes = await fetch(final.urls.get, {
        headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` },
      });
      final = await pollRes.json();
    }

    if (final.status !== 'succeeded' || !final.output) {
      console.warn(`[sam-detect] Replicate status=${final.status} error=${final.error}`);
      json(res, 200, {
        ok: false,
        error: final.error || `status: ${final.status}`,
        fallback: 'no-mask',
      });
      return;
    }

    const combinedMaskUrl: string | undefined =
      final.output.combined_mask || final.output[0] || null;
    const individualMasks: string[] = final.output.individual_masks || [];

    if (!combinedMaskUrl) {
      json(res, 200, {
        ok: false,
        error: 'SAM returned no combined_mask',
        fallback: 'no-mask',
      });
      return;
    }

    // Fetch the combined mask PNG and convert to data URL (so the client can
    // just use it directly without a second HTTP hop).
    const maskRes = await fetch(combinedMaskUrl);
    if (!maskRes.ok) {
      json(res, 200, {
        ok: false,
        error: `mask fetch ${maskRes.status}`,
        fallback: 'no-mask',
      });
      return;
    }
    const maskBuf = Buffer.from(await maskRes.arrayBuffer());
    const combinedMaskBase64 = `data:image/png;base64,${maskBuf.toString('base64')}`;

    // Also fetch every individual mask in parallel so the client can show each
    // one as a toggleable overlay (ClutterMaskSelector). Cap at 30 masks — any
    // more and the UI gets unusable anyway. Failed fetches are silently dropped.
    const capped = individualMasks.slice(0, 30);
    const individualMasksBase64 = (
      await Promise.all(
        capped.map(async (url): Promise<string | null> => {
          try {
            const r = await fetch(url);
            if (!r.ok) return null;
            const buf = Buffer.from(await r.arrayBuffer());
            return `data:image/png;base64,${buf.toString('base64')}`;
          } catch {
            return null;
          }
        }),
      )
    ).filter((m): m is string => m !== null);

    json(res, 200, {
      ok: true,
      combinedMaskBase64,
      individualMasksBase64,
      maskCount: individualMasks.length,
      latencyMs: Date.now() - t0,
    });
  } catch (err: any) {
    console.error('[sam-detect] unhandled error:', err);
    json(res, 200, {
      ok: false,
      error: err?.message || 'unknown',
      fallback: 'no-mask',
    });
  }
}
