/**
 * GET /api/morph/status?id=... — poll + advance the pipeline one step.
 *
 * Reframe -> Construction -> awaiting_approval -> (approve) -> morph1 -> morph2
 * -> stitching -> (finalize) -> done. Each call checks the current Replicate
 * prediction and advances if it finished; the concat is handled by /finalize.
 * Returns a client-safe view of the job.
 */
import { json } from "../utils.js";
import { applyCors } from "../_lib/auth-middleware.js";
import {
  requireMorphUser,
  getPred,
  predUrl,
  startConstruction,
  startMorph,
  sbGet,
  sbPatch,
  sbClaim,
  type MorphJob,
} from "../_lib/morph-core.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

const view = (j: MorphJob) => ({
  ok: true,
  jobId: j.id,
  status: j.status,
  step: j.step || "",
  realUrl: j.real_url || null,
  constructionUrl: j.construction_url || null,
  videoUrl: j.video_url || null,
  error: j.error || null,
});

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "GET,OPTIONS")) return;
  const user = await requireMorphUser(req, res);
  if (!user) return;

  const id = String(
    req.query?.id || new URL(req.url, "http://x").searchParams.get("id") || "",
  );
  let job = await sbGet(id);
  if (!job) return json(res, 404, { ok: false, error: "unknown job" });

  try {
    if (job.status === "reframing" && job.real_pred) {
      const p = await getPred(job.real_pred);
      if (p.status === "succeeded") {
        // Claim reframing -> constructing FIRST. A polled GET must not launch a
        // paid generation more than once; only the request that wins the atomic
        // status flip gets to spend. Concurrent/repeat polls match zero rows.
        if (await sbClaim(id, "reframing", "constructing")) {
          const realUrl = predUrl(p);
          try {
            const consPred = await startConstruction(realUrl);
            await sbPatch(id, {
              real_url: realUrl,
              cons_pred: consPred,
              step: "building the under-construction frame",
            });
          } catch (e: any) {
            await sbPatch(id, {
              status: "error",
              error: "construction launch failed: " + String(e?.message || e),
            });
          }
        }
        job = (await sbGet(id))!;
      } else if (p.status === "failed" || p.status === "canceled") {
        await sbPatch(id, { status: "error", error: "reframe failed" });
        job = (await sbGet(id))!;
      }
    } else if (job.status === "constructing" && job.cons_pred) {
      const p = await getPred(job.cons_pred);
      if (p.status === "succeeded") {
        await sbPatch(id, {
          construction_url: predUrl(p),
          status: "awaiting_approval",
          step: "waiting for your approval",
        });
        job = (await sbGet(id))!;
      } else if (p.status === "failed" || p.status === "canceled") {
        await sbPatch(id, {
          status: "error",
          error: "construction frame failed",
        });
        job = (await sbGet(id))!;
      }
    } else if (job.status === "morph1" && job.morph1_pred) {
      const p = await getPred(job.morph1_pred);
      if (p.status === "succeeded") {
        // THE runaway-spend fix. Claim morph1 -> morph2 atomically BEFORE the
        // $0.75 seedance call. Without this, a browser polling every few seconds
        // re-entered this branch and fired a new clip on every poll (~400 clips,
        // $298.50). Now only the one request that wins the status flip spends.
        if (await sbClaim(id, "morph1", "morph2")) {
          try {
            const m2Pred = await startMorph(
              job.construction_url!,
              job.real_url!,
              "under construction",
              "real house",
            );
            await sbPatch(id, {
              morph1_url: predUrl(p),
              morph2_pred: m2Pred,
              step: "morphing 2/2: under construction → real house",
            });
          } catch (e: any) {
            await sbPatch(id, {
              status: "error",
              error: "morph 2 launch failed: " + String(e?.message || e),
            });
          }
        }
        job = (await sbGet(id))!;
      } else if (p.status === "failed" || p.status === "canceled") {
        await sbPatch(id, { status: "error", error: "morph 1 failed" });
        job = (await sbGet(id))!;
      }
    } else if (job.status === "morph2" && job.morph2_pred) {
      const p = await getPred(job.morph2_pred);
      if (p.status === "succeeded") {
        await sbPatch(id, {
          morph2_url: predUrl(p),
          status: "stitching",
          step: "stitching the reel",
        });
        job = (await sbGet(id))!;
      } else if (p.status === "failed" || p.status === "canceled") {
        await sbPatch(id, { status: "error", error: "morph 2 failed" });
        job = (await sbGet(id))!;
      }
    }
  } catch (e: any) {
    await sbPatch(id, { status: "error", error: String(e?.message || e) });
    job = (await sbGet(id)) || job;
  }

  return json(res, 200, view(job));
}
