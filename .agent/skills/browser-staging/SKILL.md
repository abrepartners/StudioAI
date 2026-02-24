---
name: browser-staging
description: Automates the verification of StudioAI generation modes and architectural integrity rules using the browser agent.
---

# Browser Staging Skill

This skill provides a standardized workflow for verifying new features, generation modes, and Pro AI tools in StudioAI. It ensures that UI transitions are smooth and that architectural integrity rules (especially window preservation) are strictly followed.

## Instructions

### 1. Verification Setup
- Ensure the dev server is running (usually on `http://localhost:3002/`).
- Use the `browser_subagent` to navigate to the application.
- Click **"Try Sample Room"** to initialize the state.

### 2. Testing Generation Modes
For each mode (Text, Packs) or Pro Tool (Twilight, Sky Replacement, etc.):
- Trigger the action.
- Wait for the generation/loading state to complete.
- Verify that the resulting image is displayed.
- Check for UI errors (e.g., `API_KEY_REQUIRED`).

### 3. Architectural Integrity Check
Use the provided script `verify-architectural-integrity.js` to perform an automated visual comparison:
- Capture the before and after states.
- Run the script to detect significant structural changes.
- **Critical Failure**: If windows are added, removed, or significantly altered in shape/size.

## Helper Scripts
- `scripts/verify-architectural-integrity.js`: A JavaScript helper to be executed via `execute_browser_javascript` for visual diffing.

## Example Task for Browser Agent:
"Use the browser-staging skill to verify the 'Coastal Modern' pack. Ensure the large window in the living room sample is perfectly preserved after generation."
