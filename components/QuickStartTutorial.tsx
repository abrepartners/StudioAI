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
    title: 'Upload Your Photos',
    description: 'Drag and drop listing photos here — one at a time or multiple for batch editing. We auto-detect the room type for you.',
    icon: <Upload size={24} />,
    highlight: 'upload',
    position: 'center',
  },
  {
    title: 'Choose a Style Pack',
    description: 'Select PACKS mode, then pick a design style like Coastal Modern or Mid-Century. The AI stages the room to match.',
    icon: <Layers size={24} />,
    highlight: 'style',
    position: 'top-right',
  },
  {
    title: 'Or Describe What You Want',
    description: 'Use TEXT mode to type a custom direction like "modern minimalist with warm wood tones" — the AI follows your lead.',
    icon: <Wand2 size={24} />,
    highlight: 'text',
    position: 'top-right',
  },
  {
    title: 'Special Modes',
    description: 'Scroll down in the side panel for Day to Dusk, Sky Replacement, Smart Cleanup, and Virtual Renovation. Each does one thing well.',
    icon: <Sunset size={24} />,
    highlight: 'special',
    position: 'top-right',
  },
  {
    title: 'Work on Multiple Photos',
    description: 'Use the + Add button in the header to upload more photos. Navigate between them with the < 1/4 > arrows. Each keeps its own edits.',
    icon: <Images size={24} />,
    highlight: 'nav',
    position: 'top-left',
  },
  {
    title: 'Export When Done',
    description: 'Hit Export in the header to download your staged image. Use Save to keep it in your history for later.',
    icon: <Download size={24} />,
    highlight: 'export',
    position: 'top-right',
  },
];

const STORAGE_KEY = 'studioai_tutorial_seen';

interface QuickStartTutorialProps {
  forceShow?: boolean;
  onClose?: () => void;
}

const QuickStartTutorial: React.FC<QuickStartTutorialProps> = ({ forceShow, onClose }) => {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (forceShow) {
      setVisible(true);
      setStep(0);
      return;
    }
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      setVisible(true);
    }
  }, [forceShow]);

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
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
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
                className="text-[10px] text-zinc-600 hover:text-zinc-400 transition"
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
