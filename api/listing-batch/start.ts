/**
 * POST /api/listing-batch/start — start a batch listing pipeline.
 *
 * Vercel caps request bodies at 4.5MB, so a 30-photo batch cannot arrive in
 * one POST. The endpoint is therefore a three-step handshake driven by
 * services/listingBatchService.ts:
 *
 *   { action: "init",  total }                → reserve quota, create the job, return jobId
 *   { action: "photo", jobId, index, photo }  → resize + store one photo (repeat per photo)
 *   { action: "begin", jobId }                → classify all photos (moondream, parallel),
 *                                               pick the tool per photo, process the FIRST
 *                                               photo inline for immediate feedback
 *
 * Subsequent photos are processed one-per-poll by /api/listing-batch/status.
 */
import { randomUUID } from "node:crypto";
import Replicate from "replicate";
import { json, parseBody } from "../utils.js";
import {
  applyCors,
  requireServiceOrSession,
} from "../_lib/auth-middleware.js";
import { reserveQuota, refundQuota } from "../_lib/quota.js";
import {
  assertStarterCapacity,
  recordBatchGeneration,
} from "../_lib/batch-usage.js";
import {
  MAX_PHOTOS,
  CLASSIFY_MAX_EDGE,
  PROCESS_MAX_EDGE,
  classifyPhoto,
  pickTool,
  processPhoto,
  generateListingCopy,
  resizeToBase64,
  sbPost,
  sbSelect,
  patchJob,
  storeResult,
  type PhotoMeta,
} from "../_lib/listing-batch-core.js";

export const config = { runtime: "nodejs", maxDuration: 300 };

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

const b64ToBuffer = (b64: string): Buffer => {
  const raw = b64.startsWith("data:") ? b64.split(",")[1] || "" : b64;
  return Buffer.from(raw, "base64");
};

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "POST,OPTIONS")) return;
  if (req.method !== "POST")
    return json(res, 405, { ok: false, error: "Method not allowed" });
  const session = await requireServiceOrSession(req, res);
  if (!session) return;
  if (!REPLICATE_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return json(res, 500, { ok: false, error: "backend not configured" });

  const body = parseBody(req.body);
  const email = (session as any).service ? "service@vellum.local" : session.email;
  const action = String(body.action || "init");

  try {
    if (action === "init") return await handleInit(res, body, session, email);
    if (action === "photo") return await handlePhoto(res, body, email);
    if (action === "begin") return await handleBegin(res, body, email);
    return json(res, 400, { ok: false, error: `unknown action "${action}"` });
  } catch (err: any) {
    console.error(`[batch-start] ${action} unhandled:`, err?.message);
    return json(res, 500, { ok: false, error: err?.message || "unknown" });
  }
}

// ── init: reserve quota, create the job shell ─────────────────────────────────
async function handleInit(res: any, body: any, session: any, email: string) {
  const total = Number(body.total);
  if (!Number.isInteger(total) || total < 1)
    return json(res, 400, { ok: false, error: "total (photo count) is required" });
  if (total > MAX_PHOTOS)
    return json(res, 400, { ok: false, error: `max ${MAX_PHOTOS} photos per batch` });

  const quota = await reserveQuota(email, session.sub, total);
  if (!quota.allowed)
    return json(res, 402, {
      ok: false,
      error: "generation quota reached",
      code: quota.reason || "quota_exhausted",
    });

  // Starter is Stripe-metered, not reserve-metered, so reserveQuota lets it
  // through — enforce the monthly cap here or a capped-out Starter could still
  // run a 30-photo batch (successful photos bump the meter in the pump).
  if (quota.method === "starter") {
    const cap = await assertStarterCapacity(email, total);
    if (!cap.allowed)
      return json(res, 402, {
        ok: false,
        error: `monthly generation cap reached (${cap.used} used)`,
        code: "starter_cap_exhausted",
      });
  }

  const jobId = "batch_" + randomUUID().slice(0, 12);
  try {
    await sbPost("batch_jobs", {
      id: jobId,
      user_email: email,
      status: "queued",
      photos: [],
      progress: {
        total,
        uploaded: 0,
        completed: 0,
        failed: 0,
        current_photo: null,
        current_step: "Uploading photos...",
        // Per-photo refund context for downstream failures. Null for
        // unlimited/starter plans (nothing was reserved).
        quota: quota.refundHandle
          ? { google_id: quota.refundHandle.googleId, method: quota.refundHandle.method }
          : null,
        // How this batch is billed — the pump meters Starter photos per success.
        quota_method: quota.method,
      },
    });
  } catch (err) {
    await refundQuota(quota.refundHandle);
    throw err;
  }
  return json(res, 200, { ok: true, jobId });
}

// ── photo: store one resized source image ─────────────────────────────────────
async function handlePhoto(res: any, body: any, email: string) {
  const jobId = String(body.jobId || "");
  const index = Number(body.index);
  const photo = String(body.photo || "");
  if (!jobId || !Number.isInteger(index) || index < 0 || !photo)
    return json(res, 400, { ok: false, error: "jobId, index, photo are required" });

  const job = await loadOwnJob(jobId, email);
  if (!job) return json(res, 404, { ok: false, error: "batch not found" });
  if (job.status !== "queued")
    return json(res, 409, { ok: false, error: `batch is ${job.status}, not accepting photos` });
  const total = Number(job.progress?.total || 0);
  if (index >= total)
    return json(res, 400, { ok: false, error: `index ${index} out of range (total ${total})` });

  const resized = await resizeToBase64(b64ToBuffer(photo), PROCESS_MAX_EDGE);
  await sbPost("batch_photos", {
    batch_id: jobId,
    photo_index: index,
    image_data: resized,
  });
  await patchJob(jobId, {
    progress: { ...job.progress, uploaded: Number(job.progress?.uploaded || 0) + 1 },
  });
  return json(res, 200, { ok: true });
}

// ── begin: classify everything, process photo 0 inline ────────────────────────
async function handleBegin(res: any, body: any, email: string) {
  const jobId = String(body.jobId || "");
  if (!jobId) return json(res, 400, { ok: false, error: "jobId is required" });

  const job = await loadOwnJob(jobId, email);
  if (!job) return json(res, 404, { ok: false, error: "batch not found" });
  if (job.status !== "queued")
    return json(res, 409, { ok: false, error: `batch already ${job.status}` });

  const total = Number(job.progress?.total || 0);
  const rows = await sbSelect(
    `batch_photos?batch_id=eq.${encodeURIComponent(jobId)}&select=photo_index,image_data&order=photo_index.asc`,
  );
  if (rows.length < total)
    return json(res, 409, {
      ok: false,
      error: `only ${rows.length}/${total} photos uploaded`,
    });

  const t0 = Date.now();
  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const quotaCtx = job.progress?.quota || null;

  try {
    await patchJob(jobId, {
      status: "classifying",
      progress: { ...job.progress, current_step: "Classifying rooms..." },
    });

    // Classify all photos in parallel on a 768px copy (plenty for VQA, fast).
    console.log(`[batch-start] ${jobId}: classifying ${rows.length} photos...`);
    const classifications = await Promise.all(
      rows.map(async (row: any) => {
        const small = await resizeToBase64(
          b64ToBuffer(String(row.image_data)),
          CLASSIFY_MAX_EDGE,
        );
        return classifyPhoto(replicate, small);
      }),
    );

    const photos: PhotoMeta[] = classifications.map((c, i) => ({
      index: i,
      status: "queued",
      location: c.location,
      room: c.room,
      empty: c.empty,
      tool: pickTool(c),
      has_result: false,
      error: null,
    }));

    // Process the first photo inline so the user sees a result immediately.
    photos[0].status = "processing";
    photos[0].processing_started = new Date().toISOString();
    await patchJob(jobId, {
      status: "processing",
      photos,
      progress: {
        ...job.progress,
        completed: 0,
        failed: 0,
        current_photo: 0,
        current_step: "Processing photo 1...",
      },
    });

    try {
      const result = await processPhoto(
        replicate,
        String(rows[0].image_data),
        photos[0],
      );
      await storeResult(jobId, 0, result);
      photos[0].status = "completed";
      photos[0].has_result = true;
      await recordBatchGeneration(
        email,
        photos[0].tool,
        job.progress?.quota_method === "starter",
      );
    } catch (e: any) {
      console.error(`[batch-start] photo 0 failed:`, e?.message);
      photos[0].status = "failed";
      photos[0].error = e?.message || "unknown";
      if (quotaCtx)
        await refundQuota({
          googleId: quotaCtx.google_id,
          amount: 1,
          method: quotaCtx.method,
        });
    }
    photos[0].processing_started = null;

    const completed = photos.filter((p) => p.status === "completed").length;
    const failed = photos.filter((p) => p.status === "failed").length;
    const allDone = completed + failed === photos.length;

    await patchJob(jobId, {
      status: allDone ? "generating_text" : "processing",
      photos,
      progress: {
        ...job.progress,
        completed,
        failed,
        current_photo: allDone ? null : 1,
        current_step: allDone ? "Generating listing copy..." : "Processing photo 2...",
      },
    });

    if (allDone) {
      // Single-photo batch: finish everything inline. Mirror the pump's
      // terminal status — a batch whose only photo failed is a FAILED batch.
      let listingCopy = null;
      if (completed > 0) {
        try {
          listingCopy = await generateListingCopy(photos);
        } catch (e: any) {
          console.error(`[batch-start] listing copy failed:`, e?.message);
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

    console.log(
      `[batch-start] ${jobId}: begin ${Date.now() - t0}ms (${completed}/${photos.length})`,
    );
    return json(res, 200, { ok: true, jobId });
  } catch (err: any) {
    // Classification or bookkeeping blew up before any photo ran: fail the job
    // and refund everything still reserved.
    console.error(`[batch-start] ${jobId} begin failed:`, err?.message);
    if (quotaCtx)
      await refundQuota({
        googleId: quotaCtx.google_id,
        amount: total,
        method: quotaCtx.method,
      });
    await patchJob(jobId, {
      status: "failed",
      error: err?.message || "unknown",
    }).catch(() => {});
    return json(res, 500, { ok: false, error: err?.message || "unknown" });
  }
}

/** Load a job the caller owns (service identity owns its own jobs). */
async function loadOwnJob(jobId: string, email: string): Promise<any | null> {
  const rows = await sbSelect(
    `batch_jobs?id=eq.${encodeURIComponent(jobId)}&user_email=eq.${encodeURIComponent(email)}&select=id,status,progress,photos,listing_copy,error`,
  );
  return rows[0] || null;
}
