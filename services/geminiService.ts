
import { GoogleGenAI, Type, Chat, GenerateContentResponse } from "@google/genai";
import { ColorData, StagedFurniture, FurnitureRoomType } from "../types";

const FALLBACK_BETA_API_KEY = "AIzaSyBZs7gw_x2kauRi5Fdbfu9ViQtMwrNvAuA";
const RESOLVED_API_KEY =
  process.env.API_KEY ||
  (import.meta as any)?.env?.VITE_GEMINI_API_KEY ||
  FALLBACK_BETA_API_KEY;

// Helper to get fresh AI instance
const getAI = () => new GoogleGenAI({ apiKey: RESOLVED_API_KEY });

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
      // Determine Aspect Ratio to maintain export consistency
      // In a real app, we'd get this from the image element, 
      // here we assume common real estate 4:3 or 16:9 or detect from data.
      // For safety in this environment, we attempt to stay as neutral as possible 
      // or default to common ratios if detection is complex.
      config.imageConfig = {
        imageSize: "2K",
        aspectRatio: "4:3" // Defaulting to high-quality real estate standard
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
    model: 'gemini-3.1-pro-preview',
    config: {
      systemInstruction: `You are a Real Estate Design Consultant. Preservation of doors, windows, and light fixtures is your top priority. If asked to remove objects, reveal the space behind them. For landscaping, prioritize photorealism. Use [EDIT: prompt] for image tasks.`,
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
