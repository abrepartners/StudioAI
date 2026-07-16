/**
 * api/feedback-admin.ts — the feedback queue, for the team.
 *
 * GET   → list feedback (newest first), optional ?status= / ?category= filters.
 * PATCH → move a row's status (new | triaged | shipped | wontfix) + optional note.
 *
 * The public /api/feedback endpoint takes submissions (unauthenticated). This
 * one READS them, so it's gated: a valid A&B session OR the service key. Under
 * log-only auth a cookieless request resolves to the anon identity, whose email
 * isn't an @averyandbryant.com address, so it's refused here — the queue (with
 * user emails) never leaks to a non-admin.
 */
import { json, parseBody } from "./utils.js";
import { applyCors, requireServiceOrSession } from "./_lib/auth-middleware.js";

export const config = { runtime: "nodejs" };

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

const STATUSES = ["new", "triaged", "shipped", "wontfix"];
const CATEGORIES = ["bug", "idea", "love", "other"];

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

export default async function handler(req: any, res: any) {
  if (applyCors(req, res, "GET,PATCH,OPTIONS")) return;

  const session = await requireServiceOrSession(req, res);
  if (!session) return; // 401 already sent when enforce is on

  const isService = (session as any).service === true;
  const isAdmin =
    isService ||
    (typeof session.email === "string" &&
      session.email.endsWith("@averyandbryant.com"));
  if (!isAdmin) {
    json(res, 403, { ok: false, error: "admin only" });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    json(res, 500, { ok: false, error: "storage not configured" });
    return;
  }

  try {
    if (req.method === "GET") return await list(req, res);
    if (req.method === "PATCH") return await patch(req, res);
    json(res, 405, { ok: false, error: "method not allowed" });
  } catch (e: any) {
    console.error("[feedback-admin]", e?.message || e);
    json(res, 500, { ok: false, error: "internal error" });
  }
}

async function list(req: any, res: any) {
  const status = String(req.query?.status || "");
  const category = String(req.query?.category || "");
  const limit = Math.min(Number(req.query?.limit) || 200, 500);

  let q = `feedback?select=*&order=created_at.desc&limit=${limit}`;
  if (status && STATUSES.includes(status)) q += `&status=eq.${status}`;
  if (category && CATEGORIES.includes(category))
    q += `&category=eq.${category}`;

  const rows = await sb(q).then((r) => r.json());
  const items = Array.isArray(rows) ? rows : [];
  // Small at-a-glance counts so the dashboard header is one query, not five.
  const openNew = items.filter((r: any) => r.status === "new").length;
  json(res, 200, { ok: true, count: items.length, openNew, items });
}

async function patch(req: any, res: any) {
  const body = parseBody(req.body) || {};
  const id = String(body.id || "");
  if (!id) {
    json(res, 400, { ok: false, error: "id is required" });
    return;
  }
  const patchBody: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(String(body.status))) {
      json(res, 400, {
        ok: false,
        error: `status must be one of: ${STATUSES.join(", ")}`,
      });
      return;
    }
    patchBody.status = body.status;
    // Stamp when it first leaves the queue, for lightweight triage-time stats.
    if (body.status !== "new") patchBody.triaged_at = new Date().toISOString();
  }
  if (body.note !== undefined)
    patchBody.note = String(body.note).slice(0, 2000);
  if (!Object.keys(patchBody).length) {
    json(res, 400, { ok: false, error: "nothing to update" });
    return;
  }

  const r = await sb(`feedback?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patchBody),
  });
  const out = await r.json();
  if (!r.ok || !Array.isArray(out) || !out.length) {
    json(res, r.ok ? 404 : r.status, {
      ok: false,
      error: r.ok ? `feedback ${id} not found` : "update failed",
    });
    return;
  }
  json(res, 200, { ok: true, item: out[0] });
}
