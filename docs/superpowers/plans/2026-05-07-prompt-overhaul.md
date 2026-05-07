# Prompt Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade all 6 generation tool prompts from thin/generic to competition-grade — sharper realism, invisible edits, curated style DNA, magazine-ready output.

**Architecture:** Surgical prompt rewrites to existing files. One new shared module (`src/prompts/stylePacks.ts`). Cross-cutting Photography DNA section added to the Gemini system prompt. Post-generation upscale step added for Gemini-based tools. No new services, no new state, no architecture changes.

**Tech Stack:** TypeScript, Gemini API (via existing `geminiService.ts`), Replicate (via existing API endpoints), Real-ESRGAN (via existing `upscaleService.ts`)

**Spec:** `docs/superpowers/specs/2026-05-07-prompt-overhaul-design.md`

---

### Task 1: Add Photography DNA to Gemini system prompt

This is the highest-leverage single change. It fixes carpet-smoothing and surface-regeneration across all Gemini tools (staging, whiten, lawn).

**Files:**
- Modify: `services/geminiService.ts:220-231` (after REALISM REQUIREMENTS, before FURNITURE PLACEMENT)

- [ ] **Step 1: Add the Photography DNA section**

In `services/geminiService.ts`, find this block (around line 222):

```typescript
        ========================================
        FURNITURE PLACEMENT
        ========================================
```

Insert the following NEW section immediately BEFORE the `FURNITURE PLACEMENT` header:

```typescript
        ========================================
        PHOTOGRAPHY DNA — MATCH THE INPUT IMAGE
        ========================================
        - Study the input photo's noise/grain structure, JPEG compression texture, and sensor characteristics. Your output must have the SAME grain profile. If the input is slightly grainy from a high-ISO capture, your additions must be equally grainy. If the input is clean studio lighting, your additions must be clean. Never output a smoother or sharper image than the input.
        - EXISTING SURFACES — carpet, hardwood, tile, concrete, walls, ceilings, countertops — must retain their original texture at pixel level. If the carpet has visible pile direction, fiber texture, and wear patterns, all of that must appear identically in the output. Do NOT smooth, denoise, upscale, or regenerate any existing surface. Existing surfaces are READ-ONLY pixels.
        - Color temperature and white balance of the OUTPUT must exactly match the INPUT. Do not warm, cool, or re-grade any region you are not explicitly modifying.
        - Match the input's dynamic range. If shadows are slightly crushed, keep them crushed. If highlights are slightly blown, keep them blown. Do not "improve" the photo's exposure or tonal curve.
        - Lens characteristics: match the input's depth of field, barrel/pincushion distortion, vignetting, and chromatic aberration. New furniture at the same depth as existing furniture should have the same focus level.

```

The indentation must match the surrounding sections (8 spaces).

- [ ] **Step 2: Verify build**

Run: `cd /Users/camillebrown/StudioAI && npx tsc --noEmit`
Expected: No errors (this is a string change only — no type impact).

- [ ] **Step 3: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat(prompts): add Photography DNA section to Gemini system prompt

Addresses carpet-smoothing and surface-regeneration by explicitly
requiring grain/noise/texture matching from the input photo.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Create shared style DNA module

New file with rich per-style × per-room furniture briefs, materials, palettes, and anti-patterns. Both VellumPhotoEditor and StyleControls will import from this.

**Files:**
- Create: `src/prompts/stylePacks.ts`

- [ ] **Step 1: Create the style packs module**

Create `src/prompts/stylePacks.ts` with this exact content:

```typescript
/**
 * stylePacks.ts — Shared style DNA for virtual staging prompts.
 *
 * Each style has: interior design brief, material palette, color palette,
 * arrangement anti-patterns, and per-room-type furniture specs.
 *
 * Consumed by VellumPhotoEditor (Vellum UI) and StyleControls (main staging UI).
 */

export interface StylePackRooms {
  [roomType: string]: string;
}

export interface StylePack {
  id: string;
  label: string;
  dna: string;
  materials: string;
  palette: string;
  antiPatterns: string;
  rooms: StylePackRooms;
}

const FALLBACK_ROOM = 'Living Room';

export function getFurnitureSpec(pack: StylePack, roomType: string): string {
  return pack.rooms[roomType] || pack.rooms[FALLBACK_ROOM] || '';
}

export function buildStagingAssignment(pack: StylePack, roomType: string): string {
  const furniture = getFurnitureSpec(pack, roomType);
  return `Virtually stage this ${roomType.toLowerCase()} in ${pack.label} style.

FURNITURE TO PLACE:
${furniture}

STYLE DNA:
- Materials: ${pack.materials}
- Color palette: ${pack.palette}
- Arrangement: ${pack.antiPatterns}

HARD PRESERVATION RULES:
- DO NOT modify, replace, or restyle any cabinets, vanities, built-ins, countertops, backsplashes, or millwork.
- DO NOT modify any appliances. Every appliance stays pixel-identical.
- DO NOT modify windows, doors, trim, baseboards, crown molding, flooring, floor color, wall color, or ceiling.
- DO NOT change the camera framing, crop, angle, or field of view.
- Stage based on what the image actually shows, not what the room label suggests.
- If the room is narrow or small, use fewer/smaller pieces — do NOT extend walls or rearrange architecture.`;
}

export const STYLE_PACKS: Record<string, StylePack> = {
  contemporary: {
    id: 'contemporary',
    label: 'Contemporary',
    dna: 'Low-profile silhouettes, warm neutrals, mixed materials — feels curated, not catalog.',
    materials: 'Walnut or white oak wood, bouclé upholstery, brushed brass hardware, fluted or reeded glass, natural stone (travertine, marble), matte ceramics, linen.',
    palette: 'Warm white, greige, walnut brown, soft sage, matte black accents. No primary colors. No high-saturation pieces.',
    antiPatterns: 'No matching 3-piece furniture sets. No identical throw pillows. No catalog symmetry. Arrange like a designer — intentional asymmetry, objects grouped at varied heights, one statement piece per vignette.',
    rooms: {
      'Living Room': 'Low-profile sectional or sofa in warm greige bouclé. Walnut coffee table with stone or fluted-glass top. One linen accent chair. Woven jute area rug. Matte black or brass floor lamp. Floating media console if wall space allows. One large-scale artwork or oversized mirror.',
      'Bedroom': 'Platform bed with upholstered headboard in oatmeal linen, queen or king based on room size. Walnut nightstands with ceramic table lamps. Woven or linen throw draped at foot. Upholstered bench at foot if space allows. Soft area rug under bed extending 2ft on each side.',
      'Primary Bedroom': 'Platform bed with upholstered headboard in oatmeal linen, king size. Walnut nightstands with ceramic table lamps. Woven or linen throw draped at foot. Upholstered bench at foot. Soft area rug under bed extending 2ft on each side. One large framed artwork above bed.',
      'Dining Room': 'Oval or rectangular walnut dining table. Upholstered dining chairs in cream or greige. Simple centerpiece — single stem vase or sculptural object. Pendant light or chandelier NOT added (preserve existing fixtures).',
      'Office': 'Walnut desk with clean lines. Upholstered task chair in neutral fabric (not mesh). Small bookshelf or credenza. Desktop accessories — leather tray, ceramic pencil holder. One framed print.',
      'Nursery': 'White or natural wood crib. Small dresser doubling as changing table. Upholstered glider in cream. Soft area rug. Minimal wall decor — one mobile or print.',
      'Bonus Room': 'Modular seating in neutral tones. Low media console or bookshelf. Area rug. Floor lamp. Keep flexible — do not over-furnish.',
      'Sunroom': 'Pair of linen armchairs. Small side table. Potted plant. Light area rug. Maximize the airy, light-filled feel — do not over-furnish.',
    },
  },

  'mid-century': {
    id: 'mid-century',
    label: 'Mid-Century Modern',
    dna: 'Tapered legs, organic curves, warm wood tones, disciplined color — 1950s Danish meets California modern.',
    materials: 'Walnut and teak wood with visible grain, molded plywood, genuine or faux leather in cognac/caramel, wool upholstery, brass legs and pulls, terrazzo accents.',
    palette: 'Warm walnut, cognac leather, mustard or olive accent (ONE per room), cream, warm white. Pops of teal or burnt orange in pillows or art only.',
    antiPatterns: 'No heavy overstuffed furniture. No matching wood tones everywhere — mix walnut with teak or oak. No modern/industrial mashup. Keep it warm, not cold.',
    rooms: {
      'Living Room': 'Low-slung sofa with tapered walnut legs and wool or leather cushions. Molded plywood lounge chair. Round walnut coffee table. Sunburst or atomic wall clock. Slim credenza or media console with sliding doors. Area rug in cream or geometric pattern.',
      'Bedroom': 'Walnut platform bed with slatted headboard. Tapered-leg nightstands. Ceramic or spun-metal table lamps. Wool throw in mustard or olive. Dresser with angled legs and brass pulls.',
      'Primary Bedroom': 'Walnut platform bed with slatted headboard, king size. Tapered-leg nightstands with brass pulls. Ceramic or spun-metal table lamps. Wool throw in mustard or olive. Dresser with angled legs. One statement piece of art — abstract or graphic print.',
      'Dining Room': 'Oval or round walnut table. Molded chairs (shell or Windsor style) in mixed wood or with seat pads. Pendant light NOT added. Sideboard or buffet with sliding doors.',
      'Office': 'Writing desk with tapered legs and single drawer. Leather desk chair with chrome or wood frame. Low bookcase. Globe or desk lamp in brass.',
      'Bonus Room': 'Low credenza with record player or books. Leather armchair. Woven rug. Keep sparse and intentional.',
    },
  },

  coastal: {
    id: 'coastal',
    label: 'Coastal Modern',
    dna: 'Airy and light with natural textures — beach house sophistication, not kitschy nautical.',
    materials: 'White oak or driftwood-finish wood, rattan and woven seagrass, linen and cotton slipcovers, jute, natural stone, matte white ceramics, brushed nickel.',
    palette: 'Warm white, sand, soft blue-gray, seafoam (used sparingly), natural wood tones. No navy. No coral. No seashell motifs.',
    antiPatterns: 'No anchors, starfish, shells, or nautical kitsch. No matching blue-and-white everything. This is Restoration Hardware, not Pier 1.',
    rooms: {
      'Living Room': 'Slipcovered sofa in white or sand linen. Rattan accent chair or pair. Whitewashed wood coffee table. Jute area rug. Ceramic table lamp. Woven basket for throws. One oversized coastal landscape or abstract.',
      'Bedroom': 'Upholstered bed in white linen with relaxed bedding. Rattan or whitewashed nightstands. Linen table lamps. Layered white/cream pillows with one textured accent. Light area rug. Sheer curtain panels if windows are bare.',
      'Primary Bedroom': 'Upholstered bed in white linen with relaxed bedding, king size. Rattan or whitewashed nightstands. Linen table lamps. Layered white/cream pillows with one textured accent. Light area rug. Sheer curtain panels if windows are bare. One large coastal art piece.',
      'Dining Room': 'White oak or whitewashed dining table. Woven-back dining chairs or slipcovered parsons chairs. Woven pendant NOT added. Simple greenery centerpiece.',
      'Office': 'White oak desk. Rattan or linen desk chair. Woven basket storage. Ceramic lamp. One coastal print.',
      'Nursery': 'White wood crib. Rattan changing table or dresser. Jute rug. Soft linen curtains. One simple mobile.',
    },
  },

  farmhouse: {
    id: 'farmhouse',
    label: 'Farmhouse',
    dna: 'Rustic warmth with refinement — reclaimed textures, neutral warmth, lived-in comfort.',
    materials: 'Distressed and reclaimed wood, wrought iron, antique brass, linen and cotton, natural stone, shiplap-compatible finishes, woven jute and wool.',
    palette: 'Warm cream, antique white, sage green, warm gray, aged wood browns. No stark white. No industrial gray.',
    antiPatterns: 'No brand-new-looking barn doors. No over-the-top distressing. No Live Laugh Love. Sophisticated rustic, not theme park country.',
    rooms: {
      'Living Room': 'Deep-seated sofa in cream or oatmeal linen. Reclaimed-wood coffee table. Upholstered accent chair in ticking or herringbone. Woven jute rug. Iron floor lamp or table lamp. Chunky knit throw. Wooden ladder blanket rack if wall space allows.',
      'Bedroom': 'Wood bed frame with simple headboard — paneled or plank style. White linen duvet with layered textured pillows. Distressed nightstands. Ceramic or iron table lamps. Woven rug. Simple framed botanical or landscape print.',
      'Primary Bedroom': 'Wood bed frame with paneled headboard, king size. White linen duvet with layered textured pillows. Distressed nightstands. Ceramic or iron table lamps. Woven wool rug. Wooden bench at foot. One framed botanical print.',
      'Dining Room': 'Farmhouse trestle table in aged wood. Mix of Windsor chairs and an upholstered bench. Linen table runner. Iron chandelier NOT added. Mason jar or ceramic vase with greenery.',
      'Office': 'Reclaimed-wood desk. Upholstered chair in neutral linen. Iron table lamp. Open shelving with books and baskets. One framed print.',
    },
  },

  scandinavian: {
    id: 'scandinavian',
    label: 'Scandinavian',
    dna: 'Light, functional, quietly warm — hygge without clutter.',
    materials: 'Pale birch and ash wood, wool and sheepskin, matte white ceramics, brushed steel, cotton canvas, unglazed pottery.',
    palette: 'Warm white, pale gray, birch blonde, soft black accents. One muted accent per room — blush, dusty blue, or sage. Never saturated.',
    antiPatterns: 'No heavy curtains. No ornate furniture. No dark wood. No clutter — every object earns its place. Fewer pieces, more space.',
    rooms: {
      'Living Room': 'Compact sofa in light gray or off-white with clean lines. Birch-leg armchair. Round or oval coffee table in light wood. Simple wool rug in cream or light gray. One pendant or floor lamp (not both). Single potted plant. Minimal art — one print or photograph.',
      'Bedroom': 'Simple birch bed frame. White linen bedding with one textured throw. Small birch nightstands. Simple ceramic or paper shade lamps. Sheepskin rug beside bed. No artwork or one small print.',
      'Primary Bedroom': 'Simple birch bed frame, king size. White linen bedding with one textured throw. Small birch nightstands. Simple ceramic or paper shade lamps. Sheepskin rug beside bed. One small print.',
      'Dining Room': 'Round birch table (seats 4 unless room is large). Wishbone-style or simple wood chairs. Single pendant NOT added. Glass carafe and one plant as centerpiece.',
      'Office': 'Birch desk with clean legs. Simple task chair. One shelf. Desk lamp. Nothing else.',
    },
  },

  minimalist: {
    id: 'minimalist',
    label: 'Minimalist',
    dna: 'Radical restraint — fewer pieces, more impact. Each item is a deliberate choice.',
    materials: 'Monolithic forms — solid wood slabs, cast concrete, smooth plaster, matte metals, fine-weave upholstery. No visible hardware. No ornament.',
    palette: 'White, warm gray, charcoal, natural wood (ONE tone). One accent color maximum — muted, not bright.',
    antiPatterns: 'No decorative pillows. No gallery walls. No tchotchkes. If you question whether to add something, don\'t. A minimalist room with too many things is just a messy room.',
    rooms: {
      'Living Room': 'One sofa — low, clean, monochromatic. One coffee table — sculptural form, no accessories except one object. One floor lamp. Area rug — solid color, clean edge. Nothing else unless the room is large (add one accent chair).',
      'Bedroom': 'Platform bed with no headboard or a simple upholstered panel. One nightstand per side with one lamp. No throw pillows. One simple throw at foot. No artwork or one oversized piece.',
      'Primary Bedroom': 'Platform bed with simple upholstered panel headboard, king size. One nightstand per side with one lamp. No throw pillows. One simple throw at foot. One oversized artwork or nothing.',
      'Dining Room': 'Simple table with clean legs. Matching chairs — no mix. Nothing on the table except one object.',
      'Office': 'Slab desk. One chair. One lamp. Nothing on the desk except a single object. No shelving unless the room is empty.',
    },
  },

  'urban-loft': {
    id: 'urban-loft',
    label: 'Urban Loft',
    dna: 'Industrial bones with refined comfort — exposed materials meet curated warmth.',
    materials: 'Dark leather (distressed preferred), blackened steel, reclaimed wood, concrete-toned surfaces, warm Edison-style lighting, matte black metal, weathered brass.',
    palette: 'Charcoal, warm cognac leather, aged wood browns, matte black, warm cream. Earth tones only — no bright colors.',
    antiPatterns: 'No pipe-fitting gimmicks. No exposed-brick wallpaper. The industrial feel comes from material honesty and scale, not decoration. Mix refined pieces with raw — a leather sofa against a concrete wall, not everything industrial.',
    rooms: {
      'Living Room': 'Deep leather sofa in cognac or dark brown. Reclaimed-wood and steel coffee table. Metal-frame bookshelf with curated objects. Industrial floor lamp. Vintage-style area rug. One large-format photograph or abstract art.',
      'Bedroom': 'Low platform bed with leather or upholstered headboard in dark tones. Metal-and-wood nightstands. Industrial table lamps. Dark throw. Area rug in muted tones.',
      'Primary Bedroom': 'Low platform bed with leather headboard, king size. Metal-and-wood nightstands. Industrial table lamps. Dark throw. Oversized area rug. One statement artwork.',
      'Dining Room': 'Reclaimed-wood table with metal legs. Mix of industrial chairs — some metal, some leather. Edison pendant NOT added. Minimal centerpiece.',
      'Office': 'Metal-and-wood desk. Leather task chair. Metal shelving unit. Industrial desk lamp. Minimal accessories.',
    },
  },

  'farmhouse-chic': {
    id: 'farmhouse-chic',
    label: 'Farmhouse Chic',
    dna: 'Refined farmhouse — distressed textures with polished accents, warmer and more curated than basic farmhouse.',
    materials: 'Distressed white wood, warm neutral fabrics, shiplap-compatible finishes, antique brass hardware, woven textures, natural linen, soft wool.',
    palette: 'Soft cream, antique white, sage, warm gray, antique brass. Gentle earth tones. No stark whites, no industrial grays.',
    antiPatterns: 'No mass-market farm decor. No generic "rustic" signs. Curated antique feel, not Hobby Lobby. Every piece should look like it was found, not bought in a set.',
    rooms: {
      'Living Room': 'Slipcovered sofa in cream linen. Distressed white coffee table. Upholstered accent chair in soft pattern. Woven jute rug. Brass table lamp. Woven throw blanket. One vintage-style mirror or botanical print.',
      'Bedroom': 'White wood bed with simple paneled headboard. Cream linen bedding with textured layers. Distressed white nightstands. Ceramic lamps with linen shades. Woven rug. One framed botanical.',
      'Primary Bedroom': 'White wood bed with paneled headboard, king size. Cream linen bedding with layered textures. Distressed white nightstands. Ceramic lamps. Upholstered bench at foot. Woven rug. Botanical prints.',
      'Dining Room': 'White-washed trestle table. Mix of slipcovered chairs and a rustic bench. Linen runner. Ceramic vase with greenery. Iron chandelier NOT added.',
      'Office': 'White-washed desk. Upholstered chair in cream. Woven storage baskets. Ceramic lamp. Simple botanical print.',
    },
  },

  bohemian: {
    id: 'bohemian',
    label: 'Bohemian',
    dna: 'Layered warmth, global textures, eclectic curation — curated maximalism, not chaos.',
    materials: 'Moroccan and kilim textiles, rattan and cane, macramé, terracotta, brass, reclaimed wood, handwoven baskets, natural fiber rugs.',
    palette: 'Terracotta, warm cream, dusty rose, olive, amber, rust. Layered warm tones. No cold colors. No stark white.',
    antiPatterns: 'No matchy-matchy. No new-looking Anthropologie sets. Must feel collected over time, not bought in one trip. No boho clichés — no mandala tapestries as wall art.',
    rooms: {
      'Living Room': 'Low sofa or floor seating in natural fabric. Kilim or vintage area rug (layered over jute if room is large). Rattan armchair. Reclaimed-wood coffee table. Mix of throw pillows in varied textiles. Floor plants. Macramé or woven wall hanging. Brass tray with candles.',
      'Bedroom': 'Low bed with textured headboard or fabric-draped wall. Layered bedding — linen, knit, kilim. Mix of pillows. Rattan nightstand. Terracotta or brass lamp. Plants. Woven basket storage.',
      'Primary Bedroom': 'Low bed with textured headboard, king size. Layered bedding — linen, knit, kilim. Mix of pillows in varied textiles. Rattan nightstands. Terracotta or brass lamps. Floor plants. Woven wall hanging.',
      'Dining Room': 'Reclaimed-wood table. Mix of woven and wood chairs. Kilim runner. Brass candlesticks. Potted plant centerpiece.',
      'Office': 'Reclaimed-wood desk. Rattan chair with cushion. Woven baskets for storage. Brass lamp. Plants. Layered small rugs.',
    },
  },
};

export const VELLUM_STYLE_KEYS = ['contemporary', 'mid-century', 'coastal', 'farmhouse', 'scandinavian', 'minimalist'] as const;

export const STYLE_CONTROLS_STYLE_MAP: Record<string, string> = {
  'Coastal Modern': 'coastal',
  'Urban Loft': 'urban-loft',
  'Farmhouse Chic': 'farmhouse-chic',
  'Minimalist': 'minimalist',
  'Mid-Century Modern': 'mid-century',
  'Scandinavian': 'scandinavian',
  'Bohemian': 'bohemian',
};
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/camillebrown/StudioAI && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/prompts/stylePacks.ts
git commit -m "feat(prompts): add shared style DNA module with per-room furniture briefs

8 curated styles with specific furniture pieces, materials, palettes,
and anti-patterns. Per-room-type specs for living room, bedroom,
dining room, office, nursery, etc.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Upgrade Vellum staging prompts

Replace the thin 1-line staging descriptions with the rich style DNA from the shared module.

**Files:**
- Modify: `src/vellum/VellumPhotoEditor.tsx:3` (add import)
- Modify: `src/vellum/VellumPhotoEditor.tsx:119-133` (replace staging case)

- [ ] **Step 1: Add import**

At the top of `src/vellum/VellumPhotoEditor.tsx`, after the existing imports (line 11), add:

```typescript
import { STYLE_PACKS, buildStagingAssignment } from '../../src/prompts/stylePacks';
```

Note: Check the relative path from `src/vellum/` to `src/prompts/`. Since VellumPhotoEditor is at `src/vellum/VellumPhotoEditor.tsx`, the import should be `'../prompts/stylePacks'`.

- [ ] **Step 2: Replace the staging case**

In `src/vellum/VellumPhotoEditor.tsx`, replace the entire `case 'staging':` block (lines 120-133):

OLD:
```typescript
    case 'staging': {
      const stageDesc: Record<string, string> = {
        'contemporary': 'clean lines, neutral tones, glass and metal accents, open feel',
        'mid-century': 'tapered legs, warm wood tones, organic curves, retro palette',
        'coastal': 'light blues and whites, natural textures, wicker and linen, airy feel',
        'farmhouse': 'rustic wood, neutral earth tones, shiplap accents, cozy warmth',
        'scandinavian': 'pale wood, white and gray palette, minimal accessories, soft textiles',
        'minimalist': 'very few pieces, monochromatic, negative space, sculptural forms',
      };
      const desc = stageDesc[preset] || 'modern, premium furnishings';
      const prompt = `Virtually stage this ${roomLabel.toLowerCase()} with ${preset} style furnishings (${desc}). Use premium furniture materials. Match the room's existing lighting on all new pieces. Professional real estate photography composition.`;
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      return results[0] || imageBase64;
    }
```

NEW:
```typescript
    case 'staging': {
      const pack = STYLE_PACKS[preset];
      const prompt = pack
        ? buildStagingAssignment(pack, roomLabel)
        : `Virtually stage this ${roomLabel.toLowerCase()} with ${preset} style furnishings. Use premium furniture materials. Match the room's existing lighting on all new pieces. Professional real estate photography composition.`;
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      return results[0] || imageBase64;
    }
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/camillebrown/StudioAI && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/vellum/VellumPhotoEditor.tsx
git commit -m "feat(staging): use rich style DNA briefs in Vellum staging prompts

Replaces 1-line style descriptions with per-room furniture specs,
material palettes, color guidance, and HARD PRESERVATION RULES.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Upgrade StyleControls PACK_DETAILS

Replace the moderate-detail `PACK_DETAILS` in StyleControls with the shared style DNA module. Keep the existing HARD PRESERVATION RULES — they're already working.

**Files:**
- Modify: `components/StyleControls.tsx:1` (add import)
- Modify: `components/StyleControls.tsx:225-233` (replace PACK_DETAILS)
- Modify: `components/StyleControls.tsx:257` (update usage)

- [ ] **Step 1: Add import**

At the top of `components/StyleControls.tsx`, after the existing imports (around line 25), add:

```typescript
import { STYLE_PACKS, STYLE_CONTROLS_STYLE_MAP, getFurnitureSpec } from '../src/prompts/stylePacks';
```

Note: Check relative path from `components/` to `src/prompts/`. It should be `'../src/prompts/stylePacks'`.

- [ ] **Step 2: Replace PACK_DETAILS**

Replace the `PACK_DETAILS` record (lines 225-233):

OLD:
```typescript
  const PACK_DETAILS: Record<string, string> = {
    'Coastal Modern': 'light wood tones, white and sand-colored upholstery, rattan or woven accents, linen textures, soft blue and seafoam accents only in decor items',
    'Urban Loft': 'dark leather seating, metal and reclaimed wood, concrete-toned accents, warm Edison-style lighting, muted earth tones in decor',
    'Farmhouse Chic': 'distressed white wood, warm neutral fabrics, shiplap-compatible pieces, antique brass hardware accents, soft cream and sage decor',
    'Minimalist': 'clean-lined low-profile furniture, neutral whites and warm grays, no clutter, one or two simple accent pieces maximum',
    'Mid-Century Modern': 'tapered wood legs, warm walnut tones, mustard or teal accent pillows only, organic curved shapes, clean geometry',
    'Scandinavian': 'pale birch wood, white and light gray upholstery, simple wool throws, minimal greenery, airy and uncluttered',
    'Bohemian': 'layered textiles, warm terracotta and cream tones, woven rugs, macrame or rattan accents, natural materials',
  };
```

NEW:
```typescript
  const PACK_DETAILS: Record<string, string> = Object.fromEntries(
    Object.entries(STYLE_CONTROLS_STYLE_MAP).map(([uiName, packKey]) => {
      const pack = STYLE_PACKS[packKey];
      if (!pack) return [uiName, ''];
      const furniture = getFurnitureSpec(pack, selectedRoom);
      return [uiName, `${pack.dna} Materials: ${pack.materials} Palette: ${pack.palette} Furniture: ${furniture} ${pack.antiPatterns}`];
    })
  );
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/camillebrown/StudioAI && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/StyleControls.tsx
git commit -m "feat(staging): upgrade StyleControls pack details with shared style DNA

PACK_DETAILS now pulls from the centralized stylePacks module with
per-room furniture specs instead of generic 1-line descriptions.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Add inpainting texture language to cleanup prompts

Add explicit texture-reconstruction quality standards to both interior and exterior cleanup prompts.

**Files:**
- Modify: `services/fluxService.ts:79-110` (INTERIOR_CLEANUP_PROMPT)
- Modify: `services/fluxService.ts:112-139` (EXTERIOR_CLEANUP_PROMPT)

- [ ] **Step 1: Add inpainting quality to interior cleanup**

In `services/fluxService.ts`, find the `INTERIOR_CLEANUP_PROMPT` function. The function ends with two branches — one for `fullclean` filter (line 103-104) and one for everything else (line 105-107), both ending with `This is a photo-restoration task, not a styling task.` followed by `return prompt;` on line 109.

Insert the following AFTER the if/else block and BEFORE `return prompt;`:

```typescript
  prompt += `\n\nINPAINTING QUALITY STANDARD:
- Where items are removed, reconstruct the revealed surface by sampling the EXACT texture, color, grain, and pattern from adjacent visible areas of the same surface.
- Floor reconstruction: match plank direction, grout lines, carpet pile direction, tile pattern, and wear level from surrounding visible floor. Do NOT fill with a flat averaged color.
- Wall reconstruction: match paint sheen (matte/eggshell/satin), texture (smooth/orange-peel/knockdown), and any visible color gradients from adjacent wall areas. Do NOT smooth or repaint.
- The reconstructed area should be indistinguishable from the surrounding surface — same noise, same grain, same compression artifacts.`;
```

- [ ] **Step 2: Add inpainting quality to exterior cleanup**

In the `EXTERIOR_CLEANUP_PROMPT` function, find the line that ends with `Treat this as a photo-restoration task, not a styling task.` (around line 136). Insert the following AFTER that line and BEFORE `return prompt;`:

```typescript
  prompt += `\n\nINPAINTING QUALITY STANDARD:
- Reconstruct revealed surfaces (grass, concrete, siding) by sampling the exact texture, grain, and color from adjacent visible areas.
- Grass reconstruction: match blade height, color variation, thatch density, and shadow direction from surrounding lawn.
- Concrete/driveway: match surface texture, staining, and crack patterns.
- The reconstructed area should blend seamlessly with surrounding pixels.`;
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/camillebrown/StudioAI && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add services/fluxService.ts
git commit -m "feat(cleanup): add inpainting texture quality standards to cleanup prompts

Explicit texture-reconstruction language for both interior and
exterior cleanup — floor grain, carpet pile, wall texture, and
noise matching.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Upgrade sky replacement prompt

Deploy the QA-validated anti-ghost clause plus atmospheric consistency lighting adjustments.

**Files:**
- Modify: `api/sky-replace.ts:39-42` (replace `buildSkyPrompt` function)

- [ ] **Step 1: Replace buildSkyPrompt**

In `api/sky-replace.ts`, replace the `buildSkyPrompt` function (lines 39-42):

OLD:
```typescript
function buildSkyPrompt(style: SkyStyle): string {
  const skyDesc = STYLE_SKY_DESCRIPTIONS[style];
  return `Replace ONLY the sky in this photograph with ${skyDesc}. Keep absolutely everything else pixel-identical: the house, siding, roof, windows, doors, landscaping, grass, trees, driveway, fence, mailbox, and every other non-sky element must be unchanged. Preserve the camera framing, perspective, and field of view exactly. Do not invent, add, or remove any physical object. Do not change any architectural features. Blend the new sky naturally with the existing scene — matching exposure so the house remains well-lit and visible against the new sky.`;
}
```

NEW:
```typescript
const ATMOSPHERIC_LIGHTING: Record<SkyStyle, string> = {
  blue: 'Bright neutral daylight — well-lit facades, crisp shadows.',
  dramatic: 'Moodier contrast with directional light through cloud breaks — slightly lower ambient, stronger highlights.',
  golden: 'Warm golden-hour side-lighting — warm tones on sun-facing surfaces, cool shadows.',
  overcast: 'Soft, even diffused light — minimal shadows, gentle illumination on all surfaces.',
  stormy: 'Lower ambient light, moody contrast — house still visible but under heavier cloud shadow.',
};

function buildSkyPrompt(style: SkyStyle): string {
  const skyDesc = STYLE_SKY_DESCRIPTIONS[style];
  const atmo = ATMOSPHERIC_LIGHTING[style];
  return `Replace ONLY the sky in this photograph with ${skyDesc}.

PIXEL PRESERVATION (non-sky regions):
Keep absolutely everything else pixel-identical: the house, siding, roof, windows, doors, landscaping, grass, trees, driveway, fence, mailbox, and every other non-sky element must be unchanged. Preserve the camera framing, perspective, and field of view exactly. Do not invent, add, or remove any physical object. Do not change any architectural features.

ATMOSPHERIC CONSISTENCY:
Adjust the ambient light on the house and ground to naturally match the new sky. ${atmo}
The house should look naturally photographed under this sky, not composited.

CRITICAL — NO GHOST ROOFLINE / NO DUPLICATED STRUCTURE:
- The sky region above the roof must contain ONLY sky and clouds. Nothing else.
- Do NOT draw, echo, duplicate, or silhouette the roofline, chimney, or house shape anywhere in the sky.
- Do NOT create cloud formations that mirror or follow the roofline contour.
- If a faint outline of the house appears in the sky, erase it — only sky and clouds should exist above the real roof edge.

Blend the new sky naturally at the roofline edge — soft, clean transition with no haloing or hard compositing line.`;
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/camillebrown/StudioAI && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/sky-replace.ts
git commit -m "feat(sky): add anti-ghost clause and atmospheric consistency to sky prompts

Deploys the QA-validated ghost-roofline fix plus per-style
atmospheric lighting adjustments.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Upgrade whiten prompts with color science

Replace thin white-balance descriptions with technical color science specs.

**Files:**
- Modify: `src/vellum/VellumPhotoEditor.tsx:142-152` (replace whiten case)

- [ ] **Step 1: Replace the whiten case**

In `src/vellum/VellumPhotoEditor.tsx`, replace the entire `case 'whiten':` block (lines 142-152):

OLD:
```typescript
    case 'whiten': {
      const whitenDesc: Record<string, string> = {
        'bright & airy': 'bright, high-key exposure with cool-neutral tones, maximized natural light, clean whites',
        'warm editorial': 'warm golden tones, soft editorial lighting, rich but natural warmth',
        'neutral': 'perfectly neutral white balance, no color cast, true-to-life colors, balanced exposure',
      };
      const desc = whitenDesc[preset] || 'even exposure, natural daylight';
      const prompt = `Correct white balance and lighting on this ${roomLabel.toLowerCase()} photo. Target look: ${desc}. Keep all furniture and architecture exactly as-is.`;
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      return results[0] || imageBase64;
    }
```

NEW:
```typescript
    case 'whiten': {
      const whitenSpecs: Record<string, string> = {
        'bright & airy': `TARGET: Bright, high-key real estate photography.
- Color temperature: 5500K neutral to slightly cool (5800K max).
- Exposure: lift +0.3 to +0.5 EV from current level. Aim for bright without blowout — highlights should clip at 250/255 max, not 255/255.
- Shadows: open to 20-30% — detail visible in every corner and under furniture. No crushed blacks.
- Whites: clean and bright without blue or yellow cast. White walls should read as true white, not warm cream or cool blue.
- Saturation: natural — do not boost. Wood tones and fabric colors should remain accurate to life.`,
        'warm editorial': `TARGET: Warm, editorial interior photography — Architectural Digest feel.
- Color temperature: 4200-4500K warm. Golden window light enhanced but not orange. Think "late afternoon sun through a west window."
- Exposure: +0.2 to +0.3 EV — slightly lifted but not high-key. Rich midtones are more important than bright highlights.
- Shadows: warm and soft, 15-25% density. Shadow areas should feel inviting, not dark.
- Whites: warm cream, not stark white. Warm but not yellow.
- Saturation: natural with very slight warmth boost in wood tones and fabrics. Do not oversaturate.`,
        'neutral': `TARGET: Perfectly neutral white balance — WYSIWYG accuracy.
- Color temperature: 5000K daylight neutral. Zero color cast of any kind.
- Exposure: match metered value — 0 EV correction. If the photo is slightly dark, keep it slightly dark. If bright, keep bright.
- Whites: true neutral white. Use a white wall or ceiling as reference — it should appear as pure white with no warmth or coolness.
- Saturation: accurate to life. No enhancement, no reduction.
- This is a correction, not a look. The goal is "what your eyes saw when standing in the room."`,
      };
      const spec = whitenSpecs[preset] || whitenSpecs['neutral'];
      const prompt = `PHOTO EDITING TASK — WHITE BALANCE AND EXPOSURE CORRECTION ONLY.

${spec}

PRESERVE EXACTLY (pixel-identical):
- All furniture, objects, decor, and architecture — geometry unchanged.
- All surface textures: carpet pile, wood grain, tile grout, fabric weave, wall texture. Do NOT smooth or denoise any surface.
- Camera framing, perspective, lens distortion, depth of field.
- All objects in the scene — do not add, remove, or reposition anything.

DO NOT:
- Smooth, denoise, sharpen, or HDR-process any surface.
- Add or remove any object, shadow, reflection, or highlight.
- Change the color of any object — only ambient light temperature changes.
- Apply any tonal curve, LUT, or color grade beyond the specified target.
- Make the photo "better" in any way not specified. This is a surgical white balance correction, not a retouch.`;
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      return results[0] || imageBase64;
    }
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/camillebrown/StudioAI && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/vellum/VellumPhotoEditor.tsx
git commit -m "feat(whiten): replace thin descriptions with color science specs

Technical Kelvin targets, exposure curves, shadow handling, and
strict preservation rules for each whiten preset.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Upgrade lawn prompts with grass realism spec

Replace the thin lawn descriptions with detailed grass texture and landscaping specs.

**Files:**
- Modify: `src/vellum/VellumPhotoEditor.tsx:163-173` (replace lawn case)

- [ ] **Step 1: Replace the lawn case**

In `src/vellum/VellumPhotoEditor.tsx`, replace the entire `case 'lawn':` block (lines 163-173):

OLD:
```typescript
    case 'lawn': {
      const lawnDesc: Record<string, string> = {
        'manicured': 'perfectly manicured, uniformly green, freshly mowed with clean edges and defined borders',
        'natural': 'natural and lush with organic variation, mixed grass heights, a lived-in but healthy yard',
        'drought-resistant': 'drought-tolerant xeriscaping with native plants, decorative gravel, mulch beds, and sparse drought-resistant ground cover',
      };
      const desc = lawnDesc[preset] || 'lush, green, and manicured';
      const prompt = `Enhance the lawn and landscaping of this exterior photo. Target look: ${desc}. Keep the house, driveway, sky, and all architecture exactly unchanged.`;
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      return results[0] || imageBase64;
    }
```

NEW:
```typescript
    case 'lawn': {
      const lawnSpecs: Record<string, string> = {
        'manicured': `TARGET: Professionally maintained residential lawn — the "just mowed for the listing shoot" look.
- Grass color: rich, consistent green with natural micro-variation — NOT flat neon green. Real grass has 3-4 shades from light yellow-green (sun exposed) to deep green (shaded). Include this variation.
- Grass texture: visible individual blade definition at close range. Slight height variation (0.5-1 inch). Natural thatch layer at base visible in foreground. Blade direction consistent with a mow pattern.
- Edges: crisp, clean borders where grass meets concrete, mulch, or garden beds. Natural feathering — not a hard pixel line.
- Shadows: micro-shadows between blades matching the scene's sun angle and direction. Shadow density consistent with the rest of the photo.
- Bare spots or brown patches: fill with matching green grass at the same texture density as surrounding areas.`,
        'natural': `TARGET: Healthy, lived-in lawn — lush and organic, not manicured.
- Grass color: multi-tonal green with natural variation. Some areas slightly longer, some slightly shorter. Clover or ground cover patches acceptable.
- Grass texture: mixed heights (1-3 inches), natural growth patterns, some seed heads in taller areas. Organic and realistic, not uniform.
- Edges: soft, natural borders. Grass creeping slightly over concrete or mulch edges is fine — this is a natural yard.
- Keep existing weeds that aren't distracting. Remove only obvious dead patches or bare dirt.`,
        'drought-resistant': `TARGET: Drought-tolerant xeriscaping — intentionally sparse, landscaped.
- Replace bare/dead lawn areas with: decorative gravel or decomposed granite, mulch beds with drought-resistant plants (succulents, agave, lavender, rosemary, ornamental grasses), and sparse drought-resistant ground cover.
- Keep existing trees, large shrubs, and hardscape exactly as-is.
- Natural, intentional spacing between plants. Not overgrown, not barren.
- Gravel/stone should have natural color variation and shadow detail.`,
      };
      const spec = lawnSpecs[preset] || lawnSpecs['manicured'];
      const prompt = `LANDSCAPING ENHANCEMENT — EXTERIOR PHOTO EDIT.

${spec}

PHOTOGRAPHY DNA:
- The enhanced lawn/landscaping must have the SAME photographic noise, grain, and compression texture as the rest of the image. If the photo is grainy, the grass is grainy. If clean, the grass is clean.
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

- [ ] **Step 2: Verify build**

Run: `cd /Users/camillebrown/StudioAI && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/vellum/VellumPhotoEditor.tsx
git commit -m "feat(lawn): add grass realism specs with blade-level texture guidance

Detailed specs for manicured, natural, and drought-resistant presets
including texture, shadow, edge blending, and photography DNA matching.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Add Photography DNA to twilight prompts

Add a photography DNA paragraph to the already-strong twilight prompt.

**Files:**
- Modify: `api/flux-twilight.ts:64-101` (insert section before final paragraph)

- [ ] **Step 1: Add Photography DNA section**

In `api/flux-twilight.ts`, in the `buildTwilightPrompt` function, find this line (around line 99):

```typescript
- Only change: sky (to the target atmosphere), exterior ambient light level, interior window glow, and reflections that follow naturally from the new lighting.
```

Insert the following AFTER that line and BEFORE the final paragraph (`Output the same photograph...`):

```typescript

PHOTOGRAPHY DNA — MATCH THE INPUT:
- Preserve the input photo's noise/grain structure. Do not smooth or denoise.
- The output should look like the same camera captured the scene at a different time of day — same sensor characteristics, same lens, same focal length.
- If the input has JPEG compression artifacts, the output should have similar compression texture. Do not "clean up" the photo.
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/camillebrown/StudioAI && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/flux-twilight.ts
git commit -m "feat(twilight): add photography DNA matching to twilight prompts

Ensures output matches input photo's grain, noise, and compression
characteristics for invisible edits.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Add upscale/sharpen step for Gemini tools

Staging, whiten, and lawn go through Gemini with no post-sharpening. Cleanup, twilight, and sky all have upscaling. Add an upscale step for Gemini outputs to match sharpness.

**Files:**
- Modify: `src/vellum/VellumPhotoEditor.tsx:119-173` (add upscale after each Gemini tool)

- [ ] **Step 1: Add upscale to staging result**

In `src/vellum/VellumPhotoEditor.tsx`, in the `case 'staging':` block, replace the return line:

OLD:
```typescript
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      return results[0] || imageBase64;
```

NEW:
```typescript
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      const staged = results[0] || imageBase64;
      try {
        const up = await upscaleImage(staged, false, signal);
        return up.resultBase64;
      } catch { return staged; }
```

- [ ] **Step 2: Add upscale to whiten result**

In the `case 'whiten':` block, replace the return line:

OLD:
```typescript
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      return results[0] || imageBase64;
```

NEW:
```typescript
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      const whitened = results[0] || imageBase64;
      try {
        const up = await upscaleImage(whitened, false, signal);
        return up.resultBase64;
      } catch { return whitened; }
```

- [ ] **Step 3: Add upscale to lawn result**

In the `case 'lawn':` block, replace the return line:

OLD:
```typescript
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      return results[0] || imageBase64;
```

NEW:
```typescript
      const results = await generateRoomDesign(imageBase64, prompt, undefined, false, 1, true, undefined, signal);
      const enhanced = results[0] || imageBase64;
      try {
        const up = await upscaleImage(enhanced, true, signal);
        return up.resultBase64;
      } catch { return enhanced; }
```

Note: lawn passes `isExterior: true` since it's always an exterior tool. Staging and whiten pass `false`.

- [ ] **Step 4: Verify build**

Run: `cd /Users/camillebrown/StudioAI && npx tsc --noEmit`
Expected: No errors. The `upscaleImage` import already exists at line 7.

- [ ] **Step 5: Commit**

```bash
git add src/vellum/VellumPhotoEditor.tsx
git commit -m "feat(sharpness): add Real-ESRGAN upscale step for Gemini tool outputs

Staging, whiten, and lawn now upscale through the same pipeline as
cleanup/twilight/sky for sharpness parity on export.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 11: Final build verification

Run a full build to catch any issues across all changes.

**Files:**
- None (verification only)

- [ ] **Step 1: TypeScript check**

Run: `cd /Users/camillebrown/StudioAI && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Vite build**

Run: `cd /Users/camillebrown/StudioAI && npm run build`
Expected: Build succeeds. Watch for import resolution errors — the relative paths between `src/vellum/`, `components/`, and `src/prompts/` are the most likely issue.

- [ ] **Step 3: Fix any import path issues**

If build fails on import resolution, check:
- `src/vellum/VellumPhotoEditor.tsx` → `'../prompts/stylePacks'` (relative from `src/vellum/`)
- `components/StyleControls.tsx` → `'../src/prompts/stylePacks'` (relative from `components/`)

Adjust paths if needed and re-run build.

- [ ] **Step 4: Review all changes**

Run: `git diff main --stat`
Expected output should show ~8 files changed:
- `services/geminiService.ts` (Photography DNA section)
- `src/prompts/stylePacks.ts` (new file)
- `src/vellum/VellumPhotoEditor.tsx` (staging, whiten, lawn, upscale)
- `components/StyleControls.tsx` (PACK_DETAILS upgrade)
- `services/fluxService.ts` (cleanup inpainting quality)
- `api/sky-replace.ts` (anti-ghost + atmospheric)
- `api/flux-twilight.ts` (photography DNA)
