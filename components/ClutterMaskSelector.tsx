/**
 * ClutterMaskSelector.tsx
 *
 * Shown after SAM 2 detects objects in a room photo but BEFORE Gemini runs
 * cleanup. The user sees each detected object as a colored overlay and taps
 * to deselect the ones that should NOT be removed (e.g. landscape paintings,
 * the couch, built-ins that SAM accidentally segmented). Only the selected
 * masks are combined and sent to Gemini as the precision mask.
 *
 * This exists because SAM 2 runs in auto-detect mode — it can't distinguish
 * "clutter" from "art I want to keep." The user is the judge. Phase 2 of the
 * SAM 2 integration.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface ClutterMaskSelectorProps {
  /** The original room photo. */
  imageBase64: string;
  /** One mask data URL per detected object. White = object pixels. */
  individualMasks: string[];
  /** User confirmed — pass back the indices of selected masks. */
  onConfirm: (selectedIndices: number[]) => void;
  /** User cancelled — skip cleanup entirely. */
  onCancel: () => void;
}

// Distinct, high-contrast overlay colors so adjacent masks are distinguishable.
// Cycles if there are more masks than colors.
const OVERLAY_COLORS = [
  '#FF375F', '#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2',
  '#64D2FF', '#FFD60A', '#FF453A', '#32D74B', '#5E5CE6',
];

const ClutterMaskSelector: React.FC<ClutterMaskSelectorProps> = ({
  imageBase64,
  individualMasks,
  onConfirm,
  onCancel,
}) => {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(individualMasks.map((_, i) => i)),
  );
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const hitCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load the raw image once to get its natural dimensions.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageBase64;
  }, [imageBase64]);

  // Load every mask image once and keep them around for redrawing.
  const [loadedMasks, setLoadedMasks] = useState<HTMLImageElement[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      individualMasks.map(
        (src) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
          }),
      ),
    )
      .then((imgs) => {
        if (!cancelled) setLoadedMasks(imgs);
      })
      .catch(() => { /* swallow — user can still cancel */ });
    return () => {
      cancelled = true;
    };
  }, [individualMasks]);

  // Paint colored overlays for the SELECTED masks. Redraws on selection change.
  useEffect(() => {
    if (!imgDims || loadedMasks.length === 0) return;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    canvas.width = imgDims.w;
    canvas.height = imgDims.h;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, imgDims.w, imgDims.h);
    loadedMasks.forEach((maskImg, i) => {
      if (!selected.has(i)) return;
      const tmp = document.createElement('canvas');
      tmp.width = imgDims.w;
      tmp.height = imgDims.h;
      const tctx = tmp.getContext('2d')!;
      tctx.drawImage(maskImg, 0, 0, imgDims.w, imgDims.h);
      tctx.globalCompositeOperation = 'source-in';
      tctx.fillStyle = OVERLAY_COLORS[i % OVERLAY_COLORS.length];
      tctx.fillRect(0, 0, imgDims.w, imgDims.h);
      // Per-mask alpha is deliberately low (0.22) so overlapping masks don't
      // compound into opaque blobs that hide the photo. With 30+ masks the
      // old 0.45 value painted over everything — user couldn't tell what was
      // what. At 0.22 you can still see the room AND the tint is visible.
      ctx.globalAlpha = 0.22;
      ctx.drawImage(tmp, 0, 0);
      ctx.globalAlpha = 1.0;
    });
    // Draw a crisp 2px colored stroke around each mask so boundaries are
    // legible even where fills compound. Stroke ignores compound alpha.
    loadedMasks.forEach((maskImg, i) => {
      if (!selected.has(i)) return;
      const tmp = document.createElement('canvas');
      tmp.width = imgDims.w;
      tmp.height = imgDims.h;
      const tctx = tmp.getContext('2d')!;
      // Dilate the mask by 1px and subtract the original to get an outline.
      tctx.filter = 'blur(1.5px)';
      tctx.drawImage(maskImg, 0, 0, imgDims.w, imgDims.h);
      tctx.filter = 'none';
      tctx.globalCompositeOperation = 'destination-out';
      tctx.drawImage(maskImg, 0, 0, imgDims.w, imgDims.h);
      tctx.globalCompositeOperation = 'source-in';
      tctx.fillStyle = OVERLAY_COLORS[i % OVERLAY_COLORS.length];
      tctx.fillRect(0, 0, imgDims.w, imgDims.h);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(tmp, 0, 0);
      ctx.globalAlpha = 1.0;
    });
  }, [selected, loadedMasks, imgDims]);

  // Build a hit-test canvas: each pixel stores the index of the TOP-most mask
  // covering it (or -1). Redraws whenever masks load.
  useEffect(() => {
    if (!imgDims || loadedMasks.length === 0) return;
    const hit = hitCanvasRef.current;
    if (!hit) return;
    hit.width = imgDims.w;
    hit.height = imgDims.h;
    const hctx = hit.getContext('2d')!;
    hctx.clearRect(0, 0, imgDims.w, imgDims.h);
    // Fill with a sentinel color (pure black = -1 / no mask).
    hctx.fillStyle = '#000000';
    hctx.fillRect(0, 0, imgDims.w, imgDims.h);
    // For each mask, paint a unique color onto its white pixels. Later masks
    // overwrite earlier ones, so the "top" mask wins on clicks.
    loadedMasks.forEach((maskImg, i) => {
      const tmp = document.createElement('canvas');
      tmp.width = imgDims.w;
      tmp.height = imgDims.h;
      const tctx = tmp.getContext('2d')!;
      tctx.drawImage(maskImg, 0, 0, imgDims.w, imgDims.h);
      tctx.globalCompositeOperation = 'source-in';
      // Encode index+1 into the red channel (0 = no mask, 1..N = mask index+1).
      const code = i + 1;
      tctx.fillStyle = `rgb(${code % 256}, ${Math.floor(code / 256)}, 0)`;
      tctx.fillRect(0, 0, imgDims.w, imgDims.h);
      hctx.drawImage(tmp, 0, 0);
    });
  }, [loadedMasks, imgDims]);

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgDims) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const px = Math.floor(relX * imgDims.w);
    const py = Math.floor(relY * imgDims.h);
    const hit = hitCanvasRef.current;
    if (!hit) return;
    const hctx = hit.getContext('2d')!;
    const p = hctx.getImageData(px, py, 1, 1).data;
    const code = p[0] + p[1] * 256;
    if (code === 0) return;
    const idx = code - 1;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const allOn = selected.size === individualMasks.length;
  const allOff = selected.size === 0;

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Review detected objects before cleanup"
    >
      <div className="w-full max-w-5xl rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <div>
            <h2 className="text-white font-bold text-lg">Review items to remove</h2>
            <p className="text-zinc-400 text-xs">
              {individualMasks.length} detected • tap an object to keep it in the photo
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="text-zinc-400 hover:text-white p-1"
          >
            <X size={20} />
          </button>
        </header>

        <div
          ref={containerRef}
          className="relative cursor-pointer select-none bg-black"
          style={{
            aspectRatio: imgDims ? `${imgDims.w} / ${imgDims.h}` : '16 / 10',
            maxHeight: '65vh',
          }}
          onClick={handleImageClick}
        >
          <img
            src={imageBase64}
            alt="Room to clean"
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />
          {/* Hit-test canvas is invisible — only used for reading pixel codes. */}
          <canvas ref={hitCanvasRef} className="hidden" />
        </div>

        <footer className="flex items-center justify-between gap-3 px-5 py-3 border-t border-zinc-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set(individualMasks.map((_, i) => i)))}
              disabled={allOn}
              className="text-xs text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Select all
            </button>
            <span className="text-zinc-600">·</span>
            <button
              onClick={() => setSelected(new Set())}
              disabled={allOff}
              className="text-xs text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear all
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-white rounded-lg border border-zinc-700 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(Array.from(selected as Set<number>).sort((a: number, b: number) => a - b))}
              disabled={allOff}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0A84FF] text-white hover:bg-[#006ee6] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clean up {selected.size} {selected.size === 1 ? 'item' : 'items'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ClutterMaskSelector;
