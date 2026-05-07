# Prompt Overhaul — Surgical Rewrites for Production Quality

**Date:** 2026-05-07
**Goal:** Upgrade every generation tool's prompts from "functional" to "competition-killing" — sharper realism, invisible edits, curated style packs, magazine-ready output.
**Approach:** Surgical per-tool rewrites. No new architecture, no new abstraction layers. Upgrade what exists.

---

## Problem Statement

StudioAI's generation pipeline passes QA (10/10 on staging, sky, twilight; 9/10 on packs) but falls short of competitor polish in four areas:

1. **Furniture realism** — AI-generated items look too clean/perfect vs. surrounding photo
2. **Edit invisibility** — existing surfaces (carpet, walls, floors) get smoothed/regenerated instead of preserved
3. **Style specificity** — preset descriptions are Pinterest-board-level, not interior-design-brief-level
4. **Magazine finish** — overall output lacks the lighting/sharpness/composition polish of competitors

Root cause: the prompts are structurally sound but content-thin. The system prompt in `geminiService.ts` has strong guardrails, but the per-tool ASSIGNMENT text gives the model too little direction and too much room to hallucinate.

---

## Scope

Six generation tools, each with a targeted prompt upgrade:

| Tool | Model | Prompt Location | Upgrade Type |
|---|---|---|---|
| Staging | Gemini | `VellumPhotoEditor.tsx` + `StyleControls.tsx` | Style DNA briefs + preservation rules |
| Cleanup | Bria / Reve | `fluxService.ts` | Inpainting texture language |
| Whiten | Gemini | `VellumPhotoEditor.tsx` | Color science rewrite |
| Lawn | Gemini | `VellumPhotoEditor.tsx` | Grass realism spec |
| Sky | Nano Banana | `api/sky-replace.ts` | Anti-ghost + atmospheric consistency |
| Twilight | Flux 2 Pro | `api/flux-twilight.ts` | Photography DNA matching |

Plus two cross-cutting changes:

| Change | Location | Purpose |
|---|---|---|
| Photography DNA | `geminiService.ts` system prompt | Grain/texture/noise matching for all Gemini tools |
| Sharpening pipeline | `VellumPhotoEditor.tsx` post-processing | Ensure Gemini outputs match sharpness of Replicate tools |

---

## 1. Photography DNA — System Prompt Addition

**File:** `services/geminiService.ts`
**Location:** New section after `REALISM REQUIREMENTS FOR NEW FURNITURE/DECOR`

This is the single highest-impact change. It addresses the carpet-smoothing and surface-regeneration problem across all Gemini-based tools (staging, whiten, lawn).

```
========================================
PHOTOGRAPHY DNA — MATCH THE INPUT IMAGE
========================================
- Study the input photo's noise/grain structure, JPEG compression texture,
  and sensor characteristics. Your output must have the SAME grain profile.
  If the input is slightly grainy from a high-ISO capture, your additions
  must be equally grainy. If the input is clean studio lighting, your
  additions must be clean. Never output a smoother or sharper image than
  the input.
- EXISTING SURFACES — carpet, hardwood, tile, concrete, walls, ceilings,
  countertops — must retain their original texture at pixel level. If the
  carpet has visible pile direction, fiber texture, and wear patterns, all
  of that must appear identically in the output. Do NOT smooth, denoise,
  upscale, or regenerate any existing surface. Existing surfaces are
  READ-ONLY pixels.
- Color temperature and white balance of the OUTPUT must exactly match the
  INPUT. Do not warm, cool, or re-grade any region you are not explicitly
  modifying.
- Match the input's dynamic range. If shadows are slightly crushed, keep
  them crushed. If highlights are slightly blown, keep them blown. Do not
  "improve" the photo's exposure or tonal curve.
- Lens characteristics: match the input's depth of field, barrel/pincushion
  distortion, vignetting, and chromatic aberration. New furniture at the
  same depth as existing furniture should have the same focus level.
```

**Why this works:** Current prompts say "match the room's existing lighting" but never say "match the camera's sensor output." Models default to their cleanest render style, which is why carpet gets smoothed — the model treats it as a surface to optimize rather than a texture to preserve.

---

## 2. Staging — Per-Style Interior Design Briefs

**Files to modify:**
- `src/vellum/VellumPhotoEditor.tsx` — upgrade `stageDesc` from 1-line to full brief
- `components/StyleControls.tsx` — upgrade `PACK_DETAILS` to match

**Current problem:** The Vellum staging prompt is:
```
Virtually stage this living room with Contemporary style furnishings
(clean lines, neutral tones, glass and metal accents, open feel).
Use premium furniture materials. Match the room's existing lighting
on all new pieces. Professional real estate photography composition.
```

No specific furniture pieces. No material specs. No color palette. No room-type adaptation. No preservation rules (unlike StyleControls which has HARD PRESERVATION RULES).

### 2.1 Shared Style DNA Module

Create `src/prompts/stylePacks.ts` — a shared module both UIs import.

Each style gets:
- **Furniture spec per room type** — what to place in a living room vs bedroom vs office
- **Material palette** — specific wood species, fabrics, metals
- **Color palette** — named colors with approximate values
- **Arrangement philosophy** — how pieces relate to each other
- **Anti-patterns** — what NOT to do for this style

#### Contemporary

```typescript
{
  id: 'contemporary',
  label: 'Contemporary',
  dna: 'Low-profile silhouettes, warm neutrals, mixed materials — feels curated, not catalog.',
  materials: 'Walnut or white oak wood, bouclé upholstery, brushed brass hardware, fluted or reeded glass, natural stone (travertine, marble), matte ceramics, linen.',
  palette: 'Warm white, greige, walnut brown, soft sage, matte black accents. No primary colors. No high-saturation pieces.',
  antiPatterns: 'No matching 3-piece furniture sets. No identical throw pillows. No catalog symmetry. Arrange like a designer — intentional asymmetry, objects grouped at varied heights, one statement piece per vignette.',
  rooms: {
    'Living Room': 'Low-profile sectional or sofa in warm greige bouclé. Walnut coffee table with stone or fluted-glass top. One linen accent chair. Woven jute area rug. Matte black or brass floor lamp. Floating media console if wall space allows. One large-scale artwork or oversized mirror.',
    'Bedroom': 'Platform bed with upholstered headboard in oatmeal linen, queen or king based on room size. Walnut nightstands with ceramic table lamps. Woven or linen throw draped at foot. Upholstered bench at foot if space allows. Soft area rug under bed extending 2ft on each side.',
    'Dining Room': 'Oval or rectangular walnut dining table. Upholstered dining chairs in cream or greige. Simple centerpiece — single stem vase or sculptural object. Pendant light or chandelier NOT added (preserve existing fixtures).',
    'Office': 'Walnut desk with clean lines. Upholstered task chair in neutral fabric (not mesh). Small bookshelf or credenza. Desktop accessories — leather tray, ceramic pencil holder. One framed print.',
    'Nursery': 'White or natural wood crib. Small dresser doubling as changing table. Upholstered glider in cream. Soft area rug. Minimal wall decor — one mobile or print.',
  }
}
```

#### Mid-Century Modern

```typescript
{
  id: 'mid-century',
  label: 'Mid-Century Modern',
  dna: 'Tapered legs, organic curves, warm wood tones, disciplined color — 1950s Danish meets California modern.',
  materials: 'Walnut and teak wood with visible grain, molded plywood, genuine or faux leather in cognac/caramel, wool upholstery, brass legs and pulls, terrazzo accents.',
  palette: 'Warm walnut, cognac leather, mustard or olive accent (ONE per room), cream, warm white. Pops of teal or burnt orange in pillows or art only.',
  antiPatterns: 'No heavy overstuffed furniture. No matching wood tones everywhere — mix walnut with teak or oak. No modern/industrial mashup. Keep it warm, not cold.',
  rooms: {
    'Living Room': 'Low-slung sofa with tapered walnut legs and wool or leather cushions. Molded plywood lounge chair. Round walnut coffee table. Sunburst or atomic wall clock. Slim credenza or media console with sliding doors. Area rug in cream or geometric pattern.',
    'Bedroom': 'Walnut platform bed with slatted headboard. Tapered-leg nightstands. Ceramic or spun-metal table lamps. Wool throw in mustard or olive. Dresser with angled legs and brass pulls.',
    'Dining Room': 'Oval or round walnut table. Molded chairs (shell or Windsor style) in mixed wood or with seat pads. Pendant light NOT added. Sideboard or buffet with sliding doors.',
    'Office': 'Writing desk with tapered legs and single drawer. Leather desk chair with chrome or wood frame. Low bookcase. Globe or desk lamp in brass.',
  }
}
```

#### Coastal Modern

```typescript
{
  id: 'coastal',
  label: 'Coastal Modern',
  dna: 'Airy and light with natural textures — beach house sophistication, not kitschy nautical.',
  materials: 'White oak or driftwood-finish wood, rattan and woven seagrass, linen and cotton slipcovers, jute, natural stone, matte white ceramics, brushed nickel.',
  palette: 'Warm white, sand, soft blue-gray, seafoam (used sparingly), natural wood tones. No navy. No coral. No seashell motifs.',
  antiPatterns: 'No anchors, starfish, shells, or nautical kitsch. No matching blue-and-white everything. This is Restoration Hardware, not Pier 1.',
  rooms: {
    'Living Room': 'Slipcovered sofa in white or sand linen. Rattan accent chair or pair. Whitewashed wood coffee table. Jute area rug. Ceramic table lamp. Woven basket for throws. One oversized coastal landscape or abstract.',
    'Bedroom': 'Upholstered bed in white linen with relaxed bedding. Rattan or whitewashed nightstands. Linen table lamps. Layered white/cream pillows with one textured accent. Light area rug. Sheer curtain panels if windows are bare.',
    'Dining Room': 'White oak or whitewashed dining table. Woven-back dining chairs or slipcovered parsons chairs. Woven pendant NOT added. Simple greenery centerpiece.',
  }
}
```

#### Farmhouse

```typescript
{
  id: 'farmhouse',
  label: 'Farmhouse',
  dna: 'Rustic warmth with refinement — reclaimed textures, neutral warmth, lived-in comfort.',
  materials: 'Distressed and reclaimed wood, wrought iron, antique brass, linen and cotton, natural stone, shiplap-compatible finishes, woven jute and wool.',
  palette: 'Warm cream, antique white, sage green, warm gray, aged wood browns. No stark white. No industrial gray.',
  antiPatterns: 'No brand-new-looking barn doors. No over-the-top distressing. No Live Laugh Love. Sophisticated rustic, not theme park country.',
  rooms: {
    'Living Room': 'Deep-seated sofa in cream or oatmeal linen. Reclaimed-wood coffee table. Upholstered accent chair in ticking or herringbone. Woven jute rug. Iron floor lamp or table lamp. Chunky knit throw. Wooden ladder blanket rack if wall space allows.',
    'Bedroom': 'Wood bed frame with simple headboard — paneled or plank style. White linen duvet with layered textured pillows. Distressed nightstands. Ceramic or iron table lamps. Woven rug. Simple framed botanical or landscape print.',
    'Dining Room': 'Farmhouse trestle table in aged wood. Mix of Windsor chairs and an upholstered bench. Linen table runner. Iron chandelier NOT added. Mason jar or ceramic vase with greenery.',
  }
}
```

#### Scandinavian

```typescript
{
  id: 'scandinavian',
  label: 'Scandinavian',
  dna: 'Light, functional, quietly warm — hygge without clutter.',
  materials: 'Pale birch and ash wood, wool and sheepskin, matte white ceramics, brushed steel, cotton canvas, unglazed pottery.',
  palette: 'Warm white, pale gray, birch blonde, soft black accents. One muted accent per room — blush, dusty blue, or sage. Never saturated.',
  antiPatterns: 'No heavy curtains. No ornate furniture. No dark wood. No clutter — every object earns its place. Fewer pieces, more space.',
  rooms: {
    'Living Room': 'Compact sofa in light gray or off-white with clean lines. Birch-leg armchair. Round or oval coffee table in light wood. Simple wool rug in cream or light gray. One pendant or floor lamp (not both). Single potted plant. Minimal art — one print or photograph.',
    'Bedroom': 'Simple birch bed frame. White linen bedding with one textured throw. Small birch nightstands. Simple ceramic or paper shade lamps. Sheepskin rug beside bed. No artwork or one small print.',
    'Dining Room': 'Round birch table (seats 4 unless room is large). Wishbone-style or simple wood chairs. Single pendant NOT added. Glass carafe and one plant as centerpiece.',
  }
}
```

#### Minimalist

```typescript
{
  id: 'minimalist',
  label: 'Minimalist',
  dna: 'Radical restraint — fewer pieces, more impact. Each item is a deliberate choice.',
  materials: 'Monolithic forms — solid wood slabs, cast concrete, smooth plaster, matte metals, fine-weave upholstery. No visible hardware. No ornament.',
  palette: 'White, warm gray, charcoal, natural wood (ONE tone). One accent color maximum — muted, not bright.',
  antiPatterns: 'No decorative pillows. No gallery walls. No tchotchkes. If you question whether to add something, don\'t. A minimalist room with too many things is just a messy room.',
  rooms: {
    'Living Room': 'One sofa — low, clean, monochromatic. One coffee table — sculptural form, no accessories except one object. One floor lamp. Area rug — solid color, clean edge. Nothing else unless the room is large (add one accent chair).',
    'Bedroom': 'Platform bed with no headboard or a simple upholstered panel. One nightstand per side with one lamp. No throw pillows. One simple throw at foot. No artwork or one oversized piece.',
    'Dining Room': 'Simple table with clean legs. Matching chairs — no mix. Nothing on the table except one object.',
  }
}
```

#### Bohemian (StyleControls only — not in Vellum currently)

```typescript
{
  id: 'bohemian',
  label: 'Bohemian',
  dna: 'Layered warmth, global textures, eclectic curation — curated maximalism, not chaos.',
  materials: 'Moroccan and kilim textiles, rattan and cane, macramé, terracotta, brass, reclaimed wood, handwoven baskets, natural fiber rugs.',
  palette: 'Terracotta, warm cream, dusty rose, olive, amber, rust. Layered warm tones. No cold colors. No stark white.',
  antiPatterns: 'No matchy-matchy. No new-looking Anthropologie sets. Must feel collected over time, not bought in one trip. No boho clichés — no mandala tapestries as wall art.',
  rooms: {
    'Living Room': 'Low sofa or floor seating in natural fabric. Kilim or vintage area rug (layered over jute if room is large). Rattan armchair. Reclaimed-wood coffee table. Mix of throw pillows in varied textiles. Floor plants. Macramé or woven wall hanging. Brass tray with candles.',
    'Bedroom': 'Low bed with textured headboard or fabric-draped wall. Layered bedding — linen, knit, kilim. Mix of pillows. Rattan nightstand. Terracotta or brass lamp. Plants. Woven basket storage.',
  }
}
```

### 2.2 Vellum Staging Prompt Upgrade

Replace the current 1-line ASSIGNMENT in `VellumPhotoEditor.tsx` with:

```typescript
case 'staging': {
  const styleData = STYLE_PACKS[preset]; // from shared module
  const roomFurniture = styleData.rooms[roomLabel] || styleData.rooms['Living Room'];

  const prompt = `Virtually stage this ${roomLabel.toLowerCase()} in ${preset} style.

FURNITURE TO PLACE:
${roomFurniture}

STYLE DNA:
- Materials: ${styleData.materials}
- Color palette: ${styleData.palette}
- Arrangement: ${styleData.antiPatterns}

HARD PRESERVATION RULES:
- DO NOT modify, replace, or restyle any cabinets, vanities, built-ins, countertops, backsplashes, or millwork.
- DO NOT modify any appliances. Every appliance stays pixel-identical.
- DO NOT modify windows, doors, trim, baseboards, crown molding, flooring, floor color, wall color, or ceiling.
- DO NOT change the camera framing, crop, angle, or field of view.
- Stage based on what the image actually shows, not what the room label suggests.
- If the room is narrow or small, use fewer/smaller pieces — do NOT extend walls or rearrange architecture.`;

  const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
  return results[0] || imageBase64;
}
```

### 2.3 StyleControls PACK_DETAILS Upgrade

Replace the `PACK_DETAILS` record in `StyleControls.tsx` with imports from the shared module. The `HARD PRESERVATION RULES` already exist in StyleControls — keep them, they're working.

**Style name alignment:** StyleControls uses 7 styles (Coastal Modern, Urban Loft, Farmhouse Chic, Minimalist, Mid-Century Modern, Scandinavian, Bohemian). Vellum uses 6 styles (Contemporary, Mid-century, Coastal, Farmhouse, Scandinavian, Minimalist). The shared module covers all 8 unique styles (the 7 from StyleControls + Contemporary from Vellum). Each UI imports only the styles it needs.

---

## 3. Cleanup — Inpainting Texture Language

**File:** `services/fluxService.ts`
**Location:** `INTERIOR_CLEANUP_PROMPT` and `EXTERIOR_CLEANUP_PROMPT`

### 3.1 Interior Cleanup Addition

Append to the end of `INTERIOR_CLEANUP_PROMPT`, before the final return:

```
INPAINTING QUALITY STANDARD:
- Where items are removed, reconstruct the revealed surface by sampling
  the EXACT texture, color, grain, and pattern from adjacent visible
  areas of the same surface.
- Floor reconstruction: match plank direction, grout lines, carpet pile
  direction, tile pattern, and wear level from surrounding visible floor.
  Do NOT fill with a flat averaged color.
- Wall reconstruction: match paint sheen (matte/eggshell/satin), texture
  (smooth/orange-peel/knockdown), and any visible color gradients from
  adjacent wall areas. Do NOT smooth or repaint.
- The reconstructed area should be indistinguishable from the surrounding
  surface — same noise, same grain, same compression artifacts.
```

### 3.2 Exterior Cleanup Addition

Append to `EXTERIOR_CLEANUP_PROMPT`, before the final return:

```
INPAINTING QUALITY STANDARD:
- Reconstruct revealed surfaces (grass, concrete, siding) by sampling
  the exact texture, grain, and color from adjacent visible areas.
- Grass reconstruction: match blade height, color variation, thatch density,
  and shadow direction from surrounding lawn.
- Concrete/driveway: match surface texture, staining, and crack patterns.
- The reconstructed area should blend seamlessly with surrounding pixels.
```

---

## 4. Whiten — Color Science Rewrite

**File:** `src/vellum/VellumPhotoEditor.tsx`
**Location:** `case 'whiten'` in `callApiDirect`

Replace the current thin prompts with technical color science:

```typescript
case 'whiten': {
  const whitenSpecs: Record<string, string> = {
    'bright & airy': `TARGET: Bright, high-key real estate photography.
- Color temperature: 5500K neutral to slightly cool (5800K max).
- Exposure: lift +0.3 to +0.5 EV from current level. Aim for bright
  without blowout — highlights should clip at 250/255 max, not 255/255.
- Shadows: open to 20-30% — detail visible in every corner and under
  furniture. No crushed blacks.
- Whites: clean and bright without blue or yellow cast. White walls
  should read as true white, not warm cream or cool blue.
- Saturation: natural — do not boost. Wood tones and fabric colors
  should remain accurate to life.`,

    'warm editorial': `TARGET: Warm, editorial interior photography — Architectural Digest feel.
- Color temperature: 4200-4500K warm. Golden window light enhanced but
  not orange. Think "late afternoon sun through a west window."
- Exposure: +0.2 to +0.3 EV — slightly lifted but not high-key.
  Rich midtones are more important than bright highlights.
- Shadows: warm and soft, 15-25% density. Shadow areas should feel
  inviting, not dark.
- Whites: warm cream, not stark white. Warm but not yellow.
- Saturation: natural with very slight warmth boost in wood tones
  and fabrics. Do not oversaturate.`,

    'neutral': `TARGET: Perfectly neutral white balance — WYSIWYG accuracy.
- Color temperature: 5000K daylight neutral. Zero color cast of any kind.
- Exposure: match metered value — 0 EV correction. If the photo is
  slightly dark, keep it slightly dark. If bright, keep bright.
- Whites: true neutral white. Use a white wall or ceiling as reference
  — it should appear as pure white with no warmth or coolness.
- Saturation: accurate to life. No enhancement, no reduction.
- This is a correction, not a look. The goal is "what your eyes saw
  when standing in the room."`,
  };

  const spec = whitenSpecs[preset] || whitenSpecs['neutral'];
  const prompt = `PHOTO EDITING TASK — WHITE BALANCE AND EXPOSURE CORRECTION ONLY.

${spec}

PRESERVE EXACTLY (pixel-identical):
- All furniture, objects, decor, and architecture — geometry unchanged.
- All surface textures: carpet pile, wood grain, tile grout, fabric weave,
  wall texture. Do NOT smooth or denoise any surface.
- Camera framing, perspective, lens distortion, depth of field.
- All objects in the scene — do not add, remove, or reposition anything.

DO NOT:
- Smooth, denoise, sharpen, or HDR-process any surface.
- Add or remove any object, shadow, reflection, or highlight.
- Change the color of any object — only ambient light temperature changes.
- Apply any tonal curve, LUT, or color grade beyond the specified target.
- Make the photo "better" in any way not specified. This is a surgical
  white balance correction, not a retouch.`;

  const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
  return results[0] || imageBase64;
}
```

---

## 5. Lawn — Grass Realism Spec

**File:** `src/vellum/VellumPhotoEditor.tsx`
**Location:** `case 'lawn'` in `callApiDirect`

Replace the current thin prompts:

```typescript
case 'lawn': {
  const lawnSpecs: Record<string, string> = {
    'manicured': `TARGET: Professionally maintained residential lawn — the "just mowed for the listing shoot" look.
- Grass color: rich, consistent green with natural micro-variation — NOT
  flat neon green. Real grass has 3-4 shades from light yellow-green (sun
  exposed) to deep green (shaded). Include this variation.
- Grass texture: visible individual blade definition at close range. Slight
  height variation (0.5-1 inch). Natural thatch layer at base visible in
  foreground. Blade direction consistent with a mow pattern.
- Edges: crisp, clean borders where grass meets concrete, mulch, or garden
  beds. Natural feathering — not a hard pixel line.
- Shadows: micro-shadows between blades matching the scene's sun angle and
  direction. Shadow density consistent with the rest of the photo.
- Bare spots or brown patches: fill with matching green grass at the same
  texture density as surrounding areas.`,

    'natural': `TARGET: Healthy, lived-in lawn — lush and organic, not manicured.
- Grass color: multi-tonal green with natural variation. Some areas slightly
  longer, some slightly shorter. Clover or ground cover patches acceptable.
- Grass texture: mixed heights (1-3 inches), natural growth patterns, some
  seed heads in taller areas. Organic and realistic, not uniform.
- Edges: soft, natural borders. Grass creeping slightly over concrete or
  mulch edges is fine — this is a natural yard.
- Keep existing weeds that aren't distracting. Remove only obvious
  dead patches or bare dirt.`,

    'drought-resistant': `TARGET: Drought-tolerant xeriscaping — intentionally sparse, landscaped.
- Replace bare/dead lawn areas with: decorative gravel or decomposed granite,
  mulch beds with drought-resistant plants (succulents, agave, lavender,
  rosemary, ornamental grasses), and sparse drought-resistant ground cover.
- Keep existing trees, large shrubs, and hardscape exactly as-is.
- Natural, intentional spacing between plants. Not overgrown, not barren.
- Gravel/stone should have natural color variation and shadow detail.`,
  };

  const spec = lawnSpecs[preset] || lawnSpecs['manicured'];
  const prompt = `LANDSCAPING ENHANCEMENT — EXTERIOR PHOTO EDIT.

${spec}

PHOTOGRAPHY DNA:
- The enhanced lawn/landscaping must have the SAME photographic noise, grain,
  and compression texture as the rest of the image. If the photo is grainy,
  the grass is grainy. If clean, the grass is clean.
- Shadows on grass must match the scene's sun position, angle, and softness.
- Color temperature of the lawn must match the rest of the scene exactly.

PRESERVE EXACTLY (pixel-identical):
- House: every architectural element, siding, windows, doors, roof, trim.
- Hardscape: driveway, walkways, retaining walls, fences, mailbox.
- Sky, clouds, lighting conditions — no changes.
- Existing mature trees and large shrubs — no additions or removals.
- Camera framing and perspective.

DO NOT:
- Add new trees, structures, or landscape features not specified.
- Change the season or time of day.
- Smooth or denoise any non-lawn area.
- Modify the house, driveway, or any built structure.`;

  const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
  return results[0] || imageBase64;
}
```

---

## 6. Sky — Anti-Ghost + Atmospheric Consistency

**File:** `api/sky-replace.ts`
**Location:** `buildSkyPrompt()` function

The QA report (sky.md) recommended an anti-ghost clause that fixed the ghost-roofline artifact on Kelly_BM8A2247. Append to the existing prompt:

```typescript
function buildSkyPrompt(style: SkyStyle): string {
  const skyDesc = STYLE_SKY_DESCRIPTIONS[style];
  return `Replace ONLY the sky in this photograph with ${skyDesc}.

PIXEL PRESERVATION (non-sky regions):
Keep absolutely everything else pixel-identical: the house, siding, roof,
windows, doors, landscaping, grass, trees, driveway, fence, mailbox, and
every other non-sky element must be unchanged. Preserve the camera framing,
perspective, and field of view exactly. Do not invent, add, or remove any
physical object. Do not change any architectural features.

ATMOSPHERIC CONSISTENCY:
Adjust the ambient light on the house and ground to naturally match the
new sky. ${style === 'blue' ? 'Bright neutral daylight — well-lit facades, crisp shadows.' :
  style === 'golden' ? 'Warm golden-hour side-lighting — warm tones on sun-facing surfaces, cool shadows.' :
  style === 'dramatic' ? 'Moodier contrast with directional light through cloud breaks — slightly lower ambient, stronger highlights.' :
  style === 'overcast' ? 'Soft, even diffused light — minimal shadows, gentle illumination on all surfaces.' :
  'Lower ambient light, moody contrast — house still visible but under heavier cloud shadow.'}
The house should look naturally photographed under this sky, not composited.

CRITICAL — NO GHOST ROOFLINE / NO DUPLICATED STRUCTURE:
- The sky region above the roof must contain ONLY sky and clouds. Nothing else.
- Do NOT draw, echo, duplicate, or silhouette the roofline, chimney, or
  house shape anywhere in the sky.
- Do NOT create cloud formations that mirror or follow the roofline contour.
- If a faint outline of the house appears in the sky, erase it — only sky
  and clouds should exist above the real roof edge.

Blend the new sky naturally at the roofline edge — soft, clean transition
with no haloing or hard compositing line.`;
}
```

---

## 7. Twilight — Photography DNA Addition

**File:** `api/flux-twilight.ts`
**Location:** `buildTwilightPrompt()` function

The twilight prompts are already the most sophisticated. Add one section for photography DNA matching:

Append before the final paragraph:

```
PHOTOGRAPHY DNA — MATCH THE INPUT:
- Preserve the input photo's noise/grain structure. Do not smooth or denoise.
- The output should look like the same camera captured the scene at a different
  time of day — same sensor characteristics, same lens, same focal length.
- If the input has JPEG compression artifacts, the output should have similar
  compression texture. Do not "clean up" the photo.
```

---

## 8. Sharpening Pipeline for Gemini Tools

**Problem:** Cleanup, twilight, and sky all have post-generation upscaling (Pruna, Clarity, or Real-ESRGAN). Staging, whiten, and lawn go through Gemini with no sharpening step, so their exports are softer.

**Solution:** Add an optional upscale/sharpen step for Gemini-generated outputs in `VellumPhotoEditor.tsx`.

### 8.1 Implementation

After Gemini returns a result for staging/whiten/lawn, pass it through the existing `upscaleImage()` service (which already wraps Real-ESRGAN):

```typescript
// In callApiDirect, after getting Gemini result:
const geminiResult = results[0] || imageBase64;

// Upscale for sharpness parity with Replicate tools
const upscaled = await upscaleImage(geminiResult, signal);
return upscaled || geminiResult;
```

**Trade-off:** Adds ~3-5s latency and ~$0.005 cost per generation. Worth it for export sharpness parity. Can be gated behind a quality toggle if needed.

### 8.2 Alternative: Client-Side Unsharp Mask

If API-based upscaling is too slow for the staging workflow, use Canvas API unsharp mask:

```typescript
function unsharpMask(imageData: ImageData, amount: number = 0.5, radius: number = 1): ImageData {
  // Gaussian blur → subtract → add back at `amount` strength
  // Lightweight, runs in <100ms client-side
}
```

This is lighter but less effective than Real-ESRGAN. Recommend the API path.

---

## File Change Summary

| File | Change Type | What Changes |
|---|---|---|
| `src/prompts/stylePacks.ts` | **NEW** | Shared style DNA module with per-style × per-room briefs |
| `services/geminiService.ts` | EDIT | Add Photography DNA section to system prompt |
| `src/vellum/VellumPhotoEditor.tsx` | EDIT | Replace staging/whiten/lawn prompts with rich versions + add sharpening step |
| `components/StyleControls.tsx` | EDIT | Upgrade PACK_DETAILS to use shared style DNA |
| `services/fluxService.ts` | EDIT | Add inpainting quality language to cleanup prompts |
| `api/sky-replace.ts` | EDIT | Expand buildSkyPrompt with anti-ghost + atmospheric consistency |
| `api/flux-twilight.ts` | EDIT | Add photography DNA paragraph to buildTwilightPrompt |

---

## Testing Strategy

After implementation, run the existing QA harness to verify no regression:

1. `tests/qa-harness/real-world/run-stage-scenarios.mjs` — staging 10/10 must hold
2. `tests/qa-harness/real-world/run-sky-scenarios.mjs` — sky 10/10 must hold
3. `tests/qa-harness/real-world/run-twilight-scenarios.mjs` — twilight 10/10 must hold
4. `tests/qa-harness/real-world/run-cleanup-scenarios.mjs` — cleanup 10/10 (Pro) must hold
5. `tests/qa-harness/real-world/run-pack-scenarios.mjs` — packs 9/10 must hold or improve

Additionally, run before/after comparisons on 3-5 representative images per tool to verify:
- Carpet/floor texture preservation improved
- Furniture realism improved (grain matching)
- Style specificity improved (distinct, curated looks per style)
- Overall magazine-ready finish improved

---

## Priority Order

1. **Photography DNA** (geminiService.ts) — highest leverage, affects all Gemini tools
2. **Staging style briefs** (stylePacks.ts + VellumPhotoEditor + StyleControls) — most visible to users
3. **Cleanup inpainting language** (fluxService.ts) — quick win
4. **Sky anti-ghost** (sky-replace.ts) — deploy already-validated fix
5. **Whiten color science** (VellumPhotoEditor) — moderate impact
6. **Lawn realism** (VellumPhotoEditor) — moderate impact
7. **Twilight DNA** (flux-twilight.ts) — already strong, polish
8. **Sharpening pipeline** — final quality gate
