import React, { useEffect, useRef, useState } from "react";
import "./tour.css";

/**
 * VellumNextSteps — contextual "what's next" suggestions.
 *
 * Listens for the `vellum:gen-complete` CustomEvent the photo editor
 * dispatches after each successful generation. The first time a given
 * tool completes in a session, a small dismissible card appears
 * (bottom-right on desktop, above the dock on mobile) offering 2-3
 * short follow-up ideas. Pure guidance — no editor wiring.
 *
 * Opt-out: localStorage `vellum_suggestions_off` (set by the card's
 * "Don't suggest again" button, respected on every event).
 */

export const SUGGESTIONS_OFF_KEY = "vellum_suggestions_off";
const AUTO_DISMISS_MS = 20000;

interface Suggestion {
  headline: string;
  tips: string[];
}

const SUGGESTIONS: Record<string, Suggestion> = {
  staging: {
    headline: "Staged.",
    tips: [
      "Try Twilight on your exterior shots — dusk covers get more clicks.",
      "Export MLS-ready sizes from Export & Create.",
      "Apply this style to all photos at once with “Apply to all”.",
    ],
  },
  declutter: {
    headline: "Decluttered.",
    tips: [
      "Now stage the cleaned room — empty spaces photograph cold.",
      "Run Daylight & white balance for an even, warm exposure.",
      "Repeat across the set with “Apply to all”.",
    ],
  },
  whiten: {
    headline: "Balanced.",
    tips: [
      "Stage the room next — corrected light makes furniture sit naturally.",
      "Export MLS-ready sizes from Export & Create.",
    ],
  },
  renovation: {
    headline: "Renovated.",
    tips: [
      "Generate a before / after reveal video for social.",
      "Export MLS-ready sizes from Export & Create.",
    ],
  },
  twilight: {
    headline: "Twilight applied.",
    tips: [
      "Twilight shots make strong listing covers — lead with this one.",
      "Export MLS-ready sizes from Export & Create.",
      "Build a social pack with platform crops in one click.",
    ],
  },
  sky: {
    headline: "Sky replaced.",
    tips: [
      "Pair it with Lawn & landscape for a fully polished exterior.",
      "Export MLS-ready sizes from Export & Create.",
    ],
  },
  lawn: {
    headline: "Landscaped.",
    tips: [
      "Try Twilight conversion on the same shot for a dusk cover.",
      "Export MLS-ready sizes from Export & Create.",
    ],
  },
};

const DEFAULT_SUGGESTION: Suggestion = {
  headline: "Done.",
  tips: [
    "Export MLS-ready sizes from Export & Create.",
    "Generate a before / after reveal video for social.",
  ],
};

interface NextStepsProps {
  active: boolean;
}

const VellumNextSteps: React.FC<NextStepsProps> = ({ active }) => {
  // First-completion-per-tool gate, session-scoped.
  const seenTools = useRef<Set<string>>(new Set());
  const [card, setCard] = useState<{ tool: string; expanded: boolean } | null>(
    null,
  );

  useEffect(() => {
    const onComplete = (e: Event) => {
      const tool = (e as CustomEvent).detail?.tool;
      if (!tool || typeof tool !== "string") return;
      try {
        if (localStorage.getItem(SUGGESTIONS_OFF_KEY)) return;
      } catch {
        /* storage unavailable — keep suggesting */
      }
      if (seenTools.current.has(tool)) return;
      seenTools.current.add(tool);
      setCard({ tool, expanded: false });
    };
    window.addEventListener("vellum:gen-complete", onComplete);
    return () => window.removeEventListener("vellum:gen-complete", onComplete);
  }, []);

  // Leaving the photo page dismisses the card.
  useEffect(() => {
    if (!active) setCard(null);
  }, [active]);

  // Auto-dismiss if untouched; expanding cancels the timer.
  useEffect(() => {
    if (!card || card.expanded) return;
    const t = window.setTimeout(() => setCard(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [card]);

  if (!active || !card) return null;

  const s = SUGGESTIONS[card.tool] || DEFAULT_SUGGESTION;

  const disableForever = () => {
    try {
      localStorage.setItem(SUGGESTIONS_OFF_KEY, "true");
    } catch {
      /* ignore */
    }
    setCard(null);
  };

  return (
    <div className="v-next-card" role="status">
      {!card.expanded ? (
        <div className="v-next-row">
          <span className="v-next-msg">
            <span className="v-next-spark">✦</span>
            {s.headline} Want ideas for what's next?
          </span>
          <button
            className="v-tour-btn v-tour-btn--primary"
            onClick={() => setCard({ ...card, expanded: true })}
          >
            Show me
          </button>
          <button
            className="v-next-x"
            aria-label="Dismiss suggestion"
            onClick={() => setCard(null)}
          >
            ✕
          </button>
        </div>
      ) : (
        <div>
          <div className="v-next-head">
            <span className="v-next-title">What's next</span>
            <button
              className="v-next-x"
              aria-label="Dismiss suggestion"
              onClick={() => setCard(null)}
            >
              ✕
            </button>
          </div>
          <ul className="v-next-tips">
            {s.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <button className="v-tour-quiet" onClick={disableForever}>
            Don't suggest again
          </button>
        </div>
      )}
    </div>
  );
};

export default VellumNextSteps;
