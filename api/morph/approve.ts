/**
 * POST /api/morph/approve — Thomas approved the two frames; render the reel.
 * Body: { jobId }. Starts morph 1 (real -> construction); /status drives the rest.
 */
import { json, parseBody } from "../utils.js";
import { applyCors } from "../_lib/auth-middleware.js";
import {
  requireMorphUser,
  sbGet,
  sbPatch,
  sbClaim,
  startMorph,
} from "../_lib/morph-core.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "POST,OPTIONS")) return;
  if (req.method !== "POST")
    return json(res, 405, { ok: false, error: "Method not allowed" });
  const user = await requireMorphUser(req, res);
  if (!user) return;

  const { jobId } = parseBody(req.body);
  const job = await sbGet(jobId);
  if (!job) return json(res, 404, { ok: false, error: "unknown job" });

  // Atomically claim awaiting_approval -> morph1 so a double-click or repeat
  // POST cannot fire two paid seedance calls. Only the first approve wins; the
  // old non-atomic `status !== "awaiting_approval"` check let both through.
  if (!(await sbClaim(jobId, "awaiting_approval", "morph1")))
    return json(res, 409, { ok: false, error: "not awaiting approval" });

  try {
    const m1Pred = await startMorph(
      job.real_url!,
      job.construction_url!,
      "real house",
      "under construction",
    );
    await sbPatch(jobId, {
      morph1_pred: m1Pred,
      step: "morphing 1/2: real house → under construction",
    });
    return json(res, 200, { ok: true });
  } catch (e: any) {
    await sbPatch(jobId, { status: "error", error: String(e?.message || e) });
    return json(res, 500, { ok: false, error: String(e?.message || e) });
  }
}
