
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
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const percentage = (x / rect.width) * 100;
      setSliderPosition(percentage);
    }
  }, []);

  const onMouseDown = () => setIsDragging(true);
  
  useEffect(() => {
    const onMouseUp = () => setIsDragging(false);
    const onMouseMove = (e: MouseEvent) => { if (isDragging) handleMove(e.clientX); };
    const onTouchMove = (e: TouchEvent) => { if (isDragging) handleMove(e.touches[0].clientX); };

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onMouseUp);
    };
  }, [isDragging, handleMove]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full rounded-2xl overflow-hidden cursor-ew-resize select-none group"
      onMouseDown={(e) => { handleMove(e.clientX); onMouseDown(); }}
      onTouchStart={(e) => { handleMove(e.touches[0].clientX); onMouseDown(); }}
    >
      {/* Generated Image (Bottom Layer) */}
      <img 
        src={generatedImage} 
        alt="After"
        className="absolute top-0 left-0 w-full h-full object-cover pointer-events-none"
        draggable={false}
      />
      <div className="absolute top-4 right-4 bg-slate-900/50 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
        AI Design
      </div>

      {/* Original Image (Top Layer, Clipped) */}
      <div
        className="absolute top-0 left-0 h-full overflow-hidden pointer-events-none"
        style={{ width: `${sliderPosition}%` }}
      >
        <img
          src={originalImage}
          alt="Before"
          className="absolute top-0 left-0 h-full object-cover max-w-none pointer-events-none"
          style={{ width: containerRef.current?.offsetWidth }} 
          draggable={false}
        />
        <div className="absolute top-4 left-4 bg-slate-900/50 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
          Original
        </div>
      </div>

      {/* Slider Handle */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white/50 group-hover:bg-white transition-colors duration-300 pointer-events-none"
        style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 backdrop-blur-md border-2 border-white/50 rounded-full flex items-center justify-center text-white shadow-2xl transition-transform group-hover:scale-110 duration-300">
          <ArrowLeftRight size={16} />
        </div>
      </div>
    </div>
  );
};

export default CompareSlider;
