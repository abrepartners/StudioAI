#!/usr/bin/env node
/**
 * real-world/run-renovation-scenarios.mjs
 *
 * Runs 10 adversarial scenarios through the production `virtualRenovation`
 * prompt + production Phase C composite. Mirrors run-qa.mjs + the cleanup
 * scenario runner byte-for-byte on the core pipeline so results reflect ship.
 *
 * Prompt is imported (copy-mirrored) from run-qa.mjs's buildRenovationPrompt so
 * we only maintain it in one place. If services/geminiService.ts changes, mirror
 * the update there and in run-qa.mjs; this file will pick it up automatically.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import pixelmatch from 'pixelmatch';
import { GoogleGenAI } from '@google/genai';

// Mirror the dynamic preserve-list strategy in
// services/geminiService.ts::virtualRenovation. Kept inlined (not imported from
// run-qa.mjs) so this runner is side-effect-free and the scenario suite can be
// run standalone without triggering a QA batch.
const RENO_SURFACES = [
    { key: 'walls',         label: 'Walls',          description: 'wall paint color, wall texture, wall finish' },
    { key: 'cabinets',      label: 'Cabinets',       description: 'cabinet doors, drawer fronts, cabinet boxes, hardware' },
    { key: 'countertops',   label: 'Countertops',    description: 'counter surface material, color, edge profile' },
    { key: 'backsplash',    label: 'Backsplash',     description: 'tile, pattern, grout between cabinets and countertop' },
    { key: 'flooring',      label: 'Flooring',       description: 'floor material, plank/tile pattern, floor color' },
    { key: 'fixtures',      label: 'Fixtures',       description: 'faucets, sinks, toilets, tub, shower, vanity hardware' },
    { key: 'lightFixtures', label: 'Light Fixtures', description: 'pendants, chandeliers, ceiling fans, sconces, recessed trim' },
];
function buildRenovationPrompt(changes) {
    const apply = RENO_SURFACES.filter((s) => changes[s.key] && String(changes[s.key]).trim().length > 0);
    const preserve = RENO_SURFACES.filter((s) => !changes[s.key] || String(changes[s.key]).trim().length === 0);
    const applyBlock = apply.map((s) => `- ${s.label}: REPLACE with "${String(changes[s.key]).trim()}"`).join('\n');
    const preserveBlock = preserve.map((s) => `- ${s.label} (${s.description}) — DO NOT TOUCH. Copy pixel-identical from input.`).join('\n')
        || '- (none — all renovation surfaces are being changed)';
    return `You are a Master Architectural Photo Editor producing a virtual renovation preview for a real estate listing. This is a SURGICAL edit — you modify ONLY the surfaces listed under CHANGE, and nothing else.

===========================================
SURFACES YOU MUST NOT TOUCH (explicit preserve list):
===========================================
${preserveBlock}

For every item above, the output pixels MUST match the input pixels. If you replace, recolor, or restyle any of these you have failed the task.

===========================================
SURFACES YOU MUST CHANGE:
===========================================
${applyBlock}

Rules for the CHANGE list:
- Every listed surface in the output MUST visibly differ from the input.
- Match the described finish exactly (color, material, pattern).
- Do not half-apply. A wall change means the ENTIRE wall plane is the new color, not just a patch.
- Do not stylize. This is a straight material swap, not a redesign.

===========================================
ABSOLUTE PRESERVATION LOCK (regardless of CHANGE list):
===========================================
- Framing, crop, zoom, camera angle, focal length — IDENTICAL to input. Camera is locked.
- Room layout, architecture, walls' positions, ceiling height — unchanged.
- Doors, windows, window treatments (blinds/curtains), trim, molding, baseboards — unchanged.
- Vents, outlets, switches, thermostats — unchanged.
- ALL furniture — couches, beds, tables, chairs, dressers, TVs, lamps, rugs — unchanged (same position, color, style).
- ALL appliances — refrigerator, range, microwave, dishwasher, washer/dryer — unchanged.
- ALL decor — art, plants, books, bedding, pillows — unchanged.
- Any personal items / clutter in the input stay in the output. This tool does NOT declutter.
- The mirror test: if you stack the input and the output, ONLY the surfaces in the CHANGE list should differ. Everything else must overlay pixel-for-pixel.

===========================================
QUALITY RULES FOR THE CHANGED SURFACES:
===========================================
- Material realism: wood grain direction, stone veining, grout lines, edge profiles.
- Lighting continuity: new surfaces reflect the existing ambient light direction + color temperature. Glossy surfaces pick up the existing window reflections; matte surfaces absorb light naturally.
- Seamless transitions where new materials meet preserved elements (trim, caulk, edge treatments).
- Perspective: new elements follow the original vanishing points and lens distortion.
- Shadows cast by preserved objects onto changed surfaces should remain plausible.

Return the edited image. Do not return text, do not decline, do not explain.`;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const FIXTURES = join(__dirname, '..', 'fixtures');
const OUT_DIR = __dirname;

const envLocal = readFileSync(join(ROOT, '.env.local'), 'utf-8');
const apiKey =
    envLocal.match(/GEMINI_API_KEY=([^\n]+)/)?.[1] ||
    envLocal.match(/VITE_GEMINI_API_KEY=([^\n]+)/)?.[1];
if (!apiKey) throw new Error('Could not find Gemini API key in .env.local');
const ai = new GoogleGenAI({ apiKey });

const scenarios = JSON.parse(readFileSync(join(OUT_DIR, 'renovation-scenarios.json'), 'utf-8'));
const assetsDir = join(OUT_DIR, 'renovation-assets');
const resultsFile = join(OUT_DIR, 'renovation-results.json');
mkdirSync(assetsDir, { recursive: true });

// Composite parameters tuned for renovation (matches RENOVATION_COMPOSITE in
// components/SpecialModesPanel.tsx). Unlike cleanup, renovation must pass WHOLE
// surface planes (wall paint, backsplash tile, floor material) through the
// composite. Cleanup's defaults (0.15 / 1 / 24) filter out subtle-but-real
// color shifts like a blue-gray → warm-gray wall repaint. These values let
// medium-magnitude changes through while still blending the furniture/decor
// regions back from the input for pixel-sharp preservation.
const THRESHOLD = 0.03;   // very sensitive — subtle wall repaints (blue-gray → warm gray) need to pass
const DILATE_PX = 8;      // grow mask outward so whole surface planes pass
const FEATHER_PX = 12;    // tighter blend boundary so new materials don't bleed

async function runScenario(sc) {
    const t0 = Date.now();
    const inputPath = join(FIXTURES, sc.fixture);
    const inputBuffer = readFileSync(inputPath);
    const inputImg = await loadImage(inputBuffer);
    const W = inputImg.width, H = inputImg.height;
    const inCanvas = createCanvas(W, H);
    inCanvas.getContext('2d').drawImage(inputImg, 0, 0);
    const inJpeg = inCanvas.toBuffer('image/jpeg');
    const inBase64 = inJpeg.toString('base64');

    const prompt = buildRenovationPrompt(sc.changes);
    let geminiBuffer = null;
    let geminiErr = null;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: inBase64 } }] }],
            config: { imageConfig: { numberOfImages: 1 } },
        });
        const imagePart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
        if (imagePart) geminiBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
        else geminiErr = response.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 200) || 'no image part';
    } catch (e) {
        geminiErr = e.message;
    }

    const elapsed = Date.now() - t0;
    const safe = sc.id;
    const inputOut = join(assetsDir, `${safe}__input.jpg`);
    writeFileSync(inputOut, inJpeg);

    if (!geminiBuffer) {
        return { scenario: sc, status: 'gemini_failed', error: geminiErr, elapsed, inputPath: inputOut };
    }

    const gImg = await loadImage(geminiBuffer);
    const gW = gImg.width, gH = gImg.height;
    const geminiOut = join(assetsDir, `${safe}__gemini.png`);
    writeFileSync(geminiOut, geminiBuffer);

    // --- Composite (mirrors stackComposite.ts + run-qa.mjs) ---
    const priorAtG = createCanvas(gW, gH);
    const pagCtx = priorAtG.getContext('2d');
    pagCtx.imageSmoothingEnabled = true;
    pagCtx.drawImage(inputImg, 0, 0, gW, gH);
    const priorData = pagCtx.getImageData(0, 0, gW, gH);

    const gCanvas = createCanvas(gW, gH);
    gCanvas.getContext('2d').drawImage(gImg, 0, 0);
    const gData = gCanvas.getContext('2d').getImageData(0, 0, gW, gH);

    const diffOut = pagCtx.createImageData(gW, gH);
    pixelmatch(priorData.data, gData.data, diffOut.data, gW, gH, {
        threshold: THRESHOLD, includeAA: false, diffMask: true, diffColor: [255, 255, 255], alpha: 0,
    });

    let changedPixels = 0;
    const maskCanvas = createCanvas(gW, gH);
    const maskCtx = maskCanvas.getContext('2d');
    const maskImg = maskCtx.createImageData(gW, gH);
    for (let i = 0; i < diffOut.data.length; i += 4) {
        const isDiff = diffOut.data[i] + diffOut.data[i + 1] + diffOut.data[i + 2] > 0;
        if (isDiff) changedPixels++;
        const v = isDiff ? 255 : 0;
        maskImg.data[i] = v; maskImg.data[i + 1] = v; maskImg.data[i + 2] = v; maskImg.data[i + 3] = 255;
    }
    maskCtx.putImageData(maskImg, 0, 0);

    const rawChange = changedPixels / (gW * gH);
    // Renovation can legitimately be a full-gut; allow up to ~97% change before we bail.
    const bailed = rawChange < 0.001 || rawChange > 0.97;

    if (!bailed && DILATE_PX > 0) {
        maskCtx.filter = `blur(${DILATE_PX}px)`;
        maskCtx.drawImage(maskCanvas, 0, 0);
        maskCtx.filter = 'none';
        const d = maskCtx.getImageData(0, 0, gW, gH);
        for (let i = 0; i < d.data.length; i += 4) {
            const on = d.data[i] > 20 ? 255 : 0;
            d.data[i] = on; d.data[i + 1] = on; d.data[i + 2] = on; d.data[i + 3] = 255;
        }
        maskCtx.putImageData(d, 0, 0);
    }

    const upMask = createCanvas(W, H);
    const upCtx = upMask.getContext('2d');
    upCtx.imageSmoothingEnabled = true;
    upCtx.drawImage(maskCanvas, 0, 0, W, H);
    if (FEATHER_PX > 0) {
        upCtx.filter = `blur(${FEATHER_PX}px)`;
        upCtx.drawImage(upMask, 0, 0);
        upCtx.filter = 'none';
    }
    const feather = upCtx.getImageData(0, 0, W, H).data;

    const priorFull = createCanvas(W, H);
    priorFull.getContext('2d').drawImage(inputImg, 0, 0);
    const priorFullData = priorFull.getContext('2d').getImageData(0, 0, W, H).data;

    const gUp = createCanvas(W, H);
    const gUpCtx = gUp.getContext('2d');
    gUpCtx.imageSmoothingEnabled = true;
    gUpCtx.drawImage(gImg, 0, 0, W, H);
    const gUpData = gUpCtx.getImageData(0, 0, W, H).data;

    const outCanvas = createCanvas(W, H);
    const outCtx = outCanvas.getContext('2d');
    const outImage = outCtx.createImageData(W, H);
    const oD = outImage.data;
    let outsideMse = 0, outsideCount = 0;
    for (let i = 0; i < oD.length; i += 4) {
        const a = bailed ? 1 : feather[i] / 255;
        const inv = 1 - a;
        if (bailed) {
            oD[i] = gUpData[i]; oD[i + 1] = gUpData[i + 1]; oD[i + 2] = gUpData[i + 2];
        } else {
            oD[i] = priorFullData[i] * inv + gUpData[i] * a;
            oD[i + 1] = priorFullData[i + 1] * inv + gUpData[i + 1] * a;
            oD[i + 2] = priorFullData[i + 2] * inv + gUpData[i + 2] * a;
        }
        oD[i + 3] = 255;
        if (!bailed && a < 0.05) {
            outsideMse +=
                Math.abs(priorFullData[i] - oD[i]) +
                Math.abs(priorFullData[i + 1] - oD[i + 1]) +
                Math.abs(priorFullData[i + 2] - oD[i + 2]);
            outsideCount++;
        }
    }
    outCtx.putImageData(outImage, 0, 0);
    const compositeBuf = outCanvas.toBuffer('image/jpeg');
    const compositeOut = join(assetsDir, `${safe}__composite.jpg`);
    writeFileSync(compositeOut, compositeBuf);

    const inputSize = statSync(inputPath).size;
    return {
        scenario: sc,
        status: bailed ? (rawChange > 0.97 ? 'bailed_high' : 'bailed_low') : 'composited',
        inputDims: { w: W, h: H },
        geminiDims: { w: gW, h: gH },
        elapsed,
        rawChangeRatio: rawChange,
        outsideMaskAvgDelta: outsideCount > 0 ? outsideMse / (outsideCount * 3) : 0,
        inputSizeKB: Math.round(inputSize / 1024),
        outputSizeKB: Math.round(compositeBuf.length / 1024),
        inputPath: inputOut,
        geminiPath: geminiOut,
        compositePath: compositeOut,
    };
}

async function main() {
    const CONC = 3;
    const results = new Array(scenarios.length);
    let idx = 0;
    const workers = Array.from({ length: CONC }, async () => {
        while (idx < scenarios.length) {
            const i = idx++;
            const sc = scenarios[i];
            process.stdout.write(`  [${i + 1}/${scenarios.length}] ${sc.id} ${sc.title.slice(0, 60)}...`);
            try {
                const r = await runScenario(sc);
                results[i] = r;
                const tag = r.status === 'composited'
                    ? `change=${(r.rawChangeRatio * 100).toFixed(1)}% preserve=${r.outsideMaskAvgDelta.toFixed(2)}`
                    : r.status;
                console.log(` -> ${tag}`);
            } catch (e) {
                results[i] = { scenario: sc, status: 'error', error: e.message };
                console.log(` -> ERROR ${e.message}`);
            }
        }
    });
    await Promise.all(workers);

    writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\nWrote: ${resultsFile}`);
    console.log(`Assets: ${assetsDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
