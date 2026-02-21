import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Undo2, Redo2, Trash2 } from 'lucide-react';

interface MaskCanvasProps {
  imageSrc: string;
  onMaskChange: (base64: string | null) => void;
  isActive: boolean;
}

const MaskCanvas: React.FC<MaskCanvasProps> = ({ imageSrc, onMaskChange, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const getContext = useCallback(
    () => canvasRef.current?.getContext('2d', { willReadFrequently: true }),
    []
  );

  const pushToHistory = useCallback(
    (imageData: ImageData) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(imageData);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [history, historyIndex]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const setupCanvas = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = getContext();
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
        ctx.lineWidth = brushSize;
        if (history.length === 0) {
          pushToHistory(ctx.getImageData(0, 0, canvas.width, canvas.height));
        }
      }
    };

    if (image.complete) {
      setupCanvas();
    } else {
      image.onload = setupCanvas;
    }
  }, [imageSrc, brushSize, getContext, history.length, pushToHistory]);

  useEffect(() => {
    const ctx = getContext();
    if (ctx) ctx.lineWidth = brushSize;
  }, [brushSize, getContext]);

  const exportMask = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const isCanvasEmpty = !imageData.data.some((channel) => channel !== 0);
    onMaskChange(isCanvasEmpty ? null : canvas.toDataURL('image/png'));
  }, [getContext, onMaskChange]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const ctx = getContext();
    if (ctx) {
      ctx.putImageData(history[newIndex], 0, 0);
      setHistoryIndex(newIndex);
      exportMask();
    }
  }, [history, historyIndex, getContext, exportMask]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const ctx = getContext();
    if (ctx) {
      ctx.putImageData(history[newIndex], 0, 0);
      setHistoryIndex(newIndex);
      exportMask();
    }
  }, [history, historyIndex, getContext, exportMask]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
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
    if (!isActive) return;
    const { x, y } = getCoordinates(e);
    const ctx = getContext();
    if (ctx) {
      setIsDrawing(true);
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isActive) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = getContext();
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    const ctx = getContext();
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.closePath();
      setIsDrawing(false);
      pushToHistory(ctx.getImageData(0, 0, canvas.width, canvas.height));
      exportMask();
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const initialImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistory([initialImageData]);
      setHistoryIndex(0);
      onMaskChange(null);
    }
  };

  return (
    <div className="relative h-full w-full">
      <img
        ref={imageRef}
        src={imageSrc}
        alt="Original for masking"
        className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
      />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full object-contain ${
          isActive ? 'cursor-crosshair' : 'cursor-default opacity-90'
        }`}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />

      {isActive && (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--color-ink)]/84 px-3 py-2 text-white shadow-[0_20px_36px_rgba(15,23,42,0.4)] backdrop-blur-md">
          <div className="rounded-full bg-white/12 px-2 py-1">
            <div className="flex items-center gap-1">
              {[20, 40, 80].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setBrushSize(size)}
                  className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
                    brushSize === size ? 'bg-[var(--color-secondary)] text-[var(--color-ink)]' : 'hover:bg-white/20'
                  }`}
                  aria-label={`Set brush size ${size}`}
                >
                  <span className="rounded-full bg-white" style={{ width: size / 7, height: size / 7 }} />
                </button>
              ))}
            </div>
          </div>
          <div className="h-6 w-px bg-white/25" />
          <button
            type="button"
            onClick={undo}
            disabled={historyIndex <= 0}
            className="rounded-full p-2 transition-all hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Undo mask stroke"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="rounded-full p-2 transition-all hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Redo mask stroke"
          >
            <Redo2 size={16} />
          </button>
          <div className="h-6 w-px bg-white/25" />
          <button
            type="button"
            onClick={clearCanvas}
            className="rounded-full p-2 transition-all hover:bg-rose-400/30"
            aria-label="Clear mask"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default MaskCanvas;
