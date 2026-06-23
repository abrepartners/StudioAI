# StudioAI — Work Queue

Durable backlog so in-flight asks survive session boundaries. Newest/blocking
items first. Update status inline; delete when shipped.

---

## 🔴 BLOCKED — Production: Supabase unreachable (env/config, not code)

`/api/brokerage` (and login-tracking, feedback) return `TypeError: fetch failed`
in production — the serverless functions can't reach Supabase. Most likely the
`SUPABASE_URL` / `SUPABASE_SERVICE_KEY` env vars did not carry over to the new
Vercel project in the merger, or the Supabase project is paused.

- **Action (owner: human, Vercel/Supabase dashboard):** confirm `SUPABASE_URL`
  + `SUPABASE_SERVICE_KEY` are set & correct for **Production** on the `studioai`
  Vercel project (`prj_5bWUJDyziQPxJxj1oJxoHhCIBogN`), then redeploy. Also verify
  the Supabase project isn't paused.
- **Blocks:** the Lawson task below, all brokerage/team management, login
  tracking, and the feedback box.

## 🟡 Lawson brokerage admin — verify & fix (after Supabase restored + greenlight)

Make sure `lawson@hdhomesar.com` (confirm exact address) is the **`admin_email`**
on her brokerage row — that's what grants the "add other users" capability via
`brokerage_agents` seats. The merger may have demoted her to an agent seat or
mis-assigned the admin. Verify the `brokerages` + `brokerage_agents` rows; if
wrong, set her as `admin_email` (and migrate any seats).

- Needs: working prod brokerage API **or** approved Supabase access in-session.
- Do not change anything until the user gives the explicit greenlight.

---

## 🟢 Feature: Open-concept multi-room staging (poor-man's, no engine rework)

Today virtual staging takes **one** room type per photo. For open-concept shots
(kitchen + dining + living in one frame) the agent can only pick one zone.

- **Approach:** make the room-type selector **multi-select** (chips/checkboxes).
  When >1 room is chosen, compose a single staging prompt that names each zone
  and its furniture set — e.g. "open-concept space containing a kitchen, dining
  area, and living room; stage each zone appropriately: <kitchen set>; <dining
  set>; <living set>…".
- **Touch points:** room-type UI in the staging panel (`VellumPhotoEditor`),
  and `buildStagingAssignment` in `src/.../stylePacks.ts` (already assembles
  furniture per room/pack — extend to concatenate multiple zones). Single-select
  stays the default.
- Build **after** the Lawson account is finalized.

## 🟢 Feature: Add "Media room / space" room type

Add **Media room/space** to the room-type options so staging generates the right
furniture for it (sectional/theater seating, media console, large screen or
projector, accent/cove lighting, acoustic touches).

- **Touch points:** room-type options list + the per-room furniture DNA in the
  staging packs/prompt builder (`stylePacks.ts`). Optionally teach the room
  classifier to detect it; at minimum make it manually selectable.
- Build **after** the Lawson account is finalized.

---

## ✅ Recently shipped / in review (context)
- **PR #29** — fix ESM `../shared/monetization` imports (add `.js`) that crashed
  `stripe-status` / `stripe-checkout` / `record-generation` on Node 24. Merge to
  restore billing/usage endpoints.
- Twilight now defaults to `google/nano-banana-pro` (merged #26/#27); prompt no
  longer invents lighting that isn't in the source.
