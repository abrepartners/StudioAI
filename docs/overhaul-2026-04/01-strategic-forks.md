# 01 — Strategic Forks

**Author:** Executive Synthesizer
**Date:** 2026-04-17
**Purpose:** Decisions that require Thomas's explicit call before Phase 1 ships. The roundtable leaned on most of these but cannot unilaterally pick.

---

## How to read this doc

Each fork has: the decision, 2–3 options with tradeoffs, the specialist recommendation, and why the roundtable can't just pick. If Thomas agrees with the recommendation, check the box and move on. If not, pick another option and execution updates accordingly.

---

## Fork #1 — Primary ICP scope

**Decision:** When we say "the serious listing agent," how wide is the tent?

**Options:**
- **A. Serious producer only** (10–50 sides/year, 3+ years licensed). Excludes new agents, mega-teams. — ICP §Recommendation's position.
- **B. Broader agent net** (any licensed agent, 5+ listings/year). 3x bigger addressable market, but includes the 62%-under-$10K-new-agent cohort that will churn at 15%/mo (ICP §Red Flag 4).
- **C. Media-company-first** (A&B, photographers, brokerage media shops). Longer sales cycle, higher LTV, but Phase 2 work per CLAUDE.md gate and ICP §Recommendation.

**Specialist recommendation:** A. ICP §Recommendation is explicit; Pricing §6 email nurture assumes it; Copy §3 ICP targeting uses Lauren's voice; Competitive §5 Gap #2 puts media companies in Phase 2.

**Why this needs Thomas's call:** Thomas's own business *is* the Candidate B customer. The ICP report flags this as Red Flag #6: Thomas will naturally pull product toward B. Locking in A as the Phase 1–2 target means declining feature requests that only serve A&B until Phase 2. We need explicit agreement that "if it only serves A&B, it goes to Enterprise track" — otherwise the roadmap drifts.

---

## Fork #2 — Grandfathering on the Pro price change

**Decision:** Pro moves from $29/mo to $49/mo. What happens to existing Pro subscribers?

**Options:**
- **A. Grandfather current Pro users at $29 forever.** Honors the "Rate locked in forever" landing copy (`App.tsx:1610`). Safest for trust. Leaves ~$20/user/mo on the table indefinitely.
- **B. Grandfather for 12 months, then re-price.** 30-day email notice before the increase. Recoups the revenue within a year.
- **C. Grandfather for 90 days.** Aggressive but defensible — new pricing effective for everyone by August.
- **D. No grandfather.** Move everyone to $49 on Day 1 with a 30-day opt-out (prorated refund). Cleanest pricing page. Hostile to early adopters.

**Specialist recommendation:** A for existing Pro customers. Pricing §3 acknowledges the $29 is a signaling problem, not a theft-of-revenue problem — the fix is for *new* customers, not retroactive. Pricing §7 churn risk is highest if long-term users feel ambushed. The Early Bird tier at $14/mo specifically promises "Rate never increases" and must be honored.

**Why this needs Thomas's call:** This is a brand-trust call, not a pricing call. The landing page literally says "Rate never increases" to Early Bird users. Breaking that is a one-way door. But if Thomas is comfortable with a 12-month honor-then-reprice for *non*-Early-Bird Pro subscribers (Option B for them, A for Early Bird only), revenue impact is materially higher. Roundtable leans A; Thomas owns the trust consequences.

---

## Fork #3 — Free tier structure

**Decision:** Free tier goes from 3/day to *what*?

**Options:**
- **A. 5-lifetime then 1/day.** Pricing §4 recommendation. Burns the wow fast, then soft paywall. Matches VSAI.
- **B. First generation free + 1/day.** Pricing §3 alternate. Max aggression; closes the door fastest on free riders.
- **C. Keep 3/day but cap at 30 lifetime.** Compromise; lets an agent finish a listing over a weekend on free.
- **D. Unauth `/try` gets 1 free before sign-in; authed free = 1/day.** Bolts onto IA §3 recommendation for the unauth demo.

**Specialist recommendation:** A + D combined. Unauth `/try` gets the first hit of "wow" (IA §3, Competitive §1.1), then sign-in unlocks 4 more lifetime, then 1/day. Matches Reimagine's "3 free designs" winner and VSAI's first-free.

**Why this needs Thomas's call:** The Free tier is the top of the funnel. Tightening it increases paid conversion but decreases referral volume (ICP §3 names referrals as an A-channel). If Thomas's marketing plan leans heavily on free-tier virality, C is the lower-risk pick. If the plan leans on paid acquisition (Meta ads), A+D is right.

---

## Fork #4 — Settings as page vs. panel

**Decision:** IA proposes killing the single-modal Settings surface and replacing with `/settings/*` routes.

**Options:**
- **A. Full route refactor.** `/settings/brand`, `/settings/team`, `/settings/billing`, `/settings/referral`, `/settings/integrations`, `/settings/account`. Deep-linkable, shareable, tabbable. IA §5 recommendation.
- **B. Panel-based with URL hash.** `/settings#brand`. Cheaper to ship; one component. Deep-linkable but not SEO-indexable.
- **C. Keep the current Access Panel modal.** Add tabs inside the modal. Minimum effort.

**Specialist recommendation:** A. IA §4 #1 names this as the top IA issue. Settings is currently a scavenger hunt. Deep-linkable settings also unlocks Phase 2 onboarding ("send your agent this link to set up their brand kit") and Phase 3 GHL native integration.

**Why this needs Thomas's call:** A is a real refactor — App.tsx currently has no router. Introducing `react-router-dom` or Next.js-style routing is a 1–2 day change and touches the auth gate, the session queue state, and the mobile nav. If Thomas wants Phase 1 to be a11y/perf-only (no routing changes), we defer to Phase 2 and ship B in Phase 1 as a temporary bridge.

---

## Fork #5 — Listing Dashboard: mount vs. redesign

**Decision:** `ListingDashboard.tsx` and `useListing.ts` are built but not mounted in `App.tsx` (IA §4 #2; CLAUDE.md §1.7 marks 1.7 as "start last").

**Options:**
- **A. Mount the existing code as-is, then iterate.** Unblocks the "listings as center of gravity" IA in Phase 2. Fastest path.
- **B. Redesign from scratch against the new IA.** Cleaner, but 1–2 weeks more work.
- **C. Defer to Phase 3.** Phase 2 ships without a listings surface; we keep the flat history grid.

**Specialist recommendation:** A. IA §4 #2 and §5 both argue for mounting the existing component. It's been built against the CLAUDE.md spec (1.1 + 1.2 + 1.3 + 1.4 deps). Even if the UI needs polish, having a `/listings` surface shipping is more valuable than a perfect dashboard shipping two weeks later.

**Why this needs Thomas's call:** If the existing `ListingDashboard.tsx` has bugs Thomas already knows about, mount-as-is could surface them publicly. He knows the code; roundtable only read it. If Thomas says the component is not production-ready, we fall back to C and wire it in Phase 3 with a real design pass.

---

## Fork #6 — PWA now vs. native wrapper later

**Decision:** Mobile §9 recommends a PWA manifest in Phase 1. When do we go native?

**Options:**
- **A. PWA in Phase 1, revisit native at 100+ installs.** Mobile §roadmap ship-first.
- **B. PWA in Phase 1, Capacitor wrapper in Phase 3.** Adds app-store presence without rewriting.
- **C. Skip PWA, go straight to React Native.** Biggest investment, biggest payoff if the mobile user is real.
- **D. No mobile investment beyond the current viewport fixes.** Say no to mobile as a strategic surface.

**Specialist recommendation:** A. Mobile §9 and §roadmap both start here. Cost is ~60 lines of change. A React Native rewrite is ~2 months and the ICP research (ICP §1) doesn't suggest agents install apps for staging — they use it in a browser tab.

**Why this needs Thomas's call:** A&B's own field workflow (photographer at a listing) might drive native demand that isn't in the ICP research. If Thomas's photographers need an iPhone app for on-site staging previews, that's a specific B-track feature that should live in the Enterprise roadmap, not Phase 1.

---

## Fork #7 — Keep "StudioAI" or rename

**Decision:** Copy §Summary calls "StudioAI" a technical-sounding name that doesn't reflect the listing-kit positioning. Competitive §6 recommends the category "AI Listing Kit." Is the product name next?

**Options:**
- **A. Keep "StudioAI," change the category tag only.** "StudioAI — The AI Listing Kit." No domain change, no auth re-jig, no Stripe product rename.
- **B. Rename to "ListingKit" (or similar).** studioai.averyandbryant.com → listingkit.com or similar. Biggest lift: auth, Stripe, Vercel, brand assets, OG images, all external links. 2–4 weeks.
- **C. Rename to "StudioAI Listing Kit" (compound).** Hybrid; signals both. URL stays.

**Specialist recommendation:** A. The roundtable is unanimous that the positioning change matters more than the name. "StudioAI" is the brand; "The AI Listing Kit" is the category. Phase 3 can revisit if the category tag gains traction and a clean standalone domain becomes strategically valuable (SEO, trademark).

**Why this needs Thomas's call:** Thomas owns the brand decision, full stop. Also: Avery & Bryant may want to rename if Phase 2 Enterprise becomes a separate B2B product ("ListingKit for Brokerages" as a white-label SKU). That's a Phase 2 decision, not Phase 1.

---

## Fork #8 — Tailwind CDN removal: safe deploy vs. risk breakage

**Decision:** The Tailwind CDN (`index.html:28`) is explicitly "not for production" per Tailwind's docs. A11y §3 and Mobile §8 both flag it as the biggest single perf win (~60–70 KB, 150–300ms LCP).

**Options:**
- **A. Swap to compiled Tailwind in Phase 1.** Risk: any class the CDN was JIT-generating that isn't in `tailwind.config.js` will silently stop rendering. Mitigation: full visual regression pass + Playwright screenshot diff.
- **B. Ship an intermediate compile step** (run Tailwind CLI as part of Vite build; keep CDN as fallback). Belt-and-suspenders.
- **C. Defer to Phase 2.** Phase 1 focuses on structural a11y/perf wins; Tailwind compile waits.

**Specialist recommendation:** A with a visual regression gate. A11y §3 #1 names this as the single biggest perf win. The risk is real — arbitrary values like `text-[9px]`, `rounded-[2.5rem]`, `shadow-blue-500/20` need to be in the compiled CSS — but the UI consolidation pass (UI §11, §12) is killing most of those anyway. Doing them in the same sprint is cleaner than doing them twice.

**Why this needs Thomas's call:** A Playwright-driven visual regression harness doesn't exist yet. Thomas either accepts a 1-day Playwright investment to gate the Tailwind swap, or accepts some post-deploy visual drift and fixes forward. Both are defensible; the choice depends on his risk tolerance during a pricing/positioning change.

---

## Fork #9 — Public API: ship in Phase 3 or defer to Phase 4

**Decision:** Competitive §5 Gap #3 calls a public API at the Pro tier category-defining. ICP §5 shows media companies rank it as Critical.

**Options:**
- **A. Ship read-only API in Phase 3** (auth, rate limits, 3 endpoints: generate, list history, download result). 2–3 week build.
- **B. Ship full API in Phase 3** (the above + batch + webhooks + Zapier integration). 5–6 weeks, likely pushes Phase 3 exit past 2026-07-13.
- **C. Defer API entirely.** Phase 3 focuses on Listing Score + Structural Lock + reference-image + content moat. API waits for Phase 4.

**Specialist recommendation:** A. Shipping a minimal read-write API with a developer-portal-lite page unlocks the "agent with a Zapier habit" segment (Competitive §5 Gap #3) without blocking Phase 3. GHL native integration (which Thomas is already in the ecosystem of) becomes a B+ option if API is live.

**Why this needs Thomas's call:** An API has security/abuse implications (rate limits, key management, billing leakage if a Pro user gives their key to 10 friends). If Thomas isn't set up to support developer traffic (docs, status page, incident response), C is safer. If he's happy to eat one weekend of Gemini abuse while we tune rate limits, A is right.

---

## Fork #10 — Pre-generation low-res preview

**Decision:** Competitive §4 #2 proposes Krea-style real-time canvas: pre-compute a low-res style preview as the user picks a pack, before they hit Generate.

**Options:**
- **A. Ship it in Phase 3.** Visible differentiator. Gemini cost impact: each pack-hover triggers a thumbnail generation, potentially 2–3x Gemini spend per session.
- **B. Ship a static preview image per pack** (no generation, just a reference render). Zero Gemini cost; minimal wait-loop anxiety fix.
- **C. Don't ship.** Focus Phase 3 on Listing Score + API + Structural Lock.

**Specialist recommendation:** B for Phase 3, A for Phase 4. The static preview per pack is a 2-day cost, closes 80% of the anxiety gap, and zero margin impact. Live real-time preview can wait until we know Gemini cost trajectory.

**Why this needs Thomas's call:** Gemini margins. If Thomas is comfortable burning 2–3x inference cost on pack-hover previews for the perceived-quality win (and the ICP justifies it), A. If margins are tight, B.

---

**Decision format:** Thomas replies with `#1: A`, `#2: A`, `#3: A+D`, etc. Any fork not resolved by Monday 2026-04-21 blocks the Phase 1 kickoff.

*End of forks.*
