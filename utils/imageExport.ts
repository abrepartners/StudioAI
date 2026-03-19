/**
 * imageExport.ts — Shared Image Processing Utilities
 * Used by: 1.1 MLS Export, 1.5 Print Collateral, 1.6 Social Media Pack
 *
 * All operations are client-side using Canvas API.
 * Dependencies: jszip, file-saver (add to package.json)
 */

import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WatermarkConfig {
  type: 'logo' | 'text';
  content: string;        // base64 data URL for logo, text string for text
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  opacity?: number;       // 0-1, default 0.7
  scale?: number;         // 0-1, relative to image width. Default 0.15 for logo, auto for text
}

export interface ExportFile {
  name: string;
  blob: Blob;
}

export interface MLSPreset {
  name: string;
  width: number;
  height: number;
  quality: number;
  description: string;
}

// ─── MLS Presets ──────────────────────────────────────────────────────────────

export const MLS_PRESETS: MLSPreset[] = [
  { name: 'Zillow / Realtor.com', width: 2048, height: 1536, quality: 0.92, description: '2048×1536 — Maximum quality for major portals' },
  { name: 'ARMLS Standard', width: 2048, height: 1536, quality: 0.90, description: '2048×1536 — Arizona Regional MLS' },
  { name: 'HD Landscape', width: 1920, height: 1080, quality: 0.90, description: '1920×1080 — 16:9 widescreen' },
  { name: 'Standard MLS', width: 1280, height: 960, quality: 0.85, description: '1280×960 — Universal MLS compatible' },
  { name: 'Social Square', width: 1080, height: 1080, quality: 0.90, description: '1080×1080 — Instagram / Facebook' },
  { name: 'Story / Reel', width: 1080, height: 1920, quality: 0.90, description: '1080×1920 — Vertical 9:16' },
];

// ─── Core Utilities ───────────────────────────────────────────────────────────

/**
 * Load a Blob or data URL into an HTMLImageElement
 */
function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    if (source instanceof Blob) {
      img.src = URL.createObjectURL(source);
    } else {
      img.src = source;
    }
  });
}

/**
 * Convert a data URL string to a Blob
 */
export function dataURLtoBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const byteString = atob(parts[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mime });
}

/**
 * Resize an image to exact dimensions using Canvas API.
 * Uses high-quality bicubic-like downscaling via step-down method for large reductions.
 */
export async function resizeImage(
  source: Blob | string,
  width: number,
  height: number,
  quality: number = 0.92
): Promise<Blob> {
  const img = await loadImage(source);

  // Step-down for quality: halve dimensions until within 2x of target
  let currentWidth = img.naturalWidth;
  let currentHeight = img.naturalHeight;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // If significant downscale needed, use step-down approach
  let currentSource: CanvasImageSource = img;

  while (currentWidth > width * 2 || currentHeight > height * 2) {
    const stepCanvas = document.createElement('canvas');
    const stepCtx = stepCanvas.getContext('2d')!;
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = 'high';

    currentWidth = Math.max(Math.floor(currentWidth / 2), width);
    currentHeight = Math.max(Math.floor(currentHeight / 2), height);

    stepCanvas.width = currentWidth;
    stepCanvas.height = currentHeight;
    stepCtx.drawImage(currentSource, 0, 0, currentWidth, currentHeight);
    currentSource = stepCanvas;
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(currentSource, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Strip EXIF data by re-encoding through Canvas.
 * Canvas API naturally strips EXIF — this is the simplest reliable method.
 */
export async function stripExif(source: Blob | string, quality: number = 0.95): Promise<Blob> {
  const img = await loadImage(source);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('EXIF strip failed')),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Add a watermark (logo or text) to an image.
 */
export async function addWatermark(
  source: Blob | string,
  config: WatermarkConfig
): Promise<Blob> {
  const img = await loadImage(source);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const opacity = config.opacity ?? 0.7;
  ctx.globalAlpha = opacity;

  const padding = Math.floor(canvas.width * 0.02);

  if (config.type === 'logo' && config.content) {
    const logo = await loadImage(config.content);
    const scale = config.scale ?? 0.15;
    const logoWidth = Math.floor(canvas.width * scale);
    const logoHeight = Math.floor(logoWidth * (logo.naturalHeight / logo.naturalWidth));

    let x = padding;
    let y = padding;

    if (config.position.includes('right')) x = canvas.width - logoWidth - padding;
    if (config.position.includes('bottom')) y = canvas.height - logoHeight - padding;

    ctx.drawImage(logo, x, y, logoWidth, logoHeight);
  } else if (config.type === 'text') {
    const fontSize = Math.floor(canvas.width * 0.02);
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;

    const textWidth = ctx.measureText(config.content).width;

    let x = padding;
    let y = canvas.height - padding;

    if (config.position.includes('right')) x = canvas.width - textWidth - padding;
    if (config.position.includes('top')) y = fontSize + padding;

    ctx.strokeText(config.content, x, y);
    ctx.fillText(config.content, x, y);
  }

  ctx.globalAlpha = 1;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Watermark failed')),
      'image/jpeg',
      0.95
    );
  });
}

/**
 * Crop an image to a specific aspect ratio (center crop).
 */
export async function cropToAspect(
  source: Blob | string,
  aspectWidth: number,
  aspectHeight: number
): Promise<Blob> {
  const img = await loadImage(source);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const imgAspect = img.naturalWidth / img.naturalHeight;
  const targetAspect = aspectWidth / aspectHeight;

  let sx = 0, sy = 0, sWidth = img.naturalWidth, sHeight = img.naturalHeight;

  if (imgAspect > targetAspect) {
    // Image is wider — crop sides
    sWidth = Math.floor(img.naturalHeight * targetAspect);
    sx = Math.floor((img.naturalWidth - sWidth) / 2);
  } else {
    // Image is taller — crop top/bottom
    sHeight = Math.floor(img.naturalWidth / targetAspect);
    sy = Math.floor((img.naturalHeight - sHeight) / 2);
  }

  canvas.width = sWidth;
  canvas.height = sHeight;
  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Crop failed')),
      'image/jpeg',
      0.95
    );
  });
}

/**
 * Bundle multiple files into a zip and return the zip Blob.
 */
export async function exportAsZip(files: ExportFile[]): Promise<Blob> {
  const zip = new JSZip();
  files.forEach((file) => {
    zip.file(file.name, file.blob);
  });
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

/**
 * Trigger a browser download for a Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}

// ─── High-Level Export Functions ──────────────────────────────────────────────

/**
 * Process a single image for MLS export: resize, strip EXIF, optional watermark.
 */
export async function processForMLS(
  source: Blob | string,
  preset: MLSPreset,
  watermark?: WatermarkConfig
): Promise<Blob> {
  // 1. Strip EXIF
  let processed = await stripExif(source);

  // 2. Resize to preset
  processed = await resizeImage(processed, preset.width, preset.height, preset.quality);

  // 3. Apply watermark if configured
  if (watermark) {
    processed = await addWatermark(processed, watermark);
  }

  return processed;
}

/**
 * Batch process multiple images for MLS export and download as zip.
 */
export async function batchExportMLS(
  images: { source: Blob | string; label: string }[],
  preset: MLSPreset,
  watermark?: WatermarkConfig,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const files: ExportFile[] = [];

  for (let i = 0; i < images.length; i++) {
    const { source, label } = images[i];
    onProgress?.(i + 1, images.length);

    const processed = await processForMLS(source, preset, watermark);
    const paddedIndex = String(i + 1).padStart(3, '0');
    const safeName = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    files.push({ name: `${paddedIndex}_${safeName}_staged.jpg`, blob: processed });
  }

  const zipBlob = await exportAsZip(files);
  const presetSlug = preset.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  downloadBlob(zipBlob, `studioai_mls_export_${presetSlug}.zip`);
}
