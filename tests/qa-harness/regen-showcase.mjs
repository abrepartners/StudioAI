#!/usr/bin/env node
/**
 * regen-showcase.mjs (Showcase Curator pass — April 2026)
 *
 * Picks 4 hand-curated sources from tests/qa-harness/fixtures and produces
 * before/after pairs that visually demonstrate each headline tool.
 *
 * Each "before" is a downsized JPEG (1600w q0.85) of the source.
 * Each "after" is the Gemini result, downsized to match.
 *
 * Output: public/showcase-{staging,cleanup,twilight,sky}-{before,after}.jpg
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FIX = join(ROOT, 'tests/qa-harness/fixtures');
const OUT = join(ROOT, 'public');

const envLocal = readFileSync(join(ROOT, '.env.local'), 'utf-8');
const apiKey =
  envLocal.match(/^GEMINI_API_KEY=([^\n]+)/m)?.[1] ||
  envLocal.match(/^VITE_GEMINI_API_KEY=([^\n]+)/m)?.[1];
if (!apiKey) throw new Error('No Gemini API key in .env.local');
const ai = new GoogleGenAI({ apiKey });

const MODEL = 'gemini-3.1-flash-image-preview';

// ─── Production prompts (mirrored from services/geminiService.ts) ──────────

const STAGING_PROMPT = (roomType) => `You are a Master Architectural Photo Editor for Real Estate. Your job is a LOCAL EDIT on a real photograph — preservation is your highest priority. The assignment is at the bottom.

        ========================================
        ABSOLUTE RULES — VIOLATING ANY IS A CRITICAL FAILURE
        ========================================
        1. DO NOT MIRROR, FLIP, OR ROTATE the image. Left stays left, right stays right. Window on the right must remain on the right.
        2. DO NOT CHANGE THE CAMERA. Identical framing, crop, field of view, zoom, and angle. Every wall edge, ceiling line, floor boundary, window edge, and door frame must stay at the exact same pixel position. All four image borders must show the same content. The camera is LOCKED.
        3. DO NOT CHANGE WALLS, FLOORS, OR CEILINGS. Preserve their original colors, tones, textures, and materials exactly. Do not repaint, recolor, re-grade, or replace any existing surface. If the walls are white, they stay white.
        4. DO NOT TOUCH WINDOWS, DOORS, OR OPENINGS. Never add, remove, move, resize, or reshape a window or door. Never cover them with new walls or furniture.
        5. DO NOT CHANGE PERMANENT FIXTURES. Ceiling lights, fans, vents, outlets, switches, and built-ins stay exactly as they appear. Do not swap flush mounts for recessed lights or vice versa.
        6. DO NOT ADD WALL DECOR to empty wall space unless the assignment specifically asks for it — no mirrors, artwork, or fixtures invented out of thin air.
        7. DO NOT RE-LIGHT THE SCENE. Match the original's light direction, color temperature, intensity, and shadow softness exactly on every new element.

        Unchanged regions must be pixel-identical to the source in sharpness, grain, and color. If an area is not being modified by the assignment, it should look like it was copied directly from the original.

        ========================================
        REALISM REQUIREMENTS FOR NEW FURNITURE/DECOR
        ========================================
        - Photorealistic materials with natural imperfections: wood grain with knots, fabric weave and slight wrinkles, leather with creasing, metal with environment reflections. No CG-smooth surfaces.
        - Soft contact shadows where every piece meets the floor, matching the room's existing light softness.
        - Match the original photo's grain, lens distortion, vignetting, and depth of field. A clean CG chair on a grainy photo is an instant tell.
        - Specular highlights on shiny surfaces must reflect the actual light sources in the room.
        - Furniture legs sit flat on the floor plane. No floating, no clipping through walls.
        - Output sharpness equal to the input. Do not soften or blur.
        - Avoid AI tells: unnaturally symmetric arrangements, plastic-looking fabrics, over-saturated accents, uniform lighting on all surfaces.

        ========================================
        FURNITURE PLACEMENT
        ========================================
        - Estimate real-world room size from door height (~6'8"), outlet height (~12"), and ceiling height. Small rooms (<12x12) get compact pieces only — queen bed max, loveseat not sectional. Medium (~12x14) fits standard furniture. Large (>14x16) tolerates king beds and sectionals. When in doubt, go smaller.
        - Map doorways, hallways, windows, and traffic paths first. Never place furniture in a door swing, blocking a hallway, or in front of a window or door. Keep 36" clearance in walkways and around beds.
        - Never place shelves, art, mirrors, or wall decor on or in front of a door.
        - Align all furniture to the floor's vanishing points.
        - Group logically: nightstands flank a bed, chairs sit around a table — not scattered.

        ========================================
        ASSIGNMENT
        ========================================
        Virtually stage this ${roomType} in transitional luxury style — light walnut wood tones, warm cream and oatmeal upholstery, brushed brass accents, layered area rug, subtle greenery. Furnish for a high-end MLS listing photo: a comfortable seating arrangement scaled to the room, plus one or two thoughtful decor accents. Preserve every architectural surface exactly.`;

const CLEANUP_PROMPT = (roomType) => `You are an expert real estate photo editor. Your ONLY job is to REMOVE clutter, junk, and distractions from this ${roomType}. This is a REMOVAL-ONLY edit.

ABSOLUTE RULE — DO NOT ADD ANYTHING:
- Do NOT add ANY new objects, furniture, decor, plants, artwork, or items that are not already in the photo.
- Do NOT replace removed items with new items. Where items are removed, reveal the clean floor, wall, ground, or surface behind them.
- This is SUBTRACTION ONLY. The output must have FEWER objects than the input, never more.

CRITICAL RULES:
- Do NOT change, replace, or restyle ANY existing furniture. Every piece of furniture that stays must remain EXACTLY as it appears.
- Do NOT change wall colors, floor colors, or any surface colors.
- Do NOT zoom in. Maintain the EXACT same framing, crop, and field of view. The camera is locked.

COLOR & QUALITY PRESERVATION:
- Maintain the EXACT same color temperature, saturation, brightness, and contrast as the original.
- Do NOT apply any color grading, tone mapping, or mood shift.
- Do NOT soften, blur, or reduce sharpness. Output must be AS SHARP as the input.

REMOVE ALL OF THESE:
- Realtor signs, for-sale signs, lockboxes, key boxes on doors
- Toys, pet items, children's items, strollers, Little Tikes, play kitchens, ride-on vehicles, stuffed animals, action figures, plush toys
- Trophy mounts, taxidermy, deer heads, antlers on walls — remove and reveal clean wall behind
- Vinyl wall decals, stickers, quote art, kid names on walls
- Visible laundry, shoes, bags, backpacks on the floor
- Trash, debris, junk, broken items, construction materials
- Countertop clutter: mail, keys, loose bottles, random cups, toiletries, fruit baskets, cookie jars
- Visible cords and cables on the floor
- Refrigerator magnets, sticky notes, taped papers
- Personal photos and children's drawings on walls — remove and leave clean wall
- Yard clutter: hoses, tools, buckets, tarps, random outdoor items
- Moving boxes, packing materials
- Cleaning supplies left out (brooms, mops, spray bottles)
- Children's bedding patterns and brightly themed comforters — replace with neutral clean linens of the same type
- Loose clothing draped over furniture

DO NOT REMOVE:
- Cars, trucks, bikes, boats, motorcycles, RVs — vehicles are NEVER clutter.
- Power lines, utility poles, street lamps, solar panels — structural scenery stays.
- Trees, bushes, landscaping — never remove plants that are rooted.
- Built-in fixtures (cabinets, sinks, tubs, ceiling fans, lighting fixtures).
- Architectural features — windows, doors, trim, moldings, columns.

KEEP EVERYTHING ELSE EXACTLY AS-IS:
- The bed frame, dresser, desk, and primary furniture pieces stay in place — same style, same color, same position.
- ALL bedding base layers, pillows, throws, rugs — keep the structure, but replace any kid-themed prints with neutral cream/gray equivalents.
- ALL architecture, fixtures, fans, vents, outlets
- ALL curtains, blinds, lamps
- ALL appliances — refrigerator, range, dishwasher, washer/dryer stay pixel-identical

FRAMING LOCK:
- The output image MUST have the EXACT same framing, crop, zoom level, and camera angle as the input. Do NOT reframe, zoom, pan, or rotate.

REMOVAL QUALITY STANDARD:
- Either erase a detected clutter item COMPLETELY (with seamless fill of the surface behind it), or leave it alone. Never ship partial erasure, half-faded smudges, or ghostly outlines.
- Prefer complete erasure whenever feasible — being too conservative defeats the tool's purpose.
- If a clutter item is reflected in a mirror, erase BOTH the item and its reflection together; never erase only one.

RESTORATION:
- Where items are removed, fill with the surrounding floor/wall/ground texture seamlessly.
- Maintain consistent lighting.
- Aim for a clean, neutral, MLS-ready "vacant" look — buyer-ready and depersonalized.`;

const TWILIGHT_PROMPT = `Convert this daytime exterior real estate photo to a natural twilight / dusk look.

THIS IS A LIGHTING-ONLY EDIT. You are changing ONLY the sky and ambient light.

DO (lighting changes only):
- Replace the sky with a realistic dusk gradient (deep blue to warm orange at horizon)
- Shift ambient light to golden hour — warmer tones, softer shadows
- Make windows that are ALREADY VISIBLE glow with warm interior light
- If exterior lights (porch lights, sconces) ALREADY EXIST in the photo, turn them on

ABSOLUTE PROHIBITIONS — ZERO TOLERANCE:
- Do NOT add ANY new objects. Nothing. Not a single item that is not already in the photo.
- Do NOT add pathway lights, landscape lights, uplights, string lights, lanterns, potted plants, bushes, furniture, planters, or decorative items.
- Do NOT add door handles, house numbers, mailboxes, welcome mats, or any detail not already present.
- Do NOT change the landscaping, yard, driveway, walkways, fencing, or any physical surface.
- Do NOT change, add, or remove any architectural element — windows, doors, trim, siding, roof.
- Do NOT improve or "fix" anything about the house. It must be IDENTICAL except for lighting/sky.

FRAMING:
- Do NOT zoom in. Maintain the EXACT same framing, crop, and field of view. Camera is locked.

Count the objects in the original. The output must have the EXACT same number of objects. If you added anything, you failed.

The result should look like the SAME photo taken at dusk — nothing added, nothing removed, nothing changed except light and sky.`;

const SKY_PROMPT = `Replace ONLY the sky in this exterior real estate photo with a vibrant, deep blue sky with a few fluffy white clouds and brilliant golden sunlight.

PRESERVATION RULES:
- PRESERVE all architecture, rooflines, chimneys, antennas, and structural elements with pixel-perfect edges.
- PRESERVE all trees, landscaping, and foliage — maintain their exact silhouettes against the new sky.
- PRESERVE the ground plane entirely: driveway, walkways, lawn, fencing, vehicles.

BLENDING REQUIREMENTS:
- The horizon line and roofline edges must be razor-sharp with no halos, fringing, or ghosting artifacts.
- Tree branches and leaves must have natural, clean edges against the new sky — no color bleeding.
- The new sky's lighting must affect the building subtly: a deep blue sky should keep the daylight warmth on light-colored surfaces.
- Ensure cloud scale and perspective match the camera's focal length and angle.

ANTI-GHOST RULE:
- Do NOT draw, echo, duplicate, or silhouette the roofline, chimney, or house shape anywhere in the sky region.
- If you see a faint outline of the house shape appearing in the sky, erase it completely — the sky above the roofline must contain ONLY sky and clouds, never a secondary roof outline.`;

// ─── Curated source picks ─────────────────────────────────────────────────

const PICKS = [
  {
    tool: 'staging',
    label: 'Virtual Staging',
    src: join(FIX, 'interiors', 'Lane_Photos_BM8A1572.jpg'),
    why: 'Open, sun-drenched empty kitchen + great room. Big floor area = dramatic empty→staged delta.',
    prompt: STAGING_PROMPT('Living Room'),
    mode: 'edit',
  },
  {
    tool: 'cleanup',
    label: 'Smart Cleanup',
    src: join(FIX, 'interiors', 'Jordan_Roehrenbeck_-_210_Buckland_Cir__Little_Rock__AR_72223_NUR65944.jpg'),
    why: 'Kid bedroom with bunk bed, deer mounts, dressers piled with stuff, kid bedding, scattered clutter — strong before/after.',
    prompt: CLEANUP_PROMPT('Bedroom'),
    mode: 'edit',
  },
  {
    tool: 'twilight',
    label: 'Day to Dusk',
    src: join(FIX, 'twilight', 'Kelly_drone_DJI_20260415190025_0064_D.jpg'),
    why: 'High-end stone French-style estate, full-sun front elevation, drone perspective — ICP-aspirational.',
    prompt: TWILIGHT_PROMPT,
    mode: 'edit',
  },
  {
    tool: 'sky',
    label: 'Sky Replace',
    src: join(FIX, 'sky', 'Kelly_photos_BM8A2227.jpg'),
    why: 'Brick mansion with washed-out pale sky — replacement to crisp deep blue will pop.',
    prompt: SKY_PROMPT,
    mode: 'edit',
  },
];

// ─── Runner ────────────────────────────────────────────────────────────────

async function generateImage(srcPath, prompt, label) {
  const t0 = Date.now();
  // Send the source as JPEG (resize-for-upload to ~2K to match production behavior)
  const inputBuf = await sharp(srcPath)
    .resize({ width: 2048, withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  const inputBase64 = inputBuf.toString('base64');

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/jpeg', data: inputBase64 } },
      ],
    }],
    config: { imageConfig: { numberOfImages: 1 } },
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data,
  );
  if (!imagePart) {
    const errText =
      response.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 200) ||
      'no image returned';
    throw new Error(`Gemini returned no image: ${errText}`);
  }
  const ms = Date.now() - t0;
  console.log(`    [gemini ok] ${label}  ${ms}ms`);
  return Buffer.from(imagePart.inlineData.data, 'base64');
}

async function processPair(pick) {
  const { tool, src, prompt, label } = pick;
  console.log(`\n[${tool}]  source: ${src.replace(ROOT + '/', '')}`);

  // BEFORE — straight resize from source
  const beforeOut = join(OUT, `showcase-${tool}-before.jpg`);
  await sharp(src)
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(beforeOut);
  const beforeSize = (await sharp(beforeOut).metadata());
  console.log(`    [before] ${beforeOut.replace(ROOT + '/', '')}  ${beforeSize.width}x${beforeSize.height}`);

  // AFTER — Gemini generated, then downsize
  const rawAfter = await generateImage(src, prompt, label);
  const afterOut = join(OUT, `showcase-${tool}-after.jpg`);
  await sharp(rawAfter)
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(afterOut);
  const afterSize = await sharp(afterOut).metadata();
  console.log(`    [after]  ${afterOut.replace(ROOT + '/', '')}  ${afterSize.width}x${afterSize.height}`);
}

(async () => {
  console.log('=== Showcase Curator — Part A regen ===');
  for (const pick of PICKS) {
    try {
      await processPair(pick);
    } catch (e) {
      console.error(`  [FAIL] ${pick.tool}: ${e.message}`);
    }
  }
  console.log('\n=== done ===');
})().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
