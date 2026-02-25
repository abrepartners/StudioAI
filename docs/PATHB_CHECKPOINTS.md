# Path B Checkpoints

Use this file as the rollback framework for major delivery sections.

## Checkpoint structure

Each checkpoint must include:

1. Section name
2. Git commit hash
3. What was completed
4. Rollback command
5. Known gaps

## Checkpoints

### CP-00 Foundation Specs + Policy Engine

1. Commit: `5b807d5`
2. Completed:
   1. Core Path B docs and shared specs
   2. Workflow transition rules and validators
   3. RBAC policy module
   4. Audit event builder
   5. Typed API error model
3. Rollback:
   1. `git checkout 5b807d5`
4. Gaps:
   1. No org CRUD endpoints yet
   2. No persistent org entities beyond beta stack

### CP-01 Sprint 1 Org APIs

1. Commit: `37bfe5d`
2. Completed:
   1. Bootstrap endpoint for first brokerage setup
   2. Offices/teams/users/memberships API handlers
   3. Tenant scope and RBAC checks in API path
   4. Path B storage adapter with KV + memory fallback
   5. Audit events persisted for org actions
3. Rollback:
   1. `git checkout 37bfe5d`
4. Gaps:
   1. No UI screens yet for org management
   2. No DB migrations layer yet (KV-backed scaffold)
   3. No presets/job workflow APIs yet

### CP-02 Sprint 2 Presets + Job Intake + Status Engine

1. Commit: `e7121c4`
2. Completed:
   1. Preset CRUD API with scope-based authorization
   2. Job intake API with preset-driven approval/disclosure defaults
   3. Asset linking at intake
   4. Status transition API enforcing canonical workflow map
   5. Audit events for submission, transitions, delivery, and revisions
3. Rollback:
   1. `git checkout e7121c4`
4. Gaps:
   1. No reviewer queue API yet
   2. No delivery/revision UI screens yet
   3. No reporting endpoints yet

### CP-03 Sprint 3 Approval Routing + Reviewer Queue

1. Commit: `TBD`
2. Completed:
   1. Reviewer queue endpoint scoped by role and tenant
   2. Approval decision endpoint (approve, reject, request changes)
   3. Approval records persisted per job
   4. Transition enforcement from `In Review` to approved/rejected/draft states
   5. Audit events for approval decisions and status mutations
3. Rollback:
   1. `git checkout <cp-03-hash>`
4. Gaps:
   1. No delivery/revision UI integration yet
   2. No reporting dashboards/exports yet
