#!/usr/bin/env node
/**
 * regen-pack-previews.mjs (Showcase Curator pass — April 2026)
 *
 * Replaces public/pack-previews/<slug>.jpg with varied, hand-curated room
 * fixtures matched to each pack's aesthetic — no longer one room for all 7.
 *
 * Mirrors components/StyleControls.tsx::buildPrompt with stageMode='packs'.
 * Output: 1024-wide JPEG q0.85 to public/pack-previews/<slug>.jpg
 */

import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FIX = join(ROOT, 'tests/qa-harness/fixtures', 'interiors');
const OUT = join(ROOT, 'public', 'pack-previews');
mkdirSync(OUT, { recursive: true });

const envLocal = readFileSync(join(ROOT, '.env.local'), 'utf-8');
const apiKey =
  envLocal.match(/^GEMINI_API_KEY=([^\n]+)/m)?.[1] ||
  envLocal.match(/^VITE_GEMINI_API_KEY=([^\n]+)/m)?.[1];
if (!apiKey) throw new Error('No Gemini API key in .env.local');
const ai = new GoogleGenAI({ apiKey });
const MODEL = 'gemini-3.1-flash-image-preview';

// Mirrors StyleControls.tsx::PACK_DETAILS
const PACK_DETAILS = {
  'Coastal Modern':
    'light wood tones, white and sand-colored upholstery, rattan or woven accents, linen textures, soft blue and seafoam accents only in decor items',
  'Urban Loft':
    'dark leather seating, metal and reclaimed wood, concrete-toned accents, warm Edison-style lighting, muted earth tones in decor',
  'Farmhouse Chic':
    'distressed white wood, warm neutral fabrics, shiplap-compatible pieces, antique brass hardware accents, soft cream and sage decor',
  'Minimalist':
    'clean-lined low-profile furniture, neutral whites and warm grays, no clutter, one or two simple accent pieces maximum',
  'Mid-Century Modern':
    'tapered wood legs, warm walnut tones, mustard or teal accent pillows only, organic curved shapes, clean geometry',
  'Scandinavian':
    'pale birch wood, white and light gray upholstery, simple wool throws, minimal greenery, airy and uncluttered',
  'Bohemian':
    'layered textiles, warm terracotta and cream tones, woven rugs, macrame or rattan accents, natural materials',
};

// Curated fixtures — each different room type so the tile grid feels real,
// not a one-room demo reel.
const PICKS = [
  {
    pack: 'Coastal Modern',
    src: 'Lane_Photos_BM8A1572.jpg',
    roomType: 'Living Room',
    why: 'Sun-drenched empty kitchen-living combo, light tile, neutral walls — beachy bones already',
  },
  {
    pack: 'Urban Loft',
    src: 'Jordan_Roehrenbeck_-_210_Buckland_Cir__Little_Rock__AR_72223_NUR66019.jpg',
    roomType: 'Loft',
    why: 'Vaulted attic-style room with sloped ceiling — restage with leather + metal industrial pieces',
  },
  {
    pack: 'Farmhouse Chic',
    src: 'Amber_photos_BM8A5106.jpg',
    roomType: 'Kitchen',
    why: 'Cream cabinets, white kitchen with window over sink, dining nook — natural farmhouse base',
  },
  {
    pack: 'Minimalist',
    src: 'Rj_hawk_-_1612_Sorrel__Benton__AR_72015_NUR66220.jpg',
    roomType: 'Bedroom',
    why: 'Bedroom with tray ceiling, light wood floor, large window — restage clean low-profile',
  },
  {
    pack: 'Mid-Century Modern',
    src: 'Jordan_Roehrenbeck_-_210_Buckland_Cir__Little_Rock__AR_72223_NUR65769.jpg',
    roomType: 'Primary Bedroom',
    why: 'Master with tray ceiling, light wood floor — restage with walnut, mustard accents',
  },
  {
    pack: 'Scandinavian',
    src: 'Brandon_B_NUR64458.jpg',
    roomType: 'Bedroom',
    why: 'Bedroom with light wood floor and big window — restage pale birch + white linens',
  },
  {
    pack: 'Bohemian',
    src: 'Lane_Photos_BM8A1577.jpg',
    roomType: 'Dining Room',
    why: 'Open kitchen-living with tile floor — stage Bohemian dining lounge with terracotta + woven',
  },
];

const slugify = (name) => name.toLowerCase().replace(/\s+/g, '-');

function buildPrompt(packName, roomType) {
  const details = PACK_DETAILS[packName];
  return `Virtually stage this ${roomType} in ${packName} style. Add only furniture and decor. Style DNA: ${details}.

HARD PRESERVATION RULES — these override any instinct to "improve" the room:
- DO NOT modify, replace, or restyle any cabinets, vanities, built-ins, or millwork. Existing cabinet color, wood tone, and door style stay identical.
- DO NOT modify any appliances (refrigerator, range, dishwasher, washer, dryer, microwave, hood). If an appliance is present in the photo, it stays pixel-identical in the output.
- DO NOT change plumbing fixtures (toilets, sinks, tubs, showers, faucets). Bathrooms keep their existing fixtures — add only accessories (towels, soap, decor).
- DO NOT modify windows, doors, door trim, baseboards, crown molding, flooring, floor color, wall color, or ceiling.
- DO NOT change the camera framing, crop, angle, or field of view. Room dimensions stay the same.
- If the room is narrow, awkward, or small, stage within its actual footprint — do NOT extend walls or rearrange architecture to accommodate new furniture.
- Stage based on what the image actually shows, not what the room label suggests.`;
}

async function renderPack(srcPath, packName, roomType) {
  // Match production: send a normalized JPEG.
  const inputBuf = await sharp(srcPath)
    .resize({ width: 2048, withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  const base64 = inputBuf.toString('base64');

  const prompt = buildPrompt(packName, roomType);
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/jpeg', data: base64 } },
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
    throw new Error(errText);
  }
  return Buffer.from(imagePart.inlineData.data, 'base64');
}

async function processPack(pick) {
  const { pack, src, roomType } = pick;
  const slug = slugify(pack);
  const srcPath = join(FIX, src);
  const outPath = join(OUT, `${slug}.jpg`);
  const t0 = Date.now();
  process.stdout.write(`  ${pack.padEnd(20)} (${src}) ...`);
  try {
    const rawBuf = await renderPack(srcPath, pack, roomType);
    // Resize to 1024 wide, JPEG q0.85
    await sharp(rawBuf)
      .resize({ width: 1024, withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(outPath);
    const meta = await sharp(outPath).metadata();
    const ms = Date.now() - t0;
    console.log(` ok  ${meta.width}x${meta.height}  ${ms}ms`);
    return { pack, slug, status: 'ok' };
  } catch (e) {
    console.log(` FAIL  ${e.message}`);
    return { pack, slug, status: 'fail', err: e.message };
  }
}

(async () => {
  console.log('=== Showcase Curator — Part B pack previews ===');
  const results = [];
  for (const pick of PICKS) {
    results.push(await processPack(pick));
  }
  console.log('\n=== Summary ===');
  for (const r of results) {
    console.log(r.status === 'ok' ? `  [ok]   ${r.slug}.jpg` : `  [FAIL] ${r.slug} — ${r.err}`);
  }
  const failed = results.filter((r) => r.status !== 'ok');
  if (failed.length) process.exit(1);
})().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
