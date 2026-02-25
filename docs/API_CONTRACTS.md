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
3. `POST /api/pathb/job-transition`
4. `GET /api/pathb/presets`
5. `POST /api/pathb/presets`
6. `POST /api/pathb/bootstrap`
7. `GET /api/pathb/brokerages`
8. `GET|POST /api/pathb/offices`
9. `GET|POST /api/pathb/teams`
10. `GET|POST /api/pathb/users`
11. `GET|POST /api/pathb/memberships`
12. `GET /api/pathb/audit-events`

## Request context requirements

1. Actor identity
2. Actor role(s)
3. Tenant scope (`brokerage_id`, optional `office_id`, optional `team_id`)
4. Request id for traceability

## Transition contract

`POST /api/pathb/job-transition`

```json
{
  "jobId": "job_123",
  "toStatus": "Delivered",
  "reason": "Required when rejecting or cancelling from processing",
  "revisionReasonCategory": "Composition mismatch",
  "outputAssetIds": ["asset_1", "asset_2"],
  "note": "Optional transition note"
}
```

Validation rules are defined in `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/workflow.ts`.
