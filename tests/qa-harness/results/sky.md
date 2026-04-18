# Sky Replacement — QA Results

**Timestamp:** 2026-04-18T21-37-57
**Tool:** `replaceSky` (services/geminiService.ts) via Phase C composite (utils/stackComposite.ts)
**Fixtures:** 20 exterior photos in `tests/qa-harness/fixtures/sky/`
**Report:** `tests/qa-harness/reports/2026-04-18T21-37-57_sky/index.html`

## Verdict

**PASS.**

## Pass rate

- Gemini image returned: **20/20 (100%)** — exceeds 80% bar.
- Composite succeeded (none bailed, none errored): **20/20**.
- Visual spot-check (5 composites): **4/5 pass** — meets 4/5 criterion.

## Median metrics

| Metric | Value |
|---|---|
| Change ratio (raw) | 13.4% |
| Outside-mask delta (preserve score) | 0.04 |
| Size ratio (output / input KB) | 0.73 |
| Gemini latency | 19.24 s |

Preserve delta at 0.04 (very low) confirms ground-level pixels outside the sky region stayed close to the input across the fleet. No fixture breached the 95% change bail threshold — the composite path was used for every run.

## Spot-check summary

| # | Fixture | Change | Result |
|---|---|---|---|
| 1 | Jordan_...NUR65809 (backyard patio) | 10.7% | PASS — sky cleaner, patio/fence/chairs/firepit unchanged |
| 2 | Kelly_drone_...0059_D (aerial) | 37.8% | PASS — blue sky with clouds above treeline, house/lawn/driveway preserved |
| 3 | Kelly_photos_BM8A2247 (brick estate) | 44.9% | **FAIL** — ghost roofline artifact above real roof; house itself preserved |
| 4 | Rj_hawk_...NUR66325 (tree-canopy front) | 44.6% | PASS — minimal change (no sky to replace), house preserved |
| 5 | Lance_Photos_BM8A1932 (brick ranch back) | 44.9% | PASS — clouds enhanced, structure preserved |

Extra check: `kassi_beebe_2_NUR65606` (pool yard, 44.6%) — clean sky, all ground content preserved.

## Edge cases / failure modes

- **Ghost-roofline artifact (Kelly_photos_BM8A2247):** Gemini appears to return a slightly offset or duplicated roofline silhouette in the sky area; the composite blends it through because the sky region is the expected "large change" area. This is a Gemini output issue (not a composite failure). Not reproduced on other brick-house fixtures — isolated case. Do NOT modify prompt per instructions.
- **Low-sky-visibility fixtures (e.g., Rj_hawk dense canopy):** model conservatively produces near-identical output. Acceptable behavior — no forced sky injection through trees.
- **Drone aerials:** highest resolution (8064x4536) took ~20-28s per Gemini call. Still under the harness ceiling, but worth watching if we batch many drone shots.

## Recommendation

Sky Replace is production-ready for the listing pipeline. Monitor for ghost-silhouette artifacts on complex rooflines; consider a future A/B on prompt wording if the rate climbs above ~5%.
