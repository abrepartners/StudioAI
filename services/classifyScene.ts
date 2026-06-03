/**
 * services/classifyScene.ts — NEUTRALIZED.
 *
 * This was a per-upload browser Gemini call (the "silent charger"): every photo
 * dropped into the editor fired a GoogleGenAI request to classify interior vs
 * exterior. That path is removed. The HUB agent removes the only live caller in
 * VellumPhotoEditor; this stub stays so the import keeps compiling.
 *
 * No '@google/genai' import, no key read, no network. Auto interior/exterior
 * detection is gone — room/scene context now comes from the manual "Tag room
 * types" modal (defaulting to Living Room / interior).
 */

export async function classifyScene(
  _imageBase64: string,
): Promise<"interior" | "exterior"> {
  // Safe default. No AI call on upload.
  return "interior";
}
