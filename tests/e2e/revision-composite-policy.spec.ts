import { test, expect } from '@playwright/test';
import { shouldSkipCompositeForRevision } from '../../utils/revisionCompositePolicy';

test.describe('revision composite policy', () => {
  test('skips composite for spatial-move revisions', () => {
    expect(
      shouldSkipCompositeForRevision({
        fromPack: false,
        isRestageWithRemoval: false,
        isSpatialMove: true,
      })
    ).toBe(true);
  });

  test('skips composite for restage-with-removal prompts', () => {
    expect(
      shouldSkipCompositeForRevision({
        fromPack: false,
        isRestageWithRemoval: true,
        isSpatialMove: false,
      })
    ).toBe(true);
  });

  test('still allows composite for ordinary stacked staging edits', () => {
    expect(
      shouldSkipCompositeForRevision({
        fromPack: false,
        isRestageWithRemoval: false,
        isSpatialMove: false,
      })
    ).toBe(false);
  });
});
