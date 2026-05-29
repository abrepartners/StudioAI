/**
 * api/flux-renovation.ts
 *
 * Virtual Renovation via reve/edit on Replicate. Previously ran on
 * flux-2-pro, but — like virtual staging — flux-2-pro treats the photo as
 * a style reference and re-renders the whole scene (and bakes in its
 * preferred "look": warming the image and deepening shadows). reve/edit is
 * the faithful in-place editor the rest of the app standardizes on
 * (whiten, lawn, cleanup, staging): it changes only the surfaces named in
 * the prompt and leaves composition, lighting, and color untouched.
 *
 * Defense in depth still applies: the frontend runs RENOVATION_COMPOSITE in
 * postProcessToolOutput, pixel-matching the result against the original so
 * unchanged regions stay byte-identical.
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
import { json, setCors, handleOptions, rejectMethod, parseBody, clampInstruction } from './utils.js';

export const config = { runtime: 'nodejs', maxDuration: 120 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';

interface RenovationDetails {
  cabinets?: string;
  countertops?: string;
  flooring?: string;
  walls?: string;
}

// reve/edit caps edit_instruction at 2560 chars. The change VALUES are
// free-text user input (no maxLength on the inputs) and sit at the TOP of the
// prompt, while the preservation rules sit at the bottom — so a blind
// end-truncation would amputate exactly those rules. Instead we render to a
// budget and trim only the user values, sharing the value budget across the
// fields actually present, so the fixed rules always survive. clampInstruction
// in api/utils.ts remains the final backstop.
const RENO_PROMPT_BUDGET = 2450;
const MAX_RENO_VALUE = 280; // per-field ceiling even when budget allows more

/** Trim to at most `max` chars, backing off to the last clause/word boundary. */
function trimToBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const cut = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf(' '));
  return (cut > max * 0.6 ? slice.slice(0, cut) : slice).trimEnd();
}

function buildRenovationPrompt(d: RenovationDetails): string {
  // Each present field keeps its own line template so we can re-render with
  // trimmed values without duplicating the prose.
  const present: { value: string; line: (v: string) => string }[] = [];
  const cabinets = (d.cabinets || '').trim();
  const countertops = (d.countertops || '').trim();
  const flooring = (d.flooring || '').trim();
  const walls = (d.walls || '').trim();
  if (cabinets)    present.push({ value: cabinets, line: v => `- CABINETS: replace with "${v}". Keep cabinet size, position, door count, and hardware layout identical — only the material/color/finish changes.` });
  if (countertops) present.push({ value: countertops, line: v => `- COUNTERTOPS: replace with "${v}". Keep counter shape, thickness, and overhang identical — only the material changes.` });
  if (flooring)    present.push({ value: flooring, line: v => `- FLOORING: replace with "${v}". Keep floor layout, plank direction, and grout lines identical where applicable — only the material/pattern changes.` });
  if (walls)       present.push({ value: walls, line: v => `- WALL COLOR: repaint walls with "${v}". Keep wall geometry, trim, outlets, switches, and any hanging items identical — only the wall paint color changes.` });

  const assemble = (values: string[]): string => {
    const changeList = present.length > 0
      ? present.map((p, i) => p.line(values[i])).join('\n')
      : '- (none specified)';
    return renderRenovation(changeList);
  };

  // Fixed length = everything except the user values (measure with blanks, but
  // keep every present line). Share the remaining budget across those fields.
  const fixedLen = assemble(present.map(() => '')).length;
  const perField = present.length > 0
    ? Math.max(0, Math.floor((RENO_PROMPT_BUDGET - fixedLen) / present.length))
    : 0;
  const cap = Math.min(MAX_RENO_VALUE, perField);
  return assemble(present.map(p => trimToBoundary(p.value, cap)));
}

// Fixed scaffolding for the renovation prompt. Kept concise so that, after
// buildRenovationPrompt budgets the user values, the result fits reve/edit's
// 2560-char cap. Don't re-expand without re-checking RENO_PROMPT_BUDGET.
function renderRenovation(changeList: string): string {
  return `PHOTOSHOP-IN-PLACE EDIT — surgical material replacement, not a re-render.

CHANGES TO APPLY (only these, nothing else):
${changeList}

NO LOOK DRIFT:
- Do NOT warm the image or shift color temperature toward amber/orange/gold — match the input's exact Kelvin. If the input is neutral or cool, the output stays neutral or cool.
- Do NOT deepen shadows, add contrast in the shadow range, or crush blacks — shadow density, black point, and darkest pixels stay IDENTICAL to the input.
- Do NOT stylize, dramatize, or "moody-up" the image. No global tonal curve, LUT, color grade, or saturation/vibrance adjustment. This is not a look-development pass.

PRESERVE PIXEL-IDENTICAL:
- The input's exposure, white balance, contrast, saturation, shadow depth, highlight rolloff, color temperature, and overall rendering — every non-edited pixel reads as the same photograph.
- All non-edited regions (appliances, fixtures, windows, ceilings, switches, outlets, furniture, decor, reflections, room geometry) and lighting direction/intensity/temperature on every non-edited surface.
- Camera angle, focal length, perspective, lens distortion, crop, and framing.
- Any surface NOT listed in CHANGES must be the exact same pixels as the input.

STRICT: do NOT add, remove, or reposition any object; do NOT sharpen, soften, denoise, or smooth; do NOT re-render the whole image — replace only the specified surfaces.

Think Photoshop clone-stamp / material-replace: the replaced pixels are the ONLY new information; everything else comes from the source untouched. Output = the EXACT same photograph with just the listed materials swapped — same look, warmth, shadows, and mood. No new look, no re-colorization, no enhancement.`;
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
    // reve/edit edits the supplied image in place — it preserves the input's
    // dimensions, perspective, lighting, and color, and changes only the
    // surfaces named in the prompt. No aspect-ratio detection or style-
    // reference regeneration needed (same faithful path as staging/whiten/lawn).
    console.log('[flux-renovation] Starting reve/edit renovation...');
    const output = await replicate.run('reve/edit', {
      input: {
        image: userDataUrl,
        prompt: clampInstruction(buildRenovationPrompt(details), 'flux-renovation'),
        output_format: 'jpg',
      },
    });

    const cleanUrl = await extractUrl(output);
    if (!cleanUrl) {
      json(res, 200, { ok: false, error: 'reve/edit returned no image URL' });
      return;
    }
    console.log(`[flux-renovation] reve/edit done in ${Date.now() - t0}ms`);

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
