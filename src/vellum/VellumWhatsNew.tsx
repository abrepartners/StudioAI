import React, { useEffect, useState } from "react";
import { Icon } from "./icons";
import { WHATS_NEW, COMING_SOON } from "./whatsNew";

// Downscale an attached screenshot before upload. A raw screenshot is often
// several MB; a 1600px JPEG keeps it well under the endpoint's 6MB cap and
// Vercel's request-body limit, and it's plenty to see what the user means.
async function downscaleImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode failed"));
    i.src = dataUrl;
  });
  const max = 1600;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

const CATEGORIES: ReadonlyArray<{
  key: "idea" | "bug" | "love";
  label: string;
}> = [
  { key: "idea", label: "Idea" },
  { key: "bug", label: "Bug" },
  { key: "love", label: "Love it" },
];

interface WhatsNewModalProps {
  open: boolean;
  onClose: () => void;
  userEmail?: string;
  userName?: string;
}

const VellumWhatsNew: React.FC<WhatsNewModalProps> = ({
  open,
  onClose,
  userEmail,
  userName,
}) => {
  const [suggestion, setSuggestion] = useState("");
  const [category, setCategory] = useState<"idea" | "bug" | "love">("idea");
  const [photo, setPhoto] = useState<string | null>(null); // downscaled data URL
  const [sendState, setSendState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  // Re-arm the form each time the panel opens — the component stays mounted
  // with open=false, so without this a "sent" from earlier in the session
  // would lock out a second suggestion.
  useEffect(() => {
    if (open) {
      setSendState("idle");
      setPhoto(null);
      setCategory("idea");
    }
  }, [open]);

  if (!open) return null;

  const handleSend = async () => {
    const message = suggestion.trim();
    if (!message || sendState === "sending") return;
    setSendState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          email: userEmail || null,
          name: userName || null,
          category,
          imageBase64: photo,
          source: "whats-new",
        }),
      });
      if (!res.ok) throw new Error(`feedback ${res.status}`);
      setSuggestion("");
      setSendState("sent");
    } catch {
      // Keep the text so the agent can retry — clearing it would destroy
      // their note on a flaky connection.
      setSendState("error");
    }
  };

  return (
    <div className="v-modal-shade" onClick={onClose}>
      <div
        className="v-modal v-wn-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520 }}
      >
        <button className="v-modal-close" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
        <div className="v-modal-eyebrow">What's new</div>
        <div className="v-modal-title">
          Always <em>improving.</em>
        </div>

        <div className="v-wn-list">
          {WHATS_NEW.map((entry) => (
            <div className="v-wn-entry" key={entry.id}>
              <div className="v-wn-date">{entry.date}</div>
              <div className="v-wn-entry-title">{entry.title}</div>
              <p className="v-wn-entry-body">{entry.body}</p>
            </div>
          ))}
        </div>

        {COMING_SOON.length > 0 && (
          <div className="v-wn-soon">
            <div className="v-wn-soon-label">In the works</div>
            <ul>
              {COMING_SOON.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="v-wn-suggest">
          <div className="v-wn-soon-label">Want something?</div>
          {sendState === "sent" ? (
            <p className="v-wn-sent">
              Got it — thank you. We read every suggestion.
            </p>
          ) : (
            <>
              <textarea
                className="v-set-input v-wn-textarea"
                placeholder="Tell us what would make Vellum better for you…"
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                rows={3}
              />
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginTop: 8,
                  flexWrap: "wrap",
                }}
              >
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={"v-seg-btn" + (category === c.key ? " on" : "")}
                    onClick={() => setCategory(c.key)}
                    style={{ fontSize: 12, padding: "4px 12px" }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <label
                style={{
                  display: "inline-block",
                  marginTop: 10,
                  fontSize: 12,
                  color: "var(--graphite)",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      setPhoto(await downscaleImage(f));
                    } catch {
                      setPhoto(null);
                    }
                  }}
                />
                {photo
                  ? "Screenshot attached"
                  : "Attach a screenshot (optional)"}
              </label>
              {photo && (
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <img
                    src={photo}
                    alt="attached screenshot"
                    style={{
                      maxHeight: 88,
                      maxWidth: "60%",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    style={{
                      fontSize: 11,
                      color: "var(--graphite)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
              <button
                className="v-btn v-btn--primary v-btn--sm"
                onClick={handleSend}
                disabled={!suggestion.trim() || sendState === "sending"}
                style={{ opacity: suggestion.trim() ? 1 : 0.5, marginTop: 12 }}
              >
                {sendState === "sending"
                  ? "Sending…"
                  : sendState === "error"
                    ? "Try again"
                    : "Send suggestion"}
              </button>
              {sendState === "error" && (
                <p className="v-wn-error">
                  Couldn't send — check your connection and try again. Your note
                  is still here.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VellumWhatsNew;
