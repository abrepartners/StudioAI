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
const NON_STAGEABLE = new Set(['Patio', 'Pool', 'Backyard', 'Front Yard', 'Garage']);

export function getFurnitureSpec(pack: StylePack, roomType: string): string {
  if (NON_STAGEABLE.has(roomType)) return '';
  return pack.rooms[roomType] || pack.rooms[FALLBACK_ROOM] || '';
}

export function buildStagingAssignment(pack: StylePack, roomType: string): string {
  const furniture = getFurnitureSpec(pack, roomType);

  const furnitureBlock = furniture
    ? `\nFURNITURE TO PLACE:\n${furniture}\n`
    : `\nThis is an outdoor/utility space — add only appropriate outdoor furniture and decor for the style. No indoor furniture.\n`;

  return `Virtually stage this ${roomType.toLowerCase()} in ${pack.label} style.
${furnitureBlock}
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

export const VELLUM_STYLE_KEYS = ['contemporary', 'mid-century', 'coastal', 'farmhouse', 'scandinavian', 'minimalist', 'urban-loft', 'bohemian'] as const;

export const STYLE_CONTROLS_STYLE_MAP: Record<string, string> = {
  'Coastal Modern': 'coastal',
  'Urban Loft': 'urban-loft',
  'Farmhouse Chic': 'farmhouse-chic',
  'Minimalist': 'minimalist',
  'Mid-Century Modern': 'mid-century',
  'Scandinavian': 'scandinavian',
  'Bohemian': 'bohemian',
};
