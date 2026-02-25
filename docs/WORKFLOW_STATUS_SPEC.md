# Workflow Status Specification (MVP)

## Canonical statuses

1. `Draft`
2. `Submitted`
3. `In Review`
4. `Approved for Processing`
5. `Processing`
6. `Delivered`
7. `Revision Requested`
8. `Completed`
9. `Rejected`
10. `Cancelled`

## Allowed transitions

1. `Draft -> Submitted` (Agent, Office Admin, Brokerage Admin)
2. `Submitted -> In Review` (System when approval required)
3. `Submitted -> Approved for Processing` (System when no approval required)
4. `In Review -> Approved for Processing` (Reviewer, Office Admin, Team Lead if configured)
5. `In Review -> Rejected` (Reviewer, Office Admin, Team Lead if configured)
6. `In Review -> Draft` (Reviewer/Admin request changes before processing)
7. `Approved for Processing -> Processing` (Media Partner, Reviewer, System)
8. `Processing -> Delivered` (Media Partner, Reviewer, Office Admin)
9. `Delivered -> Revision Requested` (Agent, Team Lead, Office Admin, Brokerage Admin)
10. `Delivered -> Completed` (Agent, Office Admin, Brokerage Admin, System auto-close)
11. `Revision Requested -> Processing` (Media Partner, Reviewer)
12. `Revision Requested -> Cancelled` (Office Admin, Brokerage Admin)
13. `Rejected -> Draft` (Agent, Office Admin)
14. `Submitted -> Cancelled` (Agent, Office Admin, Brokerage Admin)
15. `Processing -> Cancelled` (Office Admin, Brokerage Admin; reason required)

## Metadata requirements

1. Reject transitions require `reason`
2. `Processing -> Cancelled` requires `reason`
3. `Processing -> Delivered` requires linked output assets
4. `Delivered -> Revision Requested` requires revision reason category

## Enforcement rules

1. Invalid transitions return typed error code `INVALID_TRANSITION`
2. Every valid transition emits an audit event
3. Failed transition attempts can emit validation or security events
4. Tenant scope and RBAC checks occur before transition mutation

## Implementation references

1. Transition constants: `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/workflow.ts`
2. Role checks: `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/rbac.ts`
3. Typed errors: `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/errors.ts`
