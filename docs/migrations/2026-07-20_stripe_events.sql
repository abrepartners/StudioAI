-- Idempotency + audit ledger for inbound Stripe webhooks.
-- Stripe retries aggressively and may deliver the same event more than once;
-- the primary key makes reprocessing a no-op.
create table if not exists public.stripe_events (
  id           text        primary key,   -- Stripe event id, evt_...
  type         text        not null,
  payload      jsonb       not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists stripe_events_type_idx
  on public.stripe_events (type, received_at desc);

alter table public.stripe_events enable row level security;
