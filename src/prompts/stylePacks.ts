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
// 'Exterior' kept for backwards compat with photos labeled before May 2026.
const NON_STAGEABLE = new Set(['Exterior', 'Patio', 'Pool', 'Backyard', 'Front Yard', 'Garage']);

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
- If the room is narrow or small, use fewer/smaller pieces — do NOT extend walls or rearrange architecture.

PHOTOGRAPHY DNA — MATCH THE INPUT:
- Staged furniture must exhibit the same photographic noise, grain, and compression as the original photo. Phone snap with noise = furniture has noise. Clean DSLR = furniture is clean.
- Shadows on placed furniture must match the scene's existing light direction, angle, and softness.
- Color temperature of new items must match the room's ambient lighting exactly.`;
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
      'Living Room': 'Low-profile sectional or sofa in warm greige bouclé with 3 mixed-texture throw pillows (linen, wool, leather) and a casually draped throw over one arm. Walnut coffee table with stone or fluted-glass top — styled with a stack of 2-3 oversized books, a ceramic sculptural object, and a small tray with a candle. One linen accent chair angled toward the sofa forming a conversation grouping. Woven jute area rug anchoring the seating group. Matte black or brass arc floor lamp behind the accent chair. Floating walnut media console along the main wall — styled with 2-3 objects at varied heights (ceramic vase with dried branches, small sculpture, books). One large-scale abstract artwork or oversized leaning mirror on the focal wall. Tall potted fiddle-leaf fig or olive tree in a matte black planter in one corner. Small walnut side table between sofa and chair with a ceramic table lamp.',
      'Bedroom': 'Platform bed with upholstered headboard in oatmeal linen, queen or king based on room size. Layered bedding: white linen duvet, a textured waffle-knit throw folded at the foot, and 5 pillows (2 euro shams, 2 sleeping pillows, 1 lumbar in a contrasting fabric). Walnut nightstands with ceramic table lamps — one nightstand styled with a small plant and book, the other with a ceramic tray and candle. Upholstered bench at foot of bed in bouclé with a folded throw on it. Soft wool area rug under bed extending 2ft on each side. Full-length brass-frame mirror leaning against one wall. Small potted plant on the dresser. One pair of framed botanical or abstract prints above the nightstands.',
      'Primary Bedroom': 'Platform bed with upholstered headboard in oatmeal linen, king size. Layered bedding: white linen duvet, a textured cashmere throw draped diagonally at the foot, and 6 pillows (2 euro shams in sage, 2 sleeping pillows, 2 accent pillows in mixed textures). Walnut nightstands each with a ceramic table lamp — asymmetrically styled (one with a small plant and book, the other with a tray, candle, and reading glasses). Upholstered bench at foot of bed in bouclé. Linen accent chair in the corner with a throw pillow and a small walnut side table with a book and plant. Soft wool area rug under bed. Walnut dresser styled with a ceramic vase of dried eucalyptus, a tray with perfume/small objects, and one framed photo. One large-scale framed artwork above the bed — abstract or muted landscape. Full-length brass-frame mirror leaning in the corner.',
      'Dining Room': 'Oval or rectangular walnut dining table set for an informal dinner — linen placemats at each seat, ceramic plates, linen napkins, and simple glassware. Upholstered dining chairs in cream or greige — 2 host chairs in a slightly different style (taller back or different fabric) at the ends. Walnut sideboard or buffet along the side wall — styled with a ceramic vase of fresh branches, a stack of books, a pair of brass candlesticks, and a sculptural bowl. One large piece of artwork or a round mirror above the sideboard. Woven jute runner under the table. Pendant light or chandelier NOT added (preserve existing fixtures). Table centerpiece: low ceramic bowl with greenery or a cluster of 3 pillar candles on a brass tray.',
      'Office': 'Walnut desk with clean lines positioned facing the room (not against the wall if space allows). Upholstered task chair in neutral bouclé (not mesh). Desktop styled: leather desk pad, brass pencil cup, ceramic tray with small items, one small potted succulent, and a stack of 2 books. Walnut bookshelf or open credenza behind or beside the desk — styled with books (some vertical, some horizontal), a ceramic vase, a small framed print, brass bookends, and one decorative object. Linen accent chair in the corner with a throw pillow and a small side table for a reading nook. Brass or matte black desk lamp. Woven rug under the desk area. One gallery-style arrangement of 2-3 framed prints on the wall.',
      'Nursery': 'White or natural wood crib with layered bedding — a fitted sheet, light knit blanket, and small stuffed animal. Walnut dresser doubling as changing table with a ceramic lamp, small plant, and storage basket on top. Upholstered glider in cream bouclé with a lumbar pillow and soft throw draped over the arm. Small walnut side table next to the glider with a book and candle. Soft wool area rug. Woven storage baskets along one wall. One set of 2-3 simple framed prints arranged on the wall — animals or abstract shapes in muted tones. Wooden mobile above the crib.',
      'Bonus Room': 'Modular sectional seating in warm neutral tones with mixed throw pillows. Low walnut media console styled with books, a plant, and decorative objects at varied heights. Large woven area rug anchoring the space. Floor lamp beside the seating. Pair of poufs or ottomans for flexible seating. Small bookshelf styled with books, baskets, and 2-3 decorative items. One large piece of artwork on the focal wall.',
      'Sunroom': 'Pair of linen armchairs with throw pillows angled toward each other. Round walnut side table between them styled with a ceramic vase, candle, and small book. Tall potted plant (bird of paradise or monstera) in a woven basket planter. Light woven area rug. Low bench or ottoman along one wall with a folded throw and a tray of books. 2-3 smaller potted plants on a plant stand at varied heights near the windows.',
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
      'Living Room': 'Low-slung sofa with tapered walnut legs and wool cushions in warm cream — 3 accent pillows (one mustard, one olive, one cream textured). Molded plywood lounge chair with leather cushion angled beside the sofa. Round walnut coffee table — styled with a ceramic ashtray-style catchall, a stack of vintage design books, and a small brass sculpture. Teak side table between sofa and chair with a spun-metal table lamp and small plant. Slim walnut credenza with sliding doors along the focal wall — styled with a record player at one end, a ceramic vase with dried pampas, brass figurine, and horizontally stacked books. Sunburst or atomic wall clock above the credenza. Geometric-pattern area rug in cream and warm tones. Tall rubber plant or snake plant in a brass or ceramic planter in the corner. One large abstract or graphic print on the wall.',
      'Bedroom': 'Walnut platform bed with slatted headboard. Layered bedding: cream linen duvet, a wool throw in mustard folded at the foot, 4 pillows (2 sleeping, 1 olive accent, 1 cream textured). Tapered-leg nightstands in mixed wood (one walnut, one teak) — one with a ceramic table lamp and small book, the other with a spun-metal lamp and ceramic tray. Dresser with angled legs and brass pulls — styled with a round mirror propped against the wall, a ceramic vase, and a small tray with objects. Woven rug under the bed. One pair of framed vintage graphic prints flanking the bed above the nightstands. Small potted plant on the dresser.',
      'Primary Bedroom': 'Walnut platform bed with slatted headboard, king size. Layered bedding: cream linen duvet, olive wool throw draped diagonally, 5 pillows (2 euro shams in cream, 2 sleeping, 1 lumbar in cognac leather). Tapered-leg nightstands with brass pulls — asymmetrically styled (ceramic lamp + book + plant on one, spun-metal lamp + ceramic tray + candle on the other). Dresser with angled legs styled with a round brass-frame mirror, ceramic vase with dried branches, and a small brass tray. Molded plywood accent chair in the corner with a throw pillow and a small teak side table with a book. Woven geometric rug under the bed. One large statement artwork — abstract or graphic print — above the bed. Tall plant in a mid-century ceramic planter.',
      'Dining Room': 'Oval or round walnut table set casually — linen placemats, simple ceramic plates, and a pair of taper candles in brass holders at center. Molded shell chairs in mixed finishes (2 in walnut, 2 in white or black) with leather seat pads. Walnut sideboard with sliding doors along the wall — styled with a ceramic bowl, pair of brass candlesticks, stack of cookbooks, and a potted trailing plant. One large abstract print or vintage poster above the sideboard. Pendant light NOT added (preserve existing fixtures). Geometric runner or rug under the table.',
      'Office': 'Writing desk with tapered legs and single drawer — desktop styled with a leather desk blotter, brass desk lamp, ceramic pencil cup, small potted succulent, and a single open book. Leather desk chair with chrome or wood frame. Low walnut bookcase behind the desk — styled with books (mix of vertical and horizontal), a brass bookend, ceramic object, small framed photo, and a trailing potted plant. Woven rug under the desk area. One gallery grouping of 2-3 vintage graphic prints on the wall. Small teak tray on the bookcase with a carafe and glass.',
      'Bonus Room': 'Low walnut credenza with sliding doors — styled with a record player, vinyl records displayed, a ceramic vase, and brass figurine. Cognac leather armchair with a wool throw pillow. Teak side table with a spun-metal lamp and book. Woven geometric rug. Small bookshelf with curated objects. One large graphic print on the wall.',
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
      'Living Room': 'Slipcovered sofa in white or sand linen with 4 mixed throw pillows (linen, cotton, one soft blue-gray accent) and a lightweight throw casually draped over one arm. Pair of rattan accent chairs angled toward the sofa with linen seat cushions. Whitewashed wood coffee table — styled with a stack of large coffee table books, a ceramic bowl with dried sea fans or coral-like sculptural object, and a woven tray with a candle. Jute area rug layered over a larger sisal rug. White ceramic table lamp on a rattan side table between the chairs. Tall driftwood-finish console table behind the sofa — styled with a large ceramic vase of dried branches, a pair of woven baskets underneath, and one framed coastal landscape. Large woven basket beside the sofa holding rolled throws. One oversized abstract or coastal landscape art piece on the focal wall. Tall fiddle leaf fig or bird of paradise in a woven basket planter in the corner.',
      'Bedroom': 'Upholstered bed in white linen with relaxed layered bedding: crisp white duvet, a sand-colored lightweight throw at the foot, 5 pillows (2 euro shams in soft blue-gray, 2 sleeping pillows, 1 lumbar in woven texture). Rattan nightstands — one styled with a linen-shade ceramic lamp, small succulent, and book; the other with a matching lamp and a ceramic catchall tray. Light jute area rug under the bed. White oak bench at foot with a folded linen throw and woven basket underneath. Rattan-frame full-length mirror leaning against one wall. One pair of simple framed coastal photographs or abstracts above the nightstands. Small potted plant on the dresser.',
      'Primary Bedroom': 'Upholstered bed in white linen, king size, with luxe layered bedding: white linen duvet, sand cashmere throw draped at the foot, 6 pillows (2 euro shams in natural linen, 2 sleeping, 1 lumbar in soft blue-gray, 1 accent in woven texture). Rattan nightstands — asymmetrically styled (lamp + plant + book stack on one, lamp + ceramic tray + candle on the other). Slipcovered linen accent chair in the corner with a throw pillow and a small white oak side table with a stack of books and a ceramic vase. White oak dresser styled with a round mirror, a large ceramic vase with dried palm leaves, and a woven tray with small objects. Jute area rug under the bed. One large-scale coastal art piece above the bed — abstract ocean or landscape. Tall tropical plant in a woven basket planter. Woven pendant NOT added.',
      'Dining Room': 'White oak dining table set with woven placemats, simple white ceramic dishes, linen napkins, and clear glassware. Woven-back dining chairs with linen seat cushions — mix in 2 slipcovered parsons chairs at the heads. White oak sideboard along one wall — styled with a large ceramic vase of dried branches, a stack of cookbooks, woven baskets, and a pair of white ceramic candlesticks. Round woven mirror or one large coastal photograph above the sideboard. Woven jute runner under the table. Table centerpiece: low ceramic bowl with trailing greenery or a cluster of pillar candles on a driftwood tray. Woven pendant NOT added (preserve existing fixtures).',
      'Office': 'White oak desk with clean lines — desktop styled with a woven desk tray, ceramic pencil cup, small potted plant, a stack of 2 books, and a brushed nickel desk lamp. Rattan desk chair with linen cushion. White oak bookshelf — styled with books, woven baskets for storage, a ceramic vase, small framed photo, and a trailing potted plant. Jute rug under the desk area. One pair of framed coastal prints on the wall. Woven basket beside the desk for files.',
      'Nursery': 'White wood crib with simple layered bedding and a small stuffed animal. Rattan changing table or dresser — styled with a ceramic lamp, small plant, and woven storage baskets. Rattan glider with linen cushion and a throw pillow. Small white oak side table with a book and candle. Jute rug. Woven mobile above the crib. 2-3 simple framed prints on the wall in soft coastal tones — sea life or abstract shapes.',
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
      'Living Room': 'Deep-seated sofa in cream or oatmeal linen with 4 mixed throw pillows (ticking stripe, herringbone, chunky knit, linen) and a chunky knit throw draped over one arm. Upholstered accent chair in herringbone fabric angled beside the sofa. Reclaimed-wood coffee table — styled with a stack of vintage books, an antique brass candlestick, a small ceramic bowl, and a potted herb or greenery in a stoneware pot. Woven jute area rug. Iron floor lamp with a linen shade beside the accent chair. Wooden ladder blanket rack against one wall with 2-3 folded throws draped over the rungs. Reclaimed-wood console table behind the sofa — styled with a large ceramic crock filled with dried wheat or eucalyptus, a pair of antique brass candlesticks, and a woven basket underneath. One oversized framed botanical or landscape print on the focal wall. Tall potted plant (olive tree or fern) in a stoneware planter. Small distressed-wood side table between sofa and chair with a ceramic table lamp and small plant.',
      'Bedroom': 'Wood bed frame with paneled headboard. Layered bedding: white linen duvet, a sage green knit throw folded at the foot, 5 pillows (2 euro shams in cream, 2 sleeping pillows, 1 lumbar in ticking stripe). Distressed nightstands — one styled with a ceramic table lamp and small plant, the other with an iron lamp and a stack of vintage books. Woven wool rug under the bed. Wooden bench at foot of bed with a folded quilt and woven basket underneath. Distressed dresser styled with a round mirror propped against the wall, a ceramic crock with dried flowers, and a small tray with candle. One pair of framed botanical prints flanking the bed. Small potted plant on the windowsill.',
      'Primary Bedroom': 'Wood bed frame with paneled headboard, king size. Luxe layered bedding: white linen duvet, sage green wool throw draped diagonally, 6 pillows (2 euro shams in oatmeal linen, 2 sleeping, 1 lumbar in herringbone, 1 accent in chunky knit). Distressed nightstands — asymmetrically styled (ceramic lamp + plant + book stack on one, iron lamp + ceramic tray + candle on the other). Upholstered accent chair in the corner in cream linen with a throw pillow and a small reclaimed-wood side table with a book and plant. Wooden bench at foot of bed with a folded quilt. Woven wool area rug under the bed. Distressed dresser styled with a round antique mirror, a large ceramic crock with dried eucalyptus, and an antique brass tray with small objects. One large framed botanical print above the bed. Tall potted fern in a woven basket planter.',
      'Dining Room': 'Farmhouse trestle table in aged wood set for a casual dinner — linen placemats, ceramic plates in cream, linen napkins, and vintage-style glassware. Mix of Windsor chairs and an upholstered bench with a linen cushion on one side. Linen table runner down the center with a cluster of 3 pillar candles in varied heights and a small ceramic bowl of greenery. Reclaimed-wood sideboard along one wall — styled with a large stoneware crock of dried wheat, a stack of vintage cookbooks, a pair of iron candlesticks, and woven baskets underneath. One oversized framed landscape or botanical print above the sideboard. Iron chandelier NOT added (preserve existing fixtures). Woven jute runner under the table.',
      'Office': 'Reclaimed-wood desk — desktop styled with a leather desk pad, iron table lamp, ceramic pencil crock, small potted herb, and a stack of vintage books. Upholstered task chair in neutral linen. Open shelving or reclaimed-wood bookcase — styled with books (mix of vertical and horizontal), woven baskets, a ceramic vase, antique brass object, and a small framed botanical. Woven jute rug under the desk. Linen accent chair in the corner with a throw pillow and a small side table with a candle. One pair of framed prints — botanical or vintage — on the wall.',
    },
  },

  scandinavian: {
    id: 'scandinavian',
    label: 'Scandinavian',
    dna: 'Light, functional, quietly warm — hygge without clutter.',
    materials: 'Pale birch and ash wood, wool and sheepskin, matte white ceramics, brushed steel, cotton canvas, unglazed pottery.',
    palette: 'Warm white, pale gray, birch blonde, soft black accents. One muted accent per room — blush, dusty blue, or sage. Never saturated.',
    antiPatterns: 'No heavy curtains. No ornate furniture. No dark wood. No clutter — every object earns its place. Fewer pieces, more space, but each piece is thoughtfully styled.',
    rooms: {
      'Living Room': 'Compact sofa in light gray or off-white with clean lines — 3 pillows (one wool, one cotton, one in a muted accent like dusty blue or blush). Wool throw casually draped over one arm. Birch-leg armchair with a sheepskin draped over the back. Round or oval birch coffee table — styled with one ceramic vase with a single branch, one small unglazed pottery bowl, and one design book. Simple wool area rug in cream or light gray. Slim birch floor lamp with a paper shade beside the armchair. Small birch side table with a ceramic cup and a candle. One tall potted plant (monstera or rubber plant) in a simple white ceramic planter. One framed black-and-white photograph or line-art print on the wall — minimal frame. Low birch shelf or media console — styled with a trailing plant, 2-3 books, and one ceramic object.',
      'Bedroom': 'Simple birch bed frame. Layered bedding: white linen duvet, a soft gray wool throw folded at the foot, 4 pillows (2 sleeping in white, 1 accent in pale gray, 1 small in dusty blush or blue). Small birch nightstands — one with a ceramic lamp with a paper shade and a small plant, the other with a candle in an unglazed holder and a book. Sheepskin rug draped beside the bed. Birch dresser with a small ceramic vase holding one stem and a simple tray. One small framed print — line drawing or photograph. Small potted plant on the windowsill.',
      'Primary Bedroom': 'Simple birch bed frame, king size. Layered bedding: white linen duvet, a textured oatmeal throw at the foot, 5 pillows (2 euro shams in pale gray, 2 sleeping in white, 1 accent in dusty blush). Small birch nightstands — asymmetrically styled (ceramic paper-shade lamp + small plant on one, candle + book + ceramic tray on the other). Birch bench at foot of bed with a folded wool blanket. Sheepskin rug beside the bed. Birch armchair in the corner with a sheepskin throw and a small side table with a book. One large black-and-white photograph or minimal print above the bed. Birch dresser styled with one ceramic vase, one candle, and a small tray. Tall potted plant in a white planter.',
      'Dining Room': 'Round birch table (seats 4 unless room is large) set simply — ceramic plates in warm white, linen napkins, and clear glass tumblers. Wishbone-style chairs in birch. Table centerpiece: a glass carafe with water and lemon, one small potted plant, and a single taper candle in a ceramic holder. Birch sideboard or low shelf along one wall — styled with a ceramic vase, stack of 2-3 books, a trailing plant, and one simple bowl. One framed print above the sideboard. Pendant NOT added (preserve existing fixtures). Light wool runner under the table.',
      'Office': 'Birch desk with clean legs — desktop styled with a ceramic desk lamp, one small potted plant, a ceramic pencil cup, and one open notebook or book. Simple birch task chair with a sheepskin draped over the back. Birch shelf on the wall above or beside the desk — styled with 4-5 books (some vertical, one horizontal), a small ceramic vase, and one framed photo. Light wool rug under the desk. One framed line-drawing print on the wall.',
    },
  },

  minimalist: {
    id: 'minimalist',
    label: 'Minimalist',
    dna: 'Radical restraint — fewer pieces, more impact. Each item is a deliberate choice.',
    materials: 'Monolithic forms — solid wood slabs, cast concrete, smooth plaster, matte metals, fine-weave upholstery. No visible hardware. No ornament.',
    palette: 'White, warm gray, charcoal, natural wood (ONE tone). One accent color maximum — muted, not bright.',
    antiPatterns: 'No decorative pillows beyond what is specified. No gallery walls. No tchotchkes. Every single object is intentional and sculptural. A minimalist room is curated, not bare — each piece has visual weight and purpose.',
    rooms: {
      'Living Room': 'One low-profile sofa in warm gray or off-white with clean monolithic form — 2 pillows maximum in the same tone. One sculptural coffee table (cast concrete, solid wood slab, or smooth stone) — styled with one single sculptural object (ceramic vessel or stone orb). One accent chair with architectural lines if the room is large. One arc floor lamp in matte black or brushed nickel. Solid-color area rug with clean edges in warm gray or cream. One oversized piece of artwork on the focal wall — abstract, minimal, or monochromatic. One tall sculptural floor plant (single-stem bird of paradise or architectural succulent) in a matte planter. No side tables unless the room demands it — if used, one only, with nothing on it.',
      'Bedroom': 'Platform bed with no headboard or a simple upholstered panel in charcoal. Crisp white bedding — one textured throw in warm gray folded precisely at the foot. 2 sleeping pillows only. One nightstand per side — each with a single architectural lamp (no shade, sculptural form). Nothing else on the nightstands. Solid-color area rug in warm gray. One oversized piece of art on the wall above the bed — abstract or monochromatic. One tall sculptural plant in a matte planter in the corner.',
      'Primary Bedroom': 'Platform bed with simple upholstered panel headboard in charcoal, king size. Crisp white bedding with one cashmere throw in warm gray draped at the foot. 2 sleeping pillows only. One nightstand per side — architectural lamp on each (sculptural form, no shade). One has a single small object (ceramic or stone). Solid-color area rug. Low bench at foot of bed in matching upholstery — nothing on it. One oversized abstract artwork above the bed. One architectural floor plant. If the room is large, one sculptural accent chair with no accessories.',
      'Dining Room': 'Monolithic dining table (solid wood slab or cast concrete with clean legs). Matching chairs with architectural form — no mix, no cushions. One single object at the center of the table (sculptural ceramic, stone bowl, or single branch in a minimal vase). One piece of artwork on the nearest wall. Nothing else.',
      'Office': 'Slab desk (solid wood or concrete). One architectural task chair. One sculptural desk lamp. One single object on the desk (stone paperweight, ceramic vessel, or closed notebook). One floating shelf with 3-4 books aligned precisely. Nothing else.',
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
      'Living Room': 'Deep leather sofa in cognac or dark brown — 3 throw pillows (one worn leather, one dark wool, one cream linen) and a dark wool throw over one arm. Reclaimed-wood and blackened-steel coffee table — styled with a stack of large photography books, a brass ashtray or catchall, and a small concrete planter with a succulent. Metal-frame bookshelf along one wall — styled with books (some vertical, some horizontal), a vintage camera, brass bookends, a small framed photograph, ceramic objects, and a trailing potted plant. One leather or canvas armchair beside the sofa. Industrial arc floor lamp in matte black. Vintage-style area rug in muted tones (faded Persian or Turkish). Reclaimed-wood side table with a weathered brass table lamp. One large-format black-and-white photograph or abstract art on the focal wall. Tall plant (fiddle leaf or snake plant) in a matte black or concrete planter.',
      'Bedroom': 'Low platform bed with leather or upholstered headboard in charcoal. Layered bedding: charcoal linen duvet, a dark wool throw at the foot, 4 pillows (2 sleeping in dark gray, 1 cognac leather accent, 1 cream linen). Metal-and-wood nightstands — one with an industrial table lamp (Edison bulb, exposed filament) and a small stack of books, the other with a concrete lamp and a ceramic catchall. Vintage-style area rug in muted tones under the bed. Metal-frame mirror leaning against one wall. Reclaimed-wood dresser styled with a concrete tray, candle, and one framed photograph. One pair of large-format photographs or prints on the wall. Small potted plant on the nightstand.',
      'Primary Bedroom': 'Low platform bed with leather headboard in cognac, king size. Layered bedding: dark linen duvet, a cashmere throw in charcoal draped diagonally, 5 pillows (2 euro shams in dark gray, 2 sleeping, 1 lumbar in cognac leather). Metal-and-wood nightstands — asymmetrically styled (industrial lamp + book stack + small plant on one, concrete lamp + brass tray + candle on the other). Leather armchair in the corner with a dark throw and a reclaimed-wood side table with a book and glass. Oversized vintage area rug under the bed. Metal-frame full-length mirror leaning in the corner. Reclaimed-wood dresser styled with a concrete tray, ceramic vase with dried branches, and one framed photograph. One large statement artwork above the bed — abstract or large-format photography. Tall snake plant in a matte black planter.',
      'Dining Room': 'Reclaimed-wood table with metal legs — set with dark ceramic plates, linen napkins in charcoal, and vintage glassware. Mix of industrial chairs — 2 metal bistro chairs and 2 leather dining chairs. Table centerpiece: a brass candelabra with taper candles and a small concrete bowl with greenery. Industrial metal sideboard or console along one wall — styled with a stack of cookbooks, a brass decanter set, ceramic bowls, and one framed photograph. One large-format art piece above the sideboard. Edison pendant NOT added (preserve existing fixtures). Vintage runner under the table.',
      'Office': 'Metal-and-wood desk with industrial lines — desktop styled with a leather desk pad, brass desk lamp (Edison bulb), a concrete pencil cup, small stack of books, and one small plant. Leather task chair with metal frame. Metal shelving unit along one wall — styled with books, a vintage clock, brass objects, a framed photograph, a small plant, and industrial storage boxes. Vintage area rug under the desk. One large-format photograph or industrial-style print on the wall. Leather messenger bag or vintage suitcase as floor decor in the corner.',
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
      'Living Room': 'Slipcovered sofa in cream linen with 4 mixed throw pillows (soft floral, ticking stripe, sage linen, chunky knit) and a woven throw blanket draped over the arm. Upholstered accent chair in a soft muted pattern angled beside the sofa. Distressed white coffee table — styled with a stack of vintage books, a ceramic vase with fresh or dried flowers, an antique brass candlestick, and a small woven tray. Woven jute area rug. Antique brass table lamp on a distressed white side table between sofa and chair. Distressed white console table behind the sofa — styled with a large vintage mirror propped against the wall, a pair of ceramic crocks, woven baskets underneath, and a trailing potted plant. One large framed botanical print or vintage landscape on the focal wall. Tall potted fern or olive tree in a woven basket planter. Wooden crate or vintage box as floor accent near the console.',
      'Bedroom': 'White wood bed with simple paneled headboard. Layered bedding: cream linen duvet, a soft sage knit throw at the foot, 5 pillows (2 euro shams in cream, 2 sleeping, 1 lumbar in soft floral). Distressed white nightstands — one with a ceramic lamp with linen shade and a small potted plant, the other with a matching lamp and a stack of vintage books. Woven wool rug under the bed. Distressed white dresser styled with a vintage mirror, ceramic vase with dried lavender, and an antique brass tray. One pair of framed botanical prints flanking the bed. Upholstered stool or small bench at foot with a folded quilt.',
      'Primary Bedroom': 'White wood bed with paneled headboard, king size. Luxe layered bedding: cream linen duvet, sage wool throw draped diagonally, 6 pillows (2 euro shams in soft floral, 2 sleeping in cream, 1 lumbar in linen, 1 accent in soft pattern). Distressed white nightstands — asymmetrically styled (ceramic lamp + plant + book on one, lamp + antique brass tray + candle on the other). Upholstered bench at foot in cream with a folded quilt. Slipcovered accent chair in the corner with a throw pillow and a distressed white side table with book and plant. Woven wool rug under the bed. Distressed white dresser styled with a vintage round mirror, large ceramic vase with fresh or dried florals, and a brass tray with small objects. One large framed botanical print above the bed. Tall potted fern in a woven basket.',
      'Dining Room': 'White-washed trestle table set casually — linen placemats, cream ceramic plates, linen napkins, and vintage glassware. Mix of slipcovered parsons chairs and a rustic upholstered bench on one side. Linen runner with a cluster of pillar candles in varied heights, a ceramic vase with fresh greenery, and an antique brass bowl. White-washed sideboard — styled with a large vintage mirror, a pair of ceramic crocks, antique brass candlesticks, and woven baskets underneath. One framed botanical print above the sideboard. Iron chandelier NOT added (preserve existing fixtures). Woven jute runner under the table.',
      'Office': 'White-washed desk — desktop styled with a ceramic lamp with linen shade, a brass pencil cup, small potted plant, a stack of vintage books, and a ceramic tray with small objects. Upholstered chair in cream linen. White-washed bookshelf or open shelving — styled with books, woven storage baskets, ceramic vases, a small framed botanical, and a trailing plant. Woven jute rug under the desk. One pair of framed botanical prints on the wall.',
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
      'Living Room': 'Low sofa or deep-seated couch in natural linen or cotton — 5-6 mixed throw pillows in varied textiles (kilim, mud cloth, embroidered, block-print, velvet in terracotta or olive) and a chunky knit throw draped casually. Rattan peacock chair or rattan armchair with a sheepskin draped over it. Reclaimed-wood coffee table — styled with a brass Moroccan tray holding candles, a small terracotta pot, and a stack of travel or art books. Kilim or vintage area rug layered over a larger jute rug. Floor cushion or pouf in leather or woven textile beside the coffee table. Rattan side table with a terracotta lamp and a small plant. Macramé wall hanging or large woven textile art on the focal wall. Gallery arrangement of 3-4 eclectic frames (mix of sizes — vintage photos, botanical prints, travel art) on another wall. Multiple plants: one tall floor plant (monstera or palm) in a woven basket, 2-3 smaller potted plants on surfaces and hanging. Brass tray on the coffee table with pillar candles and dried flowers. Woven storage baskets along one wall.',
      'Bedroom': 'Low bed with textured upholstered headboard in warm fabric or a fabric-draped wall above the bed (woven textile or macramé). Luxe layered bedding: linen duvet in warm cream, a kilim or block-print throw, a chunky knit blanket at the foot, 6 mixed pillows (embroidered, mud cloth, velvet, block-print — in terracotta, olive, dusty rose, amber). Rattan nightstand on one side, small reclaimed-wood stool on the other — eclectic mix. Terracotta table lamp on one, brass lamp on the other (no matching). Vintage or kilim rug under the bed. Woven basket storage along one wall — 2-3 baskets at varied sizes. Multiple plants: one trailing plant on a shelf or nightstand, one floor plant in a basket. One gallery grouping of 3-4 eclectic frames. Macramé plant hanger in the corner.',
      'Primary Bedroom': 'Low bed with textured headboard in warm fabric, king size. Luxe layered bedding: linen duvet in warm cream, a vintage kilim throw, a chunky knit blanket, 7 mixed pillows in varied textiles (embroidered, mud cloth, velvet, block-print, tasseled — terracotta, olive, dusty rose, amber, rust). Rattan nightstand on one side, carved wood stool on the other — asymmetric and eclectic. Terracotta lamp + incense holder + book on one, brass lamp + ceramic catchall + plant on the other. Rattan armchair in the corner with a sheepskin throw, a kilim pillow, and a reclaimed-wood side table with a brass tray and candle. Vintage kilim rug under the bed. Macramé wall hanging or large woven textile above the bed. Gallery arrangement of 4-5 eclectic frames on another wall. Multiple plants: tall palm in a woven basket, 2-3 smaller plants on surfaces, one hanging plant. Woven baskets for storage. Brass tray with candles on the dresser.',
      'Dining Room': 'Reclaimed-wood dining table — set eclectically with mismatched ceramic plates, colored glassware, linen napkins in mixed warm tones. Mix of woven cane chairs, a carved wood chair, and an upholstered bench with a kilim cushion. Table centerpiece: brass candlesticks with taper candles, a potted plant, and a small terracotta bowl with dried flowers. Kilim runner under the table. Reclaimed-wood sideboard — styled with a collection of ceramic vases, brass objects, a stack of cookbooks, woven baskets, and a trailing plant. One large woven textile or eclectic gallery arrangement above the sideboard. Hanging plant near the window.',
      'Office': 'Reclaimed-wood desk — desktop styled with a brass desk lamp, a terracotta pencil cup, a stack of art books, a small potted succulent, and a ceramic incense holder. Rattan chair with a kilim cushion and a sheepskin draped over the back. Reclaimed-wood bookshelf — styled eclectically with books, woven baskets, ceramic vases, brass objects, small framed prints, and multiple small plants. Layered small kilim rug over jute under the desk. Macramé plant hanger in the corner with a trailing plant. Gallery grouping of 3-4 eclectic prints on the wall.',
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
