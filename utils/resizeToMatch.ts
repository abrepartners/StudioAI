/**
 * resizeToMatch.ts
 *
 * Resize a source image to exactly match the pixel dimensions of a
 * reference image. Used after Flux Kontext cleanup to restore the
 * original resolution — stackComposite used to handle this implicitly
 * but we skip composite on the Flux path so we need it explicit.
 *
 * Passes through unchanged if the dimensions already match (avoids a
 * pointless re-encode).
 */
export async function resizeToMatch(
  sourceDataUrl: string,
  referenceDataUrl: string,
): Promise<string> {
  return new Promise((resolve) => {
    const ref = new Image();
    ref.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = ref;
      const src = new Image();
      src.onload = () => {
        if (src.naturalWidth === w && src.naturalHeight === h) {
          resolve(sourceDataUrl);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(sourceDataUrl); return; }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, 0, 0, w, h);
        console.log(`[resizeToMatch] ${src.naturalWidth}x${src.naturalHeight} → ${w}x${h}`);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      src.onerror = () => resolve(sourceDataUrl);
      src.src = sourceDataUrl;
    };
    ref.onerror = () => resolve(sourceDataUrl);
    ref.src = referenceDataUrl.startsWith('data:')
      ? referenceDataUrl
      : `data:image/jpeg;base64,${referenceDataUrl}`;
  });
}
