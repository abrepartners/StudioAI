import type { GenerateContentResponse } from "@google/genai";

/**
 * Shared Gemini service helpers — eliminates duplication across service functions.
 */

/** Strip the data-URL prefix from a base64-encoded image string. */
export const cleanBase64 = (imageBase64: string): string =>
  imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

/**
 * Extract the first generated image from a Gemini response.
 * Returns a data-URL string (data:image/png;base64,...) or null if none found.
 */
export const extractImageFromResponse = (response: GenerateContentResponse): string | null => {
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData?.data) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
};

/**
 * Extract ALL generated images from a Gemini response.
 * Returns an array of data-URL strings.
 */
export const extractAllImagesFromResponse = (response: GenerateContentResponse): string[] => {
  const images: string[] = [];
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData?.data) {
      images.push(`data:image/png;base64,${part.inlineData.data}`);
    }
  }
  return images;
};
