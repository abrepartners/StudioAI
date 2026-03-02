import React from 'react';
import { Palette } from 'lucide-react';
import { ColorData } from '../types';

interface ColorAnalysisProps {
  colors: ColorData[];
  isLoading: boolean;
}

const ColorAnalysis: React.FC<ColorAnalysisProps> = ({ colors, isLoading }) => {
  if (isLoading) {
    return (
      <div className="premium-surface rounded-2xl p-5 w-full animate-pulse">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-[var(--color-bg-deep)]" />
          <div className="h-3.5 w-40 rounded-full bg-[var(--color-bg-deep)]" />
        </div>
        <div className="mb-3 h-2 w-full rounded-full bg-[var(--color-bg-deep)]" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded-full bg-[var(--color-bg-deep)]" />
          <div className="h-3 w-4/5 rounded-full bg-[var(--color-bg-deep)]" />
          <div className="h-3 w-2/3 rounded-full bg-[var(--color-bg-deep)]" />
        </div>
      </div>
    );
  }

  if (colors.length === 0) return null;

  return (
    <div className="premium-surface rounded-2xl p-5 w-full">
      <div className="mb-4 flex items-center gap-3">
        <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)]">
          <Palette size={16} />
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold">Detected Palette</h3>
          <p className="text-xs tracking-[0.14em] uppercase text-[var(--color-text)]/70">Material color mix</p>
        </div>
      </div>

      <div className="mb-4 flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-deep)]">
        {colors.map((color, idx) => (
          <div key={idx} className="h-full" style={{ width: `${color.value}%`, backgroundColor: color.fill }} />
        ))}
      </div>

      <div className="space-y-2">
        {colors.slice(0, 4).map((color, idx) => (
          <div key={idx} className="flex items-center justify-between rounded-xl subtle-card px-3 py-2 text-sm">
            <div className="flex items-center gap-2.5">
              <div className="h-3.5 w-3.5 rounded-full border border-black/5" style={{ backgroundColor: color.fill }} />
              <span className="font-medium text-[var(--color-ink)]">{color.name}</span>
            </div>
            <span className="font-semibold text-[var(--color-text)]/80">{color.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ColorAnalysis;
