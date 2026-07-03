<!-- /autoplan restore point: /Users/camillebrown/.gstack/projects/abrepartners-StudioAI/main-autoplan-restore-20260703-042300.md -->
# StudioAI Great-Tool Overhaul — 2026-07-03

Goal: take StudioAI (Vellum) from "works when everything goes right" to a tool a real
estate agent trusts with every listing and Thomas trusts with revenue. Fix the whole
site: revenue integrity, AI output quality, engineering health, and UX polish.

Inputs: QA report 2026-07-03 (health 87→96, evidence in .gstack/qa-reports/), PR #31
review findings (3-reviewer consensus on auth exposure), live prod verification.

## Premises

P-1. StudioAI's buyer is a real estate agent/photographer, not a developer. Trust in
output quality (no fake lights, no melted rooms) is the moat.
P-2. Revenue integrity is broken by design today: generation endpoints are
unauthenticated with `Access-Control-Allow-Origin: *`; free-tier limits are
client-side honor system. Anyone with the URL gets unlimited paid generations.
P-3. The engineering gates are dead (tsc fails on main, 5 e2e failures, visual
baselines stale, no CI). Every future feature ships blind until this is fixed.
P-4. The March CLAUDE.md roadmap (MLS export, brand kit, property sites) is stale —
the Vellum workspace superseded it. Docs that lie are worse than no docs.
P-5. Twilight QC gate v1 ships flagged frames it should catch (3 invented peripheral
lights passed on deep twilight). Now measurable via qcFlagged/qcRetried.

## Work items

### E1 — Server-side auth + quota on all generation endpoints (P0, revenue)

Every `api/flux-*`, `api/sky-replace`, `api/classify-room`, `api/upscale`-class
endpoint validates the caller and enforces plan limits server-side.

- Client sends the Google ID token (already in `studioai_google_user` flow) as
  `Authorization: Bearer`; endpoints verify signature against Google JWKS (cache keys),
  extract email, and call `shared/monetization` `checkQuota(email)` before any
  Replicate call; increment usage after success (merge record-generation into the
  gated path so recording can't be skipped).
- CORS: replace `*` with the app origins (studioai.averyandbryant.com, localhost dev,
  vercel preview pattern).
- `?ff_try_real_generation` free-try path gets an IP+device soft limit.
- Rollout: feature-flag `AUTH_ENFORCE=log-then-block` — 48h log-only to catch
  legitimate traffic shapes, then block.
  Files: api/utils.ts (verifyGoogleToken, requireQuota), all generation endpoints,
  shared/monetization.ts, src/vellum fetch helpers. ~8 files.

### E2 — Twilight QC gate v2 (P1, quality moat)

- Compare-mode VQA: moondream counts visible lit exterior fixtures on original AND
  result; count(result) > count(original) → flag. Keep single-image "obviously fake"
  question as second signal (either flags → retry).
- Run gate per quadrant crop on the result (peripheral fakes are small in frame —
  the QA-proven miss mode).
- Log verdict + counts; extend qcFlagged/qcRetried with qcMode.
- Validate against the QA evidence pair (house facade deep-twilight: must flag; pool
  sunset: must pass) via a scripted harness in tests/qa-harness before merging.
  Files: api/flux-twilight.ts, api/utils.ts (shared VQA helper — also dedupes
  flux-staging's copy). ~3 files.

### E3 — Generation telemetry that matches spend (P1, cost visibility)

record-generation accepts and stores engine, qcFlagged, qcRetried, upscaled, latencyMs;
client passes them through from the API response. Dashboard/admin can see real cost
per delivery instead of undercounting retries.
Files: api/record-generation.ts, shared/monetization.ts, VellumPhotoEditor.tsx. ~3 files.

### E4 — Engineering gates back to green + CI (P1, health)

- Fix the 8 tsc errors (AdminApiDashboardRoute 5, App.tsx 2, playwright.config 1).
- Fix the 5 pre-existing e2e failures (p0-trust ×3, non-stackable-cleanup ×2) or
  update tests where the product intentionally changed.
- Regenerate visual baselines on the current Chromium; commit after eyeball review.
- Add `.github/workflows/ci.yml`: build + tsc + e2e (against vite preview) on PR.
- Add vitest for api/ units: QC verdict parse, fail-open contracts, monetization
  quota math; `import/extensions` ESM lint so the PR-#31 500 class dies at commit time.
  Files: 8 existing + tests/unit/* + .github/workflows/ci.yml + eslint config. ~15 files.

### E5 — Editor UX corrections from QA (P2, polish)

- Tool panel defaults to a DISABLED tool (Virtual staging) for exterior photos —
  default to the first enabled tool for the photo's room type.
- Room-type auto-detect mislabels (front facade → "Backyard", pool → "Living Room"
  when API unavailable): add a confidence threshold — below it, the tag modal opens
  with no preselection and asks; also fix the tag modal race that let a scripted
  change hit the wrong select (modal should trap focus and be the only select).
- Surface QC transparency in UI: when qcRetried, show "Quality check re-ran this
  edit" in activity feed (trust signal, zero new API).
  Files: VellumPhotoEditor.tsx, classify-room client wiring. ~3 files.

### E6 — Docs truth pass (P2, leverage)

Rewrite CLAUDE.md current-state + roadmap to match the Vellum reality (kill the
March plan or move to docs/archive), document the engine matrix (staging: seedream +
nano A/B; twilight: nano default + flux fallback + QC), env vars, and the auth model
from E1. TESTING.md for the real suites.
Files: CLAUDE.md, TESTING.md, docs/. ~3 files.

### NOT in scope (this overhaul)

- New feature verticals (MLS export packs, print collateral, property websites) —
  the stale roadmap needs a product re-decision with Thomas first (E6 sets that up).
- Multi-tenant/white-label (Phase 2 gate unchanged).
- Payment flow changes beyond quota enforcement (Stripe checkout works).
- react-pdf bundle split — deferred: 1.46MB chunk is lazy-loadable later; not a
  user-reported pain today.

## Sequencing

E1 alone on its branch (security review required) → E4 (gates green so everything
after ships with working CI) → E2+E3 together (one branch, twilight quality) →
E5 → E6. Each lands via PR per repo rules.

## Success criteria

- Direct anonymous POST to any generation endpoint returns 401; quota decrements
  server-side; zero Replicate spend without a verified user.
- Deep-twilight house-facade fixture photo: QC flags and retry removes the invented
  lights (validated on the QA evidence pair).
- `npm run build && npx tsc --noEmit && npx playwright test` all green on main; CI
  enforces on every PR.
- Editor never defaults to a disabled tool; misdetected room types ask instead of
  silently mislabeling.
- CLAUDE.md describes the product that exists.

---

# /autoplan Review Report — 2026-07-03

Six independent voices ran: CEO (Claude subagent + Codex), Eng (Claude subagent + Codex),
Design (Claude subagent + Codex). Findings grounded against the actual code.

## CEO consensus table
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| 1. Premises valid? | NO (P-1 quality-moat wrong) | NO (quality is min bar, rented) | CONFIRMED wrong |
| 2. Right problem to solve? | NO (hardens, doesn't grow) | NO (tool-centric not outcome) | CONFIRMED |
| 3. Scope calibration? | Trim E1, promote product audit | Reframe to one paid workflow | CONFIRMED (over-invested in hygiene) |
| 4. Alternatives explored? | NO (verticals dismissed blind) | NO (verticals = real pain) | CONFIRMED |
| 5. Competitive risk covered? | NO (commoditization + channel cut) | NO (distribution is the moat) | CONFIRMED |
| 6. 6-month trajectory? | Regret: polished engine, no wheels | Regret: hardened before proving demand | CONFIRMED |

## Eng consensus table
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| 1. Architecture sound? | NO — E1 token doesn't exist client-side | NO — same, app discards credential | CONFIRMED CRITICAL |
| 2. Test coverage sufficient? | NO — e2e can't run api/ | NO — no vercel dev, no vitest dep | CONFIRMED |
| 3. Performance risks? | E2 quadrant = 8 moondream, busts 180s | E2 needs runtime image decode, unscoped | CONFIRMED |
| 4. Security threats? | Quota TOCTOU: batch blows the cap | Same — need atomic reserve/commit RPC | CONFIRMED CRITICAL |
| 5. Error paths? | JWKS fail-open/closed undefined | Same + 10 endpoints not 8 | CONFIRMED |
| 6. Deployment risk? | Flip-day mass-401 for all users | Same — log-then-block leaves leak open | CONFIRMED |

## Design consensus table
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| 1. Reveal/result experience designed? | NO — the product, zero allocation | NO — reveal is the trust moment, missing | CONFIRMED CRITICAL |
| 2. Generation-wait state designed? | NO — 16-60s void on canvas | NO — no expectation-setting | CONFIRMED |
| 3. E1's new UX states owned? | NO — paywall/auth-expiry/quota-block | NO — 401 lands in generic error | CONFIRMED CRITICAL |
| 4. Room-tag hierarchy right? | NO — pivot state shown as caption | (not scored) | Claude-only |
| 5. QC-retry trust signal right? | NO — confession, flip to green badge | NO — needs quality summary at reveal | CONFIRMED |
| 6. E5 specific enough? | NO — tool-matrix + confidence don't exist | NO — hand-wave | CONFIRMED |

## Cross-phase themes (flagged independently in 2+ phases — highest confidence)
- **E1 spawns undesigned UX states** — flagged by Eng (auth expiry, quota block) AND Design
  (paywall unowned, 401 in generic error). A "backend-only" security item ships visible
  regressions. This is the single strongest signal in the review.
- **Quality is not the moat** — CEO (both) say it's rented from base models; the defensible
  axis is distribution (Thomas's captive A&B/Aryeo channel) + outcome/workflow + bulk speed.
- **The plan is tool-centric, not outcome-centric** — every success criterion is internal
  (401, green build, docs). Zero user or dollar metric.

## What already exists (grounded audit, corrects the plan's assumptions)
- `shared/monetization.ts` = pure constants + display helpers. NO `checkQuota`, NO store,
  client-bundled. Real quota = Stripe metadata + Supabase, incremented (not blocked) only by
  `record-generation.ts`, non-atomic.
- Google credential is decoded then DISCARDED (`VellumApp.tsx:98`, `authStorage.ts:9`); only
  `{name,email,picture,sub}` persists. No raw token, no refresh, `disableAutoSelect()`.
- 10 Replicate-spending endpoints (not 8): flux-cleanup/renovation/staging/twilight, sky-replace,
  classify-room, upscale, reve-edit, sam-detect, lab-run.
- Pro/Team = UNLIMITED generation (`hasUnlimitedGeneration`) → the real margin risk is unbounded
  paid COGS, not free-tier abuse. Plan ignores it.
- `/try` (`?ff_try_real_generation`) is a "coming soon" page, does not generate — E1's free-try
  limiter targets a path that doesn't exist.
- No `.github/` (no CI) — CONFIRMED, the one unambiguously-right item.

## Auto-decided technical corrections (feasibility fixes, folded into revised plan below)
1. E1 auth primitive → app-issued session verified ONCE at login (HttpOnly cookie or short app
   JWT + refresh), not per-request Google ID token. [P5 explicit, C-1]
2. E1 quota → atomic Supabase RPC (reserve→commit, refund on failure); server-only `api/_lib/quota.ts`,
   NOT shared/monetization. Enumerate all 10 endpoints. [P1 completeness, C-2/C-3]
3. E1 free-try → drop (path doesn't exist) or route to a zero-Replicate cached sample. [P4 DRY]
4. E2 → validate false-positive rate on the QA evidence pair FIRST; prefer downscaled full-frame
   compare over 4 quadrant crops (budget); ship single-signal if miss rate is low. [P3 pragmatic, C-9]
5. E4 CI → `vercel dev` (or deployed preview URL) not `vite preview`; add vitest dep; explicit
   non-visual testDir; add verifyToken + concurrent-quota tests. [P1, C-7/C-8]
6. E3 → fix the stale cost map (says ESRGAN, pipeline is Pruna); multiply by (1+qcRetried)+upscale. [C-9]
7. NEW E7 (generation-experience design) — wait state, framed reveal, "Verified: no fake lights"
   badge, keep/redo/report (no re-charge on flagged), paywall/auth-expiry/quota-block states.
   Ships WITH E1 (E1 creates the states) and before/with E2 (reveal is where QC is felt). [cross-phase theme]
