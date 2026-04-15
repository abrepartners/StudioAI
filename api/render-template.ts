/**
 * render-template.ts — Satori-based social/print image renderer
 *
 * POST /api/render-template
 * Body: { template, format, data }
 * Returns: PNG image
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';

// ─── Font Loading ────────────────────────────────────────────────────────────

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
  'flyer':      { width: 2550, height: 3300 }, // 8.5x11 @ 300dpi
  'postcard':   { width: 1800, height: 1200 }, // 6x4 @ 300dpi
};

// ─── Data Types ──────────────────────────────────────────────────────────────

interface TemplateData {
  // Property
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  headline?: string; // "JUST LISTED", "JUST SOLD", "OPEN HOUSE", etc.
  tagline?: string;

  // Images (base64 data URLs)
  heroImage?: string;
  beforeImage?: string;
  afterImage?: string;

  // Brand Kit
  agentName?: string;
  brokerageName?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo?: string; // base64
  headshot?: string; // base64
  primaryColor?: string; // hex
}

// ─── Templates ───────────────────────────────────────────────────────────────

function JustListedTemplate(data: TemplateData, width: number, height: number) {
  const accent = data.primaryColor || '#0A84FF';
  const isVertical = height > width;
  const scale = width / 1080; // base scale factor

  return React.createElement('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0A0A0A',
      fontFamily: 'Inter',
      overflow: 'hidden',
      position: 'relative',
    }
  },
    // Hero image area (60-70% of height)
    React.createElement('div', {
      style: {
        display: 'flex',
        position: 'relative',
        width: '100%',
        height: isVertical ? '55%' : '65%',
        overflow: 'hidden',
      }
    },
      // Photo
      data.heroImage ? React.createElement('img', {
        src: data.heroImage,
        style: {
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }
      }) : React.createElement('div', {
        style: {
          width: '100%',
          height: '100%',
          backgroundColor: '#1A1A1A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }
      }, React.createElement('span', {
        style: { color: '#333', fontSize: 24 * scale, fontWeight: 400 }
      }, 'Property Photo')),

      // Gradient overlay at bottom of photo
      React.createElement('div', {
        style: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40%',
          background: 'linear-gradient(transparent, rgba(10,10,10,0.95))',
          display: 'flex',
        }
      }),

      // Headline badge top-left
      React.createElement('div', {
        style: {
          position: 'absolute',
          top: 32 * scale,
          left: 32 * scale,
          display: 'flex',
          alignItems: 'center',
          gap: 8 * scale,
        }
      },
        React.createElement('div', {
          style: {
            width: 4 * scale,
            height: 28 * scale,
            backgroundColor: accent,
            borderRadius: 2,
          }
        }),
        React.createElement('span', {
          style: {
            fontSize: 14 * scale,
            fontWeight: 700,
            color: 'white',
            letterSpacing: '0.2em',
            textTransform: 'uppercase' as any,
          }
        }, data.headline || 'JUST LISTED'),
      ),

      // Price overlay bottom-left of photo
      data.price ? React.createElement('div', {
        style: {
          position: 'absolute',
          bottom: 20 * scale,
          left: 32 * scale,
          display: 'flex',
          flexDirection: 'column',
        }
      },
        React.createElement('span', {
          style: {
            fontSize: 42 * scale,
            fontWeight: 700,
            color: 'white',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }
        }, data.price),
      ) : null,
    ),

    // Content area
    React.createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        padding: `${24 * scale}px ${32 * scale}px`,
        justifyContent: 'space-between',
      }
    },
      // Address + Stats
      React.createElement('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 16 * scale,
        }
      },
        // Address
        data.address ? React.createElement('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 4 * scale,
          }
        },
          React.createElement('span', {
            style: {
              fontSize: 22 * scale,
              fontWeight: 700,
              color: 'white',
              lineHeight: 1.3,
            }
          }, data.address),
          (data.city || data.state) ? React.createElement('span', {
            style: {
              fontSize: 14 * scale,
              fontWeight: 400,
              color: '#888',
              letterSpacing: '0.05em',
            }
          }, [data.city, data.state, data.zip].filter(Boolean).join(', ')) : null,
        ) : null,

        // Stats row
        (data.beds || data.baths || data.sqft) ? React.createElement('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 24 * scale,
          }
        },
          ...[
            data.beds ? { value: data.beds, label: 'Beds' } : null,
            data.baths ? { value: data.baths, label: 'Baths' } : null,
            data.sqft ? { value: data.sqft.toLocaleString(), label: 'Sq Ft' } : null,
            data.yearBuilt ? { value: data.yearBuilt, label: 'Built' } : null,
          ].filter(Boolean).map((stat, i) =>
            React.createElement('div', {
              key: i,
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }
            },
              React.createElement('span', {
                style: {
                  fontSize: 20 * scale,
                  fontWeight: 700,
                  color: 'white',
                }
              }, String(stat!.value)),
              React.createElement('span', {
                style: {
                  fontSize: 10 * scale,
                  fontWeight: 400,
                  color: '#666',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase' as any,
                }
              }, stat!.label),
            )
          ),
          // Accent line between stats section and tagline
        ) : null,
      ),

      // Agent bar at bottom
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #222',
          paddingTop: 16 * scale,
        }
      },
        // Left: headshot + name
        React.createElement('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 12 * scale,
          }
        },
          data.headshot ? React.createElement('img', {
            src: data.headshot,
            style: {
              width: 40 * scale,
              height: 40 * scale,
              borderRadius: '50%',
              objectFit: 'cover',
            }
          }) : null,
          React.createElement('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
            }
          },
            data.agentName ? React.createElement('span', {
              style: {
                fontSize: 14 * scale,
                fontWeight: 700,
                color: 'white',
              }
            }, data.agentName) : null,
            data.brokerageName ? React.createElement('span', {
              style: {
                fontSize: 11 * scale,
                fontWeight: 400,
                color: '#666',
              }
            }, data.brokerageName) : null,
          ),
        ),

        // Right: contact + logo
        React.createElement('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 16 * scale,
          }
        },
          React.createElement('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
            }
          },
            data.phone ? React.createElement('span', {
              style: {
                fontSize: 12 * scale,
                fontWeight: 400,
                color: '#888',
              }
            }, data.phone) : null,
            data.email ? React.createElement('span', {
              style: {
                fontSize: 11 * scale,
                fontWeight: 400,
                color: '#555',
              }
            }, data.email) : null,
          ),
          data.logo ? React.createElement('img', {
            src: data.logo,
            style: {
              height: 36 * scale,
              objectFit: 'contain',
            }
          }) : null,
        ),
      ),
    ),

    // Accent line at very top
    React.createElement('div', {
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3 * scale,
        backgroundColor: accent,
        display: 'flex',
      }
    }),
  );
}

// ─── Template Registry ───────────────────────────────────────────────────────

const TEMPLATES: Record<string, (data: TemplateData, w: number, h: number) => React.ReactElement> = {
  'just-listed': JustListedTemplate,
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
      return res.status(400).json({ error: `Unknown template: ${template}` });
    }

    const dims = FORMATS[format];
    if (!dims) {
      return res.status(400).json({ error: `Unknown format: ${format}. Options: ${Object.keys(FORMATS).join(', ')}` });
    }

    const fonts = loadFonts();
    const element = templateFn(data as TemplateData, dims.width, dims.height);

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
