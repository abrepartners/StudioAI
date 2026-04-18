import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Trash2, MousePointer2, Undo2, Check, X, Loader2 } from 'lucide-react';
import { useModal } from '../hooks/useModal';
import Tooltip from './Tooltip';

interface FurnitureRemoverProps {
  generatedImage: string;
  originalImage: string;
  selectedRoom: string;
  onRemovalComplete: (newImage: string) => void;
  onClose: () => void;
  isProcessing: boolean;
  onProcess: (maskDataUrl: string, itemDescriptions: string[]) => void;
}

interface MarkedItem {
  id: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  label: string;
}

const FurnitureRemover: React.FC<FurnitureRemoverProps> = ({
  generatedImage,
  originalImage,
  selectedRoom,
  onRemovalComplete,
  onClose,
  isProcessing,
  onProcess,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [descriptions, setDescriptions] = useState<string[]>([]);
  const [currentDesc, setCurrentDesc] = useState('');

  const getContext = useCallback(
    () => canvasRef.current?.getContext('2d', { willReadFrequently: true }),
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const setup = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = getContext();
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255, 55, 95, 0.6)';
        ctx.lineWidth = brushSize;
      }
    };

    if (image.complete) setup();
    else image.onload = setup;
  }, [generatedImage, brushSize, getContext]);

  useEffect(() => {
    const ctx = getContext();
    if (ctx) ctx.lineWidth = brushSize;
  }, [brushSize, getContext]);

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const { x, y } = getCoords(e);
    const ctx = getContext();
    if (ctx) {
      setIsDrawing(true);
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoords(e);
    const ctx = getContext();
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    const ctx = getContext();
    if (ctx) {
      ctx.closePath();
      setIsDrawing(false);
      setHasStrokes(true);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasStrokes(false);
      setDescriptions([]);
      setCurrentDesc('');
    }
  };

  const addDescription = () => {
    const trimmed = currentDesc.trim();
    if (trimmed) {
      setDescriptions(prev => [...prev, trimmed]);
      setCurrentDesc('');
    }
  };

  const removeDescription = (index: number) => {
    setDescriptions(prev => prev.filter((_, i) => i !== index));
  };

  const handleProcess = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maskDataUrl = canvas.toDataURL('image/png');
    onProcess(maskDataUrl, descriptions);
  };

  // F6: accessible modal semantics. Don't lock body scroll — the remover is
  // overlayed on the canvas, not the full viewport, and the surrounding editor
  // still benefits from scrolling.
  const { dialogProps, titleId } = useModal({
    isOpen: true,
    onClose,
    closeOnOverlayClick: false, // destructive flow; require explicit X click
    lockScroll: false,
  });
  // onOverlayClick unused (closeOnOverlayClick false) — discard it.
  const { onOverlayClick: _onOverlayClick, ...panelProps } = dialogProps;
  void _onOverlayClick;

  return (
    <div
      {...panelProps}
      className="absolute inset-0 z-30 flex flex-col bg-black/95 focus:outline-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Trash2 size={16} className="text-[#FF375F]" />
          <h3 id={titleId} className="text-sm font-bold text-white">Remove Furniture</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          aria-label="Close furniture remover"
          className="rounded-lg p-1.5 text-[var(--color-text)] hover:bg-[var(--color-bg)] transition disabled:opacity-50"
        >
          <X size={16} />
        </button>
      </div>

      {/* Instructions */}
      <div className="px-4 py-2 bg-[#FF375F]/10 border-b border-[#FF375F]/20">
        <p className="text-xs text-[#FF375F]/90">
          <MousePointer2 size={12} className="inline mr-1" />
          Paint over the furniture pieces you want removed. Optionally describe what to remove below.
        </p>
      </div>

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden">
        <img
          ref={imageRef}
          src={generatedImage}
          alt="Generated room for furniture selection"
          className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full object-contain cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />

        {/* Brush size controls */}
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-3 py-2 text-white shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-1">
            {[20, 40, 80].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setBrushSize(size)}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
                  brushSize === size ? 'bg-[#FF375F] text-white' : 'hover:bg-white/20'
                }`}
              >
                <span className="rounded-full bg-white" style={{ width: size / 7, height: size / 7 }} />
              </button>
            ))}
          </div>
          <div className="h-6 w-px bg-white/25" />
          <Tooltip label="Clear all marks">
            <button
              type="button"
              onClick={clearCanvas}
              className="rounded-full p-2 transition-all hover:bg-rose-400/30"
              aria-label="Clear all marks"
            >
              <Undo2 size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Description input + action */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 space-y-2">
        {/* Optional item descriptions */}
        {descriptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {descriptions.map((desc, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-[#FF375F]/15 border border-[#FF375F]/30 px-2.5 py-1 text-[10px] font-semibold text-[#FF375F]"
              >
                {desc}
                <button type="button" onClick={() => removeDescription(i)} className="hover:text-white">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={currentDesc}
            onChange={(e) => setCurrentDesc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDescription()}
            placeholder="Optional: describe item to remove (e.g. 'nightstand on the left')"
            className="flex-1 rounded-xl border border-[var(--color-border-strong)] bg-black/60 px-3 py-2 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-text)]/40 focus:border-[#FF375F] focus:ring-1 focus:ring-[#FF375F] transition-all"
          />
          <button
            type="button"
            onClick={addDescription}
            disabled={!currentDesc.trim()}
            className="rounded-xl border border-[var(--color-border-strong)] bg-black/40 px-3 py-2 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)] transition disabled:opacity-30"
          >
            Add
          </button>
        </div>

        <button
          type="button"
          onClick={handleProcess}
          disabled={isProcessing || !hasStrokes}
          className={`w-full rounded-2xl px-4 py-3 text-sm font-black uppercase tracking-widest transition-all ${
            isProcessing || !hasStrokes
              ? 'bg-black/40 text-[var(--color-text)]/30 border border-[var(--color-border-strong)]'
              : 'bg-[#FF375F] text-white border border-[#FF375F] shadow-lg hover:shadow-xl hover:bg-[#FF1744]'
          }`}
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Removing...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Trash2 size={16} /> Remove Selected Pieces
            </span>
          )}
        </button>
      </div>
    </div>
  );
};

export default FurnitureRemover;
