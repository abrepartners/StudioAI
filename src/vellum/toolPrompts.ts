/**
 * src/vellum/toolPrompts.ts
 *
 * Shared, single-source prompt builders for the tools whose prompt is
 * constructed CLIENT-side. Both the production editor (callApiDirect) and
 * the admin Model Lab import from here, so what the lab tests is byte-for-byte
 * what production ships — no drift.
 *
 * Tools whose prompt already lives in an exported builder are NOT duplicated
 * here; import them from their home module instead:
 *   - Staging   → buildStagingAssignment (src/prompts/stylePacks.ts)
 *   - Declutter → buildCleanupPrompt     (services/fluxService.ts)
 * Tools whose prompt is built SERVER-side (twilight, sky, renovation) have no
 * client prompt to share.
 */

/**
 * Magic edit: one free-text instruction routed through the nano-banana-pro
 * whole-frame path (the same engine declutter runs on) as a customPrompt.
 * Kept identical between the editor and the lab via this single definition.
 */
export function buildMagicEditPrompt(
  roomLabel: string,
  instruction: string,
): string {
  return `Edit this photo${roomLabel ? ` of a ${roomLabel.toLowerCase()}` : ""}. Instruction: ${instruction}. Apply ONLY this change. Add, remove, or clean exactly what is asked and make it photorealistic — match the scene's existing lighting, perspective, materials, shadows, and color temperature so the edit is seamless. Keep everything the instruction does not mention — architecture, layout, fixtures, furniture, camera angle, framing, and exposure — identical to the input. Do not restyle, relight, or regenerate the rest of the scene.`;
}
