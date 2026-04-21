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
  qualityScore: number | null;
  compositeMode: CleanupCompositeMode;
  reason: string;
  source: 'single' | 'furniture' | 'batch' | 'listing-kit';
  nextActions: string[];
  timestamp: number;
}

const RISK_PRIORITY: Record<CleanupRiskLevel, number> = {
  safe: 0,
  review: 1,
  high: 2,
};

export function mergeCleanupRisk(
  ...risks: Array<CleanupRiskLevel | null | undefined>
): CleanupRiskLevel {
  let resolved: CleanupRiskLevel = 'safe';
  for (const risk of risks) {
    if (!risk) continue;
    if (RISK_PRIORITY[risk] > RISK_PRIORITY[resolved]) {
      resolved = risk;
    }
  }
  return resolved;
}

export function cleanupRiskFromQualityScore(
  qualityScore: number | null | undefined
): CleanupRiskLevel | null {
  if (typeof qualityScore !== 'number' || Number.isNaN(qualityScore)) return null;
  if (qualityScore < 4.5) return 'high';
  if (qualityScore < 7) return 'review';
  return 'safe';
}

export function buildCleanupSignal(input: {
  risk: CleanupRiskLevel;
  source: CleanupQualitySignal['source'];
  reason: string;
  alignmentOverlap?: number | null;
  qualityScore?: number | null;
  compositeMode?: CleanupCompositeMode;
  nextActions?: string[];
}): CleanupQualitySignal {
  return {
    risk: input.risk,
    source: input.source,
    reason: input.reason,
    alignmentOverlap: input.alignmentOverlap ?? null,
    qualityScore: input.qualityScore ?? null,
    compositeMode: input.compositeMode ?? 'not_applicable',
    nextActions: input.nextActions ?? [],
    timestamp: Date.now(),
  };
}
