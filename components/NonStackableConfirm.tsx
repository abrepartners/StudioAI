// components/NonStackableConfirm.tsx
// Lightweight confirm shown before running a non-stackable tool when the user
// already has AI-edited state on screen. Explains that the tool will run on
// the original photo, replacing their current generation.

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface NonStackableConfirmProps {
  open: boolean;
  toolName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const NonStackableConfirm: React.FC<NonStackableConfirmProps> = ({
  open,
  toolName,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="non-stackable-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
    >
      <div className="premium-surface rounded-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)] shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="non-stackable-title" className="font-semibold text-[var(--color-ink)]">
              {toolName} runs on your original photo
            </h2>
            <p className="text-sm text-[var(--color-text)]/70 mt-1">
              Your current AI-edited result will be replaced. Run this tool first,
              then re-stage on top if you want both.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm text-[var(--color-text)]/80 hover:bg-[var(--color-border)]/40 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-90 transition"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default NonStackableConfirm;
