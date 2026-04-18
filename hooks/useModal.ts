/**
 * useModal — accessible modal hook (Phase 1, F6)
 *
 * Centralises the pieces every dialog in StudioAI needs to meet WCAG:
 *   • role="dialog" + aria-modal + aria-labelledby
 *   • Escape-to-close
 *   • focus trap (first focusable on open, restore focus on close)
 *   • scroll lock on <body>
 *   • optional click-outside-to-close
 *
 * Usage:
 *   const { dialogProps, titleId } = useModal({ isOpen, onClose });
 *   return (
 *     <div className="modal-overlay" onClick={dialogProps.onOverlayClick}>
 *       <div {...dialogProps}>
 *         <h2 id={titleId}>Title</h2>
 *         ...
 *       </div>
 *     </div>
 *   );
 *
 * The hook intentionally does NOT render overlay or panel chrome — callers
 * keep full control of layout/animation. It only wires behaviour.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

// ─── Internal helpers ────────────────────────────────────────────────────────

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
  'audio[controls]',
  'video[controls]',
  'summary',
].join(',');

function getFocusable(root: HTMLElement): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  // Filter out elements that are effectively hidden (display:none / visibility:hidden / aria-hidden)
  return nodes.filter((el) => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    // offsetParent === null is the cheapest "is it in the render tree" check.
    // It's not perfect (fixed-positioned elements return null) but covers display:none reliably.
    // For a trapped-modal surface, every focusable element lives in normal flow anyway.
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    return true;
  });
}

// Track how many modals are open so a nested modal's close doesn't unlock the
// body while a parent modal is still visible. Shared across hook instances.
let openModalCount = 0;
let previousBodyOverflow: string | null = null;

function lockBodyScroll() {
  if (openModalCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openModalCount += 1;
}

function unlockBodyScroll() {
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0) {
    document.body.style.overflow = previousBodyOverflow ?? '';
    previousBodyOverflow = null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface UseModalOptions {
  /** Controls whether the modal is considered open. Behavior wires up only when true. */
  isOpen: boolean;
  /** Called by Escape and (optionally) overlay-click. */
  onClose: () => void;
  /** Override the `aria-labelledby` id. When omitted, a fresh id is generated. */
  labelId?: string;
  /**
   * Disable click-outside-to-close. Default: enabled. Useful for destructive
   * flows that should force an explicit button decision.
   */
  closeOnOverlayClick?: boolean;
  /** Disable Escape-to-close. Default: enabled. */
  closeOnEscape?: boolean;
  /**
   * Disable body scroll lock. Default: enabled. The Access Panel uses its own
   * scrollable overlay and benefits from the lock; some deep-embed flows may not.
   */
  lockScroll?: boolean;
}

export interface UseModalResult {
  /**
   * Spread on the dialog panel element.
   * Includes: ref, role, aria-modal, aria-labelledby, tabIndex, onKeyDown.
   */
  dialogProps: {
    ref: (node: HTMLElement | null) => void;
    role: 'dialog';
    'aria-modal': true;
    'aria-labelledby': string;
    tabIndex: -1;
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
    /** Call from the overlay element's onClick to enable click-outside-to-close. */
    onOverlayClick: (e: ReactMouseEvent<HTMLElement>) => void;
  };
  /** Use this id on your <h1>/<h2>/etc. heading. */
  titleId: string;
}

export function useModal(options: UseModalOptions): UseModalResult {
  const {
    isOpen,
    onClose,
    labelId,
    closeOnOverlayClick = true,
    closeOnEscape = true,
    lockScroll = true,
  } = options;

  const generatedId = useId();
  const titleId = labelId ?? `modal-title-${generatedId}`;

  const panelRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Stable ref callback so the consumer's JSX doesn't need to wrap it in useCallback.
  const setRef = useCallback((node: HTMLElement | null) => {
    panelRef.current = node;
  }, []);

  // ─── Focus & scroll lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    // Remember what had focus before opening so we can restore on close.
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    // Focus first focusable element inside the panel. Small rAF + timeout chain
    // so we wait for children to mount before probing.
    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = getFocusable(panel);
      const target = focusable[0] ?? panel;
      // Using preventScroll avoids a jarring jump on mount.
      target.focus({ preventScroll: true });
    };

    // Try immediately; fall back to rAF if the panel hasn't been attached yet.
    const panel = panelRef.current;
    if (panel) {
      focusFirst();
    } else {
      requestAnimationFrame(focusFirst);
    }

    if (lockScroll) lockBodyScroll();

    return () => {
      if (lockScroll) unlockBodyScroll();
      // Restore focus. Guard against the previously-focused element being detached.
      const toRestore = restoreFocusRef.current;
      if (toRestore && document.body.contains(toRestore)) {
        toRestore.focus({ preventScroll: true });
      }
    };
  }, [isOpen, lockScroll]);

  // ─── Keyboard handling (Escape + Tab trap) ─────────────────────────────────
  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (!isOpen) return;

      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = getFocusable(panel);
        if (focusable.length === 0) {
          // No focusables — trap on the panel itself.
          e.preventDefault();
          panel.focus({ preventScroll: true });
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
          // Shift+Tab from first wraps to last
          if (active === first || !panel.contains(active)) {
            e.preventDefault();
            last.focus({ preventScroll: true });
          }
        } else {
          // Tab from last wraps to first
          if (active === last) {
            e.preventDefault();
            first.focus({ preventScroll: true });
          }
        }
      }
    },
    [isOpen, closeOnEscape]
  );

  // ─── Overlay click ─────────────────────────────────────────────────────────
  const onOverlayClick = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      if (!isOpen || !closeOnOverlayClick) return;
      // Only fire when the click landed on the overlay itself, not bubbled from
      // a child inside the panel.
      if (e.target === e.currentTarget) {
        onCloseRef.current();
      }
    },
    [isOpen, closeOnOverlayClick]
  );

  // ─── Package return value ──────────────────────────────────────────────────
  const dialogProps = useMemo(
    () => ({
      ref: setRef,
      role: 'dialog' as const,
      'aria-modal': true as const,
      'aria-labelledby': titleId,
      tabIndex: -1 as const,
      onKeyDown,
      onOverlayClick,
    }),
    [setRef, titleId, onKeyDown, onOverlayClick]
  );

  return { dialogProps, titleId };
}

export default useModal;
