/**
 * EditingBadge.tsx — "Current Result" indicator
 *
 * Shows users what they're editing — the original photo, or a specific
 * version of the stack. Clicking opens a popover with escape hatches
 * (Start From Original, View History).
 */

import React, { useState, useEffect, useRef } from 'react';
import { Layers, RotateCcw, Clock, ChevronDown, CheckCircle2 } from 'lucide-react';

interface EditingBadgeProps {
  hasResult: boolean;
  versionCount: number;
  editHistory?: string[];
  chainDepth?: number;
  chainCapped?: boolean;
  onStartOver: () => void;
  onCommitAndContinue?: () => void;
  onOpenHistory: () => void;
}

const EditingBadge: React.FC<EditingBadgeProps> = ({
  hasResult,
  versionCount,
  editHistory = [],
  chainDepth = 0,
  chainCapped = false,
  onStartOver,
  onCommitAndContinue,
  onOpenHistory,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const label = hasResult
    ? `Editing your result · v${versionCount}`
    : 'Editing original photo';
  const lastTool = editHistory[editHistory.length - 1];

  const badgeClass = chainCapped
    ? 'bg-[#FF9F0A]/20 border border-[#FF9F0A]/50 text-white hover:bg-[#FF9F0A]/30'
    : hasResult
      ? 'bg-[#0A84FF]/20 border border-[#0A84FF]/40 text-white hover:bg-[#0A84FF]/30'
      : 'bg-black/50 border border-white/10 text-zinc-300 hover:bg-black/70';

  return (
    <div ref={ref} className="relative z-10">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] rounded-full text-[11px] font-medium backdrop-blur-md transition-all ${badgeClass}`}
        aria-label={`${label} — open edit menu`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Layers className="w-3 h-3" />
        <span>{label}</span>
        {chainCapped && <span className="text-[10px] opacity-80">· chain full</span>}
        {hasResult && <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && hasResult && (
        <div className="mt-1.5 w-64 rounded-lg bg-zinc-900/95 backdrop-blur-md border border-zinc-800 shadow-xl overflow-hidden">
          {lastTool && (
            <div className="px-3 py-2 border-b border-zinc-800">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Last edit</div>
              <div className="text-xs text-white capitalize">{lastTool}</div>
              {chainDepth > 0 && (
                <div className="mt-1 text-[10px] text-zinc-500">
                  Chain depth: {chainDepth}{chainCapped ? ' — commit recommended' : ''}
                </div>
              )}
            </div>
          )}
          {chainCapped && onCommitAndContinue && (
            <button
              onClick={() => { setOpen(false); onCommitAndContinue(); }}
              className="w-full flex items-start gap-2 px-3 py-2.5 text-xs text-white bg-[#FF9F0A]/10 hover:bg-[#FF9F0A]/20 transition-colors border-b border-zinc-800"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#FF9F0A] mt-0.5 shrink-0" />
              <span className="text-left">
                <span className="block font-semibold">Commit &amp; continue</span>
                <span className="block text-[10px] text-zinc-400 leading-tight mt-0.5">Lock in current result as new base. Prevents further quality drift.</span>
              </span>
            </button>
          )}
          <button
            onClick={() => { setOpen(false); onStartOver(); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-white hover:bg-zinc-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#FF375F]" />
            <span>Start from original</span>
          </button>
          <button
            onClick={() => { setOpen(false); onOpenHistory(); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-white hover:bg-zinc-800 transition-colors border-t border-zinc-800"
          >
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>View history</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default EditingBadge;
