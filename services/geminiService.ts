
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

/**
 * Maps an image's dimensions to the closest supported Gemini aspect ratio.
 */
const getSupportedAspectRatio = (width: number, height: number): "1:1" | "3:4" | "4:3" | "9:16" | "16:9" => {
  const ratio = width / height;
  if (ratio > 1.5) return "16:9";
  if (ratio > 1.1) return "4:3";
  if (ratio < 0.6) return "9:16";
  if (ratio < 0.9) return "3:4";
  return "1:1";
};

/**
 * Decodes a base64 image and detects its actual aspect ratio by reading pixel dimensions.
 */
const detectAspectRatioFromBase64 = (base64: string): Promise<"1:1" | "3:4" | "4:3" | "9:16" | "16:9"> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(getSupportedAspectRatio(img.naturalWidth, img.naturalHeight));
    img.onerror = () => resolve("4:3"); // fallback
    img.src = `data:image/jpeg;base64,${base64}`;
  });
};

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
      }
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
  count = 1
): Promise<string[]> => {
  try {
    const ai = getAI();
    const modelName = 'gemini-3.1-flash-image-preview';
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

        VISUAL QUALITY REQUIREMENTS:
        - **VIBRANCY**: Ensure rich, natural color saturation. Avoid desaturated or "grayish" tones. Enhance the colors to look like professional HDR real estate photography.
        - **LIGHTING**: Match the direction and temperature of the original ambient light. Add realistic shadows for all new furniture to "anchor" them to the floor.
        - **TEXTURE**: Use high-resolution realistic materials (leather, wood grain, fabric weave).

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

        STAGING PROTOCOL:
        - Only add furniture that aligns with the vanishing points of the existing floor.
        - Ensure soft contact shadows where furniture meets the floor.`
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

    const config: any = {};
    const detectedRatio = await detectAspectRatioFromBase64(clean);
    config.imageConfig = {
      imageSize: "2K",
      aspectRatio: detectedRatio,
      numberOfImages: count
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
      - Use the format [EDIT: <detailed prompt>] whenever you identify an image edit task so the app can process it.

      SPECIALTY MODES you can assist with:
      - Virtual Staging: Furnishing empty or sparsely furnished rooms
      - Virtual Twilight: Converting day exterior shots to golden-hour dusk
      - Declutter/Cleanup: Removing personal items and clutter to reveal clean spaces
      - Sky Replacement: Swapping bland skies with dramatic alternatives
      - Virtual Renovation: Previewing cabinet, countertop, or flooring changes
      - Style Pack Application: Applying curated design aesthetics (Coastal Modern, Urban Loft, etc.)`,
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
 * golden-hour / blue-hour dusk shot with lit windows, warm exterior lighting,
 * and a dramatic gradient sky. Preserves all architecture exactly.
 */
export const virtualTwilight = async (imageBase64: string): Promise<string> => {
  const ai = getAI();
  const clean = cleanBase64(imageBase64);

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: [
      {
        parts: [
          {
            text: `Transform this exterior real estate photo into a stunning virtual twilight / golden-hour dusk shot.
        REQUIREMENTS:
        - Convert sky to a dramatic sunset gradient (deep navy → orange → gold horizon glow)
        - Illuminate ALL windows with warm interior amber/cream light glowing from inside
        - Add warm exterior accent lighting: porch lights ON, pathway glowing, landscape uplighting
        - Keep all architecture, landscaping, driveway exactly as they appear
        - Photorealistic professional real estate twilight photo quality`
          },
          { inlineData: { mimeType: 'image/jpeg', data: clean } },
        ],
      }
    ],
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
export const replaceSky = async (imageBase64: string, skyStyle: 'blue' | 'dramatic' | 'golden' | 'stormy' = 'blue'): Promise<string> => {
  const ai = getAI();
  const clean = cleanBase64(imageBase64);

  const skyDescriptions: Record<typeof skyStyle, string> = {
    blue: 'a vibrant, deep blue sky with a few fluffy white clouds and brilliant golden sunlight',
    dramatic: 'a dramatic sky with large billowing storm clouds backlit by golden light',
    golden: 'a warm golden-hour sunset sky with brilliant orange and amber hues',
    stormy: 'a moody stormy sky with dark charcoal clouds and dramatic lighting',
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: [
      {
        parts: [
          { text: `Replace ONLY the sky in this exterior real estate photo with ${skyDescriptions[skyStyle]}. PRESERVE EVERYTHING else. Horizon line must be perfect.` },
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
export const instantDeclutter = async (imageBase64: string, selectedRoom: string): Promise<string> => {
  const ai = getAI();
  const clean = cleanBase64(imageBase64);

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: [
      {
        parts: [
          {
            text: `You are an expert real estate photo editor. Remove ALL personal clutter from this ${selectedRoom} photo while preserving all furniture and architecture.
        REMOVE: photos, toys, pet items, counter clutter, laundry, trash.
        KEEP: furniture, appliances, windows, doors, lighting.`
          },
          { inlineData: { mimeType: 'image/jpeg', data: clean } },
        ],
      }
    ],
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
          { text: `Apply renovation changes: ${changesList}. Preserve room layout and lighting.` },
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
export const generateListingCopy = async (imageBase64: string, selectedRoom: string, styleNotes?: string): Promise<{
  headline: string;
  description: string;
  socialCaption: string;
  hashtags: string[];
}> => {
  const ai = getAI();
  const clean = cleanBase64(imageBase64);

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro',
    contents: [{
      role: 'user',
      parts: [
        {
          text: `You are an expert real estate copywriter. Analyze this ${selectedRoom} photo${styleNotes ? ` (design notes: ${styleNotes})` : ''} and generate professional listing copy.
        
        Return a JSON object with EXACTLY these fields:
        {
          "headline": "A punchy, 8-12 word MLS headline that highlights the best feature",
          "description": "A 3-4 sentence MLS description paragraph that is conversational, emotional, and conversion-focused. Describe the space authentically without clichés.",
          "socialCaption": "An Instagram/Facebook caption 2-3 sentences with emojis that creates FOMO and drives engagement",
          "hashtags": ["10-12 relevant real estate hashtags without the # symbol"]
        }
        
        Return ONLY the JSON, no other text.` },
        { inlineData: { mimeType: 'image/jpeg', data: clean } },
      ],
    }],
  });

  const text = response.text || '{}';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch?.[0] || '{}');
  } catch {
    return { headline: '', description: text, socialCaption: '', hashtags: [] };
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
          text: `You are a professional real estate copywriter. Analyze this ${roomType} photo and generate three property descriptions in different tones.

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

