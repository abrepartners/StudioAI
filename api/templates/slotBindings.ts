/**
 * slotBindings.ts — Template slot resolver
 *
 * Pure, unit-testable layer between a template JSON spec and the Satori
 * renderer. Given a spec + ratio key + merged listing/brand data, returns
 * the set of visible text layers, their resolved text content, and enough
 * metadata for the renderer to compose the final Satori tree.
 *
 * Key responsibilities:
 *  1. Interpolate "{{field}}" tokens using the merged data map.
 *  2. Apply each slot's hideIfMissing rule — all listed fields empty → hide.
 *  3. Drop tokens that resolve to empty, honoring joinNonEmpty separators
 *     so a partial city+state+zip line doesn't render with dangling " · ".
 *  4. Derive a synthetic "issueNumber" when one isn't supplied (hash-based,
 *     mirrors the existing social.tsx behavior for continuity).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type TemplateSpec = {
  id: string;
  label: string;
  style: string;
  requiredFields?: string[];
  optionalFields?: string[];
  ratios: Record<string, RatioSpec>;
  slotBindings: Record<string, SlotBinding>;
  chrome?: ChromeConfig;
};

export type RatioSpec = {
  width: number;
  height: number;
  photoSlot?: PhotoSlot;
  splitPhotoSlot?: {
    axis: 'horizontal' | 'vertical';
    before: PhotoSlot;
    after: PhotoSlot;
  };
  textLayers: TextLayerSpec[];
};

export type PhotoSlot = {
  x: number;
  y: number;
  w: number;
  h: number;
  fit?: 'cover' | 'contain' | 'letterbox';
  gradient?: 'none' | 'bottom-fade' | 'radial-dim' | 'full-darken';
  opacity?: number;
  blur?: number;
  filter?: string;
};

export type TextLayerSpec = {
  slot: string;
  x: number;
  y: number;
  w?: number;
  size: number;
  align?: 'left' | 'center' | 'right';
  variant?: string;
  color?: string;      // literal hex OR semantic: "accent" | "paper" | "mid" | "ink"
  topRule?: boolean;
  maxWidth?: number;
};

export type SlotBinding = {
  value: string;
  hideIfMissing?: string[];
  color?: string;
  label?: string;
  joinNonEmpty?: string;
  iconized?: boolean;
};

export type ChromeConfig = {
  background?: string;
  grid?: { enabled: boolean; color?: string; opacity?: number };
  accentRibbon?: { enabled: boolean; height?: number; position?: 'top' | 'bottom' };
  mastheadRule?: { enabled: boolean; after?: string };
  registrationMarks?: { enabled: boolean; color?: string; size?: number; inset?: number; stroke?: number };
  centerMedallion?: { enabled: boolean; glyph?: string };
};

export type ResolvedLayer = TextLayerSpec & {
  text: string;
  binding: SlotBinding;
};

export type ResolvedSpec = {
  width: number;
  height: number;
  photoSlot?: PhotoSlot;
  splitPhotoSlot?: RatioSpec['splitPhotoSlot'];
  layers: ResolvedLayer[];
  chrome: ChromeConfig;
  data: Record<string, any>;
};

// ─── Data merging + issue number ────────────────────────────────────────────

export function deriveIssueNumber(data: Record<string, any>): string {
  if (data.issueNumber) return String(data.issueNumber);
  const seed = String(data.address || data.headline || data.hero || 'STUDIO');
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  const num = (n % 999) + 1;
  return String(num).padStart(3, '0');
}

/** Build the interpolation table — brandKit + listing, plus synthetic fields. */
export function buildDataTable(
  listingData: Record<string, any> = {},
  brandKit: Record<string, any> = {},
): Record<string, any> {
  const merged: Record<string, any> = { ...brandKit, ...listingData };
  // Normalize numbers that often arrive as strings from forms.
  if (merged.sqft != null && typeof merged.sqft === 'number') {
    merged.sqft = merged.sqft.toLocaleString();
  }
  merged.issueNumber = deriveIssueNumber(merged);
  return merged;
}

// ─── Token interpolation ────────────────────────────────────────────────────

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Interpolate a value string, honoring a joinNonEmpty separator. If the
 * template looks like "{{a}} · {{b}} · {{c}}" and `b` is empty, we drop
 * both `b` and the immediately preceding separator so the line reads
 * "A · C" rather than "A ·  · C".
 */
export function interpolate(
  template: string,
  data: Record<string, any>,
  separator?: string,
): string {
  if (!separator) {
    // Simple global replace.
    return template.replace(TOKEN_RE, (_, key) => {
      const v = data[key];
      return v == null || v === '' ? '' : String(v);
    });
  }

  // Separator-aware: split by the separator literal, drop pieces whose
  // only content is empty-token placeholders, re-join.
  const parts = template.split(separator);
  const resolvedParts = parts
    .map(part => part.replace(TOKEN_RE, (_, key) => {
      const v = data[key];
      return v == null || v === '' ? '' : String(v);
    }).trim())
    .filter(p => p.length > 0);
  return resolvedParts.join(separator);
}

/**
 * Decide whether a slot should render at all.
 * Rule per spec: hide when EVERY field in hideIfMissing is empty.
 * (So "city, state, zip all blank" hides the whole location line, but
 *  having just one of them keeps the line.)
 */
export function shouldHide(binding: SlotBinding, data: Record<string, any>): boolean {
  const fields = binding.hideIfMissing;
  if (!fields || fields.length === 0) return false;
  return fields.every(field => {
    const v = data[field];
    return v == null || v === '';
  });
}

// ─── Main resolver ──────────────────────────────────────────────────────────

export function resolveSpec(
  spec: TemplateSpec,
  ratioKey: string,
  listingData: Record<string, any> = {},
  brandKit: Record<string, any> = {},
): ResolvedSpec {
  const ratio = spec.ratios[ratioKey];
  if (!ratio) {
    throw new Error(`Ratio "${ratioKey}" not defined on template "${spec.id}"`);
  }

  const data = buildDataTable(listingData, brandKit);
  const layers: ResolvedLayer[] = [];

  for (const layer of ratio.textLayers) {
    const binding = spec.slotBindings[layer.slot];
    if (!binding) continue; // spec author forgot to bind this slot — safely skip
    if (shouldHide(binding, data)) continue;

    // Special bindings that can't be rendered from a flat string:
    //   "colophon" — resolved by the renderer using brandKit directly.
    //   "{{date}}|{{time}}" — stacked date card, separator-agnostic.
    const value = binding.value;

    // Colophon is a compound slot: renderer handles layout.
    if (value === 'colophon') {
      layers.push({ ...layer, text: 'colophon', binding });
      continue;
    }

    const text = interpolate(value, data, binding.joinNonEmpty);
    // After interpolation a non-separator value can still be blank
    // (e.g. "{{address}}" with no address), drop it.
    if (!text) continue;

    layers.push({ ...layer, text, binding });
  }

  return {
    width: ratio.width,
    height: ratio.height,
    photoSlot: ratio.photoSlot,
    splitPhotoSlot: ratio.splitPhotoSlot,
    layers,
    chrome: spec.chrome || {},
    data,
  };
}

// ─── Phase-2 override hook ──────────────────────────────────────────────────
// Trivially applies a partial override patch onto a spec before resolution.
// Phase 2 (agent customization) will feed user-saved patches through here.

export function applyOverride(
  spec: TemplateSpec,
  patch: Partial<TemplateSpec> | null | undefined,
): TemplateSpec {
  if (!patch) return spec;
  // Shallow-merge top-level, deep-merge ratios/slotBindings/chrome.
  return {
    ...spec,
    ...patch,
    ratios: { ...spec.ratios, ...(patch.ratios || {}) },
    slotBindings: { ...spec.slotBindings, ...(patch.slotBindings || {}) },
    chrome: { ...(spec.chrome || {}), ...(patch.chrome || {}) },
  };
}
