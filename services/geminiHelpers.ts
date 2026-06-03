/**
 * Shared image/base64 helpers.
 *
 * NOTE: browser-side Gemini is purged. These helpers no longer import
 * '@google/genai' (which would drag the SDK into the client bundle). The
 * response shape is typed locally so the surviving callers (legacy /api
 * response parsing, if any) keep compiling without the SDK. cleanBase64 is the
 * only export still used by live server-backed services.
 */

/** Minimal structural type for the part of a generative response we read. */
interface InlineDataResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ inlineData?: { data?: string } | null }>;
    };
  }>;
}

/** Strip the data-URL prefix from a base64-encoded image string. */
export const cleanBase64 = (imageBase64: string): string =>
  imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

/**
 * Extract the first generated image from a generative response.
 * Returns a data-URL string (data:image/png;base64,...) or null if none found.
 */
export const extractImageFromResponse = (
  response: InlineDataResponse,
): string | null => {
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData?.data) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
};

/**
 * Extract ALL generated images from a generative response.
 * Returns an array of data-URL strings.
 */
export const extractAllImagesFromResponse = (
  response: InlineDataResponse,
): string[] => {
  const images: string[] = [];
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData?.data) {
      images.push(`data:image/png;base64,${part.inlineData.data}`);
    }
  }
  return images;
};
