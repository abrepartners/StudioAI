# 05 — Information Architecture

**Specialist:** IA lead
**Scope:** Map and critique StudioAI's full surface area — marketing, editor, settings, billing, and auth — and propose an IA that actually matches user intent at each funnel stage.
**Source material:** `/Users/camillebrown/StudioAI/App.tsx` (2779 lines, single-file shell), `docs/SOP.md`, every panel in `components/*`, `hooks/useSubscription.ts`, `hooks/useBrandKit.ts`, and a comparative scan of Virtual Staging AI and Krea.

---

## 1. Current sitemap (ASCII)

Everything below lives inside **one React SPA** with a single `activePanel` state variable and a pile of boolean modals. There are no routes. There are no URLs. There is no back button anywhere.

```
studioai.averyandbryant.com
│
├── [UNAUTHED — marketing page, single scroll]
│   ├── Sticky nav (Features · Pricing · FAQ · Sign In · Start Free)
│   ├── Hero (rotating verticals, demo video, "$300 → $1.38/room", Google sign-in)
│   ├── Who It's For strip (6 personas)
│   ├── #features — "Every tool your photos need" (interactive feature blocks)
│   ├── #pricing — plan tiles + credit packs
│   ├── #faq — 6 Qs
│   ├── Final CTA (Google sign-in again)
│   └── Footer (©, link to averyandbryant.com — nothing else)
│
└── [AUTHED — editor shell]
    │
    ├── TOP BAR
    │   ├── Logo (no click behavior once authed)
    │   ├── Undo / Redo (⌘Z / ⌘⇧Z)
    │   ├── Session Queue prev/next + "3/12" counter (only if >1 photo)
    │   ├── Export button → ExportModal
    │   ├── Save (to history)
    │   ├── + Add (upload more)
    │   ├── Upgrade pill (Free) / Pro badge (Pro)
    │   ├── Refresh (reset session)
    │   ├── Help (?) → re-opens QuickStartTutorial
    │   └── Profile avatar → ACCESS PANEL MODAL (see Settings below)
    │
    ├── LEFT SIDEBAR (rail, hover-expand 64→220px; bottom tabs on mobile — top 5 only, History gets cut)
    │   ├── Design Studio (tools)     ← default panel
    │   ├── Cleanup
    │   ├── MLS Export
    │   ├── Description
    │   ├── Social Pack
    │   └── History                   ← dropped from mobile nav
    │
    ├── CANVAS (center)
    │   ├── Room Type pill (14 options)
    │   ├── EditingBadge (version, chain depth, "chain full" amber state)
    │   │   └── popover: Commit & Continue · Start From Original · View History
    │   ├── Compare Slider (when result exists)
    │   ├── Generation overlay (3-line typing animation + elapsed timer)
    │   └── "Mask Mode" pill (top-right, cleanup only)
    │
    ├── RIGHT PANEL (contextual to active sidebar item)
    │   ├── Design Studio
    │   │   ├── Mode switch: Text · Packs · Furnish (SOON, disabled)
    │   │   ├── Design Direction card
    │   │   │   ├── Text mode: textarea + suggested-prompt chips
    │   │   │   └── Packs mode: 7 preset tiles
    │   │   ├── Pro AI Tools (collapsible accordion, 5 sections)
    │   │   │   ├── Day to Dusk
    │   │   │   ├── Sky Replacement (4 presets)
    │   │   │   ├── Smart Cleanup
    │   │   │   ├── Virtual Renovation
    │   │   │   └── Listing Copy (3 tones, 3 MLS char targets)
    │   │   └── Selective Removal card → FurnitureRemover (renders ON CANVAS, not in panel)
    │   ├── Cleanup     → mask instructions + brush + "Remove and Reveal"
    │   ├── MLS Export  → preset · watermark · EXIF notice · Single/Batch · Download
    │   ├── Description → Luxury/Casual/Investment tabs · char count · copy buttons
    │   ├── Social Pack → 4 templates · format picker (only ig-post) · property form
    │   └── History     → Recent / Saved segmented tab, thumbnail grid
    │
    └── MODALS (12 of them, flat)
        ├── QuickStartTutorial — 6 steps, fires on first visit, re-openable from Help (?)
        ├── ExportModal — watermark, disclaimer, aspect, reveal-video, share-to-gallery
        ├── UpgradeModal — Pro $29/mo + 3 credit packs
        ├── FurnitureRemover — palette + orientation (inline on canvas, not a real modal)
        ├── Access Panel (profile menu) — and this is where Settings actually live:
        │   ├── Google account card
        │   ├── Brand Kit (full form inline)
        │   ├── Referral Dashboard (non-admin only)
        │   ├── Manage Team (non-admin only)
        │   ├── Billing (status + Manage Billing → Stripe portal OR Upgrade CTA)
        │   ├── Admin Showcase (admin email only)
        │   └── Sign Out
        └── — that's the whole settings surface; it's ALL inside one modal

URL Params (hidden affordance)
├── ?ref=CODE          referral, triggers locked-in price
├── ?chain=0 / stack=0 opt out of chain mode (dev/QA only)
```

---

## 2. Funnel-stage-by-surface table

| Surface | Funnel stage | Copy/density match? |
|---|---|---|
| Landing hero | Awareness | OK — strong one-liner, clear price hook |
| Who It's For strip | Awareness | OK |
| #features | Consideration | OK, but demo video only plays in hero |
| #pricing | Consideration / Purchase | OK at top; no logged-in entry point to return here |
| #faq | Consideration | OK |
| Google sign-in | Activation gate | **Mismatch** — it's the ONLY path; no "try one free" unauth demo like Virtual Staging AI |
| First-run tutorial | Activation | OK-ish — 6 steps, too dense, fires before user has uploaded |
| Empty editor (no upload) | Activation | **Mismatch** — shows 4 feature chips but no "Try a Demo" is prominent; sample photo CTA is tiny |
| Design Studio panel | Usage | Matches well — this is the product's heart |
| Pro AI Tools accordion | Usage / Expansion | **Buried** — collapsible inside Design Studio right panel, below the fold |
| Cleanup / MLS / Description / Social Pack | Usage | OK once you know they exist |
| History panel | Retention | **Thin** — just thumbnails. No search, no filter, no "listing" grouping, no rename |
| Editing Badge "chain full" | Retention (quality UX) | Strong |
| Upgrade modal | Purchase / Expansion | OK — price + credit alternative |
| Profile → Access Panel | Retention / Expansion | **Mismatch** — Brand Kit, Team, Referral, Billing, Admin all crammed into a single scrolling modal. No IA. |
| Refresh button in header | Usage | Dangerous — discards session with no confirm |
| Help (?) | Activation | OK |
| Aryeo / GHL / API keys | — | **Do not exist** — no surface for integrations, keys, or webhooks |
| Listing-level grouping | Retention | **Does not exist** — `useListing.ts` exists but `ListingDashboard.tsx` is not wired into the shell |

---

## 3. Competitor IA comparison

**Virtual Staging AI** (studioai's closest functional competitor):
- Top nav: Home · Gallery · Pricing · Blog · Login · Signup
- Kills friction: "Upload image for free" works **before** login
- Gallery is a first-class nav item — social proof as its own surface
- Affiliate / Whitelabel / API are surfaced in the footer — clear expansion paths
- Blog is indexed and linked (SEO)
- Pricing is `/prices`, a real URL that can be shared, bookmarked, re-found

**Krea** (generalist AI creative tool, good IA to borrow from):
- Left rail of tool categories: Home · Image · Video · Realtime · Edit · Enhance · Train · Gallery
- Each tool is a **dedicated surface** with its own URL, not a panel inside another panel
- Home is a personal feed of your recent generations + community picks
- Profile menu is shallow: Profile · Library · Pricing · Settings · Sign out
- Settings is its own page with sub-tabs (Account · Billing · API · Notifications)

**What StudioAI is missing relative to both:**
1. No public Gallery / Showcase surface (Admin Showcase exists, but only admins see the queue, and there's no consumer-facing gallery page).
2. No shareable URLs for pricing, features, FAQ (only hash anchors on the landing page, which die after auth).
3. No Settings page; settings are inside a modal inside a profile menu.
4. No Blog / SEO surface.
5. No Affiliate / Whitelabel / API entry point — even though the roadmap calls for white-label in Phase 2.

---

## 4. Top 10 IA issues (ranked, most costly first)

1. **Settings is one giant modal.** Brand Kit, Referral, Team, Billing, and Admin Showcase are stacked vertically inside the profile-menu "Access Panel." There is no deep-linkable URL, no tab navigation, no way to send an agent a link to "go set up your brand kit." This is a scavenger hunt for new users AND a support burden for A&B.
2. **No `/listings` surface.** `ListingDashboard.tsx` was built, `useListing.ts` is exported, but neither is mounted in `App.tsx`. Photos disappear into a flat History grid with no address-level grouping. For a tool that explicitly markets itself as "listing media pipeline" (CLAUDE.md §Phase 1), the absence of a listing surface is the single most-missed piece of content.
3. **Pro AI Tools are buried under an accordion inside the Design Studio right panel.** Day to Dusk, Sky Replacement, Listing Copy, Virtual Renovation, Smart Cleanup are the highest-margin Pro differentiators — they should be first-class sidebar items or at minimum auto-expanded on first-gen. Right now a Pro user has to scroll past the staging controls to find what they upgraded for.
4. **Landing → editor has no continuity.** The marketing page has hash anchors (`#features`, `#pricing`, `#faq`) that are unreachable after sign-in. A Pro agent who wants to re-check pricing, FAQ, or compare plans has to sign out.
5. **First-run flow skips the hero moment.** Tutorial fires on first visit before the user has uploaded. The `?Try a Demo` sample-photo CTA exists but is a small text link below the uploader — users who drop off without uploading see nothing compelling.
6. **Mobile bottom tabs cut off History.** `navItems.filter(item => item.available).slice(0, 5)` silently drops the last item. On phone, History doesn't exist.
7. **Refresh button has no confirm.** Top bar `RefreshCcw` resets the whole session with no dialog. Destructive action, one click, no undo. Common dead-end.
8. **`?chain=0` is a hidden URL flag.** Dev/QA opt-out for chain mode is only a URL param — no toggle anywhere in the UI. When chain mode misfires, there's no user-visible way to escape it.
9. **Upgrade triggers are inconsistent.** The header "Upgrade" pill opens the modal, but so does hitting the generation cap, so does `onRequireKey` from Pro tools, so does the Billing section of the profile panel. Four entry points to the same modal; none lead to a comparison page, just straight to Stripe.
10. **No empty / error state for Social Pack, MLS Export, Description.** If the user lands on MLS Export without a generated image, the right panel silently shows "no images." The sidebar item should either be gated until a generation exists, or show a clear "Generate a design first" state with a shortcut back to Design Studio.

---

## 5. Proposed sitemap (ASCII)

The principle: **routes per surface, settings as a real page, Pro AI Tools promoted, listings as the new center of gravity.**

```
studioai.averyandbryant.com
│
├── /                         [UNAUTHED] landing
│   ├── Try Free → drops user into /try (unauth, 1 free gen — matches VSAI)
│   ├── /gallery              Public showcase (move Admin Showcase approval into /admin)
│   ├── /pricing              Real URL, shareable
│   ├── /features             Real URL, shareable
│   ├── /faq
│   ├── /blog                 SEO play, Phase 2
│   └── /login
│
└── [AUTHED]
    │
    ├── /studio               Editor (current shell, cleaned)
    │   ├── Left rail: Design · Pro Tools · Cleanup · Export · Copy · Social · History
    │   │                    (Pro Tools PROMOTED from accordion to top-level surface)
    │   ├── Canvas + EditingBadge (unchanged — these are strong)
    │   └── Contextual right panel per rail item
    │
    ├── /listings             **NEW, wire up ListingDashboard.tsx**
    │   ├── Grid of listings (address · photo count · export status)
    │   └── /listings/[id]    per-listing view: photos, description, website, print, social
    │
    ├── /gallery              authed view = your own renders + community highlights
    │
    ├── /settings             **NEW — real page, not a modal**
    │   ├── /settings/brand           Brand Kit form (logo, headshot, colors, contact)
    │   ├── /settings/team            Manage Team (admin only)
    │   ├── /settings/billing         Plan · usage · Stripe portal · credit packs
    │   ├── /settings/referral        Referral dashboard
    │   ├── /settings/integrations    **NEW shell** — Aryeo, GHL, Gemini key, API tokens
    │   └── /settings/account         Google email, sign-out, delete account
    │
    ├── /admin                Admin-only (showcase approval, user lookup, brokerage)
    │
    └── Modals (slim down to 3)
        ├── UpgradeModal      (kept — triggered from generation caps + explicit upgrade)
        ├── ExportModal       (kept — export is a flow, modal is correct)
        └── QuickStartTutorial (kept — but fires AFTER first upload, not on first visit)

URL Params (documented in /settings/account)
├── ?ref=CODE         referral (surface code status in /settings/referral)
└── ?chain=0          add a visible dev toggle in /settings/account for power users
```

### Rationale for each change

- **`/settings` as a page, not a modal.** Deep-linkable, tab-able, shareable ("send your agent this link to fill out their brand kit"). Kills the scavenger hunt.
- **Pro Tools promoted to left-rail item.** They are the entire upgrade thesis. Don't bury them.
- **`/listings` wired up.** The code exists. Wire it. This turns StudioAI from a "photo editor" into a "listing media platform" — which is literally the project's one-liner in CLAUDE.md.
- **Real URLs for marketing pages.** `/pricing`, `/features`, `/gallery` work pre- and post-auth. Shareable, bookmarkable, indexable.
- **`/try` unauth demo.** Copy Virtual Staging AI's "upload for free before signup" move. Highest-leverage conversion change.
- **`/settings/integrations` shell.** Currently nothing exists for Aryeo / GHL / Gemini key / future API tokens. Add the shell now even if only Brand Kit ships first — gives users a mental model for where integrations live.

---

## 6. 3-sentence summary

Biggest IA mistake: **Settings is not a page.** Brand Kit, Team, Billing, Referral, and Admin are all stacked inside a single profile-menu modal with no URL, no tabs, and no way to link a user to a specific section. Single most-missed content: **a listings surface** — `ListingDashboard.tsx` and `useListing.ts` are both built but unmounted, so photos vanish into a flat History grid despite the product branding itself as a listing media platform. One nav change to ship first: **promote Pro AI Tools from the collapsible accordion inside the Design Studio right panel to a first-class left-rail item** — this is the single most revenue-relevant surface in the product and it is currently below the fold.
