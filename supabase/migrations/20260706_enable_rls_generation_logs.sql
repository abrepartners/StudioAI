-- generation_logs is written/read only by server-side API functions using the
-- service-role key (api/record-generation.ts, api/usage.ts). service_role
-- bypasses RLS, so enabling RLS closes the anon/authenticated exposure the
-- security advisor flagged with zero impact on legitimate access. No policy is
-- added on purpose: default-deny for anon/authenticated is the goal.
alter table public.generation_logs enable row level security;
