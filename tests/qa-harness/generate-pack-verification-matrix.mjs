#!/usr/bin/env node
/**
 * generate-pack-verification-matrix.mjs
 *
 * One-shot script: renders the full 7×3 pack verification matrix.
 * 7 style packs × 3 canonical rooms (Living Room, Bedroom, Kitchen) = 21 renders.
 *
 * Uses the exact v2 hardened prompt block from components/StyleControls.tsx
 * (stageMode='packs') so the matrix reflects production behavior.
 *
 * Run locally when adding a new pack or updating pack DNA:
 *   node tests/qa-harness/generate-pack-verification-matrix.mjs
 *
 * Outputs:
 *   public/pack-verification/renders/<room-slug>__<pack-slug>.jpg   (21 files, 1024w JPEG q=0.85)
 *   public/pack-verification/manifest.json                          (metadata for Admin UI)
 *
 * Phase 2 future work: wrap this as an async Vercel worker
 * (/api/regen-pack-matrix) backed by a pack_matrix_jobs table so admins can
 * trigger a refresh from the browser. For MVP, run locally and commit the
 * PNG/JPEG output — renders survive deploys as static assets.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { GoogleGenAI } from '@google/genai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// --- API key: same resolution pattern as run-qa.mjs + generate-pack-previews.mjs
const envLocal = readFileSync(join(ROOT, '.env.local'), 'utf-8');
const apiKey = envLocal.match(/GEMINI_API_KEY=([^\n]+)/)?.[1]
    || envLocal.match(/VITE_GEMINI_API_KEY=([^\n]+)/)?.[1];
if (!apiKey) throw new Error('Could not find Gemini API key in .env.local');
const ai = new GoogleGenAI({ apiKey });

// --- Canonical rooms (mirrored in public/pack-verification/rooms/)
// Picked for: (a) neutral palettes, (b) empty or lightly furnished footprints,
// (c) single-purpose geometry so pack DNA is clearly readable — open-concept
// rooms confuse packs (they try to stage every zone).
// Fix 1 (2026-04-18): Swapped open-concept LR → pure empty LR (Amber_photos
// BM8A4996) and Kitchen slot → Primary Bedroom (BM8A5021). Kitchens are a
// poor pack canvas because packs place furniture, not decor; see Fix 2 for
// the decor-only prompt branch that handles Kitchen/Bathroom in production.
const ROOMS = [
    { slug: 'living-room',     label: 'Living Room',     file: 'living-room.jpg' },
    { slug: 'bedroom',         label: 'Bedroom',         file: 'bedroom.jpg' },
    { slug: 'primary-bedroom', label: 'Primary Bedroom', file: 'primary-bedroom.jpg' },
];

// --- PACK_DETAILS: mirrors components/StyleControls.tsx line 178 exactly.
// If StyleControls.tsx changes, update both places.
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

// --- Pack tier table (Fix 2): mirrors StyleControls.tsx packTierFor()
// - 'furniture' → full furniture staging + HARD PRESERVATION RULES
// - 'decor-only' → accessories only (Kitchen / Bathroom / Laundry)
// - 'disabled' → gated in the UI, generator skips as a safety net
const PACK_TIER = {
    'Living Room':     'furniture',
    'Bedroom':         'furniture',
    'Primary Bedroom': 'furniture',
    'Dining Room':     'furniture',
    'Office':          'furniture',
    'Nursery':         'furniture',
    'Kitchen':         'decor-only',
    'Bathroom':        'decor-only',
    'Laundry Room':    'decor-only',
    'Exterior':        'disabled',
    'Patio':           'disabled',
    'Garage':          'disabled',
    'Basement':        'disabled',
    'Closet':          'disabled',
};

// --- buildPrompt: mirrors StyleControls.tsx stageMode='packs' branch exactly.
function buildPrompt(packName, roomLabel) {
    const details = PACK_DETAILS[packName];
    const tier = PACK_TIER[roomLabel] || 'furniture';

    if (tier === 'decor-only') {
        return `Add ${packName}-style decor accents to this ${roomLabel}. The pack is expressed through accessories ONLY — not furniture. Style DNA: ${details}.

HARD PRESERVATION RULES — these override any instinct to "improve" the room:
- DO NOT replace, restyle, recolor, or modify any cabinets, vanities, built-ins, countertops, backsplashes, islands, or millwork — they stay pixel-identical.
- DO NOT modify any appliances (refrigerator, range, dishwasher, washer, dryer, microwave, hood). Every appliance stays pixel-identical.
- DO NOT modify plumbing fixtures (toilets, sinks, tubs, showers, faucets). Every fixture stays pixel-identical.
- DO NOT modify windows, doors, door trim, baseboards, crown molding, flooring, wall color, or ceiling.
- DO NOT change the camera framing, crop, angle, or field of view.
- Add ONLY decor accents matching the pack DNA — for example: pendant-light styling, barstool cushions, dish towels, fruit bowls, potted herbs, window treatments, soap dispensers, towel sets, framed art, small plants.
- Do NOT place sofas, beds, dining tables, chairs, rugs larger than a runner, or any other primary furniture.
- Stage based on what the image actually shows, not what the room label suggests.`;
    }

    // 'furniture' tier — default (also safe fallback for unknown room types).
    return `Virtually stage this ${roomLabel} in ${packName} style. Add only furniture and decor. Style DNA: ${details}.

HARD PRESERVATION RULES — these override any instinct to "improve" the room:
- DO NOT modify, replace, or restyle any cabinets, vanities, built-ins, or millwork. Existing cabinet color, wood tone, and door style stay identical.
- DO NOT modify any appliances (refrigerator, range, dishwasher, washer, dryer, microwave, hood). If an appliance is present in the photo, it stays pixel-identical in the output.
- DO NOT change plumbing fixtures (toilets, sinks, tubs, showers, faucets). Bathrooms keep their existing fixtures — add only accessories (towels, soap, decor).
- DO NOT modify windows, doors, door trim, baseboards, crown molding, flooring, floor color, wall color, or ceiling.
- DO NOT change the camera framing, crop, angle, or field of view. Room dimensions stay the same.
- If the room is narrow, awkward, or small, stage within its actual footprint — do NOT extend walls or rearrange architecture to accommodate new furniture.
- Stage based on what the image actually shows, not what the room label suggests.`;
}

// --- Gemini render with ONE retry on transient errors / empty response
async function renderOnce(packName, roomLabel, inputBase64) {
    const prompt = buildPrompt(packName, roomLabel);
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

async function renderWithRetry(packName, roomLabel, inputBase64, retries = 1) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const buf = await renderOnce(packName, roomLabel, inputBase64);
            return { buf, attempt };
        } catch (e) {
            lastErr = e;
            if (attempt < retries) {
                await new Promise((r) => setTimeout(r, 1500));
            }
        }
    }
    throw lastErr;
}

async function resizeTo1024(buffer) {
    const img = await loadImage(buffer);
    // Gemini typically returns ~1264x843 already — close to 1024w. If the
    // source is within 1.3× the target, keep it native so we don't throw
    // away detail to the JPEG encoder (which dropped 700KB → 7KB at q=0.85
    // and triggered "low resolution / pixelation" scorer complaints).
    if (img.width <= 1024 * 1.3) {
        return { buf: buffer, w: img.width, h: img.height };
    }
    const targetW = 1024;
    const targetH = Math.round(img.height * (targetW / img.width));
    const canvas = createCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);
    // q=0.92 preserves more detail than 0.85 while keeping file size
    // reasonable (~100-150KB).
    return { buf: canvas.toBuffer('image/jpeg', 0.92), w: targetW, h: targetH };
}

async function loadRoomAsBase64(roomFile) {
    const path = join(ROOT, 'public', 'pack-verification', 'rooms', roomFile);
    if (!existsSync(path)) throw new Error(`Missing room fixture: ${path}`);
    const buf = readFileSync(path);
    const img = await loadImage(buf);
    // Re-encode as JPEG q=0.9 to normalize upload size (matches prod pattern).
    const canvas = createCanvas(img.width, img.height);
    canvas.getContext('2d').drawImage(img, 0, 0);
    const jpeg = canvas.toBuffer('image/jpeg', 0.9);
    return { base64: jpeg.toString('base64'), w: img.width, h: img.height };
}

async function main() {
    console.log('[pack-matrix] generating 7 packs × 3 rooms = 21 renders');
    const outDir = join(ROOT, 'public', 'pack-verification', 'renders');
    mkdirSync(outDir, { recursive: true });

    // Pre-load all 3 room inputs as base64
    const roomInputs = {};
    for (const room of ROOMS) {
        const { base64, w, h } = await loadRoomAsBase64(room.file);
        roomInputs[room.slug] = { base64, w, h };
        console.log(`  room fixture: ${room.slug} (${w}x${h})`);
    }

    const packs = Object.keys(PACK_DETAILS);
    const cells = [];
    let ok = 0, fail = 0, retries = 0;

    for (const room of ROOMS) {
        for (const pack of packs) {
            const packSlug = slugify(pack);
            const outName = `${room.slug}__${packSlug}.jpg`;
            const outPath = join(outDir, outName);
            const t0 = Date.now();
            process.stdout.write(`  ${room.slug} × ${pack} → ${outName} ...`);
            try {
                const { buf: rawBuf, attempt } = await renderWithRetry(
                    pack, room.label, roomInputs[room.slug].base64, 1
                );
                if (attempt > 0) retries += attempt;
                const { buf, w, h } = await resizeTo1024(rawBuf);
                writeFileSync(outPath, buf);
                const kb = Math.round(buf.length / 1024);
                const ms = Date.now() - t0;
                console.log(` ok  ${w}x${h}  ${kb}KB  ${ms}ms${attempt > 0 ? ` (retry ×${attempt})` : ''}`);
                cells.push({
                    roomSlug: room.slug,
                    roomLabel: room.label,
                    pack,
                    packSlug,
                    status: 'ok',
                    file: `renders/${outName}`,
                    w, h, kb, ms,
                    retries: attempt,
                });
                ok++;
            } catch (e) {
                console.log(` FAIL  ${e.message}`);
                cells.push({
                    roomSlug: room.slug,
                    roomLabel: room.label,
                    pack,
                    packSlug,
                    status: 'fail',
                    error: e.message,
                });
                fail++;
            }
        }
    }

    const manifest = {
        generatedAt: new Date().toISOString(),
        model: 'gemini-3.1-flash-image-preview',
        rooms: ROOMS.map((r) => ({ ...r, path: `rooms/${r.file}` })),
        packs: packs.map((p) => ({ name: p, slug: slugify(p), dna: PACK_DETAILS[p] })),
        cells,
        stats: { ok, fail, retries, total: cells.length },
    };

    const manifestPath = join(ROOT, 'public', 'pack-verification', 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\n=== SUMMARY ===`);
    console.log(`  ok: ${ok}  fail: ${fail}  retries: ${retries}  total: ${cells.length}`);
    console.log(`  manifest: ${manifestPath}`);

    if (fail > 0) {
        console.log(`\n${fail} cell(s) failed. Re-run to retry.`);
        process.exit(1);
    }
    console.log('\nMatrix complete.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
