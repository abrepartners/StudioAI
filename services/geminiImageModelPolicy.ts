const PRO_IMAGE_MODEL = 'gemini-3-pro-image-preview';
const FLASH_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

export function getImageGenerationModelCandidates(isPro: boolean): string[] {
  return isPro ? [PRO_IMAGE_MODEL, FLASH_IMAGE_MODEL] : [FLASH_IMAGE_MODEL];
}

export function isGeminiImageModelBusyError(error: unknown): boolean {
  if (!error) return false;
  const message = String((error as { message?: string }).message || '').toLowerCase();
  const status = String((error as { status?: string }).status || '').toLowerCase();
  const code = String((error as { code?: string | number }).code || '').toLowerCase();

  return (
    code === '503' ||
    status === 'unavailable' ||
    message.includes('currently experiencing high demand') ||
    message.includes('status: unavailable') ||
    message.includes('503')
  );
}
