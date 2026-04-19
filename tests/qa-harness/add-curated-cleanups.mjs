#!/usr/bin/env node
/**
 * Add 2 fresh curated cleanup entries to replace the 2 kitchen cleanups
 * that were deleted (28715f3a, 938da5ae) because they showed no change.
 *
 * Replacements: Brandon_B_NUR64543 (patio: grill/towel removed) and
 * Brandon_B_NUR64553 (patio: grill/chairs removed).
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

function loadEnvFromFile(fp) {
  if (!fs.existsSync(fp)) return;
  const raw = fs.readFileSync(fp, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.replace(/^"(.*)"$/, '$1').replace(/\\n$/g, '').trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvFromFile('/Users/camillebrown/StudioAI/.env.vercel.prod');
loadEnvFromFile('/Users/camillebrown/StudioAI/.env.local');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\\n$/, '');
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim().replace(/\\n$/, '');
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY required');
  process.exit(1);
}

const REPORT = '/Users/camillebrown/StudioAI/tests/qa-harness/reports/2026-04-19T03-12-14_cleanup/assets';
const ENTRIES = [
  { tool: 'cleanup', room: 'Patio',    before: `${REPORT}/Brandon_B_NUR64543.jpg__input.jpg`, after: `${REPORT}/Brandon_B_NUR64543.jpg__gemini.png` },
  { tool: 'cleanup', room: 'Exterior', before: `${REPORT}/Brandon_B_NUR64553.jpg__input.jpg`, after: `${REPORT}/Brandon_B_NUR64553.jpg__gemini.png` },
];

async function toDataUrl(srcPath, width = 600) {
  const buf = await sharp(srcPath)
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

async function supaInsert(row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/showcase`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`insert failed ${r.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt)[0]?.id;
}

(async () => {
  for (const e of ENTRIES) {
    const before_image = await toDataUrl(e.before);
    const after_image = await toDataUrl(e.after);
    const id = await supaInsert({
      user_email: 'curated@studioai.app',
      user_name: 'StudioAI',
      tool_used: e.tool,
      before_image,
      after_image,
      room_type: e.room,
      status: 'approved',
      is_curated: true,
    });
    console.log(`  + ${e.tool} ${e.room.padEnd(10)} → ${id}`);
  }
})().catch((err) => { console.error(err.message); process.exit(1); });
