/**
 * services/samService.ts
 *
 * Client-side wrapper for the /api/sam-detect serverless proxy that calls
 * Meta's SAM 2 on Replicate. Returns a combined binary mask of every
 * detected object in the image, aligned to the input resolution.
 *
 * The consumer (SpecialModesPanel.tsx Smart Cleanup flow) can feed this
 * mask to `instantDeclutter` so Gemini knows EXACTLY what to remove
 * instead of hedging on "what is clutter?"
 *
 * Gracefully degrades: on failure returns null, caller falls back to
 * the prompt-only cleanup path. Never throws.
 */

export interface SamDetectResult {
  /** data URL of the combined mask (white = objects, black = background). */
  combinedMaskBase64: string;
  /** Number of individual object instances SAM detected. */
  maskCount: number;
  /** End-to-end latency including the Replicate call. */
  latencyMs: number;
}

/**
 * Run SAM 2 on the given image and return a combined object mask.
 * Returns null on any failure — caller handles the fallback.
 */
export async function detectClutterMasks(
  imageBase64: string,
): Promise<SamDetectResult | null> {
  try {
    const res = await fetch('/api/sam-detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 }),
    });
    if (!res.ok) {
      console.warn(`[samService] /api/sam-detect returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data.ok) {
      console.warn(`[samService] SAM failed: ${data.error} — falling back to prompt-only cleanup`);
      return null;
    }
    console.log(
      `[samService] SAM found ${data.maskCount} objects in ${data.latencyMs}ms`,
    );
    return {
      combinedMaskBase64: data.combinedMaskBase64,
      maskCount: data.maskCount,
      latencyMs: data.latencyMs,
    };
  } catch (err) {
    console.warn('[samService] request failed:', err);
    return null;
  }
}
