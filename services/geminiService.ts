/**
 * services/geminiService.ts — NEUTRALIZED.
 *
 * Browser-side Gemini is PURGED. This file used to instantiate a GoogleGenAI
 * client from a key read out of localStorage / import.meta.env.VITE_GEMINI_API_KEY
 * and call it directly from the browser. That shipped a Gemini key in the
 * client bundle and charged the owner on every silent call.
 *
 * What changed:
 *   - No '@google/genai' import. No VITE_GEMINI_API_KEY read. No client.
 *   - Every previously-exported function keeps its NAME and SIGNATURE so the
 *     dead /legacy App.tsx and other importers still compile, but the body is
 *     now a safe stub: it either throws a clear "Gemini disabled" error or
 *     returns an empty/neutral result WITHOUT any network call or key access.
 *   - Real "Gemini-class" capability runs server-side through Replicate
 *     (/api/* functions using REPLICATE_API_TOKEN). The live Vellum editor's
 *     refine buttons dispatch to those endpoints — NOT to this file.
 *
 * Anything here is legacy glue kept alive only for type/compile compatibility.
 */

import {
  ColorData,
  StagedFurniture,
  FurnitureRoomType,
  PropertyDetails,
  ListingDescriptions,
} from "../types";

const DISABLED_MESSAGE =
  "Browser-side Gemini is disabled. This capability now runs server-side via Replicate (/api/*).";

/** Thrown by every stubbed Gemini entry point so callers fail loudly, never silently charge. */
const geminiDisabled = (): never => {
  throw new Error(DISABLED_MESSAGE);
};

// ─── Key management stubs ────────────────────────────────────────────────────
// The app no longer holds or reads a Gemini key anywhere. These remain only so
// legacy callers (and the old API-key settings UI in the dead App.tsx) compile.
// They never touch a real key and always report "no key".

const API_KEY_STORAGE = "studioai_gemini_key";

/**
 * Always returns '' — browser Gemini is purged, there is no active key. We do
 * NOT read import.meta.env.VITE_GEMINI_API_KEY or process.env here; that read
 * is exactly what leaked the key into the bundle.
 */
export const getActiveApiKey = (): string => "";

/** No-op. We intentionally do not persist a Gemini key in the browser anymore. */
export const saveApiKey = (_key: string): void => {
  // Defensively clear any stale key a previous build may have stored.
  try {
    localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    /* ignore */
  }
};

/** Clears any legacy key a prior build may have left in localStorage. */
export const clearApiKey = (): void => {
  try {
    localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    /* ignore */
  }
};

/** Always false — there is no browser Gemini key by design. */
export const hasApiKey = (): boolean => false;

// ─── Temperature presets (kept as an exported-shape-neutral constant) ─────────
const TEMPERATURE = {
  CLASSIFICATION: 0.1,
  SCORING: 0.2,
  ANALYSIS: 0.4,
  CREATIVE_TEXT: 0.8,
} as const;
void TEMPERATURE; // referenced only to avoid an unused warning; no runtime effect

// ─── Room detection (was a per-image browser Gemini call) ─────────────────────
/**
 * Room type now comes from the manual "Tag room types" modal in the Vellum
 * editor (defaults to "Living Room"). This stub never calls Gemini — it just
 * returns the safe default so any legacy caller keeps working.
 */
export const detectRoomType = async (
  _imageBase64: string,
): Promise<FurnitureRoomType> => {
  return "Living Room";
};

// ─── Image generation (moved to Replicate /api/* per tool) ────────────────────
/**
 * Legacy browser image-gen entry point. The live Vellum refine buttons route to
 * Replicate endpoints (flux-staging / reve-edit / flux-cleanup / flux-renovation
 * / flux-twilight / sky-replace) instead. This stub throws so nothing silently
 * falls back to a Gemini call.
 */
export const generateRoomDesign = async (
  _imageBase64: string,
  _prompt: string,
  _maskImageBase64?: string | null,
  _isHighRes: boolean = false,
  _count = 1,
  _isPro: boolean = false,
  _anchorImageBase64?: string | null,
  _abortSignal?: AbortSignal,
  _structuralLock: boolean = true,
  _referenceImageBase64?: string | null,
): Promise<string[]> => geminiDisabled();

export const autoArrangeLayout = async (
  _imageBase64: string,
  _roomType: FurnitureRoomType,
  _items: StagedFurniture[],
): Promise<Record<string, StagedFurniture["orientation"]>> => {
  // Non-fatal feature — return an empty arrangement instead of throwing.
  return {};
};

/**
 * Color analysis. The Gemini path is removed; we keep the local Canvas-based
 * palette extractor (no key, no network) so the feature degrades gracefully.
 */
export const analyzeRoomColors = async (
  imageBase64: string,
): Promise<ColorData[]> => {
  return getLocalColorPalette(imageBase64);
};

/**
 * Local Fallback: Extracts dominant colors using HTML5 Canvas. No API key,
 * no network. This is now the ONLY color path.
 */
const getLocalColorPalette = (imageBase64: string): Promise<ColorData[]> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve([]);

      canvas.width = 100; // Resize for speed
      canvas.height = 100;
      ctx.drawImage(img, 0, 0, 100, 100);

      const data = ctx.getImageData(0, 0, 100, 100).data;
      const colors: Record<string, number> = {};

      for (let i = 0; i < data.length; i += 40) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        colors[hex] = (colors[hex] || 0) + 1;
      }

      const sorted = Object.entries(colors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const total = sorted.reduce((acc, curr) => acc + curr[1], 0);

      const results: ColorData[] = sorted.map(([hex, count], idx) => ({
        name: idx === 0 ? "Primary" : idx === 1 ? "Secondary" : `Accent ${idx}`,
        value: Math.round((count / total) * 100),
        fill: hex,
      }));

      resolve(results);
    };
    img.onerror = () => resolve([]);
    img.src = imageBase64;
  });
};

// ─── Design chat (was a Gemini Chat session) ──────────────────────────────────
/**
 * Legacy chat surface. We no longer return a live Gemini Chat. To keep the
 * exported NAMES alive for the dead App.tsx without importing the SDK's Chat
 * type, the session is a minimal opaque object and sending a message throws.
 */
export type GeminiChatSession = { readonly disabled: true };

export const createChatSession = (): GeminiChatSession => ({ disabled: true });

export const sendMessageToChat = async (
  _chat: GeminiChatSession,
  _message: string,
  _currentImageBase64: string | null,
): Promise<string> => geminiDisabled();

// ─── Sky replacement ──────────────────────────────────────────────────────────
/**
 * Live sky replacement runs server-side via /api/sky-replace (google/nano-banana
 * on Replicate). This browser-Gemini version is stubbed out.
 */
export const replaceSky = async (
  _imageBase64: string,
  _skyStyle: "blue" | "dramatic" | "golden" | "stormy" = "blue",
  _isPro: boolean = false,
  _abortSignal?: AbortSignal,
): Promise<string> => geminiDisabled();

// ─── Instant declutter ────────────────────────────────────────────────────────
/**
 * Live object removal runs server-side: SAM masking → /api/flux-cleanup. This
 * browser-Gemini declutter is stubbed out.
 */
export const instantDeclutter = async (
  _imageBase64: string,
  _selectedRoom: string,
  _isPro: boolean = false,
  _abortSignal?: AbortSignal,
  _clutterMaskBase64?: string | null,
): Promise<string> => geminiDisabled();

// ─── Virtual renovation ───────────────────────────────────────────────────────
export interface VirtualRenovationChanges {
  cabinets?: string;
  countertops?: string;
  flooring?: string;
  walls?: string;
  fixtures?: string;
  backsplash?: string;
  lightFixtures?: string;
}

/**
 * Live renovation runs server-side via /api/flux-renovation (reve/edit). This
 * browser-Gemini version is stubbed out.
 */
export const virtualRenovation = async (
  _imageBase64: string,
  _changes: VirtualRenovationChanges,
  _abortSignal?: AbortSignal,
): Promise<string> => geminiDisabled();

// ─── Listing copy (text) ──────────────────────────────────────────────────────
export interface ListingCopyPropertyDetails {
  address?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  price?: number;
}

export type ListingCopyTone = "luxury" | "casual" | "investment";

/**
 * Listing copy generation used browser Gemini. Until a server /api text endpoint
 * exists, this is disabled. Callers (ListingKitPipeline, SpecialModesPanel) treat
 * a thrown error as a best-effort copy-step failure and continue.
 * TODO: route to a server /api/listing-copy endpoint (Replicate/Claude) so the
 * copy step comes back online without a browser key.
 */
export const generateListingCopy = async (
  _imageBase64: string,
  _selectedRoom: string,
  _options?: {
    styleNotes?: string;
    propertyDetails?: ListingCopyPropertyDetails;
    tone?: ListingCopyTone;
    abortSignal?: AbortSignal;
  },
): Promise<{
  headline: string;
  description: string;
  socialCaption: string;
  hashtags: string[];
}> => geminiDisabled();

// ─── Style Advisor ────────────────────────────────────────────────────────────
export interface StyleRecommendation {
  style: string;
  confidence: number;
  reasoning: string;
  promptSuggestion: string;
}

/**
 * Style recommendations used browser Gemini. Disabled — the StyleAdvisor
 * component now renders a "coming soon" state and never calls this. Returns an
 * empty list so any legacy caller degrades gracefully instead of crashing.
 */
export const analyzeAndRecommendStyles = async (
  _imageBase64: string,
  _roomType: string,
): Promise<StyleRecommendation[]> => {
  return [];
};

// ─── Quality score (legacy 0-100 shape) ──────────────────────────────────────
export interface QualityScoreResult {
  overall: number;
  architecture: number;
  lighting: number;
  realism: number;
  perspective: number;
  summary: string;
}

/**
 * Legacy 0-100 quality scorer (browser Gemini). Disabled — returns a neutral
 * "unavailable" result so the dead App.tsx callers don't crash. The live 1-10
 * scorer lives in qualityScoreService.ts and is likewise disabled there.
 */
export const scoreGeneratedImage = async (
  _originalBase64: string,
  _generatedBase64: string,
  _roomType: string,
): Promise<QualityScoreResult> => {
  return {
    overall: 0,
    architecture: 0,
    lighting: 0,
    realism: 0,
    perspective: 0,
    summary: "Score unavailable — Gemini disabled",
  };
};

// ─── Multi-tone listing descriptions (text) ──────────────────────────────────
/**
 * Multi-tone descriptions used browser Gemini. Disabled until a server /api
 * text endpoint exists. Throws so callers surface a clear failure rather than
 * silently charging a Gemini key.
 */
export const generateListingDescriptions = async (
  _imageBase64: string,
  _roomType: string,
  _propertyDetails: PropertyDetails,
  _agentNotes?: string,
): Promise<ListingDescriptions> => geminiDisabled();
