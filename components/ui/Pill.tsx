/**
 * Pill.tsx — UI primitive
 *
 * Selectable filter / suggestion chip.  Has active/inactive states.
 * Think: prompt suggestions, tone filters, room-type picker.
 *
 * For read-only status, use <Badge>.  For full-width CTAs, use <Button>.
 */

import React from 'react';

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  leftIcon?: React.ReactNode;
}

const Pill = React.forwardRef<HTMLButtonElement, PillProps>(function Pill(
  { active = false, leftIcon, className = '', children, ...rest },
  ref
) {
  const base =
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide border transition-all whitespace-nowrap shrink-0';
  const state = active
    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
    : 'border-[var(--color-border-strong)] bg-black/40 text-[var(--color-text)]/70 hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary)]/50 hover:text-[var(--color-primary)]';

  return (
    <button
      ref={ref}
      type="button"
      className={[base, state, className].join(' ')}
      {...rest}
    >
      {leftIcon ? <span className="shrink-0">{leftIcon}</span> : null}
      <span>{children}</span>
    </button>
  );
});

export default Pill;
