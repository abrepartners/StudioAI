/**
 * components/ClientOnboardingFlow.tsx — first-run "see what StudioAI can do."
 *
 * Replaces the dead empty state on the Vellum dashboard: a new agent drops in
 * ONE photo, we auto-detect the room (moondream via /api/classify-room), run
 * the matching tool (stage / declutter / sky), and show the result next to a
 * sample listing headline. The closing CTA routes into the batch pipeline.
 *
 * Rendered inside .vellum, so it uses Vellum's CSS variables and v- classes
 * (dark editorial theme), not the legacy Tailwind zinc palette.
 */
import React, { useCallback, useRef, useState } from "react";
import {
  Upload,
  CheckCircle,
  Sparkles,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { classifyRoom } from "../services/classifyRoomService";
import { fluxStaging } from "../services/stagingService";
import { fluxCleanup } from "../services/fluxService";
import { nanoSky } from "../services/skyService";

type Step =
  | "upload"
  | "classifying"
  | "classified"
  | "processing"
  | "complete"
  | "error";

interface Classification {
  location: "interior" | "exterior";
  room: string;
  empty: boolean;
}

interface OnboardListingCopy {
  headline: string;
  description: string;
}

const STEP_ORDER: Step[] = ["upload", "classified", "processing", "complete"];

/** Which dot (0-3) is current for the step indicator. */
function stepDot(step: Step): number {
  if (step === "upload") return 0;
  if (step === "classifying" || step === "classified") return 1;
  if (step === "processing") return 2;
  if (step === "complete") return 3;
  return 0;
}

const STAGING_PROMPT =
  "Add tasteful, modern furniture to this room to virtually stage it. Make the room feel lived-in and welcoming. Keep the exact same architecture, lighting, and color palette. Photorealistic, natural lighting.";

const ClientOnboardingFlow: React.FC<{ setPage: (p: string) => void }> = ({
  setPage,
}) => {
  const [step, setStep] = useState<Step>("upload");
  const [photo, setPhoto] = useState<string | null>(null);
  const [classification, setClassification] = useState<Classification | null>(
    null,
  );
  const [result, setResult] = useState<string | null>(null);
  const [listingCopy, setListingCopy] = useState<OnboardListingCopy | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = String(e.target?.result || "");
      if (!b64) return;
      setPhoto(b64);
      setStep("classifying");
      try {
        const cls = await classifyRoom(b64);
        setClassification({
          location: cls.location,
          room: cls.room,
          empty: cls.empty,
        });
        setStep("classified");
      } catch (err: any) {
        setError(err?.message || "Classification failed");
        setStep("error");
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const runTool = useCallback(async () => {
    if (!photo || !classification) return;
    setStep("processing");
    setError(null);
    try {
      let resultB64: string;
      if (classification.location === "exterior") {
        resultB64 = (await nanoSky(photo, "blue")).resultBase64;
      } else if (classification.empty) {
        resultB64 = (await fluxStaging(photo, STAGING_PROMPT)).resultBase64;
      } else {
        resultB64 = (await fluxCleanup(photo, classification.room))
          .resultBase64;
      }
      setResult(resultB64);
      // Sample listing copy is garnish: never fail the demo over it.
      try {
        const copyRes = await fetch("/api/listing-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rooms: `${classification.room} (${classification.location})`,
          }),
        });
        const copyData = await copyRes.json();
        if (copyData.ok && copyData.listing_copy)
          setListingCopy(copyData.listing_copy);
      } catch {
        /* copy is optional */
      }
      setStep("complete");
    } catch (err: any) {
      setError(err?.message || "Processing failed");
      setStep("error");
    }
  }, [photo, classification]);

  const reset = useCallback(() => {
    setStep("upload");
    setPhoto(null);
    setClassification(null);
    setResult(null);
    setListingCopy(null);
    setError(null);
    setShowOriginal(false);
  }, []);

  const planLabel = classification
    ? classification.location === "exterior"
      ? "enhance the exterior with a clean blue sky"
      : classification.empty
        ? "virtually stage this room"
        : "declutter and clean up this space"
    : "";

  return (
    <div className="v-kpi" style={{ padding: 32, maxWidth: 600, margin: "0 auto" }}>
      {/* Step indicator */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 24,
          justifyContent: "center",
        }}
      >
        {STEP_ORDER.map((s, i) => {
          const current = stepDot(step);
          return (
            <div
              key={s}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                background:
                  i < current
                    ? "var(--pale-gold)"
                    : i === current
                      ? "var(--soft-stone)"
                      : "transparent",
                border: "1px solid var(--soft-stone)",
                color: i < current ? "var(--accent-ink, #161616)" : "var(--graphite)",
              }}
            >
              {i + 1}
            </div>
          );
        })}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div style={{ textAlign: "center" }}>
          <Sparkles
            size={36}
            style={{ color: "var(--pale-gold)", margin: "0 auto 12px" }}
          />
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 24,
              fontWeight: 600,
              marginBottom: 8,
              color: "var(--deep-charcoal)",
            }}
          >
            See what StudioAI can do
          </h2>
          <p
            style={{
              color: "var(--graphite)",
              fontSize: 14,
              marginBottom: 24,
              lineHeight: 1.5,
            }}
          >
            Upload one photo from your current listing. We will detect the
            room, enhance it with AI, and write a sample MLS headline.
          </p>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            style={{
              border: `2px dashed ${dragOver ? "var(--pale-gold)" : "var(--soft-stone)"}`,
              borderRadius: 12,
              padding: 40,
              cursor: "pointer",
              transition: "border-color 0.2s",
              marginBottom: 16,
            }}
          >
            <Upload
              size={30}
              style={{ color: "var(--graphite)", margin: "0 auto 8px" }}
            />
            <p style={{ fontSize: 14, color: "var(--graphite)" }}>
              Drop a photo here or click to browse
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* Step 2: Classifying */}
      {step === "classifying" && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Loader2
            size={30}
            className="animate-spin"
            style={{ color: "var(--pale-gold)", margin: "0 auto 16px" }}
          />
          <p style={{ fontSize: 14, color: "var(--graphite)" }}>
            Analyzing your photo...
          </p>
        </div>
      )}

      {/* Step 3: Classified — show the plan */}
      {step === "classified" && classification && (
        <div style={{ textAlign: "center" }}>
          {photo && (
            <img
              src={photo}
              alt="Your listing photo"
              style={{
                width: "100%",
                height: 200,
                objectFit: "cover",
                borderRadius: 8,
                marginBottom: 16,
              }}
            />
          )}
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            <span className="v-pill v-pill--gold">{classification.room}</span>
            <span className="v-pill v-pill--ghost">
              {classification.location}
            </span>
            <span className="v-pill v-pill--ghost">
              {classification.empty ? "Empty" : "Furnished"}
            </span>
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--graphite)",
              marginBottom: 20,
            }}
          >
            We will {planLabel}. One click, about a minute.
          </p>
          <button className="v-btn v-btn--primary" onClick={() => void runTool()}>
            <Sparkles size={13} /> Run it
          </button>
        </div>
      )}

      {/* Step 4: Processing */}
      {step === "processing" && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Loader2
            size={30}
            className="animate-spin"
            style={{ color: "var(--pale-gold)", margin: "0 auto 16px" }}
          />
          <p style={{ fontSize: 14, color: "var(--graphite)" }}>
            Enhancing your photo... this takes about a minute.
          </p>
        </div>
      )}

      {/* Step 5: Complete */}
      {step === "complete" && result && (
        <div>
          <div
            style={{ position: "relative", marginBottom: 16, cursor: "pointer" }}
            onClick={() => setShowOriginal((v) => !v)}
          >
            <img
              src={showOriginal ? photo || result : result}
              alt={showOriginal ? "Original photo" : "Enhanced photo"}
              style={{
                width: "100%",
                height: 280,
                objectFit: "cover",
                borderRadius: 8,
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 8,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0,0,0,0.7)",
                color: "#fff",
                fontSize: 11,
                padding: "4px 12px",
                borderRadius: 4,
                whiteSpace: "nowrap",
              }}
            >
              {showOriginal
                ? "Original — click to see result"
                : "After — click to see original"}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <span className="v-pill v-pill--ready">
              <CheckCircle size={12} /> Done
            </span>
          </div>
          {listingCopy && (
            <div
              style={{
                background: "var(--soft-stone)",
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  color: "var(--graphite)",
                  marginBottom: 4,
                }}
              >
                Sample headline
              </p>
              <p
                style={{
                  fontSize: 18,
                  fontFamily: "'Cormorant Garamond', serif",
                  fontWeight: 600,
                  marginBottom: 12,
                  color: "var(--deep-charcoal)",
                }}
              >
                {listingCopy.headline}
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--graphite)",
                  lineHeight: 1.5,
                }}
              >
                {listingCopy.description}
              </p>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="v-btn v-btn--secondary"
              style={{ flex: 1 }}
              onClick={reset}
            >
              Try another photo
            </button>
            <button
              className="v-btn v-btn--primary"
              style={{ flex: 1 }}
              onClick={() => setPage("batch")}
            >
              Process all photos <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {step === "error" && (
        <div style={{ textAlign: "center", padding: 20 }}>
          <p style={{ fontSize: 14, marginBottom: 12, color: "#FF375F" }}>
            {error || "Something went wrong."}
          </p>
          <button className="v-btn v-btn--primary" onClick={reset}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
};

export default ClientOnboardingFlow;
