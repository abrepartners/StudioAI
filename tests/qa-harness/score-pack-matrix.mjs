#!/usr/bin/env node
/**
 * tests/qa-harness/score-pack-matrix.mjs
 *
 * Second-pass scorer — reads every entry in public/pack-verification/manifest.json,
 * calls Gemini flash-text scoring on each render, writes the score back into
 * the manifest. Run after generate-pack-verification-matrix.mjs.
 *
 *   node tests/qa-harness/score-pack-matrix.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { GoogleGenAI, Type } from '@google/genai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PUBLIC_DIR = join(ROOT, 'public', 'pack-verification');
const MANIFEST_PATH = join(PUBLIC_DIR, 'manifest.json');

const env = readFileSync(join(ROOT, '.env.local'), 'utf-8');
const key = env.match(/GEMINI_API_KEY=([^\n]+)/)?.[1]
    || env.match(/VITE_GEMINI_API_KEY=([^\n]+)/)?.[1];
if (!key) throw new Error('No Gemini key in .env.local');
const ai = new GoogleGenAI({ apiKey: key });

const SCHEMA = {
    type: Type.OBJECT,
    properties: {
        architecture: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, callout: { type: Type.STRING } }, required: ['score', 'callout'] },
        lighting:     { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, callout: { type: Type.STRING } }, required: ['score', 'callout'] },
        perspective:  { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, callout: { type: Type.STRING } }, required: ['score', 'callout'] },
        staging:      { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, callout: { type: Type.STRING } }, required: ['score', 'callout'] },
    },
    required: ['architecture', 'lighting', 'perspective', 'staging'],
};

const PROMPT = (roomType) => `You are a professional real estate photo quality auditor. Rate this AI-staged ${roomType} on FOUR dimensions, each 1-10 (10 = MLS-publication ready, 1 = unusable):
1. ARCHITECTURAL INTEGRITY — walls/ceilings/windows/doors preserved? No warping or hallucination?
2. LIGHTING REALISM — shadow quality + color temperature match a real photograph?
3. PERSPECTIVE ACCURACY — furniture follows the room's vanishing points? No floating objects?
4. STAGING QUALITY — is the pack's style clearly present + appropriately scaled for the room?
For each dimension return score (1-10 integer) and callout (max 90 chars, affirms ≥9 or names the specific fix ≤7).
Be honest — do NOT default to 8s.`;

async function scoreRender(filePath, roomLabel) {
    const buf = readFileSync(filePath);
    const b64 = buf.toString('base64');
    const r = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: PROMPT(roomLabel) }, { inlineData: { mimeType: 'image/jpeg', data: b64 } }] },
        config: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: SCHEMA },
    });
    const parsed = JSON.parse(r.text);
    const clamp = (d) => ({ score: Math.max(1, Math.min(10, Math.round(d.score))), callout: String(d.callout || '').slice(0, 90) });
    const dims = {
        architecture: clamp(parsed.architecture),
        lighting: clamp(parsed.lighting),
        perspective: clamp(parsed.perspective),
        staging: clamp(parsed.staging),
    };
    const overall = Number(((dims.architecture.score + dims.lighting.score + dims.perspective.score + dims.staging.score) / 4).toFixed(1));
    return { overall, ...dims };
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
const rooms = Object.fromEntries(manifest.rooms.map((r) => [r.slug, r.label]));
const cells = manifest.cells || manifest.matrix || manifest.renders || [];
console.log(`[score-pack-matrix] scoring ${cells.length} renders...`);

let warnings = 0;
for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const roomSlug = cell.roomSlug || cell.room;
    const packSlug = cell.packSlug || cell.pack;
    const renderPath = join(PUBLIC_DIR, cell.renderPath || cell.render_path || cell.path || `renders/${roomSlug}__${packSlug}.jpg`);
    const roomLabel = rooms[roomSlug] || cell.roomLabel || 'Room';
    process.stdout.write(`  [${i + 1}/${cells.length}] ${roomSlug} × ${packSlug}... `);
    try {
        const score = await scoreRender(renderPath, roomLabel);
        cell.score = score;
        cell.quality_warning = score.overall < 6;
        if (cell.quality_warning) warnings++;
        const tier = score.overall >= 8 ? '✓' : score.overall >= 6 ? '~' : '!';
        console.log(`${tier} ${score.overall.toFixed(1)}/10`);
    } catch (e) {
        console.log(`✗ ${e.message?.slice(0, 80)}`);
    }
}

manifest.scored_at = new Date().toISOString();
manifest.score_warnings = warnings;
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log(`\nDone. ${warnings} warnings (score < 6). Manifest updated.`);
