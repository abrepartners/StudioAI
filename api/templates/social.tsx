/**
 * social.tsx — Broker Bureau social templates (StudioAI, v2)
 *
 * Design language: "Broker Bureau"
 *   Architectural Digest × Apple Keynote × Chief Architect catalogue.
 *
 * Shared visual system across every template:
 *   - Near-black ground (#0A0A0A) with an almost-invisible blueprint grid
 *   - L-shaped architectural corner registration marks
 *   - ONE accent color seasoning (agent's brandKit.primaryColor,
 *     falls back to A&B crimson #C41230)
 *   - Serif display typography (DM Serif Display) for the hero words;
 *     Inter for UI chrome and metadata
 *   - Hairline dividers with tracked micro-labels
 *     ("LISTING — NO. 001", "EST. OPEN HOUSE", "FIELD NOTE")
 *   - Editorial number badge ("No. 001") like a magazine sectional
 *   - Typographic price as the hero number (not a colored pill)
 *   - Sophisticated multi-stop gradient over hero photography
 *
 * Satori constraints respected:
 *   - Every div with children declares `display: flex`
 *   - Only flex layout — no CSS grid, no background-image urls
 *   - Explicit width on wrapping text
 *   - Transforms limited to translate(-50%,0) style
 *   - Gradients via inline `background`
 *
 * Rendered by Satori → SVG → PNG via @vercel/og (see api/render-template.ts).
 */

import React from 'react';

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface TemplateData {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  headline?: string;
  tagline?: string;
  date?: string;
  time?: string;
  heroImage?: string;
  beforeImage?: string;
  afterImage?: string;
  agentName?: string;
  brokerageName?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo?: string;
  headshot?: string;
  primaryColor?: string;
  /** Optional editorial issue number. Defaults to derived from address hash. */
  issueNumber?: string;
}

// ─── Design tokens ───────────────────────────────────────────────────────────

const INK         = '#0A0A0A';      // ground
const PAPER       = '#F5F1EA';      // warm off-white (cream) — AD magazine stock
const BONE        = '#E6DFD1';      // lighter paper variant
const GOLD        = '#C9A84C';      // countertop gold accent (fallback for light)
const CRIMSON     = '#C41230';      // A&B default accent
const GRAPHITE    = '#1A1A1A';      // card / raised surface
const HAIRLINE    = 'rgba(255,255,255,0.10)';
const MUTED       = '#7A7A7A';
const MID         = '#B5B5B5';

const SERIF = 'DM Serif Display';
const SERIF_IT = 'Instrument Serif';
const SANS = 'Inter';

const e = React.createElement;

// ─── Shared helpers ──────────────────────────────────────────────────────────

function pickIssueNumber(data: TemplateData): string {
  if (data.issueNumber) return data.issueNumber;
  const seed = (data.address || data.headline || 'STUDIO').toString();
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  const num = (n % 999) + 1;
  return String(num).padStart(3, '0');
}

function accentOf(data: TemplateData): string {
  return data.primaryColor || CRIMSON;
}

/** Blueprint grid — almost invisible dark grid behind everything. */
function BlueprintGrid({ opacity = 0.05, step = 60 }: { opacity?: number; step?: number }) {
  // Build via linear-gradient stacking — cheaper in Satori than many divs.
  const line = `rgba(255,255,255,${opacity})`;
  return e('div', {
    style: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex',
      backgroundImage:
        `linear-gradient(to right, ${line} 1px, transparent 1px),` +
        `linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
      backgroundSize: `${step}px ${step}px`,
    },
  });
}

/** Architectural L-shaped corner brackets, four corners. */
function CornerMarks({
  color, size = 44, inset = 40, stroke = 1.5,
}: { color: string; size?: number; inset?: number; stroke?: number }) {
  return e('div', {
    style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', pointerEvents: 'none' },
  },
    e('div', { style: { position: 'absolute', top: inset, left: inset,    width: size, height: size, borderTop: `${stroke}px solid ${color}`, borderLeft:  `${stroke}px solid ${color}`, display: 'flex' } }),
    e('div', { style: { position: 'absolute', top: inset, right: inset,   width: size, height: size, borderTop: `${stroke}px solid ${color}`, borderRight: `${stroke}px solid ${color}`, display: 'flex' } }),
    e('div', { style: { position: 'absolute', bottom: inset, left: inset, width: size, height: size, borderBottom: `${stroke}px solid ${color}`, borderLeft:  `${stroke}px solid ${color}`, display: 'flex' } }),
    e('div', { style: { position: 'absolute', bottom: inset, right: inset,width: size, height: size, borderBottom: `${stroke}px solid ${color}`, borderRight: `${stroke}px solid ${color}`, display: 'flex' } }),
  );
}

/** Tracked micro-label: small caps, letter-spaced, hairline flanking rule. */
function MicroLabel({
  text, color, scale, flankLength = 24,
}: { text: string; color: string; scale: number; flankLength?: number }) {
  return e('div', { style: { display: 'flex', alignItems: 'center', gap: 10 * scale } },
    flankLength > 0 ? e('div', {
      style: { width: flankLength * scale, height: 1, backgroundColor: color, display: 'flex' },
    }) : null,
    e('span', {
      style: {
        fontFamily: SANS,
        fontSize: 11 * scale,
        fontWeight: 700,
        color,
        letterSpacing: '0.32em',
        textTransform: 'uppercase',
      },
    }, text),
    flankLength > 0 ? e('div', {
      style: { width: flankLength * scale, height: 1, backgroundColor: color, display: 'flex' },
    }) : null,
  );
}

/** Editorial issue number badge: "NO. 001" in tracked caps with a hair rule. */
function IssueBadge({ num, scale, color }: { num: string; scale: number; color: string }) {
  return e('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 * scale } },
    e('span', {
      style: {
        fontFamily: SANS, fontSize: 10 * scale, fontWeight: 700, color,
        letterSpacing: '0.35em', textTransform: 'uppercase',
      },
    }, 'No.'),
    e('span', {
      style: {
        fontFamily: SERIF, fontSize: 28 * scale, color, lineHeight: 1, letterSpacing: '0.02em',
      },
    }, num),
  );
}

function LocationLine({ data, scale, color = MID }: { data: TemplateData; scale: number; color?: string }) {
  const parts = [data.city, data.state, data.zip].filter(Boolean);
  if (!parts.length) return null;
  return e('span', {
    style: {
      fontFamily: SANS, fontSize: 14 * scale, fontWeight: 400, color,
      letterSpacing: '0.16em', textTransform: 'uppercase',
    },
  }, parts.join(' · '));
}

/** The agent colophon — appears pinned at the bottom of most templates. */
function AgentColophon({
  data, scale, onDark = true,
}: { data: TemplateData; scale: number; onDark?: boolean }) {
  const accent = accentOf(data);
  const textColor = onDark ? 'white' : INK;
  const subColor = onDark ? MID : MUTED;
  return e('div', {
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
    },
  },
    // Left — headshot + name + brokerage
    e('div', { style: { display: 'flex', alignItems: 'center', gap: 16 * scale } },
      data.headshot ? e('img', {
        src: data.headshot,
        style: {
          width: 56 * scale, height: 56 * scale, borderRadius: '50%', objectFit: 'cover',
          border: `1.5px solid ${accent}`,
        },
      }) : null,
      e('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 * scale } },
        data.agentName ? e('span', {
          style: {
            fontFamily: SERIF, fontSize: 20 * scale, color: textColor,
            lineHeight: 1.1, letterSpacing: '-0.005em',
          },
        }, data.agentName) : null,
        data.brokerageName ? e('span', {
          style: {
            fontFamily: SANS, fontSize: 11 * scale, fontWeight: 400, color: subColor,
            letterSpacing: '0.22em', textTransform: 'uppercase',
          },
        }, data.brokerageName) : null,
      ),
    ),
    // Right — contact + logo
    e('div', { style: { display: 'flex', alignItems: 'center', gap: 20 * scale } },
      e('div', {
        style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 * scale },
      },
        data.phone ? e('span', {
          style: { fontFamily: SANS, fontSize: 14 * scale, fontWeight: 700, color: textColor, letterSpacing: '0.05em' },
        }, data.phone) : null,
        (data.website || data.email) ? e('span', {
          style: {
            fontFamily: SANS, fontSize: 10 * scale, fontWeight: 400, color: subColor,
            letterSpacing: '0.22em', textTransform: 'uppercase',
          },
        }, (data.website || data.email || '').replace(/^https?:\/\//, '')) : null,
      ),
      data.logo ? e('img', {
        src: data.logo,
        style: { height: 48 * scale, maxWidth: 140 * scale, objectFit: 'contain' },
      }) : null,
    ),
  );
}

/** Stat row presented as a magazine spec sheet — dot-leader style. */
function SpecRow({
  value, label, scale, color, sub = MID,
}: { value: string | number; label: string; scale: number; color: string; sub?: string }) {
  return e('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 * scale } },
    e('span', { style: { fontFamily: SERIF, fontSize: 32 * scale, color, lineHeight: 1, letterSpacing: '-0.01em' } }, String(value)),
    e('span', {
      style: {
        fontFamily: SANS, fontSize: 10 * scale, fontWeight: 700, color: sub,
        letterSpacing: '0.28em', textTransform: 'uppercase',
      },
    }, label),
  );
}

// ─── Template 1: JUST LISTED / JUST SOLD ─────────────────────────────────────

export function JustListedTemplate(data: TemplateData, width: number, height: number) {
  const accent = accentOf(data);
  const scale = width / 1080;
  const isPortrait = height > width;
  const isSquare = Math.abs(width - height) < 40;
  // Editorial split: photo ~58% vertical on portrait, ~64% on square.
  const photoFlex = isPortrait ? 1.55 : 1.7;
  const padX = (isPortrait ? 56 : 48) * scale;
  const issue = pickIssueNumber(data);

  return e('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: INK, fontFamily: SANS, overflow: 'hidden', position: 'relative',
    },
  },
    // Blueprint grid — sits below everything
    e(BlueprintGrid, { opacity: 0.04 }),

    // Accent hairline ribbon at very top
    e('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 * scale, backgroundColor: accent, display: 'flex', zIndex: 5 } }),

    // Top masthead — "THE LISTING" tracked caps + issue number
    e('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${32 * scale}px ${padX}px ${20 * scale}px`, zIndex: 2,
      },
    },
      e(MicroLabel, { text: (data.headline || 'The Listing'), color: accent, scale, flankLength: 0 }),
      e('div', { style: { display: 'flex', alignItems: 'center', gap: 14 * scale } },
        e('span', {
          style: { fontFamily: SANS, fontSize: 10 * scale, fontWeight: 400, color: MID, letterSpacing: '0.32em', textTransform: 'uppercase' },
        }, 'Issue'),
        e('span', {
          style: { fontFamily: SERIF, fontSize: 22 * scale, color: 'white', letterSpacing: '0.02em', lineHeight: 1 },
        }, issue),
      ),
    ),

    // Hairline beneath masthead
    e('div', { style: { height: 1, backgroundColor: HAIRLINE, marginLeft: padX, marginRight: padX, display: 'flex' } }),

    // HERO PHOTO — full-width panel with sophisticated gradient
    e('div', {
      style: {
        flex: photoFlex, display: 'flex', position: 'relative', width: '100%',
        overflow: 'hidden', marginTop: 20 * scale,
      },
    },
      data.heroImage ? e('img', {
        src: data.heroImage,
        style: { width: '100%', height: '100%', objectFit: 'cover' },
      }) : e('div', {
        style: { width: '100%', height: '100%', backgroundColor: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'center' },
      },
        e('span', { style: { fontFamily: SERIF_IT, color: '#2a2a2a', fontSize: 28 * scale, fontStyle: 'italic' } }, 'Hero Photography'),
      ),

      // Double-stop gradient — bottom half fades to INK for text legibility
      e('div', {
        style: {
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
          background: `linear-gradient(to bottom, rgba(10,10,10,0) 0%, rgba(10,10,10,0) 45%, rgba(10,10,10,0.65) 75%, ${INK} 100%)`,
        },
      }),

      // Subtle side-vignette
      e('div', {
        style: {
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
          background: 'linear-gradient(to right, rgba(10,10,10,0.35) 0%, rgba(10,10,10,0) 22%, rgba(10,10,10,0) 78%, rgba(10,10,10,0.35) 100%)',
        },
      }),

      // Top-left photo badge — "PROPERTY / EST. YEAR"
      data.yearBuilt ? e('div', {
        style: {
          position: 'absolute', top: 28 * scale, left: 28 * scale,
          display: 'flex', flexDirection: 'column', gap: 2 * scale,
          padding: `${10 * scale}px ${14 * scale}px`,
          backgroundColor: 'rgba(10,10,10,0.55)',
          border: `1px solid ${HAIRLINE}`,
        },
      },
        e('span', { style: { fontFamily: SANS, fontSize: 9 * scale, fontWeight: 700, color: MID, letterSpacing: '0.3em' } }, 'EST.'),
        e('span', { style: { fontFamily: SERIF, fontSize: 20 * scale, color: 'white', lineHeight: 1 } }, String(data.yearBuilt)),
      ) : null,
    ),

    // CONTENT BAND — address + price + specs
    e('div', {
      style: {
        display: 'flex', flexDirection: 'column', padding: `${8 * scale}px ${padX}px ${28 * scale}px`,
        gap: 20 * scale, zIndex: 2,
      },
    },
      // Address + price row — editorial asymmetric
      e('div', {
        style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 * scale },
      },
        // Left: address in display serif
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 * scale, flex: 1 } },
          data.address ? e('span', {
            style: {
              fontFamily: SERIF, fontSize: (isPortrait ? 56 : 48) * scale, color: 'white',
              lineHeight: 1.02, letterSpacing: '-0.015em',
            },
          }, data.address) : null,
          e(LocationLine, { data, scale }),
        ),
        // Right: price — oversized typographic
        data.price ? e('div', {
          style: {
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 * scale,
          },
        },
          e('span', {
            style: {
              fontFamily: SANS, fontSize: 10 * scale, fontWeight: 700, color: accent,
              letterSpacing: '0.32em', textTransform: 'uppercase',
            },
          }, 'List Price'),
          e('span', {
            style: {
              fontFamily: SERIF, fontSize: (isPortrait ? 64 : 56) * scale, color: 'white',
              lineHeight: 1, letterSpacing: '-0.02em',
            },
          }, data.price),
        ) : null,
      ),

      // Specs strip — hairline top + spec row
      (data.beds || data.baths || data.sqft) ? e('div', {
        style: {
          display: 'flex', flexDirection: 'column',
          borderTop: `1px solid ${HAIRLINE}`, paddingTop: 18 * scale, gap: 18 * scale,
        },
      },
        e('div', { style: { display: 'flex', gap: 48 * scale, alignItems: 'center' } },
          ...[
            data.beds ? { value: data.beds, label: 'Bedrooms' } : null,
            data.baths ? { value: data.baths, label: 'Bathrooms' } : null,
            data.sqft ? { value: data.sqft.toLocaleString(), label: 'Square Feet' } : null,
          ].filter(Boolean).map((s, i) =>
            e(SpecRow, { key: i, value: s!.value, label: s!.label, scale, color: 'white' })
          ),
        ),
      ) : null,

      // Agent colophon
      e('div', {
        style: { borderTop: `1px solid ${HAIRLINE}`, paddingTop: 20 * scale, display: 'flex' },
      },
        e(AgentColophon, { data, scale }),
      ),
    ),

    // Corner marks in accent (sit over the whole thing)
    e(CornerMarks, { color: accent, size: 32 * scale, inset: 20 * scale, stroke: 1.5 }),
  );
}

// ─── Template 2: BEFORE / AFTER ──────────────────────────────────────────────

export function BeforeAfterTemplate(data: TemplateData, width: number, height: number) {
  const accent = accentOf(data);
  const scale = width / 1080;
  const isPortrait = height > width;
  const padX = 48 * scale;

  return e('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: INK, fontFamily: SANS, overflow: 'hidden', position: 'relative',
    },
  },
    e(BlueprintGrid, { opacity: 0.04 }),

    // Top accent ribbon
    e('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 * scale, backgroundColor: accent, display: 'flex', zIndex: 5 } }),

    // Masthead — TRANSFORMATION + serif kicker
    e('div', {
      style: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: `${44 * scale}px ${padX}px ${24 * scale}px`, gap: 14 * scale, zIndex: 2,
      },
    },
      e(MicroLabel, { text: 'Transformation · Field Notes', color: accent, scale, flankLength: 40 }),
      e('span', {
        style: {
          fontFamily: SERIF, fontSize: 48 * scale, color: 'white',
          lineHeight: 1.0, letterSpacing: '-0.02em', textAlign: 'center',
        },
      }, data.headline || 'Before & After'),
    ),

    // Split image area
    e('div', {
      style: {
        display: 'flex', flexDirection: isPortrait ? 'column' : 'row',
        flex: 1, gap: 6 * scale, padding: `0 ${padX}px`,
      },
    },
      // BEFORE panel
      e('div', {
        style: {
          flex: 1, position: 'relative', overflow: 'hidden', display: 'flex',
          border: `1px solid ${HAIRLINE}`,
        },
      },
        data.beforeImage ? e('img', {
          src: data.beforeImage,
          style: { width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(0.35)' },
        }) : e('div', {
          style: { width: '100%', height: '100%', backgroundColor: GRAPHITE, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, e('span', { style: { fontFamily: SERIF_IT, color: '#2a2a2a', fontSize: 22 * scale, fontStyle: 'italic' } }, 'Before')),

        // Fade for label legibility
        e('div', {
          style: {
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
            background: 'linear-gradient(to bottom, rgba(10,10,10,0.45) 0%, rgba(10,10,10,0) 30%, rgba(10,10,10,0) 70%, rgba(10,10,10,0.7) 100%)',
          },
        }),

        // Top-left plate label
        e('div', {
          style: {
            position: 'absolute', top: 20 * scale, left: 20 * scale,
            display: 'flex', flexDirection: 'column', gap: 4 * scale,
          },
        },
          e('span', { style: { fontFamily: SANS, fontSize: 9 * scale, fontWeight: 700, color: MID, letterSpacing: '0.32em' } }, 'PLATE I'),
          e('span', { style: { fontFamily: SERIF, fontSize: 30 * scale, color: 'white', lineHeight: 1, letterSpacing: '-0.01em' } }, 'Before'),
        ),
      ),

      // AFTER panel
      e('div', {
        style: {
          flex: 1, position: 'relative', overflow: 'hidden', display: 'flex',
          border: `1px solid ${accent}`,
        },
      },
        data.afterImage ? e('img', {
          src: data.afterImage,
          style: { width: '100%', height: '100%', objectFit: 'cover' },
        }) : e('div', {
          style: { width: '100%', height: '100%', backgroundColor: GRAPHITE, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, e('span', { style: { fontFamily: SERIF_IT, color: '#2a2a2a', fontSize: 22 * scale, fontStyle: 'italic' } }, 'After')),

        e('div', {
          style: {
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
            background: 'linear-gradient(to bottom, rgba(10,10,10,0.45) 0%, rgba(10,10,10,0) 30%, rgba(10,10,10,0) 70%, rgba(10,10,10,0.7) 100%)',
          },
        }),

        // Top-left plate label — accent
        e('div', {
          style: {
            position: 'absolute', top: 20 * scale, left: 20 * scale,
            display: 'flex', flexDirection: 'column', gap: 4 * scale,
          },
        },
          e('span', { style: { fontFamily: SANS, fontSize: 9 * scale, fontWeight: 700, color: accent, letterSpacing: '0.32em' } }, 'PLATE II'),
          e('span', { style: { fontFamily: SERIF, fontSize: 30 * scale, color: 'white', lineHeight: 1, letterSpacing: '-0.01em' } }, 'After'),
        ),
      ),
    ),

    // Center axis overlay — vertical hair rule & crimson circle seal (only for horizontal split)
    !isPortrait ? e('div', {
      style: {
        position: 'absolute',
        top: 180 * scale, bottom: 160 * scale, left: '50%',
        width: 2, marginLeft: -1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', zIndex: 3, pointerEvents: 'none',
      },
    },
      // Top half hairline
      e('div', { style: { width: 1, flex: 1, backgroundColor: HAIRLINE, display: 'flex' } }),
      // Center medallion
      e('div', {
        style: {
          width: 72 * scale, height: 72 * scale, borderRadius: '50%',
          backgroundColor: INK, border: `1.5px solid ${accent}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginLeft: -36 * scale,
        },
      },
        e('span', {
          style: {
            fontFamily: SERIF_IT, fontSize: 28 * scale, color: 'white',
            fontStyle: 'italic', lineHeight: 1,
          },
        }, '&'),
      ),
      // Bottom half hairline
      e('div', { style: { width: 1, flex: 1, backgroundColor: HAIRLINE, display: 'flex' } }),
    ) : null,

    // Bottom band — address + agent
    e('div', {
      style: {
        display: 'flex', flexDirection: 'column',
        padding: `${24 * scale}px ${padX}px ${32 * scale}px`, gap: 18 * scale, zIndex: 2,
      },
    },
      // Address row
      (data.address || data.tagline) ? e('div', {
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 * scale,
          paddingBottom: 18 * scale, borderBottom: `1px solid ${HAIRLINE}`,
        },
      },
        data.tagline ? e('span', {
          style: {
            fontFamily: SERIF_IT, fontSize: 22 * scale, color: MID, fontStyle: 'italic',
            lineHeight: 1.3, textAlign: 'center',
          },
        }, data.tagline) : null,
        data.address ? e('span', {
          style: { fontFamily: SERIF, fontSize: 24 * scale, color: 'white', letterSpacing: '-0.01em', textAlign: 'center' },
        }, data.address) : null,
        e(LocationLine, { data, scale }),
      ) : null,

      e(AgentColophon, { data, scale }),
    ),

    e(CornerMarks, { color: accent, size: 28 * scale, inset: 20 * scale, stroke: 1.5 }),
  );
}

// ─── Template 3: OPEN HOUSE ──────────────────────────────────────────────────

export function OpenHouseTemplate(data: TemplateData, width: number, height: number) {
  const accent = accentOf(data);
  const scale = width / 1080;
  const padX = 64 * scale;

  return e('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: INK, fontFamily: SANS, overflow: 'hidden', position: 'relative',
    },
  },
    // Hero photo as full-bleed, heavily darkened
    data.heroImage ? e('img', {
      src: data.heroImage,
      style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.38 },
    }) : null,
    // Vignette fade
    e('div', {
      style: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
        background: `radial-gradient(ellipse at center, rgba(10,10,10,0.3) 0%, rgba(10,10,10,0.75) 60%, ${INK} 100%)`,
      },
    }),
    e(BlueprintGrid, { opacity: 0.05 }),

    // Accent ribbon top
    e('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 * scale, backgroundColor: accent, display: 'flex', zIndex: 5 } }),

    // Top micro-label
    e('div', {
      style: {
        display: 'flex', justifyContent: 'center',
        padding: `${54 * scale}px ${padX}px ${0}px`, zIndex: 2,
      },
    },
      e(MicroLabel, { text: "You're Invited · Open House", color: accent, scale, flankLength: 32 }),
    ),

    // Center stack — display serif headline + date card
    e('div', {
      style: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        flex: 1, padding: `${30 * scale}px ${padX}px ${30 * scale}px`, gap: 28 * scale, zIndex: 2,
      },
    },
      // "Open House" — hero serif
      e('span', {
        style: {
          fontFamily: SERIF, fontSize: 112 * scale, color: 'white',
          lineHeight: 0.92, letterSpacing: '-0.03em', textAlign: 'center',
        },
      }, 'Open House'),

      // Serif italic invitation line
      e('span', {
        style: {
          fontFamily: SERIF_IT, fontSize: 24 * scale, color: MID,
          fontStyle: 'italic', textAlign: 'center', lineHeight: 1.3,
        },
      }, 'You are warmly invited to tour'),

      // Address
      data.address ? e('div', {
        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 * scale },
      },
        e('span', {
          style: {
            fontFamily: SERIF, fontSize: 36 * scale, color: 'white',
            lineHeight: 1.1, letterSpacing: '-0.01em', textAlign: 'center',
          },
        }, data.address),
        e(LocationLine, { data, scale }),
      ) : null,

      // Date card — bordered plate with double hairline
      (data.date || data.time) ? e('div', {
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: `${22 * scale}px ${48 * scale}px`,
          border: `1.5px solid ${accent}`,
          backgroundColor: 'rgba(10,10,10,0.55)',
          gap: 8 * scale, marginTop: 12 * scale,
        },
      },
        data.date ? e('span', {
          style: {
            fontFamily: SERIF, fontSize: 28 * scale, color: 'white',
            lineHeight: 1.1, letterSpacing: '0.01em', textAlign: 'center',
          },
        }, data.date) : null,
        data.date && data.time ? e('div', {
          style: { width: 40 * scale, height: 1, backgroundColor: accent, display: 'flex' },
        }) : null,
        data.time ? e('span', {
          style: {
            fontFamily: SANS, fontSize: 16 * scale, fontWeight: 700, color: MID,
            letterSpacing: '0.28em', textTransform: 'uppercase',
          },
        }, data.time) : null,
      ) : null,

      // Price + specs in one clean row
      (data.price || data.beds || data.baths || data.sqft) ? e('div', {
        style: { display: 'flex', gap: 32 * scale, alignItems: 'center', marginTop: 6 * scale },
      },
        data.price ? e('span', {
          style: {
            fontFamily: SERIF, fontSize: 28 * scale, color: 'white',
            letterSpacing: '-0.01em', lineHeight: 1,
          },
        }, data.price) : null,
        data.price && (data.beds || data.baths || data.sqft) ? e('div', {
          style: { width: 1, height: 20 * scale, backgroundColor: HAIRLINE, display: 'flex' },
        }) : null,
        ...[
          data.beds ? `${data.beds} Bed` : null,
          data.baths ? `${data.baths} Bath` : null,
          data.sqft ? `${data.sqft.toLocaleString()} Sq Ft` : null,
        ].filter(Boolean).map((t, i) =>
          e('span', {
            key: i,
            style: {
              fontFamily: SANS, fontSize: 12 * scale, fontWeight: 700, color: MID,
              letterSpacing: '0.22em', textTransform: 'uppercase',
            },
          }, t as string)
        ),
      ) : null,
    ),

    // Agent colophon at bottom
    e('div', {
      style: {
        padding: `${24 * scale}px ${padX}px ${36 * scale}px`, zIndex: 2,
        borderTop: `1px solid ${HAIRLINE}`, display: 'flex',
      },
    },
      e(AgentColophon, { data, scale }),
    ),

    e(CornerMarks, { color: accent, size: 36 * scale, inset: 22 * scale, stroke: 1.5 }),
  );
}

// ─── Template 4: FIELD NOTE / MARKET TIP ─────────────────────────────────────

export function TipCardTemplate(data: TemplateData, width: number, height: number) {
  const accent = accentOf(data);
  const scale = width / 1080;
  const isPortrait = height > width;
  const padX = 72 * scale;
  const issue = pickIssueNumber(data);

  return e('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: INK, fontFamily: SANS, overflow: 'hidden', position: 'relative',
      justifyContent: 'space-between',
    },
  },
    e(BlueprintGrid, { opacity: 0.05 }),

    // Top masthead
    e('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${44 * scale}px ${padX}px ${28 * scale}px`, zIndex: 2,
      },
    },
      e(MicroLabel, { text: (data.headline || 'Field Note'), color: accent, scale, flankLength: 0 }),
      e(IssueBadge, { num: issue, scale, color: MID }),
    ),

    // Hairline below masthead
    e('div', { style: { height: 1, backgroundColor: HAIRLINE, marginLeft: padX, marginRight: padX, display: 'flex' } }),

    // Pull quote — giant serif italic, left-aligned like a magazine feature
    e('div', {
      style: {
        display: 'flex', flexDirection: 'column', flex: 1,
        padding: `${36 * scale}px ${padX}px`, gap: 28 * scale, zIndex: 2,
        justifyContent: 'center',
      },
    },
      // Oversize opening quote glyph
      e('span', {
        style: {
          fontFamily: SERIF, fontSize: 180 * scale, color: accent,
          lineHeight: 0.6, letterSpacing: '-0.02em', height: 100 * scale,
        },
      }, '\u201C'),

      // Quote body — dynamic sizing based on length
      data.tagline ? e('span', {
        style: {
          fontFamily: SERIF, color: 'white',
          fontSize: (data.tagline.length > 140 ? 44 : data.tagline.length > 80 ? 56 : 68) * scale,
          lineHeight: 1.08, letterSpacing: '-0.015em',
          maxWidth: width - padX * 2 - 40 * scale,
        },
      }, data.tagline) : e('span', {
        style: {
          fontFamily: SERIF_IT, fontSize: 44 * scale, color: MID, fontStyle: 'italic',
          lineHeight: 1.15,
        },
      }, 'A field note worth keeping.'),

      // Optional supporting body copy (reusing address field)
      data.address ? e('div', {
        style: { display: 'flex', alignItems: 'center', gap: 16 * scale, marginTop: 8 * scale },
      },
        e('div', { style: { width: 3 * scale, height: 32 * scale, backgroundColor: accent, display: 'flex' } }),
        e('span', {
          style: {
            fontFamily: SANS, fontSize: 18 * scale, fontWeight: 400, color: MID,
            lineHeight: 1.5, maxWidth: width - padX * 2 - 40 * scale,
          },
        }, data.address),
      ) : null,
    ),

    // Bottom band — "BY <agent>" byline with tracked label + colophon
    e('div', {
      style: {
        display: 'flex', flexDirection: 'column',
        padding: `${24 * scale}px ${padX}px ${36 * scale}px`, gap: 20 * scale, zIndex: 2,
      },
    },
      // Byline row
      data.agentName ? e('div', {
        style: { display: 'flex', alignItems: 'center', gap: 16 * scale },
      },
        e('span', {
          style: {
            fontFamily: SANS, fontSize: 11 * scale, fontWeight: 700, color: accent,
            letterSpacing: '0.32em', textTransform: 'uppercase',
          },
        }, 'By'),
        e('span', {
          style: { fontFamily: SERIF_IT, fontSize: 24 * scale, color: 'white', fontStyle: 'italic', letterSpacing: '-0.005em' },
        }, data.agentName),
      ) : null,

      // Colophon
      e('div', {
        style: { borderTop: `1px solid ${HAIRLINE}`, paddingTop: 18 * scale, display: 'flex' },
      },
        e(AgentColophon, { data, scale }),
      ),
    ),

    e(CornerMarks, { color: accent, size: 32 * scale, inset: 24 * scale, stroke: 1.5 }),
  );
}

// ─── Template 5: CAROUSEL COVER / REEL COVER ─────────────────────────────────
// New — built for 4:5 portrait (1080×1350) or 9:16 reel cover.
// Pure editorial hook slide: oversized serif headline over darkened photo.

export function CarouselCoverTemplate(data: TemplateData, width: number, height: number) {
  const accent = accentOf(data);
  const scale = width / 1080;
  const padX = 72 * scale;
  const hook = data.headline || data.tagline || 'A New Listing Worth Seeing';

  // Dynamic sizing so multi-line hooks still fit
  const hookLen = hook.length;
  const hookSize = hookLen > 60 ? 80 : hookLen > 36 ? 104 : 132;

  return e('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: INK, fontFamily: SANS, overflow: 'hidden', position: 'relative',
    },
  },
    // Full-bleed hero (if provided)
    data.heroImage ? e('img', {
      src: data.heroImage,
      style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' },
    }) : null,

    // Heavy gradient — dark at bottom for headline, lighter at top
    e('div', {
      style: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
        background: `linear-gradient(to bottom, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.25) 30%, rgba(10,10,10,0.55) 55%, rgba(10,10,10,0.9) 85%, ${INK} 100%)`,
      },
    }),

    // Very faint blueprint grid on top
    e(BlueprintGrid, { opacity: 0.06 }),

    // Accent ribbon top
    e('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 * scale, backgroundColor: accent, display: 'flex', zIndex: 5 } }),

    // Top masthead
    e('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${48 * scale}px ${padX}px 0`, zIndex: 2,
      },
    },
      e(MicroLabel, { text: 'StudioAI · Listing Book', color: 'white', scale, flankLength: 0 }),
      e('span', {
        style: {
          fontFamily: SERIF_IT, fontSize: 22 * scale, color: accent,
          fontStyle: 'italic', letterSpacing: '0.01em',
        },
      }, 'Swipe \u2192'),
    ),

    // Headline area — pushed to lower-third
    e('div', {
      style: {
        display: 'flex', flexDirection: 'column', flex: 1,
        justifyContent: 'flex-end', padding: `0 ${padX}px ${36 * scale}px`,
        gap: 24 * scale, zIndex: 2,
      },
    },
      // Eyebrow line
      data.address ? e('div', {
        style: { display: 'flex', alignItems: 'center', gap: 12 * scale },
      },
        e('div', { style: { width: 24 * scale, height: 1, backgroundColor: accent, display: 'flex' } }),
        e('span', {
          style: {
            fontFamily: SANS, fontSize: 12 * scale, fontWeight: 700, color: 'white',
            letterSpacing: '0.3em', textTransform: 'uppercase',
          },
        }, data.address),
      ) : null,

      // Hero hook — serif display
      e('span', {
        style: {
          fontFamily: SERIF, fontSize: hookSize * scale, color: 'white',
          lineHeight: 0.95, letterSpacing: '-0.025em',
        },
      }, hook),

      // Optional subtitle
      data.tagline && data.tagline !== hook ? e('span', {
        style: {
          fontFamily: SERIF_IT, fontSize: 24 * scale, color: MID,
          fontStyle: 'italic', lineHeight: 1.35, maxWidth: width - padX * 2,
        },
      }, data.tagline) : null,

      // Price callout row if provided
      data.price ? e('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 16 * scale, marginTop: 6 * scale,
          paddingTop: 18 * scale, borderTop: `1px solid ${HAIRLINE}`,
        },
      },
        e('span', {
          style: {
            fontFamily: SANS, fontSize: 10 * scale, fontWeight: 700, color: accent,
            letterSpacing: '0.32em', textTransform: 'uppercase',
          },
        }, 'From'),
        e('span', {
          style: { fontFamily: SERIF, fontSize: 40 * scale, color: 'white', lineHeight: 1, letterSpacing: '-0.015em' },
        }, data.price),
      ) : null,
    ),

    // Agent colophon
    e('div', {
      style: {
        padding: `${20 * scale}px ${padX}px ${36 * scale}px`, zIndex: 2,
        borderTop: `1px solid ${HAIRLINE}`, display: 'flex',
      },
    },
      e(AgentColophon, { data, scale }),
    ),

    e(CornerMarks, { color: accent, size: 36 * scale, inset: 22 * scale, stroke: 1.5 }),
  );
}

// ─── Template Registry ───────────────────────────────────────────────────────

export const TEMPLATES: Record<string, (data: TemplateData, w: number, h: number) => React.ReactElement> = {
  'just-listed':     JustListedTemplate,
  'just-sold':       (data, w, h) => JustListedTemplate({ ...data, headline: data.headline || 'Just Sold' }, w, h),
  'before-after':    BeforeAfterTemplate,
  'open-house':      OpenHouseTemplate,
  'tip-card':        TipCardTemplate,
  'carousel-cover':  CarouselCoverTemplate,
};
