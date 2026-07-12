import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { Icon } from "./icons";
import { useBrandKit } from "../../hooks/useBrandKit";

// ── Output generators — lazy-loaded so they never bloat the editor chunk.
// These were stranded on the dead /legacy route; surfacing them here is the
// single highest-leverage win. All operate on ALREADY-processed images or
// live endpoints (MLS/Social/Print are client-side; SocialPack hits the live
// /api/render-template; ListingDescription uses the live Gemini copy helpers).
const MLSExport = lazy(() => import("../../components/MLSExport"));
const SocialPack = lazy(() => import("../../components/SocialPack"));
const ListingDescription = lazy(
  () => import("../../components/ListingDescription"),
);
const PrintCollateral = lazy(() => import("../../components/PrintCollateral"));
const ListingKitPipeline = lazy(
  () => import("../../components/ListingKitPipeline"),
);
const ExportModal = lazy(() => import("../../components/ExportModal"));
import { fluxCleanup } from "../../services/fluxService";
import {
  fluxTwilight,
  TwilightColorStyle,
  TwilightTime,
} from "../../services/twilightService";
import { nanoSky, SkyStyle } from "../../services/skyService";
import { upscaleImage } from "../../services/upscaleService";
import { isExteriorRoom } from "../../services/fluxService";
import { fluxStaging, getEngineOverride } from "../../services/stagingService";
import { classifyRoom } from "../../services/classifyRoomService";
import { reveEdit } from "../../services/reveEditService";
import { fluxRenovation } from "../../services/renovationService";
import { STYLE_PACKS, buildStagingAssignment } from "../prompts/stylePacks";
import { buildMagicEditPrompt } from "./toolPrompts";
import {
  detectClutterMasks,
  combineSelectedMasks,
} from "../../services/samService";
import ClutterMaskSelector from "../../components/ClutterMaskSelector";
import JSZip from "jszip";
import {
  savePhoto as idbSavePhoto,
  saveResult as idbSaveResult,
  loadPhotos as idbLoadPhotos,
  loadResults as idbLoadResults,
  deleteProjectImages as idbDeleteProject,
} from "./imageStore";
import { checkCleanupDrift } from "../utils/cleanupQA.ts";
import {
  buildCleanupSignal,
  type CleanupQualitySignal,
} from "../types/cleanupQuality.ts";
import { useVellumStore } from "./useVellumStore";
import { postProcessToolOutput } from "./toolPostProcess";
import { generateThumbnail } from "../../utils/thumbnail";
import { requestNotifyPermission, notifyDone } from "./notify";

const SCRATCH_KEY = "__quick_edit__";

// ── Per-tool composite drift-fix presets (C3) ───────────────────────────────
// Renovation makes LOW-contrast whole-plane material swaps (wall color, floors,
// backsplash) that a cleanup-tuned threshold silently filters out, so it needs
// a far more permissive threshold to let those large diffs survive the mask.
interface UploadedPhoto {
  id: number;
  file: File;
  dataUrl: string;
  label: string;
  detecting: boolean;
  /** From /api/classify-room: true = no freestanding furniture. undefined =
   *  detection unavailable (never blocks tools — gate fails open). */
  empty?: boolean;
}

interface HistoryEntry {
  tool: string;
  preset: string;
  image: string;
}

interface PhotoGenState {
  tool: string;
  preset: string;
  step: number;
  progress: number;
  abort: AbortController;
  timerRef: ReturnType<typeof setTimeout> | null;
}

const TOOLS = [
  { section: "Magic" },
  {
    id: "magicedit",
    icon: "sparkles",
    name: "Magic edit",
    desc: "Describe any change",
    cost: "2 cr",
  },
  { section: "Refine" },
  {
    id: "staging",
    icon: "armchair",
    name: "Virtual staging",
    desc: "Add furniture in context",
    cost: "2 cr",
  },
  {
    id: "declutter",
    icon: "sparkles",
    name: "Declutter & cleanup",
    desc: "Remove personal items",
    cost: "1 cr",
  },
  {
    id: "whiten",
    icon: "sun",
    name: "Daylight & white balance",
    desc: "Even, warm exposure",
    cost: "0.5 cr",
  },
  {
    id: "renovation",
    icon: "hammer",
    name: "Virtual renovation",
    desc: "Swap cabinets, counters, floors, walls",
    cost: "2 cr",
  },
  { section: "Atmosphere" },
  {
    id: "twilight",
    icon: "moon",
    name: "Twilight conversion",
    desc: "Day to dusk",
    cost: "2 cr",
  },
  {
    id: "sky",
    icon: "cloud",
    name: "Sky replacement",
    desc: "Clear blue or golden hour",
    cost: "1 cr",
  },
  {
    id: "lawn",
    icon: "leaf",
    name: "Lawn & landscape",
    desc: "Greener, polished exteriors",
    cost: "1 cr",
  },
];

const PRESETS: Record<string, string[]> = {
  staging: [
    "Contemporary",
    "Mid-century",
    "Coastal",
    "Farmhouse",
    "Scandinavian",
    "Minimalist",
    "Urban loft",
    "Bohemian",
  ],
  declutter: [
    "Full clean",
    "Personal items only",
    "Surface clutter only",
    "Precision select",
  ],
  declutter_ext: ["Yard clutter", "Vehicles & bins", "Signs & temp items"],
  whiten: ["Bright & airy", "Warm editorial", "Neutral"],
  twilight_style: ["Pink", "Golden", "Purple", "Natural"],
  twilight_time: ["Early evening", "Sunset", "Twilight"],
  sky: ["Clear blue", "Golden hour", "Soft overcast", "Dramatic"],
  lawn: ["Natural", "Manicured", "Drought-resistant"],
};

const DECLUTTER_FILTER_MAP: Record<string, string | undefined> = {
  "full clean": "fullclean",
  "personal items only": "personal",
  "surface clutter only": "surfaces",
  "yard clutter": "yard",
  "vehicles & bins": "vehicles",
  "signs & temp items": "signs",
};

const TOOL_STEPS: Record<string, string[]> = {
  magicedit: [
    "Reading your instruction…",
    "Editing the scene…",
    "Blending the result…",
    "Finalizing…",
  ],
  staging: [
    "Analyzing room geometry…",
    "Selecting furniture for style…",
    "Rendering surfaces + shadows…",
    "Finalizing…",
  ],
  declutter: [
    "Detecting personal items…",
    "Mapping inpaint regions…",
    "Reconstructing surfaces…",
    "Finalizing…",
  ],
  whiten: [
    "Sampling light sources…",
    "Adjusting white balance…",
    "Harmonizing exposure…",
    "Finalizing…",
  ],
  renovation: [
    "Mapping surfaces to renovate…",
    "Selecting new materials…",
    "Rendering surfaces + reflections…",
    "Finalizing…",
  ],
  twilight: [
    "Analyzing exterior lighting…",
    "Compositing golden hour sky…",
    "Blending window glow…",
    "Finalizing…",
  ],
  sky: [
    "Masking roofline…",
    "Matching perspective…",
    "Compositing sky layer…",
    "Finalizing…",
  ],
  lawn: [
    "Detecting lawn area…",
    "Applying seasonal correction…",
    "Blending edges…",
    "Finalizing…",
  ],
};

const TOOL_COST: Record<string, number> = {
  magicedit: 2,
  staging: 2,
  declutter: 1,
  whiten: 0.5,
  renovation: 2,
  twilight: 2,
  sky: 1,
  lawn: 1,
};

/** Furnished staging is a remove-and-replace pass — priced at 3 cr vs 2.
 *  Every cost surface (Apply label, batch totals, billing, activity) goes
 *  through this so the price can never disagree with itself. */
const REPLACE_STAGING_COST = 3;
const toolCostFor = (
  tool: string,
  photo?: { empty?: boolean } | null,
): number =>
  tool === "staging" && photo?.empty === false
    ? REPLACE_STAGING_COST
    : TOOL_COST[tool];

/** Rooms virtual staging is designed for — empty living spaces that take
 *  freestanding furniture. Kitchens/baths/exteriors are blocked: staging a
 *  built-out or outdoor space makes the model reinterpret the whole scene
 *  (the 2026-06-10 "entire room changed" incident — staging ran on a kitchen
 *  and a backyard because everything defaulted to Living Room). */
const STAGEABLE_ROOMS = new Set([
  "Living Room",
  "Dining Room",
  "Bedroom",
  "Office",
  "Bonus Room",
  "Media Room",
  "Nursery",
  "Basement",
  "Sunroom",
  "Foyer",
]);

const ROOM_TYPES = [
  "Living Room",
  "Dining Room",
  "Kitchen",
  "Bedroom",
  "Bathroom",
  "Office",
  "Laundry Room",
  "Garage",
  "Bonus Room",
  "Media Room",
  "Nursery",
  "Basement",
  "Foyer",
  "Hallway",
  "Closet",
  "Sunroom",
  "Patio",
  "Pool",
  "Backyard",
  "Front Yard",
];

const BATCH_CONCURRENCY = 3;

interface PhotoEditorProps {
  setPage: (p: string) => void;
  credits: number;
  requestSpend: (amount: number, after?: (res: any) => void) => boolean;
  recordGeneration: (
    amount?: number,
    meta?: { tool?: string; model?: string },
  ) => void;
  activeProject?: {
    id: string;
    address: string;
    city: string;
    propertyType: string;
    beds: number | null;
    baths: number | null;
  } | null;
  updateProject?: (id: string, partial: Record<string, any>) => void;
  /** Called when a generation returns 401 (session cookie expired). Bounces
   *  the user back to sign-in so they can re-establish a session. */
  onSessionExpired?: () => void;
}

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, b64] = dataUrl.split(",");
  const mime = header?.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
};

type SamModalController = (
  image: string,
  masks: string[],
) => Promise<number[] | null>;

export interface ApiDirectResult {
  resultBase64: string;
  maskBase64?: string;
  /** Which server engine produced the frame (staging: nano-banana | flux-fill |
   *  seedream; declutter: nano | bria | reve). Feeds the usage dashboard. */
  engine?: string;
}

/**
 * The one dispatch every tool runs through — production editor AND the admin
 * Model Lab. Exported so the lab exercises the exact same services, endpoints,
 * engines, and prompts prod does (single source of truth).
 *
 * `promptOverride` lets the lab run an edited prompt through the real pipeline
 * for the tools that build their prompt client-side (staging, declutter,
 * magicedit). Production never passes it, so behavior there is unchanged.
 */
export const callApiDirect = async (
  imageBase64: string,
  roomLabel: string,
  tool: string,
  preset: string,
  customRemovalVal: string,
  signal: AbortSignal,
  requestSamMaskSelection?: SamModalController,
  replaceFurniture = false,
  promptOverride?: string,
): Promise<ApiDirectResult> => {
  const presetMap: Record<string, Record<string, string>> = {
    sky: {
      "clear blue": "blue",
      "golden hour": "golden",
      "soft overcast": "overcast",
      dramatic: "dramatic",
    },
  };

  switch (tool) {
    case "staging": {
      // STYLE_PACKS keys are lowercase ("contemporary", "urban-loft") but the
      // UI presets are capitalized ("Contemporary", "Urban loft"). MUST
      // lowercase before lookup or every pack misses → the bare fallback prompt
      // below (no preservation rules) is used. reve/edit hid this for months
      // (faithful in-place regardless of prompt); Seedream takes the bare prompt
      // literally and regenerates the whole room. Lowercase fixes all 8 presets.
      const packKey = preset.toLowerCase().replace(/ /g, "-");
      const pack = STYLE_PACKS[packKey] || STYLE_PACKS[preset.toLowerCase()];
      // Hardened fallback: even for an unmapped style, frame it as an ADDITIVE
      // edit with explicit preservation so Seedream never regenerates the room.
      const prompt = promptOverride
        || (pack
        ? buildStagingAssignment(
            pack,
            roomLabel,
            replaceFurniture ? "replace" : "add",
          )
        : `Take this exact photograph of a ${roomLabel.toLowerCase()} and ${replaceFurniture ? "REPLACE all existing freestanding furniture and decor with" : "ADD"} ${preset} style furniture${replaceFurniture ? "" : " to it"}. This is an ADDITIVE edit, NOT image generation: keep every existing pixel — floor material, walls, ceiling, windows, cabinets, lighting, camera angle, and color temperature — identical to the input. Do NOT re-render, restyle, relight, or recolor anything already in the photo. Only place new free-standing furniture and decor into the empty space, with shadows and white balance matched to the room. If the floor is tile, stone, or marble it MUST stay that exact material.`);
      const result = await fluxStaging(imageBase64, prompt, signal, {
        skipUpscale: true,
        furnished: replaceFurniture,
      });
      return { resultBase64: result.resultBase64, engine: result.engine };
    }
    case "declutter": {
      const isPrecision = preset.toLowerCase() === "precision select";
      // Engine A/B (same ?engine=nano session override as staging): whole-frame
      // Nano Banana Pro, prompt-only — skip SAM detection entirely; that's the
      // hypothesis under test. Precision Select keeps Bria+mask regardless:
      // the user-picked mask IS the feature there.
      const nanoCleanup = !isPrecision && getEngineOverride() === "nano";
      const filter = isPrecision
        ? undefined
        : DECLUTTER_FILTER_MAP[preset] || undefined;
      const custom = customRemovalVal || undefined;

      let maskBase64: string | undefined;
      let customPrompt: string | undefined;

      if (isPrecision) {
        if (!requestSamMaskSelection) {
          throw new Error(
            "Precision select requires the mask picker — internal wiring error.",
          );
        }
        const samResult = await detectClutterMasks(imageBase64);
        if (!samResult || samResult.individualMasksBase64.length === 0) {
          throw new Error(
            "Could not detect any objects. Try a different preset.",
          );
        }
        const selectedIndices = await requestSamMaskSelection(
          imageBase64,
          samResult.individualMasksBase64,
        );
        if (!selectedIndices || selectedIndices.length === 0) {
          throw new Error("Cleanup cancelled");
        }
        const selectedMasks = selectedIndices.map(
          (i) => samResult.individualMasksBase64[i],
        );
        maskBase64 = await combineSelectedMasks(selectedMasks);
        customPrompt = `Remove all objects in the masked area from this ${roomLabel.toLowerCase()}. Reconstruct the revealed surfaces using ONLY the material visible at the mask boundary edges — match the exact texture, color, grain, and surface type. If the surrounding area is dirt, fill with dirt. If concrete, fill with concrete. If grass, fill with grass at the same color and density. Do not add any material not already present in the surrounding area. Do not add any new items. Leave all unmasked pixels identical to the input.`;
      }
      // Standard presets are prompt-only on nano — SAM detection deleted
      // (2026-06-11 bake-off). Precision Select above is the only mask path.

      const result = await fluxCleanup(imageBase64, roomLabel, signal, {
        filter,
        customRemoval: custom,
        skipUpscale: true,
        maskBase64,
        customPrompt: promptOverride || customPrompt,
      });
      return {
        resultBase64: result.resultBase64,
        maskBase64,
        engine: result.engine,
      };
    }
    case "whiten": {
      const whitenSpecs: Record<string, string> = {
        "bright & airy": `TARGET: Bright, high-key real estate photography.
- Color temperature: 5500K neutral to slightly cool (5800K max).
- Exposure: lift +0.3 to +0.5 EV from current level. Aim for bright without blowout — highlights should clip at 250/255 max, not 255/255.
- Shadows: open to 20-30% — detail visible in every corner and under furniture. No crushed blacks.
- Whites: clean and bright without blue or yellow cast. White walls should read as true white, not warm cream or cool blue.
- Saturation: natural — do not boost. Wood tones and fabric colors should remain accurate to life.`,
        "warm editorial": `TARGET: Warm, editorial interior photography — Architectural Digest feel.
- Color temperature: 4200-4500K warm. Golden window light enhanced but not orange. Think "late afternoon sun through a west window."
- Exposure: +0.2 to +0.3 EV — slightly lifted but not high-key. Rich midtones are more important than bright highlights.
- Shadows: warm and soft, 15-25% density. Shadow areas should feel inviting, not dark.
- Whites: warm cream, not stark white. Warm but not yellow.
- Saturation: natural with very slight warmth boost in wood tones and fabrics. Do not oversaturate.`,
        neutral: `TARGET: Perfectly neutral white balance — WYSIWYG accuracy.
- Color temperature: 5000K daylight neutral. Zero color cast of any kind.
- Exposure: match metered value — 0 EV correction. If the photo is slightly dark, keep it slightly dark. If bright, keep bright.
- Whites: true neutral white. Use a white wall or ceiling as reference — it should appear as pure white with no warmth or coolness.
- Saturation: accurate to life. No enhancement, no reduction.
- This is a correction, not a look. The goal is "what your eyes saw when standing in the room."`,
      };
      const spec = whitenSpecs[preset] || whitenSpecs["neutral"];
      const prompt = `PHOTO EDITING TASK — WHITE BALANCE AND EXPOSURE CORRECTION ONLY.

${spec}

PRESERVE EXACTLY (pixel-identical):
- All furniture, objects, decor, and architecture — geometry unchanged.
- All surface textures: carpet pile, wood grain, tile grout, fabric weave, wall texture. Do NOT smooth or denoise any surface.
- Camera framing, perspective, lens distortion, depth of field.
- All objects in the scene — do not add, remove, or reposition anything.

DO NOT:
- Smooth, denoise, sharpen, or HDR-process any surface.
- Add or remove any object, shadow, reflection, or highlight.
- Change the color of any object — only ambient light temperature changes.
- Apply any tonal curve, LUT, or color grade beyond the specified target.
- Make the photo "better" in any way not specified. This is a surgical white balance correction, not a retouch.`;
      const result = await reveEdit(imageBase64, prompt, false, signal, {
        skipUpscale: true,
      });
      return { resultBase64: result.resultBase64 };
    }
    case "twilight": {
      const [colorStyle, timeOfDay] = preset.split("|") as [
        TwilightColorStyle,
        TwilightTime,
      ];
      const result = await fluxTwilight(
        imageBase64,
        colorStyle || "golden",
        timeOfDay || "sunset",
        signal,
        { skipUpscale: true },
      );
      return { resultBase64: result.resultBase64, engine: result.engine };
    }
    case "sky": {
      const mapped = presetMap.sky[preset] || "blue";
      const result = await nanoSky(imageBase64, mapped as SkyStyle, signal, {
        skipUpscale: true,
      });
      return { resultBase64: result.resultBase64 };
    }
    case "lawn": {
      const lawnSpecs: Record<string, string> = {
        manicured: `TARGET: Light grass enhancement on an already-healthy lawn. SUBTLE — not a complete re-render.
- Match the input lawn's existing color temperature, saturation, and overall green tone within ±5%. DO NOT make it brighter, more saturated, or more uniform than the input.
- Preserve all existing color variation in the grass — patches of slightly-different-green, sun-bleached areas, and shadow areas must all remain visible and varied.
- Fill in ONLY actual dead patches, brown spots, or bare dirt with matching green that BLENDS with neighboring grass at the same saturation.
- Keep visible texture and grain. Real grass photographs have noise. DO NOT smooth or blur the lawn surface.
- The result should look like the SAME photograph with patches filled in, not a different lawn or an enhanced look.`,
        natural: `TARGET: Healthy, lived-in lawn — lush and organic, not manicured.
- Grass color: multi-tonal green with natural variation. Some areas slightly longer, some slightly shorter. Clover or ground cover patches acceptable.
- Grass texture: mixed heights (1-3 inches), natural growth patterns, some seed heads in taller areas. Organic and realistic, not uniform.
- Edges: soft, natural borders. Grass creeping slightly over concrete or mulch edges is fine — this is a natural yard.
- Keep existing weeds that aren't distracting. Remove only obvious dead patches or bare dirt.`,
        "drought-resistant": `TARGET: Drought-tolerant xeriscaping — intentionally sparse, landscaped.
- Replace bare/dead lawn areas with: decorative gravel or decomposed granite, mulch beds with drought-resistant plants (succulents, agave, lavender, rosemary, ornamental grasses), and sparse drought-resistant ground cover.
- Keep existing trees, large shrubs, and hardscape exactly as-is.
- Natural, intentional spacing between plants. Not overgrown, not barren.
- Gravel/stone should have natural color variation and shadow detail.`,
      };
      const spec = lawnSpecs[preset] || lawnSpecs["natural"];
      const prompt = `LANDSCAPING ENHANCEMENT — EXTERIOR PHOTO EDIT.

${spec}

PHOTOGRAPHY DNA:
- The enhanced lawn/landscaping must have the SAME photographic noise, grain, and compression texture as the rest of the image. If the photo is grainy, the grass is grainy. If clean, the grass is clean.
- Shadows on grass must match the scene's sun position, angle, and softness.
- Color temperature of the lawn must match the rest of the scene exactly.

PRESERVE EXACTLY (pixel-identical):
- House: every architectural element, siding, windows, doors, roof, trim.
- Hardscape: driveway, walkways, retaining walls, fences, mailbox.
- Sky, clouds, lighting conditions — no changes.
- Existing mature trees and large shrubs — no additions or removals.
- Camera framing and perspective.

DO NOT:
- Add new trees, structures, or landscape features not specified.
- Change the season or time of day.
- Smooth or denoise any non-lawn area.
- Modify the house, driveway, or any built structure.
- BOOST saturation, lift exposure on the lawn, or flatten color variation.
- Replace the existing grass with brighter / more uniform / more saturated grass.
- Add a glossy or HDR look. The lawn should not appear "enhanced" — it should appear corrected.`;
      const result = await reveEdit(imageBase64, prompt, true, signal, {
        skipUpscale: true,
      });
      return { resultBase64: result.resultBase64 };
    }
    case "renovation": {
      // preset is a JSON-encoded {cabinets, countertops, flooring, walls}.
      let details: {
        cabinets?: string;
        countertops?: string;
        flooring?: string;
        walls?: string;
      } = {};
      try {
        details = JSON.parse(preset);
      } catch {
        /* empty payload */
      }
      const hasAny = !!(
        details.cabinets ||
        details.countertops ||
        details.flooring ||
        details.walls
      );
      if (!hasAny)
        throw new Error(
          "Specify at least one renovation change (cabinets, counters, flooring, or walls).",
        );
      const result = await fluxRenovation(imageBase64, details, signal, {
        skipUpscale: true,
      });
      return { resultBase64: result.resultBase64 };
    }
    case "magicedit": {
      const instruction = (customRemovalVal || "").trim();
      if (!instruction)
        throw new Error("Describe the change you want to make.");
      // Reuse the nano-banana-pro whole-frame path (same engine declutter runs
      // on) by passing a general edit instruction as the customPrompt — this
      // bypasses buildCleanupPrompt and lets the best model add/remove/clean
      // exactly what the user asked. Ships raw (native preservation), no
      // client composite, like the other nano tools.
      const prompt = promptOverride || buildMagicEditPrompt(roomLabel, instruction);
      const result = await fluxCleanup(imageBase64, roomLabel, signal, {
        customPrompt: prompt,
        skipUpscale: true,
      });
      return { resultBase64: result.resultBase64, engine: result.engine };
    }
    default:
      return { resultBase64: imageBase64 };
  }
};

const VellumPhotoEditor: React.FC<PhotoEditorProps> = ({
  setPage,
  credits,
  requestSpend,
  recordGeneration,
  activeProject,
  updateProject,
  onSessionExpired,
}) => {
  const { pendingUploadOpen, setPendingUploadOpen } = useVellumStore();
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [activity, setActivity] = useState<
    { who: string; what: string; cost: number; when: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const nextId = useRef(0);
  const restoredRef = useRef<string | null>(null);

  useEffect(() => {
    const projectId = activeProject?.id || null;
    const restoreKey = projectId || SCRATCH_KEY;
    if (restoredRef.current === restoreKey) return;
    restoredRef.current = restoreKey;

    setPhotos([]);
    setProcessedResults({});
    setProcessedSet(new Set());
    setPhotoHistory({});
    // B6-shell — reset selection/view so the header label and single-view
    // index don't point at a photo from the previously open project.
    setSelectedPhoto(0);
    setSinglePhoto(null);
    setView("compare");
    nextId.current = 0;

    (async () => {
      const [savedPhotos, savedResults] = await Promise.all([
        idbLoadPhotos(restoreKey),
        idbLoadResults(restoreKey),
      ]);
      if (!savedPhotos.length) return;
      const maxId = Math.max(...savedPhotos.map((p) => p.photoId));
      nextId.current = maxId + 1;
      const restored: UploadedPhoto[] = savedPhotos.map((p) => ({
        id: p.photoId,
        file: new File([], p.fileName),
        dataUrl: p.dataUrl,
        label: p.label,
        detecting: false,
      }));
      setPhotos(restored);
      if (Object.keys(savedResults).length) {
        setProcessedResults(savedResults);
        setProcessedSet(new Set(Object.keys(savedResults).map(Number)));
      }
    })().catch(() => {});
  }, [activeProject?.id]);

  useEffect(() => {
    if (activeProject?.id) {
      idbDeleteProject(SCRATCH_KEY).catch(() => {});
    }
  }, [activeProject?.id]);

  const processFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (!imageFiles.length) return;

    const newPhotos: UploadedPhoto[] = [];
    for (const file of imageFiles) {
      let dataUrl: string;
      try {
        dataUrl = await readFileAsDataUrl(file);
      } catch {
        console.warn(`[Vellum] Skipped unreadable file: ${file.name}`);
        continue;
      }
      const id = nextId.current++;
      // [ROOM-TYPE] Auto-detect runs AFTER upload via /api/classify-room
      // (server-side moondream2 — keyless in the browser, unlike the purged
      // client-Gemini classify that silently billed from the bundle). Until
      // detection lands, default to Living Room with detecting:true; the
      // "Tag room types" modal and inline dropdown remain the manual override.
      newPhotos.push({
        id,
        file,
        dataUrl,
        label: "Living Room",
        detecting: true,
      });
    }

    setPhotos((prev) => [...prev, ...newPhotos]);
    setActivity((a) => [
      {
        who: "You",
        what: `Uploaded ${newPhotos.length} photo${newPhotos.length > 1 ? "s" : ""}`,
        cost: 0,
        when: "just now",
      },
      ...a,
    ]);

    const storeKey = activeProject?.id || SCRATCH_KEY;
    for (const p of newPhotos) {
      idbSavePhoto(storeKey, p.id, p.dataUrl, p.label, p.file.name).catch(
        () => {},
      );
    }

    if (newPhotos.length > 0) setShowRoomPicker(true);

    // [ROOM-TYPE] Classify each upload (room type + empty/furnished) with
    // bounded concurrency so a 30-photo batch doesn't burst the API. Failures
    // fail OPEN: detecting:false, label stays Living Room, empty stays
    // undefined (gate never blocks on missing data) — the agent can still tag
    // manually exactly as before.
    const queue = [...newPhotos];
    const classifyWorker = async () => {
      for (;;) {
        const p = queue.shift();
        if (!p) return;
        try {
          const c = await classifyRoom(p.dataUrl);
          setPhotos((prev) =>
            prev.map((x) =>
              x.id === p.id
                ? // A malformed classify response must never nuke the label —
                  // an undefined label crashes the staging prompt builder.
                  {
                    ...x,
                    label: c.room || x.label,
                    empty: c.empty,
                    detecting: false,
                  }
                : x,
            ),
          );
          idbSavePhoto(storeKey, p.id, p.dataUrl, c.room, p.file.name).catch(
            () => {},
          );
        } catch (err: any) {
          console.warn(
            `[Vellum] Room detect failed for ${p.file.name}: ${err?.message}`,
          );
          setPhotos((prev) =>
            prev.map((x) => (x.id === p.id ? { ...x, detecting: false } : x)),
          );
        }
      }
    };
    void Promise.all(
      Array.from({ length: Math.min(4, newPhotos.length) }, classifyWorker),
    );
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
  };

  const [activeTool, setActiveToolRaw] = useState("staging");
  const [stylePreset, setStylePreset] = useState("contemporary");
  const [twilightTime, setTwilightTime] = useState<TwilightTime>("sunset");
  const [customRemoval, setCustomRemoval] = useState("");
  const [renovCabinets, setRenovCabinets] = useState("");
  const [renovCountertops, setRenovCountertops] = useState("");
  const [renovFlooring, setRenovFlooring] = useState("");
  const [renovWalls, setRenovWalls] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  const setActiveTool = (tool: string) => {
    setActiveToolRaw(tool);
    if (tool === "twilight") {
      setStylePreset("golden");
      setTwilightTime("sunset");
    } else {
      const firstPreset = (PRESETS[tool] || [])[0];
      if (firstPreset) setStylePreset(firstPreset.toLowerCase());
    }
    setCustomRemoval("");
  };
  const [view, setView] = useState<"compare" | "grid" | "single">("compare");
  const [singlePhoto, setSinglePhoto] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [samModal, setSamModal] = useState<{
    image: string;
    masks: string[];
    resolver: (indices: number[] | null) => void;
  } | null>(null);

  const [splitPos, setSplitPos] = useState(50);
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    draggingRef.current = true;
    onMoveRaw(e.nativeEvent);
    document.body.style.cursor = "ew-resize";
  };

  const onMoveRaw = useCallback((e: MouseEvent | TouchEvent) => {
    if (!draggingRef.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const clientX =
      "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const x = ((clientX - rect.left) / rect.width) * 100;
    setSplitPos(Math.max(2, Math.min(98, x)));
  }, []);

  const onUp = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = "";
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent | TouchEvent) => onMoveRaw(e);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", move);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", onUp);
    };
  }, [onMoveRaw, onUp]);

  // B4-shell — upload race fix. When an upload action navigated here, the store
  // flag (not a window event) tells us to open the native file picker on mount.
  // Clear it immediately so a later remount doesn't re-trigger the picker.
  useEffect(() => {
    if (pendingUploadOpen) {
      fileInputRef.current?.click();
      setPendingUploadOpen(false);
    }
  }, [pendingUploadOpen, setPendingUploadOpen]);

  // --- Per-photo generation state ---
  const [genMap, setGenMap] = useState<Record<number, PhotoGenState>>({});
  const [processedSet, setProcessedSet] = useState<Set<number>>(new Set());
  const [processedResults, setProcessedResults] = useState<
    Record<number, string>
  >({});
  const [justUpdated, setJustUpdated] = useState<Set<number>>(new Set());

  const [photoHistory, setPhotoHistory] = useState<
    Record<number, HistoryEntry[]>
  >({});
  const [qaSignals, setQaSignals] = useState<
    Record<number, CleanupQualitySignal>
  >({});

  const photoCount = photos.length;

  const photosRef = useRef(photos);
  photosRef.current = photos;
  const processedResultsRef = useRef(processedResults);
  processedResultsRef.current = processedResults;
  const genMapRef = useRef(genMap);
  genMapRef.current = genMap;

  const isPhotoGenerating = (id: number) => id in genMap;
  const anyGenerating = Object.keys(genMap).length > 0;
  const generatingCount = Object.keys(genMap).length;

  // Batch tracking (for the right panel progress bar)
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const batchMode = batchTotal > 0 && batchDone < batchTotal;

  const startProgressForPhoto = (
    photoId: number,
    tool: string,
  ): { timer: ReturnType<typeof setTimeout> } => {
    const steps = TOOL_STEPS[tool] || TOOL_STEPS.staging;
    let prog = 0;
    let step = 0;
    const tick = () => {
      prog += 1.5 + Math.random() * 2;
      const capped = Math.min(prog, 90);
      const expectedStep = Math.floor((capped / 100) * (steps.length - 1));
      if (expectedStep !== step) step = expectedStep;
      setGenMap((prev) => {
        if (!(photoId in prev)) return prev;
        return {
          ...prev,
          [photoId]: { ...prev[photoId], progress: capped, step },
        };
      });
      if (prog < 90) {
        timer = setTimeout(tick, 200 + Math.random() * 300);
        setGenMap((prev) => {
          if (!(photoId in prev)) return prev;
          return { ...prev, [photoId]: { ...prev[photoId], timerRef: timer } };
        });
      }
    };
    let timer = setTimeout(tick, 200);
    return { timer };
  };

  const processOnePhoto = async (
    photoId: number,
    tool: string,
    preset: string,
    customRemovalVal: string,
  ): Promise<boolean> => {
    let photo = photosRef.current.find((p) => p.id === photoId);
    if (!photo) return false;

    if (photo.detecting) {
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 200));
        photo = photosRef.current.find((p) => p.id === photoId);
        if (!photo) return false;
        if (!photo.detecting) break;
      }
    }

    const controller = new AbortController();
    const { timer } = startProgressForPhoto(photoId, tool);

    setGenMap((prev) => ({
      ...prev,
      [photoId]: {
        tool,
        preset,
        step: 0,
        progress: 0,
        abort: controller,
        timerRef: timer,
      },
    }));

    try {
      // Every tool stacks: it edits your CURRENT result (or the original
      // upload if this is the first edit), so edits compound in sequence and
      // Undo steps back one layer. (Cleanup used to reset to the original,
      // which silently dropped prior edits — the one confusing exception.)
      const inputImage =
        processedResultsRef.current[photo.id] || photo.dataUrl;
      const apiResult = await callApiDirect(
        inputImage,
        photo.label,
        tool,
        preset,
        customRemovalVal,
        controller.signal,
        (image, masks) =>
          new Promise<number[] | null>((resolve) => {
            setSamModal({ image, masks, resolver: resolve });
          }),
        photo.empty === false,
      );
      let resultDataUrl = apiResult.resultBase64;

      // C3 — per-tool composite drift-fix. callApiDirect returns RAW model
      // output for renovation/whiten/sky/twilight/lawn (Flux/Reve globally
      // re-render the frame, drifting untouched textures), so we sharpen +
      // composite before display. Shared with the Model Lab so it evaluates the
      // exact image agents receive. Nano tools (staging/declutter/magicedit)
      // ship raw — staging is furniture-locked server-side, declutter is
      // mask-scoped — so postProcessToolOutput passes them through untouched.
      resultDataUrl = await postProcessToolOutput(tool, inputImage, resultDataUrl);

      if (tool === "declutter") {
        try {
          const drift = await checkCleanupDrift(
            inputImage,
            resultDataUrl,
            apiResult.maskBase64,
          );
          const qaSignal = buildCleanupSignal({
            risk: drift.risk,
            source: "single",
            reason:
              drift.risk === "safe"
                ? `Structural drift ${drift.diffPercent.toFixed(1)}% — within tolerance`
                : `Structural drift ${drift.diffPercent.toFixed(1)}% outside masked area`,
            alignmentOverlap: 100 - drift.diffPercent,
            compositeMode: "applied",
            nextActions:
              drift.risk === "high"
                ? ["Review result manually", "Try a different preset"]
                : drift.risk === "review"
                  ? ["Inspect unchanged areas for artifacts"]
                  : [],
          });
          setQaSignals((prev) => ({ ...prev, [photo!.id]: qaSignal }));
        } catch {
          /* QA is non-blocking */
        }
      }

      setGenMap((prev) => {
        const entry = prev[photoId];
        if (entry?.timerRef) clearTimeout(entry.timerRef);
        const next = { ...prev };
        delete next[photoId];
        return next;
      });

      setProcessedResults((prev) => ({ ...prev, [photo!.id]: resultDataUrl }));
      setProcessedSet((prev) => new Set([...prev, photo!.id]));
      idbSaveResult(
        activeProject?.id || SCRATCH_KEY,
        photo.id,
        resultDataUrl,
      ).catch(() => {});

      // Billing — charge ONCE per successful photo (requestSpend is now a gate
      // only; it no longer deducts). Partial batch failures never overcharge.
      // Telemetry: tool always; model = staging engine when present, so the
      // usage dashboard can show the fill vs seedream rate.
      recordGeneration(toolCostFor(tool, photo), {
        tool,
        ...(apiResult.engine ? { model: apiResult.engine } : {}),
      });

      // Flash "Updated" indicator
      setJustUpdated((prev) => new Set([...prev, photo!.id]));
      setTimeout(
        () =>
          setJustUpdated((prev) => {
            const n = new Set(prev);
            n.delete(photo!.id);
            return n;
          }),
        1500,
      );

      setPhotoHistory((prev) => ({
        ...prev,
        [photo!.id]: [
          ...(prev[photo!.id] || []),
          { tool, preset, image: resultDataUrl },
        ],
      }));

      const toolInfo = TOOLS.find((t) => "id" in t && t.id === tool);
      setActivity((a) => [
        {
          who: "Vellum",
          what: `${(toolInfo as any)?.name} applied to ${photo!.label} · ${preset}`,
          cost: toolCostFor(tool, photo),
          when: "just now",
        },
        ...a,
      ]);

      return true;
    } catch (err: any) {
      setGenMap((prev) => {
        const entry = prev[photoId];
        if (entry?.timerRef) clearTimeout(entry.timerRef);
        const next = { ...prev };
        delete next[photoId];
        return next;
      });

      // No charge on failure/cancel — recordGeneration only fires on success,
      // so there is nothing to refund.
      if (err.name === "AbortError") {
        setActivity((a) => [
          {
            who: "Vellum",
            what: `Cancelled ${photo.label}`,
            cost: 0,
            when: "just now",
          },
          ...a,
        ]);
        return false;
      }
      console.error("[Vellum] Generation failed:", err);
      const msg = String(err?.message || "");

      // Server-side auth/quota states that E1 (session auth) introduced. Without
      // these branches a 401/402 lands in the generic "Couldn't apply" banner,
      // which reads as a broken tool instead of "sign in again" / "you're out
      // of edits" — the exact regression the design review flagged.
      if (/HTTP 401\b/.test(msg)) {
        setExportError(
          "Your session expired — please sign in again to keep editing.",
        );
        setTimeout(() => setExportError(""), 8000);
        onSessionExpired?.();
        return false;
      }
      if (/HTTP 402\b/.test(msg)) {
        setExportError(
          "You're out of free edits. Upgrade to keep refining this listing.",
        );
        setTimeout(() => setExportError(""), 8000);
        setPage("billing");
        setActivity((a) => [
          {
            who: "Vellum",
            what: `Quota reached on ${photo.label}`,
            cost: 0,
            when: "just now",
          },
          ...a,
        ]);
        return false;
      }

      // Surface the failure — previously this was swallowed to console + a
      // faint activity line, so a failed generation looked identical to
      // "nothing happened" (e.g. the 2026-06-08 reve/edit IP block). Show a
      // visible banner with a short reason so provider breakage is obvious.
      const detail = msg.replace(/\s+/g, " ").slice(0, 90);
      setExportError(
        `Couldn't apply to ${photo.label}${detail ? ` — ${detail}` : " — please try again"}`,
      );
      setTimeout(() => setExportError(""), 7000);
      setActivity((a) => [
        {
          who: "Vellum",
          what: `Failed on ${photo.label}`,
          cost: 0,
          when: "just now",
        },
        ...a,
      ]);
      return false;
    }
  };

  const handleApply = () => {
    if (!photos.length) return;
    const photoIdx =
      view === "single" ? (singlePhoto ?? selectedPhoto) : selectedPhoto;
    const photo = photos[photoIdx];
    if (!photo || isPhotoGenerating(photo.id)) return;

    const frozenTool = activeTool;
    const frozenPreset =
      activeTool === "twilight"
        ? `${stylePreset}|${twilightTime}`
        : activeTool === "renovation"
          ? JSON.stringify({
              cabinets: renovCabinets.trim() || undefined,
              countertops: renovCountertops.trim() || undefined,
              flooring: renovFlooring.trim() || undefined,
              walls: renovWalls.trim() || undefined,
            })
          : stylePreset;
    const frozenCustom = customRemoval;

    requestNotifyPermission();
    const toolName =
      (TOOLS.find((t) => "id" in t && t.id === frozenTool) as any)?.name ||
      "Photo";
    requestSpend(toolCostFor(activeTool, photo), async () => {
      const ok = await processOnePhoto(
        photo.id,
        frozenTool,
        frozenPreset,
        frozenCustom,
      );
      if (ok)
        notifyDone(
          `${toolName} — ready`,
          `${activeProject?.address || "Your photo"} is refined. Switch back to Vellum to view.`,
        );
    });
  };

  const handleApplyAll = () => {
    if (!photos.length) return;
    const targets = photos.filter((p) => !isPhotoGenerating(p.id));
    if (!targets.length) return;

    // Precision Select needs per-photo object picking — can't batch a modal.
    // Without this guard, 3 parallel photos all setSamModal() and overwrite
    // each other's resolver, leaving 2 of them stuck waiting forever.
    if (activeTool === "declutter" && stylePreset === "precision select") {
      alert(
        "Precision Select picks objects per photo. Apply one at a time, or pick another preset for batch.",
      );
      return;
    }

    const totalCost = targets.reduce(
      (sum, p) => sum + toolCostFor(activeTool, p),
      0,
    );

    const frozenTool = activeTool;
    const frozenPreset =
      activeTool === "twilight"
        ? `${stylePreset}|${twilightTime}`
        : activeTool === "renovation"
          ? JSON.stringify({
              cabinets: renovCabinets.trim() || undefined,
              countertops: renovCountertops.trim() || undefined,
              flooring: renovFlooring.trim() || undefined,
              walls: renovWalls.trim() || undefined,
            })
          : stylePreset;
    const frozenCustom = customRemoval;

    requestNotifyPermission();
    requestSpend(totalCost, async () => {
      setBatchTotal(targets.length);
      setBatchDone(0);

      let okCount = 0;
      const queue = [...targets];
      const runBatch = async () => {
        const chunk = queue.splice(0, BATCH_CONCURRENCY);
        if (!chunk.length) return;

        await Promise.all(
          chunk.map(async (p) => {
            const ok = await processOnePhoto(
              p.id,
              frozenTool,
              frozenPreset,
              frozenCustom,
            );
            if (ok) okCount += 1;
            setBatchDone((d) => d + 1);
          }),
        );

        if (queue.length > 0) await runBatch();
      };

      await runBatch();
      setBatchTotal(0);
      setBatchDone(0);
      notifyDone(
        "Photos ready",
        `${okCount} of ${targets.length} photos refined. Switch back to Vellum to view.`,
      );
      setActivity((a) => [
        {
          who: "Vellum",
          what: `Batch complete — ${targets.length} photos processed`,
          cost: 0,
          when: "just now",
        },
        ...a,
      ]);
    });
  };

  const handleSelectPhoto = (idx: number) => {
    setSelectedPhoto(idx);
  };

  const handleUndo = () => {
    const photo = currentPhotoRef.current;
    if (!photo) return;
    const stack = photoHistory[photo.id];
    if (!stack || stack.length === 0) return;

    const newStack = stack.slice(0, -1);
    if (newStack.length === 0) {
      setPhotoHistory((prev) => {
        const n = { ...prev };
        delete n[photo.id];
        return n;
      });
      setProcessedResults((prev) => {
        const n = { ...prev };
        delete n[photo.id];
        return n;
      });
      setProcessedSet((prev) => {
        const n = new Set(prev);
        n.delete(photo.id);
        return n;
      });
    } else {
      setPhotoHistory((prev) => ({ ...prev, [photo.id]: newStack }));
      setProcessedResults((prev) => ({
        ...prev,
        [photo.id]: newStack[newStack.length - 1].image,
      }));
    }
    setActivity((a) => [
      {
        who: "Vellum",
        what: `Undo on ${photo.label}`,
        cost: 0,
        when: "just now",
      },
      ...a,
    ]);
  };

  const handleReset = () => {
    const photo = currentPhotoRef.current;
    if (!photo) return;
    setPhotoHistory((prev) => {
      const n = { ...prev };
      delete n[photo.id];
      return n;
    });
    setProcessedResults((prev) => {
      const n = { ...prev };
      delete n[photo.id];
      return n;
    });
    setProcessedSet((prev) => {
      const n = new Set(prev);
      n.delete(photo.id);
      return n;
    });
    setActivity((a) => [
      {
        who: "Vellum",
        what: `Reset ${photo.label} to original`,
        cost: 0,
        when: "just now",
      },
      ...a,
    ]);
  };

  useEffect(
    () => () => {
      (Object.values(genMapRef.current) as PhotoGenState[]).forEach((gs) => {
        if (gs.timerRef) clearTimeout(gs.timerRef);
        gs.abort.abort();
      });
    },
    [],
  );

  const getAfterImage = (photo: UploadedPhoto) =>
    processedResults[photo.id] || null;
  const isRefined = (photo: UploadedPhoto) => processedSet.has(photo.id);
  const refinedCount = photos.filter((p) => processedSet.has(p.id)).length;

  // B1-shell — persist project metadata so the dashboard reflects real counts,
  // a thumbnail, and status instead of always showing "0 photos / Draft".
  // Scoped to real projects only — SCRATCH_KEY/quick-edit sessions have no id.
  useEffect(() => {
    if (!activeProject?.id || !updateProject) return;
    const projectId = activeProject.id;
    const firstRefined = photos.find((p) => processedResults[p.id]);
    const source =
      (firstRefined && processedResults[firstRefined.id]) ||
      photos[0]?.dataUrl ||
      null;
    const status: "draft" | "processing" | "ready" = refinedCount
      ? refinedCount < photoCount
        ? "processing"
        : "ready"
      : "draft";
    let cancelled = false;
    (async () => {
      // Store a SMALL (256px) thumbnail — NEVER a full-res dataURL. A full
      // image is multiple MB and would blow the ~5MB localStorage quota in
      // useVellumStore, throwing QuotaExceededError and blanking the app.
      const thumbnail = source ? await generateThumbnail(source, 256) : null;
      if (cancelled) return;
      updateProject(projectId, { photoCount, refinedCount, thumbnail, status });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoCount, refinedCount, activeProject?.id]);

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // [MOBILE contract] Under 900px both side panels are display:none. This state
  // drives the .v-mobile-tabbar buttons that toggle .is-mobile-open on the
  // matching panel so the editor is actually usable at 375px.
  const [mobilePanel, setMobilePanel] = useState<"left" | "right" | null>(null);

  // Deliverables — which output generator overlay is mounted (if any).
  type OverlayKind =
    "reveal" | "mls" | "social" | "description" | "print" | "listingkit";
  const [activeOverlay, setActiveOverlay] = useState<OverlayKind | null>(null);

  // Brand kit feeds the reveal-video brand bar + (internally) the surfaced
  // generators that call useBrandKit() themselves.
  const { brandKit } = useBrandKit();

  const [exporting, setExporting] = useState(false);
  const [exportLabel, setExportLabel] = useState("");
  const [exportError, setExportError] = useState("");
  const [exportConfirm, setExportConfirm] = useState<null | "single" | "batch">(
    null,
  );
  const [exportProgress, setExportProgress] = useState<{
    done: number;
    total: number;
    startedAt: number;
    items: {
      id: number;
      label: string;
      status: "queued" | "upscaling" | "done" | "failed";
    }[];
  } | null>(null);

  const currentPhotoIdx =
    view === "single" ? (singlePhoto ?? selectedPhoto) : selectedPhoto;
  const currentPhoto = photos[currentPhotoIdx] || photos[0] || null;
  const currentPhotoRef = useRef(currentPhoto);
  currentPhotoRef.current = currentPhoto;

  // ── Generator data ([GEN-PROPS]) ───────────────────────────────────────────
  // Build the images array the surfaced generators consume: prefer each photo's
  // loaded refined result, fall back to its original. We pass BOTH the
  // [GEN-PROPS] shape (id/dataUrl/label/isRefined) and the legacy field names
  // the current components destructure (source) so a generator compiles whether
  // it has been migrated to the contract yet or not. Extra props are ignored by
  // components that don't read them.
  const overlayImages = photos.map((p) => {
    const refined = processedResults[p.id];
    const dataUrl = refined || p.dataUrl;
    return {
      id: String(p.id),
      dataUrl,
      source: dataUrl, // legacy field name (MLSExport / SocialPack)
      label: p.label,
      roomType: p.label,
      isRefined: !!refined,
    };
  });

  const overlayProjectName = activeProject?.address || "Quick edit";

  const overlayListingMeta = activeProject
    ? {
        address: activeProject.address,
        beds: activeProject.beds ?? undefined,
        baths: activeProject.baths ?? undefined,
      }
    : undefined;

  const openOverlay = (kind: OverlayKind) => {
    setActiveOverlay(kind);
  };
  const closeOverlay = useCallback(() => setActiveOverlay(null), []);

  // Reveal video (ExportModal) operates on the SELECTED photo's before/after.
  const revealAfter = currentPhoto
    ? processedResults[currentPhoto.id] || null
    : null;
  const revealBefore = currentPhoto ? currentPhoto.dataUrl : null;

  const upscaleForExport = async (
    base64: string,
    label: string,
  ): Promise<string> => {
    try {
      const result = await upscaleImage(base64, isExteriorRoom(label));
      return result.resultBase64;
    } catch (err: any) {
      console.warn(
        `[Vellum] Upscale failed for ${label}, exporting preview quality:`,
        err?.message,
      );
      // Make it loud: a silently-downsized export used to look identical to a
      // full-res one. Tell the user this file came out at preview resolution
      // so they can re-export rather than unknowingly send a soft image.
      setExportError(
        `${label}: upscale unavailable — exported at preview resolution. Re-export for full size.`,
      );
      setTimeout(() => setExportError(""), 8000);
      return base64;
    }
  };

  const doDownloadAll = async () => {
    const refined = photos.filter((p) => processedResults[p.id]);
    if (!refined.length) return;
    setExporting(true);
    const items = refined.map((p) => ({
      id: p.id,
      label: p.label,
      status: "queued" as const,
    }));
    setExportProgress({
      done: 0,
      total: refined.length,
      startedAt: Date.now(),
      items,
    });
    try {
      if (refined.length === 1) {
        setExportProgress(
          (prev) =>
            prev && {
              ...prev,
              items: prev.items.map((it) =>
                it.id === refined[0].id ? { ...it, status: "upscaling" } : it,
              ),
            },
        );
        setExportLabel(`Upscaling ${refined[0].label}…`);
        const upscaled = await upscaleForExport(
          processedResults[refined[0].id],
          refined[0].label,
        );
        const blob = dataUrlToBlob(upscaled);
        setExportProgress(
          (prev) =>
            prev && {
              ...prev,
              done: 1,
              items: prev.items.map((it) =>
                it.id === refined[0].id ? { ...it, status: "done" } : it,
              ),
            },
        );
        triggerDownload(
          blob,
          `${refined[0].label.replace(/\s+/g, "_")}_refined.jpg`,
        );
      } else {
        const zip = new JSZip();
        for (let i = 0; i < refined.length; i++) {
          const p = refined[i];
          setExportProgress(
            (prev) =>
              prev && {
                ...prev,
                items: prev.items.map((it) =>
                  it.id === p.id ? { ...it, status: "upscaling" } : it,
                ),
              },
          );
          setExportLabel(`Upscaling ${i + 1} of ${refined.length}… ${p.label}`);
          const upscaled = await upscaleForExport(
            processedResults[p.id],
            p.label,
          );
          const blob = dataUrlToBlob(upscaled);
          const name = `${String(i + 1).padStart(3, "0")}_${p.label.replace(/\s+/g, "_")}_refined.jpg`;
          zip.file(name, blob);
          setExportProgress(
            (prev) =>
              prev && {
                ...prev,
                done: i + 1,
                items: prev.items.map((it) =>
                  it.id === p.id ? { ...it, status: "done" } : it,
                ),
              },
          );
        }
        setExportLabel("Packaging zip…");
        const zipBlob = await zip.generateAsync({ type: "blob" });
        triggerDownload(zipBlob, "vellum_export.zip");
      }
      setActivity((a) => [
        {
          who: "Vellum",
          what: `Downloaded ${refined.length} refined photo${refined.length > 1 ? "s" : ""} (upscaled)`,
          cost: 0,
          when: "just now",
        },
        ...a,
      ]);
    } catch (err: any) {
      console.error("[Vellum] Export failed:", err);
      setExportError("Export failed — please try again");
      setActivity((a) => [
        {
          who: "Vellum",
          what: `Export failed — ${err.message || "unknown error"}`,
          cost: 0,
          when: "just now",
        },
        ...a,
      ]);
      setTimeout(() => setExportError(""), 5000);
    }
    setExporting(false);
    setExportLabel("");
    setExportProgress(null);
  };

  const doDownloadSingle = async (idx: number) => {
    const photo = photos[idx];
    if (!photo) return;
    const src = processedResults[photo.id];
    if (!src) return;
    setExporting(true);
    setExportLabel(`Upscaling ${photo.label}…`);
    setExportProgress({
      done: 0,
      total: 1,
      startedAt: Date.now(),
      items: [{ id: photo.id, label: photo.label, status: "upscaling" }],
    });
    try {
      const upscaled = await upscaleForExport(src, photo.label);
      const blob = dataUrlToBlob(upscaled);
      setExportProgress(
        (prev) =>
          prev && {
            ...prev,
            done: 1,
            items: [{ id: photo.id, label: photo.label, status: "done" }],
          },
      );
      triggerDownload(blob, `${photo.label.replace(/\s+/g, "_")}_refined.jpg`);
    } catch (err: any) {
      console.error("[Vellum] Single export failed:", err);
      setExportError("Export failed — please try again");
      setActivity((a) => [
        {
          who: "Vellum",
          what: `Export failed — ${err.message || "unknown error"}`,
          cost: 0,
          when: "just now",
        },
        ...a,
      ]);
      setTimeout(() => setExportError(""), 5000);
    }
    setExporting(false);
    setExportLabel("");
    setExportProgress(null);
  };

  const doExportOriginalSingle = async (idx: number) => {
    const photo = photos[idx];
    if (!photo) return;
    setExportConfirm(null);
    setExporting(true);
    setExportLabel(`Upscaling ${photo.label}…`);
    setExportProgress({
      done: 0,
      total: 1,
      startedAt: Date.now(),
      items: [{ id: photo.id, label: photo.label, status: "upscaling" }],
    });
    try {
      const upscaled = await upscaleForExport(photo.dataUrl, photo.label);
      const blob = dataUrlToBlob(upscaled);
      setExportProgress(
        (prev) =>
          prev && {
            ...prev,
            done: 1,
            items: [{ id: photo.id, label: photo.label, status: "done" }],
          },
      );
      triggerDownload(blob, `${photo.label.replace(/\s+/g, "_")}_upscaled.jpg`);
      setActivity((a) => [
        {
          who: "Vellum",
          what: `Exported original (upscaled) · ${photo.label}`,
          cost: 0,
          when: "just now",
        },
        ...a,
      ]);
    } catch (err: any) {
      console.error("[Vellum] Original export failed:", err);
      setExportError("Export failed — please try again");
      setTimeout(() => setExportError(""), 5000);
    }
    setExporting(false);
    setExportLabel("");
    setExportProgress(null);
  };

  const doExportOriginalBatch = async () => {
    const unedited = photos.filter((p) => !processedResults[p.id]);
    if (!unedited.length) return;
    setExportConfirm(null);
    setExporting(true);
    const items = unedited.map((p) => ({
      id: p.id,
      label: p.label,
      status: "queued" as const,
    }));
    setExportProgress({
      done: 0,
      total: unedited.length,
      startedAt: Date.now(),
      items,
    });
    try {
      if (unedited.length === 1) {
        setExportProgress(
          (prev) =>
            prev && {
              ...prev,
              items: prev.items.map((it) =>
                it.id === unedited[0].id ? { ...it, status: "upscaling" } : it,
              ),
            },
        );
        setExportLabel(`Upscaling ${unedited[0].label}…`);
        const upscaled = await upscaleForExport(
          unedited[0].dataUrl,
          unedited[0].label,
        );
        const blob = dataUrlToBlob(upscaled);
        setExportProgress(
          (prev) =>
            prev && {
              ...prev,
              done: 1,
              items: prev.items.map((it) =>
                it.id === unedited[0].id ? { ...it, status: "done" } : it,
              ),
            },
        );
        triggerDownload(
          blob,
          `${unedited[0].label.replace(/\s+/g, "_")}_upscaled.jpg`,
        );
      } else {
        const zip = new JSZip();
        for (let i = 0; i < unedited.length; i++) {
          const p = unedited[i];
          setExportProgress(
            (prev) =>
              prev && {
                ...prev,
                items: prev.items.map((it) =>
                  it.id === p.id ? { ...it, status: "upscaling" } : it,
                ),
              },
          );
          setExportLabel(
            `Upscaling ${i + 1} of ${unedited.length}… ${p.label}`,
          );
          const upscaled = await upscaleForExport(p.dataUrl, p.label);
          const blob = dataUrlToBlob(upscaled);
          zip.file(
            `${String(i + 1).padStart(3, "0")}_${p.label.replace(/\s+/g, "_")}_upscaled.jpg`,
            blob,
          );
          setExportProgress(
            (prev) =>
              prev && {
                ...prev,
                done: i + 1,
                items: prev.items.map((it) =>
                  it.id === p.id ? { ...it, status: "done" } : it,
                ),
              },
          );
        }
        setExportLabel("Packaging zip…");
        const zipBlob = await zip.generateAsync({ type: "blob" });
        triggerDownload(zipBlob, "vellum_originals_upscaled.zip");
      }
      setActivity((a) => [
        {
          who: "Vellum",
          what: `Exported ${unedited.length} original${unedited.length > 1 ? "s" : ""} (upscaled)`,
          cost: 0,
          when: "just now",
        },
        ...a,
      ]);
    } catch (err: any) {
      console.error("[Vellum] Batch original export failed:", err);
      setExportError("Export failed — please try again");
      setTimeout(() => setExportError(""), 5000);
    }
    setExporting(false);
    setExportLabel("");
    setExportProgress(null);
  };

  // ---- Upload zone (shown when no photos loaded) ----
  if (!photos.length) {
    return (
      <div
        className="v-editor"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          className={"v-upload-zone" + (dragOver ? " drag-over" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files) processFiles(e.target.files);
            }}
          />
          <div className="v-upload-icon">
            <Icon name="upload" size={32} color="var(--pale-gold)" />
          </div>
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 28,
              fontWeight: 500,
              margin: "16px 0 8px",
            }}
          >
            {activeProject
              ? `Upload photos for ${activeProject.address}`
              : "Drop listing photos here"}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--graphite)",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            or click to browse · JPG, PNG, WebP, HEIC · up to 50 photos per
            batch
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button
              className="v-btn v-btn--primary v-btn--sm"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              <Icon name="upload" size={13} /> Browse files
            </button>
          </div>
        </div>
      </div>
    );
  }

  const afterImage = currentPhoto ? getAfterImage(currentPhoto) : null;
  const toolName =
    (TOOLS.find((t) => "id" in t && t.id === activeTool) as any)?.name ||
    "Processing";
  const currentIsGenerating = currentPhoto
    ? isPhotoGenerating(currentPhoto.id)
    : false;
  const currentGenState = currentPhoto ? genMap[currentPhoto.id] : undefined;
  const currentJustUpdated = currentPhoto
    ? justUpdated.has(currentPhoto.id)
    : false;

  const renderBeforeAfter = (
    containerRef: React.RefObject<HTMLDivElement | null>,
    photo: UploadedPhoto,
  ) => {
    const after = getAfterImage(photo);
    const refined = isRefined(photo);
    const photoGen = genMap[photo.id];
    const photoUpdated = justUpdated.has(photo.id);

    return (
      <div
        className="v-ba-stage"
        ref={containerRef}
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
      >
        {/* Refining indicator — top bar */}
        {photoGen && (
          <div className="v-refining-bar">
            <div
              className="v-refining-bar-fill"
              style={{ width: `${photoGen.progress}%` }}
            />
          </div>
        )}

        {/* Updated flash */}
        {photoUpdated && (
          <div className="v-updated-flash">
            <span>Updated</span>
          </div>
        )}

        {/* BEFORE — full stage background */}
        <img
          src={photo.dataUrl}
          className="v-ba-img-el"
          alt=""
          draggable={false}
        />

        {/* AFTER — full size, clipped from the right via clip-path */}
        <div
          className="v-ba-clip"
          style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
        >
          {refined && after ? (
            <img src={after} className="v-ba-img-el" alt="" draggable={false} />
          ) : (
            <img
              src={photo.dataUrl}
              className="v-ba-img-el v-ba-img-dimmed"
              alt=""
              draggable={false}
            />
          )}
        </div>
        {!(refined && after) && !photoGen && (
          <div className="v-ba-pending">
            <span>Apply to see result</span>
          </div>
        )}

        <div className="v-ba-tag b">
          {refined ? `After · ${photo.label}` : "Pending"}
        </div>
        <div className="v-ba-tag a">Before</div>

        <div className="v-ba-handle" style={{ left: `${splitPos}%` }}>
          <div className="v-ba-knob">‹›</div>
        </div>

        {/* Refining pill overlay — non-blocking, top-right */}
        {photoGen && (
          <div className="v-refining-pill">
            <span className="v-refining-dot" />
            <span>
              {(TOOL_STEPS[photoGen.tool] || TOOL_STEPS.staging)[photoGen.step]}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderThumbStatus = (photo: UploadedPhoto) => {
    if (isPhotoGenerating(photo.id)) {
      return <span className="v-t-spinner" />;
    }
    if (justUpdated.has(photo.id)) {
      return <span className="v-t-updated" />;
    }
    const qa = qaSignals[photo.id];
    if (qa && qa.risk !== "safe" && isRefined(photo)) {
      return (
        <span
          className={qa.risk === "high" ? "v-t-qa-high" : "v-t-qa-review"}
          title={qa.reason}
        />
      );
    }
    if (isRefined(photo)) {
      return <span className="v-t-dot" />;
    }
    return null;
  };

  const renderCompare = () => (
    <>
      {renderBeforeAfter(stageRef, currentPhoto)}

      <div className="v-thumb-strip">
        {photos.map((p, i) => (
          <div
            key={p.id}
            className={
              "v-t" +
              (selectedPhoto === i ? " selected" : "") +
              (isRefined(p) ? " refined" : "") +
              (isPhotoGenerating(p.id) ? " generating" : "")
            }
            style={{
              backgroundImage: `url(${isRefined(p) && getAfterImage(p) ? getAfterImage(p) : p.dataUrl})`,
            }}
            onClick={() => handleSelectPhoto(i)}
            title={p.label}
          >
            <span className="v-num">{String(i + 1).padStart(2, "0")}</span>
            {renderThumbStatus(p)}
          </div>
        ))}
        <div
          className="v-t v-t-add"
          onClick={() => fileInputRef.current?.click()}
          title="Add more photos"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--soft-stone)",
            cursor: "pointer",
          }}
        >
          <Icon name="plus" size={16} color="var(--graphite)" />
        </div>
      </div>
    </>
  );

  const renderGrid = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
      }}
    >
      {photos.map((p, i) => {
        const after = getAfterImage(p);
        const photoGen = isPhotoGenerating(p.id);
        return (
          <div
            key={p.id}
            onClick={() => {
              setSinglePhoto(i);
              setView("single");
            }}
            style={{
              position: "relative",
              aspectRatio: "4/3",
              borderRadius: 8,
              backgroundImage: `url(${after || p.dataUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              cursor: "pointer",
              overflow: "hidden",
              transition: "transform 180ms ease, box-shadow 180ms ease",
            }}
          >
            {photoGen && (
              <div
                className="v-refining-bar"
                style={{ position: "absolute", top: 0, left: 0, right: 0 }}
              >
                <div
                  className="v-refining-bar-fill"
                  style={{ width: `${genMap[p.id]?.progress || 0}%` }}
                />
              </div>
            )}
            <span
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                fontSize: 10,
                fontWeight: 600,
                background: "rgba(247,246,242,0.95)",
                padding: "3px 8px",
                borderRadius: 3,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              style={{
                position: "absolute",
                bottom: 8,
                left: 8,
                fontSize: 10,
                fontWeight: 500,
                background: photoGen
                  ? "rgba(216,199,154,0.9)"
                  : isRefined(p)
                    ? "rgba(76,175,80,0.9)"
                    : "rgba(27,29,31,0.5)",
                color: photoGen ? "var(--deep-charcoal)" : "var(--warm-ivory)",
                padding: "3px 8px",
                borderRadius: 3,
              }}
            >
              {photoGen
                ? "Refining…"
                : isRefined(p)
                  ? "Refined"
                  : p.detecting
                    ? "Detecting…"
                    : p.label}
            </span>
          </div>
        );
      })}
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          aspectRatio: "4/3",
          borderRadius: 8,
          border: "2px dashed var(--soft-stone)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          gap: 8,
          color: "var(--graphite)",
          fontSize: 12,
        }}
      >
        <Icon name="plus" size={20} color="var(--graphite)" />
        Add photos
      </div>
    </div>
  );

  const renderSingle = () => {
    const spIdx = singlePhoto ?? selectedPhoto;
    const sp = photos[spIdx] || photos[0];
    if (!sp) return null;
    const after = getAfterImage(sp);
    const showImage = after || sp.dataUrl;
    const photoGen = genMap[sp.id];
    const photoUpdated = justUpdated.has(sp.id);
    const history = photoHistory[sp.id] || [];

    return (
      <div className="v-single-photo-view">
        <div className="v-single-nav">
          {photos.map((p, i) => {
            const pAfter = getAfterImage(p);
            return (
              <button
                key={p.id}
                className={
                  "v-single-thumb" +
                  (spIdx === i ? " active" : "") +
                  (isRefined(p) ? " refined" : "") +
                  (isPhotoGenerating(p.id) ? " generating" : "")
                }
                onClick={() => {
                  setSinglePhoto(i);
                  setSelectedPhoto(i);
                }}
                style={{ backgroundImage: `url(${pAfter || p.dataUrl})` }}
              >
                <span className="v-single-num">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {renderThumbStatus(p)}
              </button>
            );
          })}
        </div>
        <div className="v-ba-stage" style={{ position: "relative" }}>
          {photoGen && (
            <div className="v-refining-bar">
              <div
                className="v-refining-bar-fill"
                style={{ width: `${photoGen.progress}%` }}
              />
            </div>
          )}
          {photoUpdated && (
            <div className="v-updated-flash">
              <span>Updated</span>
            </div>
          )}
          <img
            src={showImage}
            className="v-ba-img-el"
            alt=""
            draggable={false}
          />

          {photoGen && (
            <div className="v-refining-pill">
              <span className="v-refining-dot" />
              <span>
                {
                  (TOOL_STEPS[photoGen.tool] || TOOL_STEPS.staging)[
                    photoGen.step
                  ]
                }
              </span>
            </div>
          )}
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            display: "flex",
            gap: 8,
            alignItems: "center",
            zIndex: 5,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: "4px 10px",
              borderRadius: 4,
              background: isRefined(sp)
                ? "rgba(76,175,80,0.9)"
                : "rgba(27,29,31,0.6)",
              color: "var(--warm-ivory)",
            }}
          >
            {isRefined(sp)
              ? history.length > 1
                ? `${history.length} edits`
                : "Refined"
              : "Original"}
          </span>
          {isRefined(sp) && (
            <>
              <button
                onClick={handleUndo}
                className="v-btn v-btn--ghost v-btn--sm"
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  background: "rgba(27,29,31,0.7)",
                  color: "var(--warm-ivory)",
                  borderColor: "transparent",
                }}
              >
                Undo
              </button>
              <button
                onClick={handleReset}
                className="v-btn v-btn--ghost v-btn--sm"
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  background: "rgba(27,29,31,0.7)",
                  color: "var(--warm-ivory)",
                  borderColor: "transparent",
                }}
              >
                Reset
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const unrefinedCount = photoCount - refinedCount;
  const applyAllTargets = photos.filter((p) => !isPhotoGenerating(p.id));
  const applyAllCount = applyAllTargets.length;
  const applyAllCost = applyAllTargets.reduce(
    (sum, p) => sum + toolCostFor(activeTool, p),
    0,
  );

  return (
    <div
      className={
        "v-editor" +
        (leftCollapsed ? " left-collapsed" : "") +
        (rightCollapsed ? " right-collapsed" : "")
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) processFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        className={
          "v-editor-left" +
          (leftCollapsed ? " collapsed" : "") +
          (mobilePanel === "left" ? " is-mobile-open" : "")
        }
      >
        <button
          className="v-panel-toggle v-panel-toggle--left"
          onClick={() => setLeftCollapsed((c) => !c)}
          title={leftCollapsed ? "Expand tools" : "Collapse tools"}
        >
          <Icon
            name="chevron_right"
            size={14}
            style={{
              transform: leftCollapsed ? "none" : "rotate(180deg)",
              transition: "transform 300ms ease",
            }}
          />
        </button>
        <div style={{ marginBottom: 18 }}>
          <button
            className="v-btn v-btn--ghost v-btn--sm"
            style={{ padding: "6px 10px" }}
            onClick={() => {
              if (
                !activeProject &&
                Object.keys(processedResults).length > 0 &&
                !window.confirm(
                  "You have unsaved edits that will be lost. Continue?",
                )
              ) {
                return;
              }
              if (!activeProject) {
                idbDeleteProject(SCRATCH_KEY).catch(() => {});
              }
              setPage("projects");
            }}
          >
            <Icon
              name="chevron_right"
              size={11}
              color="var(--graphite)"
              style={{ transform: "rotate(180deg)" }}
            />{" "}
            Back
          </button>
          <div className="v-editor-breadcrumb" style={{ marginTop: 8 }}>
            {activeProject ? activeProject.address : "Quick edit"} ·{" "}
            {photoCount} photo{photoCount !== 1 ? "s" : ""} · {refinedCount}{" "}
            refined
          </div>
          <h2 className="v-editor-title">
            {activeProject
              ? activeProject.address.split(" ").slice(-2).join(" ")
              : "Photo refinement"}
          </h2>
        </div>

        {TOOLS.map((t, i) => {
          if ("section" in t && !("id" in t)) {
            return (
              <div key={"s" + i} className="v-section-label">
                {t.section}
              </div>
            );
          }
          if (!("id" in t)) return null;
          const tool = t as {
            id: string;
            icon: string;
            name: string;
            desc: string;
            cost: string;
          };
          const exteriorOnly = ["twilight", "sky", "lawn"].includes(tool.id);
          const interiorOnly = ["staging", "whiten", "renovation"].includes(
            tool.id,
          );
          const photoIsExterior = currentPhoto
            ? isExteriorRoom(currentPhoto.label)
            : false;
          // [STAGING GATE] Staging only on empty, stageable living spaces.
          // Wrong-room staging makes the model reinterpret the whole scene
          // (kitchens → restyled, backyards → patio sets). empty===undefined
          // (detection unavailable) fails OPEN so the tool is never bricked.
          const stagingWrongRoom =
            tool.id === "staging" &&
            !!currentPhoto &&
            !photoIsExterior &&
            !STAGEABLE_ROOMS.has(currentPhoto.label);
          // Furnished rooms no longer block staging — they route to replace
          // mode (remove existing furniture, then stage) at 3 cr.
          const stagingReplace =
            tool.id === "staging" && currentPhoto?.empty === false;
          const disabled =
            (exteriorOnly && !photoIsExterior) ||
            (interiorOnly && photoIsExterior) ||
            stagingWrongRoom;
          const disabledReason = exteriorOnly
            ? "Exterior photos only"
            : stagingWrongRoom
              ? `Staging isn't designed for a ${currentPhoto?.label || "room"} — it would re-render the space. Change the room type if this is mislabeled.`
              : "Interior photos only";
          const disabledShort = exteriorOnly
            ? "Exterior only"
            : stagingWrongRoom
              ? "Not stageable"
              : "Interior only";
          return (
            <div
              key={tool.id}
              className={
                "v-tool-item" +
                (activeTool === tool.id ? " active" : "") +
                (disabled ? " disabled" : "")
              }
              onClick={() => !disabled && setActiveTool(tool.id)}
              title={disabled ? disabledReason : undefined}
            >
              <div className="v-tool-icon">
                <Icon name={tool.icon} size={16} />
              </div>
              <div className="v-tool-body">
                <div className="v-tool-name">{tool.name}</div>
                <div className="v-tool-desc">
                  {disabled
                    ? disabledShort
                    : stagingReplace
                      ? "Replaces existing furniture"
                      : tool.desc}
                </div>
              </div>
              {!disabled && (
                <div className="v-tool-cost">
                  {stagingReplace ? `${REPLACE_STAGING_COST} cr` : tool.cost}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="v-editor-center">
        <div
          className="v-editor-topbar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div className="v-subtabs">
            <button
              className={"v-subtab" + (view === "compare" ? " active" : "")}
              onClick={() => setView("compare")}
            >
              <Icon name="layers" size={12} />{" "}
              <span className="v-lbl-l">Before / After</span>
              <span className="v-lbl-s">Compare</span>
            </button>
            <button
              className={"v-subtab" + (view === "grid" ? " active" : "")}
              onClick={() => setView("grid")}
            >
              <Icon name="image" size={12} />{" "}
              <span className="v-lbl-l">Photo grid</span>
              <span className="v-lbl-s">Grid</span>
            </button>
            <button
              className={"v-subtab" + (view === "single" ? " active" : "")}
              onClick={() => {
                setView("single");
                setSinglePhoto(selectedPhoto);
              }}
            >
              <Icon name="armchair" size={12} />{" "}
              <span className="v-lbl-l">Single photo</span>
              <span className="v-lbl-s">Single</span>
            </button>
          </div>
          <div
            className="v-editor-actions"
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            {generatingCount > 0 && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--brand-accent-dark)",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span className="v-gen-spinner" />
                {generatingCount} processing
              </span>
            )}
            <button
              className="v-btn v-btn--ghost v-btn--sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="plus" size={12} /> Add photos
            </button>
            {photoCount > 1 && (
              <button
                className="v-btn v-btn--secondary v-btn--sm"
                onClick={handleApplyAll}
                disabled={applyAllCount === 0}
              >
                Apply to all ({applyAllCount}) · {applyAllCost} cr
              </button>
            )}

            <button
              className="v-btn v-btn--primary v-btn--sm"
              onClick={handleApply}
              disabled={
                !photos.length ||
                (currentPhoto ? isPhotoGenerating(currentPhoto.id) : false) ||
                (activeTool === "magicedit" && !customRemoval.trim())
              }
            >
              {currentIsGenerating ? (
                <>
                  <span className="v-gen-spinner" /> Refining…
                </>
              ) : (
                <>
                  Apply · {toolCostFor(activeTool, currentPhoto)} cr{" "}
                  <Icon name="arrow_right" size={12} />
                </>
              )}
            </button>
          </div>
        </div>

        {view === "compare" && renderCompare()}
        {view === "grid" && renderGrid()}
        {view === "single" && renderSingle()}

        {currentPhoto && (
          <div className="v-control-card">
            <div className="v-control-head">
              <div className="v-control-ttl">
                <span className="v-gold-rule" />
                {toolName}
                {toolName === "Virtual staging" && getEngineOverride() && (
                  <span className="v-engine-badge">
                    {getEngineOverride()} engine · A/B
                  </span>
                )}
                {toolName === "Virtual staging" &&
                  currentPhoto?.empty === false && (
                    <span className="v-engine-badge v-mode-badge">
                      Replace mode · {REPLACE_STAGING_COST} cr
                    </span>
                  )}
              </div>
              <span className="v-muted" style={{ fontSize: 12 }}>
                {view === "single"
                  ? `Photo ${(singlePhoto ?? selectedPhoto) + 1}`
                  : `Photo ${selectedPhoto + 1}`}{" "}
                · {currentPhoto.label}
              </span>
            </div>

            <p
              style={{
                margin: "-4px 0 14px",
                fontSize: 11.5,
                lineHeight: 1.45,
                color: "var(--graphite)",
              }}
            >
              Each tool builds on your current image and stacks with the next.
              Undo steps back one step; Reset returns to your original photo.
            </p>

            {activeTool === "magicedit" ? (
              <>
                <div className="v-field">
                  <span className="v-field-label">Describe the edit</span>
                  <textarea
                    className="v-set-input"
                    placeholder="e.g. remove all the dirt from the pool and make the water clean and clear blue"
                    value={customRemoval}
                    onChange={(e) => setCustomRemoval(e.target.value)}
                    rows={3}
                    style={{
                      width: "100%",
                      fontSize: 12,
                      resize: "vertical",
                      lineHeight: 1.5,
                    }}
                  />
                </div>
                <div className="v-preset-row" style={{ marginTop: 8 }}>
                  {[
                    "Remove the cars from the driveway",
                    "Add a fire in the fireplace",
                    "Remove the power lines",
                    "Clean the pool water",
                  ].map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      className="v-preset"
                      onClick={() => setCustomRemoval(ex)}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
                <p className="v-muted" style={{ fontSize: 11, marginTop: 8 }}>
                  Add, remove, or clean anything. Runs on the full-quality
                  model and only changes what you describe.
                </p>
              </>
            ) : activeTool === "twilight" ? (
              <>
                <div className="v-field">
                  <span className="v-field-label">Color style</span>
                  <div className="v-preset-row">
                    {(PRESETS.twilight_style || []).map((p) => (
                      <button
                        key={p}
                        className={
                          "v-preset" +
                          (stylePreset === p.toLowerCase() ? " active" : "")
                        }
                        onClick={() => setStylePreset(p.toLowerCase())}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="v-field" style={{ marginTop: 4 }}>
                  <span className="v-field-label">Time of day</span>
                  <div className="v-preset-row">
                    {(PRESETS.twilight_time || []).map((p) => {
                      const val = p
                        .toLowerCase()
                        .replace(/ /g, "-") as TwilightTime;
                      return (
                        <button
                          key={p}
                          className={
                            "v-preset" + (twilightTime === val ? " active" : "")
                          }
                          onClick={() => setTwilightTime(val)}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : activeTool === "renovation" ? (
              <>
                <div className="v-field">
                  <span className="v-field-label">Cabinets</span>
                  <input
                    className="v-set-input"
                    placeholder="e.g. white shaker with brushed nickel hardware"
                    value={renovCabinets}
                    onChange={(e) => setRenovCabinets(e.target.value)}
                    style={{ width: "100%", fontSize: 12 }}
                  />
                </div>
                <div className="v-field" style={{ marginTop: 4 }}>
                  <span className="v-field-label">Countertops</span>
                  <input
                    className="v-set-input"
                    placeholder="e.g. Calacatta marble waterfall"
                    value={renovCountertops}
                    onChange={(e) => setRenovCountertops(e.target.value)}
                    style={{ width: "100%", fontSize: 12 }}
                  />
                </div>
                <div className="v-field" style={{ marginTop: 4 }}>
                  <span className="v-field-label">Flooring</span>
                  <input
                    className="v-set-input"
                    placeholder="e.g. wide-plank oak hardwood"
                    value={renovFlooring}
                    onChange={(e) => setRenovFlooring(e.target.value)}
                    style={{ width: "100%", fontSize: 12 }}
                  />
                </div>
                <div className="v-field" style={{ marginTop: 4 }}>
                  <span className="v-field-label">Wall color</span>
                  <input
                    className="v-set-input"
                    placeholder="e.g. soft sage green paint"
                    value={renovWalls}
                    onChange={(e) => setRenovWalls(e.target.value)}
                    style={{ width: "100%", fontSize: 12 }}
                  />
                </div>
                <p className="v-muted" style={{ fontSize: 11, marginTop: 6 }}>
                  Leave any field blank to keep that surface unchanged. At least
                  one is required.
                </p>
              </>
            ) : (
              <div className="v-field">
                <span className="v-field-label">Style preset</span>
                <div className="v-preset-row">
                  {(
                    PRESETS[
                      activeTool === "declutter" &&
                      isExteriorRoom(currentPhoto.label)
                        ? "declutter_ext"
                        : activeTool
                    ] || []
                  ).map((p) => (
                    <button
                      key={p}
                      className={
                        "v-preset" +
                        (stylePreset === p.toLowerCase() ? " active" : "")
                      }
                      onClick={() => setStylePreset(p.toLowerCase())}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTool === "declutter" && (
              <div className="v-field" style={{ marginTop: 4 }}>
                <span className="v-field-label">Specific items to remove</span>
                <input
                  className="v-set-input"
                  placeholder="e.g. blue tarp on porch, exercise bike in corner"
                  value={customRemoval}
                  onChange={(e) => setCustomRemoval(e.target.value)}
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
            )}

            <div className="v-field-row">
              <div className="v-field">
                <span className="v-field-label">Room type</span>
                <div className="v-field-value">
                  {editingLabel ? (
                    <select
                      className="v-set-input"
                      value={currentPhoto.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        const photoId =
                          view === "single"
                            ? (photos[singlePhoto ?? selectedPhoto]?.id ??
                              currentPhoto.id)
                            : currentPhoto.id;
                        // Manual override wins: also clear the detected
                        // furnished flag so the staging gate trusts the agent.
                        setPhotos((prev) =>
                          prev.map((p) =>
                            p.id === photoId
                              ? {
                                  ...p,
                                  label: val,
                                  detecting: false,
                                  empty: undefined,
                                }
                              : p,
                          ),
                        );
                        setEditingLabel(false);
                      }}
                      onBlur={() => setEditingLabel(false)}
                      autoFocus
                      style={{ width: "100%", fontSize: 12 }}
                    >
                      {ROOM_TYPES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      onClick={() => setEditingLabel(true)}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px dashed var(--graphite)",
                      }}
                      title="Click to change room type"
                    >
                      {currentPhoto.detecting
                        ? "Detecting…"
                        : currentPhoto.label}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className={
          "v-editor-right" +
          (rightCollapsed ? " collapsed" : "") +
          (mobilePanel === "right" ? " is-mobile-open" : "")
        }
      >
        <button
          className="v-panel-toggle v-panel-toggle--right"
          onClick={() => setRightCollapsed((c) => !c)}
          title={rightCollapsed ? "Expand details" : "Collapse details"}
        >
          <Icon
            name="chevron_right"
            size={14}
            style={{
              transform: rightCollapsed ? "rotate(180deg)" : "none",
              transition: "transform 300ms ease",
            }}
          />
        </button>

        <div className="v-rp-section">
          <h4>Batch</h4>
          <div className="v-rp-row">
            <span className="v-rp-l">Photos uploaded</span>
            <span className="v-rp-v">{photoCount}</span>
          </div>
          <div className="v-rp-row">
            <span className="v-rp-l">Refined</span>
            <span className="v-rp-v">{refinedCount}</span>
          </div>
          <div className="v-rp-row">
            <span className="v-rp-l">Pending</span>
            <span className="v-rp-v">{unrefinedCount}</span>
          </div>
          <div className="v-rp-row">
            <span className="v-rp-l">Processing</span>
            <span
              className="v-rp-v"
              style={
                generatingCount > 0
                  ? { color: "var(--brand-accent-dark)", fontWeight: 600 }
                  : {}
              }
            >
              {generatingCount}
            </span>
          </div>
          {batchMode && (
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  height: 4,
                  background: "var(--soft-stone)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(batchDone / batchTotal) * 100}%`,
                    height: "100%",
                    background: "var(--pale-gold)",
                    transition: "width 300ms ease",
                  }}
                />
              </div>
              <div className="v-muted" style={{ fontSize: 11, marginTop: 6 }}>
                Batch: {batchDone} of {batchTotal} complete
              </div>
            </div>
          )}
        </div>

        <div className="v-rp-section">
          <h4>Edit history · {currentPhoto?.label}</h4>
          {(() => {
            const history = currentPhoto
              ? photoHistory[currentPhoto.id] || []
              : [];
            if (history.length === 0)
              return (
                <div
                  className="v-muted"
                  style={{ fontSize: 12, padding: "8px 0" }}
                >
                  No edits yet — apply a tool to start.
                </div>
              );
            const toolNames: Record<string, string> = {
              magicedit: "Magic edit",
              staging: "Staging",
              declutter: "Declutter",
              whiten: "White balance",
              twilight: "Twilight",
              sky: "Sky",
              lawn: "Lawn",
            };
            return (
              <>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  {history.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 11,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 0",
                      }}
                    >
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "var(--pale-gold)",
                          color: "var(--deep-charcoal)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ fontWeight: 500 }}>
                        {toolNames[h.tool] || h.tool}
                      </span>
                      <span className="v-muted">· {h.preset}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    className="v-btn v-btn--ghost v-btn--sm"
                    style={{ fontSize: 11 }}
                    onClick={handleUndo}
                    disabled={currentIsGenerating}
                  >
                    Undo last
                  </button>
                  <button
                    className="v-btn v-btn--ghost v-btn--sm"
                    style={{ fontSize: 11 }}
                    onClick={handleReset}
                    disabled={currentIsGenerating}
                  >
                    Reset to original
                  </button>
                </div>
              </>
            );
          })()}
        </div>

        <div className="v-rp-section">
          <h4>Export</h4>

          {/* ── Progress tracker (shown during export) ── */}
          {exporting && exportProgress && (
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  height: 4,
                  background: "var(--soft-stone)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(exportProgress.done / exportProgress.total) * 100}%`,
                    height: "100%",
                    background: "var(--pale-gold)",
                    transition: "width 400ms ease",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 6,
                }}
              >
                <span className="v-muted" style={{ fontSize: 11 }}>
                  {exportProgress.done} of {exportProgress.total} upscaled
                </span>
                <span className="v-muted" style={{ fontSize: 11 }}>
                  {(() => {
                    if (exportProgress.done === 0) return "Estimating…";
                    const elapsed =
                      (Date.now() - exportProgress.startedAt) / 1000;
                    const perPhoto = elapsed / exportProgress.done;
                    const remaining = Math.ceil(
                      perPhoto * (exportProgress.total - exportProgress.done),
                    );
                    if (remaining <= 0) return "Finishing…";
                    return remaining < 60
                      ? `~${remaining}s left`
                      : `~${Math.ceil(remaining / 60)}m left`;
                  })()}
                </span>
              </div>

              {exportProgress.total > 1 && (
                <div
                  style={{
                    marginTop: 8,
                    maxHeight: 120,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  {exportProgress.items.map((it) => (
                    <div
                      key={it.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11,
                        padding: "3px 0",
                        opacity: it.status === "queued" ? 0.4 : 1,
                      }}
                    >
                      {it.status === "done" && (
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            background: "rgba(76,175,80,0.9)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            fontSize: 9,
                            color: "#fff",
                          }}
                        >
                          ✓
                        </span>
                      )}
                      {it.status === "upscaling" && (
                        <span
                          className="v-gen-spinner"
                          style={{ width: 14, height: 14, flexShrink: 0 }}
                        />
                      )}
                      {it.status === "queued" && (
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            border: "1px solid var(--soft-stone)",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      {it.status === "failed" && (
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            background: "rgba(255,55,95,0.9)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            fontSize: 9,
                            color: "#fff",
                          }}
                        >
                          ✕
                        </span>
                      )}
                      <span
                        style={{
                          color:
                            it.status === "upscaling"
                              ? "var(--warm-ivory)"
                              : "var(--graphite)",
                          fontWeight: it.status === "upscaling" ? 500 : 400,
                        }}
                      >
                        {it.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Export buttons (hidden during export) ── */}
          {!exporting && (
            <div className="v-export-list">
              {/* Refined exports */}
              {refinedCount > 0 && (
                <button className="v-export-btn gold" onClick={doDownloadAll}>
                  <Icon name="download" size={13} />
                  {refinedCount > 1
                    ? `Download all ${refinedCount} refined`
                    : "Download refined photo"}
                  <span className="v-export-meta">
                    {refinedCount > 1 ? ".zip" : ".jpg"}
                  </span>
                </button>
              )}
              {view !== "grid" &&
                currentPhoto &&
                processedResults[currentPhoto.id] && (
                  <button
                    className="v-export-btn"
                    onClick={() => doDownloadSingle(currentPhotoIdx)}
                  >
                    <Icon name="download" size={13} />
                    Download this photo
                    <span className="v-export-meta">
                      .jpg · {currentPhoto.label}
                    </span>
                  </button>
                )}

              {/* Original (upscale-only) exports */}
              {view !== "grid" &&
                currentPhoto &&
                !processedResults[currentPhoto.id] && (
                  <button
                    className="v-export-btn"
                    onClick={() => setExportConfirm("single")}
                  >
                    <Icon name="upload" size={13} />
                    Export this photo
                    <span className="v-export-meta">
                      upscale only · {currentPhoto.label}
                    </span>
                  </button>
                )}
              {(() => {
                const uneditedCount = photos.filter(
                  (p) => !processedResults[p.id],
                ).length;
                if (uneditedCount === 0) return null;
                return (
                  <button
                    className="v-export-btn"
                    onClick={() => setExportConfirm("batch")}
                  >
                    <Icon name="upload" size={13} />
                    Export{" "}
                    {uneditedCount === photoCount ? "all" : uneditedCount}{" "}
                    original{uneditedCount !== 1 ? "s" : ""}
                    <span className="v-export-meta">
                      upscale only · {uneditedCount > 1 ? ".zip" : ".jpg"}
                    </span>
                  </button>
                );
              })()}
            </div>
          )}

          {/* Create deliverables — MLS / social / print / description / kit /
              reveal video. Consolidated here from the old action-row
              "Export & Create" dropdown so downloads and deliverables share one
              home. Same openOverlay() handlers + disabled rules as before. */}
          {!exporting && (
            <>
              <div className="v-rp-subhead">Create deliverables</div>
              <div className="v-export-list">
                {(
                  [
                    { kind: "reveal", icon: "video", label: "Reveal video", meta: "Before / after", disabled: !revealAfter },
                    { kind: "mls", icon: "mls", label: "MLS export", meta: "Resize · EXIF · zip", disabled: overlayImages.length === 0 },
                    { kind: "social", icon: "image", label: "Social pack", meta: "IG / story", disabled: overlayImages.length === 0 },
                    { kind: "description", icon: "text", label: "Listing description", meta: "AI copy · 3 tones", disabled: false },
                    { kind: "print", icon: "folder", label: "Print collateral", meta: "Flyer · PDF", disabled: overlayImages.length === 0 },
                    { kind: "listingkit", icon: "sparkles", label: "Listing Kit", meta: "MLS + social + copy", disabled: overlayImages.length === 0 },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.kind}
                    className="v-export-btn"
                    disabled={item.disabled}
                    onClick={() => openOverlay(item.kind)}
                    title={
                      item.disabled
                        ? item.kind === "reveal"
                          ? "Refine a photo first"
                          : "Upload photos first"
                        : undefined
                    }
                    style={
                      item.disabled
                        ? { opacity: 0.4, cursor: "not-allowed" }
                        : undefined
                    }
                  >
                    <Icon name={item.icon} size={13} />
                    {item.label}
                    <span className="v-export-meta">{item.meta}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Inline confirmation for upscale-only export */}
          {exportConfirm && !exporting && (
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 6,
                background: "rgba(216,199,154,0.08)",
                border: "1px solid rgba(216,199,154,0.2)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 6,
                  color: "var(--warm-ivory)",
                }}
              >
                Upscale only — no AI edits
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--graphite)",
                  lineHeight: 1.5,
                  marginBottom: 10,
                }}
              >
                {exportConfirm === "single"
                  ? `This photo will be upscaled to full resolution without any AI edits applied. ${isExteriorRoom(currentPhoto?.label || "") ? "Exterior upscale takes ~14s." : "Interior upscale takes ~1s."}`
                  : `${photos.filter((p) => !processedResults[p.id]).length} photo${photos.filter((p) => !processedResults[p.id]).length !== 1 ? "s" : ""} will be upscaled to full resolution without any AI edits applied.`}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="v-btn v-btn--primary v-btn--sm"
                  style={{ fontSize: 11 }}
                  onClick={() =>
                    exportConfirm === "single"
                      ? doExportOriginalSingle(currentPhotoIdx)
                      : doExportOriginalBatch()
                  }
                >
                  Export
                </button>
                <button
                  className="v-btn v-btn--ghost v-btn--sm"
                  style={{ fontSize: 11 }}
                  onClick={() => setExportConfirm(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {exportError && (
            <div
              className="v-gate-note"
              style={{ color: "var(--state-error)" }}
            >
              <Icon name="sparkles" size={11} />
              {exportError}
            </div>
          )}
          {!refinedCount &&
            !exportConfirm &&
            !exporting &&
            !exportError &&
            photoCount > 0 && (
              <div className="v-gate-note">
                <Icon name="sparkles" size={11} />
                Export originals with upscale, or apply a tool first for
                AI-enhanced results.
              </div>
            )}
        </div>

        <div className="v-rp-section" style={{ borderBottom: 0 }}>
          <h4>Activity</h4>
          {activity.length === 0 && (
            <div className="v-muted" style={{ fontSize: 12, padding: "8px 0" }}>
              No activity yet — upload photos to get started.
            </div>
          )}
          {activity.map((a, i) => (
            <div
              key={i}
              style={{
                padding: "8px 0",
                borderTop: i ? "1px solid var(--soft-stone)" : "none",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 500 }}>{a.what}</div>
              <div
                className="v-muted"
                style={{
                  fontSize: 11,
                  marginTop: 2,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>
                  {a.who} · {a.when}
                </span>
                {a.cost ? (
                  <span style={{ color: "var(--pale-gold)", fontWeight: 600 }}>
                    −{a.cost} cr
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* [MOBILE contract] Bottom tab bar — only visible under 900px (CSS
          hides .v-mobile-tabbar at >=900px). The two buttons toggle the
          .is-mobile-open bottom-sheet on the left (Tools) / right (Adjust)
          panels so the editor is reachable at 375px. Selecting one closes the
          other so they never stack. */}
      {mobilePanel !== null && (
        <div
          className="v-sheet-scrim"
          aria-hidden="true"
          onClick={() => setMobilePanel(null)}
        />
      )}
      <div className="v-mobile-tabbar">
        <button
          type="button"
          className={mobilePanel === "left" ? "is-active" : ""}
          aria-pressed={mobilePanel === "left"}
          onClick={() => setMobilePanel((p) => (p === "left" ? null : "left"))}
        >
          <Icon name="armchair" size={14} /> Tools
        </button>
        <button
          type="button"
          className={mobilePanel === "right" ? "is-active" : ""}
          aria-pressed={mobilePanel === "right"}
          onClick={() =>
            setMobilePanel((p) => (p === "right" ? null : "right"))
          }
        >
          <Icon name="settings" size={14} /> Adjust
        </button>
      </div>

      {/* ── Output generator overlays ──────────────────────────────────────
          Each is lazy-loaded and mounted inside a dark-editorial overlay shell.
          The MLS / Social / Description / Print panels are bare panels with no
          modal chrome of their own, so we provide the overlay + close button
          here and pass [GEN-PROPS] data (images built from refined results,
          falling back to originals; project name + listing meta). The reveal
          video (ExportModal) ships its own modal shell, so it is rendered
          directly. */}
      {activeOverlay === "reveal" && revealAfter && (
        <Suspense fallback={null}>
          <ExportModal
            imageBase64={revealAfter}
            originalImage={revealBefore || undefined}
            editHistory={
              currentPhoto
                ? (photoHistory[currentPhoto.id] || []).map((h) => h.tool)
                : []
            }
            brandKit={brandKit}
            onClose={closeOverlay}
          />
        </Suspense>
      )}

      {activeOverlay &&
        activeOverlay !== "reveal" &&
        (() => {
          const titles: Record<string, string> = {
            mls: "MLS Export",
            social: "Social Pack",
            description: "Listing Description",
            print: "Print Collateral",
            listingkit: "Listing Kit",
          };
          return (
            <div
              className="v-gen-overlay"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 200,
                background: "rgba(13,13,13,0.72)",
                backdropFilter: "blur(6px)",
                display: "grid",
                placeItems: "center",
                padding: 16,
              }}
              onClick={closeOverlay}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "var(--background-elevated)",
                  borderRadius: 16,
                  border: "1px solid var(--border-light)",
                  boxShadow: "var(--shadow-lg)",
                  width: "100%",
                  maxWidth: 920,
                  maxHeight: "90vh",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                    borderBottom: "1px solid var(--border-light)",
                    flexShrink: 0,
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: 22,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                    }}
                  >
                    {titles[activeOverlay]}
                  </h3>
                  <button
                    className="v-btn v-btn--ghost v-btn--sm"
                    onClick={closeOverlay}
                    aria-label="Close"
                    style={{ padding: "6px 8px" }}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
                <div style={{ overflowY: "auto", padding: 20 }}>
                  <Suspense
                    fallback={
                      <div
                        className="v-muted"
                        style={{ padding: "32px 0", textAlign: "center" }}
                      >
                        Loading…
                      </div>
                    }
                  >
                    {activeOverlay === "mls" && (
                      <MLSExport
                        open
                        onClose={closeOverlay}
                        images={overlayImages}
                        projectName={overlayProjectName}
                        listingMeta={overlayListingMeta}
                      />
                    )}
                    {activeOverlay === "social" && (
                      <SocialPack
                        open
                        onClose={closeOverlay}
                        images={overlayImages}
                        projectName={overlayProjectName}
                        listingMeta={overlayListingMeta}
                      />
                    )}
                    {activeOverlay === "description" && (
                      <ListingDescription
                        open
                        onClose={closeOverlay}
                        images={overlayImages}
                        projectName={overlayProjectName}
                        listingMeta={overlayListingMeta}
                      />
                    )}
                    {activeOverlay === "print" && (
                      <PrintCollateral
                        open
                        onClose={closeOverlay}
                        images={overlayImages}
                        projectName={overlayProjectName}
                        listingMeta={overlayListingMeta}
                      />
                    )}
                    {activeOverlay === "listingkit" && (
                      <ListingKitPipeline
                        open
                        onClose={closeOverlay}
                        images={overlayImages}
                        projectName={overlayProjectName}
                        listingMeta={overlayListingMeta}
                      />
                    )}
                  </Suspense>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Room type picker modal — shown after uploading photos */}
      {showRoomPicker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(27,29,31,0.6)",
            backdropFilter: "blur(4px)",
            display: "grid",
            placeItems: "center",
          }}
          onClick={() => setShowRoomPicker(false)}
        >
          <div
            style={{
              background: "var(--background-elevated)",
              borderRadius: 16,
              padding: "24px 28px",
              maxWidth: 600,
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "var(--shadow-lg)",
              border: "1px solid var(--border-light)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                Tag room types
              </h3>
              <button
                className="v-btn v-btn--primary v-btn--sm"
                onClick={() => setShowRoomPicker(false)}
              >
                Done
              </button>
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--graphite)",
                margin: "0 0 16px",
              }}
            >
              Setting the room type improves cleanup prompts and enables
              exterior-specific tools.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 10,
              }}
            >
              {photos.map((p) => (
                <div
                  key={p.id}
                  style={{
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "1px solid var(--border-light)",
                    background: "var(--background-secondary)",
                  }}
                >
                  <div
                    style={{
                      aspectRatio: "4/3",
                      backgroundImage: `url(${p.dataUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <div style={{ padding: "6px 8px" }}>
                    {p.detecting ? (
                      // Auto-detect is in flight (~0.5-4s). Show it so the
                      // default "Living Room" doesn't read as "detection
                      // failed" — matches the "Detecting…" state on the photo
                      // strip. The select swaps in the moment the tag lands.
                      <div
                        style={{
                          width: "100%",
                          fontSize: 12,
                          padding: "4px 6px",
                          border: "1px solid var(--border-light)",
                          borderRadius: 6,
                          background: "var(--background-secondary)",
                          color: "var(--graphite)",
                          fontFamily: "var(--font-sans)",
                          fontStyle: "italic",
                          textAlign: "center",
                        }}
                      >
                        Detecting room type…
                      </div>
                    ) : (
                      <select
                        value={p.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          // Manual override wins: also clear the detected
                          // furnished flag so the staging gate trusts the agent.
                          setPhotos((prev) =>
                            prev.map((ph) =>
                              ph.id === p.id
                                ? {
                                    ...ph,
                                    label: val,
                                    detecting: false,
                                    empty: undefined,
                                  }
                                : ph,
                            ),
                          );
                          idbSavePhoto(
                            activeProject?.id || SCRATCH_KEY,
                            p.id,
                            p.dataUrl,
                            val,
                            p.file.name,
                          ).catch(() => {});
                        }}
                        style={{
                          width: "100%",
                          fontSize: 12,
                          padding: "4px 6px",
                          border: "1px solid var(--border-light)",
                          borderRadius: 6,
                          background: "var(--background-elevated)",
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-sans)",
                        }}
                      >
                        {ROOM_TYPES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {samModal && (
        <ClutterMaskSelector
          imageBase64={samModal.image}
          individualMasks={samModal.masks}
          onConfirm={(indices) => {
            samModal.resolver(indices);
            setSamModal(null);
          }}
          onCancel={() => {
            samModal.resolver(null);
            setSamModal(null);
          }}
        />
      )}
    </div>
  );
};

export default VellumPhotoEditor;
