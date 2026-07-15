/**
 * api/jobs.ts — the job spine.
 *
 * One row per tool run, from any surface. This endpoint exists so that no
 * client needs Supabase credentials: Henry (the Telegram conductor on the Mac
 * Mini), the web app, and any future phone app all record work the same way,
 * through here. That is what makes "Henry is just a client" true rather than
 * aspirational — and what makes a mobile app cheap when it lands.
 *
 * The vocabulary (shared/vocab.ts) is validated here AND enforced by CHECK
 * constraints on public.vellum_jobs. Two layers on purpose: the API gives a
 * readable 400, the constraint guarantees the database can never hold a value
 * the code doesn't know about.
 *
 *   POST   /api/jobs      create a job (idempotent on id)
 *          { id, tool, source, user_email?, google_id?, aryeoListingId?,
 *            address?, params?, photoCount?, status? }
 *
 *   PATCH  /api/jobs      advance a job, optionally logging its generations
 *          { id, status?, labelApplied?, error?,
 *            generations?: [{ model, tool?, costCents? }] }
 *
 *   GET    /api/jobs?status=review&staleMinutes=60
 *          list jobs — the "what did we drop?" query
 *
 * Terminal jobs (delivered | rejected | failed) refuse further transitions with
 * a 409. That is deliberate: it is the server-side twin of the conductor's
 * local marker guard, so a stale Telegram card cannot fire a second upload even
 * if the Mini's disk state is wrong.
 */
import { json, parseBody } from "./utils.js";
import { applyCors, requireServiceOrSession } from "./_lib/auth-middleware.js";
import {
  isTool,
  isSource,
  isStatus,
  isTerminal,
  TOOLS,
  SOURCES,
  STATUSES,
} from "../shared/vocab.js";

export const config = { runtime: "nodejs" };

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

/** Cost in cents per model. Mirrors the table in record-generation.ts. */
function estimateCents(model: string): number {
  const m = (model || "").toLowerCase();
  if (m.includes("flux-fill")) return 10;
  if (m.includes("seedream")) return 6;
  if (m.includes("nano")) return 14;
  if (m.includes("kontext")) return 10;
  if (m.includes("flash-preview") && !m.includes("image")) return 0;
  if (m.includes("pro-image")) return 10;
  return 4;
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "GET,POST,PATCH,OPTIONS")) return;

  const session = await requireServiceOrSession(req, res);
  if (!session) return;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    json(res, 500, { ok: false, error: "supabase not configured" });
    return;
  }

  try {
    if (req.method === "GET") return await listJobs(req, res);
    if (req.method === "POST") return await createJob(req, res, session);
    if (req.method === "PATCH") return await patchJob(req, res);
    json(res, 405, { ok: false, error: "method not allowed" });
  } catch (e: any) {
    console.error("[jobs] error:", e?.message || e);
    json(res, 500, { ok: false, error: e?.message || "unknown error" });
  }
}

/** The drop-catcher: what is sitting in review, and for how long. */
async function listJobs(req: any, res: any) {
  const status = String(req.query?.status || "");
  const source = String(req.query?.source || "");
  const listing = String(req.query?.aryeoListingId || "");
  const staleMinutes = Number(req.query?.staleMinutes || 0);
  const limit = Math.min(Number(req.query?.limit) || 50, 200);

  if (status && !isStatus(status)) {
    json(res, 400, {
      ok: false,
      error: `status must be one of: ${STATUSES.join(", ")}`,
    });
    return;
  }
  if (source && !isSource(source)) {
    json(res, 400, {
      ok: false,
      error: `source must be one of: ${SOURCES.join(", ")}`,
    });
    return;
  }

  let q = `vellum_jobs?select=*&order=updated_at.desc&limit=${limit}`;
  if (status) q += `&status=eq.${encodeURIComponent(status)}`;
  if (source) q += `&source=eq.${encodeURIComponent(source)}`;
  if (listing) q += `&aryeo_listing_id=eq.${encodeURIComponent(listing)}`;
  if (staleMinutes > 0) {
    const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
    q += `&updated_at=lt.${encodeURIComponent(cutoff)}`;
  }

  const rows = await sb(q).then((r) => r.json());
  json(res, 200, {
    ok: true,
    count: Array.isArray(rows) ? rows.length : 0,
    jobs: rows,
  });
}

async function createJob(req: any, res: any, session: any) {
  const body = parseBody(req.body) || {};
  const { id, tool, source, status } = body;

  if (!id || typeof id !== "string") {
    json(res, 400, { ok: false, error: "id is required" });
    return;
  }
  if (!isTool(tool)) {
    json(res, 400, {
      ok: false,
      error: `tool must be one of: ${TOOLS.join(", ")}`,
    });
    return;
  }
  if (!isSource(source)) {
    json(res, 400, {
      ok: false,
      error: `source must be one of: ${SOURCES.join(", ")}`,
    });
    return;
  }
  if (status && !isStatus(status)) {
    json(res, 400, {
      ok: false,
      error: `status must be one of: ${STATUSES.join(", ")}`,
    });
    return;
  }

  // A session call owns its own work; a service call must say who it acted for.
  const userEmail = String(
    body.user_email ||
      body.userEmail ||
      (session.service ? "" : session.email) ||
      "",
  ).toLowerCase();

  const row = {
    id,
    tool,
    source,
    status: status || "running",
    user_email: userEmail || null,
    google_id:
      body.google_id ||
      body.googleId ||
      (session.service ? null : session.sub) ||
      null,
    aryeo_listing_id: body.aryeo_listing_id || body.aryeoListingId || null,
    project_id: body.project_id || body.projectId || null,
    address: body.address || null,
    params: body.params ?? {},
    photo_count: Number(body.photo_count ?? body.photoCount ?? 0) || 0,
  };

  // Idempotent: a retried create merges rather than 409s. Job ids are minted
  // per run, so a conflict means "the same job, again", never a different one.
  const r = await sb("vellum_jobs?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  const out = await r.json();
  if (!r.ok) {
    json(res, r.status, {
      ok: false,
      error: out?.message || "insert failed",
      detail: out,
    });
    return;
  }
  json(res, 200, { ok: true, job: Array.isArray(out) ? out[0] : out });
}

async function patchJob(req: any, res: any) {
  const body = parseBody(req.body) || {};
  const id = String(body.id || "");
  if (!id) {
    json(res, 400, { ok: false, error: "id is required" });
    return;
  }

  const status = body.status;
  if (status !== undefined && !isStatus(status)) {
    json(res, 400, {
      ok: false,
      error: `status must be one of: ${STATUSES.join(", ")}`,
    });
    return;
  }

  // Read first: a PATCH that matches no row updates zero rows and still returns
  // 200, and a terminal job must never move again.
  const existing = await sb(
    `vellum_jobs?id=eq.${encodeURIComponent(id)}&select=id,status,source,tool,user_email`,
  ).then((r) => r.json());
  const job = Array.isArray(existing) ? existing[0] : null;
  if (!job) {
    json(res, 404, { ok: false, error: `job ${id} not found` });
    return;
  }
  if (isTerminal(job.status) && status && status !== job.status) {
    json(res, 409, {
      ok: false,
      error: `job ${id} is already ${job.status} — refusing to move it to ${status}`,
      code: "terminal",
      status: job.status,
    });
    return;
  }

  const patch: Record<string, unknown> = {};
  if (status !== undefined) patch.status = status;
  if (body.labelApplied !== undefined || body.label_applied !== undefined) {
    patch.label_applied = Boolean(body.labelApplied ?? body.label_applied);
  }
  if (body.error !== undefined) patch.error = body.error;
  if (body.photoCount !== undefined || body.photo_count !== undefined) {
    patch.photo_count = Number(body.photoCount ?? body.photo_count) || 0;
  }
  if (status === "delivered") patch.delivered_at = new Date().toISOString();

  let updated = job;
  if (Object.keys(patch).length) {
    const r = await sb(`vellum_jobs?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    const out = await r.json();
    if (!r.ok) {
      json(res, r.status, {
        ok: false,
        error: out?.message || "update failed",
        detail: out,
      });
      return;
    }
    // Zero rows here means the row vanished between the read and the write.
    if (!Array.isArray(out) || !out.length) {
      json(res, 404, {
        ok: false,
        error: `job ${id} matched no row on update`,
      });
      return;
    }
    updated = out[0];
  }

  // Log this job's generations. Henry's calls are quota-exempt at the tool
  // endpoints, so without this every Replicate dollar it spends is invisible.
  let logged = 0;
  const gens = Array.isArray(body.generations) ? body.generations : [];
  if (gens.length) {
    const rows = gens.map((g: any) => ({
      user_email: (job.user_email || "service@vellum.local").toLowerCase(),
      tool: isTool(g.tool) ? g.tool : job.tool,
      model: String(g.model || "unknown"),
      estimated_cost_cents: Number(
        g.costCents ?? g.cost_cents ?? estimateCents(g.model),
      ),
      source: job.source,
      job_id: id,
    }));
    const r = await sb("generation_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(rows),
    });
    if (r.ok) logged = rows.length;
    else console.warn("[jobs] generation_logs insert failed:", await r.text());
  }

  json(res, 200, { ok: true, job: updated, generationsLogged: logged });
}
