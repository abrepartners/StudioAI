-- 20260724_batch_jobs.sql — Listing Batch Pipeline MVP storage.
--
-- batch_jobs is the orchestration record: one row per batch, with per-photo
-- metadata (classification, chosen tool, status) in the `photos` jsonb array.
-- batch_photos holds the heavy payloads: the resized source image AND the
-- processed result per photo. Keeping base64 image data OUT of batch_jobs.photos
-- is deliberate — the status endpoint re-writes that jsonb on every state
-- change, and embedding 30 results there would make every poll re-ship tens of
-- megabytes. Results live in batch_photos.result_data and are fetched one at a
-- time by index.

create table if not exists public.batch_jobs (
  id            text primary key,
  user_email    text not null,
  status        text not null default 'queued'
                check (status in ('queued','classifying','processing','generating_text','completed','failed')),
  progress      jsonb not null default '{}'::jsonb,
  photos        jsonb not null default '[]'::jsonb,
  listing_copy  jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.batch_photos (
  id            uuid default gen_random_uuid() primary key,
  batch_id      text not null references public.batch_jobs(id) on delete cascade,
  photo_index   integer not null,
  image_data    text not null,
  result_data   text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_batch_photos_batch on public.batch_photos (batch_id, photo_index);
create index if not exists idx_batch_jobs_user_email on public.batch_jobs (user_email, created_at desc);

-- RLS on, no policies: only the service role (which bypasses RLS) can touch
-- these tables. Matches every other StudioAI table; without this the anon key
-- could read agents' listing photos straight through PostgREST.
alter table public.batch_jobs enable row level security;
alter table public.batch_photos enable row level security;

create or replace function public.touch_batch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace trigger batch_jobs_updated_at
  before update on public.batch_jobs
  for each row execute function public.touch_batch_updated_at();

-- shared/vocab.ts gains a 'batch' tool in the same change. Per the contract in
-- that file ("if you add a value here you MUST also migrate the constraint"),
-- rebuild the vellum_jobs tool CHECK to match. Guarded: vellum_jobs was created
-- outside this repo's migration chain, so skip cleanly when it is absent.
do $$
declare
  c record;
begin
  if to_regclass('public.vellum_jobs') is not null then
    for c in
      select con.conname
      from pg_constraint con
      where con.conrelid = 'public.vellum_jobs'::regclass
        and con.contype = 'c'
        and pg_get_constraintdef(con.oid) like '%tool%'
    loop
      execute format('alter table public.vellum_jobs drop constraint %I', c.conname);
    end loop;
    execute $ck$
      alter table public.vellum_jobs add constraint vellum_jobs_tool_check
        check (tool in ('staging','declutter','magicedit','twilight','sky','whiten','lawn','renovation','morph','batch'))
    $ck$;
  end if;
end $$;
