/**
 * stackComposite.ts — Non-destructive iterative editing for StudioAI.
 *
 * Gemini's image models (1) re-synthesize the entire output on every pass AND
 * (2) downscale the output (a 5472x3648 input returns as ~1264x843). Both
 * traits destroy textures in unchanged regions if we just take Gemini's
 * output verbatim.
 *
 * The fix: do a pixel-accurate diff at Gemini's native output resolution,
 * produce a smooth feathered mask, upsample that mask to the input's
 * resolution, then blend per-pixel so that unchanged regions come SHARP
 * from the input buffer and only the actual edit region takes from Gemini.
 *
 * Why we don't use canvas `destination-in` composites: upsampling an
 * RGBA mask via bilinear interpolation bleeds the white RGB of "changed"
 * pixels into transparent neighbors, producing a low-alpha haze that
 * effectively makes the entire mask partially opaque. The fix is to upsample
 * a single-channel (grayscale) mask and blend manually in pixel space.
 */

import pixelmatch from 'pixelmatch';

export interface StackCompositeOptions {
  /**
   * pixelmatch threshold (0-1). Lower = more sensitive to change. Default 0.15.
   * With the resolution-aware diff below this works correctly; at input res
   * the same threshold flagged most of the frame due to upsample artifacts.
   */
  threshold?: number;
  /**
   * Feather radius in pixels (after upscaling mask to input dims). Default 24.
   * Wider feather = softer blend boundary in the edit region.
   */
  featherPx?: number;
  /**
   * Mask dilation at Gemini-native resolution, in pixels. Default 3.
   * Pixelmatch catches high-contrast pixel changes but misses soft shadows /
   * anti-aliased edges around the removed object. Dilating the binary mask
   * by a few px at Gemini res (= ~4x that at input res) ensures the mask
   * covers the object + its near-halo, so removed-sign outlines don't
   * leak through from the unchanged-region composite.
   */
  dilatePx?: number;
  /** Output format. PNG for further stacking; JPEG for one-shot exports. */
  format?: 'png' | 'jpeg';
}

export async function compositeStackedEdit(
  priorDataUrl: string,
  newDataUrl: string,
  options: StackCompositeOptions = {}
): Promise<string> {
  const { threshold = 0.15, featherPx = 24, dilatePx = 1, format = 'png' } = options;

  const [priorImg, newImg] = await Promise.all([loadImage(priorDataUrl), loadImage(newDataUrl)]);

  const priorW = priorImg.naturalWidth;
  const priorH = priorImg.naturalHeight;
  const diffW = newImg.naturalWidth;
  const diffH = newImg.naturalHeight;

  // --- 1. Downscale prior to Gemini's dims so we can diff accurately. ---
  const priorAtDiff = document.createElement('canvas');
  priorAtDiff.width = diffW;
  priorAtDiff.height = diffH;
  const padCtx = priorAtDiff.getContext('2d')!;
  padCtx.imageSmoothingEnabled = true;
  padCtx.imageSmoothingQuality = 'high';
  padCtx.drawImage(priorImg, 0, 0, diffW, diffH);
  const priorAtDiffData = padCtx.getImageData(0, 0, diffW, diffH);

  const geminiCanvas = document.createElement('canvas');
  geminiCanvas.width = diffW;
  geminiCanvas.height = diffH;
  const geminiCtx = geminiCanvas.getContext('2d')!;
  geminiCtx.drawImage(newImg, 0, 0);
  const geminiData = geminiCtx.getImageData(0, 0, diffW, diffH);

  // --- 2. Diff at Gemini's native resolution. ---
  const diffOut = padCtx.createImageData(diffW, diffH);
  pixelmatch(priorAtDiffData.data, geminiData.data, diffOut.data, diffW, diffH, {
    threshold,
    includeAA: false,
    diffMask: true,
    diffColor: [255, 255, 255],
    alpha: 0,
  });

  // Convert to single-channel mask (R channel only; alpha=255 everywhere).
  // Using R as the mask keeps upsampling safe: bilinear interp on a
  // full-opaque canvas only smooths RGB, which is exactly what we want
  // for a soft-edged mask.
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = diffW;
  maskCanvas.height = diffH;
  const maskCtx = maskCanvas.getContext('2d')!;
  const maskImage = maskCtx.createImageData(diffW, diffH);
  let changedPixels = 0;
  for (let i = 0; i < diffOut.data.length; i += 4) {
    const isDiff = diffOut.data[i] + diffOut.data[i + 1] + diffOut.data[i + 2] > 0;
    if (isDiff) changedPixels++;
    const v = isDiff ? 255 : 0;
    maskImage.data[i] = v;
    maskImage.data[i + 1] = v;
    maskImage.data[i + 2] = v;
    maskImage.data[i + 3] = 255; // fully opaque — we'll read the R channel as mask value
  }
  maskCtx.putImageData(maskImage, 0, 0);

  const totalPixels = diffW * diffH;
  const changeRatio = changedPixels / totalPixels;
  if (changeRatio < 0.001 || changeRatio > 0.95) {
    console.log(
      `[stackComposite] change ratio ${(changeRatio * 100).toFixed(2)}% at ${diffW}x${diffH} — using raw model output.`
    );
    return upscaleToDataUrl(newImg, priorW, priorH, format);
  }

  // --- 2b. Dilate mask at Gemini res to cover object edges + soft halos. ---
  // Blur then re-binarize at a low threshold: this grows every "changed"
  // region outward by roughly dilatePx pixels, catching edges pixelmatch
  // missed because the contrast was too subtle.
  if (dilatePx > 0) {
    const dilateCanvas = document.createElement('canvas');
    dilateCanvas.width = diffW;
    dilateCanvas.height = diffH;
    const dCtx = dilateCanvas.getContext('2d')!;
    dCtx.filter = `blur(${dilatePx}px)`;
    dCtx.drawImage(maskCanvas, 0, 0);
    dCtx.filter = 'none';
    const dData = dCtx.getImageData(0, 0, diffW, diffH);
    // Binarize at low threshold — anything blurred into the region stays in
    for (let i = 0; i < dData.data.length; i += 4) {
      const on = dData.data[i] > 20;
      const v = on ? 255 : 0;
      dData.data[i] = v;
      dData.data[i + 1] = v;
      dData.data[i + 2] = v;
      dData.data[i + 3] = 255;
    }
    maskCtx.putImageData(dData, 0, 0);
  }

  // --- 3. Upscale mask to prior dims (bilinear — gives us natural feathering). ---
  const upMask = document.createElement('canvas');
  upMask.width = priorW;
  upMask.height = priorH;
  const umCtx = upMask.getContext('2d')!;
  umCtx.imageSmoothingEnabled = true;
  umCtx.imageSmoothingQuality = 'high';
  umCtx.drawImage(maskCanvas, 0, 0, priorW, priorH);

  // Optional extra blur for a wider feather boundary.
  if (featherPx > 0) {
    umCtx.filter = `blur(${featherPx}px)`;
    umCtx.drawImage(upMask, 0, 0);
    umCtx.filter = 'none';
  }
  const upMaskData = umCtx.getImageData(0, 0, priorW, priorH);

  // --- 4. Draw input and upscaled Gemini at prior dims. ---
  const priorCanvas = document.createElement('canvas');
  priorCanvas.width = priorW;
  priorCanvas.height = priorH;
  const priorCtx = priorCanvas.getContext('2d')!;
  priorCtx.drawImage(priorImg, 0, 0, priorW, priorH);
  const priorData = priorCtx.getImageData(0, 0, priorW, priorH);

  const geminiUp = document.createElement('canvas');
  geminiUp.width = priorW;
  geminiUp.height = priorH;
  const guCtx = geminiUp.getContext('2d')!;
  guCtx.imageSmoothingEnabled = true;
  guCtx.imageSmoothingQuality = 'high';
  guCtx.drawImage(newImg, 0, 0, priorW, priorH);
  const geminiUpData = guCtx.getImageData(0, 0, priorW, priorH);

  // --- 5. Manual per-pixel blend. alpha (0-255) from mask R channel. ---
  const outImage = priorCtx.createImageData(priorW, priorH);
  const pD = priorData.data;
  const gD = geminiUpData.data;
  const mD = upMaskData.data;
  const oD = outImage.data;
  for (let i = 0; i < oD.length; i += 4) {
    const a = mD[i] / 255; // mask value normalized
    const inv = 1 - a;
    oD[i] = pD[i] * inv + gD[i] * a;
    oD[i + 1] = pD[i + 1] * inv + gD[i + 1] * a;
    oD[i + 2] = pD[i + 2] * inv + gD[i + 2] * a;
    oD[i + 3] = 255;
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = priorW;
  outCanvas.height = priorH;
  outCanvas.getContext('2d')!.putImageData(outImage, 0, 0);

  console.log(
    `[stackComposite] changed=${(changeRatio * 100).toFixed(2)}% at ${diffW}x${diffH} — ` +
      `composited at ${priorW}x${priorH}.`
  );

  return format === 'png'
    ? outCanvas.toDataURL('image/png')
    : outCanvas.toDataURL('image/jpeg', 0.95);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src.startsWith('data:') ? src : `data:image/png;base64,${src}`;
  });
}

function upscaleToDataUrl(
  img: HTMLImageElement,
  w: number,
  h: number,
  format: 'png' | 'jpeg'
): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return format === 'png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.95);
}
