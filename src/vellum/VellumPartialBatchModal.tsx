/**
 * VellumPartialBatchModal.tsx — "use your last credits" picker.
 *
 * Shown when an Apply-all batch costs more than the balance but the balance is
 * still > 0. Instead of a hard paywall, the user PICKS which photos to spend
 * their remaining credits on (option B). Purely client-side UX: the server
 * already meters per photo, so this just stops the all-or-nothing block from
 * wasting a usable credit.
 */
import React, { useMemo, useState, useEffect } from "react";
import { Icon } from "./icons";

export interface PartialPhoto {
  id: number | string;
  dataUrl?: string;
  label?: string;
}

interface Props {
  open: boolean;
  photos: PartialPhoto[];
  credits: number;
  costOf: (p: PartialPhoto) => number;
  toolName: string;
  onClose: () => void;
  onConfirm: (ids: (number | string)[]) => void;
  onGetMore: () => void;
}

const VellumPartialBatchModal: React.FC<Props> = ({
  open,
  photos,
  credits,
  costOf,
  toolName,
  onClose,
  onConfirm,
  onGetMore,
}) => {
  // Greedy pre-selection: the first photos the balance covers.
  const preselect = useMemo(() => {
    const ids: (number | string)[] = [];
    let acc = 0;
    for (const p of photos) {
      const c = costOf(p);
      if (acc + c > credits) break;
      acc += c;
      ids.push(p.id);
    }
    return ids;
  }, [photos, credits, costOf]);

  const [sel, setSel] = useState<Set<number | string>>(
    () => new Set(preselect),
  );
  useEffect(() => {
    if (open) setSel(new Set(preselect));
  }, [open, preselect]);

  if (!open) return null;

  const selCost = photos
    .filter((p) => sel.has(p.id))
    .reduce((s, p) => s + costOf(p), 0);

  const toggle = (p: PartialPhoto) => {
    const next = new Set(sel);
    if (next.has(p.id)) next.delete(p.id);
    else {
      if (selCost + costOf(p) > credits) return; // can't afford more
      next.add(p.id);
    }
    setSel(next);
  };

  const n = sel.size;

  return (
    <div className="v-modal-shade" onClick={onClose}>
      <div
        className="v-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 540 }}
      >
        <button className="v-modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={14} />
        </button>

        <div className="v-modal-eyebrow">Use your remaining credits</div>
        <h2 className="v-modal-title">
          Pick what to <em>apply {toolName} to.</em>
        </h2>
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--graphite)",
            margin: "0 0 18px",
          }}
        >
          You have{" "}
          <strong>
            {credits} credit{credits !== 1 ? "s" : ""}
          </strong>{" "}
          left — enough for {credits} of these {photos.length} photos. Tap to
          choose which.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
            gap: 8,
            marginBottom: 20,
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {photos.map((p, i) => {
            const on = sel.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p)}
                title={p.label}
                style={{
                  position: "relative",
                  aspectRatio: "1",
                  borderRadius: 6,
                  overflow: "hidden",
                  padding: 0,
                  cursor: "pointer",
                  border: on
                    ? "2px solid var(--pale-gold)"
                    : "2px solid transparent",
                  backgroundImage: `url(${p.dataUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  opacity: on ? 1 : 0.5,
                  transition: "opacity 120ms, border-color 120ms",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    bottom: 2,
                    left: 4,
                    fontSize: 9,
                    fontWeight: 600,
                    color: "#fff",
                    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            paddingTop: 16,
            borderTop: "1px solid var(--soft-stone)",
          }}
        >
          <button className="v-btn v-btn--ghost v-btn--sm" onClick={onGetMore}>
            Get more credits
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="v-btn v-btn--ghost v-btn--sm" onClick={onClose}>
              Cancel
            </button>
            <button
              className="v-btn v-btn--primary v-btn--sm"
              disabled={n === 0}
              onClick={() => onConfirm([...sel])}
            >
              Apply to {n} — uses {selCost} credit{selCost !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VellumPartialBatchModal;
