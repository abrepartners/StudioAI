import { GoogleGenAI } from "@google/genai";
import { cleanBase64 } from "./geminiHelpers";
import { resizeForUpload } from "../utils/resizeForUpload";
import { getActiveApiKey } from "./geminiService";

export async function classifyScene(
  imageBase64: string,
): Promise<"interior" | "exterior"> {
  try {
    const key = getActiveApiKey();
    if (!key) return "interior";

    const ai = new GoogleGenAI({ apiKey: key });
    const clean = cleanBase64(await resizeForUpload(imageBase64));

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            text: "Is this photo an interior or exterior scene? Reply with exactly one word: interior or exterior",
          },
          { inlineData: { mimeType: "image/jpeg", data: clean } },
        ],
      },
      config: { temperature: 0.1 },
    });

    const text = (response.text || "").trim().toLowerCase();
    return text === "exterior" ? "exterior" : "interior";
  } catch (e) {
    console.warn("[classifyScene] failed, defaulting to interior", e);
    return "interior";
  }
}
