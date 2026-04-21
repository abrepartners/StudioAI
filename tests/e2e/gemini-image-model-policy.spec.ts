import { test, expect } from '@playwright/test';
import {
  getImageGenerationModelCandidates,
  isGeminiImageModelBusyError,
} from '../../services/geminiImageModelPolicy';

test.describe('gemini image model policy', () => {
  test('uses pro first and flash as fallback for pro image generation', () => {
    expect(getImageGenerationModelCandidates(true)).toEqual([
      'gemini-3-pro-image-preview',
      'gemini-3.1-flash-image-preview',
    ]);
    expect(getImageGenerationModelCandidates(false)).toEqual([
      'gemini-3.1-flash-image-preview',
    ]);
  });

  test('detects model-busy overload responses', () => {
    expect(isGeminiImageModelBusyError({
      code: 503,
      status: 'UNAVAILABLE',
      message: 'This model is currently experiencing high demand. Please try again later.',
    })).toBe(true);

    expect(isGeminiImageModelBusyError(new Error('503 UNAVAILABLE: currently experiencing high demand'))).toBe(true);
    expect(isGeminiImageModelBusyError(new Error('API_KEY_REQUIRED'))).toBe(false);
  });
});
