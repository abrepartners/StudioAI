import { track } from '@vercel/analytics';
import type { CleanupRiskLevel } from '../types/cleanupQuality';

export type StudioAIEvent =
  | 'try_started'
  | 'try_succeeded'
  | 'try_failed'
  | 'pricing_viewed'
  | 'checkout_started'
  | 'cleanup_risk_high'
  | 'cleanup_retried';

type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(event: StudioAIEvent, payload?: AnalyticsPayload): void {
  try {
    track(event, payload);
  } catch {
    // never block UX on analytics
  }
}

export function trackCleanupRisk(risk: CleanupRiskLevel, payload?: AnalyticsPayload): void {
  if (risk === 'high') {
    trackEvent('cleanup_risk_high', payload);
  }
}
