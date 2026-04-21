/**
 * render.ts — Spec-driven Satori renderer
 *
 * One entry point: renderFromSpec({ spec, ratio, listingData, brandKit })
 * Returns a Satori-compatible JSX tree (React element) that @vercel/og
 * will rasterize to PNG.
 *
 * Design language preserved from the original hand-coded Broker Bureau
 * templates (see social.tsx pre-spec):
 *   - Near-black ground (INK #0A0A0A)
 *   - Blueprint grid at accent-color × configurable opacity
 *   - L-shaped corner registration marks
 *   - DM Serif Display for hero words, Inter for chrome
 *   - Editorial micro-labels ("LISTING — NO. 001")
 *   - Typographic price as hero number
 *   - Sophisticated gradient overlay at the bottom of photo regions
 *
 * Satori rules respected:
 *   - Every div with children declares display: flex
 *   - Only flex layout (no grid)
 *   - Gradients via inline `background`
 *   - Explicit width on wrapping text
 *   - Absolutely positioned layers for pixel-precise placement
 */

import React from 'react';
import type {
  TemplateSpec,
  ResolvedLayer,
  PhotoSlot,
  ChromeConfig,
} from './slotBindings';
import { resolveSpec } from './slotBindings';

// ─── Design tokens (parity with the original social.tsx) ────────────────────

const INK        = '#0A0A0A';
const PAPER      = '#F5F1EA';
const GRAPHITE   = '#1A1A1A';
const HAIRLINE   = 'rgba(255,255,255,0.10)';
const MUTED      = '#7A7A7A';
const MID        = '#B5B5B5';
const CRIMSON    = '#C41230';

const SERIF      = 'DM Serif Display';
const SERIF_IT   = 'Instrument Serif';
const SANS       = 'Inter';

const e = React.createElement;

// ─── Color resolver ─────────────────────────────────────────────────────────

function accentOf(data: Record<string, any>): string {
  return data.primaryColor || CRIMSON;
}

/** Resolve a semantic color name, literal hex, or fallback to white. */
function resolveColor(name: string | undefined, accent: string): string {
  if (!name) return 'white';
  switch (name) {
    case 'accent':  return accent;
    case 'paper':   return 'white';
    case 'ink':     return INK;
    case 'mid':     return MID;
    case 'muted':   return MUTED;
    case 'paper-warm': return PAPER;
    default:
      // Already a literal hex / rgb / named color
      return name;
  }
}

// ─── Shared chrome primitives ───────────────────────────────────────────────

function BlueprintGrid({
  opacity, color, step = 60,
}: { opacity: number; color: string; step?: number }) {
  // Convert the accent hex to an rgba with the given opacity.
  const c = hexToRgba(color, opacity);
  return e('div', {
    style: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex',
      backgroundImage:
        `linear-gradient(to right, ${c} 1px, transparent 1px),` +
        `linear-gradient(to bottom, ${c} 1px, transparent 1px)`,
      backgroundSize: `${step}px ${step}px`,
      zIndex: 1,
    },
  });
}

function CornerMarks({
  color, size = 44, inset = 40, stroke = 1.5,
}: { color: string; size?: number; inset?: number; stroke?: number }) {
  const corner = (pos: Record<string, any>, borders: Record<string, string>) =>
    e('div', {
      style: {
        position: 'absolute', ...pos,
        width: size, height: size, display: 'flex',
        ...borders,
      },
    });
  return e('div', {
    style: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex',
      pointerEvents: 'none',
      zIndex: 30,
    },
  },
    corner({ top: inset, left: inset },    { borderTop: `${stroke}px solid ${color}`, borderLeft:  `${stroke}px solid ${color}` }),
    corner({ top: inset, right: inset },   { borderTop: `${stroke}px solid ${color}`, borderRight: `${stroke}px solid ${color}` }),
    corner({ bottom: inset, left: inset }, { borderBottom: `${stroke}px solid ${color}`, borderLeft:  `${stroke}px solid ${color}` }),
    corner({ bottom: inset, right: inset },{ borderBottom: `${stroke}px solid ${color}`, borderRight: `${stroke}px solid ${color}` }),
  );
}

function AccentRibbon({ color, height, position }: { color: string; height: number; position: 'top' | 'bottom' }) {
  return e('div', {
    style: {
      position: 'absolute',
      left: 0, right: 0,
      [position]: 0,
      height,
      backgroundColor: color,
      display: 'flex',
      zIndex: 20,
    },
  });
}

function PhotoLayer({
  slot, src, accent, width, height,
}: {
  slot: PhotoSlot;
  src?: string;
  accent: string;
  width: number;
  height: number;
}) {
  const hasImage = !!src;
  const opacity = slot.opacity ?? 1;

  // Gradient choice
  const gradient = slot.gradient || 'none';
  let gradientBg: string | null = null;
  if (gradient === 'bottom-fade') {
    gradientBg = `linear-gradient(to bottom, rgba(10,10,10,0) 0%, rgba(10,10,10,0) 45%, rgba(10,10,10,0.7) 80%, ${INK} 100%)`;
  } else if (gradient === 'radial-dim') {
    gradientBg = `radial-gradient(ellipse at center, rgba(10,10,10,0.3) 0%, rgba(10,10,10,0.75) 60%, ${INK} 100%)`;
  } else if (gradient === 'full-darken') {
    gradientBg = `linear-gradient(to bottom, rgba(10,10,10,0.45) 0%, rgba(10,10,10,0.55) 50%, rgba(10,10,10,0.65) 100%)`;
  }

  const filterParts: string[] = [];
  if (slot.blur) filterParts.push(`blur(${slot.blur}px)`);
  if (slot.filter) filterParts.push(slot.filter);
  const filter = filterParts.length ? filterParts.join(' ') : undefined;

  return e('div', {
    style: {
      position: 'absolute',
      left: slot.x, top: slot.y,
      width: slot.w, height: slot.h,
      display: 'flex',
      overflow: 'hidden',
      zIndex: 5,
    },
  },
    hasImage
      ? e('img', {
          src,
          style: {
            width: '100%', height: '100%',
            objectFit: 'cover',
            opacity,
            ...(filter ? { filter } : {}),
          },
        })
      : e('div', {
          style: {
            width: '100%', height: '100%',
            backgroundColor: '#141414',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          },
        },
          e('span', {
            style: { fontFamily: SERIF_IT, color: '#2a2a2a', fontSize: 28, fontStyle: 'italic' },
          }, 'Property Photo'),
        ),
    gradientBg
      ? e('div', {
          style: {
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex',
            background: gradientBg,
          },
        })
      : null,
  );
}

// ─── Layer renderers per variant ────────────────────────────────────────────
// Each variant turns a ResolvedLayer into an absolutely-positioned Satori div.

function renderLayer(
  layer: ResolvedLayer,
  accent: string,
  brandKit: Record<string, any>,
  data: Record<string, any>,
  canvasWidth: number,
): React.ReactElement | null {
  const {
    x, y, w = 600, size, align = 'left', variant, color, text, topRule, binding,
  } = layer;
  const resolvedColor = resolveColor(binding.color || color, accent);
  const anchor = alignToAnchor(align, x, y, w);

  // Colophon is a compound slot handled separately.
  if (text === 'colophon') {
    return e(Colophon, {
      key: layer.slot,
      layer, brandKit, accent, canvasWidth,
    });
  }

  switch (variant) {
    case 'micro-label':
      return e(MicroLabelLayer, { key: layer.slot, layer, accent, text });
    case 'issue-inline':
      return e(IssueInlineLayer, { key: layer.slot, layer, text });
    case 'issue-centered':
      return e(IssueCenteredLayer, { key: layer.slot, layer, text, accent });
    case 'serif':
    case 'serif-italic': {
      const fontFamily = variant === 'serif-italic' ? SERIF_IT : SERIF;
      const fontStyle = variant === 'serif-italic' ? 'italic' : 'normal';
      return e('div', {
        key: layer.slot,
        style: {
          position: 'absolute',
          ...anchor.style,
          display: 'flex',
          flexDirection: 'column',
          alignItems: anchor.flex,
          zIndex: 15,
          ...(topRule ? {
            paddingTop: 16,
            borderTop: `1px solid ${HAIRLINE}`,
          } : {}),
        },
      },
        e('span', {
          style: {
            fontFamily, fontStyle,
            fontSize: size,
            color: resolvedColor,
            lineHeight: 1.06,
            letterSpacing: '-0.015em',
            width: w,
            textAlign: align,
          },
        }, text),
      );
    }
    case 'serif-strike':
      return e('div', {
        key: layer.slot,
        style: {
          position: 'absolute', ...anchor.style, display: 'flex', zIndex: 15,
        },
      },
        e('span', {
          style: {
            fontFamily: SERIF,
            fontSize: size,
            color: resolvedColor,
            textDecoration: 'line-through',
            lineHeight: 1,
            width: w,
            textAlign: align,
          },
        }, text),
      );
    case 'caps-accent':
      return e('div', {
        key: layer.slot,
        style: { position: 'absolute', ...anchor.style, display: 'flex', zIndex: 15 },
      },
        e('span', {
          style: {
            fontFamily: SANS,
            fontSize: size,
            fontWeight: 700,
            color: accent,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            width: w,
            textAlign: align,
          },
        }, text),
      );
    case 'caps-meta':
      return e('div', {
        key: layer.slot,
        style: { position: 'absolute', ...anchor.style, display: 'flex', zIndex: 15 },
      },
        e('span', {
          style: {
            fontFamily: SANS,
            fontSize: size,
            fontWeight: 400,
            color: MID,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            width: w,
            textAlign: align,
          },
        }, text),
      );
    case 'spec-row':
      return e(SpecRowLayer, { key: layer.slot, layer, accent, data, text });
    case 'stats-inline':
      return e('div', {
        key: layer.slot,
        style: { position: 'absolute', ...anchor.style, display: 'flex', zIndex: 15 },
      },
        e('span', {
          style: {
            fontFamily: SANS,
            fontSize: size,
            fontWeight: 700,
            color: MID,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            width: w,
            textAlign: align,
          },
        }, text),
      );
    case 'date-card':
      return e(DateCardLayer, { key: layer.slot, layer, accent, data });
    case 'plate-label':
    case 'plate-label-accent': {
      const plateColor = variant === 'plate-label-accent' ? accent : MID;
      return e('div', {
        key: layer.slot,
        style: {
          position: 'absolute', ...anchor.style, display: 'flex', flexDirection: 'column', zIndex: 15,
          gap: 4,
        },
      },
        e('span', {
          style: {
            fontFamily: SANS, fontSize: 10, fontWeight: 700,
            color: plateColor,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            width: w, textAlign: align,
          },
        }, variant === 'plate-label-accent' ? 'PLATE II' : 'PLATE I'),
        e('span', {
          style: {
            fontFamily: SERIF,
            fontSize: size,
            color: variant === 'plate-label-accent' ? 'white' : (resolvedColor),
            lineHeight: 1,
            letterSpacing: '-0.01em',
            width: w,
            textAlign: align,
          },
        }, text),
      );
    }
    case 'contact-inline':
      return e('div', {
        key: layer.slot,
        style: {
          position: 'absolute', ...anchor.style, display: 'flex', zIndex: 15,
          ...(topRule ? {
            paddingTop: 14,
            borderTop: `1px solid ${HAIRLINE}`,
          } : {}),
        },
      },
        e('span', {
          style: {
            fontFamily: SANS,
            fontSize: size,
            fontWeight: 700,
            color: 'white',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            width: w,
            textAlign: align,
          },
        }, text.replace(/https?:\/\//g, '')),
      );
    case 'brandmark-text':
      return e('div', {
        key: layer.slot,
        style: { position: 'absolute', ...anchor.style, display: 'flex', zIndex: 15 },
      },
        e('span', {
          style: {
            fontFamily: SANS,
            fontSize: size,
            fontWeight: 400,
            color: MID,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            width: w,
            textAlign: align,
          },
        }, text),
      );
    default:
      // Sensible fallback: plain sans
      return e('div', {
        key: layer.slot,
        style: { position: 'absolute', ...anchor.style, display: 'flex', zIndex: 15 },
      },
        e('span', {
          style: {
            fontFamily: SANS, fontSize: size,
            color: resolvedColor, width: w, textAlign: align,
          },
        }, text),
      );
  }
}

// ─── Compound layer components ──────────────────────────────────────────────

function MicroLabelLayer({
  layer, accent, text,
}: { layer: ResolvedLayer; accent: string; text: string }) {
  const { x, y, w = 600, align = 'left', size } = layer;
  const anchor = alignToAnchor(align, x, y, w);
  const flankLength = align === 'center' ? 32 : 0;
  return e('div', {
    style: {
      position: 'absolute',
      ...anchor.style,
      display: 'flex',
      alignItems: 'center',
      justifyContent: align === 'center' ? 'center' : (align === 'right' ? 'flex-end' : 'flex-start'),
      gap: 10,
      zIndex: 15,
    },
  },
    flankLength ? e('div', {
      style: { width: flankLength, height: 1, backgroundColor: accent, display: 'flex' },
    }) : null,
    e('span', {
      style: {
        fontFamily: SANS,
        fontSize: size,
        fontWeight: 700,
        color: accent,
        letterSpacing: '0.32em',
        textTransform: 'uppercase',
      },
    }, text),
    flankLength ? e('div', {
      style: { width: flankLength, height: 1, backgroundColor: accent, display: 'flex' },
    }) : null,
  );
}

function IssueInlineLayer({ layer, text }: { layer: ResolvedLayer; text: string }) {
  const { x, y, w = 200, size } = layer;
  const anchor = alignToAnchor('right', x, y, w);
  return e('div', {
    style: {
      position: 'absolute', ...anchor.style,
      display: 'flex', alignItems: 'center', gap: 14,
      justifyContent: 'flex-end',
      zIndex: 15,
    },
  },
    e('span', {
      style: {
        fontFamily: SANS, fontSize: 10, fontWeight: 400,
        color: MID, letterSpacing: '0.32em', textTransform: 'uppercase',
      },
    }, 'Issue'),
    e('span', {
      style: {
        fontFamily: SERIF, fontSize: size, color: 'white',
        letterSpacing: '0.02em', lineHeight: 1,
      },
    }, text),
  );
}

function IssueCenteredLayer({
  layer, text, accent,
}: { layer: ResolvedLayer; text: string; accent: string }) {
  const { x, y, w = 400, size } = layer;
  const anchor = alignToAnchor('center', x, y, w);
  return e('div', {
    style: {
      position: 'absolute', ...anchor.style,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 4, zIndex: 15,
    },
  },
    e('span', {
      style: {
        fontFamily: SANS, fontSize: 10, fontWeight: 700, color: accent,
        letterSpacing: '0.35em', textTransform: 'uppercase',
      },
    }, 'No.'),
    e('span', {
      style: {
        fontFamily: SERIF, fontSize: size, color: 'white',
        lineHeight: 1, letterSpacing: '0.02em',
      },
    }, text),
  );
}

function DateCardLayer({
  layer, accent, data,
}: { layer: ResolvedLayer; accent: string; data: Record<string, any> }) {
  const { x, y, w = 600, size } = layer;
  const anchor = alignToAnchor('center', x, y, w);
  const hasDate = !!data.date;
  const hasTime = !!data.time;
  if (!hasDate && !hasTime) return null;
  return e('div', {
    style: {
      position: 'absolute',
      ...anchor.style,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '22px 48px',
      border: `1.5px solid ${accent}`,
      backgroundColor: 'rgba(10,10,10,0.55)',
      gap: 8,
      zIndex: 15,
    },
  },
    hasDate ? e('span', {
      style: {
        fontFamily: SERIF, fontSize: size, color: 'white',
        lineHeight: 1.1, letterSpacing: '0.01em', textAlign: 'center',
      },
    }, String(data.date)) : null,
    hasDate && hasTime ? e('div', {
      style: { width: 40, height: 1, backgroundColor: accent, display: 'flex' },
    }) : null,
    hasTime ? e('span', {
      style: {
        fontFamily: SANS, fontSize: Math.max(14, size * 0.55), fontWeight: 700, color: MID,
        letterSpacing: '0.28em', textTransform: 'uppercase',
      },
    }, String(data.time)) : null,
  );
}

/** Magazine-style stat row: "4 BEDROOMS · 3 BATHROOMS · 2,840 SQ FT" */
function SpecRowLayer({
  layer, accent, data, text,
}: { layer: ResolvedLayer; accent: string; data: Record<string, any>; text: string }) {
  const { x, y, w = 900, size, topRule } = layer;
  const anchor = alignToAnchor(layer.align || 'left', x, y, w);
  const parts: Array<{ value: string | number; label: string }> = [];
  if (data.beds) parts.push({ value: data.beds, label: 'Bedrooms' });
  if (data.baths) parts.push({ value: data.baths, label: 'Bathrooms' });
  if (data.sqft) parts.push({
    value: typeof data.sqft === 'number' ? data.sqft.toLocaleString() : data.sqft,
    label: 'Square Feet',
  });
  if (!parts.length) return null;
  return e('div', {
    style: {
      position: 'absolute',
      ...anchor.style,
      display: 'flex',
      gap: 48,
      alignItems: 'flex-start',
      zIndex: 15,
      ...(topRule ? {
        paddingTop: 18,
        borderTop: `1px solid ${HAIRLINE}`,
      } : {}),
    },
  },
    ...parts.map((p, i) => e('div', {
      key: i,
      style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
    },
      e('span', {
        style: {
          fontFamily: SERIF, fontSize: size, color: 'white',
          lineHeight: 1, letterSpacing: '-0.01em',
        },
      }, String(p.value)),
      e('span', {
        style: {
          fontFamily: SANS, fontSize: 10, fontWeight: 700, color: MID,
          letterSpacing: '0.28em', textTransform: 'uppercase',
        },
      }, p.label),
    )),
  );
}

/** Compound colophon: headshot/name/brokerage on left, contact/logo on right. */
function Colophon({
  layer, brandKit, accent, canvasWidth,
}: {
  layer: ResolvedLayer;
  brandKit: Record<string, any>;
  accent: string;
  canvasWidth: number;
}) {
  const { x, y, w = canvasWidth - 2 * x, topRule } = layer;
  return e('div', {
    style: {
      position: 'absolute',
      left: x, top: y,
      width: w,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 15,
      ...(topRule ? {
        paddingTop: 18,
        borderTop: `1px solid ${HAIRLINE}`,
      } : {}),
    },
  },
    // Left — headshot + name + brokerage
    e('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
      brandKit.headshot ? e('img', {
        src: brandKit.headshot,
        style: {
          width: 56, height: 56, borderRadius: '50%', objectFit: 'cover',
          border: `1.5px solid ${accent}`,
        },
      }) : null,
      e('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
        brandKit.agentName ? e('span', {
          style: {
            fontFamily: SERIF, fontSize: 20, color: 'white',
            lineHeight: 1.1, letterSpacing: '-0.005em',
          },
        }, brandKit.agentName) : null,
        brandKit.brokerageName ? e('span', {
          style: {
            fontFamily: SANS, fontSize: 11, fontWeight: 400, color: MID,
            letterSpacing: '0.22em', textTransform: 'uppercase',
          },
        }, brandKit.brokerageName) : null,
      ),
    ),
    // Right — contact + logo
    e('div', { style: { display: 'flex', alignItems: 'center', gap: 20 } },
      e('div', {
        style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
      },
        brandKit.phone ? e('span', {
          style: {
            fontFamily: SANS, fontSize: 14, fontWeight: 700, color: 'white',
            letterSpacing: '0.05em',
          },
        }, brandKit.phone) : null,
        (brandKit.website || brandKit.email) ? e('span', {
          style: {
            fontFamily: SANS, fontSize: 10, fontWeight: 400, color: MID,
            letterSpacing: '0.22em', textTransform: 'uppercase',
          },
        }, (brandKit.website || brandKit.email).replace(/^https?:\/\//, '')) : null,
      ),
      brandKit.logo ? e('img', {
        src: brandKit.logo,
        style: { height: 48, maxWidth: 140, objectFit: 'contain' },
      }) : null,
    ),
  );
}

// ─── Split before/after renderer ────────────────────────────────────────────

/**
 * Emit the before/after split as an array of absolutely-positioned elements.
 * Returns an array (not a Fragment) because Satori prefers flat flex trees and
 * the parent spreads these straight into the root canvas children.
 */
function buildSplitPhotoElements({
  split, beforeSrc, afterSrc, accent, chrome,
}: {
  split: NonNullable<import('./slotBindings').RatioSpec['splitPhotoSlot']>;
  beforeSrc?: string;
  afterSrc?: string;
  accent: string;
  chrome: ChromeConfig;
}): React.ReactElement[] {
  const isHorizontal = split.axis === 'horizontal';
  const out: React.ReactElement[] = [];

  // Before panel
  out.push(
    e('div', {
      key: 'split-before',
      style: {
        position: 'absolute',
        left: split.before.x, top: split.before.y,
        width: split.before.w, height: split.before.h,
        display: 'flex', overflow: 'hidden',
        border: `1px solid ${HAIRLINE}`,
        zIndex: 5,
      },
    },
      beforeSrc ? e('img', {
        src: beforeSrc,
        style: {
          width: '100%', height: '100%', objectFit: 'cover',
          ...(split.before.filter ? { filter: split.before.filter } : {}),
        },
      }) : e('div', {
        style: {
          width: '100%', height: '100%', backgroundColor: GRAPHITE,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
      }, e('span', {
        style: { fontFamily: SERIF_IT, color: '#2a2a2a', fontSize: 22, fontStyle: 'italic' },
      }, 'Before')),
      e('div', {
        style: {
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
          background: `linear-gradient(to bottom, rgba(10,10,10,0.45) 0%, rgba(10,10,10,0) 30%, rgba(10,10,10,0) 70%, rgba(10,10,10,0.7) 100%)`,
        },
      }),
    ),
  );

  // After panel
  out.push(
    e('div', {
      key: 'split-after',
      style: {
        position: 'absolute',
        left: split.after.x, top: split.after.y,
        width: split.after.w, height: split.after.h,
        display: 'flex', overflow: 'hidden',
        border: `1px solid ${accent}`,
        zIndex: 5,
      },
    },
      afterSrc ? e('img', {
        src: afterSrc,
        style: { width: '100%', height: '100%', objectFit: 'cover' },
      }) : e('div', {
        style: {
          width: '100%', height: '100%', backgroundColor: GRAPHITE,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
      }, e('span', {
        style: { fontFamily: SERIF_IT, color: '#2a2a2a', fontSize: 22, fontStyle: 'italic' },
      }, 'After')),
      e('div', {
        style: {
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
          background: `linear-gradient(to bottom, rgba(10,10,10,0.45) 0%, rgba(10,10,10,0) 30%, rgba(10,10,10,0) 70%, rgba(10,10,10,0.7) 100%)`,
        },
      }),
    ),
  );

  // Center medallion (horizontal splits only, when configured)
  if (isHorizontal && chrome.centerMedallion?.enabled) {
    out.push(
      e('div', {
        key: 'split-medallion',
        style: {
          position: 'absolute',
          top: split.before.y + split.before.h / 2 - 36,
          left: (split.before.x + split.before.w + split.after.x) / 2 - 36,
          width: 72, height: 72,
          borderRadius: 36,
          backgroundColor: INK,
          border: `1.5px solid ${accent}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 25,
        },
      },
        e('span', {
          style: {
            fontFamily: SERIF_IT, fontSize: 28, color: 'white',
            fontStyle: 'italic', lineHeight: 1,
          },
        }, chrome.centerMedallion.glyph || '&'),
      ),
    );
  }

  return out;
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export function renderFromSpec({
  spec, ratio, listingData = {}, brandKit = {},
}: {
  spec: TemplateSpec;
  ratio: string;
  listingData?: Record<string, any>;
  brandKit?: Record<string, any>;
}): React.ReactElement {
  const resolved = resolveSpec(spec, ratio, listingData, brandKit);
  const accent = accentOf({ ...brandKit, ...listingData });
  const chrome = resolved.chrome;

  const children: React.ReactNode[] = [];

  // 1. Blueprint grid (just over the ground)
  if (chrome.grid?.enabled) {
    children.push(e(BlueprintGrid, {
      key: 'grid',
      color: chrome.grid.color === 'accent' ? accent : (chrome.grid.color || accent),
      opacity: chrome.grid.opacity ?? 0.04,
    }));
  }

  // 2. Photo layer(s)
  const heroSrc = listingData.heroImage;
  const beforeSrc = listingData.beforeImage;
  const afterSrc = listingData.afterImage;
  if (resolved.splitPhotoSlot) {
    const splitEls = buildSplitPhotoElements({
      split: resolved.splitPhotoSlot,
      beforeSrc, afterSrc,
      accent, chrome,
    });
    splitEls.forEach(el => children.push(el));
  } else if (resolved.photoSlot) {
    children.push(e(PhotoLayer, {
      key: 'photo',
      slot: resolved.photoSlot,
      src: heroSrc, accent,
      width: resolved.width, height: resolved.height,
    }));
  }

  // 3. Accent ribbon
  if (chrome.accentRibbon?.enabled) {
    children.push(e(AccentRibbon, {
      key: 'ribbon',
      color: accent,
      height: chrome.accentRibbon.height ?? 4,
      position: chrome.accentRibbon.position ?? 'top',
    }));
  }

  // 4. Text layers
  resolved.layers.forEach((layer) => {
    const el = renderLayer(layer, accent, brandKit, resolved.data, resolved.width);
    if (el) children.push(el);
  });

  // 5. Corner registration marks (sit above everything)
  if (chrome.registrationMarks?.enabled) {
    children.push(e(CornerMarks, {
      key: 'corners',
      color: chrome.registrationMarks.color === 'accent' ? accent : (chrome.registrationMarks.color || accent),
      size: chrome.registrationMarks.size ?? 32,
      inset: chrome.registrationMarks.inset ?? 22,
      stroke: chrome.registrationMarks.stroke ?? 1.5,
    }));
  }

  // Root canvas
  return e('div', {
    style: {
      width: resolved.width,
      height: resolved.height,
      position: 'relative',
      display: 'flex',
      backgroundColor: INK,
      fontFamily: SANS,
      overflow: 'hidden',
    },
  }, ...children);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Turn an (x, y, width, align) tuple into an absolute style. For right-
 * aligned layers we anchor `right` from the canvas; for centered layers
 * we use a fixed width and translate by half. For left we just pin left.
 */
function alignToAnchor(align: 'left' | 'center' | 'right', x: number, y: number, w: number) {
  if (align === 'center') {
    const leftEdge = Math.round(x - w / 2);
    return {
      style: { left: leftEdge, top: y, width: w } as any,
      flex: 'center' as const,
    };
  }
  if (align === 'right') {
    // x is the right edge; anchor via "left" + width trick (Satori respects right poorly on absolute).
    // Use left: x - w, width: w, then align text right.
    return {
      style: { left: Math.round(x - w), top: y, width: w } as any,
      flex: 'flex-end' as const,
    };
  }
  return {
    style: { left: x, top: y, width: w } as any,
    flex: 'flex-start' as const,
  };
}

/**
 * Convert "#RRGGBB" (or 3-digit shorthand) + alpha 0..1 to rgba string.
 * Falls back to a white rgba if the value can't be parsed.
 */
function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith('#')) return `rgba(255,255,255,${alpha})`;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
