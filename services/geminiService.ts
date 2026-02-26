import { GoogleGenerativeAI, GenerateContentResponse } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

let genAI: any = null;

const getAI = () => {
  if (!genAI) {
    if (!API_KEY) throw new Error("API_KEY_REQUIRED");
    genAI = new GoogleGenerativeAI(API_KEY);
  }
  return genAI;
};

export type FurnitureRoomType = 'Living Room' | 'Bedroom' | 'Dining Room' | 'Office' | 'Kitchen' | 'Primary Bedroom' | 'Exterior';

export interface StagedFurniture {
  id: string;
  name: string;
  image: string;
  category: string;
  orientation: 'front' | 'left' | 'right' | 'back' | 'top';
  scale: number;
  position: { x: number; y: number };
}

const detectAspectRatioFromBase64 = (base64: string): Promise<"1:1" | "3:4" | "4:3" | "9:16" | "16:9"> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      if (Math.abs(ratio - 1) < 0.1) resolve("1:1");
      else if (Math.abs(ratio - 0.75) < 0.1) resolve("3:4");
      else if (Math.abs(ratio - 1.33) < 0.1) resolve("4:3");
      else if (Math.abs(ratio - 0.56) < 0.1) resolve("9:16");
      else if (Math.abs(ratio - 1.77) < 0.1) resolve("16:9");
      else resolve("4:3");
    };
    img.onerror = () => resolve("4:3");
    img.src = base64;
  });
};

export const detectRoomType = async (imageBase64: string): Promise<FurnitureRoomType> => {
  try {
    const ai = getAI();
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

    const response = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: "Detect the room type in this photo. Return ONLY one of: Living Room, Bedroom, Dining Room, Office, Kitchen, Primary Bedroom, Exterior." },
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } }
        ]
      }]
    });

    const text = response.response.text().trim() as FurnitureRoomType;
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
  count: number = 1
): Promise<string | string[]> => {
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

        CORE DIRECTIVES:
        - Maintain pixel-perfect structure of existing walls, windows, and floors.
        - Lighting must match context exactly (color temp, direction, intensity).
        - Use ultra-high quality textures for any added elements.
        ${isRemovalTask ? `- REMOVAL MODE: Smoothly patch areas where items are removed using surrounding textures.` : ''}
        ${isGrassTask ? `- Exterior: Replace brown/patchy grass with lush, vibrant green Bermuda or Kentucky Bluegrass. Edge naturally against walkways.` : ''}
        ${prompt.toLowerCase().includes('declutter') ? `
        - DECLUTTER PROTOCOL:
        - Remove small items, personal effects, and mess.
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
      const detectedRatio = await detectAspectRatioFromBase64(cleanBase64);
      config.imageConfig = {
        imageSize: "2K",
        aspectRatio: detectedRatio,
        numberOfImages: count
      };
    } else {
      config.imageConfig = {
        numberOfImages: count
      };
    }

    const response: GenerateContentResponse = await ai.getGenerativeModel({ model: modelName }).generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: config
    });

    const results: string[] = [];
    if (response.response.candidates) {
      for (const candidate of response.response.candidates) {
        if (candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData?.data) {
              results.push(`data:image/png;base64,${part.inlineData.data}`);
            }
          }
        }
      }
    }

    if (results.length === 0) throw new Error("No image generated.");
    return results.length === 1 ? results[0] : results;
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

    const model = ai.getGenerativeModel({ model: 'gemini-3-flash-preview' });
    const response = await model.generateContent({
      contents: [{
        role: 'user',
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
      }]
    });

    const text = response.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch?.[0] || '{}');
  } catch (error) {
    console.error("Auto-arrange failed:", error);
    return {};
  }
};

export const analyzeDesign = async (
  imageBase64: string,
  selectedRoom: string,
  styleNotes: string
): Promise<{ headline: string; description: string; socialCaption: string; hashtags: string[] }> => {
  const ai = getAI();
  const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  const model = ai.getGenerativeModel({ model: 'gemini-3.1-pro' });
  const response = await model.generateContent({
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

  const text = response.response.text() || '{}';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch?.[0] || '{}');
  } catch {
    return { headline: '', description: text, socialCaption: '', hashtags: [] };
  }
};
