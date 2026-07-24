/**
 * components/ListingBatchPanel.tsx — Listing Batch Pipeline MVP.
 *
 * Upload 1-30 listing photos, let the server classify each room, run the right
 * editing tool per photo (staging / declutter / whiten / exterior), and get
 * listing copy back. Rendered as the "batch" page inside VellumApp.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  Copy,
  Download,
  X,
} from "lucide-react";
import { saveAs } from "file-saver";
import {
  runBatch,
  fetchPhotoResult,
  writeLastBatchSummary,
  type BatchStatus,
  type BatchPhotoMeta,
} from "../services/listingBatchService";

const MAX_PHOTOS = 30;

interface LocalPhoto {
  id: string;
  name: string;
  dataUrl: string;
}

type Phase = "idle" | "running" | "done" | "error";

const TOOL_LABEL: Record<string, string> = {
  staging: "Virtual staging",
  declutter: "Declutter",
  whiten: "Brighten & whiten",
  exterior: "Lawn + sky",
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/data:([^;]+)/)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const ListingBatchPanel: React.FC = () => {
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const [results, setResults] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fetchingResults = useRef<Set<number>>(new Set());
  const jobIdRef = useRef<string | null>(null);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    const loaded = await Promise.all(
      images.map(async (f) => ({
        id: `${f.name}_${f.size}_${Math.random().toString(36).slice(2, 8)}`,
        name: f.name,
        dataUrl: await readFileAsDataUrl(f),
      })),
    );
    setPhotos((prev) => [...prev, ...loaded].slice(0, MAX_PHOTOS));
  }, []);

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Pull processed results into the gallery as each photo lands.
  const collectResults = useCallback((jobId: string, metas: BatchPhotoMeta[]) => {
    for (const m of metas) {
      if (!m.has_result || fetchingResults.current.has(m.index)) continue;
      fetchingResults.current.add(m.index);
      fetchPhotoResult(jobId, m.index)
        .then((b64) => {
          if (b64) setResults((prev) => ({ ...prev, [m.index]: b64 }));
        })
        .catch(() => fetchingResults.current.delete(m.index));
    }
  }, []);

  const process = useCallback(async () => {
    if (!photos.length || phase === "running") return;
    setPhase("running");
    setError(null);
    setStatus(null);
    setResults({});
    fetchingResults.current = new Set();
    setUploadMsg(`Uploading 0/${photos.length}...`);
    try {
      const final = await runBatch(
        photos.map((p) => p.dataUrl),
        {
          onUploadProgress: (n, total) => {
            setUploadMsg(n < total ? `Uploading ${n}/${total}...` : null);
          },
          onStatus: (s) => {
            jobIdRef.current = s.jobId;
            setUploadMsg(null);
            setStatus(s);
            collectResults(s.jobId, s.photos);
          },
        },
      );
      jobIdRef.current = final.jobId;
      setStatus(final);
      collectResults(final.jobId, final.photos);
      writeLastBatchSummary(final);
      if (final.status === "failed") {
        setPhase("error");
        setError(final.error || "batch failed");
      } else {
        setPhase("done");
      }
    } catch (e: any) {
      setPhase("error");
      setError(e?.message || "something went wrong");
    }
  }, [photos, phase, collectResults]);

  const copyAll = useCallback(async () => {
    const lc = status?.listing_copy;
    if (!lc) return;
    const text = [
      lc.headline,
      "",
      lc.description,
      "",
      lc.social_caption,
      "",
      (lc.hashtags || []).join(" "),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [status]);

  useEffect(() => {
    return () => {
      fetchingResults.current = new Set();
    };
  }, []);

  const downloadResult = useCallback(
    (index: number, meta?: BatchPhotoMeta) => {
      const b64 = results[index];
      if (!b64) return;
      const room = (meta?.room || "photo").toLowerCase().replace(/\s+/g, "_");
      saveAs(
        dataUrlToBlob(b64),
        `${String(index + 1).padStart(3, "0")}_${room}_staged.jpg`,
      );
    },
    [results],
  );

  const running = phase === "running";
  const progress = status?.progress;
  const totalDone = (progress?.completed || 0) + (progress?.failed || 0);
  const total = progress?.total || photos.length || 1;
  const pct = running || phase === "done" ? Math.round((totalDone / total) * 100) : 0;
  const stepLabel = uploadMsg || progress?.current_step || "Starting...";
  const lc = status?.listing_copy;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 text-white">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Batch pipeline</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Upload up to {MAX_PHOTOS} listing photos. Each room is detected
          automatically, edited with the right tool, and your listing copy is
          written at the end.
        </p>
      </div>

      {/* Upload area */}
      {phase === "idle" && (
        <>
          <div
            className={`rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200 ${
              dragOver
                ? "border-[#0A84FF] bg-[#0A84FF]/5"
                : "border-zinc-700 bg-zinc-900"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void addFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="mx-auto mb-3 h-8 w-8 text-zinc-500" />
            <p className="text-sm text-zinc-300">
              Drag and drop listing photos here
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              JPG or PNG, 1 to {MAX_PHOTOS} photos
            </p>
            <button
              className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white transition-all duration-200 hover:bg-zinc-700"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {photos.length > 0 && (
            <>
              <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {photos.map((p, i) => (
                  <div key={p.id} className="group relative">
                    <img
                      src={p.dataUrl}
                      alt={p.name}
                      className="aspect-square w-full rounded-lg border border-zinc-700 object-cover"
                    />
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-2xs text-zinc-300">
                      {i + 1}
                    </span>
                    <button
                      aria-label={`Remove ${p.name}`}
                      className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-zinc-800 p-1 text-zinc-300 shadow group-hover:block hover:bg-[#FF375F] hover:text-white"
                      onClick={() => removePhoto(p.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="mt-6 flex items-center gap-2 rounded-lg bg-[#0A84FF] px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-[#0A84FF]/85"
                onClick={() => void process()}
              >
                <Upload className="h-4 w-4" />
                Process {photos.length} photo{photos.length === 1 ? "" : "s"}
              </button>
            </>
          )}
        </>
      )}

      {/* Progress */}
      {(running || phase === "done" || phase === "error") && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5">
          <div className="flex items-center gap-2 text-sm">
            {running && (
              <Loader2 className="h-4 w-4 animate-spin text-[#0A84FF]" />
            )}
            {phase === "done" && (
              <CheckCircle className="h-4 w-4 text-[#30D158]" />
            )}
            {phase === "error" && (
              <AlertCircle className="h-4 w-4 text-[#FF375F]" />
            )}
            <span className="text-zinc-200">
              {phase === "done"
                ? `Done: ${progress?.completed || 0} processed${progress?.failed ? `, ${progress.failed} failed` : ""}`
                : phase === "error"
                  ? "Batch failed"
                  : stepLabel}
            </span>
            {(running || phase === "done") && (
              <span className="ml-auto text-xs text-zinc-500">
                {totalDone}/{total}
              </span>
            )}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-[#0A84FF] transition-all duration-200"
              style={{ width: `${phase === "done" ? 100 : pct}%` }}
            />
          </div>
          {error && (
            <p className="mt-3 flex items-start gap-2 text-sm text-[#FF375F]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          {phase !== "idle" && !running && (
            <button
              className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white transition-all duration-200 hover:bg-zinc-700"
              onClick={() => {
                setPhase("idle");
                setStatus(null);
                setResults({});
                setError(null);
                setPhotos([]);
              }}
            >
              Start a new batch
            </button>
          )}
        </div>
      )}

      {/* Results gallery */}
      {status && status.photos.length > 0 && phase !== "idle" && (
        <div className="mt-6 space-y-4">
          {status.photos.map((m) => (
            <div
              key={m.index}
              className="rounded-xl border border-zinc-700 bg-zinc-900 p-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-zinc-200">
                  Photo {m.index + 1}
                </span>
                {m.room && (
                  <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-300">
                    {m.room}
                  </span>
                )}
                {m.tool && (
                  <span className="rounded-full bg-[#0A84FF]/15 px-2.5 py-0.5 text-xs text-[#0A84FF]">
                    {TOOL_LABEL[m.tool] || m.tool}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1 text-xs">
                  {m.status === "completed" && (
                    <>
                      <CheckCircle className="h-3.5 w-3.5 text-[#30D158]" />
                      <span className="text-[#30D158]">Done</span>
                    </>
                  )}
                  {m.status === "failed" && (
                    <>
                      <AlertCircle className="h-3.5 w-3.5 text-[#FF375F]" />
                      <span className="text-[#FF375F]">{m.error || "Failed"}</span>
                    </>
                  )}
                  {m.status === "processing" && (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0A84FF]" />
                      <span className="text-zinc-400">Processing</span>
                    </>
                  )}
                  {m.status === "queued" && (
                    <span className="text-zinc-500">Queued</span>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-2xs uppercase tracking-wide text-zinc-500">
                    Before
                  </p>
                  {photos[m.index] ? (
                    <img
                      src={photos[m.index].dataUrl}
                      alt={`Photo ${m.index + 1} before`}
                      className="w-full rounded-lg border border-zinc-800 object-cover"
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded-lg border border-zinc-800 text-xs text-zinc-600">
                      Original
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-2xs uppercase tracking-wide text-zinc-500">
                    After
                  </p>
                  {results[m.index] ? (
                    <div className="relative">
                      <img
                        src={results[m.index]}
                        alt={`Photo ${m.index + 1} after`}
                        className="w-full rounded-lg border border-zinc-800 object-cover"
                      />
                      <button
                        className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-xs text-white backdrop-blur transition-all duration-200 hover:bg-black/90"
                        onClick={() => downloadResult(m.index, m)}
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </button>
                    </div>
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded-lg border border-zinc-800 text-xs text-zinc-600">
                      {m.status === "failed" ? "No result" : "Waiting..."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Listing copy */}
      {lc && (
        <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">
              Listing copy
            </h2>
            <button
              className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-white transition-all duration-200 hover:bg-zinc-700"
              onClick={() => void copyAll()}
            >
              {copied ? (
                <CheckCircle className="h-3.5 w-3.5 text-[#30D158]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy all"}
            </button>
          </div>
          <div className="space-y-4 text-sm">
            <div>
              <p className="mb-1 text-2xs uppercase tracking-wide text-zinc-500">
                Headline
              </p>
              <p className="text-zinc-100">{lc.headline}</p>
            </div>
            <div>
              <p className="mb-1 text-2xs uppercase tracking-wide text-zinc-500">
                Description
              </p>
              <p className="whitespace-pre-line leading-relaxed text-zinc-300">
                {lc.description}
              </p>
            </div>
            <div>
              <p className="mb-1 text-2xs uppercase tracking-wide text-zinc-500">
                Social caption
              </p>
              <p className="text-zinc-300">{lc.social_caption}</p>
            </div>
            {lc.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lc.hashtags.map((h) => (
                  <span
                    key={h}
                    className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-[#0A84FF]"
                  >
                    {h}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ListingBatchPanel;
