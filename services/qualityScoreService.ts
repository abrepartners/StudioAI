/**
 * services/qualityScoreService.ts — NEUTRALIZED (D1 Listing Score).
 *
 * The 1-10 quality scorer used a browser Gemini Flash call. Browser-side Gemini
 * is purged, so the scoring call is removed: no '@google/genai' import, no key
 * read, no network. The exported NAMES (scoreListingImage, hashImageDataUrl) and
 * the result types are kept so importers (the dead App.tsx + QualityScore.tsx,
 * which already handles errors) keep compiling.
 *
 * If a listing-quality score is wanted again, route it through a server /api
 * endpoint (Replicate/Claude) — never a browser key.
 */

export interface ListingScoreDimension {
  /** 1-10 score for this dimension. */
  score: number;
  /** One short, actionable sentence — what to fix to raise this score. */
  callout: string;
}

export interface ListingScore {
  /** Average of the 4 dimension scores, rounded to 1 decimal. 1-10. */
  overall: number;
  architecture: ListingScoreDimension;
  lighting: ListingScoreDimension;
  perspective: ListingScoreDimension;
  staging: ListingScoreDimension;
}

/**
 * Score a single staged listing image — DISABLED.
 *
 * Throws a clear "Gemini disabled" error instead of making a browser Gemini
 * call. QualityScore.tsx catches this and shows its error state. Nothing here
 * reads a key or hits the network.
 */
export async function scoreListingImage(
  _generatedBase64: string,
  _roomType: string = "room",
): Promise<ListingScore> {
  throw new Error(
    "Listing quality scoring is disabled — browser-side Gemini is purged. Re-enable via a server /api endpoint (Replicate/Claude).",
  );
}

/**
 * Tiny non-cryptographic hash for caching scores by image data URL.
 * Pure function — no Gemini, no key, no network. Kept intact because callers
 * (QualityScore.tsx) still use it for cache keys.
 */
export function hashImageDataUrl(dataUrl: string): string {
  let h = 0x811c9dc5;
  const stride = Math.max(1, Math.floor(dataUrl.length / 4096));
  for (let i = 0; i < dataUrl.length; i += stride) {
    h ^= dataUrl.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}
