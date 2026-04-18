# Competitive Intelligence — StudioAI Overhaul 2026-04

*Author: Competitive Intelligence specialist*
*Date: 2026-04-17*
*Subject under review: StudioAI (studioai.averyandbryant.com) vs 8 competitors*

---

## Research method & disclosure

Primary source for StudioAI behavior: `/Users/camillebrown/StudioAI/docs/SOP.md`. Competitor data was collected by direct page fetches on 2026-04-17 plus cross-referenced third-party reviews (Capterra, SaaSworthy, HousingWire, Inman, Apr 2026). Where live pricing pages blocked automated fetch, price data was pulled from the vendor's own published pricing pages as indexed in the last 30 days. Anything I could not verify is marked **"not publicly listed."**

---

## 1. Per-competitor profiles

### 1.1 Virtual Staging AI — virtualstagingai.app

- **Positioning.** "AI virtual staging in seconds." The clearest DTC pure-play. Targets solo agents and photographers, not brokerages.
- **Pricing** (monthly, annual-discounted to 50%):
  - Basic — $16/mo, 6 photos, $2.67/photo
  - Standard — $19/mo, 20 photos, $0.95/photo
  - Professional — $39/mo, 60 photos, $0.65/photo
  - Enterprise — $79/mo, 150 photos + API access, $0.53/photo
- **Features.** Virtual staging, furniture removal, day-to-dusk (exteriors), sky replacement, batch upload, MLS-compliant export. **No brand kit, no social pack, no listing-copy generator, no team/white-label except enterprise API.**
- **UX worth stealing.** "10-second turnaround" is their north-star metric and it's on every page. Ruthlessly fast onboarding — upload → style → render in under a minute. No signup friction.
- **Gaps.** L-shaped rooms, vaulted ceilings, and alcoves break their model. No in-app iterative refinement — every render is a fresh output. No listing-kit wrapper (copy, social, flyers).
- **Source.** [virtualstagingai.app/pricing](https://www.virtualstagingai.app/pricing), [Trustpilot reviews](https://www.trustpilot.com/review/virtualstagingai.app).

### 1.2 Styldod — styldod.com

- **Positioning.** "The one-stop shop for real estate photo editing, virtual staging & more." Human-in-the-loop service bureau with AI layered on top.
- **Pricing.** Per-image, no subscription required:
  - Virtual staging — $16/image at 8+, $23 under 8
  - Commercial virtual staging — $24/image
  - Object removal — $8/image
  - Day to dusk — $4/image
  - Matterport staging — $25/hotspot
  - Photo editing (retouching) — from $1/image
- **Features.** Virtual staging, virtual renovation, object removal, day-to-dusk, image enhancement, floor plans, 360° tours, 3D rendering, Matterport staging, single-property websites, property videos. **Widest feature surface of any competitor.** No self-serve API. No brand kit.
- **UX worth stealing.** Service-tier menu — user picks *outcome* (e.g. "occupied → vacant"), not tool. Pricing is transparent and à la carte.
- **Gaps.** 24-48 hr turnaround kills the impulse-edit use case. No self-serve editor; every job is ticketed.
- **Source.** [styldod.com/services](https://www.styldod.com/services), [styldod.com/day-to-dusk](https://www.styldod.com/day-to-dusk), [Capterra listing](https://www.capterra.com/p/214528/Styldod/).

### 1.3 BoxBrownie — boxbrownie.com/virtual-staging

- **Positioning.** "Real estate photo editing and virtual staging done by human editors." Trust-led positioning against pure-AI tools.
- **Pricing.** Purely transactional, no subscriptions:
  - Virtual staging — $24/image (up to $176/image for complex commercial)
  - Day to dusk — $4/image
  - Item removal — bundled/à la carte
  - Floor plans, copywriting, photo enhancement — separate menu
- **Features.** Virtual staging (human), day-to-dusk, item removal, image enhancement, floor plans, renovation, copywriting. 48-hour turnaround. **No API, no brand kit, no social pack, no white-label.**
- **UX worth stealing.** Upfront per-item pricing grid with a live cart. Zero ambiguity about total spend before checkout. "Virtual Staging Price Drop" campaign page — transparent discounting as a trust signal.
- **Gaps.** Slow vs AI tools. No real-time iteration. No batch discounts.
- **Source.** [boxbrownie.com/pricing](https://www.boxbrownie.com/pricing), [PhotoFounder comparison](https://www.photofounder.com/blog/boxbrownie-vs-virtual-staging-ai).

### 1.4 Rooomy — rooomy.com

- **Positioning.** "Luxury listings and Matterport 3D tours, human-designed." Dutch studio. Has pivoted half of its energy into ecommerce/retail 3D, which dilutes its real estate message.
- **Pricing.** $49/image (no reworks), $69/image (with revisions). Matterport tour staging priced separately on request.
- **Features.** Human-designed 2D staging, Matterport 3D tour staging (one of the few), real-product integration (shoppable scenes). **No self-serve AI, no API publicly, no brand kit, no batch.**
- **UX worth stealing.** Shoppable staged scenes — links to real furniture. This is table-stakes in ecom and rare in real estate.
- **Gaps.** Slow, expensive, not self-serve. Identity drift between "luxury real estate" and "ecommerce retail" muddles positioning.
- **Source.** [rooomy.com](https://rooomy.com/), [HousingWire 2026 roundup](https://www.housingwire.com/articles/virtual-staging-companies-apps/).

### 1.5 REimagine Home — reimaginehome.ai

- **Positioning.** "Design clarity you can act on." Broader than real estate — also targets interior designers, landscapers, homeowners, developers.
- **Pricing.**
  - Decision Mode (Free) — 3 designs, full AI access
  - Essential — $14/mo, 30 credits
  - Optimal — $29/mo, 200 credits
  - Advanced — $49/mo, 500 credits
  - Premium — $99/mo, 1,200 credits
- **Features.** Virtual staging, empty-your-space, room repurpose, interior renovation, object removal, sky replacement, day-to-dusk, lawn replacement, landscaping, hardscaping, pool addition, seasonal reset ("festive flip"), repaint walls, exterior structure rendering, real-product integration (shoppable), batch workflow (up to 50 photos), compliance flagging, bulk high-res downloads. **Broadest AI feature matrix of any pure-AI competitor.** No native MLS export presets, no API, no mobile app, no brand kit.
- **UX worth stealing.**
  - **Structural Lock** — user-facing toggle that keeps walls/ceilings/windows unchanged. StudioAI already does this server-side; REimagine exposes it as a control.
  - **Budget + ZIP real-product filter** — agent types $2,500 budget + 94107 ZIP, gets shoppable furniture sets.
  - **Reference-image prompting** — "use this image for the bed frame and bedding."
  - Iterative refinement language: *"Each refinement builds on the last — decisions get clearer, not noisier."*
  - **Compliance flagging** on batch — surfaces potentially-deceptive edits for real estate disclosure.
- **Gaps.** Pro tier pricing is opaque on the homepage. Doesn't wrap the output in MLS-ready packaging (sized exports, listing copy, social tiles).
- **Source.** [reimaginehome.ai/pricing](https://www.reimaginehome.ai/pricing), [reimaginehome.ai](https://www.reimaginehome.ai/).

### 1.6 Apply Design — applydesign.io

- **Positioning.** "AI-powered virtual staging you can actually control." Two-modal: Auto (one-click) and DIY (drag-drop furniture editor).
- **Pricing.** Credit-based ("Apply Coins"):
  - Auto staging 2D — 1.5 coins; Auto 360 — 2.5 coins
  - DIY staging 2D — 1 coin; DIY 360 — 2 coins
  - Coin price: $10 (1-9), $8 (10-19), $7 (20+)
  - DIY flat $7/image at high volume
- **Features.** Auto AI staging, DIY drag-drop editor, AI decluttering, 360° images, shadow/reflection realism, 15-min turnaround for Auto, unlimited DIY revisions. **No brand kit, no social pack, no API publicly listed, no MLS export presets, no batch, no mobile app.**
- **UX worth stealing.** DIY drag-drop editor with real-time rendered preview. Curated furniture bundles for rapid scene construction. First image free trial with no signup.
- **Gaps.** No unified listing pipeline — just staging. No automation/batch layer.
- **Source.** [applydesign.io/diy](https://www.applydesign.io/diy), [applydesign.io](https://www.applydesign.io/).

### 1.7 Photoroom — photoroom.com (adjacent UX benchmark)

- **Positioning.** "AI photo editor for ecommerce and creators." Not real estate, but sets UX bar for polished AI image tooling.
- **Pricing.**
  - Free — 250 exports/mo, watermark
  - Pro — $12.99/mo
  - Max — $34.99/mo
  - Enterprise — custom, API-first (100K+ images/yr minimum)
- **Features (UX-relevant).** Virtual Model, AI Relight, Batch editing (50 images Pro / 250 Max), Listing Score, AI Ironing, Image Enhancer, templates, team seats, mobile app (iOS + Android), API with consumption billing.
- **UX worth stealing.**
  - **"Listing Score"** — AI rates the output against platform best practices and tells user what to fix. Exactly the pattern a real estate tool should use ("MLS-ready: 8.2/10").
  - **Batch mode with grid progress UI** — every image processed live.
  - **Mobile-first creation**, not an afterthought.
  - **Templates-as-starting-point** vs. blank canvas.
- **Gaps.** Not real-estate-aware; nothing to steal on domain specifics.
- **Source.** [photoroom.com/pricing](https://www.photoroom.com/pricing), [Capterra 2026 listing](https://www.capterra.com/p/10012666/PhotoRoom/).

### 1.8 Krea — krea.ai (adjacent UX benchmark)

- **Positioning.** "AI creative suite for images, video, and 3D." Power-user creative tool.
- **Pricing.**
  - Free — 100 compute units/day
  - Basic — ~$8-9/mo, 5K units
  - Pro — ~$28-35/mo, full video, 8K upscale, workflow nodes
  - Max — higher compute, 22K upscale, unlimited LoRA training, unlimited concurrent gens
  - Business / Enterprise — team seats, rollover credits, custom compute
- **Features (UX-relevant).** **Real-time canvas** — images regenerate under 50ms as the user types or draws. Node-based workflow automation. 64+ models (Krea 1, Flux, Ideogram, Veo 3, Kling, Runway). Direct region editing, object movement, relighting, camera change, palette shift, image expansion. 1,000+ style presets.
- **UX worth stealing.**
  - **Real-time canvas** — the biggest AI UX innovation of the last 18 months. Generating under 50ms means no wait states. StudioAI currently shows a 3-line progress animation; Krea has eliminated the wait entirely.
  - **Nodes / workflow automation** — power-user layer on top of the simple editor. "Stage → Relight → Dusk → Upscale → Export" as a saved pipeline.
  - **Style preset library** at 1,000+ — StudioAI has 7.
- **Gaps.** Not a listing tool. Steep learning curve; agents would bounce.
- **Source.** [krea.ai/pricing](https://www.krea.ai/pricing), [Krea reviews](https://aiphotolabs.com/reviews/krea-ai-review-2025-real-time-creative-suite-with-multi-model-power/).

---

## 2. Feature matrix

Rows = features. Columns = products. ✓ = native, • = partial/limited, — = absent, $ = paid add-on.

| Feature | StudioAI | VS AI | Styldod | BoxBrownie | Rooomy | REimagine | Apply Design | Photoroom | Krea |
|---|---|---|---|---|---|---|---|---|---|
| AI virtual staging | ✓ | ✓ | ✓ (AI+human) | ✓ (human) | ✓ (human) | ✓ | ✓ | — | — |
| Style packs | ✓ (7) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ (1000+) |
| Masked cleanup | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Day-to-dusk | ✓ | ✓ | ✓ ($4) | ✓ ($4) | — | ✓ | — | — | • |
| Sky replacement | ✓ (4 presets) | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ |
| Virtual renovation | ✓ | — | ✓ | ✓ | — | ✓ | — | — | — |
| Batch mode | ✓ (Pro) | ✓ | ✓ | — | — | ✓ (50) | — | ✓ (50/250) | — |
| MLS export presets | ✓ (3) | ✓ | — | — | — | — | — | — | — |
| Social pack templates | ✓ (4) | — | — | — | — | — | — | ✓ | — |
| Listing copy generator | ✓ | — | — | ✓ | — | — | — | — | — |
| Brand kit | ✓ | — | — | — | — | — | — | ✓ (team) | — |
| Team / white-label | • (Pro 1 seat) | • (Enterprise) | — | — | — | — | — | ✓ | ✓ (Biz) |
| Public API | — | ✓ ($79+) | — | — | — | — | — | ✓ | — |
| Mobile app | — | — | — | — | — | — | — | ✓ | — |
| 360°/Matterport | — | — | ✓ | — | ✓ | — | ✓ | — | — |
| Real-product integration | — | — | — | — | ✓ | ✓ | — | — | — |
| Compare slider | ✓ | ✓ | — | — | — | ✓ | ✓ | — | — |
| Real-time canvas | — | — | — | — | — | — | — | — | ✓ |

**Reading the row.** StudioAI already has the deepest *listing-workflow* surface (copy, social, brand kit, MLS export) of any pure-AI competitor. StudioAI is *behind* on: public API, mobile, real-time preview, real-product integration, and 3D/Matterport.

---

## 3. Pricing matrix

| Tier | StudioAI | VS AI | Styldod | BoxBrownie | Rooomy | REimagine | Apply Design | Photoroom | Krea |
|---|---|---|---|---|---|---|---|---|---|
| **Free** | 3/day, watermark | — | — | — | — | 3 designs | 1 image trial | 250 exports, watermark | 100 units/day |
| **Entry** | — | $16/mo (6 photos) | $16/img (8+) | $24/img | $49/img | $14/mo (30 credits) | ~$10/coin | $12.99/mo | ~$8-9/mo |
| **Mid** | **$29/mo unlimited** | $19/mo (20) | $23/img (<8) | — | $69/img +reworks | $29/mo (200) | $7-8/coin | $34.99/mo (Max) | ~$28-35/mo (Pro) |
| **High** | — | $39/mo (60) | $24/img commercial | $176/img complex | — | $49/mo (500) | $7/coin (20+) | — | Max (custom) |
| **Top** | Enterprise (custom) | $79/mo (150, API) | — | — | — | $99/mo (1,200) | — | Enterprise API | Biz/Enterprise |
| **Per-photo floor** | ≈ $0 at unlimited | $0.53 | $16 | $24 | $49 | $0.08 ($99/1200) | $7 | n/a | n/a |

**Reading the table.** StudioAI's $29 unlimited-with-Pro-AI-Tools is the **most aggressive price for breadth** on the board. The closest competitor at $29 (REimagine Optimal) gives 200 credits; StudioAI gives unlimited + listing copy + social pack + MLS export. This is a defensible price-per-value leader position — but it's underclaimed on the landing page.

---

## 4. Top 5 patterns StudioAI should steal

1. **Listing Score (Photoroom-style, domain-adapted).** Run the result through an automated QA pass and surface a visible score: "MLS-ready: 8.2/10 — weaken the watermark contrast." The SOP already plans an SSIM pipeline — ship it as a user-facing score, not just a backend nightly cron.
2. **Real-time canvas preview (Krea-style, scoped).** Pre-compute a low-res style preview as the user picks a pack, before they hit Generate. Closes the wait-loop anxiety and borrows Krea's headline innovation without matching their compute.
3. **Structural Lock as a visible toggle (REimagine-style).** StudioAI's anchor + compositor is load-bearing but invisible. Expose it as a toggle: "Preserve walls/floors/fixtures: ON." Builds trust and differentiates vs. tools that silently mangle structure.
4. **Reference-image prompting (REimagine-style).** Let the user drop a Pinterest-style reference image alongside the prompt: "use this image for the sofa." This is the single biggest prompt-intent unlock for agents who think in moodboards, not words.
5. **Workflow automation / saved recipes (Krea Nodes, lite).** A single-click "Listing Kit" button that chains: stage → dusk hero → smart cleanup batch → MLS export zip → social pack → listing copy. StudioAI has all the parts; the missing primitive is the saved-pipeline abstraction.

---

## 5. Top 3 market gaps StudioAI could own

**Gap #1 — Nobody owns the end-to-end listing kit in one click.**
Every competitor either does staging (VS AI, Apply Design, REimagine) *or* does broad real-estate services with human turnaround (Styldod, BoxBrownie, Rooomy). No one stitches stage + cleanup + dusk + MLS-sized export + listing copy + social tiles + brand kit into a single 5-minute workflow. StudioAI is the only one in the set with all the pieces. **Claim: "From raw photo to MLS-ready listing kit in under 5 minutes."**

**Gap #2 — Nobody treats the media-company / brokerage ICP as first-class.**
All 8 competitors target the solo agent. StudioAI's secondary ICP (real estate *media companies* — Thomas's actual business) is un-served. Features that would own this: per-client brand kits, folder-level white-label export, per-photographer usage reports, shared template libraries, Aryeo/Matterport/Quo integrations. None of the 8 offer any of this.

**Gap #3 — Nobody has an agent-facing API + automations.**
Only VS AI ($79/mo Enterprise) and Photoroom (100K/yr minimum) have an API, and neither is positioned for the "agent with a Zapier habit" or "brokerage with a GHL stack." A StudioAI API at the Pro tier — rate-limited, no 100K minimum — combined with a GHL native integration (Thomas is already in the GHL ecosystem) would be category-defining.

---

## 6. Positioning differentiator StudioAI could claim

> **"The only AI listing kit, not just a staging tool."**

Every competitor above either sells a single edit (BoxBrownie, Styldod) or a generic AI staging output (VS AI, REimagine, Apply Design). StudioAI's real asset is that the staging is the *first step* in a pipeline that produces the agent's actual deliverable — a folder of MLS-ready photos + Instagram posts + MLS copy, sized and branded correctly. That pipeline is invisible on the current landing page. Renaming the product around **"AI Listing Kit"** (with "Virtual Staging" as a supporting tool) aligns the positioning with the actual feature set and leaves the "virtual staging" category to VS AI to defend.

---

## 7. Sources

- StudioAI SOP: `/Users/camillebrown/StudioAI/docs/SOP.md`
- [Virtual Staging AI pricing](https://www.virtualstagingai.app/pricing)
- [Virtual Staging AI API docs](https://docs.virtualstagingai.app/v2-api/core-concepts)
- [VS AI Trustpilot](https://www.trustpilot.com/review/virtualstagingai.app)
- [Styldod services](https://www.styldod.com/services)
- [Styldod day-to-dusk](https://www.styldod.com/day-to-dusk)
- [Styldod object removal](https://www.styldod.com/object-removal)
- [Styldod Capterra](https://www.capterra.com/p/214528/Styldod/)
- [BoxBrownie virtual staging](https://www.boxbrownie.com/virtual-staging)
- [BoxBrownie pricing](https://www.boxbrownie.com/pricing)
- [BoxBrownie vs VSAI comparison](https://www.photofounder.com/blog/boxbrownie-vs-virtual-staging-ai)
- [Rooomy homepage](https://rooomy.com/)
- [Rooomy Matterport](https://rooomy.com/rooomy-virtually-staged-matterport-3d-tours)
- [REimagine Home](https://www.reimaginehome.ai/)
- [REimagine pricing](https://www.reimaginehome.ai/pricing)
- [Apply Design](https://www.applydesign.io/)
- [Apply Design DIY $7/image](https://www.applydesign.io/diy)
- [Photoroom pricing](https://www.photoroom.com/pricing)
- [Photoroom API pricing](https://www.photoroom.com/api/pricing)
- [Krea pricing](https://www.krea.ai/pricing)
- [Krea homepage](https://www.krea.ai/)
- [HousingWire 2026 roundup](https://www.housingwire.com/articles/virtual-staging-companies-apps/)
- [Inman: Collov AI crowded-category review (Nov 2025)](https://www.inman.com/2025/11/24/in-crowded-virtual-staging-category-collov-ai-offers-ease-affordability-tech-review/)

*End of report.*
