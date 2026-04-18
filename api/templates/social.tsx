/**
 * social.tsx — Premium social media templates for StudioAI
 * Rendered via Satori (JSX → SVG → PNG)
 *
 * Design language: Dark, minimal, Behance-tier
 * - Asymmetric layouts, photo bleeds off edges
 * - Typography as design (oversized price, tracked headlines)
 * - Accent geometry (hairline borders, corner brackets)
 * - Negative space is intentional
 * - 90% dark + white + ONE accent color
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
  date?: string;       // for open house
  time?: string;       // for open house
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
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

const e = React.createElement;

function StatPill({ value, label, scale, accent }: { value: string | number; label: string; scale: number; accent: string }) {
  return e('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: `${8 * scale}px ${16 * scale}px`,
      borderRadius: 8 * scale,
      border: '1px solid #222',
      backgroundColor: 'rgba(255,255,255,0.03)',
    }
  },
    e('span', {
      style: { fontSize: 22 * scale, fontWeight: 700, color: 'white', lineHeight: 1.2 }
    }, String(value)),
    e('span', {
      style: { fontSize: 9 * scale, fontWeight: 400, color: '#555', letterSpacing: '0.15em', marginTop: 2 * scale }
    }, label.toUpperCase()),
  );
}

function AgentBar({ data, scale }: { data: TemplateData; scale: number }) {
  const accent = data.primaryColor || '#0A84FF';
  return e('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
    }
  },
    // Left: headshot + name
    e('div', {
      style: { display: 'flex', alignItems: 'center', gap: 12 * scale }
    },
      data.headshot ? e('img', {
        src: data.headshot,
        style: {
          width: 44 * scale, height: 44 * scale, borderRadius: '50%', objectFit: 'cover',
          border: `2px solid ${accent}`,
        }
      }) : null,
      e('div', { style: { display: 'flex', flexDirection: 'column' } },
        data.agentName ? e('span', {
          style: { fontSize: 16 * scale, fontWeight: 700, color: 'white', letterSpacing: '-0.005em' }
        }, data.agentName) : null,
        data.brokerageName ? e('span', {
          style: { fontSize: 12 * scale, fontWeight: 500, color: '#9ca3af' }
        }, data.brokerageName) : null,
      ),
    ),
    // Right: contact + logo
    e('div', {
      style: { display: 'flex', alignItems: 'center', gap: 16 * scale }
    },
      e('div', {
        style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }
      },
        data.phone ? e('span', {
          style: { fontSize: 13 * scale, fontWeight: 600, color: 'white' }
        }, data.phone) : null,
        (data.email || data.website) ? e('span', {
          style: { fontSize: 11 * scale, fontWeight: 400, color: '#9ca3af' }
        }, data.website || data.email) : null,
      ),
      data.logo ? e('img', {
        src: data.logo,
        style: { height: 40 * scale, maxWidth: 120 * scale, objectFit: 'contain' }
      }) : null,
    ),
  );
}

function CornerBrackets({ scale, accent, size = 40, inset = 16 }: { scale: number; accent: string; size?: number; inset?: number }) {
  const s = size * scale;
  const w = 1.5 * scale;
  const offset = inset * scale;
  return e('div', { style: { display: 'flex', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' } },
    // Top-left
    e('div', { style: { position: 'absolute', top: offset, left: offset, width: s, height: s, borderTop: `${w}px solid ${accent}`, borderLeft: `${w}px solid ${accent}`, display: 'flex' } }),
    // Top-right
    e('div', { style: { position: 'absolute', top: offset, right: offset, width: s, height: s, borderTop: `${w}px solid ${accent}`, borderRight: `${w}px solid ${accent}`, display: 'flex' } }),
    // Bottom-left
    e('div', { style: { position: 'absolute', bottom: offset, left: offset, width: s, height: s, borderBottom: `${w}px solid ${accent}`, borderLeft: `${w}px solid ${accent}`, display: 'flex' } }),
    // Bottom-right
    e('div', { style: { position: 'absolute', bottom: offset, right: offset, width: s, height: s, borderBottom: `${w}px solid ${accent}`, borderRight: `${w}px solid ${accent}`, display: 'flex' } }),
  );
}

function LocationLine({ data, scale }: { data: TemplateData; scale: number }) {
  const parts = [data.city, data.state, data.zip].filter(Boolean);
  if (!parts.length) return null;
  return e('span', {
    style: { fontSize: 13 * scale, fontWeight: 400, color: '#666', letterSpacing: '0.05em' }
  }, parts.join(', '));
}

// ─── Template 1: JUST LISTED / JUST SOLD ─────────────────────────────────────

export function JustListedTemplate(data: TemplateData, width: number, height: number) {
  const accent = data.primaryColor || '#0A84FF';
  const isVertical = height > width;
  const scale = width / 1080;
  const photoHeight = isVertical ? '52%' : '62%';

  return e('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: '#080808', fontFamily: 'Inter', overflow: 'hidden', position: 'relative',
    }
  },
    // Accent line top
    e('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 * scale, backgroundColor: accent, display: 'flex' } }),

    // Photo area — fills all remaining space after content
    e('div', {
      style: {
        display: 'flex', position: 'relative', width: '100%', flex: 1,
        overflow: 'hidden',
      }
    },
      data.heroImage ? e('img', {
        src: data.heroImage,
        style: { width: '100%', height: '100%', objectFit: 'cover' }
      }) : e('div', {
        style: { width: '100%', height: '100%', backgroundColor: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'center' }
      }, e('span', { style: { color: '#2a2a2a', fontSize: 20 * scale } }, 'Property Photo')),

      // Gradient fade to dark
      e('div', { style: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(transparent, #080808)', display: 'flex' } }),

      // Headline badge — accent bar + tracked text
      e('div', {
        style: { position: 'absolute', top: 28 * scale, left: 32 * scale, display: 'flex', alignItems: 'center', gap: 10 * scale }
      },
        e('div', { style: { width: 3 * scale, height: 24 * scale, backgroundColor: accent, borderRadius: 2, display: 'flex' } }),
        e('span', {
          style: { fontSize: 12 * scale, fontWeight: 700, color: 'white', letterSpacing: '0.25em' }
        }, (data.headline || 'JUST LISTED').toUpperCase()),
      ),

      // Price — large, overlaid at bottom of photo
      data.price ? e('div', {
        style: { position: 'absolute', bottom: 16 * scale, left: 32 * scale, display: 'flex', alignItems: 'baseline', gap: 4 * scale }
      },
        e('span', {
          style: { fontSize: 48 * scale, fontWeight: 700, color: 'white', letterSpacing: '-0.03em', lineHeight: 1 }
        }, data.price),
      ) : null,
    ),

    // Content area — natural height, no dead space
    e('div', {
      style: { display: 'flex', flexDirection: 'column', padding: `${20 * scale}px ${32 * scale}px ${24 * scale}px`, gap: 14 * scale }
    },
      // Address block
      data.address ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 * scale } },
        e('span', { style: { fontSize: 22 * scale, fontWeight: 700, color: 'white', lineHeight: 1.25, letterSpacing: '-0.01em' } }, data.address),
        e(LocationLine, { data, scale }),
      ) : null,

      // Stats row
      (data.beds || data.baths || data.sqft) ? e('div', {
        style: { display: 'flex', gap: 10 * scale, flexWrap: 'wrap' }
      },
        ...[
          data.beds ? { value: data.beds, label: 'Beds' } : null,
          data.baths ? { value: data.baths, label: 'Baths' } : null,
          data.sqft ? { value: data.sqft.toLocaleString(), label: 'Sq Ft' } : null,
          data.yearBuilt ? { value: data.yearBuilt, label: 'Built' } : null,
        ].filter(Boolean).map((stat, i) =>
          e(StatPill, { key: i, value: stat!.value, label: stat!.label, scale, accent })
        ),
      ) : null,

      // Agent bar — sits right after content, no forced empty space
      e('div', { style: { borderTop: '1px solid #1a1a1a', paddingTop: 14 * scale, marginTop: 8 * scale, display: 'flex' } },
        e(AgentBar, { data, scale }),
      ),
    ),
  );
}

// ─── Template 2: BEFORE / AFTER ──────────────────────────────────────────────

export function BeforeAfterTemplate(data: TemplateData, width: number, height: number) {
  const accent = data.primaryColor || '#0A84FF';
  const scale = width / 1080;
  const isVertical = height > width;

  return e('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: '#080808', fontFamily: 'Inter', overflow: 'hidden', position: 'relative',
    }
  },
    // Accent line top
    e('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 * scale, backgroundColor: accent, display: 'flex', zIndex: 10 } }),

    // Top label bar
    e('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `${20 * scale}px`, gap: 8 * scale, paddingTop: 24 * scale }
    },
      e('div', { style: { width: 3 * scale, height: 20 * scale, backgroundColor: accent, borderRadius: 2, display: 'flex' } }),
      e('span', {
        style: { fontSize: 12 * scale, fontWeight: 700, color: 'white', letterSpacing: '0.25em' }
      }, 'TRANSFORMATION'),
    ),

    // Split image area — diagonal or side-by-side
    e('div', {
      style: { display: 'flex', flexDirection: isVertical ? 'column' : 'row', flex: 1, gap: 3 * scale, padding: `0 ${16 * scale}px` }
    },
      // Before
      e('div', {
        style: { flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 8 * scale, display: 'flex' }
      },
        data.beforeImage ? e('img', {
          src: data.beforeImage,
          style: { width: '100%', height: '100%', objectFit: 'cover' }
        }) : e('div', {
          style: { width: '100%', height: '100%', backgroundColor: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'center' }
        }, e('span', { style: { color: '#2a2a2a', fontSize: 16 * scale } }, 'Before')),
        // Label
        e('div', {
          style: { position: 'absolute', bottom: 12 * scale, left: 12 * scale, backgroundColor: 'rgba(0,0,0,0.7)', padding: `${4 * scale}px ${12 * scale}px`, borderRadius: 6 * scale, display: 'flex' }
        }, e('span', { style: { fontSize: 10 * scale, fontWeight: 700, color: '#999', letterSpacing: '0.15em' } }, 'BEFORE')),
      ),

      // After
      e('div', {
        style: { flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 8 * scale, display: 'flex' }
      },
        data.afterImage ? e('img', {
          src: data.afterImage,
          style: { width: '100%', height: '100%', objectFit: 'cover' }
        }) : e('div', {
          style: { width: '100%', height: '100%', backgroundColor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }
        }, e('span', { style: { color: '#2a2a2a', fontSize: 16 * scale } }, 'After')),
        // Label
        e('div', {
          style: { position: 'absolute', bottom: 12 * scale, left: 12 * scale, backgroundColor: accent, padding: `${4 * scale}px ${12 * scale}px`, borderRadius: 6 * scale, display: 'flex' }
        }, e('span', { style: { fontSize: 10 * scale, fontWeight: 700, color: 'white', letterSpacing: '0.15em' } }, 'AFTER')),
      ),
    ),

    // Bottom bar — address + agent
    e('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${16 * scale}px ${24 * scale}px ${20 * scale}px` }
    },
      // Left: property info
      e('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 * scale } },
        data.address ? e('span', { style: { fontSize: 14 * scale, fontWeight: 700, color: 'white' } }, data.address) : null,
        e(LocationLine, { data, scale }),
      ),
      // Right: agent
      e('div', { style: { display: 'flex', alignItems: 'center', gap: 10 * scale } },
        data.agentName ? e('span', { style: { fontSize: 12 * scale, fontWeight: 700, color: '#888' } }, data.agentName) : null,
        data.headshot ? e('img', {
          src: data.headshot,
          style: { width: 32 * scale, height: 32 * scale, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${accent}` }
        }) : null,
      ),
    ),

    // StudioAI watermark
    e('div', {
      style: { position: 'absolute', bottom: 20 * scale, left: '50%', transform: 'translateX(-50%)', display: 'flex', opacity: 0.3 }
    },
      e('span', { style: { fontSize: 8 * scale, fontWeight: 400, color: '#666', letterSpacing: '0.2em' } }, 'STUDIOAI'),
    ),
  );
}

// ─── Template 3: OPEN HOUSE ──────────────────────────────────────────────────

export function OpenHouseTemplate(data: TemplateData, width: number, height: number) {
  const accent = data.primaryColor || '#0A84FF';
  const scale = width / 1080;

  return e('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: '#080808', fontFamily: 'Inter', overflow: 'hidden', position: 'relative',
    }
  },
    // Full background photo with heavy overlay
    e('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex' } },
      data.heroImage ? e('img', {
        src: data.heroImage,
        style: { width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }
      }) : null,
    ),
    // Dark overlay
    e('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,8,8,0.7)', display: 'flex' } }),

    // Corner brackets — inset enough to clear agent bar
    e(CornerBrackets, { scale, accent, size: 36, inset: 10 }),

    // Content centered
    e('div', {
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: `${60 * scale}px ${56 * scale}px`, gap: 24 * scale, zIndex: 1 }
    },
      // "OPEN HOUSE" headline
      e('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 * scale } },
        e('span', {
          style: { fontSize: 12 * scale, fontWeight: 700, color: accent, letterSpacing: '0.3em' }
        }, 'YOU\'RE INVITED'),
        e('span', {
          style: { fontSize: 52 * scale, fontWeight: 700, color: 'white', letterSpacing: '-0.02em', lineHeight: 1 }
        }, 'OPEN HOUSE'),
      ),

      // Divider
      e('div', { style: { width: 60 * scale, height: 2 * scale, backgroundColor: accent, display: 'flex' } }),

      // Date + Time
      (data.date || data.time) ? e('div', {
        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 * scale }
      },
        data.date ? e('span', { style: { fontSize: 22 * scale, fontWeight: 700, color: 'white', letterSpacing: '0.05em' } }, data.date) : null,
        data.time ? e('span', { style: { fontSize: 16 * scale, fontWeight: 400, color: '#888' } }, data.time) : null,
      ) : null,

      // Address
      data.address ? e('div', {
        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 * scale, marginTop: 8 * scale }
      },
        e('span', { style: { fontSize: 18 * scale, fontWeight: 700, color: 'white', textAlign: 'center', lineHeight: 1.3 } }, data.address),
        e(LocationLine, { data, scale }),
      ) : null,

      // Price + Stats row
      e('div', { style: { display: 'flex', alignItems: 'center', gap: 16 * scale, marginTop: 8 * scale } },
        data.price ? e('div', {
          style: { padding: `${8 * scale}px ${20 * scale}px`, borderRadius: 8 * scale, backgroundColor: accent, display: 'flex' }
        },
          e('span', { style: { fontSize: 20 * scale, fontWeight: 700, color: 'white' } }, data.price),
        ) : null,
        ...[
          data.beds ? { value: data.beds, label: 'Beds' } : null,
          data.baths ? { value: data.baths, label: 'Baths' } : null,
          data.sqft ? { value: data.sqft.toLocaleString(), label: 'Sq Ft' } : null,
        ].filter(Boolean).map((stat, i) =>
          e(StatPill, { key: i, value: stat!.value, label: stat!.label, scale, accent })
        ),
      ),
    ),

    // Agent bar at bottom — padded to clear corner brackets
    e('div', {
      style: { padding: `${16 * scale}px ${56 * scale}px ${52 * scale}px`, borderTop: '1px solid rgba(255,255,255,0.08)', zIndex: 1, display: 'flex' }
    },
      e(AgentBar, { data, scale }),
    ),
  );
}

// ─── Template 4: MARKET TIP / STAT CARD ──────────────────────────────────────

export function TipCardTemplate(data: TemplateData, width: number, height: number) {
  const accent = data.primaryColor || '#0A84FF';
  const scale = width / 1080;

  return e('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: '#080808', fontFamily: 'Inter', overflow: 'hidden', position: 'relative',
      padding: `${56 * scale}px`,
      justifyContent: 'space-between',
    }
  },
    // Accent line top
    e('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 * scale, backgroundColor: accent, display: 'flex' } }),

    // Corner brackets (subtle, behind content)
    e(CornerBrackets, { scale, accent: '#1a1a1a', size: 28, inset: 10 }),

    // Top section
    e('div', { style: { display: 'flex', flexDirection: 'column', gap: 20 * scale, zIndex: 1 } },
      // Category tag
      e('div', { style: { display: 'flex', alignItems: 'center', gap: 8 * scale } },
        e('div', { style: { width: 3 * scale, height: 20 * scale, backgroundColor: accent, borderRadius: 2, display: 'flex' } }),
        e('span', {
          style: { fontSize: 11 * scale, fontWeight: 700, color: accent, letterSpacing: '0.25em' }
        }, (data.headline || 'MARKET TIP').toUpperCase()),
      ),

      // Main text — large quote style
      data.tagline ? e('span', {
        style: { fontSize: 36 * scale, fontWeight: 700, color: 'white', lineHeight: 1.3, maxWidth: '90%' }
      }, data.tagline) : null,

      // Supporting text
      data.address ? e('span', {
        style: { fontSize: 16 * scale, fontWeight: 400, color: '#666', lineHeight: 1.5, maxWidth: '85%' }
      }, data.address) : null,
    ),

    // Agent bar at bottom
    e('div', { style: { borderTop: '1px solid #1a1a1a', paddingTop: 16 * scale, display: 'flex', zIndex: 1 } },
      e(AgentBar, { data, scale }),
    ),
  );
}

// ─── Template Registry ───────────────────────────────────────────────────────

export const TEMPLATES: Record<string, (data: TemplateData, w: number, h: number) => React.ReactElement> = {
  'just-listed': JustListedTemplate,
  'just-sold': (data, w, h) => JustListedTemplate({ ...data, headline: data.headline || 'JUST SOLD' }, w, h),
  'before-after': BeforeAfterTemplate,
  'open-house': OpenHouseTemplate,
  'tip-card': TipCardTemplate,
};
