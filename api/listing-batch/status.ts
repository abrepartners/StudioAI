/**
 * GET /api/listing-batch/status?id=<jobId> — poll a batch AND pump it forward.
 *
 * Each poll processes AT MOST one queued photo (the pipeline pump): Vercel
 * functions can't keep working after responding, so the poll request itself
 * carries the work. While a photo is mid-processing, concurrent polls return
 * the current state immediately; the pumping poll responds when its photo
 * lands. A claim older than STALE_CLAIM_MS (a died invocation) is failed and
 * the pump moves on. When every photo is terminal the pump generates listing
 * copy and completes the job.
 *
 * GET /api/listing-batch/status?id=<jobId>&photo=<n> — fetch one processed
 * result (base64). Results are served per-photo so polls stay small.
 */
import Replicate from "replicate";
import { json } from "../utils.js";
import {
  applyCors,
  requireServiceOrSession,
} from "../_lib/auth-middleware.js";
import { refundQuota } from "../_lib/quota.js";
import { recordBatchGeneration } from "../_lib/batch-usage.js";
import {
  processPhoto,
  generateListingCopy,
  sbSelect,
  patchJob,
  storeResult,
  type PhotoMeta,
} from "../_lib/listing-batch-core.js";

export const config = { runtime: "nodejs", maxDuration: 300 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
/** A photo claimed longer than this belongs to a dead invocation. */
const STALE_CLAIM_MS = 270_000;
/** An init'd job whose uploads never finished — reclaim the reserved quota. */
const STALE_UPLOAD_MS = 30 * 60_000;

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "GET,OPTIONS")) return;
  if (req.method !== "GET")
    return json(res, 405, { ok: false, error: "Method not allowed" });
  const session = await requireServiceOrSession(req, res);
  if (!session) return;
  if (!REPLICATE_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return json(res, 500, { ok: false, error: "backend not configured" });

  const jobId = String(req.query?.id || "");
  if (!jobId) return json(res, 400, { ok: false, error: "id is required" });
  const email = (session as any).service ? "service@vellum.local" : session.email;

  try {
    const rows = await sbSelect(
      `batch_jobs?id=eq.${encodeURIComponent(jobId)}&user_email=eq.${encodeURIComponent(email)}&select=id,status,progress,photos,listing_copy,error,updated_at`,
    );
    const job = rows[0];
    if (!job) return json(res, 404, { ok: false, error: "batch not found" });

    // ── Per-photo result fetch ────────────────────────────────────────────────
    const photoParam = req.query?.photo;
    if (photoParam !== undefined && photoParam !== "") {
      const index = Number(photoParam);
      if (!Number.isInteger(index) || index < 0)
        return json(res, 400, { ok: false, error: "photo must be a non-negative integer" });
      const prows = await sbSelect(
        `batch_photos?batch_id=eq.${encodeURIComponent(jobId)}&photo_index=eq.${index}&select=result_data`,
      );
      return json(res, 200, {
        ok: true,
        result_base64: prows[0]?.result_data || null,
      });
    }

    // ── Stuck-state recovery ─────────────────────────────────────────────────
    // begin() owns the queued→classifying→processing transition; if that
    // invocation dies mid-flight the job is un-pumpable (this endpoint only
    // pumps processing/generating_text) and the init-time reserve leaks.
    // Nothing has been charged or metered before the first photo completes,
    // so a stale classifying/queued job is safe to fail + refund in full.
    const jobAge = Date.now() - Date.parse(job.updated_at || "");
    const stuck =
      (job.status === "classifying" && jobAge > STALE_CLAIM_MS) ||
      (job.status === "queued" && jobAge > STALE_UPLOAD_MS);
    if (stuck) {
      const stuckError =
        job.status === "classifying"
          ? "classification timed out"
          : "upload never completed";
      const quotaCtx = job.progress?.quota || null;
      if (quotaCtx)
        await refundQuota({
          googleId: quotaCtx.google_id,
          amount: Number(job.progress?.total || 0) || 1,
          method: quotaCtx.method,
        });
      await patchJob(jobId, { status: "failed", error: stuckError });
      job.status = "failed";
      job.error = stuckError;
    }

    // ── Pump: advance the pipeline by at most one photo ──────────────────────
    if (job.status === "processing" || job.status === "generating_text") {
      await pump(jobId, job, email);
      // Re-read so the response reflects the work this poll just did.
      const fresh = await sbSelect(
        `batch_jobs?id=eq.${encodeURIComponent(jobId)}&select=id,status,progress,photos,listing_copy,error`,
      );
      if (fresh[0]) Object.assign(job, fresh[0]);
    }

    return json(res, 200, {
      ok: true,
      jobId,
      status: job.status,
      progress: job.progress || {},
      photos: job.photos || [],
      listing_copy: job.listing_copy || null,
      error: job.error || null,
    });
  } catch (err: any) {
    console.error(`[batch-status] ${jobId}:`, err?.message);
    return json(res, 500, { ok: false, error: err?.message || "unknown" });
  }
}

async function pump(jobId: string, job: any, email: string): Promise<void> {
  const photos: PhotoMeta[] = Array.isArray(job.photos) ? job.photos : [];
  if (!photos.length) return;
  const quotaCtx = job.progress?.quota || null;

  // Reclaim a stale in-flight photo (its invocation timed out or died).
  const now = Date.now();
  for (const p of photos) {
    if (p.status === "processing" && p.processing_started) {
      const age = now - Date.parse(p.processing_started);
      if (age > STALE_CLAIM_MS) {
        p.status = "failed";
        p.error = "processing timed out";
        p.processing_started = null;
        if (quotaCtx)
          await refundQuota({
            googleId: quotaCtx.google_id,
            amount: 1,
            method: quotaCtx.method,
          });
      }
    }
  }

  // Another poll is actively working — just report state.
  if (photos.some((p) => p.status === "processing")) {
    await patchJob(jobId, { photos });
    return;
  }

  const next = photos.find((p) => p.status === "queued");

  if (next) {
    // Claim it, then work it. The claim PATCH lands before the slow Replicate
    // chain starts, so overlapping polls see "processing" and stand down.
    next.status = "processing";
    next.processing_started = new Date().toISOString();
    await patchJob(jobId, {
      photos,
      progress: {
        ...job.progress,
        current_photo: next.index,
        current_step: `Processing photo ${next.index + 1}...`,
      },
    });

    const replicate = new Replicate({ auth: REPLICATE_TOKEN });
    try {
      const prows = await sbSelect(
        `batch_photos?batch_id=eq.${encodeURIComponent(jobId)}&photo_index=eq.${next.index}&select=image_data`,
      );
      const imageData = prows[0]?.image_data;
      if (!imageData) throw new Error("source photo missing");
      const result = await processPhoto(replicate, String(imageData), next);
      await storeResult(jobId, next.index, result);
      next.status = "completed";
      next.has_result = true;
      await recordBatchGeneration(
        email,
        next.tool,
        job.progress?.quota_method === "starter",
      );
    } catch (e: any) {
      console.error(`[batch-status] photo ${next.index} failed:`, e?.message);
      next.status = "failed";
      next.error = e?.message || "unknown";
      if (quotaCtx)
        await refundQuota({
          googleId: quotaCtx.google_id,
          amount: 1,
          method: quotaCtx.method,
        });
    }
    next.processing_started = null;
  }

  const completed = photos.filter((p) => p.status === "completed").length;
  const failed = photos.filter((p) => p.status === "failed").length;
  const allDone = completed + failed === photos.length;
  const stillQueued = photos.some((p) => p.status === "queued");

  if (!allDone) {
    await patchJob(jobId, {
      photos,
      progress: {
        ...job.progress,
        completed,
        failed,
        current_photo: null,
        current_step: stillQueued
          ? `Processing photo ${completed + failed + 1}...`
          : "Processing...",
      },
    });
    return;
  }

  // Everything terminal: generate listing copy once and complete.
  await patchJob(jobId, {
    status: "generating_text",
    photos,
    progress: {
      ...job.progress,
      completed,
      failed,
      current_photo: null,
      current_step: "Generating listing copy...",
    },
  });
  let listingCopy = job.listing_copy || null;
  if (!listingCopy) {
    try {
      listingCopy = await generateListingCopy(photos);
    } catch (e: any) {
      console.error(`[batch-status] listing copy failed:`, e?.message);
    }
  }
  await patchJob(jobId, {
    status: completed > 0 ? "completed" : "failed",
    listing_copy: listingCopy,
    error: completed > 0 ? null : "all photos failed",
    progress: {
      ...job.progress,
      completed,
      failed,
      current_photo: null,
      current_step: "Complete",
    },
  });
}
