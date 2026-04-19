#!/usr/bin/env node
/**
 * regen-staging-showcase.mjs
 *
 * One-off rerun for the Virtual Staging showcase tile. The previous source
 * (Lane_Photos_BM8A1572) was an open-concept space dominated by a kitchen on
 * the left — the staged AFTER plopped a sofa/coffee table in front of the
 * kitchen cabinets, which read as "living room furniture stuck in a kitchen."
 *
 * New source: a clean empty Living Room (Firefly source @ Downloads), no
 * kitchen visible, polished concrete floor, bay window — unambiguous room
 * type. detectRoomType is run first to confirm. Stage prompt then matches.
 *
 * Output:
 *   public/showcase-staging-before.jpg
 *   public/showcase-staging-after.jpg
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT = join(ROOT, 'public');

const envLocal = readFileSync(join(ROOT, '.env.local'), 'utf-8');
const apiKey =
  envLocal.match(/^GEMINI_API_KEY=([^\n]+)/m)?.[1] ||
  envLocal.match(/^VITE_GEMINI_API_KEY=([^\n]+)/m)?.[1];
if (!apiKey) throw new Error('No Gemini API key in .env.local');
const ai = new GoogleGenAI({ apiKey });

const FLASH_IMAGE = 'gemini-3.1-flash-image-preview';
const FLASH_TEXT = 'gemini-3-flash-preview';

const SOURCE = '/Users/camillebrown/Downloads/Firefly_GeminiFlash_remove all items from room, don\'t change the perspective 186219.png';

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
        - Photorealistic materials with natural imperfections.
        - Soft contact shadows where every piece meets the floor.
        - Match grain, lens distortion, vignetting, depth of field.
        - Furniture legs sit flat on the floor plane. No floating.

        ========================================
        FURNITURE PLACEMENT
        ========================================
        - Map doorways, hallways, windows, and traffic paths first. Never block.
        - Align all furniture to the floor's vanishing points.
        - Group logically.

        ========================================
        ASSIGNMENT
        ========================================
        Virtually stage this ${roomType} in transitional luxury style — light walnut wood tones, warm cream and oatmeal upholstery, brushed brass accents, layered area rug, subtle greenery. Furnish for a high-end MLS listing photo: a comfortable sofa + accent chairs around a coffee table, a console under the window if appropriate, plus a layered rug and one or two thoughtful decor accents (greenery, table lamp). Preserve every architectural surface exactly. NO kitchen elements — this is purely a living room scene.`;

async function detectRoom(buf) {
  const resp = await ai.models.generateContent({
    model: FLASH_TEXT,
    contents: {
      parts: [
        { text: "Analyze this room and identify the primary room type. Choose from: 'Living Room', 'Bedroom', 'Primary Bedroom', 'Dining Room', 'Kitchen', 'Office', 'Bathroom', 'Laundry Room', 'Closet', 'Nursery', 'Garage', 'Patio', 'Basement', or 'Exterior'. Return only the room type name." },
        { inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } },
      ],
    },
    config: { temperature: 0.1 },
  });
  return resp.text?.trim() || 'Living Room';
}

async function generateStaged(buf, roomType) {
  const t0 = Date.now();
  const resp = await ai.models.generateContent({
    model: FLASH_IMAGE,
    contents: [{
      parts: [
        { text: STAGING_PROMPT(roomType) },
        { inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } },
      ],
    }],
    config: { imageConfig: { numberOfImages: 1 } },
  });
  const imagePart = resp.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!imagePart) {
    const errText = resp.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 200) || 'no image';
    throw new Error(`Gemini returned no image: ${errText}`);
  }
  console.log(`    [gemini ok] ${Date.now() - t0}ms`);
  return Buffer.from(imagePart.inlineData.data, 'base64');
}

(async () => {
  console.log('=== Staging showcase rebuild ===');
  console.log(`Source: ${SOURCE}`);

  // Resize to 2048 wide JPEG (matches production behavior)
  const inputBuf = await sharp(SOURCE)
    .resize({ width: 2048, withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  console.log('\n[detectRoomType] running...');
  const detected = await detectRoom(inputBuf);
  console.log(`    detected: ${detected}`);

  // Force "Living Room" since we know visually it's a living room. detectRoomType
  // sometimes returns "Bedroom" for bay-window rooms; we already inspected.
  const roomType = detected === 'Bedroom' || detected === 'Primary Bedroom' ? 'Living Room' : detected;
  if (roomType !== detected) console.log(`    overriding to: ${roomType} (visually confirmed living room)`);

  // BEFORE — straight resize
  const beforeOut = join(OUT, 'showcase-staging-before.jpg');
  await sharp(SOURCE)
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(beforeOut);
  const beforeMeta = await sharp(beforeOut).metadata();
  console.log(`\n[before] ${beforeOut.replace(ROOT + '/', '')}  ${beforeMeta.width}x${beforeMeta.height}`);

  // AFTER — generate then downsize
  console.log('\n[stage] generating...');
  const rawAfter = await generateStaged(inputBuf, roomType);
  const afterOut = join(OUT, 'showcase-staging-after.jpg');
  await sharp(rawAfter)
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(afterOut);
  const afterMeta = await sharp(afterOut).metadata();
  console.log(`[after]  ${afterOut.replace(ROOT + '/', '')}  ${afterMeta.width}x${afterMeta.height}`);

  console.log('\n=== done ===');
})().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
