/**
 * Button.tsx — UI primitive
 *
 * 4 variants × 2 sizes.  One place to change button look/feel.
 * Intentionally SMALL — wraps a native <button> with a class mapper.
 *
 * Variants:
 *   primary   — brand CTA (blue fill)
 *   secondary — subtle chip (black/low-contrast)
 *   ghost     — borderless, hover highlight
 *   danger    — red destructive action
 *
 * Sizes:
 *   sm — dense toolbar button
 *   md — default form / primary CTA button
 */

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Full-width layout. */
  block?: boolean;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-primary)] text-white border border-[#0A84FF]/60 hover:bg-[#409CFF] shadow-lg hover:shadow-xl',
  secondary:
    'bg-white/[0.03] text-white border border-white/10 hover:bg-white/[0.06] hover:border-white/20',
  ghost:
    'bg-transparent text-[var(--color-text)] border border-transparent hover:bg-white/[0.04]',
  danger:
    'bg-[var(--color-error)] text-white border border-[var(--color-error)] hover:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-xl gap-1.5',
  md: 'px-4 py-3 text-sm rounded-2xl gap-2',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    leftIcon,
    rightIcon,
    block = false,
    loading = false,
    disabled,
    className = '',
    children,
    ...rest
  },
  ref
) {
  const classes = [
    'inline-flex items-center justify-center font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    block ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} className={classes} disabled={disabled || loading} {...rest}>
      {leftIcon ? <span className="shrink-0">{leftIcon}</span> : null}
      <span>{children}</span>
      {rightIcon ? <span className="shrink-0">{rightIcon}</span> : null}
    </button>
  );
});

export default Button;
