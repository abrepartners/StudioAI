# Session Auth — required deploy config

This branch (`feat/session-auth-and-quota`) puts every generation endpoint behind
a verified session. Two env vars and a rollout sequence gate a safe launch. Miss
the first and the app returns 503 on every generation.

## Required environment variables (Vercel → Project → Settings → Environment Variables)

| Var                                    | Value                                                        | Notes                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`                       | a long random string (32+ chars)                             | **REQUIRED.** Signs the session JWT. If absent, `requireSession` fail-closes with 503 and nothing generates. Generate with `openssl rand -base64 48`. Set for Production + Preview. |
| `VITE_GOOGLE_CLIENT_ID`                | existing Google OAuth client id                              | Already set. Used as the JWT audience when verifying the Google token.                                                                                                              |
| `AUTH_ENFORCE`                         | `log-only` for the rollout window, then unset (or `enforce`) | See rollout below.                                                                                                                                                                  |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | existing                                                     | The atomic quota RPC lives here. If unset, free-tier cap is NOT enforced (logged, allowed).                                                                                         |
| `STRIPE_SECRET_KEY`                    | existing                                                     | Plan resolution (unlimited plans skip the free reserve).                                                                                                                            |

## Migration

`supabase/migrations/20260703_atomic_generation_quota.sql` adds `reserve_generation`
and `refund_generation`. Already applied to the StudioAI project (`pvaalbzrorkonzgkvvnv`)
via the Supabase MCP. It is idempotent (`create or replace`); re-running is safe.

## Safe rollout (avoids mass-401 for existing users)

Existing users have a profile in localStorage but NO session cookie yet — they only
get one after they next sign in (which re-triggers the Google flow → `/api/session`).
If you flip straight to enforce, everyone 401s until they re-login.

1. Deploy with `AUTH_ENFORCE=log-only` and `SESSION_SECRET` set. In log-only,
   unauthenticated requests are allowed through (logged) so nothing breaks while the
   new client (which mints sessions on login) propagates. New logins get cookies.
2. Watch the logs for a day or two. `[auth] log-only: unauthenticated request` lines
   fall off as users cycle through login.
3. Remove `AUTH_ENFORCE` (or set to `enforce`). Now unauthenticated generation
   returns 401 and the client shows the "sign in again" state.

## What is NOT covered here (intentional follow-ups)

- **First-run activation flow** (the growth bet) — scoped, not built in this branch.
- **Framed reveal + "Verified: no fake lights" badge** — design item E7, follow-up.
- **Unlimited paid-tier COGS fair-use ceiling** — the review's separate margin finding.
- **RLS is disabled** on `generation_logs` (StudioAI project) and 12 tables in the
  ab-ops project including `payments`/`drafts`. Enabling RLS needs policies first
  (enabling without them blocks all access) — a dedicated security pass, not this PR.
