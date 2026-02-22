<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/004bcd9a-0d04-40be-86a2-247b31c99a5c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Beta Feedback Intake (Linear)

The beta feedback form posts to `/api/feedback` by default.

Server-side environment variables required for Linear issue creation:

- `LINEAR_API_KEY` - Linear personal/team API key
- `LINEAR_TEAM_ID` - Target team id for issue creation

Optional client override:

- `VITE_LINEAR_FEEDBACK_WEBHOOK` - custom feedback endpoint URL

## Beta Workflow Scope

Current beta keeps Design Studio focused on two active generation paths:

- `Text` mode (prompt-driven)
- `Packs` mode (preset-driven)

`Furniture` is visible in the mode switcher as `Coming Soon` and is intentionally disabled in this phase.

## Invite Gate and Referral Unlocks

Beta access and referral unlocks are handled by:

- `/api/beta-activate`
- `/api/beta-me`
- `/api/beta-share`
- `/api/beta-admin-login` (owner/admin session)
- `/api/beta-admin-codes` (generate/list root invite codes)

Recommended server-side env vars:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `BETA_ROOT_CODES` (comma-separated bootstrap invite codes)
- `BETA_ADMIN_SECRET` (required for owner login and invite code management)
- `APP_BASE_URL` (optional, used for invite link generation)

Milestones:

- `2` accepted invites => Insider
- `10` accepted invites => Pro 2K unlock

## Simplified Beta Access (Fast Launch)

For fast invite-only rollout, the frontend can run with manual code approval and shared invite links:

- `VITE_BETA_ACCESS_CODES` - comma-separated access codes allowed into the app
- `VITE_BETA_PRO_CODES` - optional comma-separated access codes that unlock Pro 2K
- `VITE_BETA_PRO_UNLOCK` - optional `true` to unlock Pro 2K for all codes

Example:

```bash
VITE_BETA_ACCESS_CODES=VELVET-EMBER-9Q4K,NORTHSTAR-GLASS-2T7M
VITE_BETA_PRO_CODES=VELVET-EMBER-9Q4K
```

Invite link format:

`https://<your-domain>/?invite=<ACCESS_CODE>`

## Owner Admin Bypass

If `BETA_ADMIN_SECRET` is configured, the beta gate shows an `Owner Login` action.

After owner login:

- Invite gate is bypassed for that device/session.
- You can generate root invite codes directly from the in-app `Access` panel.
- Generated codes are stored in KV and can be shared as:
  - `https://<your-domain>/?invite=<GENERATED_CODE>`
