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

Recommended server-side env vars:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `BETA_ROOT_CODES` (comma-separated bootstrap invite codes)
- `APP_BASE_URL` (optional, used for invite link generation)

Milestones:

- `2` accepted invites => Insider
- `10` accepted invites => Pro 2K unlock
