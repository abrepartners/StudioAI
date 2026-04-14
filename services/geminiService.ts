
import { GoogleGenAI, Type, Chat, GenerateContentResponse } from "@google/genai";
import { ColorData, StagedFurniture, FurnitureRoomType, PropertyDetails, ListingDescriptions } from "../types";
import { cleanBase64, extractImageFromResponse, extractAllImagesFromResponse } from "./geminiHelpers";

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

export const detectRoomType = async (imageBase64: string): Promise<FurnitureRoomType> => {
  try {
    const ai = getAI();
    const clean = cleanBase64(imageBase64);

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: "Analyze this room and identify the primary room type. Choose from: 'Living Room', 'Bedroom', 'Dining Room', 'Office', 'Kitchen', 'Primary Bedroom', or 'Exterior'. Return only the room type name."
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
    const validRooms: FurnitureRoomType[] = ['Living Room', 'Bedroom', 'Dining Room', 'Office', 'Kitchen', 'Primary Bedroom', 'Exterior'];
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
  isPro: boolean = false
): Promise<string[]> => {
  try {
    const ai = getAI();
    const modelName = isPro ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview';
    const clean = cleanBase64(imageBase64);

    const isRemovalTask = prompt.toLowerCase().includes('remove') ||
      prompt.toLowerCase().includes('clear') ||
      prompt.toLowerCase().includes('erase') ||
      prompt.toLowerCase().includes('restore') ||
      prompt.toLowerCase().includes('cleanup');

    const isGrassTask = prompt.toLowerCase().includes('grass') || prompt.toLowerCase().includes('turf') || prompt.toLowerCase().includes('landscape');

    const parts: any[] = [
      {
        text: `Act as a Master Architectural Photo Editor for Real Estate.
        Current Assignment: ${prompt}. 
        
        CRITICAL ARCHITECTURAL INTEGRITY RULES:
        1. **PERMANENT FIXTURES**: Do NOT modify or remove doors, window frames, ceiling lights, fans, vents, or outlets. Do NOT cover windows with new walls or furniture. If they are not masked, keep them exactly as they appear.
        2. **WINDOWS ARE SACRED**: NEVER add new windows. NEVER remove existing windows. NEVER change the shape, size, or placement of any window. Altering the structural shell is a critical failure.
        3. **NO HALLUCINATIONS**: Do NOT add mirrors, artwork, door handles, knobs, or light switches to empty wall space. Only add specific furniture/decor requested in the prompt.
        4. **REVEAL THE TRUTH**: If removing an object, reveal the original background (hallways, doorways, open spaces). Do NOT "hallucinate" a new wall over a structural opening.
        5. **DEPTH & PERSPECTIVE**: Use the original photo's vanishing points. Match the lens distortion and angle perfectly.

        PHOTOGRAPHIC REALISM REQUIREMENTS (this must look like a REAL PHOTOGRAPH, not a 3D render):
        - **COLOR FIDELITY**: Preserve the original wall colors, floor colors, ceiling colors, and existing surface tones EXACTLY. Do NOT shift, enhance, saturate, or re-grade the colors of existing surfaces. Only new furniture/decor should introduce new colors.
        - **LIGHTING**: Match the direction, intensity, and color temperature of the original ambient light exactly. New furniture must receive the SAME lighting as the existing scene — same shadow direction, same highlights, same exposure. Do NOT re-light the scene.
        - **SHADOWS**: Every piece of furniture must cast realistic soft contact shadows on the floor. Shadow darkness and diffusion must match the room's existing light softness. Hard light = harder shadows. Soft/ambient light = diffused shadows. No shadow = obvious fake.
        - **TEXTURE & MATERIALS**: Use photorealistic materials with visible imperfections — real wood grain with knots and tonal variation, fabric with visible weave and slight wrinkles, leather with natural creasing, metal with environment reflections. NO perfectly smooth CG surfaces.
        - **PHOTOGRAPHIC NOISE & GRAIN**: Match the original photo's noise profile exactly. If the source image has sensor grain (common in real estate photos shot at higher ISO), the furniture must have the same grain pattern. Clean CG furniture on a grainy photo is an instant tell.
        - **LENS CHARACTERISTICS**: Match the original lens — if the source has slight barrel distortion, chromatic aberration at edges, or vignetting, the added furniture must conform to the same optical characteristics. Furniture at frame edges should show the same subtle distortion as the walls.
        - **DEPTH OF FIELD**: If background elements are slightly soft, furniture at the same depth should match. Do not make furniture razor-sharp if the original scene has natural softness.
        - **SPECULAR HIGHLIGHTS**: Shiny surfaces (wood tabletops, glass, lacquered furniture) must show reflections consistent with the room's light sources — window reflections, ceiling light reflections. No specular highlights = flat and fake.
        - **SHARPNESS**: The output must be AS SHARP as the input photo. Do NOT soften, blur, or reduce detail. Maintain crisp edges, texture clarity, and the original noise profile. Unchanged areas must be pixel-identical in sharpness.
        - **ANTI-RENDER TELLS**: Avoid these common AI staging giveaways: perfectly symmetrical furniture arrangements, furniture floating above the floor, impossibly clean/new-looking items, uniform lighting on all surfaces, missing contact shadows, plastic-looking fabrics, unnaturally saturated accent colors.

        ${isGrassTask ? `
        LANDSCAPING REALISM PROTOCOL:
        - When adding grass or turf, it MUST look natural, photorealistic, and organic. 
        - DO NOT USE: Flat green colors, cartoonish textures, or uniform synthetic patterns.
        - INCLUDE: Micro-variations in blade height, "tan/brown thatch" layers at the root base, and multi-tonal greens.
        - LIGHTING: Grass must cast micro-shadows and have realistic specularity matching the scene's light source.
        - BORDERS: Natural blending with mulch, dirt, or concrete edges.` : ''}

        ${isRemovalTask ? `
        RESTORATION PROTOCOL:
        - Sample the floor and wall textures from the original image to fill gaps.
        - Prioritize "Vacant Home" look—clean, empty, and spacious.` : ''}

        FRAMING PROTOCOL (CRITICAL — HIGHEST PRIORITY):
        - The output image MUST have the EXACT same framing, crop, field of view, and zoom level as the input.
        - Do NOT zoom in, zoom out, shift, pan, re-crop, or change the camera angle in any way.
        - Every wall edge, ceiling line, floor boundary, window edge, and door frame must remain at the EXACT same pixel position.
        - If the original shows 3 feet of ceiling, the output must show 3 feet of ceiling — not less.
        - The edges of the image (all four borders) must show the same content as the input edges.
        - NEVER tighten the frame. NEVER lose any part of the original scene at the edges.
        - Think of it as: the camera is LOCKED in place. Only the furniture changes.

        STAGING PROTOCOL:
        - Only add furniture that aligns with the vanishing points of the existing floor.
        - Ensure soft contact shadows where furniture meets the floor.

        ROOM SCALE ANALYSIS (CRITICAL — READ THE ROOM SIZE FIRST):
        - Before selecting ANY furniture, estimate the room's real-world dimensions using visual cues: standard door height (~6'8"), outlet height (~12" from floor), window sizes, ceiling height, and visible floor area.
        - SMALL ROOMS (under ~12x12 ft): Use compact furniture ONLY. Bedrooms get a full or queen bed (NOT king), one nightstand max per side, no bench/chaise. Living rooms get a loveseat or small sofa, not a sectional. No oversized area rugs.
        - MEDIUM ROOMS (~12x14 ft): Standard furniture is fine. Queen bed with two small nightstands. Standard 3-seat sofa.
        - LARGE ROOMS (over ~14x16 ft): King bed is acceptable. Sectional sofas, accent chairs, larger furniture groupings are appropriate.
        - The furniture must look like it ACTUALLY FITS — if a piece would leave less than 24 inches of walkable space on any side, it is too large for the room.
        - When in doubt, go SMALLER. Undersized furniture looks intentional (minimalist). Oversized furniture looks like a mistake.

        SPATIAL AWARENESS & FURNITURE PLACEMENT (CRITICAL):
        - Before placing ANY furniture, mentally map the room layout: identify all doors (open or closed), doorways, hallways, walkways, windows, and traffic paths.
        - NEVER place furniture in front of a doorway, in a door swing path, or blocking a hallway entrance. Doorways and passages must remain fully clear and walkable.
        - NEVER place furniture where it would block a window or overlap with a wall opening.
        - Maintain realistic walking clearance: at least 36 inches (visual equivalent) around beds, between seating and walls, and in any path a person would walk.
        - If a door is open in the photo, keep the entire door swing arc clear of furniture. Nightstands, chairs, and tables must not encroach into the doorway zone.
        - Furniture legs must sit flat on the floor plane — no floating, no clipping through walls or other objects.
        - Group furniture logically: nightstands flanking a bed, dining chairs around a table, not scattered randomly. Maintain functional room flow.`
      },
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: clean
        }
      }
    ];

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

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config
    });

    const images = extractAllImagesFromResponse(response);
    if (images.length > 0) return images;
    throw new Error("No image generated.");
  } catch (error: any) {
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
    const clean = cleanBase64(imageBase64);
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
    const clean = cleanBase64(imageBase64);

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
export const virtualTwilight = async (imageBase64: string, isPro: boolean = false): Promise<string> => {
  const ai = getAI();
  const clean = cleanBase64(imageBase64);

  const response = await ai.models.generateContent({
    model: isPro ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview',
    contents: [
      {
        parts: [
          {
            text: `Convert this daytime exterior real estate photo to a natural twilight / dusk look.

THIS IS A LIGHTING-ONLY EDIT. You are changing ONLY the sky and ambient light.

DO (lighting changes only):
- Replace the sky with a realistic dusk gradient (deep blue to warm orange at horizon)
- Shift ambient light to golden hour — warmer tones, softer shadows
- Make windows that are ALREADY VISIBLE glow with warm interior light
- If exterior lights (porch lights, sconces) ALREADY EXIST in the photo, turn them on

ABSOLUTE PROHIBITIONS — ZERO TOLERANCE:
- Do NOT add ANY new objects. Nothing. Not a single item that is not already in the photo.
- Do NOT add pathway lights, landscape lights, uplights, string lights, lanterns, potted plants, bushes, furniture, planters, or decorative items.
- Do NOT add door handles, house numbers, mailboxes, welcome mats, or any detail not already present.
- Do NOT change the landscaping, yard, driveway, walkways, fencing, or any physical surface.
- Do NOT change, add, or remove any architectural element — windows, doors, trim, siding, roof.
- Do NOT improve or "fix" anything about the house. It must be IDENTICAL except for lighting/sky.

FRAMING:
- Do NOT zoom in. Maintain the EXACT same framing, crop, and field of view. Camera is locked.

Count the objects in the original. The output must have the EXACT same number of objects. If you added anything, you failed.

The result should look like the SAME photo taken at dusk — nothing added, nothing removed, nothing changed except light and sky.`
          },
          { inlineData: { mimeType: 'image/jpeg', data: clean } },
        ],
      }
    ],
    config: {
      imageConfig: {
        numberOfImages: 1,
      },
    },
  });

  const image = extractImageFromResponse(response);
  if (image) return image;
  throw new Error('No twilight image generated');
};


/**
 * Sky Replacement: Replaces a dull, overcast, or plain sky in any exterior
 * photo with a dramatic, photorealistic alternative (blue sky, dramatic clouds,
 * golden sunset, etc.) while perfectly preserving the ground and architecture.
 */
export const replaceSky = async (imageBase64: string, skyStyle: 'blue' | 'dramatic' | 'golden' | 'stormy' = 'blue', isPro: boolean = false): Promise<string> => {
  const ai = getAI();
  const clean = cleanBase64(imageBase64);

  const skyDescriptions: Record<typeof skyStyle, string> = {
    blue: 'a vibrant, deep blue sky with a few fluffy white clouds and brilliant golden sunlight',
    dramatic: 'a dramatic sky with large billowing storm clouds backlit by golden light',
    golden: 'a warm golden-hour sunset sky with brilliant orange and amber hues',
    stormy: 'a moody stormy sky with dark charcoal clouds and dramatic lighting',
  };

  const response = await ai.models.generateContent({
    model: isPro ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview',
    contents: [
      {
        parts: [
          { text: `Replace ONLY the sky in this exterior real estate photo with ${skyDescriptions[skyStyle]}.

PRESERVATION RULES:
- PRESERVE all architecture, rooflines, chimneys, antennas, and structural elements with pixel-perfect edges.
- PRESERVE all trees, landscaping, and foliage — maintain their exact silhouettes against the new sky.
- PRESERVE the ground plane entirely: driveway, walkways, lawn, fencing, vehicles.

BLENDING REQUIREMENTS:
- The horizon line and roofline edges must be razor-sharp with no halos, fringing, or ghosting artifacts.
- Tree branches and leaves must have natural, clean edges against the new sky — no color bleeding.
- The new sky's lighting must affect the building subtly: a golden sky should cast warm tones on light-colored surfaces; a stormy sky should slightly cool the building's appearance.
- Ensure cloud scale and perspective match the camera's focal length and angle.` },
          { inlineData: { mimeType: 'image/jpeg', data: clean } },
        ],
      }
    ],
  });

  const image = extractImageFromResponse(response);
  if (image) return image;
  throw new Error('No sky replacement image returned');
};

/**
 * Instant Declutter ("Vacant Mode"): Analyzes the room and removes all personal
 * items — family photos, kids' toys, pet items, counter clutter, laundry —
 * while preserving all furniture, architecture, and structural elements.
 */
export const instantDeclutter = async (imageBase64: string, selectedRoom: string, isPro: boolean = false): Promise<string> => {
  const ai = getAI();
  const clean = cleanBase64(imageBase64);

  const response = await ai.models.generateContent({
    model: isPro ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview',
    contents: [
      {
        parts: [
          {
            text: `You are an expert real estate photo editor. Your ONLY job is to remove small personal clutter from this ${selectedRoom}. This is a MINIMAL edit — NOT a redesign.

CRITICAL RULES (HIGHEST PRIORITY):
- Do NOT change, replace, or restyle ANY furniture. Every piece of furniture must remain EXACTLY as it appears — same style, same color, same fabric, same position.
- Do NOT change bedding, pillows, rugs, curtains, or any soft furnishings. Leave them EXACTLY as they are.
- Do NOT change wall colors, floor colors, or any surface colors.
- Do NOT zoom in. Maintain the EXACT same framing, crop, and field of view. The camera is locked.
- The output should be nearly IDENTICAL to the input — just cleaner.

COLOR & QUALITY PRESERVATION (CRITICAL):
- Do NOT desaturate, mute, or shift the colors of ANYTHING in the image.
- Maintain the EXACT same color temperature, saturation, brightness, and contrast as the original.
- Walls, floors, furniture, fabrics, and all surfaces must keep their original vivid colors.
- Do NOT apply any color grading, tone mapping, or mood shift. The image is NOT being re-lit.
- If the original has warm tones, the output must have warm tones. If cool, stay cool. Match exactly.
- Do NOT soften, blur, or reduce the sharpness of the image. The output must be AS SHARP as the input.
- Maintain the original image's detail level, texture clarity, and edge crispness pixel-for-pixel.
- Areas that were NOT edited must be IDENTICAL to the input — same sharpness, same noise profile, same detail.

REMOVE ONLY THESE (small personal items):
- Personal photos and children's drawings
- Toys, pet items
- Visible laundry, shoes, bags on the floor
- Countertop clutter: mail, keys, loose bottles, random cups
- Bathroom toiletries on counters
- Visible cords and cables on the floor
- Refrigerator magnets, sticky notes

KEEP EVERYTHING ELSE EXACTLY AS-IS:
- ALL furniture — same style, same color, same position
- ALL bedding, pillows, throws, rugs — unchanged
- ALL architecture, fixtures, fans, vents, outlets
- ALL curtains, blinds, lamps
- ALL decorative items (vases, plants, books)
- ALL appliances

RESTORATION:
- Where small items are removed, fill with the surrounding floor/wall texture seamlessly.
- Maintain consistent lighting.
- If nothing needs removing, return the image unchanged.`
          },
          { inlineData: { mimeType: 'image/jpeg', data: clean } },
        ],
      }
    ],
    config: {
      imageConfig: {
        numberOfImages: 1,
      },
    },
  });

  const image = extractImageFromResponse(response);
  if (image) return image;
  throw new Error('No decluttered image returned');
};

/**
 * Virtual Renovation: Shows a photorealistic preview of what a space would look
 * like with specific renovation changes (new cabinets, countertops, flooring, etc.)
 * without changing the overall room layout or architecture.
 */
export const virtualRenovation = async (
  imageBase64: string,
  changes: { cabinets?: string; countertops?: string; flooring?: string; walls?: string; fixtures?: string }
): Promise<string> => {
  const ai = getAI();
  const clean = cleanBase64(imageBase64);

  const changesList = [
    changes.cabinets && `Cabinets: ${changes.cabinets}`,
    changes.countertops && `Countertops: ${changes.countertops}`,
    changes.flooring && `Flooring: ${changes.flooring}`,
    changes.walls && `Walls: ${changes.walls}`,
    changes.fixtures && `Fixtures: ${changes.fixtures}`,
  ].filter(Boolean).join(', ');

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: [
      {
        parts: [
          { text: `Act as a Master Architectural Photo Editor specializing in virtual renovation previews for real estate.

RENOVATION ASSIGNMENT: ${changesList}

CRITICAL RULES:
1. **ARCHITECTURAL INTEGRITY**: Preserve ALL doors, windows, ceiling fixtures, vents, outlets, and structural elements exactly as they appear. Do NOT modify the room layout, dimensions, or structural shell.
2. **MATERIAL REALISM**: New materials must show realistic detail — wood grain direction, stone veining patterns, grout lines, edge profiles, and surface reflections appropriate to the material type.
3. **LIGHTING CONTINUITY**: New surfaces must reflect the existing ambient light direction and temperature. Glossy countertops reflect windows. Matte surfaces absorb light naturally. Shadows under cabinets must match the original light source.
4. **SEAMLESS TRANSITIONS**: Where new materials meet existing elements (e.g., new countertop meets existing backsplash), the junction must look architecturally correct with proper trim, caulk lines, or edge treatments.
5. **PERSPECTIVE MATCH**: New elements must follow the original vanishing points and lens distortion exactly. Cabinet doors must align with the room's perspective grid.
6. **COLOR HARMONY**: New materials should look plausible in the existing room's color temperature. Warm-toned wood in a cool-lit room needs subtle color adaptation to look natural.` },
          { inlineData: { mimeType: 'image/jpeg', data: clean } },
        ],
      }
    ],
  });

  const image = extractImageFromResponse(response);
  if (image) return image;
  throw new Error('No renovation image returned');
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
  options?: { styleNotes?: string; propertyDetails?: ListingCopyPropertyDetails; tone?: ListingCopyTone }
): Promise<{
  headline: string;
  description: string;
  socialCaption: string;
  hashtags: string[];
}> => {
  const ai = getAI();
  const clean = cleanBase64(imageBase64);

  const tone = options?.tone || 'casual';
  const details = options?.propertyDetails;
  const styleNotes = options?.styleNotes;

  const toneInstructions: Record<ListingCopyTone, string> = {
    luxury: 'Write in a sophisticated, elevated tone. Emphasize architectural integrity, premium materials, and exclusivity. Avoid clichés like "stunning", "gorgeous", or "dream home".',
    casual: 'Write in a warm, approachable tone. Paint a picture of everyday life in this space. Use "you" language. Be genuine, not salesy.',
    investment: 'Write in a data-driven, analytical tone. Emphasize ROI potential, market position, and investment fundamentals. Use precise terminology.',
  };

  const propertyContext = details
    ? `\n\nPROPERTY DETAILS:\n${details.address ? `- Address: ${details.address}` : ''}${details.beds ? `\n- Bedrooms: ${details.beds}` : ''}${details.baths ? `\n- Bathrooms: ${details.baths}` : ''}${details.sqft ? `\n- Square Footage: ${details.sqft.toLocaleString()}` : ''}${details.price ? `\n- Price: $${details.price.toLocaleString()}` : ''}`
    : '';

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
      }
    },
  });

  return response.text
    ? JSON.parse(response.text)
    : { headline: '', description: '', socialCaption: '', hashtags: [] };
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
  const clean = cleanBase64(imageBase64);

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
  const clean = cleanBase64(imageBase64);

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

