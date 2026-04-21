/**
 * social.tsx — Broker Bureau social templates (StudioAI, v3 spec-driven)
 *
 * This file is now a thin dispatcher: it loads JSON specs from ./specs/*.json,
 * accepts the same (data, width, height) signature the render endpoint uses,
 * and delegates to the shared spec-driven renderer in ./render.ts.
 *
 * Why the shape preserved:
 *   api/render-template.ts imports TEMPLATES from this module and calls
 *   TEMPLATES[id](data, width, height). That contract is kept intact so the
 *   endpoint code doesn't change. Internally, each template entry now just
 *   resolves the matching JSON spec + picks the right ratio by (width, height)
 *   + hands off to renderFromSpec.
 *
 * Adding a new template in v1.5:
 *   1. Drop a new file at api/templates/specs/<id>.json
 *   2. Import it below and register it in TEMPLATES
 *   3. Ship — no renderer edits, no component edits.
 */

import React from 'react';
import { renderFromSpec } from './render';
import type { TemplateSpec } from './slotBindings';

import justListedSpec from './specs/just-listed.json';
import openHouseSpec from './specs/open-house.json';
import priceReducedSpec from './specs/price-reduced.json';
import soldSpec from './specs/sold.json';
import beforeAfterSpec from './specs/before-after.json';
import comingSoonSpec from './specs/coming-soon.json';

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface TemplateData {
  // Listing
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: string;
  oldPrice?: string;           // price-reduced
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  headline?: string;
  tagline?: string;
  date?: string;               // open-house
  time?: string;               // open-house
  expectedDate?: string;       // coming-soon
  representation?: string;     // sold: "Buyer" | "Seller" | "Both"
  heroImage?: string;
  beforeImage?: string;        // before-after
  afterImage?: string;         // before-after
  // Brand kit (passed through from /api/render-template body)
  agentName?: string;
  brokerageName?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo?: string;
  headshot?: string;
  primaryColor?: string;
  secondaryColor?: string;
  /** Optional editorial issue number. Defaults to derived from address hash. */
  issueNumber?: string;
}

// ─── Spec registry (typed) ───────────────────────────────────────────────────

const SPECS: Record<string, TemplateSpec> = {
  'just-listed':  justListedSpec as TemplateSpec,
  'open-house':   openHouseSpec as TemplateSpec,
  'price-reduced':priceReducedSpec as TemplateSpec,
  'sold':         soldSpec as TemplateSpec,
  'just-sold':    soldSpec as TemplateSpec,  // alias — same template, same spec
  'before-after': beforeAfterSpec as TemplateSpec,
  'coming-soon':  comingSoonSpec as TemplateSpec,
};

// ─── Ratio picker ────────────────────────────────────────────────────────────

function pickRatio(width: number, height: number): string {
  if (Math.abs(width - height) < 40) return 'square';
  if (height > 1700) return 'story';   // 1080×1920 and similar
  return 'portrait';                   // 1080×1350 default
}

// ─── Listing-data / brand-kit split ──────────────────────────────────────────
//
// The endpoint hands us a flat { ...brandKit, ...listingData } map. For the
// renderer we split them again so the colophon component can render purely
// from brand fields and slot interpolation can read both.

const BRAND_FIELDS: ReadonlyArray<keyof TemplateData> = [
  'agentName', 'brokerageName', 'phone', 'email', 'website',
  'logo', 'headshot', 'primaryColor', 'secondaryColor', 'tagline',
] as const;

function splitData(data: TemplateData): {
  brandKit: Record<string, any>;
  listingData: Record<string, any>;
} {
  const brandKit: Record<string, any> = {};
  const listingData: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v == null || v === '') continue;
    if ((BRAND_FIELDS as readonly string[]).includes(k)) {
      brandKit[k] = v;
    } else {
      listingData[k] = v;
    }
  }
  // tagline is a shared field (brand tagline AND sold-post tagline).
  // Keep it available in listingData too so the sold "tagline" slot binds.
  if (data.tagline) listingData.tagline = data.tagline;
  return { brandKit, listingData };
}

// ─── Template entry factory ──────────────────────────────────────────────────

function makeTemplate(specId: string) {
  return (data: TemplateData, width: number, height: number): React.ReactElement => {
    const spec = SPECS[specId];
    if (!spec) {
      // Should never happen given the SPECS keys, but keep a readable fallback.
      throw new Error(`Template spec not found: ${specId}`);
    }
    const ratio = pickRatio(width, height);
    const { brandKit, listingData } = splitData(data);
    return renderFromSpec({ spec, ratio, brandKit, listingData });
  };
}

// ─── Public exports ─────────────────────────────────────────────────────────
// Preserving the ID-keyed registry contract that api/render-template.ts uses.

export const TEMPLATES: Record<string, (data: TemplateData, w: number, h: number) => React.ReactElement> = {
  'just-listed':    makeTemplate('just-listed'),
  'just-sold':      makeTemplate('sold'),           // legacy alias
  'sold':           makeTemplate('sold'),
  'price-reduced':  makeTemplate('price-reduced'),
  'open-house':     makeTemplate('open-house'),
  'before-after':   makeTemplate('before-after'),
  'coming-soon':    makeTemplate('coming-soon'),
};

// ─── Legacy named exports ────────────────────────────────────────────────────
// Kept so existing imports (if any) continue to resolve.

export const JustListedTemplate  = TEMPLATES['just-listed'];
export const OpenHouseTemplate   = TEMPLATES['open-house'];
export const BeforeAfterTemplate = TEMPLATES['before-after'];
export const SoldTemplate        = TEMPLATES['sold'];
export const PriceReducedTemplate = TEMPLATES['price-reduced'];
export const ComingSoonTemplate  = TEMPLATES['coming-soon'];
