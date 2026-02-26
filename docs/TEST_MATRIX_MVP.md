# MVP Test Matrix

## Unit tests

1. Workflow transition map allows only canonical transitions.
2. Metadata requirements are enforced per transition.
3. RBAC template permissions resolve correctly by role.
4. Scope resolution blocks out-of-scope access attempts.
5. Typed API errors serialize with stable error codes.

## Integration tests

1. Job submission applies preset defaults by scope.
2. Approval-required jobs move to `In Review`.
3. No-approval jobs move to `Approved for Processing`.
4. Approval actions enforce reviewer/admin/team lead permissions.
5. Delivery endpoint rejects missing output assets.
6. Revision request rejects missing revision reason category.
7. Tenant isolation blocks cross-brokerage reads and writes.
8. Audit events emit for submission, transition, approval, delivery, revision.

## End-to-end tests

1. Agent submits job and tracks status changes.
2. Reviewer approves or rejects and captures decision note.
3. Media partner processes and delivers assets.
4. Agent requests revision and cycle continues.
5. Office admin exports scoped reports.

## Regression coverage

1. Invalid transition attempts do not mutate job state.
2. Unauthorized users receive `FORBIDDEN`.
3. Scope violations receive `TENANT_SCOPE_VIOLATION`.
4. Audit events include actor/scope/target/request id.

## Data sets

1. Multi-office seeded brokerage with mixed role memberships.
2. Jobs seeded across all canonical statuses.
3. Presets covering approval-required and no-approval scenarios.
4. Assets with before/after and revision versions.
