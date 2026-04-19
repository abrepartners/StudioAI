#!/usr/bin/env node
/**
 * generate-showcase-pairs.mjs — Cluster N (Landing Polish, Item 1)
 *
 * Picks 4 real before/after pairs from QA harness outputs and writes them to
 * /public/showcase-{tool}-{before,after}.jpg at 1600w JPEG q0.85.
 *
 * Pairs:
 *   - twilight  → real-world Twilight result (modern house, dramatic sky)
 *   - cleanup   → latest cleanup composite (interior, multiple distractions)
 *   - sky       → sky composite (modern house, blue sky swap)
 *   - staging   → stage composite (empty room → fully staged)
 *
 * The QA outputs are large (5K+ wide). We resize with sharp to 1600 long-edge
 * to keep landing payload sane.
 */

import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const OUT_DIR = path.join(REPO, 'public');

// Real-world Twilight produced its own combined input/output JPEG pair under
// real-world/results/. The QA composite files in reports/ contain a 4-up grid;
// we want clean before/after, so we use real-world for twilight and the
// __input.jpg + __gemini.png from reports/<run>/assets/ for the others.

const RW_TWILIGHT = path.join(REPO, 'tests/qa-harness/real-world/results/2026-04-18T22-25-12_twilight');
const REPORT_SKY = path.join(REPO, 'tests/qa-harness/reports/2026-04-18T21-37-57_sky/assets');
const REPORT_STAGE = path.join(REPO, 'tests/qa-harness/reports/2026-04-18T21-38-22_stage/assets');
const REPORT_CLEANUP = path.join(REPO, 'tests/qa-harness/reports/2026-04-19T03-12-14_cleanup/assets');

const PAIRS = [
  {
    tool: 'twilight',
    label: 'Day to Dusk',
    before: path.join(RW_TWILIGHT, 's05_Lance_Photos_BM8A1952.jpg__input.jpg'),
    after: path.join(RW_TWILIGHT, 's05_Lance_Photos_BM8A1952.jpg__output.jpg'),
  },
  {
    tool: 'cleanup',
    label: 'Smart Cleanup',
    // Amber laundry/utility room — strong before/after delta.
    before: path.join(REPORT_CLEANUP, 'Amber_photos_BM8A5086.jpg__input.jpg'),
    after: path.join(REPORT_CLEANUP, 'Amber_photos_BM8A5086.jpg__gemini.png'),
  },
  {
    tool: 'sky',
    label: 'Sky Replacement',
    before: path.join(REPORT_SKY, 'Lance_Photos_BM8A1952.jpg__input.jpg'),
    after: path.join(REPORT_SKY, 'Lance_Photos_BM8A1952.jpg__gemini.png'),
  },
  {
    tool: 'staging',
    label: 'Virtual Staging',
    // Brandon empty interior → staged.
    before: path.join(REPORT_STAGE, 'Brandon_B_NUR64458.jpg__input.jpg'),
    after: path.join(REPORT_STAGE, 'Brandon_B_NUR64458.jpg__gemini.png'),
  },
];

async function processOne(srcPath, outPath) {
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Source not found: ${srcPath}`);
  }
  const buf = await sharp(srcPath)
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  fs.writeFileSync(outPath, buf);
  const kb = (buf.length / 1024).toFixed(0);
  return kb;
}

(async () => {
  console.log(`[showcase-pairs] writing 4 pairs to ${OUT_DIR}`);
  for (const p of PAIRS) {
    const beforeOut = path.join(OUT_DIR, `showcase-${p.tool}-before.jpg`);
    const afterOut = path.join(OUT_DIR, `showcase-${p.tool}-after.jpg`);
    const bKb = await processOne(p.before, beforeOut);
    const aKb = await processOne(p.after, afterOut);
    console.log(`  ${p.tool.padEnd(10)} ${p.label.padEnd(18)}  before:${bKb}KB  after:${aKb}KB`);
  }
  console.log('[showcase-pairs] done.');
})().catch((err) => {
  console.error('[showcase-pairs] failed:', err.message);
  process.exit(1);
});
