/**
 * resizeForUpload.ts — D13
 *
 * Shrink an image to a max long-edge before sending to Gemini. Cuts payload
 * 5-8x on large phone photos (12 MP → 3 MB → ~600 KB) without affecting the
 * Phase C composite, which still uses the full-res source in state.
 *
 * Called INSIDE services/geminiService.ts right before `inlineData` construction
 * (not at ingress) so `originalImage` state stays full-res and the composite
 * diff/mask/blend still operate at input resolution.
 */

const DEFAULT_MAX_LONG_EDGE = 2048;
const JPEG_QUALITY = 0.85;

export async function resizeForUpload(
  base64OrDataUrl: string,
  maxLongEdge: number = DEFAULT_MAX_LONG_EDGE,
): Promise<string> {
  // Parse dataURL or raw base64
  const dataUrl = base64OrDataUrl.startsWith('data:')
    ? base64OrDataUrl
    : `data:image/jpeg;base64,${base64OrDataUrl}`;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      const longEdge = Math.max(w, h);
      if (longEdge <= maxLongEdge) {
        // Already small enough — pass through unchanged
        resolve(base64OrDataUrl);
        return;
      }
      const scale = maxLongEdge / longEdge;
      const targetW = Math.round(w * scale);
      const targetH = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64OrDataUrl);
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const out = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      const savingsPct = Math.round(
        (1 - out.length / base64OrDataUrl.length) * 100,
      );
      console.log(
        `[resizeForUpload] ${w}x${h} → ${targetW}x${targetH}, payload -${savingsPct}%`,
      );
      resolve(out);
    };
    img.onerror = () => resolve(base64OrDataUrl);
    img.src = dataUrl;
  });
}
