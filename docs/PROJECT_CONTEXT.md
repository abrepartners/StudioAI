# Path B Project Context

## Product definition

Path B is a brokerage visual operations platform that standardizes listing visual enhancement requests, approvals, delivery, and reporting across brokerage, office, team, and agent scopes.

## MVP scope

The MVP proves that a brokerage can enforce preset-driven workflows with auditability:

1. Brokerage and office scoped preset controls
2. Job intake and tenant-scoped workflow
3. Approval routing and review queue
4. Delivery and revision tracking
5. Before and after archive with edit labels
6. Disclosure flags and delivery note support
7. Admin operational reporting and CSV exports

## Non-goals (MVP)

1. Visual workflow builder
2. SSO
3. Full billing or chargeback engine
4. Public API platform
5. Heavy enterprise governance features
6. Deep third-party integrations unless pilot-critical

## User roles

1. Brokerage Admin
2. Office Admin
3. Team Lead
4. Agent
5. Media Partner
6. Reviewer

## Canonical references

1. Workflow statuses and transitions: `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/WORKFLOW_STATUS_SPEC.md`
2. RBAC matrix: `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/RBAC_MATRIX.md`
3. Preset rules: `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/PRESET_SPEC.md`
4. Audit requirements: `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/AUDIT_EVENTS_SPEC.md`
5. API conventions: `/Users/camillebrown/.codex/workspaces/default/StudioAI/docs/API_CONTRACTS.md`

## Coding standards

1. Tenant isolation is enforced server-side for every read and write.
2. RBAC checks are enforced in service and handler layers.
3. UI gating is convenience only and cannot replace server checks.
4. Every workflow transition must be validated against canonical transition rules.
5. Significant actions must emit audit events with actor and scope context.
6. Typed API errors are returned for invalid transitions, RBAC failures, and tenant-scope violations.

## API conventions

1. REST endpoints with scoped route patterns and explicit validation.
2. JSON responses use a stable `ok` envelope.
3. Error responses use typed codes and include `requestId`.
4. Mutation endpoints include actor and tenant context.
5. Audit event emission occurs in the same command path as state mutation.

## Test expectations

1. Unit tests for status transition rules and RBAC policy checks.
2. Integration tests for tenant-scoped API access.
3. Workflow tests for approval-required and no-approval paths.
4. Audit assertion tests for transitions, approvals, deliveries, and revisions.
5. CSV export contract tests for reporting.

## Definition of done

A feature is done only when all are true:

1. Schema and API changes are documented.
2. RBAC and tenant scope checks are implemented.
3. Workflow transitions and metadata rules are enforced.
4. Required audit events are emitted.
5. Tests cover happy path plus permission and invalid transition cases.
6. Rollback considerations are documented for risky changes.
