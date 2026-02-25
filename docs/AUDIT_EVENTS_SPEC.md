# Audit Events Specification (MVP)

## Required envelope fields

1. `event_type`
2. `actor_user_id`
3. `actor_role`
4. `brokerage_id`
5. `office_id` (optional)
6. `team_id` (optional)
7. `target_entity_type`
8. `target_entity_id`
9. `timestamp`
10. `source` (`ui` | `api` | `system`)
11. `before_snapshot` (optional)
12. `after_snapshot` (optional)
13. `reason` or `note` (optional but required for some transitions)
14. `request_id`

## Required event categories

1. Org structure changed
2. User invited
3. Membership changed
4. Preset created
5. Preset updated
6. Preset deleted
7. Job submitted
8. Status changed
9. Approval decision
10. Delivery created
11. Revision requested
12. Asset uploaded
13. Disclosure flag changed
14. Report export generated

## Implementation constraints

1. Event emission is part of mutation flow, not an optional background best effort.
2. Workflow transitions must emit events only after validation and mutation success.
3. Security-sensitive failures can emit separate validation or authorization events.

## Implementation reference

1. Audit event types and helper: `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/audit.ts`
