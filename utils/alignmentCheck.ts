/**
 * alignmentCheck.ts — X4 post-generation alignment guard for Cleanup (flash tier).
 *
 * Background:
 * Gemini flash occasionally reframes / zooms cleanup outputs despite the
 * FRAMING LOCK language in the prompt. When that happens, compositeStackedEdit
 * either ships the reframed geometry (if change ratio > 95%) or produces a
 * catastrophic diff (most of the frame flagged as "changed"). Either way, the
 * user gets back an image that no longer matches their original framing.
 *
 * What this does:
 * Downsamples both input + Gemini output to a fixed-size grayscale edge map
 * (Sobel-ish via brightness diff of neighbors), then computes the fraction of
 * edge pixels that overlap (both images have an edge in the same cell).
 *
 * If overlap < threshold (default 0.70 = 70%), the model almost certainly
 * reframed. Caller should bail and return the original input.
 *
 * The implementation is intentionally simple — a 128x128 grayscale compare,
 * no external deps, <5ms per call. This is a safety net, not a QA system.
 */

const ALIGNMENT_GRID = 128;
const EDGE_STRENGTH_THRESHOLD = 24; // out of 255; ignores low-contrast noise

export interface AlignmentResult {
  /** Fraction [0,1] of edge cells that overlap between input and output. */
  overlap: number;
  /** Edge cells in input only (proxy for how much structure was lost). */
  inputEdges: number;
  /** Edge cells in output only (proxy for how much new structure appeared). */
  outputEdges: number;
  /** True if overlap passed the threshold and the output looks safe to ship. */
  aligned: boolean;
}

/**
 * Compare structural alignment between two images. Used as a post-generation
 * safety check for Cleanup on the flash tier.
 *
 * @param inputDataUrl  Original image (data URL or raw base64)
 * @param outputDataUrl Gemini output (data URL or raw base64)
 * @param threshold     Minimum acceptable overlap ratio, default 0.70
 */
export async function checkAlignment(
  inputDataUrl: string,
  outputDataUrl: string,
  threshold = 0.70
): Promise<AlignmentResult> {
  const [inputEdges, outputEdges] = await Promise.all([
    buildEdgeMap(inputDataUrl),
    buildEdgeMap(outputDataUrl),
  ]);

  let inputOnly = 0;
  let outputOnly = 0;
  let both = 0;
  for (let i = 0; i < inputEdges.length; i++) {
    const a = inputEdges[i];
    const b = outputEdges[i];
    if (a && b) both++;
    else if (a) inputOnly++;
    else if (b) outputOnly++;
  }

  const totalEdges = inputOnly + outputOnly + both;
  // If neither image has meaningful structure (blank / all sky), treat as aligned —
  // this is a safety net for Cleanup, not a general-purpose similarity check.
  const overlap = totalEdges === 0 ? 1 : both / (both + inputOnly + outputOnly);

  return {
    overlap,
    inputEdges: inputOnly + both,
    outputEdges: outputOnly + both,
    aligned: overlap >= threshold,
  };
}

/**
 * Downsample to 128x128 grayscale and build a binary edge map via simple
 * neighbor-difference ("is this pixel significantly brighter/darker than the
 * one to its right AND below?"). Fast, deterministic, no dependencies.
 */
async function buildEdgeMap(dataUrl: string): Promise<Uint8Array> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = ALIGNMENT_GRID;
  canvas.height = ALIGNMENT_GRID;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(img, 0, 0, ALIGNMENT_GRID, ALIGNMENT_GRID);
  const { data } = ctx.getImageData(0, 0, ALIGNMENT_GRID, ALIGNMENT_GRID);

  // First pass: luminance buffer
  const lum = new Uint8Array(ALIGNMENT_GRID * ALIGNMENT_GRID);
  for (let p = 0, q = 0; p < data.length; p += 4, q++) {
    // Rec. 601 luma
    lum[q] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
  }

  // Second pass: edge map — 1 if abs(luma diff) to right or below exceeds
  // EDGE_STRENGTH_THRESHOLD. Borders default to 0.
  const edges = new Uint8Array(ALIGNMENT_GRID * ALIGNMENT_GRID);
  for (let y = 0; y < ALIGNMENT_GRID - 1; y++) {
    for (let x = 0; x < ALIGNMENT_GRID - 1; x++) {
      const i = y * ALIGNMENT_GRID + x;
      const right = Math.abs(lum[i] - lum[i + 1]);
      const down = Math.abs(lum[i] - lum[i + ALIGNMENT_GRID]);
      if (right > EDGE_STRENGTH_THRESHOLD || down > EDGE_STRENGTH_THRESHOLD) {
        edges[i] = 1;
      }
    }
  }
  return edges;
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
