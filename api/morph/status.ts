/**
 * GET /api/morph/status?id=... — poll + advance the pipeline one step.
 *
 * Reframe -> Construction -> awaiting_approval -> (approve) -> morph1 -> morph2
 * -> stitching -> (finalize) -> done. The transition logic lives in advanceJob
 * (shared with the /tick cron so a browser tab and the self-advance cron never
 * diverge). Returns a client-safe view of the job.
 */
import { json } from "../utils.js";
import { applyCors } from "../_lib/auth-middleware.js";
import {
  requireMorphUser,
  sbGet,
  advanceJob,
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
  const job = await sbGet(id);
  if (!job) return json(res, 404, { ok: false, error: "unknown job" });

  const advanced = await advanceJob(job);
  return json(res, 200, view(advanced));
}
