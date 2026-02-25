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

## Path B Brokerage Ops Handoff

Path B planning and implementation specs are documented here:

1. `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/PROJECT_CONTEXT.md`
2. `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/MVP_SCOPE.md`
3. `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/WORKFLOW_STATUS_SPEC.md`
4. `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/RBAC_MATRIX.md`
5. `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/PRESET_SPEC.md`
6. `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/AUDIT_EVENTS_SPEC.md`
7. `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/API_CONTRACTS.md`
8. `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/PILOT_READINESS_CHECKLIST.md`
9. `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/TEST_MATRIX_MVP.md`
10. `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/PATHB_CHECKPOINTS.md`

Starter policy and workflow code lives in:

- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/types.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/errors.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/rbac.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/workflow.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/audit.ts`

Sprint 1 API handlers currently available:

- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/bootstrap.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/brokerages.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/offices.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/teams.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/users.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/memberships.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/audit-events.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/presets.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/jobs.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/job-transition.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/review-queue.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/approvals.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/deliveries.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/revisions.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/job-detail.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/reports.ts`
- `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/report-export.ts`
