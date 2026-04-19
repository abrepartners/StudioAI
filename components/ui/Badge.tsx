/**
 * Badge.tsx — UI primitive
 *
 * Compact status indicator.  Think "PRO", "NEW", "BETA", "3/10".
 * For filter chips, use <Pill> instead.
 */

import React from 'react';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warn' | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-black/40 text-[var(--color-text)] border-[var(--color-border-strong)]',
  primary: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/30',
  success: 'bg-[#30D158]/10 text-[#30D158] border-[#30D158]/30',
  warn: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  danger: 'bg-[var(--color-error)]/10 text-[var(--color-error)] border-[var(--color-error)]/30',
};

const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral',
  className = '',
  children,
  ...rest
}) => {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider border',
        TONE_CLASSES[tone],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </span>
  );
};

export default Badge;
