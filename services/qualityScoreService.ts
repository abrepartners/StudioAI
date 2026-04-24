/**
 * services/qualityScoreService.ts — D1 Listing Score (Phase 3, Cluster J).
 *
 * User-facing 1-10 quality scorer for staged listing photos. Calls Gemini Flash
 * with a structured-output schema and returns 4 sub-scores + 1 actionable
 * callout per dimension + an overall (avg of 4).
 *
 * Why a separate service file (not extending geminiService.ts):
 *   - geminiService.ts already has a legacy `scoreGeneratedImage` returning
 *     0-100 + free-text summary. D1 changes the shape (1-10 + per-dimension
 *     callouts) and the call signature (single image, no original required).
 *     Keeping them side-by-side keeps the legacy export alive for any old
 *     callers and gives the new badge a clean import path.
 *   - Score uses gemini-3-flash-preview (cheap), never Pro — per spec cost guard.
 */
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { cleanBase64 } from './geminiHelpers';
import { getActiveApiKey } from './geminiService';

const getAI = () => {
  const key = getActiveApiKey();
  if (!key) throw new Error('API_KEY_REQUIRED');
  return new GoogleGenAI({ apiKey: key });
};

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
 * Score a single staged listing image on 4 dimensions, 1-10 each.
 * Returns per-dimension callouts the agent can act on ("weaken watermark
 * contrast", "shadow under sofa is too soft").
 *
 * Cost: one Flash call per image. Deterministic enough for caching by image
 * hash on the caller side (component-level cache lives in QualityScore.tsx).
 */
export async function scoreListingImage(
  generatedBase64: string,
  roomType: string = 'room',
): Promise<ListingScore> {
  const ai = getAI();
  const clean = cleanBase64(generatedBase64);

  const prompt = `You are a professional real estate photo quality auditor. Rate this AI-staged ${roomType} photo on FOUR dimensions, each 1-10 (10 = MLS-publication ready, 1 = unusable):

1. ARCHITECTURAL INTEGRITY — are walls, ceilings, windows, doors, fixtures preserved cleanly with no warping, hallucination, or duplicated edges?
2. LIGHTING REALISM — does the lighting direction, color temperature, and shadow quality look like a real photograph (not CG-flat)?
3. PERSPECTIVE ACCURACY — do furniture and decor follow the room's vanishing points and lens distortion? No floating objects, no skewed legs.
4. STAGING QUALITY — is the room cleanly staged (no clutter), with appropriate furniture scale and arrangement for an MLS listing?

For EACH dimension return:
- "score": integer 1-10
- "callout": ONE short, actionable sentence (max 90 chars). If the dimension is already strong (>=9), the callout should affirm what is working ("crisp window edges, no halos"). If weak (<=7), the callout names the specific fix ("soften the contact shadow under the sofa", "weaken watermark contrast", "rear wall has a faint duplicated baseboard line").

Be honest — do NOT default to 8s. A clutter-heavy or warped image should score low. A clean, realistic image should score 9-10.

Return ONLY a JSON object with the exact shape requested.`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/jpeg', data: clean } },
      ],
    },
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          architecture: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              callout: { type: Type.STRING },
            },
            required: ['score', 'callout'],
          },
          lighting: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              callout: { type: Type.STRING },
            },
            required: ['score', 'callout'],
          },
          perspective: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              callout: { type: Type.STRING },
            },
            required: ['score', 'callout'],
          },
          staging: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              callout: { type: Type.STRING },
            },
            required: ['score', 'callout'],
          },
        },
        required: ['architecture', 'lighting', 'perspective', 'staging'],
      },
    },
  });

  if (!response.text) {
    throw new Error('Quality score: empty response');
  }

  const parsed = JSON.parse(response.text) as Omit<ListingScore, 'overall'>;
  const clampDim = (d: ListingScoreDimension): ListingScoreDimension => ({
    score: Math.max(1, Math.min(10, Math.round(d.score))),
    callout: (d.callout || '').slice(0, 140),
  });

  const architecture = clampDim(parsed.architecture);
  const lighting = clampDim(parsed.lighting);
  const perspective = clampDim(parsed.perspective);
  const staging = clampDim(parsed.staging);
  const avg = (architecture.score + lighting.score + perspective.score + staging.score) / 4;
  const overall = Math.round(avg * 10) / 10;

  return { overall, architecture, lighting, perspective, staging };
}

/**
 * Tiny non-cryptographic hash for caching scores by image data URL.
 * 32-bit FNV-1a is enough — collisions on data URLs in a single user session
 * are negligible, and we never persist this. Faster than crypto.subtle.digest
 * over a 1MB base64 string.
 */
export function hashImageDataUrl(dataUrl: string): string {
  let h = 0x811c9dc5;
  // Sample-hash: stride to keep this O(few thousand chars) instead of O(image).
  // Hashing every char of a 2MB base64 string would block the main thread for
  // 50ms+; striding is collision-safe for our use (cache by current image).
  const stride = Math.max(1, Math.floor(dataUrl.length / 4096));
  for (let i = 0; i < dataUrl.length; i += stride) {
    h ^= dataUrl.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}
