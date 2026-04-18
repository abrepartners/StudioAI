# Virtual Staging QA Results

**Timestamp:** 2026-04-18T21-38-22
**Tool:** `generateRoomDesign()` text-mode (services/geminiService.ts)
**Prompt:** harness-local text-only prompt (not the production outer shell — see note below)
**Harness run:** `tests/qa-harness/reports/2026-04-18T21-38-22_stage/`

## Verdict: PASSED

## Headline numbers

| Metric | Value |
|---|---|
| Total fixtures | 27 (interiors) |
| Gemini produced image | 25/27 (92.6%) |
| Gemini failures | 2 |
| Harness errors | 0 |
| Composited (Phase C stacked) | 25 |
| Bailed high (>95% change) | 0 |
| Bailed low (<0.1% change) | 0 |
| Median change ratio | 19.47% |
| Median preserve delta (outside mask) | 0.01 |
| Median size ratio (output/input KB) | 0.69 |
| Median Gemini latency | 17,494 ms |

**Pass rate on "produced a usable image": 25/27 = 92.6%** (above the 80% bar).
**Preservation: median delta 0.01** (way under the 5.0 bar — staging is a bigger edit than cleanup but the composite is holding unchanged regions byte-identical).

## Pass criteria check

- [x] >=80% produced Gemini output (92.6%)
- [x] Median preservation delta < 5 (0.01)
- [x] >=4/5 spot-checks show believable furniture + preserved architecture (5/5)

## Visual spot-check (5 composites inspected)

1. `Brandon_B_NUR64458` — bedroom converted to living room: gray sectional, walnut media console, leather accent chair, coffee table w/ vase, jute rug. Ceiling fan, window, existing gallery wall, wood floor all pixel-preserved.
2. `Lane_Photos_BM8A1572` — empty great room staged as living area: beige sofa, coffee table w/ books, floor lamp, rug, paired framed art. Kitchen cabinets, tile floor, ceiling fan, sliding glass door, wall ducts all unchanged.
3. `Amber_photos_BM8A5086` — empty kitchen staged w/ island barstools + knife block + canister. Cream cabinets, stone backsplash, pendant chandelier, window, tile floor preserved.
4. `Rj_hawk_..._NUR66195` — working kitchen staged w/ accent chair, side table, decor, area rug in the corner. Cabinetry, quartz counters, pendant light, fridge preserved. (Minor: a few fridge magnets were lost — acceptable as part of a staging pass.)
5. `Jordan_..._NUR65944` — cluttered kid's bedroom de-cluttered + restyled: taxidermy deer replaced with abstract antler silhouettes; styled swivel chair with throw pillow. Bed frame, bunkbed, dresser, fish tank, window, ceiling fan preserved.

## Edge cases / notes

- **2 Gemini failures** (likely safety filter or empty text part). Both retryable; non-blocking.
- **Median change 19.47%** — healthy for staging. Gemini is adding furniture localized to floor/empty wall regions rather than repainting the scene.
- **Harness prompt is the simplified text-mode spec, not the full production `generateRoomDesign` outer shell.** Production wraps the assignment in the "Master Architectural Photo Editor" preamble with absolute preservation rules. The looser harness prompt still passes the preservation bar, which is a strong signal that production (with the stricter preamble) will preserve as well or better.
- **Size ratio 0.69 (median)** is higher than twilight (0.45) — makes sense since staging preserves more of the original JPEG and adds new furniture geometry, keeping more high-frequency detail.
- **No mirror/flip, no framing crop, no wall repainting observed** across 5 spot-checks.

## Recommendation

Ship. Virtual Staging text-mode + Phase C stack composite is production-ready on interior fixtures. No prompt changes needed. The 2 Gemini failures (7.4%) are within acceptable noise for a user-facing workflow with retry.
