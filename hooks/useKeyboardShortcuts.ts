/**
 * useKeyboardShortcuts.ts — Centralized editor keyboard shortcut handler.
 *
 * R27 scope:
 *   - Escape         — generic cancel / close
 *   - ⌘S / Ctrl+S    — save current render
 *   - ⌘E / Ctrl+E    — export
 *   - ⌘Enter         — generate / apply primary action
 *   - [ / ]          — previous / next photo in session queue
 *   - ?              — open help / shortcuts reference
 *   - Space (hold)   — before-and-after peek (onDown / onUp pair)
 *
 * Design notes:
 *   - We ignore shortcuts when focus is in an editable field (input, textarea,
 *     contenteditable) UNLESS the shortcut uses a modifier (⌘/Ctrl).  That way
 *     ⌘S still saves while typing, but `[`/`]` and `?` don't fire mid-word.
 *   - Callbacks are all optional — pass only the ones your screen cares about.
 *   - Pass `enabled={false}` to disable the whole suite (e.g. on marketing
 *     pages, or when a blocking modal is open).
 */

import { useEffect, useRef } from 'react';

export interface KeyboardShortcutHandlers {
  onEscape?: () => void;
  onSave?: () => void;
  onExport?: () => void;
  onGenerate?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onHelp?: () => void;
  /** Called when Space is pressed (not repeat). */
  onSpaceDown?: () => void;
  /** Called when Space is released. */
  onSpaceUp?: () => void;
}

export interface UseKeyboardShortcutsOptions extends KeyboardShortcutHandlers {
  enabled?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts({
  enabled = true,
  onEscape,
  onSave,
  onExport,
  onGenerate,
  onPrev,
  onNext,
  onHelp,
  onSpaceDown,
  onSpaceUp,
}: UseKeyboardShortcutsOptions): void {
  // Stable refs so the effect below doesn't rebind on every parent render.
  const handlersRef = useRef<KeyboardShortcutHandlers>({});
  handlersRef.current = {
    onEscape,
    onSave,
    onExport,
    onGenerate,
    onPrev,
    onNext,
    onHelp,
    onSpaceDown,
    onSpaceUp,
  };

  // Track Space key to avoid firing onSpaceDown multiple times on key-repeat.
  const spaceDownRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const editable = isEditableTarget(e.target);
      const h = handlersRef.current;

      // Escape — always fires (even in inputs, so "Esc to close" works
      // from a focused textarea).
      if (e.key === 'Escape') {
        if (h.onEscape) {
          h.onEscape();
          // Don't preventDefault — Escape has native meaning (blur, close
          // browser search, etc) and intercepting it is hostile.
        }
        return;
      }

      // Modifier shortcuts: ⌘S / ⌘E / ⌘Enter.  Fire even in inputs.
      if (mod) {
        const key = e.key.toLowerCase();
        if (key === 's' && h.onSave) {
          e.preventDefault();
          h.onSave();
          return;
        }
        if (key === 'e' && h.onExport) {
          e.preventDefault();
          h.onExport();
          return;
        }
        if (e.key === 'Enter' && h.onGenerate) {
          e.preventDefault();
          h.onGenerate();
          return;
        }
        return;
      }

      // Non-modifier shortcuts: skip when typing.
      if (editable) return;

      if (e.key === '[') {
        if (h.onPrev) {
          e.preventDefault();
          h.onPrev();
        }
        return;
      }
      if (e.key === ']') {
        if (h.onNext) {
          e.preventDefault();
          h.onNext();
        }
        return;
      }
      if (e.key === '?') {
        if (h.onHelp) {
          e.preventDefault();
          h.onHelp();
        }
        return;
      }
      if (e.code === 'Space' || e.key === ' ') {
        if (h.onSpaceDown && !spaceDownRef.current) {
          spaceDownRef.current = true;
          e.preventDefault(); // prevent page scroll
          h.onSpaceDown();
        } else if (e.repeat) {
          e.preventDefault();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!enabled) return;
      if ((e.code === 'Space' || e.key === ' ') && spaceDownRef.current) {
        spaceDownRef.current = false;
        handlersRef.current.onSpaceUp?.();
      }
    };

    // When the window loses focus, treat Space as released so we don't get
    // stuck in "before/after peek" mode.
    const onBlur = () => {
      if (spaceDownRef.current) {
        spaceDownRef.current = false;
        handlersRef.current.onSpaceUp?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled]);
}

/**
 * A static reference list we can render in a help modal.  Keep in sync with
 * the handler code above.
 */
export const KEYBOARD_SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'Esc', label: 'Close / cancel' },
  { keys: '⌘ S', label: 'Save current render' },
  { keys: '⌘ E', label: 'Export' },
  { keys: '⌘ Enter', label: 'Generate / apply' },
  { keys: '[', label: 'Previous photo' },
  { keys: ']', label: 'Next photo' },
  { keys: '?', label: 'Show this help' },
  { keys: 'Hold Space', label: 'Peek before/after' },
];

export default useKeyboardShortcuts;
