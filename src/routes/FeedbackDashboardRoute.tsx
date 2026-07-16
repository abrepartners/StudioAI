/**
 * FeedbackDashboardRoute — /admin/feedback
 *
 * The team's view of everything submitted through the What's New box: filter by
 * status and category, see the screenshot a user attached, and move each item
 * through new → triaged → shipped / wontfix. Admin-only (mirrors the other
 * /admin routes: gate on the signed-in email, and the API re-checks server-side).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { readGoogleUser, isAdmin } from "./authStorage";

type Status = "new" | "triaged" | "shipped" | "wontfix";
type Category = "bug" | "idea" | "love" | "other";

interface FeedbackItem {
  id: string;
  created_at: string;
  email: string | null;
  name: string | null;
  message: string;
  category: Category;
  status: Status;
  source: string | null;
  image_url: string | null;
  note: string | null;
}

const STATUSES: Status[] = ["new", "triaged", "shipped", "wontfix"];
const CATEGORIES: Category[] = ["bug", "idea", "love", "other"];

const STATUS_STYLE: Record<Status, string> = {
  new: "bg-[#0A84FF]/15 text-[#4CA6FF] border-[#0A84FF]/30",
  triaged: "bg-[#FF9F0A]/15 text-[#FFB84D] border-[#FF9F0A]/30",
  shipped: "bg-[#30D158]/15 text-[#4ADE80] border-[#30D158]/30",
  wontfix: "bg-white/5 text-zinc-500 border-white/10",
};
const CATEGORY_STYLE: Record<Category, string> = {
  bug: "bg-[#FF375F]/15 text-[#FF6B8A]",
  idea: "bg-[#0A84FF]/15 text-[#4CA6FF]",
  love: "bg-[#30D158]/15 text-[#4ADE80]",
  other: "bg-white/5 text-zinc-400",
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const FeedbackDashboardRoute: React.FC = () => {
  const user = useMemo(() => readGoogleUser(), []);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [openNew, setOpenNew] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [catFilter, setCatFilter] = useState<Category | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (catFilter !== "all") params.set("category", catFilter);
      const r = await fetch(`/api/feedback-admin?${params.toString()}`, {
        credentials: "include",
      });
      if (!r.ok)
        throw new Error(
          r.status === 403 ? "Not authorized" : `Error ${r.status}`,
        );
      const data = await r.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setOpenNew(data.openNew || 0);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, catFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (id: string, status: Status) => {
    // Optimistic: reflect immediately, roll back on failure.
    const prev = items;
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, status } : it)));
    try {
      const r = await fetch("/api/feedback-admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, status }),
      });
      if (!r.ok) throw new Error();
      // Re-pull the "new" counter and re-apply any active status filter.
      void load();
    } catch {
      setItems(prev);
    }
  };

  if (!isAdmin(user)) return <Navigate to="/vellum" replace />;

  return (
    <div className="min-h-screen bg-black text-zinc-200">
      <div className="max-w-4xl mx-auto px-5 py-10">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Feedback
          </h1>
          <Link
            to="/vellum"
            className="text-sm text-zinc-400 hover:text-white transition"
          >
            ← Back to app
          </Link>
        </div>
        <p className="text-sm text-zinc-500 mb-8">
          {openNew} new · {items.length} shown. Everything clients send from the
          What&rsquo;s New box.
        </p>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          <FilterGroup
            options={["all", ...STATUSES]}
            active={statusFilter}
            onPick={(v) => setStatusFilter(v as Status | "all")}
          />
          <span className="w-px bg-white/10 mx-1" />
          <FilterGroup
            options={["all", ...CATEGORIES]}
            active={catFilter}
            onPick={(v) => setCatFilter(v as Category | "all")}
          />
        </div>

        {loading && <p className="text-sm text-zinc-500">Loading…</p>}
        {error && <p className="text-sm text-[#FF6B8A]">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-zinc-500">
            Nothing here yet with these filters.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {items.map((it) => (
            <div
              key={it.id}
              className="bg-zinc-900/50 border border-white/[0.08] rounded-2xl p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${CATEGORY_STYLE[it.category]}`}
                  >
                    {it.category}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {it.name || it.email || "anonymous"} ·{" "}
                    {fmtDate(it.created_at)}
                  </span>
                </div>
                <select
                  value={it.status}
                  onChange={(e) =>
                    changeStatus(it.id, e.target.value as Status)
                  }
                  className={`text-[11px] font-medium px-2 py-1 rounded-lg border bg-transparent cursor-pointer outline-none ${STATUS_STYLE[it.status]}`}
                >
                  {STATUSES.map((s) => (
                    <option
                      key={s}
                      value={s}
                      className="bg-zinc-900 text-white"
                    >
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
                {it.message}
              </p>

              {it.image_url && (
                <a
                  href={it.image_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-3"
                >
                  <img
                    src={it.image_url}
                    alt="attached screenshot"
                    className="max-h-40 rounded-lg border border-white/10 hover:border-white/25 transition"
                  />
                </a>
              )}

              {it.email && (
                <div className="mt-3 pt-2 border-t border-white/[0.06] text-[11px] text-zinc-600">
                  {it.email}
                  {it.source ? ` · via ${it.source}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const FilterGroup: React.FC<{
  options: string[];
  active: string;
  onPick: (v: string) => void;
}> = ({ options, active, onPick }) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map((o) => (
      <button
        key={o}
        onClick={() => onPick(o)}
        className={`text-xs px-2.5 py-1 rounded-lg border transition ${
          active === o
            ? "bg-white/10 text-white border-white/20"
            : "bg-transparent text-zinc-500 border-white/[0.08] hover:text-zinc-300"
        }`}
      >
        {o}
      </button>
    ))}
  </div>
);

export default FeedbackDashboardRoute;
