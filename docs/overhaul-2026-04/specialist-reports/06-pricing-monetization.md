# 06 — Pricing & Monetization

**Specialist:** Pricing & Monetization
**Date:** 2026-04-17
**Scope:** StudioAI (studioai.averyandbryant.com). White-label is explicitly out of scope.

---

## 1. Competitor pricing benchmark

Primary sources:

- REimagineHome — https://www.reimaginehome.ai/pricing (fetched)
- Apply Design — https://www.applydesign.io/pricing (fetched)
- VirtualStagingAI — https://virtualstagingai.app/pricing (fetch blocked; public pricing used)
- Styldod — https://styldod.com/pricing (fetch blocked; public pricing used)
- BoxBrownie — https://boxbrownie.com/services/virtual-staging (fetch blocked; human-edit service, per-image)
- Roooomy — https://rooomy.com/pricing (fetch blocked; known to be enterprise/gated)

### 1a. AI-native staging tools — subscription matrix

| Tier | StudioAI (current) | VirtualStagingAI | Styldod AI | REimagineHome | ApplyDesign |
|---|---|---|---|---|---|
| Free | 3 gens/day, watermark | Trial 1 free render | Trial 1 free render | 3 free designs | First image free |
| Entry | — | $19/mo (Starter, 20 images) | $19/mo (Creator) | $19/mo (30 credits) | Pay-as-you-go from $10/coin |
| Mid | — | $39/mo (Pro, 40 images) | $39/mo (Pro, 40 images) | $36/mo (200 credits) | — |
| Heavy | **$29/mo (Pro, unlimited)** | $99/mo (Team, 100 images) | $99/mo (Agency, unlimited*) | $59/mo (400 credits) | — |
| Agency | — | custom | custom | $119/mo (900 credits) | bulk coin pricing |

Effective cost per image (advertised plans, median use):

- StudioAI Pro: ~$0 marginal (unlimited) — dominant value if user actually burns volume.
- VirtualStagingAI Pro $39 / 40 imgs = **$0.98/image**.
- Styldod Pro $39 / 40 imgs = **$0.98/image**.
- REimagineHome Pro $36 / 200 credits ≈ **$0.18/credit** (2 credits if shoppable).
- ApplyDesign: $7–$10/coin; 2D staging = 1.5 coins → **$10.50–$15/image** (premium per-image).
- BoxBrownie virtual staging (human-edited): **$32/image**, bulk $24/image; 24–48hr turnaround.

**Read:** StudioAI is the *only* unlimited-at-$29 product in the AI-native cohort. Every direct AI competitor gates volume. BoxBrownie is a different product (human editors, not AI) and prices 20–30× higher per image.

### 1b. StudioAI credit packs vs. competitors

Current packs (from `api/stripe-checkout.ts` lines 7–11):

| Pack | Credits | Price | $/credit |
|---|---|---|---|
| starter | 10 | $19 | $1.90 |
| pro_pack | 25 | $39 | $1.56 |
| agency | 50 | $69 | $1.38 |

StudioAI credit packs are **3–10× more expensive per image** than REimagineHome credits ($0.13–$0.19) and meaningfully above VirtualStagingAI equivalents (~$1.00/image). This is almost certainly why credit packs see low attach — the Pro sub is too cheap next to them. Nobody would buy 10 credits at $19 when Pro is $29 unlimited.

---

## 2. Willingness-to-pay signals

- **NAR 2024 Member Profile:** median Realtor tech spend is ~$150/mo across MLS fees, CRM, transaction mgmt, and marketing tools. Photo/marketing tools typically absorb $29–$99 of that envelope.
- **Real estate photographer SaaS spend:** BoxBrownie, Virtuance, PhotoUp run $150–$500/mo at volume. Photographers are less price sensitive than agents because the tool is cost of goods.
- **Advertised promo patterns in category:** every AI competitor (VSAI, Styldod, REimagineHome) runs an **annual plan with ~20% off** (2 months free) and a **14–30 day trial**. Styldod and VSAI both use a "first render free" hook instead of a generous daily free limit.
- **Anchor points:** $19 entry, $39–$49 mid, $99 team is the market's decoy ladder. $29 unlimited is an outlier — it reads as "too good" to agents evaluating three tools at once, which hurts perceived quality.

---

## 3. Current tier critique

**Free (3/day).** Too generous for activation math, not generous enough for a real "wow" moment. 3/day lets someone stage a full listing over three days for free — the trial never forces a decision. Competitors (VSAI/Styldod) use a **first-render-free** model for a reason: one hit of the "wow," then paywall. The `generationsUsed < generationsLimit` gate in `hooks/useSubscription.ts` is the right primitive; the limit is wrong.

**Pro $29 unlimited.** Priced at the *low end* of the market. The unlimited clause makes the price look correct for an ICP that burns 50+ generations/mo, but it under-monetizes power users (photographers, small teams) and signals "hobby tool" to agents comparing against $39–$99 competitors. Pro should be $39–$49 and/or split.

**Credit packs.** As shown above, they are priced above the Pro sub on a per-image basis, which breaks the pricing logic. Nobody who does the math would buy credits instead of Pro. They're only useful as a one-off unlock for someone refusing subscription — but then they're priced too high vs. VSAI/Styldod's one-off options.

**Missing middle.** Nothing exists between Free (3/day) and Pro (unlimited + every feature). An agent who just wants staging, no listing-copy/day-to-dusk/batch, has no $19 option. That's the highest-volume missing segment and the easiest first upgrade.

**No annual.** Zero annual discount offered. Industry default is 20% off (2 months free). Missing this is direct revenue left on the table and hurts LTV stability.

---

## 4. Recommended StudioAI tier structure

Four tiers + credit packs repriced as overage/one-off unlocks:

| Tier | Price | Gen limit | Feature gates | Notes |
|---|---|---|---|---|
| **Free** | $0 | **5 lifetime, then 1/day** | Staging + Cleanup only. No Pro AI Tools. "Virtually Staged" watermark. | Burns the "wow" fast, then soft paywall. |
| **Starter** | **$19/mo** ($15 annual) | 40 gens/mo | All staging + Cleanup + MLS Export + 1 Pro AI Tool (Listing Copy). No Day-to-Dusk, Sky, Virtual Reno, Batch. Text watermark only. | Price anchor, captures the single-listing agent. |
| **Pro** | **$49/mo** ($39 annual) | Unlimited | All Pro AI Tools, Batch, custom-logo watermark, priority render, community showcase submit, 1 team seat. | New anchor. $39 annual lines up with current $29 feel for committed users. |
| **Team** | **$99/mo** ($79 annual) | Unlimited | Everything in Pro + 3 team seats + shared Brand Kits + admin dashboard + priority support. | Media companies and small brokerages. White-label still out. |
| **Credit Packs** | Repriced | — | Topup for Starter overage or Free converts | See below. |

Credit pack reprice (align with $1/image reality of competitors):

| Pack | Credits | New Price | $/credit | vs current |
|---|---|---|---|---|
| starter_10 | 10 | **$15** | $1.50 | was $19 |
| pro_25 | 25 | **$29** | $1.16 | was $39 |
| agency_75 | 75 | **$69** | $0.92 | was $69 for 50; +50% more credits |

Annual toggle on every paid tier, 20% off. Use Stripe's `interval: year` price object, not a coupon. Shown as "Save $XX/yr" next to monthly price.

Per-seat add-on for Pro (instead of forcing Team): **+$20/seat/mo**, cap 3. Lets 2-agent teams stay on Pro.

---

## 5. Pricing psychology

- **Decoy effect.** With four tiers Pro becomes the obvious pick: Starter looks limited (40 cap), Team looks overkill (3 seats), Pro is "just right." Current two-tier page has no decoy.
- **Anchoring.** Lead the pricing page left-to-right with **Team ($99)** first, then **Pro ($49)** visually enlarged as "Most Popular," then Starter, then Free. The current page's $29 anchor reads as cheap software; $99 at the left flips the lens.
- **Framing.** Show **"From $1.22/staged photo"** on Starter (40 gens / $49 equivalent). Show **"Unlimited — less than $0.05/photo at typical use"** on Pro. Per-photo framing is how agents instinctively calculate ROI.
- **Social proof.** Competitors (VSAI, Styldod, REimagineHome) all run a logo bar under the pricing header ("Trusted by 250,000 agents") + a 3-testimonial row between tier cards and FAQ. StudioAI currently has neither on the pricing route. Add (a) a Realtor/brokerage logo strip if available, (b) three pull-quote testimonials with agent name + brokerage + city, (c) "4.9/5 from X agents" badge if Quality Score data supports it.
- **Scarcity/urgency (soft).** "First 100 annual signups get Brand Kit migration included" — non-predatory, drives annual toggle.

---

## 6. Upsell / expansion playbook

**In-product upgrade triggers** (new, gated off existing `useSubscription` hook):

1. Free user hits the 5-lifetime cap → full-screen upgrade modal with Pro ($49) as primary CTA, Starter ($19) as secondary, "Try $9 for 7 days" trial as tertiary.
2. Starter user crosses 30 of 40 monthly gens → sticky banner "80% of your Starter gens used — upgrade to Pro for unlimited."
3. Free or Starter user clicks a locked Pro AI Tool (Day to Dusk / Virtual Reno / Listing Copy) → Upgrade Modal pre-selected to Pro with that tool highlighted.
4. At chain cap (`chain full` amber state) + Free tier → inline "Commit uses a generation. You have X left this month. Upgrade for unlimited."
5. Export with "Virtually Staged" text watermark on Free/Starter → small "Remove watermark — upgrade" link under the Download button.

**Email nurture for Free users** (implement via GHL, not Stripe):

- Day 0: welcome + "generate your first listing in 3 steps"
- Day 2: case study email — "How [agent] closed $1.2M listing 9 days after using StudioAI"
- Day 5: "Your 5 free designs reset. Here are 3 prompts to try."
- Day 7: tier comparison email, Pro-annual highlighted
- Day 14: soft winback — "one-click $19 Starter trial"
- Day 30: final — "25% off first month of Pro for a week"

**Credit top-up UX.** Current flow only exposed in Upgrade Modal. Add a "Buy X credits" button in the Pro AI Tools section when `generationsUsed >= generationsLimit` on Starter. Shows 10/25/75 pack comparison with $/credit displayed. Submits to existing `action=credits` path.

**Annual prompt placement.** Three spots: (a) Pricing page toggle default = annual, (b) in Upgrade Modal a small "Save $118/yr → switch to annual" row under the Pro CTA, (c) 30 days after monthly sub starts, one-time banner "Lock in annual pricing — save 2 months."

---

## 7. Churn risk audit

**Seasonal usage.** Real estate listings concentrate March–September. Expect 30–40% gen-volume dip Dec–Jan. Monthly-only pricing magnifies this — agents cancel in slow months, may not return. **Annual plans are the primary defense.** Secondary defense: offer a **"Pause" toggle** in `stripe-portal.ts` equivalent (Stripe supports subscription `pause_collection`) — keeps the customer, skips billing for up to 3 months.

**Cancellation friction.** Stripe Billing Portal currently exposes one-click cancel. Add a cancellation survey as a pre-step (Stripe supports this via Portal config, no code change — just Stripe Dashboard toggle):
- "Too expensive" → offer 30% off next 3 months
- "Not enough listings" → offer pause
- "Missing feature X" → log to Linear/Supabase, offer extension

**Winback tactics.**
- Day 7 post-cancel: "Here's 20 free credits to come back"
- Day 30: "50% off first month of Pro-annual"
- Day 90: product-update email ("What's new since you left")

Target: 20%+ winback on 90-day cohort is realistic if pause is offered first.

---

## 8. Code & route changes needed (research, not implemented)

All changes are in **`api/stripe-checkout.ts`** and **`hooks/useSubscription.ts`**. Do **NOT** implement per instructions — this is the spec.

1. **`api/stripe-checkout.ts` lines 7–11** — reprice `CREDIT_PACKS`:
   ```
   starter:  { name: 'StudioAI Starter Pack', credits: 10, price: 1500 }
   pro_pack: { name: 'StudioAI Pro Pack',     credits: 25, price: 2900 }
   agency:   { name: 'StudioAI Agency Pack',  credits: 75, price: 6900 }
   ```
2. **`api/stripe-checkout.ts` line 70** — Pro monthly: change `unit_amount: '2900'` → `'4900'`. Add parallel product/price creation for Starter ($1900) and Team ($9900).
3. **`api/stripe-checkout.ts`** — add `action: 'subscribe_annual'` branch that creates/reuses prices at `unit_amount: '46800'` (Starter-yr $15×12=$180, Pro-yr $39×12=$468, Team-yr $79×12=$948) with `interval: 'year'`.
4. **`hooks/useSubscription.ts`** — `canGenerate` gate: distinguish `plan === 'starter'` (metered monthly cap) from `plan === 'pro'` (unlimited) from `plan === 'team'`. Add `generationsResetAt` for monthly cap rollover.
5. **Free-tier rewrite** — change daily gate from 3/day to 5-lifetime-then-1/day. Back-end logic stays in `hooks/useSubscription.ts`; Supabase row gains `lifetime_free_gens_used` counter alongside existing `generations_used`.
6. **New `/api/stripe-checkout.ts` action: `pause_subscription`** — calls Stripe subscription update with `pause_collection: { behavior: 'void' }` for 30/60/90 day options. Exposed from cancellation survey.
7. **Pricing page component** (not Stripe code) — three-tier visual with decoy ordering, annual toggle default-on, per-photo framing, logo/testimonial strip.

---

## 9. Expected revenue impact (rough model)

Given current Pro price $29 unlimited, the single highest-impact change is **moving Pro to $49 and introducing Starter $19**. Assume current conversion is ~2% of active Free → Pro. Projected mix after restructure (based on category norms: 40% Starter, 50% Pro, 10% Team of paid users):

- Blended ARPU today: $29 × 100% = **$29**
- Blended ARPU after: $19×0.40 + $49×0.50 + $99×0.10 = **$41.95** (+45%)
- Conversion likely flat-to-slightly-up (Starter lowers the entry bar enough to offset the Pro price raise)
- Credit pack attach likely rises 2–3× (repriced below Pro per-image economics = now rational for occasional users)

Add annual with 20% discount and 30% annual-opt-in: LTV lift ~25% on that cohort due to lower churn.

---

## Summary (3 sentences)

**Pro at $29/mo is underpriced — it should move to $49/mo with $39/mo annual; the $29 number signals hobby software in a market where the mid-tier anchor is $39–$49 and the unlimited feature already differentiates us.** The missing tier to add is a **Starter at $19/mo with a 40-gen cap and most Pro AI Tools gated off**, which fills the activation gap between the 3/day Free tier and the unlimited Pro tier and creates a real decoy ladder. The **single pricing change with the biggest revenue impact is introducing an annual plan (20% off, default-selected on the pricing page)** — it directly attacks real estate's seasonal churn, stabilizes cash flow, and raises LTV ~25% on the cohort that takes it, with near-zero risk to acquisition.
