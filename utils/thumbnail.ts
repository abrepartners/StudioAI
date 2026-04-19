/**
 * thumbnail.ts — D8
 *
 * Generate a 256-wide JPEG 0.85 thumbnail from a base64 / dataURL image. Used
 * by the saved-stage history grid (and batch-result grids) so the UI never
 * paints a 1-2 MB full-res image just to render an 80px tile.
 *
 * Returned value is always a `data:image/jpeg;base64,...` dataURL, which is
 * what `<img src>` and localStorage both want.
 *
 * Backwards-compat: callers should fall back to `generatedImage` when
 * `thumbnail` is missing (older saved stages predate this util).
 */
const THUMB_WIDTH = 256;
const JPEG_QUALITY = 0.85;

export async function generateThumbnail(
  base64OrDataUrl: string,
  width: number = THUMB_WIDTH,
): Promise<string> {
  const dataUrl = base64OrDataUrl.startsWith('data:')
    ? base64OrDataUrl
    : `data:image/jpeg;base64,${base64OrDataUrl}`;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      if (!w || !h) {
        resolve(base64OrDataUrl);
        return;
      }
      // If the source is already smaller than the target, just pass it through —
      // no benefit to upscaling.
      if (w <= width) {
        resolve(base64OrDataUrl);
        return;
      }
      const scale = width / w;
      const targetW = width;
      const targetH = Math.max(1, Math.round(h * scale));
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
      try {
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch {
        resolve(base64OrDataUrl);
      }
    };
    img.onerror = () => resolve(base64OrDataUrl);
    img.src = dataUrl;
  });
}
