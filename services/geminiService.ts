
import { GoogleGenAI, Type, Chat, GenerateContentResponse } from "@google/genai";
import { ColorData, StagedFurniture, FurnitureRoomType } from "../types";

// API key must be set via environment variable — no hardcoded fallback for security.
const RESOLVED_API_KEY =
  process.env.API_KEY ||
  (import.meta as any)?.env?.VITE_GEMINI_API_KEY ||
  '';

// Helper to get fresh AI instance
const getAI = () => {
  if (!RESOLVED_API_KEY) throw new Error('API_KEY_REQUIRED');
  return new GoogleGenAI({ apiKey: RESOLVED_API_KEY });
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
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

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
              data: cleanBase64
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
  isHighRes: boolean = false
): Promise<string> => {
  try {
    const ai = getAI();
    const modelName = isHighRes ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

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
        1. **PERMANENT FIXTURES**: Do NOT modify or remove doors, window frames, ceiling lights, fans, vents, or outlets unless they are specifically covered by a RED MASK. If they are not masked, keep them exactly as they are in the original photo.
        2. **REVEAL THE TRUTH**: If removing an object, reveal the original background (hallways, doorways, open spaces). Do NOT "hallucinate" a new wall over a doorway or hallway.
        3. **DEPTH & PERSPECTIVE**: Maintain the room's original 3D structure.

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
          data: cleanBase64
        }
      }
    ];

    if (maskImageBase64) {
      const cleanMask = maskImageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
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
    if (isHighRes) {
      // Detect aspect ratio from the image dimensions before sending.
      const detectedRatio = await detectAspectRatioFromBase64(cleanBase64);
      config.imageConfig = {
        imageSize: "2K",
        aspectRatio: detectedRatio
      };
    }

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

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
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
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
              data: cleanBase64
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
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

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
              data: cleanBase64
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
    return [];
  }
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
    const cleanBase64 = currentImageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } });
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
  const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-preview-image-generation',
    contents: [{
      role: 'user',
      parts: [
        {
          text: `Transform this exterior real estate photo into a stunning virtual twilight / golden-hour dusk shot.
        REQUIREMENTS:
        - Convert sky to a dramatic sunset gradient (deep navy → orange → gold horizon glow)
        - Illuminate ALL windows with warm interior amber/cream light glowing from inside
        - Add warm exterior accent lighting: porch lights ON, pathway glowing, landscape uplighting
        - Keep all architecture, landscaping, driveway exactly as they appear
        - Photorealistic professional real estate twilight photo quality` },
        { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
      ],
    }],
    config: { responseModalities: ['IMAGE', 'TEXT'] },
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data) throw new Error('No twilight image generated');
  return `data:image/${imagePart.inlineData.mimeType.split('/')[1]};base64,${imagePart.inlineData.data}`;
};


/**
 * Sky Replacement: Replaces a dull, overcast, or plain sky in any exterior
 * photo with a dramatic, photorealistic alternative (blue sky, dramatic clouds,
 * golden sunset, etc.) while perfectly preserving the ground and architecture.
 */
export const replaceSky = async (imageBase64: string, skyStyle: 'blue' | 'dramatic' | 'golden' | 'stormy' = 'blue'): Promise<string> => {
  const ai = getAI();
  const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  const skyDescriptions: Record<typeof skyStyle, string> = {
    blue: 'a vibrant, deep blue sky with a few fluffy white cumulus clouds and brilliant golden sunlight from right of frame',
    dramatic: 'a dramatic sky with large billowing storm clouds backlit by golden light, rays of sun breaking through — epic and cinematic',
    golden: 'a warm golden-hour sunset sky with brilliant orange, amber, and purple hues — rich and romantic',
    stormy: 'a moody stormy sky with dark charcoal clouds and dramatic lighting — powerful but not threatening',
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-preview-image-generation',
    contents: [{
      role: 'user',
      parts: [
        { text: `Replace ONLY the sky in this exterior real estate photo with ${skyDescriptions[skyStyle]}. PRESERVE EVERYTHING else — the building, landscaping, driveway, foreground — with absolute precision. The horizon line must be perfect. Photorealistic result only.` },
        { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
      ],
    }],
    config: { responseModalities: ['IMAGE', 'TEXT'] },
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data) throw new Error('No sky replacement image returned');
  return `data:image/${imagePart.inlineData.mimeType.split('/')[1]};base64,${imagePart.inlineData.data}`;
};

/**
 * Instant Declutter ("Vacant Mode"): Analyzes the room and removes all personal
 * items — family photos, kids' toys, pet items, counter clutter, laundry —
 * while preserving all furniture, architecture, and structural elements.
 */
export const instantDeclutter = async (imageBase64: string, selectedRoom: string): Promise<string> => {
  const ai = getAI();
  const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-preview-image-generation',
    contents: [{
      role: 'user',
      parts: [
        {
          text: `You are an expert real estate photo editor. Remove ALL personal clutter from this ${selectedRoom} photo while preserving all furniture, fixtures, architecture, and structural elements exactly as they are.

        REMOVE (if visible): family photos and artwork, children's toys and games, pet items (bowls, beds, toys), counter clutter (small appliances, mail, dishes), personal hygiene items, laundry or clothing, trash, magnets on fridges, pill bottles, personal papers.
        
        KEEP EXACTLY: all furniture, couches, beds, tables, chairs, all built-in appliances, kitchen/bath fixtures, windows, doors, ceiling fans, light fixtures, area rugs, curtains, plants, and all architectural elements.
        
        The result should look like a clean, staged, move-in-ready space ready for professional photography. Photorealistic quality only.` },
        { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
      ],
    }],
    config: { responseModalities: ['IMAGE', 'TEXT'] },
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data) throw new Error('No decluttered image returned');
  return `data:image/${imagePart.inlineData.mimeType.split('/')[1]};base64,${imagePart.inlineData.data}`;
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
  const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  const changesList = [
    changes.cabinets && `Cabinets: Replace with ${changes.cabinets}`,
    changes.countertops && `Countertops: Replace with ${changes.countertops}`,
    changes.flooring && `Flooring: Replace with ${changes.flooring}`,
    changes.walls && `Walls: Repaint with ${changes.walls}`,
    changes.fixtures && `Fixtures/Hardware: Replace with ${changes.fixtures}`,
  ].filter(Boolean).join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-preview-image-generation',
    contents: [{
      role: 'user',
      parts: [
        {
          text: `Apply these SPECIFIC renovation changes to this real estate photo: ${changesList}
        
        RULES:
        - Only change what is listed above. Leave everything else IDENTICAL to the original.
        - Maintain EXACT room layout, dimensions, lighting, and perspective.
        - The result must look like a professional before/after renovation photo.
        - Photorealistic only — no artistic styles or illustration.` },
        { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
      ],
    }],
    config: { responseModalities: ['IMAGE', 'TEXT'] },
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data) throw new Error('No renovation image returned');
  return `data:image/${imagePart.inlineData.mimeType.split('/')[1]};base64,${imagePart.inlineData.data}`;
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
  const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro-preview-05-06',
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
        { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
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

