/**
 * render-template.ts — Satori-based social/print image renderer
 *
 * POST /api/render-template
 * Body: { template, format, data }
 * Returns: PNG image
 *
 * Templates: just-listed, just-sold, before-after, open-house, tip-card
 * Formats: ig-post (1080x1080), ig-story (1080x1920), fb-post (1200x630),
 *          flyer (8.5x11@300dpi), postcard (6x4@300dpi)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TEMPLATES } from './templates/social';

// ─── Font Loading (cached) ──────────────────────────────────────────────────

let interRegular: ArrayBuffer | null = null;
let interBold: ArrayBuffer | null = null;

function loadFonts() {
  if (!interRegular) {
    interRegular = readFileSync(join(process.cwd(), 'public/fonts/Inter-Regular.ttf')).buffer;
  }
  if (!interBold) {
    interBold = readFileSync(join(process.cwd(), 'public/fonts/Inter-Bold.ttf')).buffer;
  }
  return [
    { name: 'Inter', data: interRegular, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: interBold, weight: 700 as const, style: 'normal' as const },
  ];
}

// ─── Format Dimensions ──────────────────────────────────────────────────────

const FORMATS: Record<string, { width: number; height: number }> = {
  'ig-post':    { width: 1080, height: 1080 },
  'ig-story':   { width: 1080, height: 1920 },
  'fb-post':    { width: 1200, height: 630 },
  'flyer':      { width: 2550, height: 3300 },
  'postcard':   { width: 1800, height: 1200 },
};

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const { template = 'just-listed', format = 'ig-post', data = {} } = req.body || {};

    const templateFn = TEMPLATES[template];
    if (!templateFn) {
      return res.status(400).json({
        error: `Unknown template: ${template}`,
        available: Object.keys(TEMPLATES),
      });
    }

    const dims = FORMATS[format];
    if (!dims) {
      return res.status(400).json({
        error: `Unknown format: ${format}`,
        available: Object.keys(FORMATS),
      });
    }

    const fonts = loadFonts();
    const element = templateFn(data, dims.width, dims.height);

    const svg = await satori(element, {
      width: dims.width,
      height: dims.height,
      fonts,
    });

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: dims.width },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(pngBuffer));
  } catch (err: any) {
    console.error('Template render error:', err);
    return res.status(500).json({ error: err.message || 'Render failed' });
  }
}
