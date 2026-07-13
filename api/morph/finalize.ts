/**
 * POST /api/morph/finalize — stitch the two Seedance clips into the 9:16 loop.
 * Body: { jobId }. The browser calls this when /status reports "stitching"; the
 * /tick cron also calls the same finalizeJob for abandoned jobs. The atomic
 * claim inside finalizeJob guarantees only one concat ever runs.
 */
import { json, parseBody } from "../utils.js";
import { applyCors } from "../_lib/auth-middleware.js";
import { requireMorphUser, sbGet } from "../_lib/morph-core.js";
import { finalizeJob } from "../_lib/morph-finalize.js";

export const config = { runtime: "nodejs", maxDuration: 300 };

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "POST,OPTIONS")) return;
  if (req.method !== "POST")
    return json(res, 405, { ok: false, error: "Method not allowed" });
  const user = await requireMorphUser(req, res);
  if (!user) return;

  const { jobId } = parseBody(req.body);
  const job = await sbGet(jobId);
  if (!job) return json(res, 404, { ok: false, error: "unknown job" });

  const result = await finalizeJob(job);
  return json(res, 200, { ok: true, ...result });
}
