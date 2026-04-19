/**
 * /api/usage — aggregated generation usage + estimated cost.
 *
 * Used by the Billing tab in /settings to show the user their own traffic:
 * "Today: 47 calls, $1.88 · This month: 1,122 calls, $44.88". Pulls from
 * public.generation_logs (populated by record-generation.ts on every call).
 *
 * Filters out source='qa-harness' by default so dev traffic doesn't inflate
 * the user-facing number. Pass ?includeDev=1 to include it.
 */
import { json, setCors, handleOptions, rejectMethod } from './utils.js';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

export default async function handler(req: any, res: any) {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (rejectMethod(req, res, 'GET')) return;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    json(res, 500, { ok: false, error: 'Supabase not configured' });
    return;
  }

  const email = String(req.query?.email || '').toLowerCase();
  if (!email) {
    json(res, 400, { ok: false, error: 'email is required' });
    return;
  }

  const includeDev = req.query?.includeDev === '1';
  const sourceFilter = includeDev ? '' : '&source=eq.app';

  // Last 30 days of calls for this email.
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString();

  try {
    const rows = await fetch(
      `${SUPABASE_URL}/rest/v1/generation_logs` +
      `?user_email=eq.${encodeURIComponent(email)}` +
      `&created_at=gte.${encodeURIComponent(sinceIso)}` +
      `${sourceFilter}` +
      `&select=tool,model,estimated_cost_cents,created_at` +
      `&order=created_at.desc`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    ).then((r) => r.json());

    if (!Array.isArray(rows)) {
      json(res, 200, { ok: true, today: null, month: null, byTool: {}, recent: [] });
      return;
    }

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let todayCalls = 0, todayCost = 0;
    let monthCalls = 0, monthCost = 0;
    const byTool: Record<string, { calls: number; cost: number }> = {};

    for (const r of rows) {
      const d = new Date(r.created_at);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cost = Number(r.estimated_cost_cents || 0);
      if (dayKey === todayKey) { todayCalls++; todayCost += cost; }
      if (mKey === monthKey) { monthCalls++; monthCost += cost; }
      const t = r.tool || 'unknown';
      if (!byTool[t]) byTool[t] = { calls: 0, cost: 0 };
      byTool[t].calls++;
      byTool[t].cost += cost;
    }

    json(res, 200, {
      ok: true,
      today: { calls: todayCalls, costCents: todayCost, costUsd: (todayCost / 100).toFixed(2) },
      month: { calls: monthCalls, costCents: monthCost, costUsd: (monthCost / 100).toFixed(2) },
      byTool: Object.fromEntries(
        Object.entries(byTool).map(([tool, v]) => [tool, { calls: v.calls, costCents: v.cost, costUsd: (v.cost / 100).toFixed(2) }])
      ),
      recent: rows.slice(0, 20),
    });
  } catch (err: any) {
    console.error('[usage] query failed:', err);
    json(res, 500, { ok: false, error: err?.message || 'usage query failed' });
  }
}
