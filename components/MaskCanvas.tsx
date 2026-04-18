import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Undo2, Redo2, Trash2 } from 'lucide-react';

interface MaskCanvasProps {
  imageSrc: string;
  onMaskChange: (base64: string | null) => void;
  isActive: boolean;
}

const MASK_COLOR = 'rgba(0, 200, 255, 0.55)';
const CLOSE_THRESHOLD = 50; // pixels — if stroke end is within this distance of start, auto-fill

const MaskCanvas: React.FC<MaskCanvasProps> = ({ imageSrc, onMaskChange, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const [brushSize, setBrushSize] = useState(isMobile ? 80 : 40);
  // R31: track mouse position inside the canvas (in client coords) so we can
  // render a DOM circle that previews the current brush size.  Only shown on
  // non-touch mouseover.
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef(-1);
  const [, forceUpdate] = useState(0); // trigger re-render for undo/redo button states
  const canvasInitializedRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const currentPathRef = useRef<{ x: number; y: number }[]>([]);

  const getContext = useCallback(
    () => canvasRef.current?.getContext('2d', { willReadFrequently: true }),
    []
  );

  const pushToHistory = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Trim future history if we're not at the end
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(imageData);
    historyIndexRef.current = historyRef.current.length - 1;
    forceUpdate(n => n + 1);
  }, [getContext]);

  // Initialize canvas ONCE when image loads — never re-run on brush/history changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const setupCanvas = () => {
      // Only set dimensions on first load or image change — setting width/height clears the canvas
      if (!canvasInitializedRef.current || canvas.width !== image.naturalWidth) {
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvasInitializedRef.current = true;
        historyRef.current = [];
        historyIndexRef.current = -1;

        const ctx = getContext();
        if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = MASK_COLOR;
          ctx.fillStyle = MASK_COLOR;
          ctx.lineWidth = brushSize;
          // Save initial blank state
          pushToHistory();
        }
      }
    };

    if (image.complete) {
      setupCanvas();
    } else {
      image.onload = setupCanvas;
    }
  }, [imageSrc, getContext]); // Only re-init on image change — NOT on brushSize/history

  // Update brush size without clearing canvas
  useEffect(() => {
    const ctx = getContext();
    if (ctx) {
      ctx.lineWidth = brushSize;
      ctx.strokeStyle = MASK_COLOR;
      ctx.fillStyle = MASK_COLOR;
    }
  }, [brushSize, getContext]);

  // Reset when image source changes
  useEffect(() => {
    canvasInitializedRef.current = false;
  }, [imageSrc]);

  const exportMask = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const isCanvasEmpty = !imageData.data.some((channel) => channel !== 0);
    onMaskChange(isCanvasEmpty ? null : canvas.toDataURL('image/png'));
  }, [getContext, onMaskChange]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const ctx = getContext();
    if (ctx) {
      ctx.putImageData(historyRef.current[historyIndexRef.current], 0, 0);
      forceUpdate(n => n + 1);
      exportMask();
    }
  }, [getContext, exportMask]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const ctx = getContext();
    if (ctx) {
      ctx.putImageData(historyRef.current[historyIndexRef.current], 0, 0);
      forceUpdate(n => n + 1);
      exportMask();
    }
  }, [getContext, exportMask]);

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
      startPointRef.current = { x, y };
      currentPathRef.current = [{ x, y }];
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    // R31: update DOM-circle cursor position on every mouse move, not just
    // when drawing — the preview should follow the mouse any time the mask
    // tool is active.
    if (isActive && !('touches' in e)) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setCursorPos({
          x: (e as React.MouseEvent).clientX - rect.left,
          y: (e as React.MouseEvent).clientY - rect.top,
        });
      }
    }
    if (!isDrawing || !isActive) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = getContext();
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
      // Keep building the path for potential fill
      currentPathRef.current.push({ x, y });
    }
  };

  // R31: hide the DOM circle when the cursor leaves the canvas.
  const hideCursor = () => setCursorPos(null);

  const stopDrawing = () => {
    if (!isDrawing) return;
    const ctx = getContext();
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      setIsDrawing(false);

      // Check if the stroke loops back near the start point — auto-fill if so
      const start = startPointRef.current;
      const path = currentPathRef.current;
      if (start && path.length > 10) {
        const end = path[path.length - 1];
        const dist = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);

        if (dist < CLOSE_THRESHOLD * (canvas.width / canvas.clientWidth)) {
          // Close the path and fill the enclosed area
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
          }
          ctx.closePath();
          ctx.fill();
        }
      }

      startPointRef.current = null;
      currentPathRef.current = [];
      pushToHistory();
      exportMask();
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pushToHistory();
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
          isActive ? 'cursor-none' : 'cursor-default'
        }`}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={(e) => { stopDrawing(); hideCursor(); }}
        onMouseEnter={(e) => {
          if (!isActive) return;
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }
        }}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />

      {/* R31: DOM brush-size cursor.  Scales brush size from canvas-space to
          screen-space (canvas is drawn with object-contain, so we scale by
          the ratio of rendered width to canvas width). */}
      {isActive && cursorPos && canvasRef.current ? (() => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        // canvas.width is the image-space width; rect.width is the on-screen
        // width after object-contain scaling. We want the circle in screen px.
        const ratio = rect.width > 0 && canvas.width > 0 ? rect.width / canvas.width : 1;
        const displayDiameter = Math.max(8, brushSize * ratio);
        return (
          <div
            aria-hidden
            className="absolute pointer-events-none rounded-full border-2 transition-[width,height] duration-100"
            style={{
              width: displayDiameter,
              height: displayDiameter,
              left: cursorPos.x,
              top: cursorPos.y,
              transform: 'translate(-50%, -50%)',
              borderColor: 'rgba(0, 200, 255, 0.9)',
              background: 'rgba(0, 200, 255, 0.12)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
            }}
          />
        );
      })() : null}

      {isActive && (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--color-ink)]/84 px-3 py-2 text-white shadow-[0_20px_36px_rgba(15,23,42,0.4)] backdrop-blur-md">
          <div className="rounded-full bg-white/12 px-2 py-1">
            <div className="flex items-center gap-1">
              {(isMobile ? [40, 80, 140] : [20, 40, 80]).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setBrushSize(size)}
                  className={`flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-all ${
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
            disabled={historyIndexRef.current <= 0}
            className="rounded-full p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-all hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Undo mask stroke"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={historyIndexRef.current >= historyRef.current.length - 1}
            className="rounded-full p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-all hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Redo mask stroke"
          >
            <Redo2 size={16} />
          </button>
          <div className="h-6 w-px bg-white/25" />
          <button
            type="button"
            onClick={clearCanvas}
            className="rounded-full p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-all hover:bg-rose-400/30"
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
