/**
 * shared/vocab.ts — the canonical vocabulary for Vellum work.
 *
 * ONE definition of what a tool is called, where a request came from, and what
 * state a job is in. Imported by the web app, by api/jobs.ts, and enforced a
 * second time by CHECK constraints on public.vellum_jobs (migration
 * `vellum_jobs_spine`, 2026-07-15). Code and database must agree — if you add a
 * value here you MUST also migrate the constraint, and vice versa.
 *
 * Why this file exists: by 2026-07-15 the web app was logging `magicedit` while
 * the Telegram conductor called the same tool `magic`. Two names for one thing,
 * six weeks in, with nothing to stop a third. This is that stop.
 */

/** Every tool that can produce a generation. Values match generation_logs.tool. */
export const TOOLS = [
  "staging", // Virtual Staging — fill / restage a room
  "declutter", // Smart Cleanup — remove clutter, keep the room
  "magicedit", // Magic Edit — free-text catch-all instruction
  "twilight", // Twilight — day to dusk
  "sky", // Sky Replacement
  "whiten", // Whiten / brighten
  "lawn", // Lawn repair
  "renovation", // Virtual Renovation — finish swaps
  "morph", // Property morph reel
] as const;
export type Tool = (typeof TOOLS)[number];

/**
 * Where a request originated. `source` is how internal/automated traffic is kept
 * out of a customer's usage dashboard (api/usage.ts filters to source=app).
 */
export const SOURCES = [
  "app", // the Vellum web app
  "henry", // the Telegram conductor on the Mac Mini
  "api-v1", // future public API
  "mobile", // future phone app
  "qa-harness", // dev traffic
] as const;
export type Source = (typeof SOURCES)[number];

/**
 * Job lifecycle. `review` is load-bearing: it means a human has to act, which
 * makes "what did we drop?" a query instead of a memory.
 *
 *   queued → running → review → approved → delivered
 *                        ↓                     ↑
 *                     rejected             (upload ok)
 *   any → failed
 */
export const STATUSES = [
  "queued", // accepted, not started
  "running", // generating
  "review", // waiting on a human — the drop-catcher
  "approved", // human said yes, upload in flight
  "delivered", // live on the listing
  "rejected", // human said no; nothing uploaded
  "failed", // errored out
] as const;
export type Status = (typeof STATUSES)[number];

/** Terminal states — a job here will never move again. */
export const TERMINAL_STATUSES: readonly Status[] = [
  "delivered",
  "rejected",
  "failed",
];

/**
 * Telegram keywords → canonical tool. The word a human types is UI, not
 * vocabulary; it is allowed to be friendlier than the stored value. Henry's
 * `magic` keyword maps here rather than inventing a tenth tool name.
 */
export const KEYWORD_TO_TOOL: Record<string, Tool> = {
  magic: "magicedit",
  edit: "magicedit",
  magicedit: "magicedit",
  stage: "staging",
  staging: "staging",
  declutter: "declutter",
  cleanup: "declutter",
  twilight: "twilight",
  sky: "sky",
  whiten: "whiten",
  lawn: "lawn",
  renovation: "renovation",
  morph: "morph",
};

/**
 * Engine label → the Replicate model behind it, keyed by tool.
 *
 * A tool endpoint reports the engine it ACTUALLY ran, after any runtime
 * fallback. That distinction is the whole reason cost can be honest:
 * flux-staging silently falls nano-banana → seedream → flux-fill, and those are
 * ~14c / ~6c / ~10c. Only the endpoint knows which one survived, so a static
 * tool→model guess would be wrong exactly when a fallback fired — the moment
 * you'd most want to know.
 *
 * Keyed by tool because the labels collide across endpoints: flux-cleanup's
 * "reve" is Kontext (a legacy name, kept), and flux-staging's "nano-banana" and
 * flux-cleanup's "nano" are the same model under two names.
 */
export const ENGINE_MODEL: Partial<Record<Tool, Record<string, string>>> = {
  staging: {
    "nano-banana": "google/nano-banana-pro",
    seedream: "bytedance/seedream-4",
    "flux-fill": "black-forest-labs/flux-fill-pro",
  },
  declutter: {
    nano: "google/nano-banana-pro",
    bria: "bria/fibo-edit",
    reve: "black-forest-labs/flux-kontext-pro",
  },
  magicedit: {
    "flux-kontext-pro": "black-forest-labs/flux-kontext-pro",
  },
};

/** Resolve what actually ran. Returns null rather than guessing. */
export function modelFor(tool: unknown, engine: unknown): string | null {
  if (!isTool(tool)) return null;
  const map = ENGINE_MODEL[tool];
  if (!map) return null;
  return map[String(engine ?? "").toLowerCase()] ?? null;
}

export const isTool = (v: unknown): v is Tool =>
  typeof v === "string" && (TOOLS as readonly string[]).includes(v);
export const isSource = (v: unknown): v is Source =>
  typeof v === "string" && (SOURCES as readonly string[]).includes(v);
export const isStatus = (v: unknown): v is Status =>
  typeof v === "string" && (STATUSES as readonly string[]).includes(v);
export const isTerminal = (v: unknown): boolean =>
  isStatus(v) && TERMINAL_STATUSES.includes(v);

/** Resolve a human keyword to a canonical tool. Returns null if unknown. */
export function toolFromKeyword(word: unknown): Tool | null {
  if (typeof word !== "string") return null;
  return KEYWORD_TO_TOOL[word.trim().toLowerCase()] ?? null;
}
