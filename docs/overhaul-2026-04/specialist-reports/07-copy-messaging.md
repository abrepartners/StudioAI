# 07 — Copy & Messaging Audit

**Scope:** every user-visible string in StudioAI — landing, editor, modals, errors, onboarding, pricing, empty states.
**Source of truth:** `/Users/camillebrown/StudioAI/docs/SOP.md` for vocabulary (Original / Result / Pack / Commit & Continue / Pro AI Tools).
**ICP:** listing agents (primary), RE media companies (secondary).
**Voice target:** Apple-premium — direct, human, concrete. No buzzwords, no sci-fi residue, no hype.

---

## 1. Copy Inventory (by surface)

### 1.1 Landing page (`App.tsx` lines 1224-1801)

| Slot | Current copy | File:Line |
|---|---|---|
| Nav sign-in | `Sign In` | App.tsx:1249 |
| Nav primary CTA | `Start Free — No Credit Card` / `Start Free` | App.tsx:1256-1257 |
| Hero eyebrow pill | `Early Bird — $14/mo for first 20 users` | App.tsx:1274 |
| Hero headline (rotating) | `AI photo editing for [real estate. / interior design. / property flipping. / RE photography. / renovations. / property management.]` | App.tsx:146, 177 |
| Hero subhead | `Stage empty rooms. Clean up yards. Convert day to dusk. Replace skies. Visualize renovations. One tool for agents, photographers, designers, and flippers.` | App.tsx:1279-1281 |
| Cost comparison | `$300/room → $1.38/room with StudioAI` | App.tsx:1285-1288 |
| Hero primary CTA | `Start Free — No Credit Card` | App.tsx:1294 |
| Hero secondary CTA | `See Pricing` | App.tsx:1297 |
| Hero stats | `3/day — Free generations · ~15s — Per render · 12+ — Styles` | App.tsx:1302 |
| Demo caption | `Watch: Upload a photo, describe what you want, get results in seconds` | App.tsx:1325 |
| "Who It's For" chips | `Listing Agents · RE Photographers · Brokerages · Property Managers · Interior Designers · Flippers & Renovators` | App.tsx:1334-1340 |
| Features eyebrow | `What StudioAI Does` | App.tsx:1355 |
| Features H2 | `Every tool your photos need.` | App.tsx:1356 |
| Features subhead | `Upload any property photo — empty rooms, cluttered yards, dull skies — and transform it in seconds. No Photoshop, no contractors, no reshoot.` | App.tsx:1359 |
| Virtual Staging card | `Stage any empty room with photorealistic furniture in 12+ styles. AI reads the room size and places appropriately scaled pieces — no king beds in small rooms, no sectionals in tight spaces.` | App.tsx:1368 |
| Smart Cleanup card | `Remove realtor signs, yard debris, personal items, toys, and clutter from any photo. Interior or exterior — the AI strips distractions and reveals clean surfaces without adding anything new.` | App.tsx:1377 |
| Day to Dusk card | `Turn daytime exteriors into twilight shots with warm window glow — the #1 photographer trick` | App.tsx:1408 |
| Sky Replacement card | `Swap grey overcast for blue, dramatic, or golden-hour skies in one click` | App.tsx:1409 |
| Batch Editing card | `Upload an entire listing (25+ photos) and process them all in parallel` | App.tsx:1410 |
| Selective Removal card | `Paint over specific items to remove them — keep everything else exactly as-is` | App.tsx:1411 |
| Social proof eyebrow | `Trusted by Agents` | App.tsx:1435 |
| How It Works H2 | `How It Works` | App.tsx:1479 |
| How It Works subhead | `Three steps. Under 30 seconds. No learning curve.` | App.tsx:1480 |
| Step 1 | `Upload · Drop in one photo or an entire listing. We auto-detect room types and lighting conditions.` | App.tsx:1487 |
| Step 2 | `Edit · Pick a tool — stage, cleanup, twilight, sky. Navigate between photos with next/back.` | App.tsx:1488 |
| Step 3 | `Export · Download MLS-ready photos. Share the before/after. Done in minutes, not days.` | App.tsx:1489 |
| Showcase eyebrow | `Real Results` | App.tsx:1547 |
| Showcase H2 | `From actual listings. Not mockups.` | App.tsx:1548 |
| Community Gallery H2 | `Made by agents like you.` | App.tsx:239 |
| Pricing H2 | `Simple Pricing.` | App.tsx:1592 |
| Pricing subhead | `Start free. Upgrade when you're ready. Cancel anytime.` | App.tsx:1594 |
| Early Bird features | `All features, unlimited · Rate never increases · Referral code (5 uses) · Friends get your rate too` | App.tsx:1610 |
| Pro features | `All features, unlimited · Batch processing · All special modes · Priority rendering` | App.tsx:1635 |
| Credits subhead | `No subscription. Buy credits, use anytime.` | App.tsx:1655 |
| Brokerage headline | `Give your entire team Pro access.` | App.tsx:1678 |
| FAQ H2 | `Common Questions` | App.tsx:1723 |
| Final CTA H2 | `Stop Paying $300 Per Staging.` | App.tsx:1767 |
| Final CTA sub | `Professional results in seconds — not days. Join agents already saving thousands.` | App.tsx:1770 |

### 1.2 Auth / loading

| Slot | Current | File:Line |
|---|---|---|
| Auth loading screen | (no text — just spinner) | App.tsx:1209-1222 |
| Sign-in | Google OAuth button (Google-owned copy) | App.tsx:1246 |

### 1.3 Editor — primary CTAs (`components/StyleControls.tsx`)

| State | Current | File:Line |
|---|---|---|
| First generation | `Generate Design` | StyleControls.tsx:335 |
| Text mode, after first gen | `Build on Current` | StyleControls.tsx:333 |
| Packs mode, after first gen | `Re-Generate (Replace)` | StyleControls.tsx:333 |
| Generating | `Generating...` | StyleControls.tsx:331 |
| Card title | `Design Direction` | StyleControls.tsx:235 |
| Card subtitle | `Describe the look you want` | StyleControls.tsx:236 |
| First-gen helper | `Describe the first design you want to generate.` | StyleControls.tsx:240 |
| Post-gen helper | `Update your direction, then re-generate for a fresh composition.` | StyleControls.tsx:240 |
| Bottom helper | `First generation starts from your uploaded photo.` / `Packs replace your current result with a fresh staging.` / `Text prompts build on top of your current result — add, tweak, or refine.` | StyleControls.tsx:342-346 |
| Textarea placeholder | `e.g. warm oak flooring, sculptural lamp, linen drapes` | StyleControls.tsx:245 |
| Suggested prompts | `Scandinavian minimalist with light oak wood` / `Mid-century modern with warm walnut accents` / `Coastal contemporary with natural textures` / `Industrial loft with exposed brick` | StyleControls.tsx:251-254 |

### 1.4 Pro AI Tools (`components/SpecialModesPanel.tsx`)

| Tool | Title / Subtitle / CTA | File:Line |
|---|---|---|
| Section header | `Special Modes · Pro AI Tools` / `Advanced tools that go beyond basic staging. These features work on uploaded photos.` | SPMP:194-196 |
| Twilight | `Day to Dusk · Transform daytime photos into twilight shots` — Body: `Turn any daytime exterior into a stunning twilight photo with warm interior glow and golden-hour lighting.` — CTA: `Create Twilight Shot` | SPMP:253-267 |
| Sky | `Sky Replacement · Replace dull skies with beautiful ones` — Body: `Swap out overcast or dull skies with a beautiful replacement. Choose from four presets below.` — CTA: `Replace Sky` | SPMP:271-299 |
| Declutter | `Smart Cleanup · Remove clutter and personal items automatically` — Body: `Automatically remove personal items, clutter, and distractions to present a clean, show-ready space.` — CTA: `Remove Clutter` | SPMP:303-317 |
| Renovation | `Virtual Renovation · Preview new finishes and materials` — Body: `Preview new cabinets, countertops, flooring, and wall colors on your listing photos before any work is done.` — CTA: `Preview Renovation` | SPMP:321-351 |
| Listing Copy | `Listing Copy · MLS descriptions, social captions & hashtags` — CTA: `Generate [Tone] Copy` / loading: `Writing copy...` | SPMP:355-431 |

### 1.5 Loading / progress states (`App.tsx`)

| Slot | Current | File:Line |
|---|---|---|
| Canvas overlay label | `Generating Design` | App.tsx:2397 |
| Animated line 1 | `Reading the room…` | App.tsx:2403 |
| Animated line 2 | `Placing furniture…` | App.tsx:2404 |
| Animated line 3 | `Polishing the final render` | App.tsx:2405 |
| Uploader analyzing | `Analyzing Space · Extracting room type and palette...` | ImageUploader:58-59 |
| Room detection pill | `Detecting...` | App.tsx:2461 |
| Cleanup indicator | `Mask Mode` | App.tsx:2506 |
| Export modal progress | `Processing {n}/{total}...` | MLSExport:276 |

### 1.6 Error / toast messages (`App.tsx`)

| Trigger | Current | File:Line |
|---|---|---|
| Generation timeout | `Generation timed out — try again` | App.tsx:868 |
| API/key issue | `Service temporarily unavailable` | App.tsx:875 |
| Generic gen failure | `Generation failed. Try again.` | App.tsx:877 |
| Removal timeout | `Removal timed out — try again` | App.tsx:921 |
| Removal fail | `Removal failed. Try again.` | App.tsx:923 |
| Share success | `Submitted for review!` | App.tsx:981 |
| Share fail | `Failed to share` | App.tsx:986 |
| Save success | `Design saved` | App.tsx:1016 |
| Save fail | `Failed to save` | App.tsx:1018 |
| Pro AI Tools no image | `Upload a photo first.` | SPMP:129 |
| Pro AI Tools timeout | `Processing timed out — please try again.` | SPMP:138 |
| Pro AI Tools generic | `Something went wrong. Try again.` | SPMP:140 |
| Social pack no images | `No staged photos yet. Generate at least one staged image first — otherwise the template renders with a blank "Property Photo" placeholder.` | SocialPack:381 |
| Social pack brand kit | `Your agent name is blank. Fill in Brand Kit (Settings) so your name appears on every render.` | SocialPack:399 |

### 1.7 Onboarding (`components/QuickStartTutorial.tsx`)

| Step | Title | Description |
|---|---|---|
| 1 | `Upload Your Photos` | `Drag and drop listing photos here — one at a time or multiple for batch editing. We auto-detect the room type for you.` |
| 2 | `Choose a Style Pack` | `Select PACKS mode, then pick a design style like Coastal Modern or Mid-Century. The AI stages the room to match.` |
| 3 | `Or Describe What You Want` | `Use TEXT mode to type a custom direction like "modern minimalist with warm wood tones" — the AI follows your lead.` |
| 4 | `Special Modes` | `Scroll down in the side panel for Day to Dusk, Sky Replacement, Smart Cleanup, and Virtual Renovation. Each does one thing well.` |
| 5 | `Work on Multiple Photos` | `Use the + Add button in the header to upload more photos. Navigate between them with the < 1/4 > arrows. Each keeps its own edits.` |
| 6 | `Export When Done` | `Hit Export in the header to download your staged image. Use Save to keep it in your history for later.` |

### 1.8 Upgrade / gate modals (`App.tsx:1823-1918`)

| Slot | Current | File:Line |
|---|---|---|
| Modal title | `Upgrade to Pro` | App.tsx:1832 |
| Modal subtitle | `Unlimited AI generations` / `Referred — special rate locked in forever` | App.tsx:1833-1834 |
| Checkout CTA | `Start Pro Plan` / `Start Pro — $N/mo` | App.tsx:1885 |
| Trust line | `Cancel anytime. Rate locked in forever. Powered by Stripe.` | App.tsx:1887 |
| Credits sub-header | `Or buy credits — no subscription` | App.tsx:1891 |

### 1.9 EditingBadge (`components/EditingBadge.tsx`)

| Slot | Current |
|---|---|
| No result | `Editing original photo` |
| With result | `Editing your result · v{N}` |
| Chain cap pill | `chain full` |
| Popover last-edit | `Last edit: {tool}` |
| Chain depth note | `Chain depth: {N} — commit recommended` |
| Commit action | `Commit & continue` + `Lock in current result as new base. Prevents further quality drift.` |
| Start-over action | `Start from original` |
| History action | `View history` |

### 1.10 Empty states / misc

- History panel empty: `No renders yet. Generate your first design.` (App.tsx:2538)
- Batch uploader idle: `Drop room photos · Single photo or multiple for batch editing` (BatchUploader:225-229)
- Uploader idle: `Drop a room photo · or choose an option below` (ImageUploader:67-69)
- MLS export EXIF notice: `EXIF metadata (GPS, camera info, timestamps) is automatically stripped from all exports.` (MLSExport:254)
- Brand Kit header sub: `Set up your brand once. Every export, website, and print piece will use it automatically.` (BrandKit:78)

---

## 2. Voice Audit — Where It Breaks

**The voice is inconsistent across three zones:**

1. **Landing page** — marketing-direct ("Stop Paying $300 Per Staging"), outcome-forward, sales-y but mostly on-tone. Strong.
2. **Editor** — oscillates between technical ("Design Direction", "chain full", "Re-Generate (Replace)") and sci-fi-flavored UPPERCASE button text (`GENERATE DESIGN`, `BUILD ON CURRENT`, `REMOVE CLUTTER`). The uppercase tracking-wider treatment is a leftover from the old cyberpunk aesthetic. Apple doesn't do all-caps button labels. Neither should we.
3. **Pro AI Tools panel** — sneaks back in the banned words: "stunning twilight photo," "beautiful replacement," "show-ready space." These are the exact vague adjectives the brief calls out.
4. **Errors** — partially human ("Generation timed out — try again") but partially generic ("Something went wrong. Try again.", "Failed to save"). None route the user to a next action.
5. **Onboarding** — friendly but teacher-y ("We auto-detect the room type for you"). Feels like a help doc rather than an assistant.

**Biggest voice break:** the landing sells outcomes to agents ("Stop Paying $300"), but the editor forgets they're agents. It speaks to "users" in design-software language ("Design Direction", "fresh composition", "Re-Generate"). An agent doesn't want a fresh composition — they want a living room buyers will message about.

---

## 3. ICP Targeting — Where Agent Language Is Missing

The **landing** scores well: realtor-specific pain shows up ("Stop Paying $300 Per Staging", "MLS-ready", "just-listed postcard", "Days on Market" implied). Testimonials are role-labeled ("Listing Agent", "RE Photographer").

The **editor** is where the ICP evaporates:

- `Generate Design` — agents don't say "design." They say "staged photo."
- `Design Direction` card — feels like Adobe. An agent wants "How should this room look?"
- `Build on Current` — technical. An agent is thinking "tweak it."
- `Polishing the final render` — "render" is a 3D-software word.
- Suggested prompts are all aesthetic-first ("Scandinavian minimalist…"). Where is "add staging for a family buyer" or "make it move-in ready"?
- No prompt chip references listing price tier (luxury vs. starter), target buyer persona, or season.

The **error messages** are generic app errors. None mention the listing context ("This photo is too dark for Day to Dusk — upload one shot between 10am-4pm").

---

## 4. Value Prop Clarity — Hero Audit

Current hero: `AI photo editing for [real estate / interior design / property flipping / RE photography / renovations / property management].`

Problem: the rotating verticals are a hedge. It tries to include everyone and as a result promises nothing specific. "AI photo editing" is a category, not a value prop. Canva is AI photo editing. Photoshop is AI photo editing.

Real estate agents don't search for "AI photo editing." They search for "virtual staging." They search for the outcome: "make my listing sell faster."

The sub-headline is a feature list — 5 verbs in a row — which is the classic sign a hero is underweight. Features belong under the fold.

**What's missing:** a number that makes them stop. The Reimagine Home hero ("Create spaces you'll actually show, buy, or commit to") is worse than ours, frankly, but they lead with an outcome noun. Virtual Staging AI leads with "Virtually stage any space in less than 5 seconds" — speed as the hook. Styldod leads with price comparison. We have the numbers (`$300 → $1.38`, `15s per render`) but they're buried as a chip, not the headline.

---

## 5. Specificity Audit — Banned Words Present

Instances of vague, Apple-violation words currently shipping:

- **"stunning"** — `Create stunning, branded listing websites` (CLAUDE.md); `Turn any daytime exterior into a stunning twilight photo` (SPMP:255)
- **"beautiful"** — `Replace dull skies with beautiful ones` (SPMP:271); `Swap out overcast or dull skies with a beautiful replacement` (SPMP:272)
- **"seamless"** — absent (good, already scrubbed)
- **"intuitive"** — absent (good)
- **"next-gen"** — absent (good)
- **"revolutionary"** — absent (good)
- **"amazing"** — absent (good)
- **Residual hype:** "Professional results in seconds" (App.tsx:1770) — "professional results" is the exact thing agents eye-roll at.

---

## 6. CTA Audit — Are Buttons Action + Outcome?

| CTA | Action + Outcome? | Verdict |
|---|---|---|
| `Start Free — No Credit Card` | Weak — action but vague outcome | ok-ish |
| `Generate Design` | "Design" is abstract | weak |
| `Build on Current` | No outcome | weak |
| `Re-Generate (Replace)` | Parenthetical is a warning, not copy | weak |
| `Create Twilight Shot` | Good — action + noun | strong |
| `Replace Sky` | Good | strong |
| `Remove Clutter` | Good | strong |
| `Preview Renovation` | Good | strong |
| `Generate Luxury Copy` | Good | strong |
| `Start Pro Plan` | Weak — no outcome | weak |
| `See Pricing` | Passable | ok |

**Pattern:** the Pro AI Tools got the action+noun treatment right. The primary staging CTA got left behind. The upgrade CTA ("Start Pro Plan") misses the outcome entirely.

---

## 7. Error Messaging — Human + Actionable?

Current errors are all of the form `<Problem>. <Try again>.` No error tells the user:
- why it happened (if we know)
- what to do differently
- how long to wait
- whom to contact

Compare "Generation failed. Try again." to "That photo timed out — usually means the room is too complex. Try a wider angle or a simpler scene." The second is actionable, the first is noise.

---

## 8. Competitor Copy Snapshot

**Reimagine Home** (fetched 2026-04-17):
- Hero: "Create spaces you'll actually show, buy, or commit to."
- Sub: "Design using real products available in your area and within your budget, without changing structural elements like walls, windows and doors."
- CTA: "Start 3 free designs"
- Pricing: "Start free. Upgrade when it becomes part of how you work."

**Virtual Staging AI** (well-known landing — fetch blocked, from public knowledge):
- Hero: "Virtually stage any space in less than 5 seconds."
- Sub: focuses on photorealism + unlimited revisions.
- Pricing: $16/photo occasional / $0.75/photo at volume.

**Styldod** (fetch blocked):
- Leads with price comparison: $29 virtual vs. $500+ physical.
- Emphasizes 24-hour human-in-the-loop turnaround.
- CTA: "Get Started" / "Try Free."

**What works in the market:**
1. Speed numbers (5 seconds / 24 hours) in the hero.
2. Price comparison vs. physical staging — we have this but it's buried.
3. Outcome-framed CTAs ("Start 3 free designs" > "Get Started").
4. "Free designs" wording — agents understand "designs" as deliverables, not abstract creations.

---

## 9. 15 High-Leverage Rewrites (ready to ship)

### R1 — Hero headline
- **Location:** `App.tsx:176-188` (`HeroHeadline`)
- **Current:** `AI photo editing for [real estate / interior design / property flipping / RE photography / renovations / property management].`
- **Proposed:** `Staged listing photos in 15 seconds. Not 15 days.`
- **Why better:** Leads with the agent's actual KPI (turnaround time vs. traditional staging), names the deliverable ("listing photos") not the category ("photo editing"), and drops the 6-way vertical hedge.

### R2 — Hero subhead
- **Location:** `App.tsx:1279-1281`
- **Current:** `Stage empty rooms. Clean up yards. Convert day to dusk. Replace skies. Visualize renovations. One tool for agents, photographers, designers, and flippers.`
- **Proposed:** `Upload a photo. Get it staged, de-cluttered, or twilight-converted before your seller meeting. Cancel physical staging.`
- **Why better:** Replaces a 5-verb feature list with a 3-beat story (upload → result → outcome). Names the trigger moment ("seller meeting") and the action taken ("cancel physical staging") — both are agent-specific.

### R3 — Hero primary CTA
- **Location:** `App.tsx:1294, 1256, 1622, 1779`
- **Current:** `Start Free — No Credit Card`
- **Proposed:** `Stage 3 rooms free`
- **Why better:** "Stage 3 rooms" is the exact value the free tier delivers. Matches Reimagine's "Start 3 free designs" winner. No-credit-card is implied by "free" and can move to micro-copy below.

### R4 — Editor primary CTA (first generation)
- **Location:** `components/StyleControls.tsx:335`
- **Current:** `Generate Design`
- **Proposed:** `Stage this room`
- **Why better:** Uses the agent's verb ("stage"). Removes the abstract noun "design." Matches what they'd tell a human stager.

### R5 — Editor primary CTA (after first generation, text mode)
- **Location:** `components/StyleControls.tsx:333`
- **Current:** `Build on Current`
- **Proposed:** `Apply this tweak`
- **Why better:** "Tweak" is the word agents actually say. "Build on Current" reads like a Git command. Clarifies it will only change the thing they just typed, not re-stage the whole room.

### R6 — Editor primary CTA (after first generation, packs mode)
- **Location:** `components/StyleControls.tsx:333`
- **Current:** `Re-Generate (Replace)`
- **Proposed:** `Restage in this style`
- **Why better:** Kills the parenthetical warning — parentheticals on a primary button are a smell. "Restage" encodes the replace behavior; "in this style" names the chosen pack.

### R7 — Upgrade modal headline + sub
- **Location:** `App.tsx:1832-1834`
- **Current:** `Upgrade to Pro` / `Unlimited AI generations`
- **Proposed:** `Unlimited listings, forever.` / `$29/mo. Every tool, every export, every day. Cancel anytime.`
- **Why better:** "Unlimited listings" is the outcome an agent maps to their pipeline — they have N listings/month, not N generations. Trades a software feature ("generations") for their billable unit of work ("listings").

### R8 — Free limit-hit toast / banner (new copy to add)
- **Location:** currently enforced in `useSubscription.ts:50` but no user-facing limit message exists — `canGenerate` just silently disables. This is a gap.
- **Proposed (new toast on block):** `You've staged 3 rooms today. That's the free cap. Upgrade and keep going — or come back tomorrow.`
- **Why better:** Names the accomplishment, the rule, and two next actions. Avoids the condescending "limit reached" phrasing.

### R9 — Onboarding Step 1
- **Location:** `QuickStartTutorial.tsx:13-19`
- **Current:** `Upload Your Photos` / `Drag and drop listing photos here — one at a time or multiple for batch editing. We auto-detect the room type for you.`
- **Proposed:** `Drop in a listing photo.` / `Any room. Any lighting. We'll detect the room type and hold the walls, windows, and floors steady while we stage.`
- **Why better:** Starts with an imperative not a title. Pre-empts the #1 first-time agent fear ("will it mess up the architecture?") with a concrete promise.

### R10 — Generation timeout error
- **Location:** `App.tsx:868`
- **Current:** `Generation timed out — try again`
- **Proposed:** `This room's taking longer than expected. Usually a busy-scene problem — try cropping tighter or retry in 30 seconds.`
- **Why better:** Diagnoses the probable cause and offers two specific remediations. "Busy-scene problem" is language an agent understands intuitively.

### R11 — Pricing page features (Early Bird)
- **Location:** `App.tsx:1610`
- **Current:** `All features, unlimited · Rate never increases · Referral code (5 uses) · Friends get your rate too`
- **Proposed:** `Every tool, every day, unlimited · $14 locked in for life · 5 referral spots — your friends get $14 too · MLS-ready watermarked exports`
- **Why better:** The first bullet concretizes "unlimited" (every tool, every day). The second names the lock clearly. The third makes the referral offer mutual benefit (your friends get $14 *too*) which is stickier than the vague "friends get your rate too." The fourth adds a concrete deliverable (MLS-ready exports) that matters to the ICP.

### R12 — "Built on Current" helper text
- **Location:** `StyleControls.tsx:344-346`
- **Current:** `Text prompts build on top of your current result — add, tweak, or refine.`
- **Proposed:** `We'll keep everything that's already in the room and change only what you ask for.`
- **Why better:** The current copy uses the word "build" which the button also uses — agents don't parse it. The rewrite explains the chain/anchor behavior in plain language. This is also the most important UX guarantee StudioAI makes (unchanged regions come byte-identical from the prior buffer per §7.4 of the SOP) — we should stop hiding it.

### R13 — Canvas loading state
- **Location:** `App.tsx:2397-2405`
- **Current:** `GENERATING DESIGN` + `Reading the room… / Placing furniture… / Polishing the final render`
- **Proposed:** `STAGING YOUR ROOM · {elapsed}` + `Measuring the room… / Placing furniture that fits… / Matching your lighting`
- **Why better:** "Your room" makes it personal. "Placing furniture that fits" speaks to the #1 user anxiety ("will it put a king bed in a 10×10?" — known issue per SOP §9.3). "Matching your lighting" replaces the meaningless "polishing" with a claim they can verify.

### R14 — History empty state
- **Location:** `App.tsx:2538`
- **Current:** `No renders yet. Generate your first design.`
- **Proposed:** `Nothing staged yet. Your saved results will live here — one per version.`
- **Why better:** Drops "renders" (3D jargon) and "design" (abstract). Names what this panel actually does (history of versions). Sets expectations for what they'll see.

### R15 — Final CTA section
- **Location:** `App.tsx:1767-1770`
- **Current:** `Stop Paying $300 Per Staging.` / `Professional results in seconds — not days. Join agents already saving thousands.`
- **Proposed:** `One staging service costs more than a year of StudioAI.` / `$29/mo covers every listing. Cancel the month you stop listing.`
- **Why better:** The math is sharper (one staging > year of us) than the vague "$300 per staging" which may or may not match their market. "Cancel the month you stop listing" acknowledges the agent's seasonality and removes the subscription commitment objection.

---

## 10. Voice System (apply to future copy)

One page to hand to anyone writing copy in this product:

**Do:**
- Use the agent's verbs: stage, list, show, close, list hit, go live, MLS-ready.
- Name the deliverable: "listing photos," "a staged bedroom," "twilight hero shot."
- Use numbers in headlines: 3 rooms, 15 seconds, $29/mo.
- Front-load the action in button labels: `<verb> <object>` (Stage this room, Replace sky, Remove clutter).
- In errors, state the probable cause + the next step.

**Don't:**
- Say "design" as a noun (use "staging" or "render" only when precise).
- Say "beautiful," "stunning," "amazing," "professional," "revolutionary."
- Use vertical-spanning rotators or 5-verb feature lists in heroes.
- Use UPPERCASE TRACKING-WIDER treatment on primary CTAs outside the Pro AI Tools section (it's inconsistent and feels cyberpunk-adjacent).
- Use parentheticals on primary buttons.

---

## Summary

**Biggest voice problem:** the editor forgets it's talking to listing agents. The landing sells outcomes ("Stop Paying $300 Per Staging") to a named ICP; the editor reverts to software-feature copy ("Design Direction", "Build on Current", "Generating Design") that could belong to any design tool.

**Weakest current piece of copy:** the rotating hero headline (`App.tsx:176-188`) — "AI photo editing for [6 verticals]" hedges across ICPs, names a category instead of a value, and has no number. It's the first thing a prospect sees and it promises nothing specific.

**One rewrite that will most move conversion:** R3 — swap the landing CTA `Start Free — No Credit Card` to `Stage 3 rooms free`. It's the button clicked on every CTA moment (nav, hero, pricing, final section), matches the Reimagine-Home winning pattern, names the exact value of the free tier, and turns an abstract sign-up into a promised deliverable.
