/**
 * render-template.ts — Satori-based social/print image renderer
 *
 * POST /api/render-template
 * Body: { template, format, data }
 * Returns: PNG image
 *
 * Runs on Vercel Edge via @vercel/og (Satori + resvg bundled).
 */

import { ImageResponse } from '@vercel/og';
import { TEMPLATES } from './templates/social';

export const config = { runtime: 'edge' };

const FORMATS: Record<string, { width: number; height: number }> = {
  'ig-post':  { width: 1080, height: 1080 },
  'ig-story': { width: 1080, height: 1920 },
  'fb-post':  { width: 1200, height: 630 },
  'flyer':    { width: 2550, height: 3300 },
  'postcard': { width: 1800, height: 1200 },
};

function assetOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host;
  const proto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '') || 'https';
  return `${proto}://${host}`;
}

// Font cache per warm container
let interRegular: ArrayBuffer | null = null;
let interBold: ArrayBuffer | null = null;

async function loadFonts(origin: string) {
  if (!interRegular) {
    interRegular = await fetch(`${origin}/fonts/Inter-Regular.ttf`).then(r => r.arrayBuffer());
  }
  if (!interBold) {
    interBold = await fetch(`${origin}/fonts/Inter-Bold.ttf`).then(r => r.arrayBuffer());
  }
  return [
    { name: 'Inter', data: interRegular!, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: interBold!, weight: 700 as const, style: 'normal' as const },
  ];
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { template = 'just-listed', format = 'ig-post', data = {} } = body;

    const templateFn = TEMPLATES[template];
    if (!templateFn) {
      return Response.json({
        error: `Unknown template: ${template}`,
        available: Object.keys(TEMPLATES),
      }, { status: 400 });
    }

    const dims = FORMATS[format];
    if (!dims) {
      return Response.json({
        error: `Unknown format: ${format}`,
        available: Object.keys(FORMATS),
      }, { status: 400 });
    }

    const fonts = await loadFonts(assetOrigin(req));
    const element = templateFn(data, dims.width, dims.height);

    return new ImageResponse(element as any, {
      width: dims.width,
      height: dims.height,
      fonts,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('Template render error:', err);
    return Response.json({ error: err.message || 'Render failed' }, { status: 500 });
  }
}
