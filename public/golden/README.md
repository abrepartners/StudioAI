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
     { "file": "01-empty-living-room.jpg", "label": "Empty living room", "room": "Living Room" },
     { "file": "02-cluttered-kitchen.jpg", "label": "Cluttered kitchen",  "room": "Kitchen" },
     { "file": "03-daytime-exterior.jpg",  "label": "Daytime exterior",   "room": "Front Yard" },
     { "file": "04-furnished-bedroom.jpg", "label": "Furnished bedroom",  "room": "Bedroom", "furnished": true }
   ]
   ```

   - `file` (required) — path is `/golden/<file>`.
   - `label` (optional) — display name.
   - `room` (optional but recommended) — the room label this photo runs as.
     Production classifies each photo's room; setting it here means a **mixed**
     set runs each photo as its own room (a kitchen isn't staged as the
     route-level "Living Room", and declutter picks the right interior/exterior
     template). Unset → falls back to the room selected in the lab UI.
   - `furnished` (optional) — `true` for a staging photo that already has
     furniture (restage/replace mode). Unset → follows the lab's toggle.

The lab auto-loads this manifest on open. Admins can also add photos ad-hoc in
the session with **Add photos** (in-memory only — commit them here to make the
set permanent for everyone).

Keep files reasonably sized (long edge ≤ ~2048px) so the page loads fast and
uploads stay under the API body limit.
