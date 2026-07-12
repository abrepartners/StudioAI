# Replicate input contract

Every Replicate model takes its inputs under **specific field names**. They are
NOT interchangeable — put the source image under the wrong key and the model
silently ignores it and hallucinates from text, or rejects an unknown param.
Two real outages came from exactly this class:

- `stripe-status`/`checkout`/`record-generation` 500'd because `api/` functions
  imported `../shared/monetization` **without a `.js` extension** (Node ESM
  needs it). → the import-extension rule below.
- Declutter's Bria guardrails were dropped because `bria/fibo-edit` was sent a
  `negative_prompt` field it doesn't have. → the per-model contract below.

**Before wiring or changing any `replicate.run(...)` call, check this table and
run `npm run check:api`.** The checker (`scripts/check-api-contract.mjs`) fails
on a wrong image field or a known-forbidden key.

## Source-image field per model (the load-bearing one)

| Model                                | Source-image field             | Type              | Notes                                                                                                                                    |
| ------------------------------------ | ------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `google/nano-banana-pro`             | `image_input`                  | **array**         | Gemini 3 Pro Image. `resolution` 1K/2K/4K, `aspect_ratio` default `match_input_image`, `allow_fallback_model`, `safety_filter_level`     |
| `google/nano-banana`                 | `image_input`                  | **array**         | Gemini 2.5 Flash Image. no `resolution`                                                                                                  |
| `bytedance/seedream-4`               | `image_input`                  | **array**         | `size` 1K/2K/4K + `aspect_ratio`; `enhance_prompt`                                                                                       |
| `black-forest-labs/flux-kontext-pro` | `input_image`                  | **single string** | NOT an array. `safety_tolerance` max 2 with input images                                                                                 |
| `black-forest-labs/flux-2-pro`       | `input_images`                 | **array**         | `aspect_ratio` **defaults to 1:1** — must set `match_input_image`; `resolution` like "2 MP"                                              |
| `black-forest-labs/flux-fill-pro`    | `image` (+ `mask`)             | string            | inpaint; `prompt`, `steps`, `guidance`                                                                                                   |
| `bria/fibo-edit`                     | `image` (+ `mask`)             | string            | inputs are ONLY `image`, `instruction`, `mask`, `structured_instruction`. **NO `negative_prompt`** — fold constraints into `instruction` |
| `prunaai/p-image-upscale`            | `image`                        | string            | `factor`, `upscale_mode`, `output_format`, `output_quality`, `enhance_details`, `enhance_realism`                                        |
| `tmappdev/lang-segment-anything`     | `image` (+ `text_prompt`)      | string            | SAM-by-text mask                                                                                                                         |
| `lucataco/moondream2`                | `image` (+ `prompt`)           | string            | VQA / room classify                                                                                                                      |
| `openai/gpt-image-2`                 | `input_images`                 | **array**         | Property Morph reframe + construction still. `quality` high, `aspect_ratio` 2:3 (max), `output_format` **png** (jpg → 422)               |
| `bytedance/seedance-1-pro`           | `image` (+ `last_frame_image`) | string×2          | Property Morph video. start+end frame morph; `duration` 5, `resolution` 1080p, `aspect_ratio` 9:16, `camera_fixed` true                  |

Three different names — `image_input` (array) vs `input_image` (single string)
vs `input_images` (array) vs `image` — are the trap. Copy-pasting a call from
one model to another without swapping the field is the #1 way to break a tool.

## Import rule (api/ functions run as Node ESM)

`package.json` is `"type": "module"` and Vercel runs the functions on Node 24.
`tsconfig` uses `moduleResolution: "bundler"`, so TypeScript does NOT flag a
missing extension — but the **runtime** throws `ERR_MODULE_NOT_FOUND`. Therefore
every **relative** import in `api/` MUST include the extension:

```ts
import { json } from "./utils.js"; // ✅
import { PLAN } from "../shared/monetization.js"; // ✅
import { PLAN } from "../shared/monetization"; // ❌ crashes at runtime
```

## Adding a new model

1. Look up the model's input schema on its Replicate page
   (`replicate.com/<owner>/<model>` → API tab) — specifically the source-image
   field name and required params.
2. Add a row above and a contract entry in `scripts/check-api-contract.mjs`.
3. Run `npm run check:api` — it must pass.
