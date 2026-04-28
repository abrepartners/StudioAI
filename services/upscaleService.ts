import { resizeForUpload } from '../utils/resizeForUpload';

const UPLOAD_MAX_EDGE = 1280;

export interface UpscaleResult {
  resultBase64: string;
  latencyMs: number;
}

export async function upscaleImage(
  imageBase64: string,
  isExterior: boolean,
  abortSignal?: AbortSignal,
): Promise<UpscaleResult> {
  const shrunk = await resizeForUpload(imageBase64, UPLOAD_MAX_EDGE);
  const res = await fetch('/api/upscale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: shrunk, isExterior }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`upscale HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'upscale failed');
  return {
    resultBase64: data.resultBase64,
    latencyMs: data.latencyMs,
  };
}
