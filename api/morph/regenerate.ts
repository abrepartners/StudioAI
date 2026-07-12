/**
 * POST /api/morph/regenerate — Thomas rejected a frame; redo the stills.
 * Body: { jobId }. Reuses the already-uploaded photo, restarts the reframe.
 */
import { json, parseBody } from "../utils.js";
import { applyCors } from "../_lib/auth-middleware.js";
import {
  requireMorphUser,
  sbGet,
  sbPatch,
  startReframe,
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
  if (!job || !job.src_url)
    return json(res, 404, { ok: false, error: "unknown job" });

  try {
    const realPred = await startReframe(job.src_url);
    await sbPatch(jobId, {
      status: "reframing",
      step: "reframing to vertical (keeping the whole house)",
      real_url: null,
      construction_url: null,
      real_pred: realPred,
      cons_pred: null,
      morph1_pred: null,
      morph2_pred: null,
      morph1_url: null,
      morph2_url: null,
      video_url: null,
      error: null,
    });
    return json(res, 200, { ok: true });
  } catch (e: any) {
    return json(res, 500, { ok: false, error: String(e?.message || e) });
  }
}
