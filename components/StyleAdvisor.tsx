/**
 * StyleAdvisor.tsx
 *
 * Style recommendations previously ran a browser-side Gemini call
 * (analyzeAndRecommendStyles). Browser Gemini is purged — that service is now a
 * disabled stub. This component is gated to a tasteful "coming soon" state so no
 * Gemini call fires and it still renders/closes cleanly. (Legacy surface; not
 * mounted in the live Vellum editor.)
 *
 * TODO: re-enable via a server /api endpoint (Replicate/Claude), then flip
 * COMING_SOON.
 */
import React, { useState } from "react";
import { Sparkles, ArrowRight, Clock } from "lucide-react";
import { StyleRecommendation } from "../services/geminiService";
import { FurnitureRoomType } from "../types";

// Hard gate: keep any browser AI call from firing.
const COMING_SOON = true;

interface StyleAdvisorProps {
  imageBase64: string | null;
  roomType: FurnitureRoomType;
  onApplyStyle: (prompt: string) => void;
}

const StyleAdvisor: React.FC<StyleAdvisorProps> = ({
  imageBase64,
  onApplyStyle,
}) => {
  const [recommendations] = useState<StyleRecommendation[]>([]);

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-amber-400";
    return "text-zinc-400";
  };

  if (!imageBase64) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[var(--color-primary)]" />
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)]">
            Style Advisor
          </span>
        </div>
      </div>

      {COMING_SOON && (
        <div className="rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)] px-3 py-3 flex items-start gap-2.5">
          <Clock
            size={14}
            className="text-[var(--color-primary)] mt-0.5 shrink-0"
          />
          <div>
            <p className="text-sm font-semibold text-white">
              Coming soon — moving to Replicate
            </p>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              AI style recommendations are being re-wired to run server-side.
            </p>
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="space-y-2">
          {recommendations.map((rec, idx) => (
            <div
              key={idx}
              className="rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)] p-3 space-y-2 hover:border-[var(--color-primary-dark)] transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">
                  {rec.style}
                </span>
                <span
                  className={`text-xs font-mono font-bold ${getConfidenceColor(rec.confidence)}`}
                >
                  {rec.confidence}%
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {rec.reasoning}
              </p>
              <button
                onClick={() => onApplyStyle(rec.promptSuggestion)}
                className="w-full mt-1 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider bg-black border border-[var(--color-primary-dark)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-black transition-all inline-flex items-center justify-center gap-2"
              >
                Apply This Style
                <ArrowRight size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StyleAdvisor;
