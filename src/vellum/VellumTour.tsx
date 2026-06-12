import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import "./tour.css";

/**
 * VellumTour — first-run spotlight coach marks for the photo editor.
 *
 * A dark scrim (drawn by the highlight box's 9999px box-shadow) with a
 * cutout around the current step's target, plus a floating card clamped
 * inside the viewport. Steps whose selector matches nothing visible are
 * skipped at runtime, so the tour works in both the empty (upload zone)
 * and loaded editor states, on desktop and at 393px.
 *
 * Persistence: localStorage `vellum_tour_seen` — set by Done, Skip tour,
 * and Don't-show-again alike. Settings → Workspace → "Replay tutorial"
 * clears the key and routes back to the photo page.
 */

export const TOUR_SEEN_KEY = "vellum_tour_seen";

interface TourStep {
  selector: string;
  fallbackSelector?: string;
  /** Used instead of `selector` at ≤900px (e.g. dock button instead of a
      closed bottom sheet — we never open sheets on the user's behalf). */
  mobileSelector?: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    // Empty editor shows the dropzone; once photos exist the filmstrip
    // becomes the anchor for "your photos live here".
    selector: ".v-upload-zone",
    fallbackSelector: ".v-thumb-strip",
    title: "Start with your photos",
    body: "Drop raw listing photos here — up to 50 per batch. Vellum detects each room automatically.",
  },
  {
    selector: ".v-subtabs",
    title: "Three ways to review",
    body: "Flip between a before / after compare, the full photo grid, and a single-photo close-up.",
  },
  {
    selector: ".v-preset-row",
    title: "Pick a look",
    body: "Every tool ships with curated presets. Choose one and Vellum handles the prompt details.",
  },
  {
    selector: ".v-editor-actions .v-btn--primary",
    title: "Apply the edit",
    body: "One click refines the selected photo. The credit cost is always shown before you commit.",
  },
  {
    selector: ".v-editor-left",
    mobileSelector: ".v-mobile-tabbar button:first-child",
    title: "Your toolkit",
    body: "Staging, decluttering, twilight, sky replacement and more. Tools grey out when they don't fit the photo.",
  },
  {
    selector: ".v-credits-chip",
    title: "Keep an eye on credits",
    body: "Each edit costs credits. Tap here any time to check your balance or top up.",
  },
];

const SPOT_PAD = 6; // px of breathing room around the target
const CARD_GAP = 14; // px between spotlight and card
const EDGE = 12; // viewport clamp margin

function isElementVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  // A closed mobile bottom sheet is translated fully below the viewport —
  // never spotlight something the user can't see.
  if (r.top >= window.innerHeight || r.bottom <= 0) return false;
  return true;
}

function resolveTarget(step: TourStep): HTMLElement | null {
  const isMobile = window.matchMedia("(max-width: 900px)").matches;
  const selectors = [
    isMobile && step.mobileSelector ? step.mobileSelector : step.selector,
    step.fallbackSelector,
  ].filter((s): s is string => !!s);
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && isElementVisible(el)) return el;
  }
  return null;
}

interface TourProps {
  active: boolean;
}

const VellumTour: React.FC<TourProps> = ({ active }) => {
  const [running, setRunning] = useState(false);
  // Indices into STEPS that had a visible target when the tour started.
  const [visibleSteps, setVisibleSteps] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const cardRef = useRef<HTMLDivElement>(null);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(TOUR_SEEN_KEY, "true");
    } catch {
      /* private mode — tour will simply re-offer next visit */
    }
    setRunning(false);
    setRect(null);
    setCardPos(null);
  }, []);

  // Auto-start on the photo page when the seen-flag is absent. The editor
  // is lazy-loaded, so retry a few times until its DOM exists.
  useEffect(() => {
    if (!active) {
      setRunning(false);
      setRect(null);
      setCardPos(null);
      return;
    }
    let seen = false;
    try {
      seen = !!localStorage.getItem(TOUR_SEEN_KEY);
    } catch {
      seen = true;
    }
    if (seen) return;

    let attempts = 0;
    let timer: number;
    const tryStart = () => {
      const matched = STEPS.map((s, i) => (resolveTarget(s) ? i : -1)).filter(
        (i) => i >= 0,
      );
      if (matched.length > 0) {
        setVisibleSteps(matched);
        setPos(0);
        setRunning(true);
      } else if (++attempts < 8) {
        timer = window.setTimeout(tryStart, 500);
      }
    };
    timer = window.setTimeout(tryStart, 600);
    return () => window.clearTimeout(timer);
  }, [active]);

  const advance = useCallback(() => {
    setPos((current) => {
      for (let p = current + 1; p < visibleSteps.length; p++) {
        if (resolveTarget(STEPS[visibleSteps[p]])) return p;
      }
      // Nothing left — finish via microtask so we don't setState twice here.
      window.setTimeout(finish, 0);
      return current;
    });
  }, [visibleSteps, finish]);

  // On step entry: bring the target into view once, then measure.
  useEffect(() => {
    if (!running) return;
    const step = STEPS[visibleSteps[pos]];
    if (!step) return;
    const el = resolveTarget(step);
    if (!el) {
      advance();
      return;
    }
    try {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {
      /* older engines */
    }
    setRect(el.getBoundingClientRect());
  }, [running, pos, visibleSteps, advance]);

  // Keep the spotlight glued to the target through resize and any scroll
  // (capture phase catches the editor's internal scroll containers).
  useEffect(() => {
    if (!running) return;
    const update = () => {
      const step = STEPS[visibleSteps[pos]];
      if (!step) return;
      const el = resolveTarget(step);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [running, pos, visibleSteps]);

  // Escape = skip.
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, finish]);

  // Place the card near the spotlight, clamped inside the viewport —
  // below the target when there's room, above otherwise.
  useLayoutEffect(() => {
    if (!running || !rect || !cardRef.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = cardRef.current.offsetWidth;
    const ch = cardRef.current.offsetHeight;

    let top: number;
    if (rect.bottom + SPOT_PAD + CARD_GAP + ch <= vh - EDGE) {
      top = rect.bottom + SPOT_PAD + CARD_GAP;
    } else if (rect.top - SPOT_PAD - CARD_GAP - ch >= EDGE) {
      top = rect.top - SPOT_PAD - CARD_GAP - ch;
    } else {
      top = Math.max(EDGE, Math.min(vh - ch - EDGE, rect.bottom + CARD_GAP));
    }
    const left = Math.max(
      EDGE,
      Math.min(vw - cw - EDGE, rect.left + rect.width / 2 - cw / 2),
    );
    setCardPos({ top, left });
  }, [running, rect, pos]);

  if (!active || !running || !rect) return null;

  const step = STEPS[visibleSteps[pos]];
  if (!step) return null;
  const isLast = pos === visibleSteps.length - 1;

  return (
    <>
      <div className="v-tour-blocker" aria-hidden="true" />
      <div
        className="v-tour-spot"
        aria-hidden="true"
        style={{
          top: rect.top - SPOT_PAD,
          left: rect.left - SPOT_PAD,
          width: rect.width + SPOT_PAD * 2,
          height: rect.height + SPOT_PAD * 2,
        }}
      />
      <div
        ref={cardRef}
        className="v-tour-card"
        role="dialog"
        aria-label={`Tour step ${pos + 1} of ${visibleSteps.length}: ${step.title}`}
        style={
          cardPos
            ? { top: cardPos.top, left: cardPos.left }
            : { top: -9999, left: -9999 }
        }
      >
        <div className="v-tour-eyebrow">
          Tour · {pos + 1} of {visibleSteps.length}
        </div>
        <h3 className="v-tour-title">{step.title}</h3>
        <p className="v-tour-body">{step.body}</p>
        <div className="v-tour-actions">
          <button
            className="v-tour-btn v-tour-btn--primary"
            onClick={isLast ? finish : advance}
          >
            {isLast ? "Done" : "Next"}
          </button>
          <button className="v-tour-btn v-tour-btn--ghost" onClick={finish}>
            Skip tour
          </button>
          <button className="v-tour-quiet" onClick={finish}>
            Don't show this again
          </button>
        </div>
      </div>
    </>
  );
};

export default VellumTour;
