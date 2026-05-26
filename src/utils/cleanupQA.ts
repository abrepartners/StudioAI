import type { CleanupRiskLevel } from "../types/cleanupQuality.ts";

const CHANNEL_TOLERANCE = 30;

interface DriftResult {
  risk: CleanupRiskLevel;
  diffPercent: number;
}

function loadImageToCanvas(
  base64: string,
): Promise<{ canvas: OffscreenCanvas; data: ImageData }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas 2d context unavailable"));
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height);
      resolve({ canvas, data });
    };
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = base64.startsWith("data:")
      ? base64
      : `data:image/png;base64,${base64}`;
  });
}

function riskFromPercent(pct: number): CleanupRiskLevel {
  if (pct < 5) return "safe";
  if (pct <= 15) return "review";
  return "high";
}

export async function checkCleanupDrift(
  originalBase64: string,
  resultBase64: string,
  maskBase64?: string,
): Promise<DriftResult> {
  const [original, result] = await Promise.all([
    loadImageToCanvas(originalBase64),
    loadImageToCanvas(resultBase64),
  ]);

  const w = original.data.width;
  const h = original.data.height;
  const origPx = original.data.data;
  const resPx = result.data.data;

  let maskPx: Uint8ClampedArray | null = null;
  if (maskBase64) {
    const mask = await loadImageToCanvas(maskBase64);
    maskPx = mask.data.data;
  }

  const totalPixels = w * h;
  let comparedPixels = 0;
  let changedPixels = 0;

  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;

    if (maskPx) {
      const maskR = maskPx[off];
      const maskG = maskPx[off + 1];
      const maskB = maskPx[off + 2];
      const maskA = maskPx[off + 3];
      const isMasked =
        maskA > 128 && (maskR > 128 || maskG > 128 || maskB > 128);
      if (isMasked) continue;
    }

    comparedPixels++;

    const dr = Math.abs(origPx[off] - resPx[off]);
    const dg = Math.abs(origPx[off + 1] - resPx[off + 1]);
    const db = Math.abs(origPx[off + 2] - resPx[off + 2]);

    if (
      dr > CHANNEL_TOLERANCE ||
      dg > CHANNEL_TOLERANCE ||
      db > CHANNEL_TOLERANCE
    ) {
      changedPixels++;
    }
  }

  if (comparedPixels === 0) {
    return { risk: "safe", diffPercent: 0 };
  }

  const diffPercent = (changedPixels / comparedPixels) * 100;
  return { risk: riskFromPercent(diffPercent), diffPercent };
}
