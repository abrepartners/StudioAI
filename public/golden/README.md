# Golden test set (Model Lab)

Canonical listing photos the admin Model Lab (`/admin/model-lab`) runs tools
against so regressions in prompts or models are caught before they ship.

## How to add photos

1. Drop image files (`.jpg` / `.png`) into this directory (`public/golden/`).
   Pick a spread that exercises the tools: an empty room (staging), a cluttered
   room (declutter), a daytime exterior (twilight / sky), a dated kitchen
   (renovation). ~8 photos is a good set.
2. List them in `manifest.json`:

   ```json
   [
     { "file": "01-empty-living-room.jpg", "label": "Empty living room" },
     { "file": "02-cluttered-kitchen.jpg", "label": "Cluttered kitchen" },
     { "file": "03-daytime-exterior.jpg",  "label": "Daytime exterior" }
   ]
   ```

   `file` is required (path is `/golden/<file>`); `label` is optional.

The lab auto-loads this manifest on open. Admins can also add photos ad-hoc in
the session with **Add photos** (in-memory only — commit them here to make the
set permanent for everyone).

Keep files reasonably sized (long edge ≤ ~2048px) so the page loads fast and
uploads stay under the API body limit.
