# Preset Specification (MVP)

## Purpose

Presets are the brokerage control layer. They constrain what agents can request and determine default workflow behavior.

## Preset scope rules

1. Brokerage presets are visible across brokerage scope.
2. Office presets are visible inside their office scope.
3. Agent intake can only select allowed presets for actor scope.
4. Presets can enforce default approval and disclosure behavior.

## Required fields

1. `id`
2. `name`
3. `scope_type` (`brokerage` or `office`)
4. `scope_id`
5. `active`
6. `allowed_edit_types` (array)
7. `default_settings_json` (JSON)
8. `approval_required` (boolean)
9. `disclosure_required_default` (boolean)
10. `delivery_notes_template` (text)
11. `revision_policy_template` (text)
12. `created_by`
13. `created_at`
14. `updated_at`

## Example presets

1. Standard Residential Listing Pack
2. Luxury Listing Pack
3. Twilight Exterior Pack
4. Virtually Staged Vacant Pack
5. Stale Listing Refresh Pack

## Validation requirements

1. `scope_type` must match entity constraints.
2. `scope_id` must belong to request tenant context.
3. `allowed_edit_types` must use approved edit label set.
4. `delivery_notes_template` and `revision_policy_template` are configurable text, not legal advice.
