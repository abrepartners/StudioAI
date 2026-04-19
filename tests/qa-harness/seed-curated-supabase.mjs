#!/usr/bin/env node
/**
 * seed-curated-supabase.mjs — Cluster N (Landing Polish, Item 3)
 *
 * Reads /tmp/curated-showcases-NN.sql files (8 files, ~50 KB each — base64 image
 * data inline) and inserts each as a row via Supabase REST. Idempotent: deletes
 * any prior is_curated=TRUE rows owned by curated@studioai.app first.
 */

import path from 'node:path';
import fs from 'node:fs';

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
import fsMod from 'node:fs';
// Load credentials from Vercel-pulled env (preferred) or local .env.
loadEnvFromFile(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../.env.vercel.prod'));
loadEnvFromFile(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../.env.local'));

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\\n$/, '');
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim().replace(/\\n$/, '');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY env vars required (via .env.vercel.prod).');
  process.exit(1);
}

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '../..');

async function supaDelete() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/showcase?user_email=eq.curated@studioai.app&is_curated=eq.true`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
  });
  if (!r.ok) console.warn('[seed] delete returned', r.status, await r.text());
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
  const parsed = JSON.parse(txt);
  return parsed[0]?.id;
}

// Mirror the same 8 entries as seed-curated-showcases.mjs but build rows in JS
// so we can use Supabase REST (PostgREST) instead of streaming raw SQL.
import sharp from 'sharp';

const RW_TWILIGHT = path.join(REPO, 'tests/qa-harness/real-world/results/2026-04-18T22-25-12_twilight');
const REPORT_SKY = path.join(REPO, 'tests/qa-harness/reports/2026-04-18T21-37-57_sky/assets');
const REPORT_STAGE = path.join(REPO, 'tests/qa-harness/reports/2026-04-18T21-38-22_stage/assets');
const REPORT_CLEANUP = path.join(REPO, 'tests/qa-harness/reports/2026-04-19T03-12-14_cleanup/assets');
const REPORT_TWILIGHT = path.join(REPO, 'tests/qa-harness/reports/2026-04-18T21-37-55_twilight/assets');

const ENTRIES = [
  { tool: 'staging', room: 'Living Room', before: path.join(REPORT_STAGE, 'Brandon_B_NUR64458.jpg__input.jpg'), after: path.join(REPORT_STAGE, 'Brandon_B_NUR64458.jpg__gemini.png') },
  { tool: 'staging', room: 'Kitchen', before: path.join(REPORT_STAGE, 'Brandon_B_NUR64483.jpg__input.jpg'), after: path.join(REPORT_STAGE, 'Brandon_B_NUR64483.jpg__gemini.png') },
  { tool: 'staging', room: 'Bedroom', before: path.join(REPORT_STAGE, 'Brandon_B_NUR64523.jpg__input.jpg'), after: path.join(REPORT_STAGE, 'Brandon_B_NUR64523.jpg__gemini.png') },
  { tool: 'cleanup', room: 'Kitchen', before: path.join(REPORT_CLEANUP, 'Amber_photos_BM8A5086.jpg__input.jpg'), after: path.join(REPORT_CLEANUP, 'Amber_photos_BM8A5086.jpg__gemini.png') },
  { tool: 'cleanup', room: 'Living Room', before: path.join(REPORT_CLEANUP, 'Amber_photos_BM8A5101.jpg__input.jpg'), after: path.join(REPORT_CLEANUP, 'Amber_photos_BM8A5101.jpg__gemini.png') },
  { tool: 'twilight', room: 'Exterior', before: path.join(RW_TWILIGHT, 's05_Lance_Photos_BM8A1952.jpg__input.jpg'), after: path.join(RW_TWILIGHT, 's05_Lance_Photos_BM8A1952.jpg__output.jpg') },
  { tool: 'twilight', room: 'Exterior', before: path.join(REPORT_TWILIGHT, 'Kelly_photos_BM8A2227.jpg__input.jpg'), after: path.join(REPORT_TWILIGHT, 'Kelly_photos_BM8A2227.jpg__gemini.png') },
  { tool: 'sky', room: 'Exterior', before: path.join(REPORT_SKY, 'Lance_Photos_BM8A1952.jpg__input.jpg'), after: path.join(REPORT_SKY, 'Lance_Photos_BM8A1952.jpg__gemini.png') },
];

async function toDataUrl(srcPath, width = 600) {
  const buf = await sharp(srcPath)
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

(async () => {
  console.log(`[seed-curated-supabase] target ${SUPABASE_URL}`);
  console.log('[seed-curated-supabase] deleting existing curated rows…');
  await supaDelete();

  const ids = [];
  for (let i = 0; i < ENTRIES.length; i++) {
    const e = ENTRIES[i];
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
    ids.push(id);
    console.log(`  ${i + 1}. ${e.tool.padEnd(10)} ${e.room.padEnd(12)} → ${id}`);
  }

  console.log(`[seed-curated-supabase] inserted ${ids.length} curated rows.`);
})().catch((err) => {
  console.error('[seed-curated-supabase] failed:', err.message);
  process.exit(1);
});
