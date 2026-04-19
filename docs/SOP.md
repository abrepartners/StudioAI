# StudioAI Operating Manual

> Single source of truth for operating, extending, and automating StudioAI.
> Last refreshed: 2026-04-17.
>
> **Who this is for:** operators running the product day-to-day, developers building
> on top of it (API layer, batch processors, scheduled QA, etc.), and new agents
> being onboarded to the tool. If you connect an external system to StudioAI later,
> start here — the vocabulary, gates, and behavior are all documented.

---

## Table of contents

1. [Glossary](#1-glossary) — shared vocabulary
2. [Feature reference](#2-feature-reference) — every panel, button, tool
3. [Common workflows](#3-common-workflows) — upload → export recipes
4. [Prompting playbook](#4-prompting-playbook) — what works, what fails
5. [Subscription & gating](#5-subscription--gating)
6. [URL parameters & dev modes](#6-url-parameters--dev-modes)
7. [Architecture notes](#7-architecture-notes) — anchor, chain, composite
8. [Automation stack](#8-automation-stack) — plugins/MCPs for building on top
9. [Known failure modes](#9-known-failure-modes)

---

## 1. Glossary

Shared vocabulary. Users see these exact terms in the UI.

### Objects

| Term | Meaning | UI location |
|---|---|---|
| **Original** | The user's unedited uploaded photo. | Editing Badge label |
| **Result** | The current AI-generated / edited image. | Editing Badge label |
| **Version (v1, v2, …)** | Numbered iteration in the chain. | Editing Badge |
| **Session** | One photo's full edit lifecycle (upload → export). | Internal state |
| **Room Type** | Auto-detected architectural category. 14 values. | Top-left pill |
| **Chain** | Sequence of stacked edits on one result. | Depth tracked in badge |
| **Chain depth** | How many edits since last reset/commit. Caps at 3. | Badge dropdown |
| **Anchor** | The original image passed alongside the current result so Gemini preserves pixel fidelity. Applied automatically on stacking passes. | Server-side only |
| **Pack** | A preset style direction ("Mid-Century Modern"). Always replaces the result. | Packs mode |
| **Edit History** | Chronological list of tools used in this session. | Badge popover |
| **Commit** | Locking current result as new base; chain depth resets to 0. | Badge popover action |
| **Mask** | Painted area in Cleanup mode telling AI what to modify. | Canvas overlay |

### Actions

| Term | Meaning | Button label location |
|---|---|---|
| **Generate Design** | Create the first staged image from the original. | Right panel primary button (pre-first-gen) |
| **Build on Current** | Apply a text prompt to refine the current result. | Right panel primary button (Text mode, after first gen) |
| **Re-Generate (Replace)** | Apply a Pack — always replaces, never stacks. | Right panel primary button (Packs mode, after first gen) |
| **Commit & Continue** | Promote current result to new base, reset chain. | Badge popover (shows at depth 3) |
| **Start From Original** | Discard all edits, return to uploaded photo. | Badge popover |
| **Remove and Reveal** | Execute masked cleanup edit. | Cleanup panel |
| **Day to Dusk** | Daytime → twilight conversion. | Pro AI Tools |
| **Sky Replacement** | Swap sky for 1 of 4 presets. | Pro AI Tools |
| **Smart Cleanup** | Auto-remove clutter/personal items. | Pro AI Tools |
| **Virtual Renovation** | Preview new cabinets/counters/floors/walls. | Pro AI Tools |
| **Listing Copy** | Generate MLS headline + description + caption + hashtags. | Pro AI Tools |

### Modes

| Mode | Behavior |
|---|---|
| **Text** | Freeform prompt input; builds on current result when stacking. |
| **Packs** | Curated style presets; always replaces result. |
| **Furnish** | Drag-drop furniture placement. Marked SOON (disabled). |
| **Design** | Primary staging + Pro AI Tools. |
| **Cleanup** | Mask-based selective removal. |
| **Single / Batch** | One image at a time vs. apply-to-all from saved queue. |
| **Batch Download All** | ZIP export of selected batch results via `batchExportMLS()` at HD Landscape (1920×1080) default. Select-all by default, per-thumbnail checkboxes to deselect. |
| **Batch Lightbox** | Overlay preview triggered by clicking a result thumbnail. Shows before/after side-by-side. Arrow keys navigate, Esc closes, "Open in Editor" button drills in without dropping batch. |
| **Back to Batch** | Top-bar pill in editor when user drilled in from batch. Returns to BatchProcessor grid with state preserved (no reprocessing). |

### Status words seen in UI

| Word | When shown |
|---|---|
| **Detecting…** | Room type detection in progress. |
| **Analyzing Space** | Upload just happened; extracting room + palette. |
| **Generating…** | AI generation in progress. |
| **Editing original photo** | No result yet; working from upload. |
| **Editing your result · vN** | Working on generated state. |
| **chain full** | Hit chain cap (depth 3); commit recommended. |
| **Mask Mode** | Cleanup drawing surface active. |

### Style pack names (style DNA)

| Pack | Vibe | DNA |
|---|---|---|
| Coastal Modern | Light & airy flow | Light wood, white/sand upholstery, rattan, linen, soft blue/seafoam accents |
| Urban Loft | Industrial edge | Dark leather, metal/reclaimed wood, concrete tones, Edison lighting |
| Farmhouse Chic | Rustic warmth | Distressed white wood, neutrals, shiplap, antique brass, cream/sage |
| Minimalist | Quiet simplicity | Clean-lined low-profile, whites/warm grays, 1-2 accents max |
| Mid-Century Modern | Retro balance | Tapered legs, walnut, mustard/teal pillows, curved shapes |
| Scandinavian | Natural calm | Pale birch, white/light gray, wool throws, minimal greenery |
| Bohemian | Textured eclectic | Layered textiles, terracotta/cream, woven rugs, macrame |

### Room types (enum)

Living Room · Bedroom · Primary Bedroom · Dining Room · Kitchen · Office · Bathroom · Laundry Room · Closet · Nursery · Garage · Patio · Basement · Exterior

### Plans

| Plan | Limits |
|---|---|
| **Free** | 3 generations / day. All staging + cleanup. No Pro AI Tools. "Virtually Staged" watermark only. |
| **Pro** ($29/mo via Stripe) | Unlimited generations. All Pro AI Tools. Custom-logo watermark. Batch mode. Priority render. |
| **Enterprise** | Custom. Brokerage multi-agent, white-label. Contact sales. |
| **Credits** | Pay-as-you-go packs (starter / pro_pack / agency). 1 credit = 1 generation. |

### Export / output artifacts

| Term | Meaning |
|---|---|
| **Preset size** | Zillow/Realtor 2048×1536 · ARMLS 2048×1536 · Generic 1920×1080 or 1280×960 |
| **Strip EXIF** | Auto removal of GPS/camera/timestamp metadata on export. |
| **Watermark** | Optional overlay. Default: "Virtually Staged" text. Pro: brand-kit logo. |
| **Zip Download** | Batch export packages multiple images as `.zip` with sequential names. |
| **Social Pack templates** | `just-listed` · `before-after` · `open-house` · `tip-card` |

---

## 2. Feature reference

### Top bar

| Control | Function |
|---|---|
| Logo | Home / landing |
| Undo / Redo | ⌘Z / ⌘⇧Z keyboard; top bar buttons |
| Plus (+) | Opens image uploader |
| Export | Opens ExportModal if result exists |
| Save | Save current version to history |
| Add | Add to batch queue |
| Pro / Crown | Upgrade flow (Stripe) |
| Refresh | Reset session |
| Help (?) | Tutorial / help popover |
| Profile | Google profile menu (Billing, Team, Logout, Showcase) |

### Left sidebar (panel switcher)

| Icon | Panel | Purpose |
|---|---|---|
| Grid | **Design Studio** (tools) | Staging, packs, Pro AI Tools |
| Eraser | **Cleanup** | Masked selective removal |
| Download | **MLS Export** | Size/watermark/EXIF-strip/download |
| FileText | **Description** | Listing copy generator |
| Share2 | **Social Pack** | Platform-specific templates |
| History | **History** | Recent + Saved thumbnails |

### Canvas overlays

- **Room Type pill** — top-left, clickable dropdown (14 options).
- **EditingBadge** — top-left beside Room pill. Shows current version + chain depth. Amber when `chain full`. Dropdown offers: Commit & Continue (if capped), Start From Original, View History.
- **Compare Slider** — centered draggable slider. "Before" always = original upload. "After" = current result.
- **Generation overlay** — center of canvas during render. Animated 3-line progress: "Reading the room… / Placing furniture… / Polishing the final render" + elapsed timer.

### Right panel — Design mode

Three stacked cards:

1. **Mode segmented control** — Text · Packs · Furnish (SOON).
2. **Design Direction card** — changes by mode.
   - Text: textarea + suggested-prompt chips + Generate button.
   - Packs: 7 preset tiles + Generate button.
3. **Pro AI Tools section** (collapsible) — Day to Dusk, Sky Replacement, Smart Cleanup, Virtual Renovation, Listing Copy.

### Right panel — Cleanup mode

- Architectural Cleanup description card.
- Mask drawing instructions + brush controls.
- "Remove and Reveal" button (runs masked AI edit).

### Right panel — MLS Export

- Preset dropdown (Zillow, ARMLS, Generic).
- Watermark toggles: off / "Virtually Staged" text / logo (Pro).
- EXIF-strip notice.
- Single / Batch toggle.
- Download button.

### Right panel — Social Pack

- Template tiles: Just Listed, Before/After, Open House, Tip Card.
- Format picker (currently ig-post 1080×1080 only).
- Property details form (auto-filled from Brand Kit).
- City / state / zip split fields with title-case helper.
- Render button → calls `/api/render-template` → downloadable PNG.

### Pro AI Tools detail

| Tool | Input | Output | Gotchas |
|---|---|---|---|
| **Day to Dusk** | None — uses current image | Twilight image with interior glow | Best on exteriors; adds nothing new, only lighting |
| **Sky Replacement** | 4 presets (blue/dramatic/golden/stormy) | Image with new sky | Exteriors only |
| **Smart Cleanup** | None — auto-detects | Decluttered image | Uses room type context |
| **Virtual Renovation** | Cabinets / countertops / flooring / walls text | Rendered preview | At least one field required; kitchen/bath focus |
| **Listing Copy** | Property details (optional) + tone (Luxury / Casual / Investment) | Headline + MLS description + caption + hashtags | Char limits shown (Zillow 5K / Realtor 4K / Generic 1K) |

### Modal flows

- **Quick Start Tutorial** — 3-step carousel, first visit or Help click.
- **Export Modal** — format / quality / watermark / disclaimer / share-to-gallery.
- **Upgrade Modal** — Stripe checkout for Pro or credit packs.
- **Furniture Remover** — furniture palette + orientation.
- **Brand Kit** — logo, headshot, colors, name, brokerage, phone, email, website, tagline.
- **Manage Team** — admin-only, brokerage agent invites.
- **Referral Dashboard** — generate code, track earnings.
- **Admin Showcase** — admin approval queue.

---

## 3. Common workflows

### 3.1 Basic staging (single photo)

```
Upload photo → wait for Detecting… → pick Pack OR type prompt → Generate
→ (optional) Text-mode refinements build on current → Export for MLS → Download
```

### 3.2 Iterative refinement (stacking)

```
Upload → apply Pack (v1) → switch Mode to Text → "add a potted plant"
→ Generate (v2) → "move the chair to the corner" → Generate (v3)
→ badge shows "chain full" → Commit & Continue → current result becomes new base
→ continue stacking fresh
```

**Key rule:** Packs ALWAYS replace. Text ALWAYS builds (when a result exists).

### 3.3 Masked cleanup

```
Upload → switch to Cleanup panel (Eraser icon)
→ paint over clutter/object with brush
→ Remove and Reveal → AI inpaints the mask
```

### 3.4 Day-to-dusk exterior

```
Upload exterior → don't stage → go to Pro AI Tools
→ Day to Dusk → Create Twilight Shot → done
```

### 3.5 Batch processing

```
Upload multiple images via BatchUploader → pick operation + room type per image
→ BatchProcessor runs (3 concurrent, pause/resume supported)
→ grid fills as each completes; every finished result is SELECTED by default
→ Download All (ZIP) button packages selected results as MLS-sized zip (HD Landscape preset)
→ Click any thumbnail → lightbox overlay shows before/after side-by-side
    ├─ ← → arrow keys navigate between results
    ├─ Esc / click backdrop closes the lightbox (grid stays intact)
    └─ "Open in Editor" inside lightbox lands that single result in the editor
→ In the editor, top bar shows "← Batch (N)" pill → click returns to the grid
  (BatchProcessor remounts with preserved results via initialResults prop — no reprocessing)
→ Click "Open in Editor" on progress header to import all results into the session queue
  (carousel navigation between them)
```

**Selection / deselection:** click the checkbox in the top-right of any thumbnail to deselect.
The header reads `N of M selected` and the Download button updates to reflect partial selection.

**Retry failed:** if any result errored, a "Retry N" pill appears next to the progress header.
Clicking it flips failed items back to `pending` and re-runs the queue.

**State preservation:** `batchImages` and `batchResults` persist in App state while the user
drills into a single result via the lightbox "Open in Editor" button. The Back-to-Batch pill
(`App.tsx` — visible when `originalImage && batchImages && batchResults.length > 1`)
clears editor state and re-renders BatchProcessor with `initialResults={batchResults}` so the
grid reappears instantly with no reprocessing.

### 3.6 MLS export (single)

```
Finish staging → MLS Export panel → pick preset (Zillow/ARMLS/Generic)
→ choose watermark (off / text / logo) → Single mode → Download
```

### 3.7 MLS export (batch zip)

```
Stage multiple images (saved to queue) → MLS Export → preset → Batch mode
→ Download Zip → receives 001_living_room.jpg, 002_kitchen.jpg, …
```

### 3.8 Social pack

```
Stage photo → Share2 icon → pick template (Just Listed / Before-After / Open House / Tip Card)
→ fill property fields (auto-populate from Brand Kit) → Render → PNG downloads
```

### 3.9 Full listing kit (end-to-end)

```
1. Brand Kit (once) — upload logo, fill agent info
2. Upload property photo
3. Apply Pack or Text-stage each room
4. Day to Dusk the hero exterior
5. MLS Export (batch zip) for agent upload
6. Social Pack (Just Listed template) for Instagram/FB
7. Listing Copy (Luxury tone) for MLS description + social caption
```

---

## 4. Prompting playbook

### What works

| Intent | Example prompt | Why it works |
|---|---|---|
| Add item | "add a small potted plant on the nightstand" | Additive, specific location |
| Swap item | "replace the chair with a walnut accent chair" | Names both ends of the swap |
| Tweak material | "make the rug a jute flatweave instead" | Targeted, single attribute |
| Lighting only | "make the lighting more evening" | Routed through ZERO-TOLERANCE lighting wrapper |
| Spatial move | "move the green chair to the opposite corner" | Routed through spatial-move wrapper |

### What fails

| Anti-pattern | Why it fails | Fix |
|---|---|---|
| "Make it look better" | No specific target; Gemini re-stages everything | Name one thing to change |
| "The mirror" (when scene has multiple mirror-like objects) | Wrong-target selection | Describe position: "the small round mirror above the dresser" |
| "Move the chair, lamp, and table" | Reads as "this should be the new scene"; mass-delete | Break into separate edits |
| Long multi-sentence directives | Gemini re-stages | Keep prompts ≤ 15 words |

### Intent classifier (automatic)

Two classifiers detect intent and wrap the prompt BEFORE it hits Gemini:

**Lighting-only** — detects keywords: `evening, dusk, twilight, night, dawn, morning light, golden hour, sunset, sunrise, brighter, dimmer, warmer, cooler, moody, dramatic lighting, soft light, sunny, overcast, cloudy, sky, ambient, mood lighting, lighting, relight`. If no structural keywords are present, wraps with preamble forbidding add/remove/move/restyle.

**Spatial-move** — detects keywords: `move, shift, slide, relocate, reposition, place, put, turn, rotate, angle, flip, face, pivot`. If no structural keywords are present, wraps with preamble forbidding deletion/replacement of other items.

**Structural override** — if the prompt contains `add, remove, delete, swap, change <noun>, stage, re-stage, restyle, redecorate`, neither wrapper fires — Gemini runs with the normal staging prompt.

### Prompt prefixes applied server-side

Never typed by users but always present:

```
Rules first, assignment last. Explicit no-mirror/flip, no-camera-change,
preserve-walls/floors/ceiling, preserve-windows/doors, preserve-fixtures.
Then realism requirements. Then furniture placement rules. Then the assignment.
```

This is in `services/geminiService.ts::generateRoomDesign`. Do not modify without regression-testing packs, text stacking, and Pro AI Tools.

---

## 5. Subscription & gating

Feature-level gate is enforced in `hooks/useSubscription.ts`:

```
canGenerate = plan === 'pro' || credits > 0 || generationsUsed < generationsLimit
```

| Feature | Free | Pro | Enterprise |
|---|---|---|---|
| Staging (text + packs) | ✓ (3/day) | ✓ unlimited | ✓ |
| Cleanup (masked) | ✓ | ✓ | ✓ |
| Day to Dusk | — | ✓ | ✓ |
| Sky Replacement | Limited | ✓ all 4 presets | ✓ |
| Smart Cleanup | Limited | ✓ | ✓ |
| Virtual Renovation | — | ✓ | ✓ |
| Listing Copy | — | ✓ | ✓ |
| Batch mode | — | ✓ | ✓ |
| Custom-logo watermark | — (text only) | ✓ | ✓ |
| Team management | — | 1 seat | Multi-seat |
| Community showcase submit | — | ✓ | ✓ |
| Priority rendering | — | ✓ | ✓ |

Admin-only routes (gated by email allowlist):

- `Team Management` tab in Settings
- `Showcase Admin` tab in Settings
- `/api/brokerage?action=*` endpoints
- `/api/showcase` approval queue

---

## 6. URL parameters & dev modes

| Param | Effect |
|---|---|
| `?ref=CODE` | Apply referral code; auto-validates on signup for discount |
| `?chain=0` | Opt out of chain mode (disables anchor + PNG preservation). Default is ON. |
| `?stack=0` | Legacy opt-out; equivalent to `chain=0` |

Chain mode is **default-on** for all users as of 2026-04-17. This is what unlocks:

- Anchor-on-original (Gemini sees both original + current result)
- PNG preservation between passes (no JPEG spiral)
- Commit & Continue UI at depth 3
- Client-side mask + composite via pixelmatch

To test raw Gemini behavior without any chain protections, append `?chain=0` to the URL.

---

## 7. Architecture notes

The following are load-bearing architectural decisions. Treat them as invariants.

### 7.1 Prompt structure
Outer prompt in `services/geminiService.ts::generateRoomDesign` is:

```
[rules first] → [framing lock] → [no mirror/flip] → [preserve walls/floors/ceilings]
→ [preserve windows/doors] → [preserve fixtures] → [realism requirements]
→ [furniture placement] → [if anchor: IMAGE ROLES preamble] → [ASSIGNMENT: {prompt}]
```

Assignment at the END, not the top. This was critical for beating the "first generation flips the room" bug.

### 7.2 Anchor mode (multi-image input to Gemini)
When stacking on an existing result (`shouldStack = true && !fromPack && !isCleanup`), Gemini receives:

- **IMAGE 1 = ANCHOR** — the original upload. Source of truth for unchanged pixels.
- **IMAGE 2 = CURRENT WORKING STATE** — the prior result. Carries accumulated staging.

Dimension guard: if IMAGE 1 and IMAGE 2 have different dimensions, the anchor is dropped (prevents distortion).

### 7.3 PNG preservation in chain
In chain mode, `utils/sharpen.ts` outputs PNG (lossless) instead of JPEG 0.92. This kills the compression spiral where JPEG artifacts fed back into Gemini caused texture drift pass over pass.

### 7.4 Client-side compositor (Phase C)
After every stacking generation, `utils/stackComposite.ts`:

1. Diffs `prior` vs `new` via `pixelmatch` (threshold 0.15).
2. Converts diff into an alpha mask, feathers it (10px blur).
3. Composites: `final = mask × new + (1 - mask) × prior`.

Result: unchanged regions come BYTE-IDENTICAL from the prior buffer. Gemini's drift on untouched pixels is discarded.

Bail conditions (returns raw Gemini output):
- Dimension mismatch between prior and new.
- Change ratio < 0.1% (nothing meaningfully changed).
- Change ratio > 95% (everything changed — compositing would introduce stale pixels).

### 7.5 Chain depth cap & commit
Chain depth tracked as count of `editHistory` entries since the last `reset` or `commit` marker. At depth ≥ 3, EditingBadge turns amber and offers "Commit & Continue," which promotes current result to `originalImage` and resets depth to 0. This matches Google's guidance to restart after iterative drift.

### 7.6 Intent classifiers
Pre-flight regex detection in `App.tsx::handleGenerate` wraps certain prompt intents with stricter preambles before the outer template runs. See §4 for the classifier rules.

### Export format invariant
In-app storage is **PNG** (lossless, prevents JPEG spiral on chain stacking).
Export is **JPEG 0.95** (visually identical to lossless, keeps size close to the input JPEG).

All export paths must re-encode PNG → JPEG before download:
- `App.tsx::handleDownload` — single-image download button
- `components/ExportModal.tsx` — full export modal
- `utils/imageExport.ts::processForMLS` — MLS preset path (has its own per-preset quality values: 0.85–0.92)

Direct `link.href = generatedImage` with `.png` extension is a **bug** — the user gets a 20-30MB file. Always re-encode via canvas.toDataURL('image/jpeg', 0.95).

**Why 0.95 over 0.92:** 0.92 was too aggressive — 5MB input JPEGs came out as sub-MB exports. 0.95 keeps file size materially closer to input without any perceptible quality loss. We do NOT upscale Gemini's native output resolution on export (would interpolate fake pixels and soften detail); output size reflects how much detail Gemini actually produced.

### 7.7 Pro AI Tools post-processing
`components/SpecialModesPanel.tsx::postProcessToolOutput(raw, prior)` wraps every Pro AI Tool output. Does: sharpen (PNG when chain is on) → conditional composite via `stackComposite.ts` against the prior image. For whole-frame lighting tools (Twilight / Sky) the composite gracefully bails via its >95% change-ratio threshold; for local tools (Cleanup / Renovation) the composite enforces pixel-identical preservation of unchanged regions. Batch path uses the input image as prior. Do NOT bypass this helper — direct `sharpenImage(raw)` calls lose PNG output, lose composite protection, and reintroduce texture drift when tools are chained.

**Batch processor parity:** `components/BatchProcessor.tsx::postProcessBatchOutput(raw, prior)` mirrors the SpecialModesPanel helper and wraps every non-export batch action (Stage / Cleanup / Twilight / Sky). Prior is always the input image (`img.base64`) since batch runs are single-pass. Without this wrap, batch output looks visibly softer than single-image output — Gemini's re-synthesis touches unchanged regions even when only one object was modified. The composite restores pixel-sharp input everywhere except the actual edit region.

### 7.8 Batch state preservation
`BatchProcessor.tsx` lifts its `results[]` state to App via the `onResultsChange` callback. App stores the mirror in `batchResults`. When the user drills into a single result via the lightbox "Open in Editor" button, App sets `originalImage/generatedImage` but does NOT null `batchImages` / `batchResults`. The editor conditional (`originalImage ? <editor> : batchImages ? <BatchProcessor> : <upload>`) shows the editor. The Back-to-Batch pill in the header calls `handleBackToBatch` which nulls editor state only, flipping the conditional back. BatchProcessor remounts with `initialResults={batchResults}` and the `processQueue` skip-already-done guard prevents reprocessing. Without the `onResultsChange` mirror, remounting BatchProcessor would re-initialize with all-pending state from raw images and reprocess the whole batch.

Do NOT remove `onResultsChange` or `initialResults` props without replacing the state-preservation mechanism.

---

## 8. Automation stack

Recommended install order to build on top of StudioAI.

### 8.1 Fix broken MCPs

```bash
claude mcp remove playwright
claude mcp add playwright npx @playwright/mcp@latest
```

Unblocks the existing Playwright MCP for E2E testing.

### 8.2 Add error monitoring

```bash
claude mcp add sentry --transport http https://mcp.sentry.dev/mcp
```

Agents can pull stack traces, Seer analysis, and issue context when Edge functions fail. Complements the existing Vercel MCP which already covers deployment logs.

### 8.3 Unified image generation

```bash
claude mcp add --transport http fal-ai https://mcp.fal.ai/mcp --header "Authorization: Bearer $FAL_KEY"
```

1,000+ models (Flux, Imagen, Nano Banana, Veo) via one MCP. Useful if we want alt providers for quality A/B tests or fallbacks.

### 8.4 Quality regression (SSIM scoring)

```bash
npm i ssim.js pixelmatch sharp
```

No MCP exists for this — roll a `/api/qa/score` Vercel Edge route that wraps ssim.js. Nightly cron compares today's staging output against a golden set; flags anything with SSIM < 0.92 for manual review.

### 8.5 Batch pipelines

```bash
npm i inngest
claude mcp add inngest npx inngest-mcp@latest
```

Run "folder of 50 listing photos → stage all → twilight hero → export MLS zip" recipes. Fan-out, throttling, concurrency, retries. Runs on Vercel Edge.

### 8.6 Visual regression (layer on Playwright)

```bash
npm i -D chromatic
npx chromatic --playwright
```

Free tier: 5,000 snapshots. Catches visual drift in the editor UI between deploys.

### 8.7 API layer for agents

Don't add a new MCP. Use the existing Vercel plugin (`vercel:ai-sdk`, `vercel:vercel-functions`, `vercel:workflow` skills). Pattern:

```
app/api/stage/route.ts → POST handler → calls Gemini via ai-sdk → returns signed URL
```

For long-running recipe runs (10+ edits), use Vercel Workflow (WDK) for crash-safe pause/resume.

### 8.8 Caption / MLS description downstream

Anthropic SDK directly:

```bash
npm i @anthropic-ai/sdk
```

The `claude-api` skill (already installed) auto-enforces prompt caching — huge cost win when captions share property context. Pair with Vercel AI Gateway for provider failover.

### 8.9 What does NOT exist (roll your own)

- No MCP for perceptual image quality — write a Vercel function.
- No MCP for "expose StudioAI as an API to other agents" — that's a Next.js route + auth layer.
- LogRocket has no official MCP — Sentry + Vercel logs cover the same ground.

---

## 9. Known failure modes

### 9.1 Gemini re-stages when user wanted a small tweak
- **Symptom:** "move the chair" deletes everything else.
- **Mitigation:** Spatial-move classifier wraps the prompt with ZERO-TOLERANCE preamble. Phase C compositor then preserves unchanged regions byte-for-byte.
- **Remaining risk:** if Gemini's diff with the prior image is > 95%, the compositor bails and uses raw output. Very aggressive prompts can still trigger this.

### 9.2 Ambiguous noun reference ("the mirror")
- **Symptom:** Scene has multiple mirror-like objects; Gemini picks the wrong one.
- **Fix:** Be positional in prompts: "the small round mirror above the dresser."
- **Roadmap:** Phase D — click-to-mask via Florence-2 in the browser; eliminates linguistic ambiguity.

### 9.3 Bed too big for the room
- **Symptom:** Pack places a king bed in a 10×10 room.
- **Not yet fixed.** Needs a room-size analysis pass pre-prompt. On the roadmap.

### 9.4 Different dimensions between prior and Gemini output
- **Symptom:** Gemini returns a slightly-resized image; composite would distort.
- **Handled:** `stackComposite.ts` detects dimension mismatch, skips composite, returns raw Gemini output with a console warning.

### 9.5 Chain depth > 3 → quality drift
- **Symptom:** At v4+, textures soften even with Phase C.
- **Mitigation:** EditingBadge shows "chain full" at depth 3; Commit & Continue promotes result to new base, resetting chain.

### 9.6 Google OAuth origin mismatch on preview deploys
- **Symptom:** Preview URL hits `origin_mismatch` error during sign-in.
- **Fix:** Only `studioai.averyandbryant.com` is registered in the GCP OAuth client. Either add preview domain to OAuth origins, or deploy to prod.

---

## 10. QA harness

`tests/qa-harness/` is the end-to-end regression harness for every Pro AI Tool. Real fixtures → real Gemini calls → production composite → visual + metric validation.

**Structure:**
- `fixtures/{exteriors,interiors,twilight,sky}/` — real-estate test images
- `run-qa.mjs` — single runner, `--tool {cleanup|twilight|sky|stage|pack}`
- `reports/<timestamp>_<tool>/` — per-run HTML reports + composite assets
- `results/<tool>.md` — living pass/fail doc per tool (update when baseline shifts)

**Pass bars:**
| Tool | Gemini success | Preservation (outside mask) | Visual spot-check |
|---|---|---|---|
| Cleanup | ≥80% | median <1.5 | 4/5 |
| Staging | ≥80% | median <5.0 | 4/5 |
| Twilight | ≥80% | N/A (whole-frame, bail OK) | 4/5 — dusk + preserved arch |
| Sky | ≥80% | N/A | 4/5 — sky replaced + arch preserved |
| Pack | ≥80% | N/A (skipComposite) | 4/5 — style present + no mirror-flip |
| Renovation | ≥80% | median <2.0 (tuned composite: threshold 0.03, dilate 8, feather 12) | ≥9/10 adversarial scenarios — listed surfaces changed AND unlisted surfaces preserved AND architecture intact |

**All 6 tools passing as of 2026-04-19.** Full per-tool breakdowns in `tests/qa-harness/results/`. Renovation adversarial suite in `tests/qa-harness/real-world/run-renovation-scenarios.mjs` (10 scenarios covering walls-only, cabinets-only, flooring-only, multi-surface, full-gut, backsplash-only, light-fixtures-only, over-constrained, furniture-heavy, bathroom fixtures-only).

**Runbook:**
```sh
node tests/qa-harness/run-qa.mjs --tool <toolname> --concurrency 4
open tests/qa-harness/reports/<latest>/index.html
```

Before changing prompts or composite parameters, run the affected tool's harness and confirm metrics don't regress.

### 10.1 Pack verification matrix

Admin-only visual audit at `/admin/pack-matrix` — every Style Pack × three canonical rooms in a 7×3 grid. Spot-check before shipping a new pack or adjusting pack DNA / preservation rules.

**Room scope (Fix 1, 2026-04-18):** matrix covers the `furniture` pack tier only — rooms where packs place actual furniture. Kitchen / Bathroom / Laundry Room (`decor-only` tier) and Exterior / Patio / Garage / Basement / Closet (`disabled` tier) are out of scope because their pack behavior is fundamentally different and isn't comparable in a grid.

**Canonical fixtures (all single-purpose, empty-or-lightly-staged):**

| Slug | Label | Source fixture |
|---|---|---|
| `living-room` | Living Room | `Amber_photos_BM8A4996.jpg` — empty LR, defined couch zone, windows + ceiling fan |
| `bedroom` | Bedroom | `Jordan_Roehrenbeck_..._NUR65764.jpg` — master w/ tray ceiling, lightly staged |
| `primary-bedroom` | Primary Bedroom | `Amber_photos_BM8A5021.jpg` — empty primary BR, window, neutral walls |

**Room-type-aware pack prompts (Fix 2, 2026-04-18):** `components/StyleControls.tsx` `buildPrompt` branches on `selectedRoom`:
- **furniture tier** (Living Room, Bedroom, Primary Bedroom, Dining Room, Office, Nursery): full furniture staging + HARD PRESERVATION RULES block (unchanged behavior).
- **decor-only tier** (Kitchen, Bathroom, Laundry Room): accessories only — pendant styling, barstool cushions, dish towels, fruit bowls, window treatments. Cabinets / appliances / countertops / fixtures stay pixel-identical. Explicit "do not place sofas / beds / dining tables" line.
- **disabled tier** (Exterior, Patio, Garage, Basement, Closet): pack mode gated in UI, toast directs user to Text mode or Pro AI Tools.

The generator script mirrors all three branches so the matrix reflects production.

**Expected performance (baseline target):**

| Pack | Living Room | Bedroom | Primary Bedroom |
|---|---|---|---|
| Coastal Modern | ≥6 | ≥7 | ≥6 |
| Urban Loft | ≥5 | ≥5 | ≥5 |
| Farmhouse Chic | ≥6 | ≥6 | ≥6 |
| Minimalist | ≥7 | ≥7 | ≥7 |
| Mid-Century Modern | ≥6 | ≥6 | ≥6 |
| Scandinavian | ≥5 | ≥5 | ≥5 |
| Bohemian | ≥5 | ≥5 | ≥5 |

Ship gate: **≥14/21 cells score ≥6** on re-run. Below that, something regressed — investigate before committing.

**Generator:** `tests/qa-harness/generate-pack-verification-matrix.mjs`
**Scorer:** `tests/qa-harness/score-pack-matrix.mjs` (reads manifest, grades every cell 1-10 on architecture / lighting / perspective / staging, writes scores back).
**Outputs:** `public/pack-verification/renders/<room-slug>__<pack-slug>.jpg` (21 files, 1024w JPEG, q=0.85) + `public/pack-verification/manifest.json` (metadata + scores consumed by the admin UI).
**Prompt:** identical to production (`components/StyleControls.tsx` `buildPrompt` for `stageMode='packs'`) — HARD PRESERVATION RULES and the room-type branching are mirrored verbatim. If the production prompt changes, update the script in the same PR.
**Cost:** 21 Gemini image calls ≈ $0.84 per full regen + ~$0.10 for scoring pass.

**Runbook (run locally):**
```sh
node tests/qa-harness/generate-pack-verification-matrix.mjs   # renders 21 cells
node tests/qa-harness/score-pack-matrix.mjs                   # second-pass scores
git add public/pack-verification/
git commit -m "chore: refresh pack verification matrix"
```

Then open `/admin/pack-matrix` in the deployed app. Access is gated by the same `isAdmin()` check as the rest of admin surfaces (email ends with `@averyandbryant.com`). See `docs/pack-verification/README.md` for the full workflow, including when to regenerate and how to add a new pack.

**Phase 2 (future work):** async `/api/regen-pack-matrix` endpoint + `pack_matrix_jobs` Supabase table so admins can trigger a refresh from the browser. Skipped for MVP because 21 × ~15s = ~5 min exceeds Vercel's 300s function cap on Pro and committed PNGs survive deploys.

---

*End of Operating Manual.*
