import React, { useState } from 'react';
import { Sparkles, Loader2, Wand2, ArrowRight } from 'lucide-react';
import { analyzeAndRecommendStyles, StyleRecommendation } from '../services/geminiService';
import { FurnitureRoomType } from '../types';

interface StyleAdvisorProps {
  imageBase64: string | null;
  roomType: FurnitureRoomType;
  onApplyStyle: (prompt: string) => void;
}

const StyleAdvisor: React.FC<StyleAdvisorProps> = ({ imageBase64, roomType, onApplyStyle }) => {
  const [recommendations, setRecommendations] = useState<StyleRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const handleAnalyze = async () => {
    if (!imageBase64) return;
    setIsLoading(true);
    try {
      const results = await analyzeAndRecommendStyles(imageBase64, roomType);
      setRecommendations(results);
      setHasAnalyzed(true);
    } catch (err) {
      console.error('Style analysis failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-zinc-400';
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
        {!hasAnalyzed && (
          <button
            onClick={handleAnalyze}
            disabled={isLoading}
            className="cta-secondary px-3 py-1.5 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Wand2 size={12} />
                Get Recommendations
              </>
            )}
          </button>
        )}
      </div>

      {recommendations.length > 0 && (
        <div className="space-y-2">
          {recommendations.map((rec, idx) => (
            <div
              key={idx}
              className="rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)] p-3 space-y-2 hover:border-[var(--color-primary-dark)] transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{rec.style}</span>
                <span className={`text-xs font-mono font-bold ${getConfidenceColor(rec.confidence)}`}>
                  {rec.confidence}%
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{rec.reasoning}</p>
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

      {hasAnalyzed && recommendations.length > 0 && (
        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="w-full text-center text-xs text-zinc-500 hover:text-[var(--color-primary)] transition-colors py-1"
        >
          {isLoading ? 'Re-analyzing...' : 'Re-analyze'}
        </button>
      )}
    </div>
  );
};

export default StyleAdvisor;
