# Cleanup QA — PASSED

**Run:** 2026-04-18T21-31-05
**Report:** `reports/2026-04-18T21-31-05_cleanup/index.html`
**Fixtures:** 46 (19 exterior + 27 interior)

## Metrics

| Metric | Value | Bar |
|---|---|---|
| Gemini success | 45/46 (98%) | ≥80% |
| Median change ratio | 6.0% | — |
| Median preservation delta (outside mask) | **0.01** | <1.5 |
| Median size ratio | 0.74 | >0.40 |
| Median Gemini latency | 19.1s | — |

## Visual spot-check

- `patrick_beam_NUR64343`: cooler + gas can + wheelchair + poles removed; deck, bench, rug, star decor preserved pixel-sharp.
- `Lane_Photos_BM8A1677`: minor debris cleanup; house/trees/driveway untouched.
- Others across Amber / Brandon / Jordan fixtures: clutter removed, walls/floors/framing preserved.

## Verdict

PASSED. Phase C composite (1px dilation, 24px feather, 0.15 pixelmatch threshold) preserves unchanged regions byte-identical per the metric — and visual confirms.

## Known edge cases

- 1 Gemini API failure (Jordan fixture, returned no image) — not a composite issue. Acceptable < 2% failure rate.
