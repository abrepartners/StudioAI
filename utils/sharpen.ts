/**
 * sharpen.ts — Post-processing sharpening for AI-generated images
 *
 * Gemini's image generation diffusion process inherently softens output.
 * This applies an unsharp mask to restore crispness without introducing artifacts.
 */

/**
 * Apply unsharp mask sharpening to a base64 image.
 * Works by: blur the image, subtract blur from original, add difference back.
 *
 * @param imageBase64 - The image to sharpen (data URL or raw base64)
 * @param amount - Sharpening strength (0-1). Default 0.4 for subtle. 0.6+ for aggressive.
 * @param radius - Blur radius for the unsharp mask. Default 1 (fine detail). 2 = broader.
 */
export async function sharpenImage(
  imageBase64: string,
  amount: number = 0.4,
  radius: number = 1
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;

      // Original canvas
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const original = ctx.getImageData(0, 0, w, h);

      // Create blurred version for unsharp mask
      const blurCanvas = document.createElement('canvas');
      blurCanvas.width = w;
      blurCanvas.height = h;
      const blurCtx = blurCanvas.getContext('2d')!;
      blurCtx.filter = `blur(${radius}px)`;
      blurCtx.drawImage(img, 0, 0);
      const blurred = blurCtx.getImageData(0, 0, w, h);

      // Unsharp mask: output = original + amount * (original - blurred)
      const output = ctx.createImageData(w, h);
      const d = original.data;
      const b = blurred.data;
      const o = output.data;

      for (let i = 0; i < d.length; i += 4) {
        o[i] = clamp(d[i] + amount * (d[i] - b[i]));         // R
        o[i + 1] = clamp(d[i + 1] + amount * (d[i + 1] - b[i + 1])); // G
        o[i + 2] = clamp(d[i + 2] + amount * (d[i + 2] - b[i + 2])); // B
        o[i + 3] = 255; // A
      }

      ctx.putImageData(output, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(imageBase64);
    img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
  });
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
