# Avery & Bryant AI Operating System

> Roles, not skills. You don't hire someone because they know Microsoft
> Word — you hire a Sales Manager, a Creative Director, an Operations
> Manager. The role comes first; the skills support the role.
>
> The goal is not AI that completes tasks. The goal is AI that thinks like
> the best department head in the company — so Thomas can step out of
> day-to-day operations while still making the important decisions.

## How it works

Every role is a Claude Code subagent defined in `.claude/agents/`. Each one
has specific thinking patterns, responsibilities, and a fixed output format.
Roles think and produce structured documents; **no role decides** — every
role's output ends at a decision point for Thomas.

The pipeline for any client engagement:

```
Client request
   │
   ▼
1. Solutions Architect ──► PROJECT BRIEF ──► Thomas decides
   │
   ▼
2. Proposal Strategist ──► PROPOSAL DRAFT ──► Thomas approves ──► client accepts
   │
   ▼
3. Project Manager ──────► EXECUTION PLAN
   │
   ▼
4. Creative Director ────► CREATIVE DIRECTION ──► Thomas picks direction
   │
   ▼
5. Production Coordinator ► DISPATCH SHEET (work orders to AI / team / contractors)
   │
   ▼
6. QA Reviewer ──────────► QA REVIEW against the ORIGINAL brief ──► Thomas / client
```

Documents flow forward: the brief is the source of truth, the proposal
prices the brief's NOW scope, the plan executes the proposal, production
follows the creative guardrails, and QA reviews against the brief — not
against what happened to get built.

## Role registry

| # | Role | Agent file | Status | Purpose |
|---|------|-----------|--------|---------|
| 1 | Solutions Architect | `.claude/agents/solutions-architect.md` | **Specified** | The Front Door. Converts any messy client request into a decision-ready project brief. Never builds; never decides. |
| 2 | Proposal Strategist | `.claude/agents/proposal-strategist.md` | Draft v0 | Turns an approved brief into a proposal with packaging and pricing options. |
| 3 | Project Manager | `.claude/agents/project-manager.md` | Draft v0 | Turns an accepted proposal into an execution plan with milestones, dependencies, and approval gates. |
| 4 | Creative Director | `.claude/agents/creative-director.md` | Draft v0 | Sets brand voice, visual direction, and guardrails production must follow. |
| 5 | Production Coordinator | `.claude/agents/production-coordinator.md` | Draft v0 | Routes approved tasks to the right producer (AI role, team member, contractor) as self-contained work orders. |
| 6 | QA Reviewer | `.claude/agents/qa-reviewer.md` | Draft v0 | Checks deliverables against the ORIGINAL brief before anything reaches Thomas or the client. |

**Status meanings**: *Specified* = thinking pattern and output format fully
defined and approved. *Draft v0* = derived from the operating-system doc;
usable today, but refine with Thomas before treating its process as final.

## Entry point

- `/architect <client request>` — runs Role #1 on any new client request.
  This is where every engagement starts.
- Later roles are invoked by name once the prior stage's document exists
  ("run the proposal strategist on the Dogwood brief").

## Design rules for roles

When defining a new role or revising a draft:

1. **Purpose in one sentence** — what messy input does it take, what
   decision-ready document does it produce?
2. **Prime directives** — 2–3 hard rules, always including what the role
   does NOT do (build/decide/send).
3. **Thinking pattern** — a numbered sequence the role must walk every
   time. This is the department head's judgment, written down.
4. **Fixed output format** — a named document with labeled fields, so
   outputs are comparable across clients and consumable by the next role.
5. **Ends at Thomas** — a recommendation plus an explicit decision request
   and a confidence level where applicable.
6. **NOW / NEXT / LATER discipline** — future ideas are roadmap, never
   silently scoped into the current phase. This is the scope-creep firewall.

## Worked example

Dogwood Golf ("we need a website") is the calibration example embedded in
the Solutions Architect role — see `.claude/agents/solutions-architect.md`.
It shows the full path from surface request ("need a website") to the real
recommendation (sell a **Grand Opening Website Package**; verify the
OpenCourt integration early; keep the member portal in LATER).
