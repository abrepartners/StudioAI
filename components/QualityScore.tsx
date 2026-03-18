import React, { useEffect, useState } from 'react';
import { Shield, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { scoreGeneratedImage, QualityScoreResult } from '../services/geminiService';

interface QualityScoreProps {
  originalImage: string | null;
  generatedImage: string | null;
  roomType: string;
}

const SCORE_COLORS: Record<string, string> = {
  excellent: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  good: 'text-lime-400 border-lime-500/30 bg-lime-500/10',
  fair: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  poor: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const getScoreLevel = (score: number) => {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
};

const getScoreLabel = (score: number) => {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs Work';
};

const ScoreBar: React.FC<{ label: string; score: number }> = ({ label, score }) => {
  const level = getScoreLevel(score);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-medium text-zinc-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            level === 'excellent' ? 'bg-emerald-400' :
            level === 'good' ? 'bg-lime-400' :
            level === 'fair' ? 'bg-amber-400' : 'bg-red-400'
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[10px] font-mono font-bold text-zinc-400 w-8 text-right">{score}</span>
    </div>
  );
};

const QualityScore: React.FC<QualityScoreProps> = ({ originalImage, generatedImage, roomType }) => {
  const [result, setResult] = useState<QualityScoreResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [lastScoredImage, setLastScoredImage] = useState<string | null>(null);

  useEffect(() => {
    if (!originalImage || !generatedImage || generatedImage === lastScoredImage) return;

    const runScore = async () => {
      setIsLoading(true);
      try {
        const score = await scoreGeneratedImage(originalImage, generatedImage, roomType);
        setResult(score);
        setLastScoredImage(generatedImage);
      } catch (err) {
        console.error('Quality scoring failed:', err);
      } finally {
        setIsLoading(false);
      }
    };

    runScore();
  }, [originalImage, generatedImage, roomType, lastScoredImage]);

  if (!generatedImage) return null;

  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-700 bg-black/60 backdrop-blur-sm">
        <Loader2 size={12} className="animate-spin text-[var(--color-primary)]" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Scoring...</span>
      </div>
    );
  }

  if (!result) return null;

  const level = getScoreLevel(result.overall);
  const colorClass = SCORE_COLORS[level];

  return (
    <div className={`rounded-xl border ${colorClass} backdrop-blur-sm transition-all`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <Shield size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">
            Quality: {result.overall}
          </span>
          <span className="text-[10px] font-medium opacity-70">
            {getScoreLabel(result.overall)}
          </span>
        </div>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-current/10 pt-2">
          <ScoreBar label="Architecture" score={result.architecture} />
          <ScoreBar label="Lighting" score={result.lighting} />
          <ScoreBar label="Realism" score={result.realism} />
          <ScoreBar label="Perspective" score={result.perspective} />
          <p className="text-[10px] text-zinc-400 mt-2 leading-relaxed">{result.summary}</p>
        </div>
      )}
    </div>
  );
};

export default QualityScore;
