import React, { useEffect, useState } from "react";
import { Icon } from "./icons";
import { WHATS_NEW, COMING_SOON, markWhatsNewSeen } from "./whatsNew";

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
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">(
    "idle",
  );

  useEffect(() => {
    if (open) markWhatsNewSeen();
  }, [open]);

  if (!open) return null;

  const handleSend = async () => {
    const message = suggestion.trim();
    if (!message || sendState === "sending") return;
    setSendState("sending");
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          email: userEmail || null,
          name: userName || null,
          source: "whats-new",
        }),
      });
    } catch {
      // Suggestion boxes shouldn't error at the user — worst case we lose
      // one note; the server already fails soft the same way.
    }
    setSuggestion("");
    setSendState("sent");
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
              <button
                className="v-btn v-btn--primary v-btn--sm"
                onClick={handleSend}
                disabled={!suggestion.trim() || sendState === "sending"}
                style={{ opacity: suggestion.trim() ? 1 : 0.5 }}
              >
                {sendState === "sending" ? "Sending…" : "Send suggestion"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VellumWhatsNew;
