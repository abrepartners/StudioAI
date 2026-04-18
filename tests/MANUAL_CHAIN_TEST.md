# StudioAI Prompt-Chain Stacking — Manual Test Checklist

Target: `https://studioai.averyandbryant.com/?chain=1`
Operator: human with a real Google account + active StudioAI subscription (or Pro credits).
Est. time: 10-15 min. Run before shipping stacking to non-flag users.

Goal: validate the parts the Playwright smoke test cannot reach — auth-gated UI, paid image generation, and visual fidelity across stacked edits.

Screenshots go in `~/Desktop/studioai-chain-qa/<yyyy-mm-dd>/NN-<slug>.png`. Create that folder before starting. The numbered prefix matters — it keeps the visual diff sequence intact for later regressions.

---

## 1. Log in via Google OAuth
- Open `https://studioai.averyandbryant.com/?chain=1` in a fresh incognito window.
- Click "Sign in with Google" and complete OAuth.
- Expected: land on the main studio with credit balance visible top-right and a `?chain=1` pill or "Stacking: ON" indicator somewhere in the header or tool rail.
- Screenshot: `01-post-login-chain-on.png` (full viewport, show the stacking indicator).

## 2. Confirm feature flag actually engaged
- Open DevTools Console. Run: `window.localStorage.getItem('ff_chain')` and `new URLSearchParams(location.search).get('chain')`.
- Expected: at least one returns `"1"`. If neither does, the flag isn't wired — STOP and file bug.
- Screenshot: `02-console-flag-check.png` (DevTools console with both values visible).

## 3. Upload base image
- Upload a listing photo (use `~/StudioAI/test-fixtures/base-living-room.jpg` if present; otherwise any interior photo >= 1600px wide).
- Expected: image previews in the canvas, no red toast, token/credit counter unchanged (upload is free).
- Screenshot: `03-base-uploaded.png` (full canvas).

## 4. First edit in the chain — "virtual stage with modern furniture"
- In the prompt box, type: `virtual stage with modern mid-century furniture, warm lighting`.
- Submit. Wait for generation to finish.
- Expected: new image appears, chain panel shows step 1 with a thumbnail + the prompt text. Credits decrement by 1.
- Screenshot: `04-edit1-staged.png` (show canvas + chain panel together).

## 5. Stack a second edit — "change floor to white oak"
- WITHOUT resetting, type: `change floor to white oak wide plank`.
- Submit. Wait for generation.
- Expected: chain panel now shows steps 1 + 2, both thumbnails legible, step 2 image clearly inherits the staging from step 1 (furniture still there, only floor changed).
- Screenshot: `05-edit2-stacked.png` (full canvas + both chain thumbnails).
- Visual fidelity check: furniture placement, wall color, window light direction should be unchanged from step 1. If ANY of those drift, that's a regression.

## 6. Stack a third edit — "evening lighting, lamps on"
- Type: `change to dusk lighting with interior lamps on, cinematic`.
- Submit.
- Expected: chain panel has 3 steps. Step 3 keeps the white oak floor AND the staging. Only mood/lighting changes.
- Screenshot: `06-edit3-dusk.png` (canvas + chain panel with all 3 thumbs).

## 7. Step-back navigation
- Click step 2 thumbnail in the chain panel.
- Expected: canvas reverts to the step-2 image. Step 3 is still visible in the chain (not destroyed) but marked inactive/greyed.
- Screenshot: `07-step-back-to-2.png`.
- Then click step 3 thumbnail. Canvas should return to step 3. No re-generation, no credit charge.

## 8. Branch from an earlier step
- Click step 2 thumbnail to make it active.
- Type new edit: `add a large abstract painting above the sofa`.
- Submit.
- Expected: a NEW branch is created (step 3b or similar) — the original step 3 (dusk) is preserved in a separate branch, not overwritten. Chain panel shows the fork clearly.
- Screenshot: `08-branch-from-2.png` (chain panel must show the fork visually).
- If the dusk step gets overwritten instead of forked, that's a regression — note it.

## 9. Export the final chain
- With the branched result active, click Export (or Download).
- Expected: PNG/JPG downloads at full resolution, filename includes some indicator of the chain (e.g., `-chain3` or step count). Open the file and confirm it matches the on-screen canvas.
- Screenshot: `09-exported-file.png` (Finder Quick Look of the downloaded file next to the canvas).

## 10. Reload persistence + teardown
- Hit browser refresh on the same URL.
- Expected: chain state is restored from localStorage/supabase — all steps + the branch still present, active step remembered. If the chain resets on reload, note the severity (minor annoyance vs. blocker).
- Screenshot: `10-post-reload.png` (chain panel after refresh).
- Log out. Visit `/?chain=1` again unauthenticated and confirm it returns to the public landing (not a broken blank page).

---

## Sign-off

- [ ] All 10 steps pass with no visual-fidelity regressions between chain steps.
- [ ] All 10 screenshots captured and saved to the dated folder.
- [ ] Credit counter decremented exactly once per generation (not twice, not zero).
- [ ] No console errors during the entire run (keep DevTools Console open throughout).

Report regressions in the StudioAI issue tracker with the screenshot folder attached. Do NOT flip the flag on for non-flag users until every box above is checked.
