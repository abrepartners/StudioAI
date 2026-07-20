# Vellum Revenue Operator

## Claude Code Master Architecture and Build Brief

**Owner:** Thomas Brown  
**Business:** Avery & Bryant / Vellum  
**Primary product:** https://vellum.homes  
**Operating timezone:** America/Chicago  
**Mission window:** 90 calendar days beginning when Thomas authorizes execution  
**Primary objective:** Collect $50,000 in new revenue while maintaining at least a 60% margin after generation costs, software, payment fees, refunds, and acquisition spending.

---

## 1. How to use this brief

Place this file in the Vellum repository at:

`docs/VELLUM_REVENUE_OPERATOR_MASTER_BRIEF.md`

Then start Claude Code from the repository root and paste the prompt in Section 31.

Claude Code must begin with a read-only architecture audit. It must not immediately build, install packages, alter production, change prices, create accounts, or modify data.

The repository and live infrastructure are the source of truth. When this brief conflicts with verified implementation details, Claude Code must document the conflict and recommend a resolution. It must not silently assume the brief is correct.

---

## 2. Why this architecture exists

The workflow shown in the reference screenshots is directionally correct:

1. Break the business outcome into workflows.
2. Break each workflow into observable steps.
3. Convert repeatable procedures into `SKILL.md` files.
4. Give specialized agents only the skills and tools they need.
5. Pass structured outputs between agents.
6. Repeat and improve the system.

For a production revenue operation, the following must also exist:

- A durable orchestrator
- A shared event and decision ledger
- Explicit input and output schemas
- Permission and approval enforcement
- Idempotency and retry protection
- Financial controls
- Schedules and event triggers
- Quality evaluations
- Audit logs
- Incident response
- Automatic rollback
- Human escalation rules

Skills describe how work should be performed. Skills alone do not create a safe autonomous business.

---

## 3. Skill, agent, and workflow definitions

| Component | Purpose | Example |
| --- | --- | --- |
| Skill | Reusable SOP or method | Build a compliant funding request |
| Subagent | Specialized Claude Code worker with limited context and tools | Finance and Risk Reviewer |
| Runtime worker | Deployed service that performs one bounded production job | Send an approved email sequence |
| Workflow | Durable sequence of events, decisions, waits, and retries | Trial signup to paid annual customer |
| Orchestrator | Chooses which workflow or worker runs next | Vellum Revenue Operator |
| Policy engine | Deterministically allows, blocks, or requests approval | Block an unapproved price change |

Do not treat Claude Code subagents as the permanent 24-hour production runtime. Use them to audit, design, build, test, review, and maintain the deployed system.

The production operator must run through durable application services, scheduled jobs, webhooks, queues, and approved model calls.

---

## 4. Known business state

Treat the following as discovery context. Verify each item against the repository, Stripe, production configuration, and live behavior before relying on it.

- Vellum is live at `vellum.homes`.
- A customer can sign up, pay, generate, and download without manual fulfillment.
- Vellum currently has approximately three or four subscribers.
- The product has not yet been intentionally built for discovery, SEO, AEO, social distribution, or outbound growth.
- Current image quality and architectural preservation are believed to be strong.
- The largest current product gap is onboarding.
- Desired differentiation includes image-to-video and listing-video capabilities.
- Avery & Bryant owns the listing photos and media that will be used for before-and-after marketing examples.
- Existing Avery & Bryant clients, followers, email relationships, brand credibility, portfolio, and audience may be used.
- Avery & Bryant team members must not be required to fulfill or operate this venture.
- Thomas acts as the bank and approval authority, not the daily operator.
- Revenue may be reinvested only within an approved funding tier.
- Current public pricing appears to include Free, Pro, Team, and pay-as-you-go credits.
- Existing customer grandfathering must be preserved unless Thomas explicitly approves a change.

Current public pricing must be verified before implementation. Do not hard-code this summary without checking the source of truth:

- Free: five initial edits, then one per day
- Pro: $59 monthly or $564 annually
- Team: $149 monthly or $1,428 annually
- Credits: 10 for $15, 25 for $29, and 75 for $69
- Early Bird and current Pro grandfathering language exists publicly

---

## 5. Success definition

### Primary outcome

- $50,000 in new cash successfully collected during the 90-day mission.

### Required financial constraint

- At least 60% margin after all operating, generation, payment, refund, software, and acquisition costs.

### Planning revenue mix

The following is a hypothesis, not approved pricing:

| Offer | Quantity | Cash per sale | Cash collected |
| --- | ---: | ---: | ---: |
| Vellum Partner Annual | 12 | $2,500 | $30,000 |
| Team Annual | 10 | $1,428 | $14,280 |
| Pro Annual | 11 | $564 | $6,204 |
| Total | 33 |  | $50,484 |

The proposed Vellum Partner Annual plan requires Thomas's approval before it is shown, offered, pre-sold, added to Stripe, or sold.

### Supporting outcomes

- Determine true cost per successful generation by tool.
- Improve time from signup to first successful result.
- Establish a repeatable customer-acquisition channel.
- Establish autonomous customer support.
- Establish rights-safe before-and-after content production.
- Establish safe video generation with architectural-integrity checks.
- Produce passive weekly reporting.
- Preserve current customer access and grandfathering.

---

## 6. Non-negotiable authority model

### Thomas must approve

- Every pricing change
- Every new plan or paid offer
- Every funding-tier increase
- Initial onboarding before launch
- Major onboarding redesigns
- New recurring vendors outside an approved budget envelope
- Refunds above $100 to one customer
- Irreversible database changes
- Destructive migrations
- Legal settlements or public legal statements
- Public incident statements
- Any use of Thomas's likeness, name, cloned voice, or synthetic avatar

### The system may handle autonomously

- Research and analysis
- Non-price landing-page experiments
- Approved offer positioning and copy
- Small onboarding copy, ordering, tooltip, and tutorial tests after the initial onboarding is approved
- Analytics instrumentation
- Content creation using rights-owned media
- Publishing through authorized and policy-compliant connections
- Compliant outbound messaging within approved limits
- Follow-up sequences and trial nurturing
- Support responses
- Credits and refunds up to $100 per customer
- Code deployments through staged rollout and rollback controls
- Video-feature development after SOP and quality gates exist
- Weekly reporting

### Permanently prohibited

- Fake reviews, testimonials, results, followers, scarcity, or engagement
- Deceptive subject lines, claims, or sender identities
- Impersonating Thomas or another person
- Buying followers or engagement
- Circumventing platform policies, audits, rate limits, or authentication
- Selling or repurposing customer data
- Uploading customer data into unrelated systems
- Claiming Vellum causes faster home sales without defensible evidence
- Hiding material property defects
- Removing permanent property features in a misleading way
- Publishing AI-edited real estate media without required disclosure
- Debt, credit, or spending anticipated revenue
- Unapproved price changes
- Unapproved capital-tier increases

---

## 7. Human interruption boundary

Thomas should only be interrupted for:

- Funding requests
- Pricing requests
- Initial or major onboarding approvals
- Security breaches
- Suspected fraud with material exposure
- Legal threats
- Serious compliance risks
- Payment outages that cannot self-recover
- Production outages that cannot self-recover
- Irreversible infrastructure or database changes

Everything else should be resolved automatically or summarized in the weekly Telegram report.

---

## 8. Phase 0 read-only repository audit

Claude Code must inspect before proposing implementation.

### Repository instructions

1. Read all root instructions, including `CLAUDE.md`, `AGENTS.md`, README files, package manifests, hosting configuration, and infrastructure documentation.
2. Keep the root `CLAUDE.md` concise. Target fewer than 200 lines.
3. Do not print secret values.
4. Inventory environment-variable names only.
5. Do not modify files during the audit.
6. Do not install dependencies.
7. Do not access production customer content unless required and authorized.
8. Do not run migrations.
9. Do not change Stripe products or prices.
10. Do not create external accounts.

### Audit areas

- Application framework and runtime
- Hosting and deployment platform
- Database and current schema
- Authentication
- User roles and permissions
- Current billing implementation
- Stripe products, prices, webhooks, and customer portal
- Credits, entitlements, and grandfathering logic
- AI image-generation providers and models
- Generation cost observability
- Job queue and retry behavior
- Asset storage and deletion
- Analytics and event tracking
- Email and notification infrastructure
- Existing Telegram integration
- Existing API endpoints
- Existing MCP servers
- Social publishing integrations
- Support tooling
- Error monitoring
- Tests and fixtures
- CI and deployment controls
- Backup and rollback process
- Security boundaries
- Privacy and customer-data handling

### Required Phase 0 documents

Create these only after the read-only inspection is complete:

- `docs/architecture/current-state.md`
- `docs/architecture/gap-analysis.md`
- `docs/architecture/target-state.md`
- `docs/architecture/data-model-proposal.md`
- `docs/architecture/tool-and-action-contracts.md`
- `docs/architecture/approval-matrix.md`
- `docs/architecture/implementation-plan.md`
- `docs/architecture/risk-register.md`
- `docs/architecture/decision-log.md`

Phase 0 ends with an Architecture Checkpoint. Claude Code must show:

- What already exists
- What can be reused
- What is missing
- What is dangerous
- What should be built first
- Three implementation options when a material architectural choice exists
- Its recommendation and reasoning
- Expected costs and external dependencies
- Items requiring Thomas's approval

Do not begin Phase 1 until Thomas approves the Phase 0 plan.

---

## 9. Target production architecture

The target should contain the following logical layers. Adapt implementation choices to the verified repository stack.

### Layer 1: Vellum application

- Customer-facing application
- Authentication
- Image and video tools
- Projects and assets
- Subscription and entitlement experience
- Onboarding
- Help and support

### Layer 2: Operational API

Provide bounded, authenticated actions for:

- Customer and account reads
- Subscription and entitlement reads
- Usage and generation-cost reads
- Trial and funnel-event reads
- Experiment creation and updates
- Content-asset creation
- Publishing requests
- Support-ticket actions
- Credit and refund requests
- Deployment requests
- Funding and pricing request creation

Do not expose raw database mutation as an agent tool.

### Layer 3: Policy and approval engine

Every sensitive action must be evaluated deterministically before execution.

The policy engine must return one of:

- `allow`
- `deny`
- `requires_approval`
- `allow_with_limits`

The model cannot override this result.

### Layer 4: Durable workflow engine

Support:

- Scheduled jobs
- Webhook-triggered jobs
- Retries
- Delayed follow-up
- Wait-for-approval states
- Idempotency
- Timeouts
- Compensation and rollback
- Dead-letter handling

Choose the workflow technology after inspecting the existing stack. Prefer the smallest reliable addition.

### Layer 5: Revenue operator

The revenue operator reasons over approved data and selects from registered workflows. It must not invent actions that have no registered tool or contract.

### Layer 6: Observability and ledger

Record:

- Trigger
- Input
- Decision
- Evidence
- Agent or workflow version
- Tools requested
- Policy result
- Approval result
- Actions taken
- Costs
- Revenue attribution
- Outcome
- Errors
- Retries
- Rollbacks

---

## 10. Proposed data model

Audit the current schema before creating anything. Reuse current entities where safe.

### Identity and customer

- `accounts`
- `users`
- `roles`
- `account_memberships`
- `customer_profiles`

### Billing and entitlement

- `products`
- `price_versions`
- `subscriptions`
- `entitlements`
- `usage_ledger`
- `generation_cost_ledger`
- `refunds`
- `credits`

### Growth and sales

- `market_segments`
- `prospect_accounts`
- `prospect_contacts`
- `suppression_list`
- `outreach_sequences`
- `outreach_messages`
- `opportunities`
- `attribution_events`
- `affiliate_partners`
- `referrals`

### Experiments and content

- `experiments`
- `experiment_variants`
- `experiment_assignments`
- `experiment_events`
- `content_assets`
- `content_variants`
- `publications`
- `publication_metrics`

### Product operations

- `projects`
- `source_assets`
- `generations`
- `generation_evaluations`
- `video_jobs`
- `video_evaluations`
- `support_tickets`

### Governance

- `budget_envelopes`
- `spend_requests`
- `pricing_requests`
- `approval_decisions`
- `policy_decisions`
- `agent_runs`
- `workflow_runs`
- `tool_calls`
- `incidents`
- `deployments`
- `rollbacks`
- `daily_scorecards`

### Required schema behaviors

- Immutable financial and approval history
- Price-version history
- Grandfathered entitlement preservation
- Idempotency keys for webhooks and external actions
- Soft deletion where recovery matters
- Explicit retention and deletion policy for customer assets
- No secrets stored in application tables

---

## 11. Production action contracts

Every agent-facing action must define:

- Action name
- Business purpose
- Trigger
- Required inputs
- Input schema
- Output schema
- Authentication scope
- Policy checks
- Approval requirements
- Idempotency behavior
- Maximum cost
- Timeout
- Retry policy
- Rollback or compensation behavior
- Audit events
- Error codes

Examples:

- `get_daily_revenue_scorecard`
- `get_generation_unit_economics`
- `create_experiment_draft`
- `activate_approved_experiment`
- `create_funding_request`
- `create_pricing_request`
- `issue_customer_credit`
- `issue_customer_refund`
- `create_content_batch`
- `publish_approved_content`
- `start_outreach_sequence`
- `pause_outreach_sequence`
- `deploy_canary_release`
- `rollback_release`
- `freeze_revenue_operator`

---

## 12. Telegram bank and approval system

Prefer the existing Telegram bot when it can be safely isolated by chat and topic ID. Do not create a second bot unless the audit proves it is necessary.

Use a dedicated Vellum Revenue Operator topic.

### Buttons

- Approve
- Deny
- Request More Evidence

### Funding request payload

- Request ID
- Requested amount
- Funding tier
- Spending category
- Vendor or destination
- Hypothesis
- Comparable-market evidence
- Vellum internal evidence
- Current sample size
- Expected revenue
- Expected margin
- Expected payback window
- Maximum downside
- Automatic stop condition
- Expiration time

### Pricing request payload

- Request ID
- Current offer
- Proposed offer
- Customer segment
- External evidence
- Internal evidence
- Revenue model
- Cost model
- Existing-customer impact
- Grandfathering plan
- Refund and cancellation impact
- Experiment duration
- Rollback plan

### Approval security

- Verify Telegram webhook signatures or equivalent trusted source controls.
- Bind approval to request ID, action, maximum amount, and expiration.
- Make approvals single-use.
- Log the approver identity and Telegram message ID.
- Ignore duplicate callback deliveries.
- A denial cannot be resubmitted unchanged.
- A new request after denial must contain new evidence or a materially different proposal.
- Provide a global freeze command.

---

## 13. Earned-aggression capital model

### Tier 0: Bootstrap

- Maximum initial external capital: $100
- Research, infrastructure minimums, and micro-tests only

### Tier 1: Validation

- Maximum approved envelope: $250
- Requires promising internal conversion signals or the first attributable sale

### Tier 2: Repeatability

- Maximum approved envelope: $1,000
- Requires multiple attributable sales and acceptable acquisition cost

### Tier 3: Aggressive scale

- Maximum possible reinvestment: 40% of collected cash
- Requires two or more successful cohorts
- Requires at least 60% margin after all costs
- Requires Thomas's explicit approval

### Default stop conditions

- Stop an experiment after $100 in attributable spend with no customer.
- Do not scale when acquisition cost exceeds 20% of first-year collected cash.
- Pause when total margin falls below 60%.
- Pause when generation quality falls below the approved threshold.
- Pause when refund, complaint, chargeback, or deliverability indicators become unsafe.
- Never borrow or spend anticipated revenue.

---

## 14. Claude Code project structure

Claude Code should inspect the current `.claude` directory before adding or changing anything.

Recommended structure after approval:

```text
.claude/
  agents/
    architecture-auditor.md
    revenue-governor.md
    product-operator.md
    growth-operator.md
    sales-operator.md
    customer-operator.md
    finance-risk-operator.md
    qa-security-reviewer.md
  skills/
    audit-current-state/
      SKILL.md
    calculate-unit-economics/
      SKILL.md
    build-funding-request/
      SKILL.md
      template.md
      examples/
    build-pricing-request/
      SKILL.md
      template.md
    design-experiment/
      SKILL.md
    analyze-experiment/
      SKILL.md
    optimize-onboarding/
      SKILL.md
    research-market/
      SKILL.md
    create-content-batch/
      SKILL.md
    validate-content-compliance/
      SKILL.md
    prospect-businesses/
      SKILL.md
    run-compliant-outreach/
      SKILL.md
    nurture-trial/
      SKILL.md
    onboard-customer/
      SKILL.md
    resolve-support/
      SKILL.md
    issue-credit-or-refund/
      SKILL.md
    generate-property-video/
      SKILL.md
    evaluate-property-integrity/
      SKILL.md
    deploy-canary/
      SKILL.md
    rollback-release/
      SKILL.md
    reconcile-revenue/
      SKILL.md
    create-weekly-report/
      SKILL.md
    respond-to-incident/
      SKILL.md
  rules/
    approvals.md
    brand-and-claims.md
    financial-safety.md
    property-media-integrity.md
    security-and-privacy.md
  settings.json
CLAUDE.md
```

Keep `CLAUDE.md` focused on permanent project facts, architecture, build commands, safety rules, and where deeper documentation lives. Put multi-step procedures in project skills.

---

## 15. Required Claude Code subagents

Use project subagents for build and maintenance work. Give each only the tools and skills required for its role.

### Architecture Auditor

- Read-only by default
- Maps current state
- Identifies reuse, gaps, risks, and dependencies
- Cannot deploy or modify production

### Revenue Governor

- Evaluates proposed actions against policies
- Builds funding and pricing requests
- Cannot approve its own request
- Cannot spend money
- Cannot change prices

### Product Operator

- Onboarding
- Analytics
- Experiments
- Product changes
- Staged deployments
- Automatic rollback

### Growth Operator

- Research
- Content
- SEO and AEO
- Affiliate workflows
- Outreach planning
- Cannot change prices or exceed approved budgets

### Sales Operator

- Trial nurturing
- Personalized product education
- Checkout recovery
- Annual-plan conversion
- Cannot make unapproved discounts or claims

### Customer Operator

- Support
- Onboarding assistance
- Credits and refunds within policy
- Escalates security, fraud, legal, or high-value exceptions

### Finance and Risk Operator

- Reconciles collected cash and costs
- Calculates margins
- Monitors refund and acquisition risk
- Builds passive reports
- Cannot move money

### QA and Security Reviewer

- Reviews code and workflow changes
- Validates tests and threat controls
- Verifies approval enforcement
- Verifies rollback readiness
- Blocks unsafe release candidates

Use worktree isolation for independent code-changing subagents where supported and appropriate.

Do not rely on experimental Claude Code agent teams as a production dependency. They may be used during development only when Thomas explicitly authorizes parallel team work.

---

## 16. Skill file standard

Each project skill must be bounded, testable, and reusable.

Use only currently supported Claude Code frontmatter fields. At minimum:

```markdown
---
name: skill-name
description: Exact description of when Claude should invoke this skill.
---
```

The body must contain:

1. Purpose
2. Exact trigger
3. Preconditions
4. Required inputs
5. Input schema
6. Allowed tools and actions
7. Forbidden tools and actions
8. Ordered procedure
9. Decision table
10. Output schema
11. Quality checks
12. Perfect-output example
13. Common mistakes
14. Failure and retry behavior
15. Escalation conditions
16. Metrics recorded
17. Test fixtures or validation script when useful

### Skill-writing rules

- Use observable language.
- Never use vague steps such as "make it better."
- Define what evidence is sufficient.
- Define what happens when data is missing.
- Define what happens when tools fail.
- Define maximum retries.
- Define the idempotency key.
- Define when the workflow must stop.
- Define the structured handoff to the next workflow.
- Keep the main `SKILL.md` focused and move long references or examples into adjacent files.

---

## 17. Handoff contract standard

Do not pass unstructured prose between workflows when a structured contract is possible.

Every handoff should include:

```json
{
  "workflow_run_id": "string",
  "source_workflow": "string",
  "destination_workflow": "string",
  "objective": "string",
  "inputs": {},
  "evidence": [],
  "decisions": [],
  "constraints": [],
  "approval_state": "not_required | pending | approved | denied | expired",
  "budget_state": {},
  "quality_score": 0,
  "risks": [],
  "next_action": "string",
  "created_at": "ISO-8601"
}
```

Validate contracts at workflow boundaries.

One worker's failure must not corrupt downstream state.

---

## 18. Department workflow map

### Research

`market scan -> comparable evidence -> segment hypothesis -> opportunity score -> growth handoff`

### Offer

`segment evidence -> offer hypothesis -> unit economics -> pricing request -> approval -> controlled launch`

### Content

`research -> ideation -> script -> asset generation -> property-integrity review -> compliance review -> publishing -> performance analysis`

### Outbound

`prospect discovery -> qualification -> contact verification -> suppression check -> personalization -> compliance check -> send -> follow-up -> reply classification -> trial or checkout`

### Product-led sales

`visit -> signup -> first upload -> successful result -> value education -> usage milestone -> annual offer -> checkout -> onboarding`

### Customer success

`ticket or signal -> classification -> account context -> resolution -> credit or refund policy -> customer response -> quality review -> close or escalate`

### Video

`source validation -> motion-plan selection -> generation -> architectural-integrity evaluation -> visual-quality evaluation -> retry or reject -> export -> disclosure metadata`

### Finance

`payment event -> reconciliation -> attributed revenue -> variable cost -> acquisition cost -> margin -> funding eligibility -> scorecard`

### Product deployment

`approved change -> tests -> security review -> canary -> health check -> conversion check -> expand or rollback`

---

## 19. Event triggers

Prefer event-driven workflows over polling when a reliable event exists.

Required triggers should include:

- User registered
- Trial started
- First photo uploaded
- First generation requested
- Generation succeeded
- Generation failed
- First export completed
- Checkout started
- Payment succeeded
- Payment failed
- Subscription changed
- Subscription canceled
- Refund requested
- Support ticket created
- Content asset approved
- Content published
- Outreach reply received
- Unsubscribe received
- Funding request approved, denied, or expired
- Pricing request approved, denied, or expired
- Deployment started
- Deployment health degraded
- Security alert created

Every external webhook must be signature-verified, deduplicated, and safe to replay.

---

## 20. Proposed operating schedules

Final schedules must be adjusted after the audit and channel connection review.

### Continuous or frequent

- Process queued jobs as events arrive
- Reconcile webhooks and failed jobs every 15 minutes
- Check production health every 15 minutes using deterministic monitoring
- Route support as events arrive
- Freeze affected workflows immediately after a critical policy or security event

### Daily, America/Chicago

- 05:30: Reconcile prior-day revenue, refunds, fees, and generation costs
- 06:00: Produce daily scorecard and forecast
- 06:30: Review experiment health and stop-loss conditions
- 07:00: Build the day's approved content batch
- 08:00: Run compliant outbound during recipient-appropriate business hours
- 12:00: Evaluate early content and funnel signals
- 16:30: Process follow-up and checkout-recovery queues
- 20:00: Run data-quality, job-failure, and ledger-consistency checks

### Weekly

- Monday 06:30: Market, competitor, and channel evidence review
- Monday 07:30: Select weekly experiments within the approved tier
- Wednesday 12:00: Midweek experiment checkpoint
- Friday 15:30: Financial and margin reconciliation
- Friday 16:00: Passive Telegram executive report

### Schedule rules

- Do not use an LLM for a deterministic health check.
- Do not send outbound outside compliant and reasonable hours.
- Do not post at fixed times merely because they were configured initially. Optimize timing from observed data within platform limits.
- All scheduled jobs must be idempotent.
- Missed schedules must have a documented catch-up policy.

---

## 21. Content engine

Use Avery & Bryant's rights-owned media as the primary demonstration library.

### Core content formats

- Before-and-after virtual staging
- Day-to-dusk reveals
- Cleanup transformations
- Lawn and sky improvement examples
- What changed versus what remained structurally accurate
- One listing photo turned into multiple marketable assets
- Real estate media-company margin examples
- Agent workflow time savings
- Image-to-motion examples
- Failure examples and what Vellum correctly rejected

### Content requirements

- Preserve center-safe framing for short-form reuse.
- Remove identifying addresses by default.
- Include required AI or virtual-staging disclosure.
- Never claim a property feature exists when it does not.
- Never publish an output that fails the architectural-integrity evaluation.
- Create channel-specific copy instead of using one generic caption everywhere.
- Track every asset to signup, trial activation, payment, and revenue where possible.

### Channel order

1. Existing Avery & Bryant audience
2. Email and referral relationships
3. YouTube Shorts
4. Instagram when authorized publishing is available
5. TikTok only after required developer approval and public-posting eligibility
6. X only when expected return justifies current API costs

Do not make TikTok a day-one dependency.

---

## 22. Outreach and compliance

The system may conduct compliant business outreach after infrastructure and policy review.

### Required controls

- Accurate sender identity
- Accurate and non-deceptive subject line
- Clear business purpose
- Valid physical mailing address where required
- One-click unsubscribe where required or expected
- Immediate suppression-list updates
- No contact after opt-out
- SPF, DKIM, and DMARC configuration
- Separate outreach infrastructure that does not endanger Avery & Bryant's primary domain
- Conservative initial sending volume
- Bounce, complaint, reply, and conversion monitoring
- Automatic pause before reputation becomes unsafe
- No prohibited scraping or platform circumvention

### Evidence priority

Rank evidence in this order:

1. Collected payment
2. Activated paid customer
3. Activated trial
4. Qualified positive response
5. Click or landing-page engagement
6. View, like, or impression

Do not scale based on likes or views when payments disagree.

---

## 23. Onboarding system

The initial onboarding must be designed and shown to Thomas before release.

### Desired first-session outcome

A new user should understand Vellum, upload a valid image, generate a successful result, and know what to do next without contacting a person.

### Onboarding components

- Role or use-case selection
- One-sentence product promise
- Rights and disclosure acknowledgment
- Photo-quality guidance
- Guided first upload
- Recommended first tool
- Progress feedback
- Result evaluation tips
- Export guidance
- Next-best action
- Plan explanation without unapproved price changes
- In-app help

### Autonomous tests allowed after initial approval

- Copy
- Step order
- Tooltips
- Tutorial format
- Tutorial length
- Default first tool
- Progress indicators
- Empty-state content

### Major changes requiring approval

- Entire navigation model
- New pricing placement or framing
- Removing required disclosures
- Major visual redesign
- New onboarding data collection
- New account requirements

---

## 24. Video capability and SOP

Video is a differentiator, but it must not delay initial distribution of the existing image product.

### Phase order

1. Launch and measure current image workflows.
2. Establish video use cases.
3. Create prompt and motion templates.
4. Build automated quality evaluation.
5. Test with rights-owned Avery & Bryant assets.
6. Define costs and entitlements.
7. Submit any pricing impact to Thomas.
8. Release to a small approved cohort.
9. Measure retention, cost, support, and conversion.

### Required video SOP fields

- Eligible source-image criteria
- Ineligible source-image criteria
- Motion objective
- Camera-movement class
- Elements that must remain fixed
- Elements allowed to move
- Maximum motion strength
- Duration and aspect ratio
- Model and prompt-template version
- Generation-cost ceiling
- Architectural-integrity checks
- Visual-quality checks
- Retry policy
- Rejection policy
- Disclosure and export metadata

### Automatic rejection examples

- Walls, windows, doors, stairs, counters, or built-ins change
- Room proportions shift
- Permanent fixtures appear or disappear
- Exterior geometry changes
- Address or signage becomes misleading
- Motion creates impossible physical behavior
- Faces or people appear unexpectedly
- Output falls below resolution or artifact thresholds

---

## 25. Customer support, credits, and refunds

### Autonomous support scope

- Login and access help
- Upload guidance
- Tool selection
- Generation status
- Failed generation recovery
- Export help
- Disclosure guidance
- Subscription navigation
- Credit restoration for qualified technical failures
- Refunds up to $100 under approved policy

### Must escalate

- Refund above $100
- Fraud indicators
- Chargeback threat
- Legal threat
- Security or privacy concern
- Repeated generation failure indicating systemic defect
- Customer demands a promise or claim outside policy

### Support quality

- Personable and concise
- Never blame the customer
- Never promise unsupported outcomes
- Provide a clear next action
- Record resolution type and root cause
- Feed repeated issues into product prioritization

---

## 26. Analytics and scorecards

### North-star metrics

- New cash collected
- Contribution margin
- Remaining amount to $50,000
- Forecasted 90-day cash collected

### Funnel metrics

- Visitor to signup
- Signup to first upload
- First upload to successful result
- Successful result to export
- Trial to paid
- Monthly to annual
- Partner-plan conversion
- Checkout recovery

### Product metrics

- Cost per successful generation by tool
- Generation failure rate
- Average retries
- Time to result
- Architectural-integrity pass rate
- Video acceptance rate
- Support contacts per active account

### Growth metrics

- Qualified prospects
- Delivery rate
- Bounce rate
- Unsubscribe rate
- Complaint rate
- Positive reply rate
- Trial activation by source
- Customer acquisition cost
- Payback period
- Revenue by channel, campaign, and content asset

### Risk metrics

- Refund rate
- Chargeback events
- Margin by plan
- Budget used versus approved
- Policy denials
- Approval requests and outcomes
- Production incidents
- Rollback frequency

---

## 27. Experiment standard

Every experiment must have:

- Hypothesis
- Target segment
- Control and variation
- Primary metric
- Guardrail metrics
- Minimum sample or observation window
- Maximum spend
- Stop-loss rule
- Expected mechanism
- Attribution method
- Decision rule
- Follow-up action

### Funding evidence requirement

An aggressive funding request must include:

1. Evidence from at least three relevant and current comparable examples when available
2. An explanation of why the examples apply to Vellum
3. Vellum's own micro-test results
4. Actual payments or strong activation evidence
5. A specific mechanism for multiplying the result
6. Expected margin after scale
7. Maximum downside
8. Automatic stop condition

The phrase "10x" must refer to speed, volume, variation, automation, or distribution efficiency. It must never excuse multiplying an unproven expense.

---

## 28. Deployment and recovery

### Required release process

1. Static checks
2. Unit tests
3. Integration tests
4. Security checks
5. Approval verification tests
6. Migration dry run when applicable
7. Staging deployment
8. Smoke test
9. Small canary release
10. Error and conversion monitoring
11. Expand or roll back

### Automatic rollback triggers

- Error-rate increase beyond approved threshold
- Payment-flow failure
- Authentication failure
- Generation failure increase
- Onboarding activation decline beyond threshold
- Policy-control failure
- Approval bypass detected
- Data-integrity inconsistency

No release is complete until rollback is proven.

---

## 29. Security requirements

- Never place secrets in prompts, source code, logs, reports, or skill files.
- Use environment-variable references and secret-management facilities.
- Apply least privilege to each runtime worker and Claude Code subagent.
- Verify webhook signatures.
- Encrypt sensitive data in transit and at rest.
- Separate production and development credentials.
- Redact customer data from model prompts unless required for the approved task.
- Do not use customer images for unrelated model training.
- Log access to customer assets.
- Provide a recoverable deletion process.
- Prevent cross-customer context leakage.
- Treat Telegram callbacks as untrusted until verified.
- Require database backups before approved migrations.
- Test authorization boundaries.

---

## 30. Build phases and acceptance gates

### Phase 0: Audit and architecture

Acceptance:

- Current state documented
- Gaps and risks documented
- Data model proposed
- Tool contracts proposed
- Implementation order approved by Thomas

### Phase 1: Observability and economics

Acceptance:

- Revenue and Stripe events reconcile
- Generation cost is visible by tool
- Funnel events are visible
- Daily scorecard is correct
- No current subscriber is disrupted

### Phase 2: Governance and Telegram bank

Acceptance:

- Funding and pricing requests reach the dedicated topic
- Buttons work
- Approvals are single-use and scoped
- Denials block action
- Expired approvals block action
- Global freeze works
- Approval bypass tests fail safely

### Phase 3: Onboarding and support

Acceptance:

- Thomas approves initial onboarding
- New user completes first result without human help
- Support resolves supported cases
- Refund and credit limits are enforced
- Major changes still require approval

### Phase 4: Content and owned-audience launch

Acceptance:

- Rights-owned content library exists
- Property-integrity and claim checks pass
- Approved channels publish reliably
- Content is attributable to signup and revenue

### Phase 5: Outreach and sales

Acceptance:

- Sender authentication passes
- Suppression and unsubscribe behavior pass
- Conservative sending works
- Follow-up pauses after opt-out or unsafe signals
- Trials and payments are attributable

### Phase 6: Video capability

Acceptance:

- Video SOP exists
- Quality and architectural checks exist
- Costs are known
- Failed output is rejected automatically
- Small cohort performs safely
- Any price change is separately approved

### Phase 7: Scale and hardening

Acceptance:

- Funding ladder enforced
- Stop-loss rules work
- Canary and rollback work
- Weekly Telegram report is accurate
- Incident playbooks are tested
- 60% margin guardrail is enforced

---

## 31. First prompt to paste into Claude Code

```text
You are the lead Solutions Architect for the Vellum Revenue Operator project.

Read docs/VELLUM_REVENUE_OPERATOR_MASTER_BRIEF.md in full, then inspect the repository and all existing project instructions.

Begin Phase 0 only.

This is a read-only architecture audit. Do not modify application code, configuration, infrastructure, dependencies, Stripe products or prices, production data, external accounts, or deployments. Do not print secret values. You may inventory environment-variable names and connected services without exposing credentials.

Your goals are to:

1. Determine what already exists and works.
2. Determine what can be safely reused.
3. Identify missing schema, APIs, workflows, analytics, approval gates, schedules, tests, and recovery controls.
4. Compare the repository's real implementation with the master brief.
5. Produce the Phase 0 architecture documents required by the brief.
6. Recommend the smallest reliable implementation path.
7. Give three options for every material architecture decision, recommend one, and explain why.
8. Identify every action that will require Thomas's approval.

Treat the repository and verified infrastructure as the source of truth. If the brief conflicts with reality, document the conflict instead of guessing.

Do not begin implementation after the audit. Stop at the Architecture Checkpoint and wait for approval.
```

---

## 32. Prompt after Phase 0 approval

Use this only after reviewing and approving Claude Code's Phase 0 output.

```text
Phase 0 is approved subject to the decisions I provide below.

[PASTE APPROVED DECISIONS]

Update the architecture decision log, then implement only the next approved phase from the master brief.

Before editing:

1. Restate the exact scope.
2. Identify files and systems affected.
3. Confirm approval requirements.
4. Confirm test and rollback plans.
5. Preserve current subscribers, pricing, grandfathering, and production data.

Complete the approved phase, test it, document it, and stop at its acceptance gate. Do not automatically continue into later phases.
```

---

## 33. Definition of done

The Vellum Revenue Operator is not complete merely because agents, prompts, or schedules exist.

It is complete when:

- Every production action uses a registered contract.
- Every sensitive action passes deterministic policy checks.
- Every required approval is technically enforced.
- Every workflow is recoverable and idempotent.
- Revenue, cost, margin, and attribution reconcile.
- The customer journey is self-service.
- Support and qualified refunds are self-service.
- Content and outreach comply with approved rules.
- Video output passes property-integrity evaluation.
- Deployments can roll back automatically.
- Thomas only receives approved interruptions and passive reports.
- The system can be frozen immediately.
- Existing subscribers remain protected.

---

## 34. Official Claude Code references

- Claude Code project directory: https://code.claude.com/docs/en/claude-directory
- Claude Code memory and `CLAUDE.md`: https://code.claude.com/docs/en/memory
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code skills: https://code.claude.com/docs/en/skills
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code agent teams: https://code.claude.com/docs/en/agent-teams

Use the current official documentation when file formats or supported fields have changed.
