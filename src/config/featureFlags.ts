export type FeatureFlagKey =
  | 'trust_pricing_consistency'
  | 'try_real_generation'
  | 'cleanup_confidence_ui'
  | 'route_link_stability';

const STORAGE_PREFIX = 'studioai_ff_';
const STICKY_SEED_KEY = 'studioai_ff_seed';
const DEFAULT_PERCENT_PROD = 10;

const DEFAULTS: Record<FeatureFlagKey, boolean> = {
  trust_pricing_consistency: true,
  try_real_generation: true,
  cleanup_confidence_ui: true,
  route_link_stability: true,
};

function getStickySeed(): string {
  try {
    const existing = localStorage.getItem(STICKY_SEED_KEY);
    if (existing) return existing;
    const generated = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(STICKY_SEED_KEY, generated);
    return generated;
  } catch {
    return 'seed-fallback';
  }
}

function hashToBucket(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 100;
}

function readUrlOverride(key: FeatureFlagKey): boolean | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(`ff_${key}`);
  if (!raw) return null;
  if (raw === '1' || raw === 'on' || raw === 'true') return true;
  if (raw === '0' || raw === 'off' || raw === 'false') return false;
  return null;
}

function readLocalOverride(key: FeatureFlagKey): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    if (raw === '1' || raw === 'on' || raw === 'true') return true;
    if (raw === '0' || raw === 'off' || raw === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function envPercent(key: FeatureFlagKey): number {
  const envKey = `VITE_FF_PERCENT_${key.toUpperCase()}` as const;
  const raw = (import.meta.env as Record<string, string | undefined>)[envKey];
  const n = raw ? Number(raw) : Number.NaN;
  if (Number.isFinite(n)) {
    return Math.max(0, Math.min(100, n));
  }
  return DEFAULT_PERCENT_PROD;
}

function inRolloutPercent(key: FeatureFlagKey, seed?: string): boolean {
  if (!import.meta.env.PROD) return true;
  const pct = envPercent(key);
  const bucket = hashToBucket(`${key}:${seed || getStickySeed()}`);
  return bucket < pct;
}

export function getFeatureFlag(key: FeatureFlagKey, opts?: { seed?: string }): boolean {
  const urlOverride = readUrlOverride(key);
  if (urlOverride !== null) return urlOverride;

  const localOverride = readLocalOverride(key);
  if (localOverride !== null) return localOverride;

  const base = DEFAULTS[key];
  if (!base) return false;
  return inRolloutPercent(key, opts?.seed);
}

export function setFeatureFlagOverride(key: FeatureFlagKey, enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, enabled ? 'true' : 'false');
  } catch {
    // ignore localStorage failures
  }
}

export function clearFeatureFlagOverride(key: FeatureFlagKey): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    // ignore localStorage failures
  }
}
