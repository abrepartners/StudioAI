# Research Memo — Third-party Tools for Social Pack v1

**Date:** 2026-04-21
**Author:** Jarvis
**Pairs with:** `2026-04-21-social-pack-template-system.md`
**Question:** Are we missing an OSS library, API, or asset source that would materially accelerate or improve the Social Pack template system?

---

## Section 1 — Top 3 tools worth integrating

### 1. Lucide icons (`lucide-react` / `lucide-static`) — integrate now
Lucide is the MIT-licensed successor to Feather, ships a `bed`, `bath`, `house`, `map-pin-house`, `ruler` (sqft), `calendar`, `clock`, and `phone` set — exactly the glyph list our six templates need. It's tree-shakable and renders as pure inline SVG, which Satori consumes cleanly (no font-icon hacks, no webfont loading). We're currently drawing stats as pure text ("4 BR · 3 BA · 2,840 SF") which is fine for Broker Bureau but will look thin the moment we add Luxury Minimal + Bold Modern. Lucide gives us a consistent icon vocabulary across all three styles. Cost: $0. Effort: ~1 hour to add the package, import the 6-8 icons we need, and wire them to slots via a new `"icon"` slot type in the JSON spec.

### 2. smartcrop.js (`smartcrop-sharp` on the API side) — integrate in v1.1
Listing photos arrive in every aspect ratio imaginable; a naive `object-fit: cover` crops heads off agents and hides the front door behind a sky band. smartcrop.js is MIT-licensed, runs server-side via `smartcrop-sharp`, and returns a suggested crop rectangle based on edge density + saturation + (optional) face detection. For Just Listed / Open House / Sold this means the house stays centered in the square-ratio crop even when the source photo is 3:2 landscape. Integration: a `/api/smart-crop` helper that consumes the hero image, returns `{x, y, w, h}`, and is passed to the Satori `<img>` as `object-position`. Cost: $0. Effort: one evening; already aligns with the existing `cropToAspect()` utility signature in `src/utils/imageExport.ts`.

### 3. satori-og (LucJosin) as a reference pattern — adopt the shape, not the dep
`LucJosin/satori-og` is the cleanest OSS example of the exact pattern we're building: a client-factory that holds defaults + fonts + colors and renders dynamic JSX per-page-type. We don't need to depend on it, but the API shape (`createOgClient({ fonts, defaults }).render(type, data)`) is a better signature than what the current spec implies (templateId + ratio + data passed loose). Adopting it would let us test a template once, then produce all three ratios from a single call. Cost: $0. Effort: spec-level — adjust the renderer interface before building it, zero code rewrite later.

---

## Section 2 — Tools evaluated but NOT recommended

- **Bannerbear ($49/mo, 1K credits)** — excellent product, but paying per-image for something we already render for free via `@vercel/og` would cost us ~$588/year at 1K images/mo and lock templates inside their editor (not git). Also introduces a second rendering pipeline to maintain.
- **Placid ($19+/mo)** — same economics as Bannerbear, slightly cheaper, but their API is designed for Zapier-style single-image requests, not the batch ratio fan-out we need (one listing → 6 templates × 3 ratios = 18 images).
- **Creatomate ($41+/mo)** — strongest at video, weakest ROI for our static-image use case; we'd pay for motion features we won't use until Phase 2.
- **Templated.io ($29+/mo)** — closest to Bannerbear in features, same objection: we'd be renting what Satori already does for free.
- **Canva Connect API** — requires each agent to have a Canva account, design files live in Canva (not our DB), and there is no JSON spec export — you can only export the *rendered* design as PNG/PDF. Wrong direction entirely for a template library we control.
- **Figma → Satori JSX exporter** — no such plugin exists. "JavaScript and JSX Serializer" and "SVG to JSX" plugins exist but produce React component code, not Satori-compatible JSX with the Flexbox subset. Would create more cleanup work than hand-writing the spec.
- **GrapesJS / Easyblocks / Silex** — web-page builders, not social-post builders; wrong primitive (they optimize for 1920×anything, not locked 1:1/4:5/9:16 frames).
- **Cloudinary / imgproxy / og-image.vercel.app** — solve a different problem (image transformation / OG URL assembly). We already have Vercel Blob + `@vercel/og`; adding these is pure cost with no unlocked capability.
- **shadcn/ui + Magic UI** — built for interactive DOM, not Satori's Flexbox subset; animations and Radix primitives don't render to PNG.
- **Bannerbear/Templated/Placid real-estate "template galleries"** — useful for design inspiration (Section 3), but their template files are proprietary formats, not portable into Satori.

---

## Section 3 — Real-estate template design patterns to adopt

Surveyed Coffee & Contracts, LUXVT, Placid's free real-estate pack, Etsy luxury bundles, and Placeit. Eight motifs recur across every gallery — we should encode them as spec-level primitives.

1. **Hero photo + typographic price dominating the lower third.** Price is never a pill; it's a display-serif number the size of the headline. Already in our spec. Keep.
2. **Micro-label + divider at top left.** "JUST LISTED — NO. 001", tracked uppercase, hairline rule underneath. Already in our spec. Keep.
3. **Beds · Baths · Sqft as a middot-separated row, right-aligned to the photo band.** We have this. Missing: icons in front of each number (fixes Section 1 recommendation #1).
4. **Agent circle portrait bottom-left, brandmark bottom-center, contact row bottom-right.** A "footer triangle." Our spec has headshot on Just Listed + Open House only; should extend to Sold. Bottom-right contact row for story ratio specifically is smart — we already do it.
5. **Two-image before/after with a 45° diagonal split or centered vertical line + labels at top-left of each half.** Our spec uses 50/50 split — consider adding an optional diagonal variant as a style flag.
6. **"COMING SOON" → deliberately blurred hero + big type stamp.** Our spec handles this; many competitor templates add a small date line below ("SPRING 2026" / "LIST DATE: 4/25"). Minor add.
7. **Duotone or color-wash hero treatment** (hero photo dropped to 40% saturation + brand color overlaid at 15%). Luxury Minimal especially. Not in our spec. Easy via SVG `<filter>` or a Satori-compatible gradient overlay.
8. **Corner registration marks / architectural brackets.** Our Broker Bureau style already does this — it's what makes our aesthetic defensible vs. Canva-looking templates. Keep and emphasize.

Font pairings confirmed as current best practice for luxury real estate in 2026: **Playfair Display + Inter/Lato** (most common), **DM Serif Display + Poppins** (what we're already using — validated), and **Cormorant Garamond + Montserrat** (luxury boutique). Our existing font stack is on-trend.

---

## Section 4 — Concrete quick wins for the current spec

1. **Add an `"icon"` slot type.** The spec today has `micro-label`, `hero`, `address`, `price`, `stats`, `brandmark`. Add `icon` as a first-class slot that takes a Lucide icon name + size + color, so the stats line becomes `[bed icon] 4 BR · [bath icon] 3 BA · [ruler icon] 2,840 SF`. Takes the stats row from "MLS-text-like" to "social-ready" instantly. Zero renderer complexity cost.

2. **Add a `photoTreatment` field to the spec** — one of `none | duotone | darken | blur | desaturate`. Currently the spec has `gradientOverlay` at the chrome level, but real-estate templates consistently treat the hero photo itself (especially Coming Soon = blur, Luxury Minimal = duotone). Cheapest way: a CSS `filter` string passed through to the Satori `<img>`. Unlocks motif #6 and #7 from Section 3 with ~20 lines of renderer code.

3. **Pass the smart-crop rectangle through the `photoSlot` config.** Today `photoSlot` is `{ x, y, w, h, fit }`. Add an optional `focusPoint: { x: 0-1, y: 0-1 }` that the renderer uses for `object-position`. If the agent (or smartcrop.js) provides a focus point, it overrides the default center-crop. No breaking change — missing field = current behavior.

---

## Section 5 — Honest assessment: is our approach right?

**Yes, the JSON-spec + Satori approach is correct. Do not pivot to Bannerbear/Placid/Creatomate.**

The case for pivoting is seductive: drag-drop template editor, existing real-estate gallery, no rendering code to maintain. The case against is decisive:

- **Unit economics.** At $49/mo × 1,000 credits, we'd hit break-even vs. Vercel OG at about 200 agents generating 5 images/mo — a cohort size we'll exceed within weeks of launching the Marketing Kit. The platform margin we'd hand to Bannerbear is exactly the margin that lets StudioAI undercut Canva for real estate.
- **Template ownership.** A JSON spec in our git repo is an asset. A design sitting in a Bannerbear account is rented infrastructure — if they change pricing, deprecate an API field, or go down, our entire social output goes with them.
- **Phase 2 customization.** The spec explicitly calls for a per-agent override layer (`textLayers[1].size: 104`). Bannerbear's template-variables model does not support arbitrary layout overrides — you can change text content and image URLs, not positions or sizes. A pivot would close off Phase 2 before we start it.
- **BrandKit integration.** Our spec's `hideIfMissing` + `primaryColor` propagation is the core differentiator. Bannerbear supports variable substitution but nothing as rich as our BrandKit-field-to-slot mapping. We'd have to recreate it client-side and then ask their API to render — worst of both worlds.

The risk of our approach is not architectural, it's **volume of design work**. Six templates × three ratios = 18 hand-tuned layouts, plus 36 more when Luxury Minimal + Bold Modern land in 1.5. The fix is the three quick wins above (icon slot, photoTreatment, focusPoint) — they turn the spec from a "layout config" into a lightweight design language, and every new template becomes a 30-minute JSON file instead of a two-hour one.

**Recommendation:** Ship v1 as speccced, plus Lucide icons, plus the three quick wins from Section 4. Add smartcrop.js in v1.1. Revisit Bannerbear only if v2 customization editor turns out to be >3 weeks of work — at which point "rent the editor, own the templates" (export our JSON specs to their format) is a viable bailout, not a starting position.

---

## Sources

- [Vercel Satori](https://github.com/vercel/satori)
- [LucJosin/satori-og](https://github.com/LucJosin/satori-og)
- [Lucide icons](https://lucide.dev/)
- [smartcrop.js](https://github.com/jwagner/smartcrop.js/) + [smartcrop-sharp](https://github.com/jwagner/smartcrop-sharp)
- [Bannerbear pricing](https://www.bannerbear.com/pricing/)
- [Placid pricing](https://placid.app/pricing)
- [Creatomate vs Bannerbear](https://creatomate.com/compare/bannerbear-alternative)
- [Templated.io pricing](https://templated.io/pricing/)
- [Canva Connect API docs](https://www.canva.dev/docs/connect/)
- [Coffee & Contracts carousel patterns](https://coffeecontracts.com/blog/16-carousel-post-ideas-for-real-estate-agents-to-grow-on-instagram-in-summer-2025)
- [LUXVT just-listed template patterns](https://elite.luxvt.com/editable-real-estate-instagram-posts/)
- [Placid free real-estate templates](https://placid.app/designs/free-real-estate-social-media-templates-for-creative-automations)
- [Playfair Display font pairings](https://www.typewolf.com/playfair-display)
