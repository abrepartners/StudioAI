# 03 — UI / Visual Design Audit

_Specialist: UI / Visual Design_
_Date: 2026-04-17_
_Scope: studioai.averyandbryant.com (React + Vite + Tailwind + custom CSS tokens)_

---

## TL;DR — The Three-Sentence Verdict

**Biggest visual liability:** the type scale is out of control — 101 usages of `text-[10px]`, 24 of `text-[9px]`, plus `text-[7px]`, `text-[8px]`, `text-[11px]`, `text-[13px]` fighting against Tailwind's `text-xs/text-sm/text-lg` (nine named sizes + six arbitrary values = ~15 effective sizes). It makes every panel feel like a different app.

**Biggest visual opportunity:** the design token system in `index.css` (`premium-surface`, `cta-primary`, `pill-chip`, `glass-overlay`, `canvas-frame`, `feature-badge`) is genuinely good and Apple-grade, but components don't use it — they re-invent buttons and cards inline with bespoke Tailwind strings. Wire components to the tokens that already exist and the product stops looking like three apps in a trench coat.

**Highest-leverage single change:** delete `text-[7/8/9/10/11/13]px` everywhere and collapse to a 6-step scale (`2xs/xs/sm/base/lg/xl`) codified in Tailwind config. That one refactor will do more for perceived quality than any new feature.

---

## 1. Icon System Audit

### Inventory (lucide-react)

Every icon currently imported, with canonical usage location:

| Icon | Primary usage | Notes |
|---|---|---|
| Layers | EditingBadge chain pill, QuickStartTutorial "style pack" step | Correct |
| RotateCcw | EditingBadge "Start from original" | Correct (universal "reset") |
| Clock | EditingBadge "View history", AdminShowcase status | OK, but `History` icon also used — see collision below |
| History (`as HistoryIcon`) | App.tsx sidebar History tab | **Collision risk** with Clock |
| ChevronDown/Up/Left/Right | Universal | Fine |
| CheckCircle2 | EditingBadge "Commit", BetaFeedbackForm | Correct |
| Check | Toast, selection state, BrandKit save, MLSExport | Overloaded — used as both "selected" and "success" |
| X | Close / dismiss / error toast | **Overloaded** — used for close AND "error/fail" in toast notifications (`App.tsx:868, 875, 877, 986`). Error state should use `XCircle` or `AlertTriangle` |
| Trash2 | FurnitureRemover, MaskCanvas, ManageTeam, "Selective Removal" feature card | Correct |
| Undo2, Redo2 | MaskCanvas | Correct |
| Loader2, LoaderCircle | Loading spinners | **Inconsistent** — `LoaderCircle` only in ImageUploader.tsx:2, `Loader2` everywhere else. Pick one. |
| Camera | StudioAI logo, "Listing Agents" persona, Upload placeholder, "Day to Dusk" persona | **Overloaded** — Camera means StudioAI brand mark AND "photographer" persona AND "upload surface" |
| Sparkles | Demo CTA, StyleAdvisor, ChatInterface bot, SpecialModesPanel section header, Toast success "Submitted!" | Most overloaded icon in the app — used for 5 unrelated concepts |
| Wand2 | Text mode, Virtual Staging, QuickStartTutorial step, SpecialModesPanel | Correct (AI generation = wand) |
| BrainCircuit | Room detection pill, Generating overlay | Good — unique and meaningful |
| Sunset | Day-to-dusk in ~8 places | Correct |
| Cloud | Sky replacement | Correct |
| Hammer | Virtual renovation | Correct |
| FileText | Listing description | Correct |
| Shield | MLS Export section, QualityScore | **Semantic mismatch** — QualityScore uses Shield for "quality" and MLSExport uses Shield for "EXIF stripping." Different concepts, same icon. MLS should be `FileCheck` or `Package`; QualityScore should stay Shield. |
| Package | MLS Export header | Better fit than Shield for "export bundle" — the app has both but uses them inconsistently |
| Eraser | Cleanup panel, Smart Cleanup feature card | Correct |
| LayoutGrid | Design Studio tab, Batch Editing feature card | **Overloaded** — means "tool panel" AND "batch" |
| Images (plural) | QuickStartTutorial "multiple photos" | Correct, but only used once; consider `Layers` for consistency |
| Share2 | Social Pack tab, ExportModal, "Submitted" toast | OK |
| Heart | Save to history | Questionable — Save is not "like." `BookmarkPlus` would read cleaner |
| Crown | Upgrade/Pro badge | Correct |
| Download | Export button, MLS tab | Correct |
| Type | ExportModal text disclaimer | Correct |
| Video | ExportModal reveal video | Correct |
| Plus | Add image, Manage Team invite | Correct |
| Zap | Flippers persona, mockup render badge | Overloaded (persona + render-speed) but minor |
| HelpCircle | Tutorial trigger | Correct |
| RefreshCcw | Start over / remove photo | OK |
| Gift | Referral dashboard | Correct |
| User / Users | ChatInterface (singular), ManageTeam (plural) | Correct |
| ArrowLeftRight | CompareSlider handle | Correct |
| ArrowRightLeft | SocialPack "Before/After" template | **Near-duplicate** of ArrowLeftRight — pick one, use everywhere |
| MousePointer2 | FurnitureRemover | Correct |
| Sofa, Palmtree, Factory, Wheat, Library, Flower2 | StyleControls pack icons | Delightful and correct — one icon per style pack |
| ShieldCheck | StyleControls | Minor — similar to Shield usage |
| FilePenLine | Design Direction "text mode" icon | Good unique choice |
| ClipboardCopy | BetaFeedbackForm | Correct |
| ThumbsUp/Down | BetaFeedbackForm | Correct |
| Send | Chat, Feedback | Correct |
| Bot | ChatInterface | Correct |
| Home, CalendarDays, Lightbulb | SocialPack templates | Correct |
| Building2 | Brokerages, ManageTeam, Persona row | OK |
| Star | Testimonials | Correct |
| Settings, CreditCard, LogOut, Lock | Profile / subscription | Correct |
| AlertCircle, AlertTriangle | Errors | **Split semantics** — use AlertTriangle consistently for warning, AlertCircle for info |

### Icon Sizes — Hard Data

```
71 × size={14}
42 × size={16}
28 × size={12}
22 × size={18}
22 × size={15}      ← off-grid (14/16 would work)
13 × size={10}
 7 × size={13}      ← off-grid
 6 × size={24}
 6 × size={21}      ← off-grid (20/22 would work)
 6 × size={20}
 4 × size={32}
 4 × size={22}
 2 × size={11}      ← off-grid
 1 × size={28}      ← one-off
```

**14 distinct icon sizes.** A production system needs 4–5 max. The `15/13/11/21/28` values are off-grid one-offs that should round to the nearest `12/14/16/20/24/32`.

**Recommendation:**

| Semantic | Pixel size | Where |
|---|---|---|
| `icon-xs` | 12 | Inline with text, chips, badges |
| `icon-sm` | 14 | Button icons, toast icons |
| `icon-md` | 16 | Default icon |
| `icon-lg` | 20 | Panel headers, feature cards |
| `icon-xl` | 24 | Tutorial steps, empty-state icons |
| `icon-2xl` | 32 | Upload hero, marketing hero only |

Enforce via a wrapper `<Icon size="sm" />` or Tailwind tokens. Delete every `size={15|13|11|21|28}` usage.

---

## 2. Color System Audit

### Design tokens (correct) — `index.css:3-24`

```
--color-primary: #0A84FF   (Apple Blue)
--color-accent:  #FF375F   (Apple Red-Pink)
--color-bg:      #000000
--color-surface: #1C1C1E
--color-ink:     #F5F5F7
```

Success `#30D158` and warning `#FFD60A`, `#FF9F0A` exist only as hardcoded hex in component files — **not tokenized**.

### Unique hex values found in .tsx files

36 distinct hex codes. The ones that should **not** exist as raw hex:

| Hex | Usage | What it should be |
|---|---|---|
| `#0A84FF` hardcoded (EditingBadge:51,53, MLSExport:135,167, App.tsx:1531) | Primary | `var(--color-primary)` |
| `#FF375F` hardcoded across 12 files | Error | `var(--color-error)` — **token doesn't exist yet, add it** |
| `#30D158` hardcoded across 10 files | Success | `var(--color-success)` — **token doesn't exist** |
| `#FFD60A` hardcoded across 8 files | Warning/gold | `var(--color-warning)` — **missing** |
| `#FF9F0A` (EditingBadge chain-full amber) | Warning-orange | Fold into `--color-warning` or add `--color-warning-orange` |
| `#64D2FF` (sky blue, tool color) | Accent | Tool chip only — tolerable, but needs a namespace |
| `#BF5AF2` | Unused-ish purple tool color | Audit: is it still live? |
| `#1a1a1a` (QuickStartTutorial:114, feature cards) | Surface | Should be `var(--color-surface)` = `#1C1C1E` — these two greys are visibly different side-by-side |
| `#050505` (App.tsx:2334 editor shell bg) | Near-black | Replace with `var(--color-bg-deep)` or just `#000` |
| `#4285F4/34A853/FBBC05/EA4335` | Google logo SVG | Fine — third-party brand |
| `#FF5F57/FEBC2E/28C840` | macOS window dots on landing mockup | Fine — decorative |

### Rogue colors / inconsistencies

1. **Two different "dark surface" shades** — `#1a1a1a` (tutorial, testimonials, feature cards via `bg-white/[0.02]`) and `#1C1C1E` (premium-surface token). They don't match at ~100% zoom.
2. **Amber usage split** — chain-full badge uses `#FF9F0A`, early-bird pill uses `#FFD60A`, SOON badge uses `amber-500` (Tailwind). Three different amber/gold.
3. **Blue-to-blue gradient on Upgrade button** (`App.tsx:2159`) `from-[var(--color-primary)] to-blue-400` — the only gradient-on-solid-CTA in the app. Either gradient all primary CTAs or none.
4. **Shadow color glow** — `index.css:24` defines `--shadow-glow: 0 4px 24px rgba(10, 132, 255, 0.12)` but nothing uses it. Meanwhile, 7 components use hardcoded `shadow-blue-500/20` or `shadow-lg shadow-blue-500/20` at custom opacities. **Violates CLAUDE.md "no glow" rule** — see `App.tsx:1231`, `App.tsx:1266`.
5. **`feature-badge-primary` / `feature-badge-accent` exist** but components render pill-shaped status strings manually (e.g., `rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#FFD60A]/15 text-[#FFD60A] border border-[#FFD60A]/30` in ReferralDashboard.tsx:186 and AdminShowcase.tsx:154). Six components re-implement this.

### Shadows / depth

`index.css:19-24` defines `--shadow-xs/sm/md/lg/xl`. Components almost exclusively use Tailwind's `shadow-lg/shadow-xl/shadow-2xl`, which render different from the tokens. Reconcile — either delete the CSS vars or convert Tailwind shadows to use them.

---

## 3. Typography Audit

### Font families — correctly used

- `DM Serif Display` for headlines/titles (via `.font-display` and the few `h1`–`h4` that exist). Used 41 times across 15 files. Consistent.
- `Inter` for body (default). Correct.
- `SF Mono` stubbed at `.terminal-text` but used in `font-mono` class on ~15 countdowns/char-counts. Inconsistent — some use `font-mono`, some `terminal-text`, some neither.

### Type scale — the crisis

Raw counts from `/components` + `App.tsx`:

| Size | Count |
|---|---|
| `text-sm` (14px) | 169 |
| `text-xs` (12px) | 121 |
| `text-[10px]` | 101 |
| `text-[9px]` | 24 |
| `text-lg` (18px) | 21 |
| `text-[11px]` | 21 |
| `text-3xl` (30px) | 9 |
| `text-xl` / `text-2xl` | 8 / 8 |
| `text-[8px]` | 11 |
| `text-base` (16px) | 7 |
| `text-[13px]` | 8 |
| `text-5xl` | 5 |
| `text-4xl` | 2 |
| `text-[7px]` | 3 |

**→ 14 effective sizes in use.** The eye parses this as "every panel was designed by a different person." Seven of those (`7/8/9/10/11/13/[clamp]`) are arbitrary values that bypass the scale entirely.

### Recommended 7-step scale

| Token | Size | Line-height | Usage |
|---|---|---|---|
| `text-2xs` | 10px | 1.2 | Badges, labels, timestamps (**ONLY**) |
| `text-xs` | 12px | 1.4 | Metadata, chip text |
| `text-sm` | 14px | 1.5 | Body, buttons, inputs |
| `text-base` | 16px | 1.5 | Lead paragraph |
| `text-lg` | 18px | 1.4 | Panel titles (`h3`) |
| `text-xl` | 22px | 1.3 | Section titles (`h2`) |
| `text-display` | clamp(2.5rem, 6vw, 4.5rem) | 1.0 | Hero only |

Delete `text-[7px]`, `text-[8px]`, `text-[9px]`, `text-[11px]`, `text-[13px]` — every one.

Also: `uppercase tracking-[0.12em|0.14em|0.15em|0.16em|0.2em|0.25em] text-[9/10/11]px font-bold` — this "tiny caps label" pattern appears 50+ times with 5 different tracking values. Pick one: `tracking-[0.18em]` and commit.

---

## 4. Spacing / Density / Radius Audit

### Border radius — raw data

```
123 × rounded-lg      (0.5rem)
110 × rounded-xl      (0.75rem)
 84 × rounded-full
 54 × rounded-2xl     (1rem)
  9 × rounded-md      (0.375rem)
  2 × rounded-sm
  1 × rounded-none
  1 × rounded-3xl     (1.5rem)
```

Plus arbitrary values:

- `rounded-[2.5rem]` — `App.tsx:2263` (upload empty state card) **one-off**
- `rounded-[2rem]` — `App.tsx:2594` (right sidebar sheet on desktop) **one-off**
- `rounded-[1.25rem]` — `CompareSlider.tsx:57` — matches `--radius-2xl` nominally but written as custom
- `rounded-[10px] sm:rounded-[14px]` — `App.tsx:2388` canvas inner — another one-off

**Five distinct radius sizes** (lg/xl/2xl/full/one-offs) plus the CSS vars `--radius-sm/md/lg/xl/2xl/3xl` (6 more, most unused). 11 effective radii.

### Recommended 3-radius system

| Token | Size | Usage |
|---|---|---|
| `radius-sm` | 0.5rem (8px) | Buttons, inputs, chips |
| `radius-md` | 1rem (16px) | Cards, panels, modals, canvas |
| `radius-full` | 9999px | Pills, avatars, status dots |

Kill everything else. Specifically:

- `App.tsx:2263` `rounded-[2.5rem]` → `rounded-2xl` (1rem). The current look is **too rounded** — it reads bubbly/consumer, not premium. Linear/Photoroom use 12–16px.
- `App.tsx:2594` `lg:rounded-[2rem]` on sidebar → `rounded-2xl`.
- `App.tsx:2388` inner canvas `rounded-[10px] sm:rounded-[14px]` → a single `rounded-lg`.

### Padding/gap — the "panel-header pattern" duplication

Three components render "icon square + title + subtitle" header rows:

- `SpecialModesPanel.tsx:70` — `<div className="subtle-card rounded-xl p-2 text-[var(--color-primary)] shrink-0">{icon}</div>` + title/subtitle.
- `StyleControls.tsx:231-237` and `:271-278` — same structure, inline.
- `BrandKit.tsx` — slight variant.
- `MLSExport.tsx:134-140` — inline variant without the icon-card.

This is a clear **extract-component moment** (see §8 below).

---

## 5. Component Consistency Audit

### Buttons — counted variants in use

1. `cta-primary` class (token-based) — used ~8 times
2. `cta-secondary` class — used ~12 times
3. Inline `bg-[var(--color-primary)] text-white rounded-xl/2xl/lg px-*` — ~15 times (re-inventing the token)
4. Inline `bg-white text-black rounded-full px-* py-*` (landing CTA) — 6 times, slightly different each
5. Inline `bg-gradient-to-r from-[var(--color-primary)] to-blue-400` (Upgrade CTA) — 4 instances in `App.tsx:2159, 2219, 1828`
6. Inline `rounded-lg px-2.5 py-1.5 text-xs font-bold` (Upgrade mini) — 2 variants
7. Inline ghost `border border-white/[0.08] hover:border-white/[0.16]` — 5 instances
8. Nav item (`.nav-item` class) — sidebar only
9. Mobile tab bar button — inline, unique

**Nine button variants.** Target: 4 (primary, secondary, ghost, icon-only).

### Cards — counted variants

1. `premium-surface rounded-2xl` — 14 instances (the token pattern; good)
2. `premium-surface-strong rounded-2xl` — 4 instances (sticky CTA bar in StyleControls)
3. `subtle-card rounded-xl` — 4 instances (panel-header icon squares)
4. `bg-white/[0.02] border border-white/[0.06] rounded-2xl` — 12+ instances on the landing page (re-implements premium-surface with different numbers)
5. `bg-zinc-900 rounded-xl border border-zinc-800` — **MLSExport.tsx:130 alone** (entirely different palette)
6. `bg-[#1a1a1a] border border-white/[0.08]` — QuickStartTutorial.tsx:114 (different again)
7. `feature-card-interactive` — landing page, hover-expand pattern (good, reusable)

**Seven card treatments.** MLSExport and QuickStartTutorial look foreign because they bypass the token system entirely. MLSExport.tsx:130 is the worst offender — it's the only component rendered into the right panel that uses `bg-zinc-900` instead of `premium-surface`, making the MLS tab feel like a different product.

### Inputs

- `StyleControls.tsx:247` textarea: `rounded-2xl border border-[var(--color-border-strong)] bg-black/60 … font-mono` — mono font
- `BrandKit.tsx` inputs: (need to pull — but from context likely rounded-lg)
- `MLSExport.tsx` watermark text input: inline rounded-lg bg-zinc-800
- `SocialPack.tsx` property fields: yet another treatment

Four input variants. Pick one.

### Pills / chips

`.pill-chip` CSS class exists. Used 5 times. But inline pill re-implementations appear 30+ times (e.g., `rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#X]/15 border border-[#X]/30`).

### Modals

- `ExportModal.tsx:458` — uses `modal-overlay` class ✓
- `App.tsx:1824, 1921` (Upgrade, Access panel) — use `modal-overlay` ✓
- `QuickStartTutorial.tsx:108` — uses `bg-black/70 backdrop-blur-sm` inline instead of `modal-overlay`. Inconsistent backdrop blur across modals.

---

## 6. Editor Canvas Polish

The canvas (`App.tsx:2385-2510`) is the hero surface. What currently works:

- `canvas-frame` wrapper with `rounded-xl sm:rounded-2xl glass-overlay` is correct.
- Room-type pill + EditingBadge combo reads well at top-left.
- Compare slider with `rounded-[1.25rem]` and bottom-centered "Before/After" pill is classy.
- Generation overlay with typing effect ("Reading the room… / Placing furniture… / Polishing…") is genuinely premium.

What's weak:

1. **`rounded-[10px] sm:rounded-[14px]` inside `rounded-2xl` parent** creates a double-rim artifact. Use a single radius token and tighten the nested gap.
2. **`shadow-2xl` on the outer canvas-frame + inner `border-[var(--color-border-strong)]`** = two competing depth cues. Pick one (I'd keep the shadow, drop the inner border).
3. **Generating overlay pill** `border-[var(--color-primary-dark)] bg-black` — the black is darker than the surrounding `#050505` bg, which visually pushes the pill *into* the canvas instead of floating above it. Make it `bg-[var(--color-surface)]/90` + `backdrop-blur-md`.
4. **Toolbar buttons in the header** (`cta-secondary` variant with size-13 icons) sit against a canvas with size-21 icons in the sidebar nav. A 40% size jump within one viewport. Normalize to 16/20.
5. **The canvas has no caption/meta strip.** Photoroom / Figma / Krea all show image dimensions, file name, or zoom level under the canvas. Missing feedback surface.

---

## 7. Landing → Editor Handoff

The landing page (`App.tsx:1224-2090`) and the editor (`App.tsx:2333+`) share a dark palette but feel like two apps:

| Attribute | Landing | Editor |
|---|---|---|
| Card bg | `bg-white/[0.02] border-white/[0.06]` | `premium-surface` (`#1C1C1E` + border alpha 0.08) |
| Primary CTA shape | `rounded-xl` white-on-black / `rounded-full` pill | `rounded-2xl` blue `cta-primary` |
| Headline font weight | `font-black` throughout | `font-semibold` in panels |
| Body line-height | `leading-relaxed` | Tailwind default |
| Accent color | Uses `#FFD60A` (early-bird), `#30D158` (savings), `#FF9F0A` (dusk) as accents | Almost entirely `--color-primary` |

Fixes: either extract landing to its own design decision (acceptable — marketing is allowed to breathe), OR unify both on `premium-surface` + `cta-primary`. The mid-state we're in feels unintentional.

---

## 8. Competitor Reference (from memory — WebFetch blocked)

### Linear
- One accent color (electric violet-blue) + true black + one surface grey. No secondary palette.
- Radius: effectively `0.5rem` (buttons/inputs) and `0.75rem` (cards). Two radii.
- Type scale: 6 named sizes (`2xs` 11px → `xl` 20px) + one display clamp. Hard stop.
- Icons all at 14px or 16px inside content; 20px for section headers.
- Depth: one shadow. `box-shadow: 0 1px 2px rgba(0,0,0,0.2)` on floating elements. No glows.
- What to steal: **radical restraint**. Any item that could be two shades is one.

### Photoroom
- White-first default but dark-mode editor; color swatches as tool accents, not UI accents.
- Radius: `0.625rem` on buttons, `1rem` on panels.
- Uses outline icons at a single 20px size across the entire app.
- Canvas is centered, isolated by a subtle radial gradient from edge inward — a technique StudioAI could mimic in `.editor-canvas-bg`.
- What to steal: **monochrome UI, color only on content**. Make the Pro AI Tools' chroma come from generated imagery, not the chrome.

### Krea
- Near-black canvas bg, panels at `#111`, hover states at `#1A1A1A`.
- Type: almost exclusively `text-sm` and `text-xs`. Titles are `text-[13px] font-medium uppercase tracking-wide` — sparingly. Zero `text-lg+` inside the editor.
- Button sizes: one `h-9` default, one `h-7` compact. No third.
- What to steal: **one button height in the product surface**. StudioAI has 5+.

---

## 9. Before → After Snippets

### 9.1 Unify MLS Export card with the design system

`components/MLSExport.tsx:130`

```diff
- <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-5">
+ <div className="premium-surface rounded-2xl p-5 space-y-5">
```

And `:142`:
```diff
- <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded-lg">
+ <span className="feature-badge text-[var(--color-text)]">
```

### 9.2 Kill the bubbly upload card radius

`App.tsx:2263`

```diff
- <div className="w-full max-w-lg mx-auto px-8 py-20 text-center animate-fade-in glass-overlay rounded-[2.5rem] border border-[var(--color-border-strong)] shadow-2xl relative overflow-hidden">
+ <div className="w-full max-w-lg mx-auto px-8 py-20 text-center animate-fade-in glass-overlay rounded-2xl border border-[var(--color-border-strong)] shadow-lg relative overflow-hidden">
```

### 9.3 Replace the stat-strip 9px with a named token

`App.tsx:1305`

```diff
- <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">{s.label}</div>
+ <div className="text-2xs font-bold uppercase tracking-[0.18em] text-zinc-500">{s.label}</div>
```

(Requires adding `2xs: ['0.625rem', '1.2']` and standardizing tracking.)

### 9.4 Token-ize toast error color

`App.tsx:868` (repeat ×6)

```diff
- showToast(<X size={14} className="text-[#FF375F]" />, 'Generation timed out — try again');
+ showToast(<AlertTriangle size={14} className="text-[var(--color-error)]" />, 'Generation timed out — try again');
```

(Also renames the overloaded X icon.)

### 9.5 One `<PanelHeader>` component

Replace three hand-rolled versions (StyleControls.tsx:230-238, :271-279, SpecialModesPanel.tsx:70-74, BrandKit.tsx) with:

```tsx
<PanelHeader
  icon={<Wand2 size={18} />}
  title="Style Packs"
  subtitle="Select a curated direction"
/>
```

---

## 10. Design System Extraction List

Pull these into shared utilities/components. Current count → target count:

| Element | Variants today | Target |
|---|---|---|
| Button | 9 | 4 (`<Button variant="primary\|secondary\|ghost\|icon" size="sm\|md">`) |
| Card | 7 | 3 (`premium-surface`, `premium-surface-strong`, `subtle-card`) |
| Input | 4 | 1 |
| Pill / badge | 30+ inline | 1 (`<Badge tone="primary\|success\|warning\|error\|neutral">`) |
| Panel header (icon+title+subtitle) | 4 inline copies | 1 component |
| Icon size | 14 | 6 (`xs/sm/md/lg/xl/2xl`) |
| Radius | 11 | 3 (`sm/md/full`) |
| Type size | 14 | 7 |
| Modal overlay | 2 treatments | 1 (`.modal-overlay`) |
| Section label ("tiny caps") | 5 tracking values | 1 |

Also: **codify the existing CSS tokens in `tailwind.config.js`** so components can write `text-ink`, `bg-surface`, `border-border-strong` instead of `text-[var(--color-ink)]` (the arbitrary-value escape hatch is why new code drifts).

---

## 11. Priority-Ranked Fix List (15)

1. **Kill the 14 icon sizes → 6.** Round `15→16`, `13→14`, `11→12`, `21→20`, `28→24`. `grep -n 'size={15\|13\|11\|21\|28}'` then sweep.
2. **Kill the arbitrary text sizes.** Delete every `text-[7/8/9/10/11/13]px` and substitute `text-2xs` (add to Tailwind) / `text-xs`.
3. **Tokenize error/success/warning colors.** Add `--color-error #FF375F`, `--color-success #30D158`, `--color-warning #FFD60A`. Refactor ~30 hardcoded hex usages.
4. **Reunify MLS Export UI** with `premium-surface` (`components/MLSExport.tsx:130` and subtree). Currently the entire MLS tab looks like it belongs to a different product.
5. **Cut one-off radii** (`rounded-[2.5rem]`, `rounded-[2rem]`, `rounded-[10px]`, `rounded-[14px]`, `rounded-[1.25rem]`) → collapse to `rounded-lg/xl/2xl`.
6. **Extract `<PanelHeader>`**, `<Button>`, `<Badge>`, `<Pill>` components. Refactor top 10 usages to prove the pattern.
7. **Remove/replace Heart for "save"** — becomes `BookmarkPlus`. Heart implies social like.
8. **De-overload the X icon** — error toasts → `AlertTriangle`, close → keep `X`.
9. **Consolidate loader** — delete every `LoaderCircle` import, use `Loader2`.
10. **Shadows on primary surfaces** — delete `shadow-2xl` from canvas-frame and upload card; use `var(--shadow-lg)` consistently. Remove the blue-glow shadow (`shadow-blue-500/20`) per CLAUDE.md.
11. **Unify "tiny-caps label" tracking** to `tracking-[0.18em]`. Five values today.
12. **QuickStartTutorial** needs to use `modal-overlay` + `premium-surface` instead of bespoke `#1a1a1a`.
13. **Generating overlay pill** should float on `backdrop-blur` + surface color, not pure black.
14. **Reconcile landing vs editor card treatments** — either one system, or accept the gap and ship a `marketing-card` class so it's intentional.
15. **Add a canvas meta strip** (image name, dimensions, zoom) at the bottom of the canvas to match the level of polish Photoroom/Krea ship.

---

## 12. If We Did Nothing Else

**Collapse the type scale and icon sizes into Tailwind tokens.** One focused PR that:

- Adds `fontSize` tokens `2xs/xs/sm/base/lg/xl/display` to `tailwind.config.js`.
- Adds `iconSize` utilities or a 6-value `<Icon>` wrapper.
- Does a mechanical sweep: `text-[Npx] → text-2xs`, `size={N} → size={14/16/20}`.

No new components, no design work, no copy changes. Pure cleanup. Result: every panel suddenly looks like it was designed by the same person, because it will have been. This is the highest ratio of "perceived quality gain" to "effort required" available in the codebase right now, and it's a prerequisite for any further visual investment — you can't polish a surface whose dimensions keep shifting.

---

*End of report.*
