# StudioAI — Claude Code Operating Manual

> This file is the single source of truth. Read it fully before writing any code.
> It tells you what exists, what to build, how to build it, what can run in parallel,
> and when to use a better tool instead of hand-coding something.

---

## Project overview

StudioAI is an AI-powered listing media platform for real estate agents. An agent uploads raw listing photos and gets back everything they need to market that property: staged images, MLS-ready exports, property descriptions, social content, print collateral, and a branded property website.

- **Live URL**: studioai.averyandbryant.com
- **Repo**: github.com/abrepartners/StudioAI
- **Stack**: React + Vite, Tailwind CSS, Vercel (deployment), Gemini API (image generation)
- **Auth**: Google OAuth via Google Identity Services SDK
- **Design language**: Apple-premium dark aesthetic (not cyberpunk, not neon)

---

## Current state (as of March 2026)

These features are LIVE and working. Do NOT rebuild or refactor these unless explicitly asked:

- [x] Google OAuth login with auth wall
- [x] Virtual staging with style packs (room type selection, style selection, prompt builder)
- [x] Auto-pilot mode (detects room type, selects appropriate furniture automatically)
- [x] Smart cleanup with 6 auto-detect modes (personal items, trash/clutter, clear room, outdoor, eyesores, precision edit)
- [x] Style Advisor (AI analyzes uploaded photo, recommends top 3 styles, one-click apply)
- [x] Quality Score (evaluates staged images against architectural integrity, lighting, realism, perspective)
- [x] Batch processing (upload multiple photos, apply one style to all)
- [x] One-click marketing kit (staged image + MLS copy + social caption + hashtags)
- [x] Usage analytics dashboard (generations, downloads, sessions, style breakdown)
- [x] Subscription tier system (Free: 25 gens/mo, Pro: $29/mo, Enterprise)
- [x] Vercel Analytics integration
- [x] Apple-premium dark UI theme (blue #0A84FF, red #FF375F, standard shadows)

---

## Execution model: parallel lanes

Tasks are NOT strictly sequential. They are organized into **lanes** that can run in parallel.
The dependency graph below tells you what blocks what.

### Dependency graph

```
1.1 MLS Export ──────────────────────────── can start IMMEDIATELY (no deps)
1.2 Brand Kit ───────────────────────────── can start IMMEDIATELY (no deps)
1.4 Listing Description ─────────────────── can start IMMEDIATELY (no deps)
1.6 Social Media Pack ───────────────────── DEPENDS ON 1.1 (reuses imageExport.ts)
1.3 Property Website ────────────────────── DEPENDS ON 1.2 + 1.4 (needs brand kit + descriptions)
1.5 Print Collateral ────────────────────── DEPENDS ON 1.2 + 1.4 (needs brand kit + descriptions)
1.7 Listing Dashboard ───────────────────── DEPENDS ON 1.1 + 1.2 + 1.3 + 1.4 (aggregates everything)
```

### What this means in practice

When you start a session, check the status of each task below.
If multiple `[ ]` tasks have no unfinished dependencies, **work on all of them in the same session**.
For example: 1.1, 1.2, and 1.4 have zero dependencies on each other.
Build all three in one session if time allows. Create separate feature branches and PRs for each.

### Lane assignment (for parallel work)

| Lane A (client-side image utils) | Lane B (data/state/storage) | Lane C (AI/content generation) |
|---|---|---|
| 1.1 MLS Export | 1.2 Brand Kit | 1.4 Listing Description |
| 1.6 Social Media Pack | 1.7 Listing Dashboard | 1.3 Property Website |
| | | 1.5 Print Collateral |

Lane A and Lane C share no files. Lane B creates shared state (brand kit) that C consumes.
If working on Lane A and Lane C simultaneously, there will be zero merge conflicts.

---

## Tool and skill awareness

Before hand-coding anything, check if a better tool or library handles it.
Use the RIGHT tool for the job. Don't reinvent wheels.

### Image processing
- **Canvas API** — use for resize, crop, EXIF strip, watermark. This is the right tool. Do not install Sharp or Jimp for client-side work.
- **JSZip** (`npm install jszip`) — use for all zip generation. Do not write custom zip logic.
- **file-saver** (`npm install file-saver`) — use for triggering downloads. Do not use custom blob/anchor hacks.
- **browser-image-compression** — consider if we need to optimize file sizes before export.

### PDF generation
- **@react-pdf/renderer** — PREFERRED for print collateral. Renders React components directly to PDF. No headless browser needed. Install: `npm install @react-pdf/renderer`
- Do NOT use Puppeteer for PDF generation in Vercel serverless functions (it's too heavy, cold starts are brutal, and it hits the 50MB function size limit).
- If @react-pdf/renderer can't handle a layout, fall back to **jsPDF** + **html2canvas** as a lightweight alternative.

### Property websites
- **Static HTML generation** is preferred over deploying separate Vercel projects.
- Generate a self-contained HTML file with all assets inlined (base64 images, inline CSS).
- Host via Vercel Blob Storage or as a static asset under a /listings/ route.
- Do NOT spin up a separate Vercel project per listing. That doesn't scale and hits project limits.

### AI copy generation
- **Gemini API** — already integrated. Use the existing API utility functions in the codebase. Check `src/services/` or `api/` for the current pattern.
- Do NOT add a second AI provider (no OpenAI, no Anthropic API calls from the app). Keep it single-provider.
- Prompt templates go in `src/prompts/` as exportable string constants, not inline in components.

### State management
- Check what the app currently uses. If it's React Context, stick with React Context. If it's Zustand or similar, stick with that.
- Do NOT introduce a new state management library unless the existing one literally cannot handle the requirement.
- Brand kit data: persist to `localStorage` for MVP. The hook `useBrandKit()` should read from localStorage on mount and write on save.

### QR codes (for print collateral)
- **qrcode** (`npm install qrcode`) — lightweight, generates QR as canvas or data URL. Use this for open house sheets.

### Maps (for property websites)
- Use Google Maps embed URL (no API key needed): `https://www.google.com/maps/embed/v1/place?key=FREE&q=ADDRESS`
- Or use a static Mapbox image if we want zero JS overhead on the property site.

---

## Shared utilities: build once, use everywhere

These utilities are foundational. Multiple features depend on them.
Build them FIRST and build them RIGHT because they'll be imported across the codebase.

### `src/utils/imageExport.ts`
Used by: 1.1 MLS Export, 1.6 Social Media Pack, 1.5 Print Collateral

```typescript
// Required exports:
resizeImage(blob: Blob, width: number, height: number, quality?: number): Promise<Blob>
stripExif(blob: Blob): Promise<Blob>
addWatermark(blob: Blob, config: WatermarkConfig): Promise<Blob>
cropToAspect(blob: Blob, aspectWidth: number, aspectHeight: number): Promise<Blob>
exportAsZip(files: {name: string, blob: Blob}[]): Promise<Blob>
downloadBlob(blob: Blob, filename: string): void
```

### `src/hooks/useBrandKit.ts`
Used by: 1.1 MLS Export (watermark), 1.3 Property Website, 1.5 Print Collateral, 1.6 Social Pack

```typescript
// Required interface:
interface BrandKit {
  logo: string | null           // base64 data URL
  headshot: string | null       // base64 data URL
  primaryColor: string          // hex
  secondaryColor: string        // hex
  agentName: string
  brokerageName: string
  phone: string
  email: string
  website: string
  tagline: string
}

useBrandKit(): {
  brandKit: BrandKit
  updateBrandKit: (partial: Partial<BrandKit>) => void
  hasBrandKit: boolean  // true if at least name + logo are set
}
```

### `src/hooks/useListing.ts`
Used by: 1.3 Property Website, 1.4 Listing Description, 1.5 Print Collateral, 1.7 Dashboard

```typescript
interface Listing {
  id: string
  address: string
  beds: number
  baths: number
  sqft: number
  price: number
  photos: StagedPhoto[]        // staged image blobs/URLs
  description: string | null    // AI-generated
  propertyWebsiteUrl: string | null
  createdAt: string
}
```

---

## Task specifications

Status key: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

### Phase 1: Listing media pipeline (NOW through April 18, 2026)

---

#### 1.1 MLS-ready export system `[ ]` URGENT — NO DEPENDENCIES
> Ship by: March 28 | Lane A | Can start immediately

**What it does**: Takes staged images and outputs MLS-compliant files.

**Requirements**:
- Resize presets: Zillow/Realtor.com 2048x1536, ARMLS 2048x1536, Generic 1920x1080 and 1280x960
- Strip all EXIF data
- Optional watermark (agent logo from brand kit OR "Virtually Staged" text)
- Zip download: `001_living_room_staged.jpg`, `002_kitchen_staged.jpg`
- Batch export: select all, export as one zip
- UI: "Export for MLS" button on staged image results + batch view

**Build with**: Canvas API, JSZip, file-saver. All client-side, zero backend.

**Files to create**:
- `src/utils/imageExport.ts` — shared utility (see Shared Utilities section)
- `src/components/MLSExport.tsx` — export panel UI with preset selector

**Files to modify**:
- Batch view component — add export button
- Staging result component — add export button
- `package.json` — add jszip, file-saver

**Acceptance criteria**:
- [ ] Agent can select MLS preset and download correctly sized images
- [ ] EXIF data is stripped (verify with exiftool or browser dev tools)
- [ ] Watermark renders cleanly at bottom corner
- [ ] Zip downloads with sequential naming
- [ ] Works on batch of 25+ images without browser hang

---

#### 1.2 Agent brand kit system `[ ]` URGENT — NO DEPENDENCIES
> Ship by: April 1 | Lane B | Can start immediately

**What it does**: Agent uploads brand assets once. All outputs inherit branding.

**Requirements**:
- Settings/profile page in sidebar nav
- Upload: logo, headshot, colors (2), name, brokerage, phone, email, website, tagline
- Persist to localStorage via `useBrandKit()` hook
- Graceful fallback: no brand kit = no branding, no errors

**Build with**: React Context or existing state pattern. FileReader for base64 conversion. No external storage.

**Files to create**:
- `src/components/BrandKit.tsx` — settings page UI
- `src/hooks/useBrandKit.ts` — shared hook (see Shared Utilities section)

**Files to modify**:
- `src/App.tsx` — add /settings route, sidebar nav item

**Acceptance criteria**:
- [ ] Upload, save, and retrieve brand assets across sessions
- [ ] `useBrandKit()` returns correct data from any component
- [ ] No errors when brand kit is empty

---

#### 1.3 Property website generator `[ ]` HIGH — DEPENDS ON: 1.2, 1.4
> Ship by: April 8 | Lane C | Start after 1.2 and 1.4

**What it does**: Generates a branded single-property website.

**Requirements**:
- Input: staged images + property details (beds/baths/sqft/price/address)
- Output: shareable URL
- Includes: hero image, gallery, details, AI description, Google Maps, agent card, contact form, og:meta tags
- Mobile responsive, under 2s load

**Build with**: Self-contained HTML with base64 inlined images. Vercel Blob or static route. Web3Forms for contact. Do NOT create separate Vercel projects per listing.

**Files to create**:
- `src/components/PropertyWebsite.tsx` — builder UI
- `src/templates/propertySiteTemplate.ts` — HTML template function
- `src/components/ListingDetails.tsx` — property info form
- `api/publish-property-site.ts` — serverless function to store/serve HTML

**Acceptance criteria**:
- [ ] Gallery renders all staged photos
- [ ] Brand kit applied (logo, colors, contact)
- [ ] Maps embed correct location
- [ ] Contact form works
- [ ] og:image renders on social share

---

#### 1.4 AI listing description generator `[ ]` HIGH — NO DEPENDENCIES
> Ship by: April 8 | Lane C | Can start immediately

**What it does**: Generates MLS-ready descriptions in 3 tones.

**Requirements**:
- Input: room types, property details, optional agent notes
- Output: luxury, casual, and investment tone versions
- Character count with MLS targets (Zillow 5K, Realtor.com 4K, generic 1K)
- One-click copy, save to listing

**Build with**: Existing Gemini API. New prompt templates only. No new AI providers.

**Files to create**:
- `src/prompts/listingDescription.ts` — prompt templates per tone
- `src/components/ListingDescription.tsx` — UI with tabs, char count, copy

**Acceptance criteria**:
- [ ] 3 tones produce meaningfully different descriptions
- [ ] Char counts accurate, color-coded at MLS limits
- [ ] Copy button works with confirmation
- [ ] Description persists in listing data

---

#### 1.5 Print collateral generator `[ ]` HIGH — DEPENDS ON: 1.2, 1.4
> Ship by: April 12 | Lane C | Start after 1.2 and 1.4

**What it does**: Generates print-ready PDFs.

**Templates**: flyer, open house sheet, just-listed/just-sold postcard.

**Build with**: `@react-pdf/renderer`. QR codes via `qrcode` package. Do NOT use Puppeteer.

**Files to create**:
- `src/templates/FlyerPDF.tsx`, `OpenHousePDF.tsx`, `PostcardPDF.tsx`
- `src/components/PrintCollateral.tsx` — template selector + preview + download

---

#### 1.6 Social media content pack `[ ]` NORMAL — DEPENDS ON: 1.1
> Ship by: April 15 | Lane A | Start after 1.1

**What it does**: Platform-specific crops, captions, hashtags.

**Build with**: Extend `imageExport.ts` with `cropToAspect()`. Reuse zip logic.

**Files to create**:
- `src/components/SocialPack.tsx`
- `src/prompts/socialCaptions.ts`

---

#### 1.7 Listing dashboard view `[ ]` NORMAL — DEPENDS ON: 1.1, 1.2, 1.3, 1.4
> Ship by: April 18 | Lane B | Start last

**What it does**: Central view per listing with all generated assets.

**Build with**: New routes, `useListing()` hook.

**Files to create**:
- `src/hooks/useListing.ts`
- `src/components/ListingDashboard.tsx`
- `src/components/ListingDetail.tsx`

---

### Phase 2: White-label SaaS (May through August 2026)

> GATE: Do NOT start Phase 2 until 1.1, 1.2, and 1.3 are live and used by real agents.

#### 2.1 Multi-tenant architecture `[ ]`
#### 2.2 Brokerage admin dashboard `[ ]`
#### 2.3 White-label theming engine `[ ]`
#### 2.4 Custom domain support `[ ]`
#### 2.5 Subscription and billing `[ ]`
#### 2.6 Onboarding flow `[ ]`
#### 2.7 Usage analytics and ROI reports `[ ]`
#### 2.8 Agent leaderboard `[ ]`

---

### Phase 3: Marketplace and API (Q4 2026+)

> GATE: Do NOT start Phase 3 until 3+ brokerages are live on Phase 2.

#### 3.1 Style pack marketplace `[ ]`
#### 3.2 Public REST API `[ ]`
#### 3.3 GHL native integration `[ ]`
#### 3.4 MLS platform partnerships `[ ]`
#### 3.5 Zapier/Make integration `[ ]`
#### 3.6 Developer portal `[ ]`

---

## Code standards

### File organization
```
src/
  components/     # React components (PascalCase.tsx)
  utils/          # Pure utility functions (camelCase.ts)
  hooks/          # Custom React hooks (useXxx.ts)
  stores/         # State management if applicable (camelCase.ts)
  prompts/        # AI prompt templates (camelCase.ts)
  templates/      # HTML/PDF templates for generated outputs
  types/          # TypeScript type definitions
api/              # Vercel serverless functions
public/           # Static assets
```

### UI/Design rules
- Dark theme: bg-black / bg-zinc-900 base, zinc-800 cards, zinc-700 borders
- Primary accent: `#0A84FF` (Apple blue)
- Error: `#FF375F` (Apple red)
- Success: `#30D158`
- Text: white primary, zinc-400 secondary, zinc-500 tertiary
- **No neon. No glow. No scanlines. No cyberpunk.**
- `rounded-xl` cards, `rounded-lg` buttons. Standard Tailwind shadows only.
- `transition-all duration-200` default

### Git conventions
- Branch per feature: `feature/mls-export`, `feature/brand-kit`
- Commit prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `style:`
- PR into `main`. One PR per feature. Vercel auto-deploys on merge.

### Before pushing ANY code
1. `npm run build` must pass
2. Mobile viewport test (375px)
3. Empty brand kit test (no errors)
4. Populated brand kit test (renders correctly)
5. `npx tsc --noEmit` (no TypeScript errors)

---

## Decision-making rules

1. **Use existing patterns first.** Match the codebase before adding libraries.
2. **Client-side > server-side** unless secrets or heavy compute are required.
3. **Single file > multiple files** for small features.
4. **Ship working > ship polished.** Merge it, then refine.
5. **Blocked? Skip laterally.** Check the dependency graph for the next unblocked task.
6. **When unsure about product**: ask Thomas.
7. **When unsure about tech**: pick the simpler option that ships faster.

---

## Environment

- `VITE_GOOGLE_CLIENT_ID` — Google OAuth (hardcoded fallback exists)
- Gemini API key — check current env var name in codebase
- Web3Forms access key — needed for property website contact forms (TBD)

---

## How to work

1. Read this file.
2. Check the dependency graph. Find all `[ ]` tasks with no unfinished dependencies.
3. Highest priority unblocked task wins (URGENT > HIGH > NORMAL).
4. Multiple unblocked tasks at same priority? Work them in parallel, separate branches.
5. Build shared utilities FIRST if they don't exist yet.
6. When done: `[x]` the checkbox, commit the CLAUDE.md update, push.
7. Blocked: `[!]` with a note, move to next unblocked task.

**Current state**: 1.1, 1.2, and 1.4 are all unblocked. Start all three.
