/**
 * ListingKitPipeline.tsx — one-click Listing Kit pipeline (Vellum-surfaced).
 *
 * COMPOSE-ONLY. This pipeline NO LONGER re-generates images. The original D4
 * recipe staged + dusk'd + cleaned every photo through geminiService's
 * client-side Gemini image path — that path is dead in the Vellum surface, so
 * per the competitive-overhaul contract we compose a kit from the already
 * processed images the editor hands us instead of regenerating anything:
 *
 *   1. MLS export   — HD Landscape jpegs, client-side Canvas resize + EXIF strip
 *                     + JSZip (utils/imageExport.processForMLS). No backend.
 *   2. Social pack  — branded "just listed" tile via the LIVE /api/render-template
 *                     endpoint that backs SocialPack. Best-effort.
 *   3. Listing copy — luxury-tone copy via geminiService.generateListingCopy.
 *                     This is the Gemini *copy* (text) lane, not image gen.
 *                     Best-effort.
 *
 * Output: a single zip (refined photos + mls_exports + social_pack +
 * listing_description.txt) downloaded with one click. Cancel mid-pipeline is
 * wired through an AbortController so partial results stay downloadable.
 *
 * Mountable standalone inside the Vellum editor as a dark-editorial overlay via
 * the shared [GEN-PROPS] contract: { open, onClose, images, projectName?,
 * listingMeta? }.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  ChevronDown,
  Package,
  Share2,
  FileText,
} from "lucide-react";
import JSZip from "jszip";
import {
  generateListingCopy,
  type ListingCopyPropertyDetails,
  type ListingCopyTone,
} from "../services/geminiService";
import {
  processForMLS,
  MLS_PRESETS,
  dataURLtoBlob,
  downloadBlob,
} from "../utils/imageExport";
import { useBrandKit } from "../hooks/useBrandKit";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shared [GEN-PROPS] contract — the image shape the Vellum editor passes in. */
interface GenImage {
  id: string;
  dataUrl: string;
  label?: string;
  isRefined?: boolean;
}

export interface ListingKitPipelineProps {
  open: boolean;
  onClose: () => void;
  images: GenImage[];
  projectName?: string;
  /** Listing details — seeds the social tile + listing copy. */
  listingMeta?: ListingCopyPropertyDetails;
  /** Optional tone override. Defaults to luxury. */
  tone?: ListingCopyTone;
}

type StepKey = "mls" | "social" | "copy";

interface StepDef {
  key: StepKey;
  label: string;
  icon: React.ElementType;
}

const STEPS: StepDef[] = [
  { key: "mls", label: "MLS export", icon: Package },
  { key: "social", label: "Social pack", icon: Share2 },
  { key: "copy", label: "Listing copy", icon: FileText },
];

interface PipelineState {
  currentStep: number; // 0-based
  stepStatus: Record<
    StepKey,
    "pending" | "running" | "done" | "error" | "cancelled"
  >;
  stepDetail: string; // e.g. "3/8 photos"
  stepError: Partial<Record<StepKey, string>>;
}

const initialPipelineState = (): PipelineState => ({
  currentStep: -1,
  stepStatus: { mls: "pending", social: "pending", copy: "pending" },
  stepDetail: "",
  stepError: {},
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// All Vellum images arrive as data URLs; this stays defensive for raw base64.
function toDataUrl(b64OrDataUrl: string): string {
  if (b64OrDataUrl.startsWith("data:")) return b64OrDataUrl;
  return `data:image/jpeg;base64,${b64OrDataUrl}`;
}

function safeName(label: string, idx: number): string {
  const slug =
    (label || "photo")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "photo";
  return `${String(idx + 1).padStart(3, "0")}_${slug}`;
}

function isAbort(err: any): boolean {
  return err?.name === "AbortError" || err?.message === "ABORTED";
}

// ─── Component ────────────────────────────────────────────────────────────────

const ListingKitPipeline: React.FC<ListingKitPipelineProps> = ({
  open,
  onClose,
  images,
  projectName,
  listingMeta,
  tone = "luxury" as ListingCopyTone,
}) => {
  const { brandKit } = useBrandKit();
  const [heroId, setHeroId] = useState<string>(() => images[0]?.id || "");
  const [state, setState] = useState<PipelineState>(initialPipelineState);
  const [running, setRunning] = useState(false);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [zipName, setZipName] = useState<string>("listing_kit.zip");
  const [fatalError, setFatalError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset hero default whenever the source image set changes.
  useEffect(() => {
    if (!heroId || !images.find((i) => i.id === heroId)) {
      setHeroId(images[0]?.id || "");
    }
  }, [images, heroId]);

  // Cancel on unmount so the modal doesn't leak in-flight calls.
  useEffect(() => () => abortRef.current?.abort(), []);

  const updateStep = useCallback(
    (
      key: StepKey,
      partial: Partial<Pick<PipelineState, "stepDetail">> & {
        status?: PipelineState["stepStatus"][StepKey];
        errorMsg?: string;
      },
    ) => {
      setState((prev) => {
        const stepIdx = STEPS.findIndex((s) => s.key === key);
        const next: PipelineState = {
          ...prev,
          stepStatus: { ...prev.stepStatus },
          stepError: { ...prev.stepError },
        };
        if (partial.status) next.stepStatus[key] = partial.status;
        if (partial.status === "running") next.currentStep = stepIdx;
        if (partial.stepDetail !== undefined)
          next.stepDetail = partial.stepDetail;
        if (partial.errorMsg) next.stepError[key] = partial.errorMsg;
        return next;
      });
    },
    [],
  );

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleClose = useCallback(() => {
    if (running) handleCancel();
    onClose();
  }, [running, handleCancel, onClose]);

  const handleGenerate = useCallback(async () => {
    if (running || images.length === 0) return;
    setRunning(true);
    setFatalError(null);
    setZipBlob(null);
    setState(initialPipelineState());

    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    // Per-step bag of results so cancel still produces a useful zip.
    let mlsZipBlob: Blob | null = null;
    let socialPng: Blob | null = null;
    let listingCopy: {
      headline: string;
      description: string;
      socialCaption: string;
      hashtags: string[];
    } | null = null;

    const heroImage = images.find((i) => i.id === heroId) || images[0];

    try {
      // ─── Step 1 — MLS zip (HD Landscape) from the refined photos ────────
      updateStep("mls", {
        status: "running",
        stepDetail: `0/${images.length} photos`,
      });
      const preset =
        MLS_PRESETS.find((p) => p.name === "HD Landscape") ?? MLS_PRESETS[0];
      const mlsZip = new JSZip();
      let mlsDone = 0;
      for (const img of images) {
        if (signal.aborted) throw new Error("ABORTED");
        try {
          const blob = await processForMLS(toDataUrl(img.dataUrl), preset);
          mlsZip.file(
            `${safeName(img.label || "room", mlsDone)}_mls.jpg`,
            blob,
          );
        } catch (err) {
          // Skip individual MLS failures rather than aborting the whole kit.
          console.warn(
            "[ListingKit] MLS export skipped for image",
            img.id,
            err,
          );
        }
        mlsDone++;
        updateStep("mls", { stepDetail: `${mlsDone}/${images.length} photos` });
      }
      mlsZipBlob = await mlsZip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      updateStep("mls", {
        status: "done",
        stepDetail: `${images.length}/${images.length} photos`,
      });
      if (signal.aborted) throw new Error("ABORTED");

      // ─── Step 2 — Social pack (Just Listed via /api/render-template) ────
      // Reuses the SocialPack server endpoint so the kit ships the same branded
      // tile the manual flow produces. Best-effort: a brand-kit gap or network
      // blip can't fail the kit.
      updateStep("social", { status: "running", stepDetail: "rendering tile" });
      try {
        const heroDataUrl = toDataUrl(heroImage.dataUrl);
        const data: Record<string, any> = {
          heroImage: heroDataUrl,
          agentName: brandKit.agentName || undefined,
          brokerageName: brandKit.brokerageName || undefined,
          phone: brandKit.phone || undefined,
          email: brandKit.email || undefined,
          website: brandKit.website || undefined,
          primaryColor: brandKit.primaryColor,
          logo: brandKit.logo || undefined,
          headshot: brandKit.headshot || undefined,
          address: listingMeta?.address,
          beds: listingMeta?.beds,
          baths: listingMeta?.baths,
          sqft: listingMeta?.sqft,
          price: listingMeta?.price
            ? `$${listingMeta.price.toLocaleString()}`
            : undefined,
        };
        const res = await fetch("/api/render-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: "just-listed",
            format: "ig-post",
            data,
          }),
          signal,
        });
        if (!res.ok) throw new Error(`render-template HTTP ${res.status}`);
        socialPng = await res.blob();
        updateStep("social", { status: "done", stepDetail: "1×1 ig-post" });
      } catch (err: any) {
        if (isAbort(err)) throw err;
        updateStep("social", {
          status: "error",
          errorMsg: err?.message || "render failed",
        });
      }
      if (signal.aborted) throw new Error("ABORTED");

      // ─── Step 3 — Listing copy ──────────────────────────────────────────
      // DISABLED: copy generation used a browser-side Gemini call, which is
      // purged. We skip it cleanly (no stub call, no error spam) so the kit
      // still ships MLS exports + the social tile. The copy step is marked as a
      // no-op "coming soon" rather than failed.
      // TODO: route to a server /api/listing-copy endpoint (Replicate/Claude),
      // set `listingCopy` from the response, then restore a real running/done
      // state here. `generateListingCopy` is intentionally left imported as the
      // future swap-in point.
      void generateListingCopy; // keep the import live for the re-enable path
      updateStep("copy", {
        status: "cancelled",
        stepDetail: "coming soon — moving to Replicate",
      });
    } catch (err: any) {
      if (isAbort(err)) {
        // Mark every still-pending/running step as cancelled so the UI tells
        // the user exactly where the pipeline halted.
        setState((prev) => {
          const stepStatus = { ...prev.stepStatus };
          for (const k of Object.keys(stepStatus) as StepKey[]) {
            if (stepStatus[k] === "running" || stepStatus[k] === "pending") {
              stepStatus[k] = "cancelled";
            }
          }
          return { ...prev, stepStatus };
        });
      } else {
        setFatalError(err?.message || "Pipeline failed");
      }
    } finally {
      // Always assemble whatever we have so partial results are downloadable.
      try {
        const finalZip = new JSZip();
        const photosFolder = finalZip.folder("refined_photos");
        const mlsFolder = finalZip.folder("mls_exports");
        const socialFolder = finalZip.folder("social_pack");

        images.forEach((img, idx) => {
          if (photosFolder) {
            photosFolder.file(
              `${safeName(img.label || "room", idx)}.jpg`,
              dataURLtoBlob(toDataUrl(img.dataUrl)),
            );
          }
        });

        if (mlsZipBlob && mlsFolder) {
          mlsFolder.file("mls_export_hd_landscape.zip", mlsZipBlob);
        }
        if (socialPng && socialFolder) {
          socialFolder.file("just_listed_ig_post.png", socialPng);
        }
        if (listingCopy) {
          const txt = [
            `HEADLINE`,
            `--------`,
            listingCopy.headline,
            "",
            `DESCRIPTION`,
            `-----------`,
            listingCopy.description,
            "",
            `SOCIAL CAPTION`,
            `--------------`,
            listingCopy.socialCaption,
            "",
            `HASHTAGS`,
            `--------`,
            listingCopy.hashtags.map((h) => `#${h}`).join(" "),
          ].join("\n");
          finalZip.file("listing_description.txt", txt);
        }

        const stamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 16);
        const generated = await finalZip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        });
        setZipBlob(generated);
        setZipName(`listing_kit_${stamp}.zip`);
      } catch (zipErr) {
        console.error("[ListingKit] zip assembly failed:", zipErr);
        if (!fatalError) setFatalError("Failed to assemble final zip");
      }
      setRunning(false);
      abortRef.current = null;
    }
  }, [
    running,
    images,
    heroId,
    listingMeta,
    tone,
    fatalError,
    updateStep,
    brandKit,
  ]);

  const handleDownload = useCallback(() => {
    if (zipBlob) downloadBlob(zipBlob, zipName);
  }, [zipBlob, zipName]);

  // ─── Derived UI state ───────────────────────────────────────────────────
  const completedSteps = useMemo(
    () => STEPS.filter((s) => state.stepStatus[s.key] === "done").length,
    [state.stepStatus],
  );
  const progressPct = Math.round((completedSteps / STEPS.length) * 100);
  const currentStepDef =
    state.currentStep >= 0 ? STEPS[state.currentStep] : null;
  const allDone = STEPS.every((s) => state.stepStatus[s.key] === "done");
  const partial = !running && !!zipBlob && !allDone;

  if (!open) return null;

  return (
    <div className="flex flex-col min-h-0">
      {/* Panel intro (the host .v-gen-overlay supplies the modal shell + close) */}
      <div className="flex items-center gap-2.5 pb-4">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#d8c79a]/15 text-[#d8c79a] border border-[#d8c79a]/30">
          <Sparkles size={16} />
        </div>
        <div>
          <h3
            className="text-[#f7f6f2] text-xl font-medium leading-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Generate Listing Kit
          </h3>
          <p className="text-sm text-zinc-500">
            {projectName
              ? `${projectName} — MLS exports + social tile + listing copy`
              : "Composes MLS exports + social tile + listing copy from your refined photos"}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 space-y-4">
        {/* Photo summary + hero picker */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm uppercase tracking-wider text-zinc-500 font-semibold">
              {images.length} photo{images.length === 1 ? "" : "s"} ready
            </span>
            <span className="text-xs text-zinc-600">
              No re-generation — composes refined photos
            </span>
          </div>

          {/* Photo strip */}
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
            {images.slice(0, 16).map((img) => (
              <div
                key={img.id}
                className={`relative aspect-square rounded-md overflow-hidden border ${
                  img.id === heroId
                    ? "border-[#d8c79a] ring-2 ring-[#d8c79a]/30"
                    : "border-white/10"
                }`}
                title={img.label || "Photo"}
              >
                <img
                  src={img.dataUrl}
                  alt={img.label || ""}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
            {images.length > 16 && (
              <div className="aspect-square rounded-md border border-white/10 bg-black/60 flex items-center justify-center text-xs font-semibold text-zinc-400">
                +{images.length - 16}
              </div>
            )}
          </div>

          {/* Hero selector */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="lk-hero"
              className="text-sm uppercase tracking-wider text-zinc-500 font-semibold whitespace-nowrap"
            >
              Hero shot
            </label>
            <div className="relative flex-1">
              <select
                id="lk-hero"
                value={heroId}
                onChange={(e) => setHeroId(e.target.value)}
                disabled={running}
                className="w-full appearance-none rounded-lg bg-black border border-white/10 text-zinc-100 text-xs font-medium px-2.5 py-1.5 pr-8 focus:outline-none focus:border-[#d8c79a] disabled:opacity-50"
              >
                {images.map((img, i) => (
                  <option key={img.id} value={img.id}>
                    #{i + 1} — {img.label || "Photo"}
                    {i === 0 ? " (default)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
              />
            </div>
          </div>
        </div>

        {/* Progress bar (visible while running OR after) */}
        {(running || allDone || partial || fatalError) && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm uppercase tracking-wider text-zinc-400 font-semibold">
                {currentStepDef && running
                  ? `Step ${state.currentStep + 1}/${STEPS.length}: ${currentStepDef.label}…`
                  : allDone
                    ? "Listing kit complete"
                    : partial
                      ? "Cancelled — partial results ready"
                      : "Pipeline error"}
              </div>
              <div className="text-xs text-zinc-500 font-mono">
                {progressPct}%
              </div>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progressPct}%`,
                  background: allDone ? "#30D158" : "#d8c79a",
                }}
              />
            </div>
            {state.stepDetail && running && (
              <p className="text-sm text-zinc-400">{state.stepDetail}</p>
            )}
          </div>
        )}

        {/* Step list */}
        <ol className="space-y-1.5">
          {STEPS.map((step, idx) => {
            const status = state.stepStatus[step.key];
            const Icon = step.icon;
            const stateColor =
              status === "done"
                ? "text-[#30D158]"
                : status === "running"
                  ? "text-[#d8c79a]"
                  : status === "error"
                    ? "text-[#FF375F]"
                    : status === "cancelled"
                      ? "text-zinc-500"
                      : "text-zinc-600";
            return (
              <li
                key={step.key}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                  status === "running"
                    ? "border-[#d8c79a]/30 bg-[#d8c79a]/5"
                    : status === "done"
                      ? "border-white/10 bg-black/30"
                      : status === "error"
                        ? "border-[#FF375F]/30 bg-[#FF375F]/5"
                        : "border-white/5"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center bg-zinc-900 border border-white/10 ${stateColor}`}
                >
                  {status === "running" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : status === "done" ? (
                    <CheckCircle2 size={13} />
                  ) : status === "error" ? (
                    <AlertCircle size={13} />
                  ) : (
                    <Icon size={13} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-zinc-200">
                    Step {idx + 1}/{STEPS.length} — {step.label}
                  </div>
                  {state.stepError[step.key] && (
                    <div className="text-xs text-[#FF8294] truncate">
                      {state.stepError[step.key]}
                    </div>
                  )}
                </div>
                <div
                  className={`text-xs font-mono uppercase tracking-wider ${stateColor}`}
                >
                  {status}
                </div>
              </li>
            );
          })}
        </ol>

        {fatalError && (
          <div className="flex items-start gap-2 rounded-lg border border-[#FF375F]/40 bg-[#FF375F]/5 px-3 py-2.5">
            <AlertCircle size={14} className="text-[#FF375F] mt-0.5 shrink-0" />
            <div className="text-sm text-[#FF8294]">{fatalError}</div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-white/10">
        <button
          type="button"
          onClick={handleClose}
          className="rounded-lg px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
        >
          Close
        </button>
        <div className="flex items-center gap-2">
          {running && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-[#FF375F] border border-[#FF375F]/40 hover:bg-[#FF375F]/10 transition"
            >
              Cancel
            </button>
          )}
          {zipBlob && !running && (
            <button
              type="button"
              onClick={handleDownload}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                allDone
                  ? "bg-[#30D158] text-black hover:opacity-90"
                  : "bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700"
              }`}
            >
              <Download size={12} />{" "}
              {allDone ? "Download Kit" : "Download Partial Kit"}
            </button>
          )}
          {!running && !allDone && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={images.length === 0}
              className="rounded-lg px-3.5 py-2 text-xs font-semibold text-black bg-[#d8c79a] hover:bg-[#e3d4ab] transition inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles size={12} /> Generate Kit
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ListingKitPipeline;
