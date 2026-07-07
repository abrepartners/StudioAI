-- Fair-use metering index for the Pro/Team COGS ceiling.
--
-- api/_lib/quota.ts `monthlyUsage()` runs a HEAD count against generation_logs
-- filtered by (user_email, created_at >= first-of-month, source = 'app') on the
-- unlimited-plan reserve path. This composite index makes that count an index
-- scan instead of a full-table scan, keeping the added latency to a single
-- cheap lookup with no row payload.
--
-- Column order: equality predicates first (user_email, source), then the range
-- predicate (created_at) last, so the b-tree can satisfy the whole WHERE clause.
create index if not exists generation_logs_user_source_created_idx
  on public.generation_logs (user_email, source, created_at);
