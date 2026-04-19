#!/usr/bin/env node
/**
 * seed-curated-showcases.mjs — Cluster N (Landing Polish, Item 3)
 *
 * Generates 8 curated showcase entries as base64 data URLs and prints SQL to
 * seed the Supabase `showcase` table. Mix:
 *   - 3 staging  (Living Room, Kitchen, Bedroom)
 *   - 2 cleanup  (Living Room, Bathroom)
 *   - 2 twilight (Exterior x2)
 *   - 1 sky      (Exterior)
 *
 * The Supabase schema stores before_image/after_image as TEXT base64 (matching
 * what the existing /api/showcase POST writes). We resize to 600w JPEG q0.7
 * which yields ~30-80 KB strings — plenty small for a Postgres row.
 *
 * Output: writes /tmp/curated-showcases.sql (one INSERT block).
 */

import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const RW_TWILIGHT = path.join(REPO, 'tests/qa-harness/real-world/results/2026-04-18T22-25-12_twilight');
const REPORT_SKY = path.join(REPO, 'tests/qa-harness/reports/2026-04-18T21-37-57_sky/assets');
const REPORT_STAGE = path.join(REPO, 'tests/qa-harness/reports/2026-04-18T21-38-22_stage/assets');
const REPORT_CLEANUP = path.join(REPO, 'tests/qa-harness/reports/2026-04-19T03-12-14_cleanup/assets');
const REPORT_TWILIGHT = path.join(REPO, 'tests/qa-harness/reports/2026-04-18T21-37-55_twilight/assets');

// Tool ↔ room curation. We pick fixtures with clean, recognizable rooms.
const ENTRIES = [
  // staging × 3
  {
    tool: 'staging', room: 'Living Room',
    before: path.join(REPORT_STAGE, 'Brandon_B_NUR64458.jpg__input.jpg'),
    after: path.join(REPORT_STAGE, 'Brandon_B_NUR64458.jpg__gemini.png'),
  },
  {
    tool: 'staging', room: 'Kitchen',
    before: path.join(REPORT_STAGE, 'Brandon_B_NUR64483.jpg__input.jpg'),
    after: path.join(REPORT_STAGE, 'Brandon_B_NUR64483.jpg__gemini.png'),
  },
  {
    tool: 'staging', room: 'Bedroom',
    before: path.join(REPORT_STAGE, 'Brandon_B_NUR64523.jpg__input.jpg'),
    after: path.join(REPORT_STAGE, 'Brandon_B_NUR64523.jpg__gemini.png'),
  },
  // cleanup × 2
  {
    tool: 'cleanup', room: 'Kitchen',
    before: path.join(REPORT_CLEANUP, 'Amber_photos_BM8A5086.jpg__input.jpg'),
    after: path.join(REPORT_CLEANUP, 'Amber_photos_BM8A5086.jpg__gemini.png'),
  },
  {
    tool: 'cleanup', room: 'Living Room',
    before: path.join(REPORT_CLEANUP, 'Amber_photos_BM8A5101.jpg__input.jpg'),
    after: path.join(REPORT_CLEANUP, 'Amber_photos_BM8A5101.jpg__gemini.png'),
  },
  // twilight × 2
  {
    tool: 'twilight', room: 'Exterior',
    before: path.join(RW_TWILIGHT, 's05_Lance_Photos_BM8A1952.jpg__input.jpg'),
    after: path.join(RW_TWILIGHT, 's05_Lance_Photos_BM8A1952.jpg__output.jpg'),
  },
  {
    tool: 'twilight', room: 'Exterior',
    before: path.join(REPORT_TWILIGHT, 'Kelly_photos_BM8A2227.jpg__input.jpg'),
    after: path.join(REPORT_TWILIGHT, 'Kelly_photos_BM8A2227.jpg__gemini.png'),
  },
  // sky × 1
  {
    tool: 'sky', room: 'Exterior',
    before: path.join(REPORT_SKY, 'Lance_Photos_BM8A1952.jpg__input.jpg'),
    after: path.join(REPORT_SKY, 'Lance_Photos_BM8A1952.jpg__gemini.png'),
  },
];

async function toDataUrl(srcPath, width = 320) {
  if (!fs.existsSync(srcPath)) throw new Error(`Missing: ${srcPath}`);
  const buf = await sharp(srcPath)
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 55, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

function sqlEscape(s) {
  return s.replace(/'/g, "''");
}

(async () => {
  const rows = [];
  for (const e of ENTRIES) {
    const beforeUrl = await toDataUrl(e.before);
    const afterUrl = await toDataUrl(e.after);
    rows.push({
      tool_used: e.tool,
      room_type: e.room,
      before_image: beforeUrl,
      after_image: afterUrl,
      before_kb: Math.round(beforeUrl.length / 1024),
      after_kb: Math.round(afterUrl.length / 1024),
    });
  }

  // Write one SQL file per row so they can be executed individually via the
  // Supabase MCP (each call has a payload limit and 500 KB combined exceeds it).
  rows.forEach((r, i) => {
    const sql = `INSERT INTO public.showcase
  (user_email, user_name, tool_used, before_image, after_image, room_type, status, is_curated)
VALUES
  ('curated@studioai.app', 'StudioAI', '${sqlEscape(r.tool_used)}', '${sqlEscape(r.before_image)}', '${sqlEscape(r.after_image)}', '${sqlEscape(r.room_type)}', 'approved', TRUE);
`;
    fs.writeFileSync(`/tmp/curated-showcases-${String(i + 1).padStart(2, '0')}.sql`, sql);
  });
  // Combined SQL kept for reference / direct psql use.
  const combined = rows.map((r) => (
    `INSERT INTO public.showcase (user_email, user_name, tool_used, before_image, after_image, room_type, status, is_curated)\nVALUES ('curated@studioai.app', 'StudioAI', '${sqlEscape(r.tool_used)}', '${sqlEscape(r.before_image)}', '${sqlEscape(r.after_image)}', '${sqlEscape(r.room_type)}', 'approved', TRUE);\n`
  )).join('\n');
  const outPath = '/tmp/curated-showcases.sql';
  fs.writeFileSync(outPath, combined);
  const totalKb = rows.reduce((a, r) => a + r.before_kb + r.after_kb, 0);
  console.log(`[seed-curated] wrote ${rows.length} rows to ${outPath} (~${totalKb} KB total payload)`);
  rows.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.tool_used.padEnd(10)} ${r.room_type.padEnd(12)} before:${r.before_kb}KB after:${r.after_kb}KB`);
  });
})().catch((err) => {
  console.error('[seed-curated] failed:', err.message);
  process.exit(1);
});
