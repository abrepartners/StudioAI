import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Paintbrush, Undo2, Redo2, Trash2 } from 'lucide-react';

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

  const getContext = useCallback(() => canvasRef.current?.getContext('2d', { willReadFrequently: true }), []);

  const pushToHistory = useCallback((imageData: ImageData) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(imageData);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

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
    const isCanvasEmpty = !imageData.data.some(channel => channel !== 0);
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
    <div className="relative w-full h-full group">
      <img ref={imageRef} src={imageSrc} alt="Original for masking" className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none" />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full object-contain ${isActive ? 'cursor-crosshair' : 'cursor-default opacity-80'}`}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      {isActive && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-md text-white p-2 rounded-full flex items-center gap-2 shadow-lg z-10">
          <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-full">
            {[20, 40, 80].map(size => (
              <button key={size} onClick={() => setBrushSize(size)} className={`w-8 h-8 rounded-full transition-all flex items-center justify-center ${brushSize === size ? 'bg-indigo-600' : 'hover:bg-slate-700'}`}>
                <div className="bg-white rounded-full" style={{ width: size/4, height: size/4 }}></div>
              </button>
            ))}
          </div>
          <div className="h-6 w-px bg-white/20"></div>
          <button onClick={undo} disabled={historyIndex <= 0} className="p-2 rounded-full hover:bg-slate-700 disabled:opacity-30"><Undo2 size={18} /></button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 rounded-full hover:bg-slate-700 disabled:opacity-30"><Redo2 size={18} /></button>
          <div className="h-6 w-px bg-white/20"></div>
          <button onClick={clearCanvas} className="p-2 rounded-full hover:bg-slate-700"><Trash2 size={18} /></button>
        </div>
      )}
    </div>
  );
};

export default MaskCanvas;