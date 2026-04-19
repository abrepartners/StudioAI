#!/usr/bin/env node
/**
 * generate-pack-previews.mjs (Cluster G / D7)
 *
 * One-shot script: renders a single reference preview per Style Pack using
 * the same v2 hardened prompt block that production uses in
 * components/StyleControls.tsx::buildPrompt. Writes 7 JPEGs (1024 wide,
 * quality 0.85) to public/pack-previews/<slug>.jpg.
 *
 * Usage:
 *   node tests/qa-harness/generate-pack-previews.mjs
 *
 * Why: pack tiles in the UI currently show icon+text only. Users click
 * blind. Static previews swap the tile to the real render so pack choice
 * is visual.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { GoogleGenAI } from '@google/genai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Same key resolution as run-qa.mjs
const envLocal = readFileSync(join(ROOT, '.env.local'), 'utf-8');
const apiKey = envLocal.match(/GEMINI_API_KEY=([^\n]+)/)?.[1]
    || envLocal.match(/VITE_GEMINI_API_KEY=([^\n]+)/)?.[1];
if (!apiKey) throw new Error('Could not find Gemini API key in .env.local');
const ai = new GoogleGenAI({ apiKey });

// --- Reference fixture: Lane_Photos_BM8A1572.jpg
// Clean, neutral, large empty living area, light tile floor, gray walls,
// windows + slider + ceiling fan. Same fixture used for all 7 packs so the
// preview tiles are visually consistent (only style changes, not room).
const FIXTURE = join(
    __dirname,
    'fixtures',
    'interiors',
    'Lane_Photos_BM8A1572.jpg'
);

// Mirrors StyleControls.tsx::PACK_DETAILS exactly
const PACK_DETAILS = {
    'Coastal Modern': 'light wood tones, white and sand-colored upholstery, rattan or woven accents, linen textures, soft blue and seafoam accents only in decor items',
    'Urban Loft': 'dark leather seating, metal and reclaimed wood, concrete-toned accents, warm Edison-style lighting, muted earth tones in decor',
    'Farmhouse Chic': 'distressed white wood, warm neutral fabrics, shiplap-compatible pieces, antique brass hardware accents, soft cream and sage decor',
    'Minimalist': 'clean-lined low-profile furniture, neutral whites and warm grays, no clutter, one or two simple accent pieces maximum',
    'Mid-Century Modern': 'tapered wood legs, warm walnut tones, mustard or teal accent pillows only, organic curved shapes, clean geometry',
    'Scandinavian': 'pale birch wood, white and light gray upholstery, simple wool throws, minimal greenery, airy and uncluttered',
    'Bohemian': 'layered textiles, warm terracotta and cream tones, woven rugs, macrame or rattan accents, natural materials',
};

const slugify = (name) => name.toLowerCase().replace(/\s+/g, '-');

// Match the v2 hardened buildPrompt block in StyleControls.tsx for stageMode='packs'
function buildPrompt(packName, roomType = 'Living Room') {
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

async function renderPack(packName, inputBase64) {
    const prompt = buildPrompt(packName);
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: [{
            parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: inputBase64 } },
            ],
        }],
        config: { imageConfig: { numberOfImages: 1 } },
    });
    const imagePart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!imagePart) {
        const errText = response.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 200) || 'no image returned';
        throw new Error(errText);
    }
    return Buffer.from(imagePart.inlineData.data, 'base64');
}

// Resize to 1024 wide, maintain aspect, output JPEG 0.85
async function resizeTo1024(buffer) {
    const img = await loadImage(buffer);
    const targetW = 1024;
    const targetH = Math.round(img.height * (targetW / img.width));
    const canvas = createCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return { buf: canvas.toBuffer('image/jpeg', 0.85), w: targetW, h: targetH };
}

async function main() {
    console.log(`[pack-previews] fixture: ${FIXTURE}`);
    const inputBuffer = readFileSync(FIXTURE);
    const inputImg = await loadImage(inputBuffer);
    console.log(`[pack-previews] input dims: ${inputImg.width}x${inputImg.height}`);

    // Normalize input to a reasonable size for Gemini (reduces upload; matches prod)
    const normCanvas = createCanvas(inputImg.width, inputImg.height);
    normCanvas.getContext('2d').drawImage(inputImg, 0, 0);
    const inputJpeg = normCanvas.toBuffer('image/jpeg', 0.9);
    const inputBase64 = inputJpeg.toString('base64');

    const outDir = join(ROOT, 'public', 'pack-previews');
    mkdirSync(outDir, { recursive: true });

    const packs = Object.keys(PACK_DETAILS);
    const results = [];

    // Render sequentially — 7 calls at most, no need to blast the API
    for (const pack of packs) {
        const slug = slugify(pack);
        const outPath = join(outDir, `${slug}.jpg`);
        const t0 = Date.now();
        process.stdout.write(`  ${pack} → ${slug}.jpg ...`);
        try {
            const rawBuf = await renderPack(pack, inputBase64);
            const { buf, w, h } = await resizeTo1024(rawBuf);
            writeFileSync(outPath, buf);
            const kb = Math.round(buf.length / 1024);
            const ms = Date.now() - t0;
            console.log(` ok  ${w}x${h}  ${kb}KB  ${ms}ms`);
            results.push({ pack, slug, status: 'ok', path: outPath, w, h, kb });
        } catch (e) {
            console.log(` FAIL  ${e.message}`);
            results.push({ pack, slug, status: 'fail', error: e.message });
        }
    }

    console.log('\n=== SUMMARY ===');
    for (const r of results) {
        console.log(r.status === 'ok'
            ? `  [ok]   ${r.slug}.jpg  (${r.w}x${r.h}, ${r.kb}KB)`
            : `  [FAIL] ${r.slug}  — ${r.error}`);
    }
    const failed = results.filter((r) => r.status !== 'ok');
    if (failed.length) {
        console.log(`\n${failed.length} pack(s) failed.`);
        process.exit(1);
    }
    console.log('\nAll packs rendered.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
