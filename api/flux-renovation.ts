/**
 * api/flux-renovation.ts
 *
 * Virtual Renovation via Flux 2 Pro on Replicate. Chosen over Gemini and
 * Kontext for renovation specifically because Flux 2 Pro produces the
 * cleanest material / finish swaps in lab testing. Downside: Flux tends
 * to re-render the whole frame at its own preferred contrast/exposure,
 * causing a subtle global "drift" even when the local edit is correct.
 *
 * Mitigation (two-layer):
 *   1. This prompt explicitly forbids global tonal changes.
 *   2. The frontend runs RENOVATION_COMPOSITE in postProcessToolOutput
 *      which pixel-matches the result against the original and brings
 *      back non-edited regions byte-identical.
 *
 * Input (POST JSON):
 *   { imageBase64: string, cabinets?: string, countertops?: string,
 *     flooring?: string, walls?: string }
 *
 * Output (200 JSON):
 *   { ok: true, resultBase64: string, latencyMs: number }
 *   { ok: false, error: string }
 */
import Replicate from 'replicate';
import { json, setCors, handleOptions, rejectMethod, parseBody } from './utils.js';

export const config = { runtime: 'nodejs', maxDuration: 120 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';

interface RenovationDetails {
  cabinets?: string;
  countertops?: string;
  flooring?: string;
  walls?: string;
}

function buildRenovationPrompt(d: RenovationDetails): string {
  const changes: string[] = [];
  if (d.cabinets)    changes.push(`- CABINETS: replace with "${d.cabinets}". Keep cabinet size, position, door count, and hardware layout identical — only the material/color/finish changes.`);
  if (d.countertops) changes.push(`- COUNTERTOPS: replace with "${d.countertops}". Keep counter shape, thickness, and overhang identical — only the material changes.`);
  if (d.flooring)    changes.push(`- FLOORING: replace with "${d.flooring}". Keep floor layout, plank direction, and grout lines identical where applicable — only the material/pattern changes.`);
  if (d.walls)       changes.push(`- WALL COLOR: repaint walls with "${d.walls}". Keep wall geometry, trim, outlets, switches, and any hanging items identical — only the wall paint color changes.`);

  const changeList = changes.length > 0 ? changes.join('\n') : '- (none specified)';

  return `PHOTOSHOP-IN-PLACE EDIT. This is a surgical replacement task, not a full re-render.

CHANGES TO APPLY (only these, nothing else):
${changeList}

CRITICAL PRESERVATION RULES — MATCH THE INPUT IMAGE EXACTLY:
- Match the INPUT IMAGE's exposure, white balance, contrast, saturation, shadow depth, highlight rolloff, and overall color grade. DO NOT apply any global tonal or color adjustments. DO NOT brighten, darken, boost contrast, or shift color temperature.
- All NON-EDITED regions (appliances, fixtures, windows, ceilings, light switches, outlets, furniture, decor, perspective, reflections, room geometry) must look PIXEL-IDENTICAL to the input. Same grain, same noise profile, same color.
- Camera angle, focal length, perspective, lens distortion, and framing must be identical.
- Lighting direction, intensity, and color temperature on every non-edited surface must stay the same.
- If a surface is NOT listed in the CHANGES, it must be the same pixels as the input.

STRICT RULES:
- DO NOT adjust overall image contrast, saturation, or brightness.
- DO NOT apply color grading, filtering, or stylization.
- DO NOT sharpen, soften, denoise, or smooth the image.
- DO NOT change exposure or white balance of non-edited regions.
- DO NOT re-render the whole image — only replace the specified surfaces.
- DO NOT add, remove, or reposition any physical object.
- DO NOT change the perspective or crop.

Treat this like a Photoshop clone-stamp / material-replace edit where the replaced pixels are the ONLY new information. Everything else must come from the source image untouched. Output must look like the exact same photograph with just the listed materials swapped — no new "look," no new edit style, no re-colorization.`;
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
  const details: RenovationDetails = {
    cabinets: body.cabinets ? String(body.cabinets) : undefined,
    countertops: body.countertops ? String(body.countertops) : undefined,
    flooring: body.flooring ? String(body.flooring) : undefined,
    walls: body.walls ? String(body.walls) : undefined,
  };

  if (!imageBase64) { json(res, 400, { ok: false, error: 'imageBase64 is required' }); return; }
  const hasAnyChange = !!(details.cabinets || details.countertops || details.flooring || details.walls);
  if (!hasAnyChange) { json(res, 400, { ok: false, error: 'At least one renovation change is required' }); return; }

  const userDataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const t0 = Date.now();

  try {
    console.log(`[flux-renovation] Starting Flux 2 Pro renovation`);
    const fluxOutput = await replicate.run('black-forest-labs/flux-2-pro', {
      input: {
        input_images: [userDataUrl],
        prompt: buildRenovationPrompt(details),
        output_format: 'jpg',
        aspect_ratio: 'match_input_image',
      },
    });

    const cleanUrl = await extractUrl(fluxOutput);
    if (!cleanUrl) {
      json(res, 200, { ok: false, error: 'Flux returned no image URL' });
      return;
    }
    console.log(`[flux-renovation] Flux done in ${Date.now() - t0}ms`);

    const imgRes = await fetch(cleanUrl);
    if (!imgRes.ok) {
      json(res, 200, { ok: false, error: `result fetch ${imgRes.status}` });
      return;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const resultBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;

    console.log(`[flux-renovation] Total: ${Date.now() - t0}ms`);
    json(res, 200, { ok: true, resultBase64, latencyMs: Date.now() - t0 });

  } catch (err: any) {
    console.error('[flux-renovation] unhandled:', err?.message || err);
    json(res, 200, { ok: false, error: err?.message || 'unknown' });
  }
}
