-- Atomic free-tier reservation. Closes the batch-concurrency TOCTOU where N
-- simultaneous generations all read the same lifetime count and all pass the
-- cap. A single row-locked UPDATE makes the check-and-increment atomic.
--
-- Identity is google_id (the unique key on public.users); the session carries
-- it as `sub`. Returns the method used so a failed generation can be refunded.
create or replace function public.reserve_generation(
  p_google_id text,
  p_email text,
  p_amount integer default 1,
  p_lifetime_cap integer default 5
)
returns jsonb
language plpgsql
as $$
declare
  v_lifetime integer;
  v_credits integer;
begin
  insert into public.users (google_id, email)
  values (p_google_id, lower(p_email))
  on conflict (google_id) do nothing;

  select lifetime_free_gens_used, credits
    into v_lifetime, v_credits
  from public.users
  where google_id = p_google_id
  for update;

  if v_lifetime is null then
    return jsonb_build_object('allowed', false, 'method', 'denied',
      'reason', 'user_not_found');
  end if;

  if v_lifetime + p_amount <= p_lifetime_cap then
    update public.users
      set lifetime_free_gens_used = lifetime_free_gens_used + p_amount,
          total_generations = total_generations + p_amount
      where google_id = p_google_id;
    return jsonb_build_object('allowed', true, 'method', 'lifetime',
      'lifetime_used', v_lifetime + p_amount, 'credits', v_credits);
  elsif v_credits >= p_amount then
    update public.users
      set credits = credits - p_amount,
          total_generations = total_generations + p_amount
      where google_id = p_google_id;
    return jsonb_build_object('allowed', true, 'method', 'credits',
      'lifetime_used', v_lifetime, 'credits', v_credits - p_amount);
  else
    return jsonb_build_object('allowed', false, 'method', 'denied',
      'reason', 'quota_exhausted', 'lifetime_used', v_lifetime,
      'credits', v_credits);
  end if;
end;
$$;

create or replace function public.refund_generation(
  p_google_id text,
  p_amount integer default 1,
  p_method text default 'lifetime'
)
returns void
language plpgsql
as $$
begin
  if p_method = 'lifetime' then
    update public.users
      set lifetime_free_gens_used = greatest(0, lifetime_free_gens_used - p_amount),
          total_generations = greatest(0, total_generations - p_amount)
      where google_id = p_google_id;
  elsif p_method = 'credits' then
    update public.users
      set credits = credits + p_amount,
          total_generations = greatest(0, total_generations - p_amount)
      where google_id = p_google_id;
  end if;
end;
$$;
