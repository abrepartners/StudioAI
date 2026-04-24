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
  /** data URLs — one per detected object, aligned to input resolution. */
  individualMasksBase64: string[];
  /** Number of individual object instances SAM detected. */
  maskCount: number;
  /** End-to-end latency including the Replicate call. */
  latencyMs: number;
}

/**
 * Run SAM 2 on the given image and return a combined object mask.
 * The returned mask is DILATED by ~24px so it covers each object PLUS a
 * margin for cast shadows and reflections. Gemini's erasure then includes
 * those shadow halos instead of leaving the "after-shadow" residue pattern.
 *
 * Returns null on any failure — caller handles the fallback.
 */
export async function detectClutterMasks(
  imageBase64: string,
): Promise<SamDetectResult | null> {
  try {
    // SAM 2 does its own downscaling internally — running on a 2K+ image just
    // means we're uploading a massive JSON body for no better result. Vercel's
    // serverless body limit is ~4.5MB; a 2048×1366 base64 JPEG typically lands
    // around 5-8MB and 413s the call. Resize to 1280px longest side for the
    // SAM request only (mask comes back at that resolution — Gemini handles
    // mask-vs-image size mismatch fine via its own rescaling).
    const shrunk = await resizeForSam(imageBase64, 1280);
    const res = await fetch('/api/sam-detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: shrunk }),
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
    const dilated = await dilateMask(data.combinedMaskBase64, 24);
    const individualMasksBase64: string[] = Array.isArray(data.individualMasksBase64)
      ? data.individualMasksBase64
      : [];
    console.log(
      `[samService] SAM found ${data.maskCount} objects (${individualMasksBase64.length} individual masks) in ${data.latencyMs}ms, dilated +24px for shadow halos`,
    );
    return {
      combinedMaskBase64: dilated,
      individualMasksBase64,
      maskCount: data.maskCount,
      latencyMs: data.latencyMs,
    };
  } catch (err) {
    console.warn('[samService] request failed:', err);
    return null;
  }
}

/**
 * Downscale an image (data URL or raw base64 JPEG) so its longest side is
 * `maxEdge` px, then re-encode as JPEG @ 0.8 quality. Used to keep the
 * /api/sam-detect payload under Vercel's body limit without hurting mask
 * quality (SAM downsamples to ~1024 internally anyway).
 */
async function resizeForSam(imageBase64: string, maxEdge: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;
      const longest = Math.max(srcW, srcH);
      if (longest <= maxEdge) return resolve(imageBase64);
      const scale = maxEdge / longest;
      const w = Math.round(srcW * scale);
      const h = Math.round(srcH * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(imageBase64);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(imageBase64);
    img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  });
}

/**
 * Combine a set of individual SAM masks into one white-on-black mask,
 * then dilate for shadow coverage. Used by ClutterMaskSelector after the
 * user has deselected the masks they DON'T want erased.
 *
 * Returns a data URL. Throws on empty input (caller should skip cleanup).
 */
export async function combineSelectedMasks(
  maskDataUrls: string[],
  dilatePx: number = 24,
): Promise<string> {
  if (maskDataUrls.length === 0) {
    throw new Error('combineSelectedMasks: no masks to combine');
  }
  const imgs = await Promise.all(
    maskDataUrls.map(
      (url) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        }),
    ),
  );
  const w = imgs[0].naturalWidth;
  const h = imgs[0].naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  // Fill black, then draw each mask with 'lighter' blend — white pixels accumulate.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  for (const img of imgs) {
    ctx.drawImage(img, 0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
  const combined = canvas.toDataURL('image/png');
  return dilateMask(combined, dilatePx);
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
