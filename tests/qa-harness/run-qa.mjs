#!/usr/bin/env node
/**
 * qa-harness/run-qa.mjs
 *
 * Runs every fixture image through a Pro AI Tool end-to-end (Gemini call +
 * the production resolution-aware composite), measures quality signals, and
 * writes an HTML report so we can spot regressions and tune parameters with
 * real data instead of anecdote.
 *
 * Usage:
 *   node tests/qa-harness/run-qa.mjs --tool cleanup [--limit N] [--concurrency N]
 *   node tests/qa-harness/run-qa.mjs --tool twilight
 *   node tests/qa-harness/run-qa.mjs --tool sky
 *
 * Metrics per run:
 *   - Gemini output dims (confirms image was returned)
 *   - Change ratio at Gemini native res (% of frame actually changed)
 *   - Preservation MSE outside mask (should be near 0 for localized edits)
 *   - File size ratio (output vs input)
 *   - Resolution match (output dims vs input dims)
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import pixelmatch from 'pixelmatch';
import { GoogleGenAI } from '@google/genai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FIXTURES = join(__dirname, 'fixtures');
const REPORTS = join(__dirname, 'reports');

// Pull the key from .env.local
const envLocal = readFileSync(join(ROOT, '.env.local'), 'utf-8');
const apiKey = envLocal.match(/GEMINI_API_KEY=([^\n]+)/)?.[1]
    || envLocal.match(/VITE_GEMINI_API_KEY=([^\n]+)/)?.[1];
if (!apiKey) throw new Error('Could not find Gemini API key in .env.local');
const ai = new GoogleGenAI({ apiKey });

// --- Args ---
const args = process.argv.slice(2);
const flag = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : dflt;
};
const tool = flag('tool', 'cleanup');
const limit = parseInt(flag('limit', '999'), 10);
const concurrency = parseInt(flag('concurrency', '3'), 10);

// --- Tool registry (prompts mirror production services/geminiService.ts) ---
const TOOLS = {
    cleanup: {
        folder: 'exteriors', // will also process 'interiors' below
        prompt: (roomType) => `You are an expert real estate photo editor. Your ONLY job is to REMOVE clutter, junk, and distractions from this ${roomType}. This is a REMOVAL-ONLY edit.

ABSOLUTE RULE — DO NOT ADD ANYTHING:
- Do NOT add ANY new objects, furniture, decor, plants, artwork, or items that are not already in the photo.
- This is SUBTRACTION ONLY.

CRITICAL RULES:
- Do NOT change, replace, or restyle ANY existing furniture.
- Do NOT change wall colors, floor colors, or any surface colors.
- Do NOT zoom in. Maintain the EXACT same framing, crop, and field of view.

REMOVE: realtor signs, for-sale signs, lockboxes, yard clutter, hoses, tools, trash, personal items, countertop clutter, refrigerator magnets, cords, moving boxes, cleaning supplies.

KEEP EVERYTHING ELSE EXACTLY AS-IS.
If nothing needs removing, return the image unchanged.`,
    },
    twilight: {
        folder: 'twilight',
        prompt: () => `Convert this daytime real estate photo into a beautiful twilight/dusk shot. The sky should transition to a dramatic dusk sky with warm oranges and deep blues. Interior lights should glow warmly through windows. Keep the house, landscaping, and all architecture EXACTLY as they are — do not add, remove, or modify any structural elements. Keep framing and camera angle identical.`,
    },
    sky: {
        folder: 'sky',
        prompt: () => `Replace the sky in this real estate photo with a beautiful clear blue sky with wispy white clouds. Keep the house, trees, landscaping, and all ground-level content EXACTLY as they are. Match the lighting of the original so the new sky looks natural against the existing shadows.`,
    },
    stage: {
        folder: 'interiors',
        prompt: (roomType) => `Virtually stage this ${roomType}. Add appropriate, style-neutral modern furniture and decor. Preserve all existing wall colors, floor colors, ceiling, architecture, layout, windows, doors, and built-in fixtures EXACTLY as they are. Do NOT change or color-grade existing surfaces. Keep the exact same framing and crop.`,
    },
    // Style Pack — mirrors production's fromPack: true behavior in
    // components/StyleControls.tsx::buildPrompt. Packs repaint the whole scene,
    // so we skip the composite entirely and use Gemini's raw output upscaled to
    // the input dimensions (matches what production ships when fromPack=true).
    pack: {
        folder: 'interiors',
        skipComposite: true,
        packName: 'Mid-Century Modern',
        prompt: (roomType) => `Virtually stage this ${roomType} in Mid-Century Modern style. Add only furniture and decor — keep the architectural shell untouched. Style DNA: tapered wood legs, warm walnut tones, mustard or teal accent pillows only, organic curved shapes, clean geometry.`,
    },
};

if (!TOOLS[tool]) {
    console.error(`Unknown tool: ${tool}. Options: ${Object.keys(TOOLS).join(', ')}`);
    process.exit(1);
}

// Collect fixtures
const folders = tool === 'cleanup' ? ['exteriors', 'interiors'] : [TOOLS[tool].folder];
const fixtures = [];
for (const f of folders) {
    const dir = join(FIXTURES, f);
    for (const name of readdirSync(dir).filter((n) => /\.(jpe?g|png)$/i.test(n)).slice(0, limit)) {
        fixtures.push({ path: join(dir, name), category: f, name });
    }
}
console.log(`[qa] tool=${tool}  fixtures=${fixtures.length}  concurrency=${concurrency}`);

// Prepare output dir
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runDir = join(REPORTS, `${timestamp}_${tool}`);
mkdirSync(join(runDir, 'assets'), { recursive: true });

// --- Core per-image runner ---
async function runOne(fix) {
    const t0 = Date.now();
    const inputBuffer = readFileSync(fix.path);
    const inputImg = await loadImage(inputBuffer);
    const W = inputImg.width, H = inputImg.height;
    const inputCanvas = createCanvas(W, H);
    inputCanvas.getContext('2d').drawImage(inputImg, 0, 0);
    const inputJpeg = inputCanvas.toBuffer('image/jpeg');
    const inputBase64 = inputJpeg.toString('base64');

    const roomType = fix.category === 'interiors' ? 'Living Room' : 'Exterior';
    const prompt = TOOLS[tool].prompt(roomType);

    let geminiBuffer = null;
    let geminiErr = null;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: inputBase64 } }] }],
            config: { imageConfig: { numberOfImages: 1 } },
        });
        const imagePart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
        if (imagePart) geminiBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
        else geminiErr = response.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 200) || 'no image part';
    } catch (e) {
        geminiErr = e.message;
    }

    const geminiElapsed = Date.now() - t0;
    const safeName = fix.name.replace(/[^A-Za-z0-9._-]/g, '_');
    const inputOut = join(runDir, 'assets', `${safeName}__input.jpg`);
    writeFileSync(inputOut, inputJpeg);

    if (!geminiBuffer) {
        return {
            fixture: fix, status: 'gemini_failed', error: geminiErr, geminiElapsed,
            inputDims: { w: W, h: H }, inputPath: inputOut,
        };
    }

    const geminiImg = await loadImage(geminiBuffer);
    const gW = geminiImg.width, gH = geminiImg.height;
    const geminiOut = join(runDir, 'assets', `${safeName}__gemini.png`);
    writeFileSync(geminiOut, geminiBuffer);

    // --- Skip-composite path (mirrors production fromPack: true) ---
    // Style Packs intentionally bypass the Phase C composite: the whole scene
    // is repainted, so blending against the original would re-introduce the
    // empty room. Upscale Gemini's output to input dims and ship that.
    if (TOOLS[tool].skipComposite) {
        const upCanvas = createCanvas(W, H);
        const upCtx = upCanvas.getContext('2d');
        upCtx.imageSmoothingEnabled = true;
        upCtx.drawImage(geminiImg, 0, 0, W, H);
        const packBuf = upCanvas.toBuffer('image/jpeg');
        const packOut = join(runDir, 'assets', `${safeName}__composite.jpg`);
        writeFileSync(packOut, packBuf);
        const inputSize = statSync(fix.path).size;
        return {
            fixture: fix,
            status: 'pack_bypass',
            error: null,
            inputDims: { w: W, h: H },
            geminiDims: { w: gW, h: gH },
            geminiElapsed,
            rawChangeRatio: 1,
            outsideMaskAvgDelta: 0,
            inputSizeKB: Math.round(inputSize / 1024),
            outputSizeKB: Math.round(packBuf.length / 1024),
            sizeRatio: packBuf.length / inputSize,
            inputPath: inputOut,
            geminiPath: geminiOut,
            compositePath: packOut,
        };
    }

    // --- Composite (mirrors production stackComposite.ts) ---
    const THRESHOLD = 0.15;
    const DILATE_PX = 1;
    const FEATHER_PX = 24;

    // Prior downscaled to Gemini res
    const priorAtG = createCanvas(gW, gH);
    const pagCtx = priorAtG.getContext('2d');
    pagCtx.imageSmoothingEnabled = true;
    pagCtx.drawImage(inputImg, 0, 0, gW, gH);
    const priorAtGData = pagCtx.getImageData(0, 0, gW, gH);

    const gCanvas = createCanvas(gW, gH);
    gCanvas.getContext('2d').drawImage(geminiImg, 0, 0);
    const gData = gCanvas.getContext('2d').getImageData(0, 0, gW, gH);

    const diffOut = pagCtx.createImageData(gW, gH);
    pixelmatch(priorAtGData.data, gData.data, diffOut.data, gW, gH, {
        threshold: THRESHOLD, includeAA: false, diffMask: true, diffColor: [255, 255, 255], alpha: 0,
    });

    let changedPixels = 0;
    const maskCanvas = createCanvas(gW, gH);
    const maskCtx = maskCanvas.getContext('2d');
    const maskImage = maskCtx.createImageData(gW, gH);
    for (let i = 0; i < diffOut.data.length; i += 4) {
        const isDiff = diffOut.data[i] + diffOut.data[i + 1] + diffOut.data[i + 2] > 0;
        if (isDiff) changedPixels++;
        const v = isDiff ? 255 : 0;
        maskImage.data[i] = v;
        maskImage.data[i + 1] = v;
        maskImage.data[i + 2] = v;
        maskImage.data[i + 3] = 255;
    }
    maskCtx.putImageData(maskImage, 0, 0);

    const rawChangeRatio = changedPixels / (gW * gH);
    const bailed = rawChangeRatio < 0.001 || rawChangeRatio > 0.95;

    // Dilate
    if (!bailed && DILATE_PX > 0) {
        maskCtx.filter = `blur(${DILATE_PX}px)`;
        maskCtx.drawImage(maskCanvas, 0, 0);
        maskCtx.filter = 'none';
        const d = maskCtx.getImageData(0, 0, gW, gH);
        for (let i = 0; i < d.data.length; i += 4) {
            const on = d.data[i] > 20;
            const v = on ? 255 : 0;
            d.data[i] = v;
            d.data[i + 1] = v;
            d.data[i + 2] = v;
            d.data[i + 3] = 255;
        }
        maskCtx.putImageData(d, 0, 0);
    }

    // Upscale mask → feather → blend
    const upMask = createCanvas(W, H);
    const upCtx = upMask.getContext('2d');
    upCtx.imageSmoothingEnabled = true;
    upCtx.drawImage(maskCanvas, 0, 0, W, H);
    if (FEATHER_PX > 0) {
        upCtx.filter = `blur(${FEATHER_PX}px)`;
        upCtx.drawImage(upMask, 0, 0);
        upCtx.filter = 'none';
    }
    const featherData = upCtx.getImageData(0, 0, W, H).data;

    const priorFull = createCanvas(W, H);
    priorFull.getContext('2d').drawImage(inputImg, 0, 0);
    const priorFullData = priorFull.getContext('2d').getImageData(0, 0, W, H).data;

    const gUp = createCanvas(W, H);
    const gUpCtx = gUp.getContext('2d');
    gUpCtx.imageSmoothingEnabled = true;
    gUpCtx.drawImage(geminiImg, 0, 0, W, H);
    const gUpData = gUpCtx.getImageData(0, 0, W, H).data;

    const outCanvas = createCanvas(W, H);
    const outCtx = outCanvas.getContext('2d');
    const outImage = outCtx.createImageData(W, H);
    const oD = outImage.data;

    // Metric: MSE on OUTSIDE the mask (preserved region)
    let outsideMaskMse = 0;
    let outsidePixelCount = 0;
    for (let i = 0; i < oD.length; i += 4) {
        const a = bailed ? 1 : featherData[i] / 255;
        const inv = 1 - a;
        if (bailed) {
            oD[i] = gUpData[i];
            oD[i + 1] = gUpData[i + 1];
            oD[i + 2] = gUpData[i + 2];
        } else {
            oD[i] = priorFullData[i] * inv + gUpData[i] * a;
            oD[i + 1] = priorFullData[i + 1] * inv + gUpData[i + 1] * a;
            oD[i + 2] = priorFullData[i + 2] * inv + gUpData[i + 2] * a;
        }
        oD[i + 3] = 255;
        // Count only pixels where mask alpha is near 0 (outside edit region)
        if (!bailed && a < 0.05) {
            outsideMaskMse +=
                Math.abs(priorFullData[i] - oD[i]) +
                Math.abs(priorFullData[i + 1] - oD[i + 1]) +
                Math.abs(priorFullData[i + 2] - oD[i + 2]);
            outsidePixelCount++;
        }
    }
    outCtx.putImageData(outImage, 0, 0);

    const compositeBuf = outCanvas.toBuffer('image/jpeg');
    const compositeOut = join(runDir, 'assets', `${safeName}__composite.jpg`);
    writeFileSync(compositeOut, compositeBuf);

    const inputSize = statSync(fix.path).size;
    const outputSize = compositeBuf.length;

    return {
        fixture: fix,
        status: bailed ? (rawChangeRatio > 0.95 ? 'bailed_high' : 'bailed_low') : 'composited',
        error: null,
        inputDims: { w: W, h: H },
        geminiDims: { w: gW, h: gH },
        geminiElapsed,
        rawChangeRatio,
        outsideMaskAvgDelta: outsidePixelCount > 0 ? outsideMaskMse / (outsidePixelCount * 3) : 0,
        inputSizeKB: Math.round(inputSize / 1024),
        outputSizeKB: Math.round(outputSize / 1024),
        sizeRatio: outputSize / inputSize,
        inputPath: inputOut,
        geminiPath: geminiOut,
        compositePath: compositeOut,
    };
}

// --- Concurrency-limited runner ---
async function runAll() {
    const results = [];
    let idx = 0;
    const workers = Array.from({ length: concurrency }, async () => {
        while (idx < fixtures.length) {
            const i = idx++;
            const fix = fixtures[i];
            process.stdout.write(`  [${i + 1}/${fixtures.length}] ${fix.name.slice(0, 50)}...`);
            try {
                const result = await runOne(fix);
                results.push(result);
                const tag = result.status === 'composited'
                    ? `change=${(result.rawChangeRatio * 100).toFixed(1)}%  preserve=${result.outsideMaskAvgDelta.toFixed(2)}  size=${(result.sizeRatio * 100).toFixed(0)}%`
                    : result.status;
                console.log(` ✓ ${tag}`);
            } catch (e) {
                console.log(` ✗ ${e.message}`);
                results.push({ fixture: fix, status: 'error', error: e.message });
            }
        }
    });
    await Promise.all(workers);
    return results;
}

const results = await runAll();
results.sort((a, b) => a.fixture.name.localeCompare(b.fixture.name));

// --- Aggregate stats ---
const composited = results.filter((r) => r.status === 'composited');
const packBypass = results.filter((r) => r.status === 'pack_bypass');
const produced = [...composited, ...packBypass];
const summary = {
    tool,
    timestamp,
    totalFixtures: fixtures.length,
    composited: composited.length,
    packBypass: packBypass.length,
    bailedLow: results.filter((r) => r.status === 'bailed_low').length,
    bailedHigh: results.filter((r) => r.status === 'bailed_high').length,
    geminiFailed: results.filter((r) => r.status === 'gemini_failed').length,
    errors: results.filter((r) => r.status === 'error').length,
    medianChangePct: median(composited.map((r) => r.rawChangeRatio * 100)),
    medianPreserveDelta: median(composited.map((r) => r.outsideMaskAvgDelta)),
    medianSizeRatio: median(produced.map((r) => r.sizeRatio)),
    medianGeminiMs: median(results.map((r) => r.geminiElapsed).filter(Boolean)),
};
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));
writeFileSync(join(runDir, 'summary.json'), JSON.stringify({ summary, results }, null, 2));

function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return Number(s[Math.floor(s.length / 2)].toFixed(2));
}

// --- Build HTML report ---
const rel = (p) => p ? relative(runDir, p) : '';
const rows = results.map((r) => {
    const passes = [];
    if (r.status === 'composited') {
        passes.push(`<span class="pass">✓ rendered</span>`);
        if (r.outsideMaskAvgDelta < 1.5) passes.push(`<span class="pass">✓ preserved (${r.outsideMaskAvgDelta.toFixed(2)})</span>`);
        else passes.push(`<span class="fail">✗ preserve=${r.outsideMaskAvgDelta.toFixed(2)}</span>`);
        if (r.sizeRatio > 0.4) passes.push(`<span class="pass">✓ size=${(r.sizeRatio * 100).toFixed(0)}%</span>`);
        else passes.push(`<span class="fail">✗ size=${(r.sizeRatio * 100).toFixed(0)}%</span>`);
    } else if (r.status === 'pack_bypass') {
        passes.push(`<span class="pass">✓ pack rendered (composite skipped)</span>`);
        if (r.sizeRatio > 0.4) passes.push(`<span class="pass">✓ size=${(r.sizeRatio * 100).toFixed(0)}%</span>`);
        else passes.push(`<span class="warn">⚠ size=${(r.sizeRatio * 100).toFixed(0)}%</span>`);
    } else if (r.status === 'bailed_high') {
        passes.push(`<span class="warn">⚠ bailed (>95% change, Gemini repainted everything)</span>`);
    } else if (r.status === 'bailed_low') {
        passes.push(`<span class="warn">⚠ bailed (<0.1% change, Gemini changed nothing)</span>`);
    } else {
        passes.push(`<span class="fail">✗ ${r.status}: ${r.error || ''}</span>`);
    }
    return `
<tr>
  <td class="name">${r.fixture.category}/<br>${r.fixture.name.slice(0, 40)}</td>
  <td><img src="${rel(r.inputPath)}" loading="lazy" /></td>
  <td>${r.geminiPath ? `<img src="${rel(r.geminiPath)}" loading="lazy" />` : '—'}</td>
  <td>${r.compositePath ? `<img src="${rel(r.compositePath)}" loading="lazy" />` : '—'}</td>
  <td class="stats">
    ${passes.join('<br>')}<br>
    <small>${r.inputDims ? `${r.inputDims.w}x${r.inputDims.h}` : '—'} → ${r.geminiDims ? `${r.geminiDims.w}x${r.geminiDims.h}` : '—'}</small><br>
    <small>${r.inputSizeKB || '?'}KB → ${r.outputSizeKB || '?'}KB</small>
  </td>
</tr>`;
}).join('');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>QA ${tool} · ${timestamp}</title>
<style>
  body { font: 14px -apple-system, sans-serif; background: #111; color: #eee; margin: 0; padding: 24px; }
  h1 { margin: 0 0 8px; }
  .summary { background: #1c1c1c; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-family: monospace; white-space: pre; }
  table { border-collapse: collapse; width: 100%; }
  td { border-top: 1px solid #333; padding: 8px; vertical-align: top; }
  td.name { font-family: monospace; font-size: 11px; max-width: 180px; word-break: break-all; }
  td.stats { font-size: 12px; white-space: nowrap; }
  img { width: 280px; max-height: 200px; object-fit: cover; display: block; border-radius: 4px; }
  .pass { color: #30D158; }
  .fail { color: #FF375F; }
  .warn { color: #FF9F0A; }
  small { color: #888; }
</style></head>
<body>
<h1>QA Report · ${tool} · ${timestamp}</h1>
<div class="summary">${JSON.stringify(summary, null, 2)}</div>
<table>
  <thead><tr><th>Fixture</th><th>Input</th><th>Gemini raw</th><th>Composite</th><th>Metrics</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;

const htmlPath = join(runDir, 'index.html');
writeFileSync(htmlPath, html);
console.log(`\nReport: ${htmlPath}`);
console.log(`Open: open "${htmlPath}"`);
