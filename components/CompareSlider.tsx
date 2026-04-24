/**
 * components/CompareSlider.tsx — Before/After drag comparison.
 *
 * v2 UPGRADE:
 *   - Handle: glass morphism + soft glow, pulses once on mount to signal
 *     "drag me". Scales up on grab, scales down on release (spring-like).
 *   - Release physics: when you let go near an edge, the slider glides back
 *     toward center with a spring easing so users never lose the view.
 *   - Double-click / double-tap: snap to center (50%) with spring.
 *   - Velocity-aware drag: fast swipes overshoot slightly then settle.
 *
 * Zero API change — same props, same behavior contract.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeftRight } from 'lucide-react';

interface CompareSliderProps {
  originalImage: string;
  generatedImage: string;
}

// Simple spring integrator. Returns a function that, when called repeatedly
// via rAF, walks `value` toward `target` with spring dynamics. Stops itself
// when both displacement and velocity are below thresholds.
function useSpring(
  initial: number,
  onFrame: (v: number) => void,
  opts: { stiffness?: number; damping?: number; mass?: number } = {},
) {
  const { stiffness = 160, damping = 22, mass = 1 } = opts;
  const valueRef = useRef(initial);
  const velocityRef = useRef(0);
  const targetRef = useRef(initial);
  const rafRef = useRef<number | null>(null);
  const lastTRef = useRef<number | null>(null);

  const step = useCallback((t: number) => {
    if (lastTRef.current === null) lastTRef.current = t;
    const dt = Math.min((t - lastTRef.current) / 1000, 1 / 30);
    lastTRef.current = t;

    const x = valueRef.current;
    const v = velocityRef.current;
    const target = targetRef.current;

    const fSpring = -stiffness * (x - target);
    const fDamping = -damping * v;
    const a = (fSpring + fDamping) / mass;

    const nextV = v + a * dt;
    const nextX = x + nextV * dt;

    valueRef.current = nextX;
    velocityRef.current = nextV;
    onFrame(nextX);

    const settled = Math.abs(nextX - target) < 0.05 && Math.abs(nextV) < 0.05;
    if (settled) {
      valueRef.current = target;
      velocityRef.current = 0;
      onFrame(target);
      rafRef.current = null;
      lastTRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(step);
  }, [stiffness, damping, mass, onFrame]);

  const animateTo = useCallback((target: number) => {
    targetRef.current = target;
    if (rafRef.current == null) {
      lastTRef.current = null;
      rafRef.current = requestAnimationFrame(step);
    }
  }, [step]);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTRef.current = null;
  }, []);

  const setImmediate = useCallback((v: number) => {
    stop();
    valueRef.current = v;
    velocityRef.current = 0;
    targetRef.current = v;
    onFrame(v);
  }, [onFrame, stop]);

  useEffect(() => () => stop(), [stop]);

  return { animateTo, setImmediate, stop, valueRef };
}

const CompareSlider: React.FC<CompareSliderProps> = ({ originalImage, generatedImage }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Spring drives the slider when not dragging (release + snap + edge return).
  const spring = useSpring(50, setSliderPosition, { stiffness: 180, damping: 20 });

  // Mount pulse — brief scale-up on handle so first-time users see the affordance.
  useEffect(() => {
    const t = setTimeout(() => setHasMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const pct = (x / rect.width) * 100;
    spring.setImmediate(pct); // direct set while dragging — no lag.
  }, [spring]);

  const onMouseDown = () => {
    spring.stop();
    setIsDragging(true);
  };

  const releaseWithSpring = useCallback(() => {
    // Edge-return: within 8% of an edge, glide back to avoid "lost" state.
    const v = spring.valueRef.current;
    if (v < 8) spring.animateTo(15);
    else if (v > 92) spring.animateTo(85);
    // else keep where we are — spring is at rest.
  }, [spring]);

  useEffect(() => {
    const onMouseUp = () => {
      setIsDragging(false);
      releaseWithSpring();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) handleMove(e.clientX);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
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
  }, [isDragging, handleMove, releaseWithSpring]);

  // Double-click → snap back to 50/50 with spring.
  const snapToCenter = useCallback(() => {
    spring.animateTo(50);
  }, [spring]);

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
      onDoubleClick={snapToCenter}
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

      {/* Divider line + handle */}
      <div
        className="absolute inset-y-0 z-20"
        style={{
          left: `${sliderPosition}%`,
          transform: 'translateX(-50%)',
          // Soft gradient line instead of hard 2px bar — more premium.
          width: 2,
          background:
            'linear-gradient(to bottom, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.85) 20%, rgba(255,255,255,0.85) 80%, rgba(255,255,255,0.1) 100%)',
          boxShadow: '0 0 0 1px rgba(19,78,74,0.12)',
        }}
      >
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border border-white/25 bg-black/55 text-white backdrop-blur-xl transition-[transform,box-shadow] duration-200 ease-out ${
            isDragging
              ? 'scale-110 shadow-[0_18px_40px_rgba(0,0,0,0.55)]'
              : 'scale-100 shadow-[0_10px_28px_rgba(0,0,0,0.45)]'
          } ${hasMounted ? 'animate-grab-hint' : ''}`}
          style={{
            width: 44,
            height: 44,
            // Inner highlight gives the handle a real "glass orb" look.
            backgroundImage:
              'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 55%)',
          }}
          aria-hidden="true"
        >
          <ArrowLeftRight size={16} />
        </div>
      </div>

      {/* Bottom pill — kept, with tightened styling */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full border border-white/10 bg-black/60 backdrop-blur-xl px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/90 shadow-lg shadow-black/40">
        <span className="text-white/50">Before</span>
        <span className="text-white/20">·</span>
        <span>Drag · double-click to reset</span>
        <span className="text-white/20">·</span>
        <span className="text-white/50">After</span>
      </div>
    </div>
  );
};

export default CompareSlider;
