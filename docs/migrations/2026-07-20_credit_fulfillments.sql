-- Idempotency ledger for Stripe credit-pack fulfillment.
-- The primary key IS the idempotency guarantee: a second fulfillment attempt
-- for the same checkout session conflicts and is rejected before any credits
-- are granted.
create table if not exists public.credit_fulfillments (
  stripe_session_id text primary key,
  user_email        text        not null,
  credits           integer     not null check (credits > 0),
  amount_cents      integer,
  fulfilled_at      timestamptz not null default now()
);

create index if not exists credit_fulfillments_email_idx
  on public.credit_fulfillments (user_email, fulfilled_at desc);

-- Service-role only. No anon or authenticated access: this is a financial
-- record and the app reaches it exclusively through the service key.
alter table public.credit_fulfillments enable row level security;
