import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeftRight } from 'lucide-react';

interface CompareSliderProps {
  originalImage: string;
  generatedImage: string;
}

const CompareSlider: React.FC<CompareSliderProps> = ({ originalImage, generatedImage }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPosition((x / rect.width) * 100);
  }, []);

  const onMouseDown = () => setIsDragging(true);

  useEffect(() => {
    const onMouseUp = () => setIsDragging(false);
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) handleMove(e.clientX);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      // Prevent native vertical scroll / pull-to-refresh while sliding.
      e.preventDefault();
      if (!e.touches.length) return;
      handleMove(e.touches[0].clientX);
    };
    const touchListenerOptions: AddEventListenerOptions = { passive: false };

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove, touchListenerOptions);
      window.addEventListener('touchend', onMouseUp);
      window.addEventListener('touchcancel', onMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove, touchListenerOptions);
      window.removeEventListener('touchend', onMouseUp);
      window.removeEventListener('touchcancel', onMouseUp);
    };
  }, [isDragging, handleMove]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none overflow-hidden rounded-2xl cursor-ew-resize"
      style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
      onMouseDown={(e) => {
        handleMove(e.clientX);
        onMouseDown();
      }}
      onTouchStart={(e) => {
        handleMove(e.touches[0].clientX);
        onMouseDown();
      }}
    >
      <img
        src={generatedImage}
        alt="After"
        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
        draggable={false}
      />

      <div
        className="absolute inset-y-0 left-0 overflow-hidden pointer-events-none"
        style={{ width: `${sliderPosition}%` }}
      >
        <img
          src={originalImage}
          alt="Before"
          className="absolute inset-y-0 left-0 h-full max-w-none object-cover pointer-events-none"
          style={{ width: containerRef.current?.offsetWidth }}
          draggable={false}
        />
      </div>

      <div
        className="absolute inset-y-0 z-20 w-[2px] bg-white/75 shadow-[0_0_0_1px_rgba(19,78,74,0.15)]"
        style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--color-ink)]/80 text-white shadow-[0_10px_24px_rgba(15,23,42,0.35)] backdrop-blur">
          <ArrowLeftRight size={16} />
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 rounded-full bg-black/70 backdrop-blur-md px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.12em] text-white">
        <span className="text-zinc-400">Before</span>
        <span className="text-zinc-600">|</span>
        <span>Drag to compare</span>
        <span className="text-zinc-600">|</span>
        <span className="text-zinc-400">After</span>
      </div>
    </div>
  );
};

export default CompareSlider;
