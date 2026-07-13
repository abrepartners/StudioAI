/**
 * /api/morph/tick — the self-advance cron (Vercel Cron, every minute).
 *
 * Advances every in-flight reel that no client has touched in ~30s (see
 * sbListInflight), so a reel finishes on its own whether or not a browser tab
 * is open and whether or not a headless runner is polling. This is what makes
 * the tool tab-close-safe and my "make a reel of X" headless runs reliable.
 *
 * Low-risk + unauthenticated on purpose: it can ONLY nudge jobs that already
 * exist (an authorized /start created them) forward one step, returns no job
 * data, and the atomic claim in finalizeJob prevents duplicate concats. Nothing
 * to leak, nothing to abuse — hammering it just no-ops when no jobs are stale.
 */
import { json } from "../utils.js";
import { advanceJob, sbListInflight } from "../_lib/morph-core.js";
import { finalizeJob } from "../_lib/morph-finalize.js";

export const config = { runtime: "nodejs", maxDuration: 300 };

export default async function handler(_req: any, res: any) {
  const jobs = await sbListInflight();
  let advanced = 0;
  for (const job of jobs) {
    try {
      if (job.status === "stitching") await finalizeJob(job);
      else await advanceJob(job);
      advanced++;
    } catch {
      /* one bad job never blocks the rest */
    }
  }
  return json(res, 200, { ok: true, inflight: jobs.length, advanced });
}
