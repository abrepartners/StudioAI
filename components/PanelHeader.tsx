/**
 * PanelHeader.tsx — Shared panel header primitive
 *
 * Extracted from 4 inline copies in StyleControls, SpecialModesPanel,
 * BrandKit, and MLSExport.  Gives us ONE place to tune the icon-chip +
 * title + subtitle look used across every editor panel.
 *
 * Usage:
 *   <PanelHeader icon={<Wand2 size={18} />} title="Style Packs" subtitle="Pick a curated direction" />
 */

import React from 'react';

export interface PanelHeaderProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Optional right-side slot (badges, buttons, counters). */
  right?: React.ReactNode;
  className?: string;
  /** "uppercase" = eyebrow style subtitle (default), "plain" = sentence-case helper text. */
  subtitleStyle?: 'uppercase' | 'plain';
}

const PanelHeader: React.FC<PanelHeaderProps> = ({
  icon,
  title,
  subtitle,
  right,
  className = '',
  subtitleStyle = 'uppercase',
}) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {icon ? (
        <div className="subtle-card rounded-xl p-2 text-[var(--color-primary)] shrink-0">
          {icon}
        </div>
      ) : null}
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-lg font-semibold text-[var(--color-ink)] truncate">
          {title}
        </h3>
        {subtitle ? (
          <p
            className={
              subtitleStyle === 'uppercase'
                ? 'text-xs uppercase tracking-[0.14em] text-[var(--color-text)]/70'
                : 'text-xs text-[var(--color-text)]/70'
            }
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
};

export default PanelHeader;
