# RBAC Matrix (MVP Baseline)

## Scope model

1. Brokerage Admin: brokerage-wide scope
2. Office Admin: office scope
3. Team Lead: team scope (with optional approval capability)
4. Agent: own jobs and optional team-visible jobs
5. Media Partner: assigned jobs only (or assigned office in pilot mode)
6. Reviewer: assigned review scope

## Baseline permissions

| Permission | Brokerage Admin | Office Admin | Team Lead | Agent | Media Partner | Reviewer |
| --- | --- | --- | --- | --- | --- | --- |
| Manage brokerage users | Yes | No | No | No | No | No |
| Manage office users | Yes | Yes | No | No | No | No |
| Manage brokerage presets | Yes | No | No | No | No | No |
| Manage office presets | Yes | Yes | No | No | No | No |
| Submit jobs | Yes | Yes | Yes | Yes | No | No |
| View own jobs | Yes | Yes | Yes | Yes | Assigned only | Yes |
| View office jobs | Yes | Yes | Optional team only | No | Assigned only | Yes |
| Approve jobs | Yes | Yes | Optional | No | No | Yes |
| Process jobs | Yes | Optional | No | No | Yes | Optional |
| Deliver jobs | Yes | Yes | No | No | Yes | Yes |
| Request revision | Yes | Yes | Yes | Yes | No | Yes |
| Export reports | Yes | Yes | No | No | No | Optional |
| View audit trail | Yes | Yes | Limited | Own only | Assigned only | Scope limited |

## Server-side enforcement

1. RBAC checks are mandatory in API and service layers.
2. Scope check requires matching `brokerage_id` and contextual `office_id`/`team_id`.
3. UI-only hiding is not an authorization mechanism.

## Implementation references

1. Role templates and permission checks: `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/rbac.ts`
2. Typed auth and scope errors: `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/errors.ts`
