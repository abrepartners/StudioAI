#!/usr/bin/env node
/**
 * composite-sandbox/run.mjs
 *
 * Runs the actual Gemini Cleanup pipeline + composite logic end-to-end
 * against a real image, and dumps visual artifacts so we can inspect what
 * the composite is actually producing (instead of guessing at thresholds).
 *
 * Usage:
 *   node tests/composite-sandbox/run.mjs <path-to-image> [--prompt "custom cleanup prompt"]
 *
 * Outputs to: tests/composite-sandbox/output/<timestamp>/
 *   - input.png          the source image
 *   - gemini_raw.png     Gemini's raw Cleanup output
 *   - diff_map.png       visual diff showing pixel-level differences
 *   - mask_t{N}.png      one mask per tested threshold (0.10 / 0.15 / 0.25 / 0.35 / 0.50)
 *   - composite_t{N}.png one composite per tested threshold
 *   - stats.json         change ratios, timing, prompts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createCanvas, loadImage, Image as NodeImage } from '@napi-rs/canvas';
import pixelmatch from 'pixelmatch';
import { GoogleGenAI } from '@google/genai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Pull the API key from .env.local so we don't duplicate it in the repo
const envLocal = readFileSync(join(ROOT, '.env.local'), 'utf-8');
const apiKey = envLocal.match(/GEMINI_API_KEY=([^\n]+)/)?.[1]
    || envLocal.match(/VITE_GEMINI_API_KEY=([^\n]+)/)?.[1];
if (!apiKey) throw new Error('Could not find Gemini API key in .env.local');

// --- Args ---
const [, , imagePathArg, ...rest] = process.argv;
if (!imagePathArg) {
    console.error('Usage: node run.mjs <path-to-image> [--prompt "..."]');
    process.exit(1);
}
const imagePath = imagePathArg;
const customPromptIdx = rest.indexOf('--prompt');
const customPrompt = customPromptIdx >= 0 ? rest[customPromptIdx + 1] : null;

// The exact instantDeclutter prompt from services/geminiService.ts
const CLEANUP_PROMPT_FOR = (roomType) => `You are an expert real estate photo editor. Your ONLY job is to REMOVE clutter, junk, and distractions from this ${roomType}. This is a REMOVAL-ONLY edit.

ABSOLUTE RULE — DO NOT ADD ANYTHING:
- Do NOT add ANY new objects, furniture, decor, plants, artwork, or items that are not already in the photo.
- Do NOT replace removed items with new items. Where items are removed, reveal the clean floor, wall, ground, or surface behind them.
- This is SUBTRACTION ONLY. The output must have FEWER objects than the input, never more.

CRITICAL RULES:
- Do NOT change, replace, or restyle ANY existing furniture.
- Do NOT change wall colors, floor colors, or any surface colors.
- Do NOT zoom in. Maintain the EXACT same framing, crop, and field of view.

REMOVE ALL OF THESE:
- Realtor signs, for-sale signs, lockboxes, key boxes on doors
- Yard clutter: hoses, tools, buckets, tarps, random outdoor items
- Trash, debris, junk, broken items, construction materials

KEEP EVERYTHING ELSE EXACTLY AS-IS.
RESTORATION: Where items are removed, fill with the surrounding texture seamlessly.
If nothing needs removing, return the image unchanged.`;

const THRESHOLDS_TO_TEST = [0.04, 0.08, 0.12, 0.15, 0.25];

// --- Setup output folder ---
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outputDir = join(__dirname, 'output', `${timestamp}_${basename(imagePath, '.jpg').replace(/\W/g, '_')}`);
mkdirSync(outputDir, { recursive: true });
console.log(`\nOutput → ${outputDir}\n`);

// --- Load input image, normalize to PNG ---
console.log(`[1/4] Loading input: ${imagePath}`);
const inputBuffer = readFileSync(imagePath);
const inputImg = await loadImage(inputBuffer);
const W = inputImg.width;
const H = inputImg.height;
console.log(`      dims: ${W}x${H}`);

const inputCanvas = createCanvas(W, H);
const inputCtx = inputCanvas.getContext('2d');
inputCtx.drawImage(inputImg, 0, 0);
const inputPng = inputCanvas.toBuffer('image/png');
writeFileSync(join(outputDir, 'input.png'), inputPng);

// --- Call Gemini Cleanup ---
console.log(`[2/4] Calling Gemini (gemini-3.1-flash-image-preview)...`);
const ai = new GoogleGenAI({ apiKey });
const inputJpegForGemini = inputCanvas.toBuffer('image/jpeg', 0.95);
const inputBase64 = inputJpegForGemini.toString('base64');

const geminiPrompt = customPrompt || CLEANUP_PROMPT_FOR('exterior');
const t0 = Date.now();
const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: [{
        parts: [
            { text: geminiPrompt },
            { inlineData: { mimeType: 'image/jpeg', data: inputBase64 } },
        ],
    }],
    config: {
        imageConfig: { numberOfImages: 1 },
    },
});
const elapsed = Date.now() - t0;
console.log(`      done in ${elapsed}ms`);

// Extract the image part
const parts = response.candidates?.[0]?.content?.parts || [];
const imagePart = parts.find((p) => p.inlineData?.data);
if (!imagePart) {
    console.error('Gemini response had no image data.');
    writeFileSync(join(outputDir, 'gemini_response.json'), JSON.stringify(response, null, 2));
    process.exit(1);
}
const geminiRawBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
writeFileSync(join(outputDir, 'gemini_raw.png'), geminiRawBuffer);
const geminiImg = await loadImage(geminiRawBuffer);
console.log(`      gemini output dims: ${geminiImg.width}x${geminiImg.height}`);

const geminiW = geminiImg.width;
const geminiH = geminiImg.height;

// --- Resolution-aware composite: diff at Gemini's native dims ---
// Downscale prior to match Gemini's dims for a clean, artifact-free diff.
const priorAtGeminiCanvas = createCanvas(geminiW, geminiH);
const pagCtx = priorAtGeminiCanvas.getContext('2d');
pagCtx.imageSmoothingEnabled = true;
pagCtx.quality = 'good';
pagCtx.drawImage(inputImg, 0, 0, geminiW, geminiH);
const priorAtGeminiData = pagCtx.getImageData(0, 0, geminiW, geminiH);

// Gemini's output at its own dims
const geminiCanvas = createCanvas(geminiW, geminiH);
const geminiCtx = geminiCanvas.getContext('2d');
geminiCtx.drawImage(geminiImg, 0, 0);
const geminiData = geminiCtx.getImageData(0, 0, geminiW, geminiH);

// --- Run composite at every threshold ---
console.log(`[3/4] Running composite at ${THRESHOLDS_TO_TEST.length} thresholds (diff at ${geminiW}x${geminiH}, output at ${W}x${H})...`);

const stats = {
    timestamp,
    inputPath: imagePath,
    inputDims: { w: W, h: H },
    geminiDims: { w: geminiW, h: geminiH },
    geminiModel: 'gemini-3.1-flash-image-preview',
    geminiElapsedMs: elapsed,
    thresholds: {},
};

// Visual diff map at threshold=0.05 for inspection
const rawDiffData = pagCtx.createImageData(geminiW, geminiH);
pixelmatch(priorAtGeminiData.data, geminiData.data, rawDiffData.data, geminiW, geminiH, {
    threshold: 0.05, includeAA: false, diffColor: [255, 0, 0], alpha: 0.3,
});
const diffMapCanvas = createCanvas(geminiW, geminiH);
diffMapCanvas.getContext('2d').putImageData(rawDiffData, 0, 0);
writeFileSync(join(outputDir, 'diff_map.png'), diffMapCanvas.toBuffer('image/png'));

// Pre-upsample Gemini once
const geminiUpscaled = createCanvas(W, H);
const guCtx = geminiUpscaled.getContext('2d');
guCtx.imageSmoothingEnabled = true;
guCtx.drawImage(geminiImg, 0, 0, W, H);
const geminiUpData = guCtx.getImageData(0, 0, W, H);

// Input at prior dims (full-res)
const priorAtFull = createCanvas(W, H);
priorAtFull.getContext('2d').drawImage(inputImg, 0, 0);
const priorFullData = priorAtFull.getContext('2d').getImageData(0, 0, W, H);

for (const threshold of THRESHOLDS_TO_TEST) {
    // Diff at Gemini's native resolution
    const diffData = pagCtx.createImageData(geminiW, geminiH);
    pixelmatch(priorAtGeminiData.data, geminiData.data, diffData.data, geminiW, geminiH, {
        threshold,
        includeAA: false,
        diffMask: true,
        diffColor: [255, 255, 255],
        alpha: 0,
    });

    let changedPixels = 0;
    // Build a single-channel grayscale mask (white=changed, black=unchanged)
    // with full alpha. Single-channel mask upsamples cleanly without RGB-bleed
    // across transparent pixels (which was the bug in the alpha-based approach).
    const maskAtGeminiCanvas = createCanvas(geminiW, geminiH);
    const magCtx = maskAtGeminiCanvas.getContext('2d');
    const magImage = magCtx.createImageData(geminiW, geminiH);
    for (let i = 0; i < diffData.data.length; i += 4) {
        const isDiff = diffData.data[i] + diffData.data[i + 1] + diffData.data[i + 2] > 0;
        if (isDiff) changedPixels++;
        const v = isDiff ? 255 : 0;
        magImage.data[i] = v;
        magImage.data[i + 1] = v;
        magImage.data[i + 2] = v;
        magImage.data[i + 3] = 255;
    }
    magCtx.putImageData(magImage, 0, 0);

    // Dilate mask 3px at Gemini res (mirrors production stackComposite.ts)
    const DILATE_PX = 3;
    magCtx.filter = `blur(${DILATE_PX}px)`;
    magCtx.drawImage(maskAtGeminiCanvas, 0, 0);
    magCtx.filter = 'none';
    const dilatedImage = magCtx.getImageData(0, 0, geminiW, geminiH);
    for (let i = 0; i < dilatedImage.data.length; i += 4) {
      const on = dilatedImage.data[i] > 20;
      const v = on ? 255 : 0;
      dilatedImage.data[i] = v;
      dilatedImage.data[i + 1] = v;
      dilatedImage.data[i + 2] = v;
      dilatedImage.data[i + 3] = 255;
    }
    magCtx.putImageData(dilatedImage, 0, 0);
    let dilatedChangedPixels = 0;
    for (let i = 0; i < dilatedImage.data.length; i += 4) {
      if (dilatedImage.data[i] > 0) dilatedChangedPixels++;
    }

    const changeRatio = changedPixels / (geminiW * geminiH);
    const dilatedRatio = dilatedChangedPixels / (geminiW * geminiH);
    console.log(`         post-dilate: ${(dilatedRatio * 100).toFixed(2)}% (+${((dilatedRatio - changeRatio) * 100).toFixed(2)}pp)`);
    const tag = `t${String(Math.round(threshold * 100)).padStart(2, '0')}`;
    console.log(`      threshold=${threshold.toFixed(2)}  changed=${(changeRatio * 100).toFixed(2)}%`);

    // Red overlay mask viz on input (using the post-dilate mask)
    const maskViz = createCanvas(W, H);
    const mvCtx = maskViz.getContext('2d');
    mvCtx.drawImage(inputImg, 0, 0);
    mvCtx.globalAlpha = 0.5;
    mvCtx.imageSmoothingEnabled = true;
    const redOverlay = createCanvas(W, H);
    const roCtx = redOverlay.getContext('2d');
    const redData = roCtx.createImageData(W, H);
    // Upsample post-dilate grayscale mask manually for a clean red overlay
    const magData = dilatedImage.data;
    for (let y = 0; y < H; y++) {
        const sy = Math.floor(y * geminiH / H);
        for (let x = 0; x < W; x++) {
            const sx = Math.floor(x * geminiW / W);
            const si = (sy * geminiW + sx) * 4;
            const di = (y * W + x) * 4;
            const v = magData[si];
            redData[di + 0] = 255;
            redData[di + 1] = 0;
            redData[di + 2] = 0;
            redData[di + 3] = v;
        }
    }
    roCtx.putImageData(redData, 0, 0);
    mvCtx.globalAlpha = 1;
    mvCtx.drawImage(redOverlay, 0, 0);
    writeFileSync(join(outputDir, `mask_${tag}.png`), maskViz.toBuffer('image/png'));

    // Upsample mask (bilinear) to full res. Single-channel mask = no RGB bleed.
    const upMask = createCanvas(W, H);
    const upCtx = upMask.getContext('2d');
    upCtx.imageSmoothingEnabled = true;
    upCtx.drawImage(maskAtGeminiCanvas, 0, 0, W, H);

    // Blur for feather
    const featherCanvas = createCanvas(W, H);
    const featherCtx = featherCanvas.getContext('2d');
    featherCtx.filter = 'blur(24px)';
    featherCtx.drawImage(upMask, 0, 0);
    writeFileSync(join(outputDir, `feather_${tag}.png`), featherCanvas.toBuffer('image/png'));
    const featherData = featherCtx.getImageData(0, 0, W, H).data;

    // Manual per-pixel blend
    const outImage = priorAtFull.getContext('2d').createImageData(W, H);
    const oD = outImage.data;
    for (let i = 0; i < oD.length; i += 4) {
        const a = featherData[i] / 255;
        const inv = 1 - a;
        oD[i] = priorFullData.data[i] * inv + geminiUpData.data[i] * a;
        oD[i + 1] = priorFullData.data[i + 1] * inv + geminiUpData.data[i + 1] * a;
        oD[i + 2] = priorFullData.data[i + 2] * inv + geminiUpData.data[i + 2] * a;
        oD[i + 3] = 255;
    }
    const outCanvas = createCanvas(W, H);
    outCanvas.getContext('2d').putImageData(outImage, 0, 0);
    writeFileSync(join(outputDir, `composite_${tag}.png`), outCanvas.toBuffer('image/png'));

    stats.thresholds[tag] = {
        threshold,
        changedPixels,
        changeRatioPct: Number((changeRatio * 100).toFixed(2)),
        bailed: changeRatio < 0.001 || changeRatio > 0.95,
    };
}

writeFileSync(join(outputDir, 'stats.json'), JSON.stringify(stats, null, 2));
console.log(`[4/4] Done. Outputs:`);
console.log(`   ${outputDir}`);
