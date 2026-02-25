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

1. User invited
2. Membership changed
3. Preset created
4. Preset updated
5. Preset deleted
6. Job submitted
7. Status changed
8. Approval decision
9. Delivery created
10. Revision requested
11. Asset uploaded
12. Disclosure flag changed
13. Report export generated

## Implementation constraints

1. Event emission is part of mutation flow, not an optional background best effort.
2. Workflow transitions must emit events only after validation and mutation success.
3. Security-sensitive failures can emit separate validation or authorization events.

## Implementation reference

1. Audit event types and helper: `/Users/camillebrown/.codex/workspaces/default/StudioAI/api/pathb/audit.ts`
