# Path B MVP Scope

## MVP objective

Prove brokerage-level workflow control over visual operations across offices, teams, and agents.

## In scope

1. Multi-tenant hierarchy: brokerage, office, team, user memberships
2. Role-based access control with scoped roles
3. Brokerage and office preset management
4. Job intake with preset-driven defaults
5. Canonical workflow status engine and transition validation
6. Approval routing using preset `approval_required`
7. Before and after archive with edit labels and versions
8. Delivery and revision loop tracking
9. Disclosure flag support and delivery note inclusion
10. Admin reporting metrics and CSV exports
11. Audit events for all critical actions

## Out of scope (MVP)

1. Drag-and-drop workflow builder
2. SSO and enterprise governance suite
3. Full billing and chargebacks
4. Public API program and broad integrations
5. Advanced custom permission editor
6. Deep white-label theming framework
7. AI scoring/recommendation engine

## MVP success criteria

1. Brokerage Admin configures offices, users, and presets
2. Agents submit jobs under scoped preset rules
3. Approval-required jobs route to review queue and support approve/reject/request-changes
4. Jobs move through canonical statuses with strict validation
5. Assets are versioned and labeled through revisions
6. Delivery captures disclosure context when required
7. Reporting shows usage, turnaround, and revision metrics by scope
8. Tenant isolation and RBAC are validated in backend tests
