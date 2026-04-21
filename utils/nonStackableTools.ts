// utils/nonStackableTools.ts
// Policy: which Pro AI Tools are non-stackable (always operate on the
// original upload, never on a prior AI-edited version).
//
// Rationale: tools like Smart Cleanup produce ghost artifacts when run on top
// of a previously-staged image because the composite step blends stale
// furniture/decor back into the edited regions. Running on the original avoids
// the problem entirely.

export type NonStackableToolId = 'cleanup';

export const NON_STACKABLE_TOOLS: ReadonlySet<NonStackableToolId> = new Set([
  'cleanup',
]);

/**
 * Should we prompt the user before running this tool?
 * Returns true when:
 *   1. The tool is in the non-stackable set, AND
 *   2. There is an AI-edited image currently showing (currentImage differs
 *      from originalImage — i.e. the user has already run a generation).
 *
 * If false, the caller should proceed directly with currentImage.
 */
export function shouldPromptNonStackable(
  tool: string,
  currentImage: string | null,
  originalImage: string | null,
): boolean {
  if (!NON_STACKABLE_TOOLS.has(tool as NonStackableToolId)) return false;
  if (!currentImage || !originalImage) return false;
  return currentImage !== originalImage;
}
