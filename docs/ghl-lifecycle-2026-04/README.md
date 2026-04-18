# GHL Lifecycle — R36 + R38

**Agent:** agent-e · **Date:** 2026-04-18 · **Scope:** Email templates only. No workflows. No publishing. User wires templates to GHL workflows manually.

---

## What shipped

9 email templates created in GHL (location `iXhH37718q9nZnf4tkgF`) — 6 free-tier nurture (R36) + 3 winback (R38). Templates are drafts by default; they only fire once a user wires them into a workflow trigger.

**Voice:** Agent-first, direct, no fluff. Per `docs/overhaul-2026-04/specialist-reports/07-copy-messaging.md` — uses agent verbs (stage, list, close, DOM), names deliverables (staged photos, MLS-ready exports), leads with numbers ($1,400 vs $588, 42→26 DOM, 15s per render).

**Identity:** Every template signs off as "The StudioAI team" — never uses Thomas's personal name, per memory identity rule.

**Design:** Dark premium (bg `#0a0a0a`, card `#141414`, accent `#0A84FF`), 560px max-width, table-based for email client compatibility, preheader text set on every template, unsubscribe link placeholder `{{unsubscribe_link}}` in footer.

---

## Template registry

### R36 — Free-tier nurture

| # | Cadence | Template name | GHL ID | Subject / hook |
|---|---|---|---|---|
| 1 | Day 0 | `StudioAI_Nurture_D0_Welcome` | `69e419cac059ed18574d50df` | Welcome. Your free account is live. |
| 2 | Day 2 | `StudioAI_Nurture_D2_Tips` | `69e419d85bda097b48f8c21d` | The 5 listing photos buyers actually click on. |
| 3 | Day 5 | `StudioAI_Nurture_D5_CaseStudy` | `69e419e5c059ede7af4d5154` | Central Arkansas agent closed 38% faster. |
| 4 | Day 7 | `StudioAI_Nurture_D7_UsageNudge` | `69e419ef0cd82681237c3b3a` | Your free stagings are still sitting there. |
| 5 | Day 14 | `StudioAI_Nurture_D14_ValueFrame` | `69e41a050cd82636187c3cdc` | One staging job costs more than a year of Pro. |
| 6 | Day 30 | `StudioAI_Nurture_D30_FinalNudge` | `69e41a0f5bda09c3d8f8c4eb` | One more ask, then we'll stop bugging you. |

### R38 — Winback (post-cancel)

| # | Cadence | Template name | GHL ID | Subject / hook |
|---|---|---|---|---|
| 7 | Day 7  | `StudioAI_Winback_D7` | `69e41a192f23972178573b93` | Your listings are still here. (no ask) |
| 8 | Day 30 | `StudioAI_Winback_D30_Coupon` | `69e41a24f59531cd2629b185` | 30% off Pro — this week only. |
| 9 | Day 90 | `StudioAI_Winback_D90_WhatsNew` | `69e41a32b62dfb24bf84f574` | A lot has shipped since you left. |

---

## Wiring recipe (manual, do this in GHL)

### R36 workflow — "StudioAI Free Nurture"

**Trigger:** Contact tag added = `studioai-free` (tag fires from the StudioAI app on OAuth signup → GHL contact create/update webhook, or manually added).

**Steps:**
1. Send email — template `StudioAI_Nurture_D0_Welcome` (send immediately)
2. Wait 2 days
3. Send email — template `StudioAI_Nurture_D2_Tips`
4. Wait 3 days (Day 5 total)
5. Send email — template `StudioAI_Nurture_D5_CaseStudy`
6. Wait 2 days (Day 7 total)
7. Send email — template `StudioAI_Nurture_D7_UsageNudge`
8. Wait 7 days (Day 14 total)
9. Send email — template `StudioAI_Nurture_D14_ValueFrame`
10. Wait 16 days (Day 30 total)
11. Send email — template `StudioAI_Nurture_D30_FinalNudge`

**Exit condition:** Remove from workflow if tag `studioai-pro` is added (user upgraded) — prevents trial-pushing emails to paid users.

---

### R38 workflow — "StudioAI Winback"

**Trigger:** Contact tag added = `studioai-cancelled` (fires from Stripe subscription `customer.subscription.deleted` webhook → GHL contact update).

**Steps:**
1. Wait 7 days
2. Send email — template `StudioAI_Winback_D7`
3. Wait 23 days (Day 30 total)
4. Send email — template `StudioAI_Winback_D30_Coupon`
5. Wait 60 days (Day 90 total)
6. Send email — template `StudioAI_Winback_D90_WhatsNew`

**Exit condition:** Remove from workflow if tag `studioai-pro` is re-added (user reactivated).

---

## Action items for user (not agent-doable)

1. **Generate Stripe coupon** for the Day-30 winback. Code `COMEBACK30`, 30% off Pro monthly, 3 months max, 7-day validity. Create via Stripe Dashboard (Products > Coupons) or the Stripe CLI — do not auto-create from an agent.
2. **Wire both workflows** in GHL Automations > Workflows using the recipes above. Templates are already drafts — select them in the "Send Email" action.
3. **Tag plumbing:** confirm the StudioAI backend adds `studioai-free` on OAuth signup and `studioai-cancelled` on Stripe cancel webhook. If not wired yet, that's a separate integration ticket.
4. **Approval check:** preview each template in GHL Email Marketing > Templates before turning workflows live. All 9 templates prefix with `StudioAI_` for easy filtering.

---

## Pacing logic — why these intervals

- **D0 Welcome** — on signup, strike while intent is hot.
- **D2 Tips** — low-friction value delivery (no ask), builds sender reputation.
- **D5 Case Study** — social proof lands best after 2 value-forward touches.
- **D7 Usage Nudge** — inactive free users get one reminder before going quiet; matches free-trial mental model (a week = "time to check in").
- **D14 Value Frame** — $/math argument lands after they've seen the product work; early enough that trial excitement hasn't decayed.
- **D30 Final Nudge** — graceful close. One last ask, then stop bothering.

- **Winback D7** — zero ask. Just "we held your stuff." Respects the recent cancel decision.
- **Winback D30** — coupon window. Price-sensitive cancels convert best here.
- **Winback D90** — feature-based re-engagement. Quarterly pulse. Last touch.

---

## Voice anchors (reference for future templates)

- Agent verbs: stage, list, close, DOM, MLS-ready, go live
- Banned words: stunning, beautiful, professional (per Specialist Report 07)
- CTA format: `<verb> <object>` — "Stage a room", "Reactivate at 30% off"
- Tone: confident, direct, respectful of agent's time. Never teacher-y. Never hype.
- Signature: "— The StudioAI team" (never Thomas, never first person)

---

## Files

- This doc — `docs/ghl-lifecycle-2026-04/README.md`
- Tracking — `docs/phase-3-tracking.md` Cluster E (R36, R38 → done)
- Voice source — `docs/overhaul-2026-04/specialist-reports/07-copy-messaging.md`
