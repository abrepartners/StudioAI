# Staging Quality Audit Skill

## Purpose
Validates AI-generated real estate staging images against architectural integrity
rules and photorealism standards. Use this skill after generating staging images
to catch quality issues before delivery.

## When to Trigger
- After any image generation (staging, declutter, renovation, twilight)
- When a user reports a generated image "looks off" or has artifacts
- During batch processing to flag low-quality outputs for re-generation

## Quality Criteria

### Architectural Integrity (Critical — weighted 2x)
- Doors, windows, ceiling fixtures must be IDENTICAL to original
- No hallucinated windows, doors, or light switches
- Structural openings (hallways, doorways) must not be blocked by new walls
- Window count, shape, and placement must match exactly

### Lighting Consistency
- Light direction must match original ambient source
- Color temperature preserved (warm/cool)
- New furniture must cast realistic contact shadows
- No double shadows or contradictory light angles

### Furniture Realism
- Materials should show realistic textures (wood grain, fabric weave, leather)
- No floating furniture — all pieces must be "grounded" to the floor
- Scale proportional to room dimensions
- No warped or distorted surfaces

### Perspective Accuracy
- Vanishing points must align with original photo
- Lens distortion matching (wide-angle, standard, etc.)
- Depth-of-field consistency
- No perspective misalignment on new objects

## Scoring System
- 85-100: Excellent — ready for MLS listing
- 70-84: Good — minor issues, acceptable for most uses
- 50-69: Fair — noticeable issues, consider re-generating
- 0-49: Poor — significant artifacts, must re-generate

## Integration
Uses `scoreGeneratedImage()` from `services/geminiService.ts` which calls
Gemini Flash to evaluate original vs. generated image pairs. The `QualityScore`
component in `components/QualityScore.tsx` provides the UI overlay.

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Windows removed/added | Re-prompt with "PRESERVE ALL WINDOWS EXACTLY" |
| Floating furniture | Add "ensure contact shadows anchoring furniture to floor" |
| Gray/desaturated output | Add "maintain HDR vibrancy and rich color saturation" |
| Wrong perspective | Use mask to isolate just the area needing furniture |
| Hallucinated wall art | Add "do NOT add mirrors, artwork, or wall decorations" |
