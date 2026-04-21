import { test, expect } from '@playwright/test';
import { shouldPreserveOriginalPixelsOnExport } from '../../utils/exportImagePolicy';

test.describe('export image policy', () => {
  test('skips original-pixel preserve for direct cleanup exports', () => {
    expect(shouldPreserveOriginalPixelsOnExport(['cleanup'])).toBe(false);
    expect(shouldPreserveOriginalPixelsOnExport(['staging', 'cleanup'])).toBe(false);
    expect(shouldPreserveOriginalPixelsOnExport(['furniture-removal'])).toBe(false);
  });

  test('allows preserve for staging exports and after cleanup has been committed', () => {
    expect(shouldPreserveOriginalPixelsOnExport([])).toBe(true);
    expect(shouldPreserveOriginalPixelsOnExport(['staging'])).toBe(true);
    expect(shouldPreserveOriginalPixelsOnExport(['cleanup', 'commit', 'staging'])).toBe(true);
    expect(shouldPreserveOriginalPixelsOnExport(['cleanup', 'commit'])).toBe(true);
  });
});
