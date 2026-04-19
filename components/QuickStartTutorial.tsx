import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, Upload, Wand2, Layers, Sunset, Download, Images } from 'lucide-react';
import { useModal } from '../hooks/useModal';

interface TutorialStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  highlight?: string; // CSS selector or area name
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

const STEPS: TutorialStep[] = [
  {
    title: "You're in. Here's how it works.",
    description: "We'll walk you through the 5 things that matter. Takes about 20 seconds.",
    icon: <Upload size={24} />,
    highlight: 'upload',
    position: 'center',
  },
  {
    title: 'Pick a style.',
    description: 'Open PACKS mode and tap a style — Coastal Modern, Mid-Century, Scandinavian. We stage the room in that look without touching walls, floors, or windows.',
    icon: <Layers size={24} />,
    highlight: 'style',
    position: 'top-right',
  },
  {
    title: 'Or type your own direction.',
    description: 'Switch to TEXT mode and describe it: "warm oak, linen drapes, one sculptural lamp." We follow your lead.',
    icon: <Wand2 size={24} />,
    highlight: 'text',
    position: 'top-right',
  },
  {
    title: 'Go past staging.',
    description: 'Day to Dusk, Sky Replacement, Smart Cleanup, and Virtual Renovation live under Pro AI Tools. Each does one job well.',
    icon: <Sunset size={24} />,
    highlight: 'special',
    position: 'top-right',
  },
  {
    title: 'Work a whole listing.',
    description: 'Tap + Add in the header to bring in more photos. The arrows at the top switch between them — every photo keeps its own edits.',
    icon: <Images size={24} />,
    highlight: 'nav',
    position: 'top-left',
  },
  {
    title: 'Export MLS-ready.',
    description: 'Hit Export to download. Save keeps a version in your history so you can compare looks before you send to the seller.',
    icon: <Download size={24} />,
    highlight: 'export',
    position: 'top-right',
  },
];

const STORAGE_KEY = 'studioai_tutorial_seen';

interface QuickStartTutorialProps {
  forceShow?: boolean;
  // R8: fires the tutorial after the user's first upload (not on first visit).
  // When this transitions truthy and the user hasn't seen the tutorial yet,
  // we show it automatically. Stale/repeat transitions are a no-op because
  // the STORAGE_KEY is set once the tutorial is closed.
  firstUpload?: boolean;
  onClose?: () => void;
}

const QuickStartTutorial: React.FC<QuickStartTutorialProps> = ({ forceShow, firstUpload, onClose }) => {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (forceShow) {
      setVisible(true);
      setStep(0);
      return;
    }
    // R8: first-upload trigger. Only auto-opens if the user hasn't already
    // seen the tutorial (or dismissed it) in a prior session.
    if (firstUpload) {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        setVisible(true);
        setStep(0);
      }
    }
  }, [forceShow, firstUpload]);

  const handleClose = useCallback(() => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, 'true');
    onClose?.();
  }, [onClose]);

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep(s => s - 1);
  };

  // F6: useModal before the early return so the hook-count stays stable.
  const { dialogProps, titleId } = useModal({ isOpen: visible, onClose: handleClose });
  const { onOverlayClick, ...panelProps } = dialogProps;

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={onOverlayClick}
    >
      {/* Backdrop — click bubbles to the overlay parent so useModal's onOverlayClick can decide */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm pointer-events-none" />

      {/* Tutorial Card */}
      <div
        {...panelProps}
        className="relative z-10 w-full max-w-md mx-4 animate-scale-in focus:outline-none"
      >
        <div className="rounded-2xl bg-[#1a1a1a] border border-white/[0.08] shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-black/40">
            <div
              className="h-full bg-[var(--color-primary)] transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Step indicator */}
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                Step {step + 1} of {STEPS.length}
              </span>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close tutorial"
                className="rounded-lg p-1 text-zinc-500 hover:text-white hover:bg-white/10 transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 flex items-center justify-center text-[var(--color-primary)] mb-5">
              {current.icon}
            </div>

            {/* Text */}
            <h3 id={titleId} className="font-display text-xl font-bold text-white mb-2">{current.title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">{current.description}</p>
          </div>

          {/* Navigation */}
          <div className="px-8 pb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrev}
              disabled={isFirst}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-white transition disabled:opacity-0 disabled:pointer-events-none inline-flex items-center gap-1"
            >
              <ChevronLeft size={14} /> Back
            </button>

            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === step
                      ? 'bg-[var(--color-primary)] w-6'
                      : i < step
                      ? 'bg-[var(--color-primary)]/40'
                      : 'bg-zinc-700'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg px-4 py-2 text-sm font-bold bg-[var(--color-primary)] text-white hover:opacity-90 transition inline-flex items-center gap-1"
            >
              {isLast ? 'Get Started' : 'Next'} {!isLast && <ChevronRight size={14} />}
            </button>
          </div>

          {/* Skip link */}
          {!isLast && (
            <div className="px-8 pb-4 text-center">
              <button
                type="button"
                onClick={handleClose}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition"
              >
                Skip tutorial
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickStartTutorial;
