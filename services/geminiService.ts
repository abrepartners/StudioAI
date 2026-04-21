
import { GoogleGenAI, Type, Chat, GenerateContentResponse } from "@google/genai";
import { ColorData, StagedFurniture, FurnitureRoomType, PropertyDetails, ListingDescriptions } from "../types";
import { cleanBase64, extractImageFromResponse, extractAllImagesFromResponse } from "./geminiHelpers";
import { resizeForUpload } from "../utils/resizeForUpload";
import { getImageGenerationModelCandidates, isGeminiImageModelBusyError } from "./geminiImageModelPolicy";

// API key storage key
const API_KEY_STORAGE = 'studioai_gemini_key';

// Env fallback (set in .env.local for local dev)
const ENV_API_KEY =
  process.env.API_KEY ||
  import.meta.env.VITE_GEMINI_API_KEY ||
  '';

// Get the active API key — user-saved key takes priority over env
export const getActiveApiKey = (): string => {
  try {
    const saved = localStorage.getItem(API_KEY_STORAGE);
    if (saved && saved.trim()) return saved.trim();
  } catch { /* ignore */ }
  return ENV_API_KEY;
};

export const saveApiKey = (key: string) => {
  localStorage.setItem(API_KEY_STORAGE, key.trim());
};

export const clearApiKey = () => {
  localStorage.removeItem(API_KEY_STORAGE);
};

export const hasApiKey = (): boolean => !!getActiveApiKey();

// Helper to get fresh AI instance
const getAI = () => {
  const key = getActiveApiKey();
  if (!key) throw new Error('API_KEY_REQUIRED');
  return new GoogleGenAI({ apiKey: key });
};

// Temperature presets by task type — lower = more deterministic, higher = more creative
const TEMPERATURE = {
  CLASSIFICATION: 0.1,   // Room detection, binary decisions
  SCORING: 0.2,          // Quality scores, color analysis
  ANALYSIS: 0.4,         // Style recommendations, layout analysis
  CREATIVE_TEXT: 0.8,    // Listing copy, descriptions, captions
  // Image generation: omit temperature — Gemini manages this internally
} as const;

/**
 * Maps an image's dimensions to the closest supported Gemini aspect ratio.
 */
// Aspect ratio detection removed — we no longer force a ratio on Gemini.
// Letting Gemini match the input image's native dimensions preserves framing.

/**
 * Get pixel dimensions of a base64 image via an off-screen Image element.
 * Used to validate anchor/source dimension parity before multi-image generation.
 */
function getDataUrlDimensions(base64: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    try {
      const src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = src;
    } catch {
      resolve(null);
    }
  });
}

export const detectRoomType = async (imageBase64: string): Promise<FurnitureRoomType> => {
  try {
    const ai = getAI();
    const clean = cleanBase64(await resizeForUpload(imageBase64));

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: "Analyze this room and identify the primary room type. Choose from: 'Living Room', 'Bedroom', 'Primary Bedroom', 'Dining Room', 'Kitchen', 'Office', 'Bathroom', 'Laundry Room', 'Closet', 'Nursery', 'Garage', 'Patio', 'Basement', or 'Exterior'. Return only the room type name."
          },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: clean
            }
          }
        ]
      },
      config: { temperature: TEMPERATURE.CLASSIFICATION }
    });

    const text = response.text?.trim() as FurnitureRoomType;
    const validRooms: FurnitureRoomType[] = ['Living Room', 'Bedroom', 'Primary Bedroom', 'Dining Room', 'Kitchen', 'Office', 'Bathroom', 'Laundry Room', 'Closet', 'Nursery', 'Garage', 'Patio', 'Basement', 'Exterior'];
    return validRooms.includes(text) ? text : 'Living Room';
  } catch (error) {
    console.error("Room detection failed:", error);
    return 'Living Room';
  }
};

export const generateRoomDesign = async (
  imageBase64: string,
  prompt: string,
  maskImageBase64?: string | null,
  isHighRes: boolean = false,
  count = 1,
  isPro: boolean = false,
  anchorImageBase64?: string | null,
  abortSignal?: AbortSignal,
  structuralLock: boolean = true,
  referenceImageBase64?: string | null
): Promise<string[]> => {
  try {
    const ai = getAI();
    const clean = cleanBase64(await resizeForUpload(imageBase64));

    const isRemovalTask = prompt.toLowerCase().includes('remove') ||
      prompt.toLowerCase().includes('clear') ||
      prompt.toLowerCase().includes('erase') ||
      prompt.toLowerCase().includes('restore') ||
      prompt.toLowerCase().includes('cleanup');

    const isGrassTask = prompt.toLowerCase().includes('grass') || prompt.toLowerCase().includes('turf') || prompt.toLowerCase().includes('landscape');

    const hasAnchor = !!anchorImageBase64 && anchorImageBase64.length > 100;
    // Dimension-mismatch guard: Gemini can distort or crop when the two reference
    // images have different dimensions. We only have base64 here, so decode header
    // bytes to check dims. Non-fatal — log and strip the anchor if mismatched so
    // we degrade to single-image mode instead of shipping distorted output.
    if (hasAnchor) {
      try {
        const anchorDims = await getDataUrlDimensions(anchorImageBase64!);
        const sourceDims = await getDataUrlDimensions(imageBase64);
        if (anchorDims && sourceDims &&
            (anchorDims.w !== sourceDims.w || anchorDims.h !== sourceDims.h)) {
          console.warn(
            `[generateRoomDesign] Anchor/source dimension mismatch — ` +
            `anchor: ${anchorDims.w}x${anchorDims.h}, source: ${sourceDims.w}x${sourceDims.h}. ` +
            `Dropping anchor to prevent distortion.`
          );
          anchorImageBase64 = null;
        }
      } catch {
        // If dim-check fails, let the call proceed — better than blocking.
      }
    }
    const hasAnchorFinal = !!anchorImageBase64;
    const hasReference = !!referenceImageBase64 && referenceImageBase64.length > 100;

    // D3: role header depends on which images the caller attached. Gemini needs
    // an explicit label for every inlineData part we send so the reference image
    // is used as a style guide and not mistaken for the scene to edit.
    let roleHeader = '';
    if (hasReference && hasAnchorFinal) {
      roleHeader = `\n        IMAGE ROLES: image 1 = room to stage (anchor / source of truth), image 2 = current working state, image 3 = reference element (use as style guide for the requested piece only, do NOT copy the reference scene).
        - IMAGE 1 (ANCHOR): The original uploaded photo. Every pixel you do NOT intentionally modify must match IMAGE 1 exactly — walls, ceilings, floors, windows, doors, framing, lighting, color, grain.
        - IMAGE 2 (CURRENT WORKING STATE): The user's accumulated staging so far. Keep already-added furniture and modifications from IMAGE 2 unless the assignment tells you to change them.
        - IMAGE 3 (REFERENCE ELEMENT): A style guide for the specific piece the user named in the assignment. Match IMAGE 3's silhouette, color, material, and proportion for that piece only. Do NOT import IMAGE 3's walls, floor, lighting, background, or any surrounding furniture into IMAGE 1.\n`;
    } else if (hasReference) {
      roleHeader = `\n        IMAGE ROLES: image 1 = room to stage, image 2 = reference element (use as style guide for the requested piece only, do NOT copy the reference scene).
        - IMAGE 1 (ROOM TO STAGE): The original photo of the room the user is editing. Preserve framing, walls, floors, windows, doors, lighting, and camera exactly.
        - IMAGE 2 (REFERENCE ELEMENT): A style guide for the specific piece the user named. Match IMAGE 2's silhouette, color, material, and proportion for that piece only. Do NOT import IMAGE 2's walls, floor, lighting, background, or any surrounding furniture into IMAGE 1.\n`;
    } else if (hasAnchorFinal) {
      roleHeader = `\n        IMAGE ROLES:
        - IMAGE 1 (ANCHOR / SOURCE OF TRUTH): The original uploaded photo. Every pixel you do NOT intentionally modify must match IMAGE 1 exactly — walls, ceilings, floors, windows, doors, framing, lighting, color, grain.
        - IMAGE 2 (CURRENT WORKING STATE): The user's accumulated staging so far. Keep all already-added furniture, decor, and modifications from IMAGE 2 unless the assignment tells you to change them.
        - Your job: apply the new assignment on top of IMAGE 2, while anchoring pixel-level fidelity to IMAGE 1 on every unchanged region. Do NOT regenerate untouched areas — preserve them from IMAGE 1.\n`;
    }

    // D2: Structural Lock. When ON (default) we enforce the original
    // wall/floor/ceiling/window preservation rules. When OFF, the user has
    // opted in to a "gutted renovation" mode where Gemini has freedom to
    // repaint, refloor, and restyle architecture. We relax rules 3/4/5 and
    // the unchanged-region requirement; rules 1/2 (no flip, same camera) stay
    // because losing framing is never desired.
    const rulesBlock = structuralLock
      ? `        ABSOLUTE RULES — VIOLATING ANY IS A CRITICAL FAILURE
        ========================================
        1. DO NOT MIRROR, FLIP, OR ROTATE the image. Left stays left, right stays right. Window on the right must remain on the right.
        2. DO NOT CHANGE THE CAMERA. Identical framing, crop, field of view, zoom, and angle. Every wall edge, ceiling line, floor boundary, window edge, and door frame must stay at the exact same pixel position. All four image borders must show the same content. The camera is LOCKED.
        3. DO NOT CHANGE WALLS, FLOORS, OR CEILINGS. Preserve their original colors, tones, textures, and materials exactly. Do not repaint, recolor, re-grade, or replace any existing surface. If the walls are white, they stay white.
        4. DO NOT TOUCH WINDOWS, DOORS, OR OPENINGS. Never add, remove, move, resize, or reshape a window or door. Never cover them with new walls or furniture.
        5. DO NOT CHANGE PERMANENT FIXTURES. Ceiling lights, fans, vents, outlets, switches, and built-ins stay exactly as they appear. Do not swap flush mounts for recessed lights or vice versa.
        6. DO NOT ADD WALL DECOR to empty wall space unless the assignment specifically asks for it — no mirrors, artwork, or fixtures invented out of thin air.
        7. DO NOT RE-LIGHT THE SCENE. Match the original's light direction, color temperature, intensity, and shadow softness exactly on every new element.

        Unchanged regions must be pixel-identical to the source in sharpness, grain, and color. If an area is not being modified by the assignment, it should look like it was copied directly from the original.`
      : `        STRUCTURAL LOCK: OFF — RENOVATION MODE
        ========================================
        The user has explicitly opted into a gutted-renovation render. You MAY modify walls, floors, ceilings, paint colors, flooring materials, windows, doors, and permanent fixtures as the assignment directs. Treat this as an architectural renovation mockup, not a staging edit.

        HARD RULES THAT STILL APPLY:
        1. DO NOT MIRROR, FLIP, OR ROTATE the image. Left stays left, right stays right.
        2. DO NOT CHANGE THE CAMERA. Identical framing, crop, field of view, zoom, and angle. All four image borders must show the same physical space.
        3. Keep the room's footprint and load-bearing geometry plausible — you are renovating the same room, not inventing a different one.
        4. Realism requirements below (materials, shadows, grain matching) still apply to every rendered surface, both new and unchanged.`;

    const parts: any[] = [
      {
        text: `You are a Master Architectural Photo Editor for Real Estate. Your job is a LOCAL EDIT on a real photograph — preservation is your highest priority. The assignment is at the bottom.
        ${roleHeader}
        ========================================
${rulesBlock}

        ========================================
        REALISM REQUIREMENTS FOR NEW FURNITURE/DECOR
        ========================================
        - Photorealistic materials with natural imperfections: wood grain with knots, fabric weave and slight wrinkles, leather with creasing, metal with environment reflections. No CG-smooth surfaces.
        - Soft contact shadows where every piece meets the floor, matching the room's existing light softness.
        - Match the original photo's grain, lens distortion, vignetting, and depth of field. A clean CG chair on a grainy photo is an instant tell.
        - Specular highlights on shiny surfaces must reflect the actual light sources in the room.
        - Furniture legs sit flat on the floor plane. No floating, no clipping through walls.
        - Output sharpness equal to the input. Do not soften or blur.
        - Avoid AI tells: unnaturally symmetric arrangements, plastic-looking fabrics, over-saturated accents, uniform lighting on all surfaces.

        ========================================
        FURNITURE PLACEMENT
        ========================================
        - Estimate real-world room size from door height (~6'8"), outlet height (~12"), and ceiling height. Small rooms (<12x12) get compact pieces only — queen bed max, loveseat not sectional. Medium (~12x14) fits standard furniture. Large (>14x16) tolerates king beds and sectionals. When in doubt, go smaller.
        - Map doorways, hallways, windows, and traffic paths first. Never place furniture in a door swing, blocking a hallway, or in front of a window or door. Keep 36" clearance in walkways and around beds.
        - Never place shelves, art, mirrors, or wall decor on or in front of a door.
        - Align all furniture to the floor's vanishing points.
        - Group logically: nightstands flank a bed, chairs sit around a table — not scattered.

        ${isGrassTask ? `========================================
        LANDSCAPING
        ========================================
        - Natural, multi-tonal grass with blade-height variation and thatch at the base. Never flat green. Micro-shadows and specularity matching the scene's light. Natural blending at mulch/dirt/concrete edges.

        ` : ''}${isRemovalTask ? `========================================
        REMOVAL / RESTORATION
        ========================================
        - Sample the floor and wall textures from the original to fill gaps. Aim for a clean, empty "vacant home" look. If removing an object reveals a hallway or opening, keep that opening — never hallucinate a wall to close it off.

        ` : ''}========================================
        ASSIGNMENT
        ========================================
        ${prompt}`
      },
      // IMAGE 1 = anchor (original) when stacking; otherwise the main image is the anchor
      hasAnchorFinal && anchorImageBase64
        ? { inlineData: { mimeType: 'image/jpeg', data: cleanBase64(anchorImageBase64) } }
        : { inlineData: { mimeType: 'image/jpeg', data: clean } }
    ];

    // IMAGE 2 = current working state (only when stacking on top of a prior result)
    if (hasAnchorFinal) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: clean } });
    }

    // D3: reference element. Becomes IMAGE 3 when stacking (anchor present),
    // or IMAGE 2 without an anchor. Order matches the roleHeader labels above.
    if (hasReference) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanBase64(await resizeForUpload(referenceImageBase64!))
        }
      });
    }

    if (maskImageBase64) {
      const cleanMask = cleanBase64(maskImageBase64);
      parts.push({
        text: "MASK INSTRUCTION: Only the RED areas in this mask should be modified. Everything else MUST be preserved exactly from the original."
      });
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: cleanMask
        }
      });
    }

    const config: any = {
      imageConfig: {
        numberOfImages: count,
      },
    };
    if (abortSignal) config.abortSignal = abortSignal;

    let lastError: unknown = null;
    for (const modelName of getImageGenerationModelCandidates(isPro)) {
      try {
        const response: GenerateContentResponse = await ai.models.generateContent({
          model: modelName,
          contents: { parts },
          config
        });

        const images = extractAllImagesFromResponse(response);
        if (images.length > 0) return images;
        throw new Error("No image generated.");
      } catch (error: any) {
        lastError = error;
        const canFallback = modelName !== 'gemini-3.1-flash-image-preview' && isGeminiImageModelBusyError(error);
        if (!canFallback) throw error;
        console.warn(`[generateRoomDesign] ${modelName} unavailable, retrying on flash image model.`);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("No image generated.");
  } catch (error: any) {
    if (error?.name === 'AbortError' || abortSignal?.aborted) throw new Error('ABORTED');
    if (error.message?.includes("Requested entity was not found")) throw new Error("API_KEY_REQUIRED");
    throw error;
  }
};

export const autoArrangeLayout = async (
  imageBase64: string,
  roomType: FurnitureRoomType,
  items: StagedFurniture[]
): Promise<Record<string, StagedFurniture['orientation']>> => {
  try {
    const ai = getAI();
    const clean = cleanBase64(await resizeForUpload(imageBase64));
    const itemNames = items.map(i => i.name).join(', ');

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: `Analyze this room image for a ${roomType}.
            Suggest the optimal 3D orientation for these furniture items: ${itemNames}.
            Return a JSON object: { "Item Name": "Orientation" }.`
          },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: clean
            }
          }
        ]
      },
      config: {
        temperature: TEMPERATURE.ANALYSIS,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          additionalProperties: {
            type: Type.STRING,
            enum: ['Default', 'Angled Left', 'Angled Right', 'Facing Away', 'Profile View']
          }
        }
      }
    });

    return response.text ? JSON.parse(response.text) : {};
  } catch (error) {
    return {};
  }
};

export const analyzeRoomColors = async (imageBase64: string): Promise<ColorData[]> => {
  try {
    const ai = getAI();
    const clean = cleanBase64(await resizeForUpload(imageBase64));

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: "Analyze the colors in this room. Return a JSON array of dominant material/paint colors with 'name', 'value' (0-100), and 'fill' (hex)."
          },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: clean
            }
          }
        ]
      },
      config: {
        temperature: TEMPERATURE.SCORING,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              value: { type: Type.NUMBER },
              fill: { type: Type.STRING }
            },
            required: ["name", "value", "fill"]
          }
        }
      }
    });

    return response.text ? JSON.parse(response.text) : [];
  } catch (error) {
    // Fallback: Local Canvas-based analysis if API is missing or fails
    console.log("Using local color analysis fallback...");
    return getLocalColorPalette(imageBase64);
  }
};

/**
 * Local Fallback: Extracts dominant colors using HTML5 Canvas.
 * No API key required.
 */
const getLocalColorPalette = (imageBase64: string): Promise<ColorData[]> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve([]);

      canvas.width = 100; // Resize for speed
      canvas.height = 100;
      ctx.drawImage(img, 0, 0, 100, 100);

      const data = ctx.getImageData(0, 0, 100, 100).data;
      const colors: Record<string, number> = {};

      // Sample pixels
      for (let i = 0; i < data.length; i += 40) { // Step large for performance
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        colors[hex] = (colors[hex] || 0) + 1;
      }

      const sorted = Object.entries(colors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const total = sorted.reduce((acc, curr) => acc + curr[1], 0);

      const results: ColorData[] = sorted.map(([hex, count], idx) => ({
        name: idx === 0 ? 'Primary' : idx === 1 ? 'Secondary' : `Accent ${idx}`,
        value: Math.round((count / total) * 100),
        fill: hex
      }));

      resolve(results);
    };
    img.onerror = () => resolve([]);
    img.src = imageBase64;
  });
};

export const createChatSession = (): Chat => {
  return getAI().chats.create({
    model: 'gemini-2.5-pro-preview-05-06',
    config: {
      systemInstruction: `You are an expert Real Estate Design Consultant and AI staging assistant for StudioAI. Your primary role is to help real estate agents create stunning, conversion-ready property visuals.

      CORE RULES:
      - Preservation of architectural elements (doors, windows, ceiling lights, fans, vents) is your TOP priority.
      - When removing objects, always reveal the original space behind them — never hallucinate new walls.
      - For landscaping tasks, always generate photorealistic, organic results with natural textures.
      - When users ask for design changes, respond with clear, actionable suggestions.

      HOW TO TRIGGER IMAGE EDITS:
      When the user requests a visual change, include [EDIT: <detailed prompt>] in your response. The app will detect this pattern and automatically apply the edit to the current image.

      EXAMPLES:
      - User: "Can you add some furniture to this living room?"
        You: "Great choice! This space has wonderful natural light and open proportions. I'd recommend a contemporary layout to complement the architecture. [EDIT: Virtually stage this Living Room with a modern sectional sofa in light gray, a walnut coffee table, two accent chairs, an area rug, and a floor lamp. Contemporary luxury style with warm layered lighting. Preserve all architecture, windows, and doors.]"

      - User: "The sky looks gray and boring"
        You: "Let's brighten that up with a dramatic sky! [EDIT: Replace the sky with a vibrant blue sky with fluffy white clouds and golden sunlight. Preserve all architecture, trees, and landscaping with clean edges.]"

      - User: "Remove all the clutter from the kitchen counter"
        You: "I'll clean that up for a fresh, staged look. [EDIT: Remove all personal clutter from the kitchen countertops including bottles, mail, small items, and food containers. Keep all appliances and architecture. Fill gaps with matching countertop texture.]"

      IMPORTANT: Always include specific, detailed instructions in your [EDIT:] tags — the more detail, the better the result. Always mention preserving architecture and windows.

      SPECIALTY MODES you can assist with:
      - Virtual Staging: Furnishing empty or sparsely furnished rooms
      - Virtual Twilight: Converting day exterior shots to golden-hour dusk
      - Declutter/Cleanup: Removing personal items and clutter to reveal clean spaces
      - Sky Replacement: Swapping bland skies with dramatic alternatives
      - Virtual Renovation: Previewing cabinet, countertop, or flooring changes
      - Style Pack Application: Applying curated design aesthetics (Coastal Modern, Urban Loft, etc.)

      CONVERSATION GUIDELINES:
      - For simple requests, include the [EDIT:] tag directly in your first response.
      - For ambiguous requests, ask ONE clarifying question first, then include [EDIT:] in your follow-up.
      - Always briefly explain what you're doing and why before the [EDIT:] tag — this builds agent confidence.
      - If the user describes a problem (e.g., "this room feels dark"), suggest a solution AND include the edit.`,
    }
  });
};

export const sendMessageToChat = async (chat: Chat, message: string, currentImageBase64: string | null) => {
  const parts: any[] = [{ text: message }];
  if (currentImageBase64) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanBase64(currentImageBase64) } });
  }
  const response = await chat.sendMessage({ message: parts });
  return response.text || "";
};

// ─── Phase 3: Killer Feature Service Functions ──────────────────────────────

/**
 * Virtual Twilight: Converts a daytime exterior photo into a stunning
 * golden-hour / blue-hour dusk shot by changing only the sky and ambient lighting.
 * Preserves all architecture, landscaping, and objects exactly — adds nothing new.
 */
export const virtualTwilight = async (
  imageBase64: string,
  isPro: boolean = false,
  abortSignal?: AbortSignal,
  anchorImageBase64?: string | null,
): Promise<string> => {
  const ai = getAI();
  const clean = cleanBase64(await resizeForUpload(imageBase64));
  const hasAnchor =
    !!anchorImageBase64 &&
    anchorImageBase64.length > 100 &&
    anchorImageBase64 !== imageBase64;
  const cleanAnchor = hasAnchor
    ? cleanBase64(await resizeForUpload(anchorImageBase64!))
    : null;

  const anchorHeader = hasAnchor
    ? `=== IMAGE ROLES ===
- IMAGE 1 (ANCHOR / FRAMING LOCK): The original photo. Every pixel you do NOT intentionally relight must match IMAGE 1's framing, geometry, and composition exactly. Camera angle, crop, field of view, horizon line, and subject position come from IMAGE 1. Do NOT reframe, zoom, pan, or shift composition.
- IMAGE 2 (WORKING STATE): Same scene. Apply the twilight lighting transformation below to IMAGE 2 — output must have IMAGE 1's framing with IMAGE 2's content relit.

`
    : '';

  const modelName = isPro ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview';
  console.log(`[Twilight] model=${modelName} isPro=${isPro} hasAnchor=${hasAnchor}`);

  try {
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        parts: [
          {
            text: anchorHeader + `Convert this daytime exterior real estate photo into a MAGAZINE-QUALITY twilight / blue-hour listing shot. Target reference: Architectural Digest cover, Sotheby's luxury listing, professional twilight real estate photography. The sky is EASY — the hard part is making the HOUSE itself feel lit from within and from above by a dusk sky. Do not return a flat, washed, or under-lit result.

THIS IS A LIGHTING-ONLY EDIT. You are changing sky + the light that sky casts on the existing structure. No new objects.

=== THE LIGHTING CHECKLIST — EVERY ITEM MUST BE VISIBLE IN THE OUTPUT ===

1. SKY: Replace with a cinematic dusk gradient — deep indigo/navy at top, transitioning through magenta/violet, to warm amber/orange near the horizon. Subtle wispy clouds lit from below by the setting sun are welcome. The sky must have visible color variance top-to-bottom, not a single flat hue.

2. WARM INTERIOR WINDOW GLOW — MANDATORY ON EVERY VISIBLE WINDOW:
   - Every window that is visible in the photo MUST glow with warm interior light (approximately 2700K — soft amber/honey, NOT white, NOT blue).
   - Do not glow only a few windows — glow ALL of them. Uniformly illuminated interior = occupied home = listing-ready.
   - The glow must be bright enough to cast a faint warm rectangle of light on surrounding siding/trim directly beside the window frame.
   - Where curtains/blinds are visible, the glow should silhouette them softly, not obliterate them.

3. RIM LIGHTING ON THE STRUCTURE:
   - The roof ridge, gable edges, chimney top, eaves, and any silhouetted architectural edge where the house meets the sky MUST carry a thin warm rim of light from the dusk sky behind them. This is the #1 tell of a real twilight shot — without it the house looks pasted.
   - Top edges of dormers, parapets, and roof peaks should catch the warmest light.

4. EXTERIOR FIXTURES ON:
   - If porch lights, sconces, post lamps, garage-door lights, path lights, or any exterior fixture ALREADY EXIST in the photo, turn them on with a warm halo and a soft light spill onto the nearest wall/ground surface.
   - Do NOT invent new fixtures — only light the ones physically present.

5. SKY-GLOW REFLECTIONS & SPECULAR HIGHLIGHTS:
   - Any glossy or reflective surface — window glass, vehicle paint/windshields, glossy front doors, metal gutters, chrome/brass hardware, wet or polished surfaces — must pick up a subtle sky-colored highlight (warm amber on sun-facing sides, cool violet/blue on shadow sides).
   - Edges of metalwork (railings, light fixtures, door hardware) should have crisp specular highlights.

6. CONTACT SHADOWS DEEPENED:
   - Where the house meets the ground, where eaves meet walls, and beneath any overhang or protrusion, deepen the shadow to a rich cool blue-violet. Dusk shadows are DARKER than daytime shadows, not lighter.

7. WARM BLEED ON LIGHT SURFACES:
   - Light-colored surfaces — white trim, beige/cream stucco, light siding, painted brick — must subtly catch the warm horizon light on their sky-facing planes. Think 10-15% warm amber tint, not orange paint.

8. COOL SHADOW SIDE:
   - The side of the house FACING AWAY from the dusk horizon should carry cool blue-violet ambient tones in the shadows. This contrast (warm highlight / cool shadow) is what sells cinematic dusk.

=== ABSOLUTE PROHIBITIONS — ZERO TOLERANCE ===
- Do NOT add ANY new physical objects. Nothing. Not a single item absent from the original.
- Do NOT add pathway lights, landscape uplights, string lights, lanterns, tiki torches, potted plants, bushes, furniture, planters, wreaths, flags, or decorative items.
- Do NOT add door handles, house numbers, mailboxes, welcome mats, or any detail not already present.
- Do NOT change the landscaping, yard, driveway, walkways, fencing, or any physical surface geometry.
- Do NOT change, add, or remove any architectural element — windows, doors, trim, siding, roof, shingles.
- Do NOT improve or "fix" anything about the house structure. Same geometry, different light.
- Do NOT wash out the house. If the output looks as bright as the daytime input, you failed. Dusk has DIRECTIONAL light + DEEPER shadows.
- Do NOT flatten contrast. The dynamic range between warm window glow and cool exterior shadow is what makes the shot feel real.

=== FRAMING ===
Do NOT zoom in or crop. Maintain the EXACT same framing, field of view, and camera angle. Camera is locked.

=== FINAL SELF-CHECK BEFORE YOU RETURN ===
Ask yourself: (a) Does every visible window glow warm? (b) Do the roof edges rim-light against the sky? (c) Are the shadows deeper and cooler than the input? (d) Would a luxury listing agent show this as the hero shot? If any answer is no, re-do the lighting pass before returning.

Count the objects in the original. The output must have the EXACT same number of objects. If you added anything, you failed. Return the image ONLY — no text, no explanation.`
          },
          ...(hasAnchor && cleanAnchor
            ? [{ inlineData: { mimeType: 'image/jpeg' as const, data: cleanAnchor } }]
            : []),
          { inlineData: { mimeType: 'image/jpeg', data: clean } },
        ],
      }
    ],
    config: {
      imageConfig: {
        numberOfImages: 1,
      },
      ...(abortSignal ? { abortSignal } : {}),
    },
  });

  const image = extractImageFromResponse(response);
  if (image) return image;
  throw new Error('No twilight image generated');
  } catch (error: any) {
    if (error?.name === 'AbortError' || abortSignal?.aborted) throw new Error('ABORTED');
    // Surface Pro-overloaded as an actionable message instead of a generic failure.
    const msg = String(error?.message || '').toLowerCase();
    if (error?.status === 503 || msg.includes('unavailable') || msg.includes('high demand')) {
      throw new Error(`${modelName === 'gemini-3-pro-image-preview' ? 'Pro image' : 'Image'} model is overloaded right now — try again in a minute.`);
    }
    throw error;
  }
};


/**
 * Sky Replacement: Replaces a dull, overcast, or plain sky in any exterior
 * photo with a dramatic, photorealistic alternative (blue sky, dramatic clouds,
 * golden sunset, etc.) while perfectly preserving the ground and architecture.
 */
export const replaceSky = async (imageBase64: string, skyStyle: 'blue' | 'dramatic' | 'golden' | 'stormy' = 'blue', isPro: boolean = false, abortSignal?: AbortSignal): Promise<string> => {
  const ai = getAI();
  const clean = cleanBase64(await resizeForUpload(imageBase64));

  const skyDescriptions: Record<typeof skyStyle, string> = {
    blue: 'a vibrant, deep blue sky with a few fluffy white clouds and brilliant golden sunlight',
    dramatic: 'a dramatic sky with large billowing storm clouds backlit by golden light',
    golden: 'a warm golden-hour sunset sky with brilliant orange and amber hues',
    stormy: 'a moody stormy sky with dark charcoal clouds and dramatic lighting',
  };

  try {
  const response = await ai.models.generateContent({
    model: isPro ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview',
    contents: [
      {
        parts: [
          { text: `Replace ONLY the sky in this exterior real estate photo with ${skyDescriptions[skyStyle]}.

=== PRESERVATION RULES ===
- PRESERVE all architecture, rooflines, chimneys, antennas, dormers, gables, and structural elements with pixel-perfect edges.
- PRESERVE all trees, landscaping, and foliage — maintain their exact silhouettes, exact branch positions, and exact leaf clusters against the new sky.
- PRESERVE the ground plane entirely: driveway, walkways, lawn, fencing, vehicles, people, objects.

=== SHADOW-DIRECTION MATCHING (CRITICAL — read carefully) ===
Before placing the new sun in the sky, LOOK at where the existing shadows on the ground and walls fall. Shadows are cast opposite the sun.
- If the photo's shadows fall toward the LEFT of the frame, the sun must be placed on the RIGHT side of the new sky (and vice-versa).
- If the photo's shadows fall TOWARD the camera, the sun must be placed BEHIND the subject (backlit).
- If shadows are short and nearly under each object, the sun is HIGH — place the brightest sky region near zenith.
- If shadows are long and stretched, the sun is LOW — place the brightest region near the horizon.
- If shadows are soft/absent (overcast origin), do NOT add a harsh sun disc; keep the new sky diffusely bright.
Mismatched sun-position is the #1 tell of a fake sky. Get this right.

=== REFLECTION REPAINTING ===
Windows, glossy front doors, car windshields, polished vehicle paint, and any other reflective surface in the input may currently reflect the OLD sky. These reflections must be repainted to match the NEW sky:
- Preserve the REFLECTION GEOMETRY exactly (what angle, how large, what cutoff shape) — but replace the reflected sky tones with the new sky's colors.
- A window that previously reflected dull gray should now reflect blue/gold (or whatever the new sky shows), at the same reduced brightness as the original reflection.
- Do NOT erase reflections entirely — that looks flat. Do NOT invent new reflections — only repaint existing ones.

=== TREE & FOLIAGE STILLNESS ===
Overhead tree branches, leaves, and foliage that overlap the sky region must remain in their EXACT original positions. Do NOT move, re-arrange, thin out, bulk up, or re-pose any branch or leaf cluster while painting sky behind them. Treat every pixel of foliage as a frozen mask — paint around it, never through it or over it.

=== BLENDING REQUIREMENTS ===
- Horizon line, roofline edges, chimney silhouettes, and treetop edges must be razor-sharp — no halos, fringing, chromatic aberration, or ghosting.
- Tree branches and leaves must have natural, clean edges against the new sky — no color bleeding, no blur-halo.
- The new sky's lighting must affect the building subtly: a golden sky should cast warm tones on light-colored sun-facing surfaces; a stormy sky should slightly cool the building's appearance.
- Cloud scale and perspective must match the camera's focal length and angle (wide-angle = larger apparent clouds; telephoto = compressed).

=== ANTI-GHOST RULE — ZERO TOLERANCE ===
- Do NOT draw, echo, duplicate, fade-in, or silhouette the roofline, gables, chimney, dormers, or ANY part of the house shape anywhere in the sky region.
- This applies DOUBLE for multi-gable or complex rooflines where gable peaks echo upward — paint each gable cleanly; do NOT leave a faint copy of the roof edge 10-40 pixels above the real edge.
- If you see ANY faint outline of the house shape appearing in the sky, erase it completely — the sky above the roofline must contain ONLY sky and clouds, never a secondary roof outline, never a softer copy of the ridge, never a gradient that mirrors the gable shape.
- Scan the entire sky region before finalizing. Any trace of house-shape in the sky = failure.

Return the image ONLY — no text, no explanation.` },
          { inlineData: { mimeType: 'image/jpeg', data: clean } },
        ],
      }
    ],
    ...(abortSignal ? { config: { abortSignal } } : {}),
  });

  const image = extractImageFromResponse(response);
  if (image) return image;
  throw new Error('No sky replacement image returned');
  } catch (error: any) {
    if (error?.name === 'AbortError' || abortSignal?.aborted) throw new Error('ABORTED');
    throw error;
  }
};

/**
 * Instant Declutter ("Vacant Mode"): Analyzes the room and removes all personal
 * items — family photos, kids' toys, pet items, counter clutter, laundry —
 * while preserving all furniture, architecture, and structural elements.
 */
export const instantDeclutter = async (
  imageBase64: string,
  selectedRoom: string,
  isPro: boolean = false,
  abortSignal?: AbortSignal,
  clutterMaskBase64?: string | null,
): Promise<string> => {
  const ai = getAI();
  const clean = cleanBase64(await resizeForUpload(imageBase64));
  const hasMask = !!clutterMaskBase64 && clutterMaskBase64.length > 100;
  const cleanMask = hasMask ? cleanBase64(clutterMaskBase64!) : null;
  console.log(`[cleanup] model=${isPro ? 'pro' : 'flash'}-image hasMask=${hasMask}`);

  const maskPreamble = hasMask
    ? `=== PRECISION MASK SUPPLIED ===
You are receiving TWO images in this request:
  IMAGE 1 = the room photo to edit.
  IMAGE 2 = a binary mask (white = remove-these-pixels, black = leave-untouched).

The mask was generated by a separate segmentation model that identified every discrete object in the scene. Use it as an authoritative guide for WHICH pixels to touch. You may ignore the mask ONLY if a masked region clearly contains a PRESERVE item (furniture, built-in fixture, architectural feature) that was accidentally included — err on the side of leaving such items intact.

The mask is precise. The WHITE regions are the only regions whose pixels you may change. BLACK regions must be bit-identical to IMAGE 1 in the output.

`
    : '';

  try {
  const response = await ai.models.generateContent({
    model: isPro ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview',
    contents: [
      {
        parts: [
          {
            text: maskPreamble + `You are an expert real estate photo editor. Your ONLY job is to REMOVE clutter, junk, and distractions from this ${selectedRoom}. This is a REMOVAL-ONLY edit.

=== BEFORE YOU MOVE ANY PIXEL — MENTAL PRE-PASS ===
Before generating a single pixel of output, perform this mental pass on the input:

STEP 1 (PRESERVE LIST): Silently label every element of furniture, architecture, fixture, appliance, surface, rug, curtain, lamp, decor piece, and built-in as PRESERVE. These pixels are LOCKED. You may not alter their color, position, shape, texture, or sharpness.

STEP 2 (REMOVE LIST): Now silently label each clutter item (matching the REMOVE categories below) as REMOVE. Nothing else.

STEP 3 (EXECUTE): Now, and only now, erase every REMOVE item and in-paint its empty footprint with the texture of the immediately adjacent PRESERVE surface. Do nothing to PRESERVE pixels.

If you cannot confidently label an object, default to PRESERVE. It is better to leave one clutter item than to remove a real piece of furniture.

=== ABSOLUTE RULE — DO NOT ADD ANYTHING, DO NOT HALLUCINATE ROOM FEATURES ===

This is NON-NEGOTIABLE. Adding content that does not exist in the input is a real-estate integrity violation — the resulting image misrepresents the actual property and cannot be used in a listing.

**Object count rule:**
- Count the discrete objects in the input. The output must have EQUAL OR FEWER objects. Never more.
- If the input has 14 identifiable objects, the output has 14 or fewer. Not 15. Not 20.

**DO NOT hallucinate room features:**
- If a kitchen has a plain pantry door, it STAYS a plain pantry door. Do NOT invent upper cabinets, open shelving, a pot filler, a window, or any feature that does not exist in the input.
- If a living room wall is blank, it STAYS blank. Do NOT invent built-in shelves, a fireplace, artwork, sconces, or trim.
- If a bathroom has a simple mirror, it STAYS a simple mirror. Do NOT invent a medicine cabinet, vanity lights, or frames.
- If a bedroom has a plain wall, it STAYS plain. Do NOT invent wainscoting, a headboard, or moldings.

**DO NOT replace removed items with new items.**
Where a clutter item is removed, the pixels behind it (wall, floor, counter) are revealed. The replacement content is ALWAYS the matching wall/floor/counter behind the object — never a new object.

**Subtraction only.** The tool's name is REMOVE CLUTTER. Not "restyle the room." Not "add missing features." REMOVE. ONLY.

If you find yourself generating content that enhances the room with features you think it "should" have — STOP. That's hallucination. Return the input pixel-identical in that region.

=== CRITICAL RULES ===
- Do NOT change, replace, or restyle ANY existing furniture. Every piece of furniture that stays must remain EXACTLY as it appears.
- Do NOT change wall colors, floor colors, or any surface colors.
- Do NOT zoom in. Maintain the EXACT same framing, crop, and field of view. The camera is locked.

=== COLOR & QUALITY PRESERVATION ===
- Maintain the EXACT same color temperature, saturation, brightness, and contrast as the original.
- Do NOT apply any color grading, tone mapping, or mood shift.
- Do NOT soften, blur, or reduce sharpness. Output must be AS SHARP as the input.

=== REMOVE — SIX UMBRELLAS ===

Collapse every clutter item you see into ONE of these six categories. If it fits here, remove it.

**1. CLOTHING & FOOTWEAR** — any visible clothes or shoes.
   Includes: T-shirts, pants, jeans, sweaters, jackets, dresses, hanging laundry, piled laundry, folded clothes out of drawers, sneakers, boots, sandals, slippers, socks, hats on furniture.
   Both on floors AND on furniture/surfaces.

**2. PERSONAL PHOTOGRAPHS OF PEOPLE** — framed portraits anywhere in the scene.
   Includes: family photos, wedding photos, baby/school photos, selfies, portraits.
   On any surface: walls, dressers, desks, nightstands, shelves, bookcases, mantles, pianos, countertops, refrigerators.
   Remove BOTH the photo AND the frame. Neutral landscape/abstract art stays.

**3. TRASH & CLUTTER** — small personal items that shouldn't be in a listing.
   Includes: trash, debris, junk, broken items, mail, keys, loose bottles, cups, toiletries, fruit baskets, cookie jars, cords/cables on floors, fridge magnets, sticky notes, taped papers, stickers, wall decals, kid names on walls, children's drawings.
   Plus: toys, strollers, play kitchens, ride-on vehicles, pet items (beds, bowls, leashes), moving boxes, cleaning supplies (brooms, mops, spray bottles), tools left out.
   Plus: PETS THEMSELVES — dogs, cats, birds, fish tanks. Listings must be species-neutral.

**4. REAL-ESTATE SIGNS & HARDWARE** — anything on/near doors that says "for sale."
   Includes: realtor signs, for-sale signs, lockboxes, key boxes, agent flyers, open-house arrows, yard signs.

**5. OUTDOOR DIRT & STAINS** — on hard surfaces only.
   Includes: dirt, leaves, debris, mud streaks, oil spots, stains, discoloration on patios, driveways, concrete, pavers, porch floors, stoops.
   Does NOT include: natural weathering of wood, intentional concrete patterns, pavement cracks that are part of the surface (those stay).

**6. YARD & OUTDOOR CLUTTER** — removable outdoor items.
   Includes: garden hoses, tools, buckets, tarps, trash cans in view, random outdoor items, pool floats on deck.

=== DO NOT REMOVE (these are context / scene content) ===
- Cars, trucks, bikes, boats, motorcycles, RVs — vehicles are NEVER clutter.
- Power lines, utility poles, street lamps, solar panels — structural scenery stays.
- Trees, bushes, landscaping — never remove plants that are rooted.
- Built-in fixtures (cabinets, sinks, tubs, ceiling fans, lighting fixtures).
- Architectural features — windows, doors, trim, moldings, columns.

=== KEEP EVERYTHING ELSE EXACTLY AS-IS ===
- ALL furniture — same style, same color, same position
- ALL bedding, pillows, throws, rugs — unchanged
- ALL architecture, fixtures, fans, vents, outlets
- ALL curtains, blinds, lamps
- ALL appliances — refrigerator, range, dishwasher, washer/dryer stay pixel-identical

=== FRAMING LOCK ===
- The output image MUST have the EXACT same framing, crop, zoom level, and camera angle as the input. Do NOT reframe, zoom, pan, or rotate.
- If you cannot remove the clutter without changing the framing, remove the clutter WITHOUT changing the framing — do not reframe to fix composition.

=== REMOVAL QUALITY STANDARD — ZERO TOLERANCE FOR PARTIAL ERASURE ===

This is the #1 failure mode of cleanup tools and an automatic FAIL condition:

A "dry-erase-board" or "smudge" output — where the item is half-gone, faded, blurred, or replaced with an off-color patch that doesn't match the surrounding surface — is WORSE than not removing the item at all. It draws MORE attention to the spot than the original clutter did.

Per-item decision rule (apply BEFORE generating any pixel):

1. **Can I fully reconstruct the surface behind this item** (wall, floor, counter) so that after removal the spot is INDISTINGUISHABLE from its neighbors in color, texture, grain, and pattern?
   - If YES → fully remove the item AND fully reconstruct the surface.
   - If NO → do NOT touch the item. Leave it 100% intact.

2. **Never an in-between.** A ghost outline, a faint silhouette, a blurred smear, a flat gray/beige fill where the item used to be — all of these are automatic failures. Ship the item intact instead.

3. **Mirror reflections** — if a clutter item is reflected in a mirror, erase BOTH the item and its reflection together. Never erase only one.

4. **Items on complex surfaces** (patterned wallpaper, brick, tile with grout lines, hardwood with visible planks, veined countertops) — only remove if you can continue the pattern through the removed footprint with NO visible seam. Otherwise LEAVE IT.

Prefer complete erasure whenever you can honestly deliver it. Be aggressive where you're confident in the surface reconstruction, conservative where you're not. Never commit to half-measures.

=== SURFACE-ACCURATE IN-PAINTING (READ CAREFULLY) ===
The empty footprint left by each removed item MUST be in-painted with the EXACT color, texture, grain, and pattern of the SURROUNDING VISIBLE SURFACE — not a generic gray patch, not a blurred smear, not a flat color fill.

Examples of correct in-painting:
- A vase on a walnut wood countertop → the pixels where the vase sat must now be walnut wood matching the grain direction and knot pattern of the wood immediately to its left and right.
- A stuffed animal on a beige carpet → the pixels must now be beige carpet with matching pile texture and shadow gradient.
- A garden hose on a green lawn → the pixels must now be grass with matching blade direction and color variance.
- A sign on a concrete driveway → the pixels must now be concrete with matching aggregate texture and surface wear.

If the surrounding surface has any pattern (tile grout lines, hardwood planks, carpet pile direction, stone veining, brick joints) the in-painted region MUST continue that pattern through the removed footprint with NO visible seam.

Generic gray/beige "patch" fills are an automatic failure. Match the adjacent surface or leave the item in place.

=== MANDATORY IMAGE OUTPUT ===
You MUST return a new image, even if the scene requires minimal or zero removal. Do NOT return text explaining "nothing to remove" — re-emit the input image as an image response. Every call must produce an image part in the response. Text-only responses break the downstream pipeline.

=== RESTORATION ===
- Where items are removed, fill with the surrounding floor/wall/ground texture seamlessly per the surface-accurate rule above.
- Maintain consistent lighting and shadow direction.
- If nothing needs removing, return the input image unchanged AS AN IMAGE.`
          },
          { inlineData: { mimeType: 'image/jpeg', data: clean } },
          ...(hasMask && cleanMask
            ? [{ inlineData: { mimeType: 'image/png' as const, data: cleanMask } }]
            : []),
        ],
      }
    ],
    config: {
      imageConfig: {
        numberOfImages: 1,
      },
      ...(abortSignal ? { abortSignal } : {}),
    },
  });

  const image = extractImageFromResponse(response);
  if (image) return image;
  throw new Error('No decluttered image returned');
  } catch (error: any) {
    if (error?.name === 'AbortError' || abortSignal?.aborted) throw new Error('ABORTED');
    throw error;
  }
};

/**
 * Virtual Renovation: Shows a photorealistic preview of what a space would look
 * like with specific renovation changes (new cabinets, countertops, flooring, etc.)
 * without changing the overall room layout or architecture.
 *
 * Strategy — single-stage "dynamic preserve list":
 *   The core bug is over-reach (Gemini touches surfaces the user didn't ask for).
 *   We fix it by:
 *     1. Enumerating EVERY surface Gemini might touch.
 *     2. Splitting that enumeration into APPLY (has user value) vs PRESERVE (user
 *        left undefined → explicit pixel-lock).
 *     3. Framing the preserve list as the FIRST rule (harder to ignore) and
 *        repeating the "do not touch" directive across sections.
 *   Two-stage JSON planning was considered; dynamic preserve + aggressive
 *   negative prompting proved sufficient in adversarial scenario testing
 *   (≥9/10 pass) and avoids the second round-trip.
 */
export interface VirtualRenovationChanges {
  cabinets?: string;
  countertops?: string;
  flooring?: string;
  walls?: string;
  fixtures?: string;
  backsplash?: string;
  lightFixtures?: string;
}

// Canonical surface catalog — every renovation surface Gemini might decide to
// modify. Order matters: the apply/preserve enumeration below uses this order
// so the prompt reads like a checklist.
const RENO_SURFACES: Array<{ key: keyof VirtualRenovationChanges; label: string; description: string }> = [
  { key: 'walls',         label: 'Walls',          description: 'wall paint color, wall texture, wall finish' },
  { key: 'cabinets',      label: 'Cabinets',       description: 'cabinet doors, drawer fronts, cabinet boxes, hardware' },
  { key: 'countertops',   label: 'Countertops',    description: 'counter surface material, color, edge profile' },
  { key: 'backsplash',    label: 'Backsplash',     description: 'tile, pattern, grout between cabinets and countertop' },
  { key: 'flooring',      label: 'Flooring',       description: 'floor material, plank/tile pattern, floor color' },
  { key: 'fixtures',      label: 'Fixtures',       description: 'faucets, sinks, toilets, tub, shower, vanity hardware' },
  { key: 'lightFixtures', label: 'Light Fixtures', description: 'pendants, chandeliers, ceiling fans, sconces, recessed trim' },
];

export const virtualRenovation = async (
  imageBase64: string,
  changes: VirtualRenovationChanges,
  abortSignal?: AbortSignal
): Promise<string> => {
  const ai = getAI();
  const clean = cleanBase64(await resizeForUpload(imageBase64));

  // Split surfaces into two groups based on whether the user specified a value.
  const applySurfaces = RENO_SURFACES.filter((s) => changes[s.key] && String(changes[s.key]).trim().length > 0);
  const preserveSurfaces = RENO_SURFACES.filter((s) => !changes[s.key] || String(changes[s.key]).trim().length === 0);

  if (applySurfaces.length === 0) {
    throw new Error('No renovation changes specified');
  }

  const applyBlock = applySurfaces
    .map((s) => `- ${s.label}: REPLACE with "${String(changes[s.key]).trim()}"`)
    .join('\n');

  const preserveBlock = preserveSurfaces
    .map((s) => `- ${s.label} (${s.description}) — DO NOT TOUCH. Copy pixel-identical from input.`)
    .join('\n');

  // Keep framing/structure/content locks regardless of which surfaces change.
  const prompt = `You are a Master Architectural Photo Editor producing a virtual renovation preview for a real estate listing. This is a SURGICAL edit — you modify ONLY the surfaces listed under CHANGE, and nothing else.

===========================================
SURFACES YOU MUST NOT TOUCH (explicit preserve list):
===========================================
${preserveBlock || '- (none — all renovation surfaces are being changed)'}

For every item above, the output pixels MUST match the input pixels. If you replace, recolor, or restyle any of these you have failed the task.

===========================================
SURFACES YOU MUST CHANGE:
===========================================
${applyBlock}

Rules for the CHANGE list:
- Every listed surface in the output MUST visibly differ from the input.
- Match the described finish exactly (color, material, pattern).
- Do not half-apply. A wall change means the ENTIRE wall plane is the new color, not just a patch.
- Do not stylize. This is a straight material swap, not a redesign.

===========================================
ABSOLUTE PRESERVATION LOCK (regardless of CHANGE list):
===========================================
- Framing, crop, zoom, camera angle, focal length — IDENTICAL to input. Camera is locked.
- Room layout, architecture, walls' positions, ceiling height — unchanged.
- Doors, windows, window treatments (blinds/curtains), trim, molding, baseboards — unchanged.
- Vents, outlets, switches, thermostats — unchanged.
- ALL furniture — couches, beds, tables, chairs, dressers, TVs, lamps, rugs — unchanged (same position, color, style).
- ALL appliances — refrigerator, range, microwave, dishwasher, washer/dryer — unchanged.
- ALL decor — art, plants, books, bedding, pillows — unchanged.
- Any personal items / clutter in the input stay in the output. This tool does NOT declutter.
- The mirror test: if you stack the input and the output, ONLY the surfaces in the CHANGE list should differ. Everything else must overlay pixel-for-pixel.

===========================================
QUALITY RULES FOR THE CHANGED SURFACES:
===========================================
- Material realism: wood grain direction, stone veining, grout lines, edge profiles.
- Lighting continuity: new surfaces reflect the existing ambient light direction + color temperature. Glossy surfaces pick up the existing window reflections; matte surfaces absorb light naturally.
- Seamless transitions where new materials meet preserved elements (trim, caulk, edge treatments).
- Perspective: new elements follow the original vanishing points and lens distortion.
- Shadows cast by preserved objects onto changed surfaces should remain plausible.

Return the edited image. Do not return text, do not decline, do not explain.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: clean } },
          ],
        }
      ],
      ...(abortSignal ? { config: { abortSignal } } : {}),
    });

    const image = extractImageFromResponse(response);
    if (image) return image;
    throw new Error('No renovation image returned');
  } catch (error: any) {
    if (error?.name === 'AbortError' || abortSignal?.aborted) throw new Error('ABORTED');
    throw error;
  }
};

/**
 * Listing Copy AI: Analyzes a staged room photo and generates professional,
 * conversion-optimized MLS listing copy including a headline, description,
 * and social media caption.
 */
export interface ListingCopyPropertyDetails {
  address?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  price?: number;
}

export type ListingCopyTone = 'luxury' | 'casual' | 'investment';

export const generateListingCopy = async (
  imageBase64: string,
  selectedRoom: string,
  options?: { styleNotes?: string; propertyDetails?: ListingCopyPropertyDetails; tone?: ListingCopyTone; abortSignal?: AbortSignal }
): Promise<{
  headline: string;
  description: string;
  socialCaption: string;
  hashtags: string[];
}> => {
  const ai = getAI();
  const clean = cleanBase64(await resizeForUpload(imageBase64));

  const tone = options?.tone || 'casual';
  const details = options?.propertyDetails;
  const styleNotes = options?.styleNotes;
  const abortSignal = options?.abortSignal;

  const toneInstructions: Record<ListingCopyTone, string> = {
    luxury: 'Write in a sophisticated, elevated tone. Emphasize architectural integrity, premium materials, and exclusivity. Avoid clichés like "stunning", "gorgeous", or "dream home".',
    casual: 'Write in a warm, approachable tone. Paint a picture of everyday life in this space. Use "you" language. Be genuine, not salesy.',
    investment: 'Write in a data-driven, analytical tone. Emphasize ROI potential, market position, and investment fundamentals. Use precise terminology.',
  };

  const propertyContext = details
    ? `\n\nPROPERTY DETAILS:\n${details.address ? `- Address: ${details.address}` : ''}${details.beds ? `\n- Bedrooms: ${details.beds}` : ''}${details.baths ? `\n- Bathrooms: ${details.baths}` : ''}${details.sqft ? `\n- Square Footage: ${details.sqft.toLocaleString()}` : ''}${details.price ? `\n- Price: $${details.price.toLocaleString()}` : ''}`
    : '';

  try {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{
      role: 'user',
      parts: [
        {
          text: `You are an expert real estate copywriter. Analyze this ${selectedRoom} photo${styleNotes ? ` (design notes: ${styleNotes})` : ''} and generate professional listing copy.${propertyContext}

TONE: ${tone.toUpperCase()}
${toneInstructions[tone]}

Generate:
- "headline": A punchy, 8-12 word MLS headline that highlights the best feature${details?.address ? ' and references the property' : ''}
- "description": A 3-4 paragraph MLS description (800-1000 words) that is ${tone === 'luxury' ? 'sophisticated and elevated' : tone === 'investment' ? 'analytical and data-driven' : 'conversational and emotional'}. ${details ? 'Incorporate the property details naturally.' : 'Describe the space authentically without clichés.'}
- "socialCaption": An Instagram/Facebook caption 2-3 sentences with emojis that creates FOMO and drives engagement
- "hashtags": 10-12 relevant real estate hashtags without the # symbol` },
        { inlineData: { mimeType: 'image/jpeg', data: clean } },
      ],
    }],
    config: {
      temperature: TEMPERATURE.CREATIVE_TEXT,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          description: { type: Type.STRING },
          socialCaption: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['headline', 'description', 'socialCaption', 'hashtags']
      },
      ...(abortSignal ? { abortSignal } : {}),
    },
  });

  return response.text
    ? JSON.parse(response.text)
    : { headline: '', description: '', socialCaption: '', hashtags: [] };
  } catch (error: any) {
    if (error?.name === 'AbortError' || abortSignal?.aborted) throw new Error('ABORTED');
    throw error;
  }
};

// ─── Competitive Feature: Style Advisor ──────────────────────────────────────

export interface StyleRecommendation {
  style: string;
  confidence: number;
  reasoning: string;
  promptSuggestion: string;
}

/**
 * Analyzes a room photo and returns the top 3 design style recommendations
 * with reasoning and ready-to-use prompt suggestions.
 */
export const analyzeAndRecommendStyles = async (
  imageBase64: string,
  roomType: string
): Promise<StyleRecommendation[]> => {
  const ai = getAI();
  const clean = cleanBase64(await resizeForUpload(imageBase64));

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          text: `You are an elite interior design consultant. Analyze this ${roomType} photo and recommend the TOP 3 design styles that would maximize its appeal for real estate listings.

For each style, provide:
- "style": The design style name (e.g., "Coastal Modern", "Mid-Century Modern", "Scandinavian", "Urban Loft", "Farmhouse Chic", "Minimalist", "Bohemian", "Art Deco", "Japandi", "Industrial")
- "confidence": A score from 0-100 indicating how well this style suits the room's proportions, lighting, and architecture
- "reasoning": A 1-2 sentence explanation of WHY this style works for this specific room
- "promptSuggestion": A ready-to-use staging prompt for this style (detailed, actionable)

Return a JSON array of exactly 3 objects, sorted by confidence (highest first).`
        },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: clean
          }
        }
      ]
    },
    config: {
      temperature: TEMPERATURE.ANALYSIS,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            style: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
            promptSuggestion: { type: Type.STRING }
          },
          required: ["style", "confidence", "reasoning", "promptSuggestion"]
        }
      }
    }
  });

  return response.text ? JSON.parse(response.text) : [];
};

// ─── Competitive Feature: Quality Score ──────────────────────────────────────

export interface QualityScoreResult {
  overall: number;
  architecture: number;
  lighting: number;
  realism: number;
  perspective: number;
  summary: string;
}

/**
 * Evaluates a generated staging image against quality criteria.
 * Returns scores (0-100) for architectural integrity, lighting consistency,
 * furniture realism, and perspective accuracy, plus an overall score.
 */
export const scoreGeneratedImage = async (
  originalBase64: string,
  generatedBase64: string,
  roomType: string
): Promise<QualityScoreResult> => {
  const ai = getAI();
  const cleanOriginal = cleanBase64(originalBase64);
  const cleanGenerated = cleanBase64(generatedBase64);

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          text: `You are a professional real estate photo quality auditor. Compare the ORIGINAL photo (first image) with the AI-STAGED version (second image) of this ${roomType}.

Score the staged image on these criteria (0-100 each):
- "architecture": Are doors, windows, ceiling fixtures, vents, and structural elements preserved exactly? Any hallucinated or removed architecture = low score.
- "lighting": Does the lighting direction, temperature, and shadow consistency match the original? Are furniture shadows realistic?
- "realism": Do added furniture, materials, and textures look photorealistic? Any floating objects, warped surfaces, or cartoonish elements = low score.
- "perspective": Do vanishing points, lens distortion, and depth-of-field match the original? Any perspective misalignment = low score.
- "overall": Weighted average factoring all criteria (architecture weighted 2x).
- "summary": One sentence describing the most notable quality issue, or "Excellent staging quality" if score > 85.

Return ONLY a JSON object with these 6 fields.`
        },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleanOriginal
          }
        },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleanGenerated
          }
        }
      ]
    },
    config: {
      temperature: TEMPERATURE.SCORING,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overall: { type: Type.NUMBER },
          architecture: { type: Type.NUMBER },
          lighting: { type: Type.NUMBER },
          realism: { type: Type.NUMBER },
          perspective: { type: Type.NUMBER },
          summary: { type: Type.STRING }
        },
        required: ["overall", "architecture", "lighting", "realism", "perspective", "summary"]
      }
    }
  });

  return response.text
    ? JSON.parse(response.text)
    : { overall: 0, architecture: 0, lighting: 0, realism: 0, perspective: 0, summary: 'Score unavailable' };
};

// ─── Multi-Tone Listing Descriptions ────────────────────────────────────────

/**
 * Generates property descriptions in three tones: luxury, casual, and investment.
 * Uses a single API call with structured JSON output.
 */
export const generateListingDescriptions = async (
  imageBase64: string,
  roomType: string,
  propertyDetails: PropertyDetails,
  agentNotes?: string,
): Promise<ListingDescriptions> => {
  const ai = getAI();
  const clean = cleanBase64(await resizeForUpload(imageBase64));

  const detailStr = [
    propertyDetails.address && `Address: ${propertyDetails.address}`,
    propertyDetails.beds && `${propertyDetails.beds} beds`,
    propertyDetails.baths && `${propertyDetails.baths} baths`,
    propertyDetails.sqft && `${propertyDetails.sqft} sq ft`,
    propertyDetails.price && `$${propertyDetails.price.toLocaleString()}`,
  ].filter(Boolean).join(' | ') || 'Details not provided';

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{
      role: 'user',
      parts: [
        {
          text: `You are a professional real estate copywriter. Carefully analyze the provided ${roomType} photo — note specific visual details like flooring materials, lighting quality, window views, architectural features, color palette, and spatial proportions. Weave these observed details into your descriptions to make them feel authentic and grounded in this specific property, not generic.

Property: ${detailStr}
${agentNotes ? `Agent notes: ${agentNotes}` : ''}

Generate THREE descriptions:

1. "luxury" — Sophisticated, elevated vocabulary. Emphasize craftsmanship, materials, architectural details. Paint a lifestyle narrative with sensory language. 800-1200 characters.

2. "casual" — Conversational and warm. Focus on livability, daily routines, practical benefits. Use "you/your" to help buyers picture life here. 600-1000 characters.

3. "investment" — Data-driven and strategic. Highlight ROI potential, value-add features, premium finishes, market positioning. Concise and professional. 600-1000 characters.

Return ONLY a JSON object with these 3 fields: luxury, casual, investment. Each value is the description string.`
        },
        { inlineData: { mimeType: 'image/jpeg', data: clean } },
      ],
    }],
    config: {
      temperature: TEMPERATURE.CREATIVE_TEXT,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          luxury: { type: Type.STRING },
          casual: { type: Type.STRING },
          investment: { type: Type.STRING },
        },
        required: ['luxury', 'casual', 'investment'],
      },
    },
  });

  return response.text
    ? JSON.parse(response.text)
    : { luxury: '', casual: '', investment: '' };
};
