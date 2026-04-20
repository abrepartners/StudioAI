export type CleanupRiskLevel = 'safe' | 'review' | 'high';

export type CleanupCompositeMode =
  | 'applied'
  | 'skipped_restage_prompt'
  | 'skipped_not_cleanup'
  | 'fallback_raw_after_error'
  | 'not_applicable';

export interface CleanupQualitySignal {
  risk: CleanupRiskLevel;
  alignmentOverlap: number | null;
  compositeMode: CleanupCompositeMode;
  reason: string;
  source: 'single' | 'furniture' | 'batch' | 'listing-kit';
  nextActions: string[];
  timestamp: number;
}

export function buildCleanupSignal(input: {
  risk: CleanupRiskLevel;
  source: CleanupQualitySignal['source'];
  reason: string;
  alignmentOverlap?: number | null;
  compositeMode?: CleanupCompositeMode;
  nextActions?: string[];
}): CleanupQualitySignal {
  return {
    risk: input.risk,
    source: input.source,
    reason: input.reason,
    alignmentOverlap: input.alignmentOverlap ?? null,
    compositeMode: input.compositeMode ?? 'not_applicable',
    nextActions: input.nextActions ?? [],
    timestamp: Date.now(),
  };
}
