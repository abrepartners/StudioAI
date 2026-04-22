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
 * The returned mask is DILATED by ~40px so it covers each object PLUS a
 * margin for cast shadows and reflections. Gemini's erasure then includes
 * those shadow halos instead of leaving the "after-shadow" residue pattern.
 *
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
    // Dilate the mask to include shadows + reflections around each object.
    // Raw SAM masks cover the object pixels exactly; shadows extend beyond.
    // Without dilation Gemini erases the object but leaves the shadow halo.
    const dilated = await dilateMask(data.combinedMaskBase64, 40);
    console.log(
      `[samService] SAM found ${data.maskCount} objects in ${data.latencyMs}ms, dilated +40px for shadow halos`,
    );
    return {
      combinedMaskBase64: dilated,
      maskCount: data.maskCount,
      latencyMs: data.latencyMs,
    };
  } catch (err) {
    console.warn('[samService] request failed:', err);
    return null;
  }
}

/**
 * Grow a binary mask outward by ~`pxRadius` pixels. Blur the mask then
 * re-binarize at a low threshold — anything the blur spreads into is newly
 * "on," which is equivalent to a dilation by the blur radius.
 */
async function dilateMask(maskDataUrl: string, pxRadius: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(maskDataUrl);
      ctx.filter = `blur(${pxRadius}px)`;
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';
      const data = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < data.data.length; i += 4) {
        // Any pixel the blur pushed above ~20/255 becomes fully on.
        const on = data.data[i] > 20 ? 255 : 0;
        data.data[i] = on;
        data.data[i + 1] = on;
        data.data[i + 2] = on;
        data.data[i + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(maskDataUrl);
    img.src = maskDataUrl;
  });
}
