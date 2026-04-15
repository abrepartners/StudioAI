/**
 * Composite Preserve — keeps original pixels where the AI didn't make changes.
 *
 * Compares the original and AI-generated images pixel by pixel.
 * Areas where the difference is below a threshold keep the original's sharp pixels.
 * Areas where the AI made significant changes use the AI output.
 * A soft blend zone prevents hard edges between preserved and changed areas.
 */

export async function compositePreserve(
  originalBase64: string,
  generatedBase64: string,
  threshold: number = 30, // pixel diff threshold (0-255)
  blendRadius: number = 3 // blur radius for the change mask
): Promise<string> {
  return new Promise((resolve) => {
    const origImg = new Image();
    const genImg = new Image();
    let loaded = 0;

    const onBothLoaded = () => {
      // Use original dimensions
      const w = origImg.naturalWidth;
      const h = origImg.naturalHeight;

      // If dimensions don't match, resize generated to match original
      if (genImg.naturalWidth !== w || genImg.naturalHeight !== h) {
        const resizeCanvas = document.createElement('canvas');
        resizeCanvas.width = w;
        resizeCanvas.height = h;
        const resizeCtx = resizeCanvas.getContext('2d')!;
        resizeCtx.imageSmoothingEnabled = true;
        resizeCtx.imageSmoothingQuality = 'high';
        resizeCtx.drawImage(genImg, 0, 0, w, h);
        resolve(resizeCanvas.toDataURL('image/png'));
        return;
      }

      // Draw both to canvases
      const origCanvas = document.createElement('canvas');
      origCanvas.width = w;
      origCanvas.height = h;
      const origCtx = origCanvas.getContext('2d')!;
      origCtx.drawImage(origImg, 0, 0);
      const origData = origCtx.getImageData(0, 0, w, h);

      const genCanvas = document.createElement('canvas');
      genCanvas.width = w;
      genCanvas.height = h;
      const genCtx = genCanvas.getContext('2d')!;
      genCtx.drawImage(genImg, 0, 0);
      const genData = genCtx.getImageData(0, 0, w, h);

      // Build change mask — 1.0 where AI changed things, 0.0 where unchanged
      const mask = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const idx = i * 4;
        const dr = Math.abs(origData.data[idx] - genData.data[idx]);
        const dg = Math.abs(origData.data[idx + 1] - genData.data[idx + 1]);
        const db = Math.abs(origData.data[idx + 2] - genData.data[idx + 2]);
        const diff = (dr + dg + db) / 3;
        mask[i] = diff > threshold ? 1.0 : diff / threshold;
      }

      // Simple box blur on the mask to create soft transition
      const blurred = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0;
          let count = 0;
          for (let dy = -blendRadius; dy <= blendRadius; dy++) {
            for (let dx = -blendRadius; dx <= blendRadius; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                sum += mask[ny * w + nx];
                count++;
              }
            }
          }
          blurred[y * w + x] = sum / count;
        }
      }

      // Composite: blend original and generated based on mask
      const outData = origCtx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const idx = i * 4;
        const t = blurred[i]; // 0 = use original, 1 = use generated
        outData.data[idx] = Math.round(origData.data[idx] * (1 - t) + genData.data[idx] * t);
        outData.data[idx + 1] = Math.round(origData.data[idx + 1] * (1 - t) + genData.data[idx + 1] * t);
        outData.data[idx + 2] = Math.round(origData.data[idx + 2] * (1 - t) + genData.data[idx + 2] * t);
        outData.data[idx + 3] = 255;
      }

      origCtx.putImageData(outData, 0, 0);
      resolve(origCanvas.toDataURL('image/png'));
    };

    const checkLoaded = () => {
      loaded++;
      if (loaded === 2) onBothLoaded();
    };

    origImg.crossOrigin = 'anonymous';
    origImg.onload = checkLoaded;
    origImg.onerror = () => resolve(generatedBase64);
    origImg.src = originalBase64.startsWith('data:') ? originalBase64 : `data:image/jpeg;base64,${originalBase64}`;

    genImg.crossOrigin = 'anonymous';
    genImg.onload = checkLoaded;
    genImg.onerror = () => resolve(generatedBase64);
    genImg.src = generatedBase64.startsWith('data:') ? generatedBase64 : `data:image/jpeg;base64,${generatedBase64}`;
  });
}
