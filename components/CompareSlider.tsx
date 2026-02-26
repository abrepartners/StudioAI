import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeftRight } from 'lucide-react';

interface CompareSliderProps {
  originalImage: string;
  generatedImage: string;
  onDragStateChange?: (isDragging: boolean) => void;
}

const CompareSlider: React.FC<CompareSliderProps> = ({ originalImage, generatedImage, onDragStateChange }) => {
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
    onDragStateChange?.(isDragging);
    return () => onDragStateChange?.(false);
  }, [isDragging, onDragStateChange]);

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
      className="relative h-full w-full select-none overflow-hidden rounded-[1.25rem] cursor-ew-resize"
      style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
      onMouseDown={(e) => {
        handleMove(e.clientX);
        onMouseDown();
      }}
      onTouchStart={(e) => {
        e.preventDefault();
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

      <div className="absolute left-4 top-4 rounded-full glass-overlay px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
        Before
      </div>
      <div className="absolute right-4 top-4 rounded-full glass-overlay px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
        After
      </div>

      <div
        className="absolute inset-y-0 z-20 w-[2px] bg-white/75 shadow-[0_0_0_1px_rgba(19,78,74,0.15)]"
        style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--color-ink)]/80 text-white shadow-[0_10px_24px_rgba(15,23,42,0.35)] backdrop-blur">
          <ArrowLeftRight size={16} />
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-ink)]/70 px-3 py-1.5 text-[11px] font-medium tracking-wide text-white backdrop-blur">
        Drag to compare
      </div>
    </div>
  );
};

export default CompareSlider;
