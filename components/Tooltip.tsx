/**
 * Tooltip.tsx — Hover/focus tooltip primitive
 *
 * Replaces native `title=` across the app.
 *   - 400ms open delay (prevents flicker on quick mouse-overs)
 *   - 100ms close delay (lets the user move into the tooltip if we ever add interaction)
 *   - Positions: 'top' | 'bottom' | 'left' | 'right' (default 'top')
 *   - Respects prefers-reduced-motion (no fade animation)
 *
 * Usage:
 *   <Tooltip label="Download as ZIP">
 *     <button>…</button>
 *   </Tooltip>
 *
 * The child MUST be a single element that accepts ref + mouse/focus handlers
 * (native DOM elements, forwardRef components).  We merge handlers so the child
 * keeps its own onMouseEnter / onFocus etc.
 */

import React, {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  label: React.ReactNode;
  children: React.ReactElement;
  placement?: TooltipPlacement;
  /** Disable the tooltip entirely (e.g. when the control is focused). */
  disabled?: boolean;
  /** Open delay in ms. Default 400. */
  openDelay?: number;
  /** Close delay in ms. Default 100. */
  closeDelay?: number;
  className?: string;
}

const Tooltip: React.FC<TooltipProps> = ({
  label,
  children,
  placement = 'top',
  disabled = false,
  openDelay = 400,
  closeDelay = 100,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const id = useId();

  const clearTimers = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  const scheduleOpen = useCallback(() => {
    if (disabled || !label) return;
    clearTimers();
    openTimer.current = window.setTimeout(() => setOpen(true), openDelay);
  }, [disabled, label, openDelay]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), closeDelay);
  }, [closeDelay]);

  const hideNow = useCallback(() => {
    clearTimers();
    setOpen(false);
  }, []);

  useEffect(() => () => clearTimers(), []);

  // Position once we're open.
  useLayoutEffect(() => {
    if (!open) return;
    const triggerEl = triggerRef.current;
    const tipEl = tooltipRef.current;
    if (!triggerEl || !tipEl) return;
    const tr = triggerEl.getBoundingClientRect();
    const tipRect = tipEl.getBoundingClientRect();
    const GAP = 8;
    let left = 0;
    let top = 0;
    switch (placement) {
      case 'bottom':
        left = tr.left + tr.width / 2 - tipRect.width / 2;
        top = tr.bottom + GAP;
        break;
      case 'left':
        left = tr.left - tipRect.width - GAP;
        top = tr.top + tr.height / 2 - tipRect.height / 2;
        break;
      case 'right':
        left = tr.right + GAP;
        top = tr.top + tr.height / 2 - tipRect.height / 2;
        break;
      case 'top':
      default:
        left = tr.left + tr.width / 2 - tipRect.width / 2;
        top = tr.top - tipRect.height - GAP;
        break;
    }
    // Clamp to viewport.
    const pad = 8;
    const maxLeft = window.innerWidth - tipRect.width - pad;
    const maxTop = window.innerHeight - tipRect.height - pad;
    left = Math.max(pad, Math.min(left, maxLeft));
    top = Math.max(pad, Math.min(top, maxTop));
    setCoords({ left, top });
  }, [open, placement]);

  // Close on scroll/resize/Escape for good hygiene.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => hideNow();
    const onResize = () => hideNow();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideNow();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, hideNow]);

  if (!isValidElement(children)) return <>{children}</>;

  // Merge handlers onto the child element.
  const childProps = (children.props ?? {}) as Record<string, unknown>;
  const mergedProps: Record<string, unknown> = {
    ...childProps,
    'aria-describedby': open ? id : (childProps['aria-describedby'] as string | undefined),
    onMouseEnter: (e: React.MouseEvent) => {
      (childProps.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e);
      scheduleOpen();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      (childProps.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e);
      scheduleClose();
    },
    onFocus: (e: React.FocusEvent) => {
      (childProps.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e);
      scheduleOpen();
    },
    onBlur: (e: React.FocusEvent) => {
      (childProps.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e);
      hideNow();
    },
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Forward the original ref if the child had one.
      const original = (children as unknown as { ref?: React.Ref<HTMLElement> }).ref;
      if (typeof original === 'function') original(node);
      else if (original && typeof original === 'object')
        (original as React.MutableRefObject<HTMLElement | null>).current = node;
    },
  };

  const cloned = cloneElement(children, mergedProps);

  return (
    <>
      {cloned}
      {open && coords ? (
        <div
          ref={tooltipRef}
          role="tooltip"
          id={id}
          className={[
            'fixed z-[10000] pointer-events-none select-none',
            'rounded-lg px-2.5 py-1.5 text-[11px] font-medium leading-snug',
            'bg-[var(--color-bg-deep,#0b0b0c)] text-white border border-[var(--color-border-strong,rgba(255,255,255,0.12))] shadow-lg',
            'max-w-[240px]',
            className,
          ].join(' ')}
          style={{ left: coords.left, top: coords.top }}
        >
          {label}
        </div>
      ) : null}
    </>
  );
};

export default Tooltip;
