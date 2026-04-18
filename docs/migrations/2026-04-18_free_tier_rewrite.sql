-- Phase 2 / R17 — Free-tier rewrite per Fork #3
-- 5 lifetime generations, then 1/day after.
--
-- Adds:
--   users.lifetime_free_gens_used (int, default 0)
--   RPC: bump_lifetime_free_gens(user_email text) — idempotent-ish +1 + return new value
--
-- Apply via Supabase SQL editor (studio) or `supabase db push` if project is linked.
-- Safe to re-run.

alter table if exists public.users
  add column if not exists lifetime_free_gens_used integer not null default 0;

-- Index email for the per-user fetch path used by stripe-status + record-generation
create index if not exists users_email_lower_idx
  on public.users (lower(email));

create or replace function public.bump_lifetime_free_gens(user_email text)
returns integer
language plpgsql
security definer
as $$
declare
  new_value integer;
begin
  -- Upsert-style: ensure row exists for this email then increment.
  insert into public.users (email, lifetime_free_gens_used, credits)
  values (lower(user_email), 1, 0)
  on conflict (email) do update
    set lifetime_free_gens_used = public.users.lifetime_free_gens_used + 1
  returning lifetime_free_gens_used into new_value;

  return new_value;
end;
$$;

-- Service role already has full access; explicit grant kept for clarity.
grant execute on function public.bump_lifetime_free_gens(text) to service_role;
