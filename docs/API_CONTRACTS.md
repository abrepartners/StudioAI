# API Contracts (MVP Baseline)

## Envelope convention

### Success

```json
{
  "ok": true,
  "data": {},
  "requestId": "req_123"
}
```

### Error

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Transition Processing -> Submitted is not allowed",
    "details": {}
  },
  "requestId": "req_123"
}
```

## Core error codes

1. `VALIDATION_FAILED`
2. `FORBIDDEN`
3. `TENANT_SCOPE_VIOLATION`
4. `INVALID_TRANSITION`
5. `NOT_FOUND`
6. `CONFLICT`
7. `INTERNAL_ERROR`

## Candidate resource routes

1. `POST /api/pathb/jobs`
2. `GET /api/pathb/jobs`
3. `GET /api/pathb/jobs/:jobId`
4. `POST /api/pathb/jobs/:jobId/transitions`
5. `POST /api/pathb/jobs/:jobId/approvals`
6. `POST /api/pathb/jobs/:jobId/revisions`
7. `POST /api/pathb/jobs/:jobId/deliveries`
8. `GET /api/pathb/review-queue`
9. `GET /api/pathb/presets`
10. `POST /api/pathb/presets`
11. `POST /api/pathb/bootstrap`
12. `GET|POST /api/pathb/offices`
13. `GET|POST /api/pathb/teams`
14. `GET|POST /api/pathb/users`
15. `GET|POST /api/pathb/memberships`
16. `GET /api/pathb/audit-events`

## Request context requirements

1. Actor identity
2. Actor role(s)
3. Tenant scope (`brokerage_id`, optional `office_id`, optional `team_id`)
4. Request id for traceability

## Transition contract

`POST /api/pathb/jobs/:jobId/transitions`

```json
{
  "toStatus": "Delivered",
  "reason": "Required when rejecting or cancelling from processing",
  "revisionReasonCategory": "Composition mismatch",
  "outputAssetIds": ["asset_1", "asset_2"],
  "note": "Optional transition note"
}
```

Validation rules are defined in `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/workflow.ts`.
