/**
 * services/listingBatchService.ts
 *
 * Client wrapper for the Listing Batch Pipeline (/api/listing-batch/*).
 *
 * Vercel caps request bodies at 4.5MB, so photos are uploaded one per request:
 * startBatch() runs the init → photo × N → begin handshake, then pollBatch()
 * drives the one-photo-per-poll pump in /api/listing-batch/status. runBatch()
 * is the whole pipeline behind a single call with progress callbacks.
 */
import { resizeForUpload } from "../utils/resizeForUpload";

const UPLOAD_MAX_EDGE = 1280;
const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 300;

export interface BatchPhotoMeta {
  index: number;
  status: "queued" | "processing" | "completed" | "failed";
  location: string | null;
  room: string | null;
  empty: boolean | null;
  tool: string | null;
  has_result: boolean;
  error: string | null;
}

export interface BatchListingCopy {
  headline: string;
  description: string;
  social_caption: string;
  hashtags: string[];
}

export interface BatchProgress {
  total: number;
  uploaded?: number;
  completed: number;
  failed: number;
  current_photo: number | null;
  current_step: string;
}

export interface BatchStatus {
  jobId: string;
  status:
    | "queued"
    | "classifying"
    | "processing"
    | "generating_text"
    | "completed"
    | "failed";
  progress: BatchProgress;
  photos: BatchPhotoMeta[];
  listing_copy: BatchListingCopy | null;
  error: string | null;
}

// ── Last batch summary (dashboard "what happened" card) ──────────────────────
const LAST_BATCH_KEY = "vellum_last_batch_summary";

export interface LastBatchSummary {
  completedAt: string;
  total: number;
  staged: number;
  decluttered: number;
  brightened: number;
  exteriors: number;
  failed: number;
  copyReady: boolean;
}

/** Persist a completed batch's shape so the dashboard can recap it. */
export function writeLastBatchSummary(status: BatchStatus): void {
  const byTool = (tool: string) =>
    status.photos.filter((p) => p.status === "completed" && p.tool === tool)
      .length;
  const summary: LastBatchSummary = {
    completedAt: new Date().toISOString(),
    total: status.photos.length,
    staged: byTool("staging"),
    decluttered: byTool("declutter"),
    brightened: byTool("whiten"),
    exteriors: byTool("exterior"),
    failed: status.photos.filter((p) => p.status === "failed").length,
    copyReady: Boolean(status.listing_copy),
  };
  try {
    localStorage.setItem(LAST_BATCH_KEY, JSON.stringify(summary));
  } catch {
    /* storage unavailable */
  }
}

export function readLastBatchSummary(): LastBatchSummary | null {
  try {
    const raw = localStorage.getItem(LAST_BATCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.total !== "number") return null;
    return parsed as LastBatchSummary;
  } catch {
    return null;
  }
}

async function post(body: Record<string, unknown>): Promise<any> {
  const res = await fetch("/api/listing-batch/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok)
    throw new Error(data.error || `listing-batch HTTP ${res.status}`);
  return data;
}

/**
 * Upload 1-30 photos (base64 or data URLs) and kick off processing.
 * Returns the jobId once the server has accepted the batch; the heavy
 * classify-and-process-first-photo step runs server-side after this resolves
 * (fired here, tracked by the subsequent polls).
 */
export async function startBatch(
  photos: string[],
  onUploadProgress?: (uploaded: number, total: number) => void,
): Promise<{ jobId: string; beginPromise: Promise<void> }> {
  if (!photos.length) throw new Error("no photos to process");
  const { jobId } = await post({ action: "init", total: photos.length });

  for (let i = 0; i < photos.length; i++) {
    const shrunk = await resizeForUpload(photos[i], UPLOAD_MAX_EDGE);
    await post({ action: "photo", jobId, index: i, photo: shrunk });
    onUploadProgress?.(i + 1, photos.length);
  }

  // begin classifies everything and processes photo 1 inline; it can run for
  // minutes, so the caller polls for progress while this promise is in flight.
  const beginPromise = post({ action: "begin", jobId }).then(() => undefined);
  return { jobId, beginPromise };
}

/** One status poll. Also advances the pipeline server-side (the pump). */
export async function pollBatch(jobId: string): Promise<BatchStatus> {
  const res = await fetch(
    `/api/listing-batch/status?id=${encodeURIComponent(jobId)}`,
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok)
    throw new Error(data.error || `listing-batch status HTTP ${res.status}`);
  return {
    jobId: data.jobId,
    status: data.status,
    progress: data.progress || {},
    photos: data.photos || [],
    listing_copy: data.listing_copy || null,
    error: data.error || null,
  };
}

/** Fetch one processed photo result (base64 data URL), or null if absent. */
export async function fetchPhotoResult(
  jobId: string,
  index: number,
): Promise<string | null> {
  const res = await fetch(
    `/api/listing-batch/status?id=${encodeURIComponent(jobId)}&photo=${index}`,
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok)
    throw new Error(data.error || `photo result HTTP ${res.status}`);
  return data.result_base64 || null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Convenience: run the whole pipeline. Uploads, starts processing, then polls
 * every 4 seconds (max 300 polls) until the batch completes or fails.
 */
export async function runBatch(
  photos: string[],
  callbacks?: {
    onUploadProgress?: (uploaded: number, total: number) => void;
    onStatus?: (status: BatchStatus) => void;
  },
): Promise<BatchStatus> {
  const { jobId, beginPromise } = await startBatch(
    photos,
    callbacks?.onUploadProgress,
  );
  let beginError: Error | null = null;
  beginPromise.catch((e) => {
    beginError = e instanceof Error ? e : new Error(String(e));
  });

  let last: BatchStatus | null = null;
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);
    try {
      last = await pollBatch(jobId);
    } catch (e) {
      // Transient poll failure: keep going, the job is server-side.
      console.warn("[listingBatch] poll failed:", e);
      continue;
    }
    callbacks?.onStatus?.(last);
    if (last.status === "completed" || last.status === "failed") return last;
    // If begin died and the job never left the upload stage, surface it.
    if (beginError && last.status === "queued") throw beginError;
  }
  throw new Error("batch timed out after 20 minutes of polling");
}
