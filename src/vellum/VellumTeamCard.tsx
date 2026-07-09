import React, { useState, useEffect, useCallback } from "react";
import { Icon } from "./icons";

interface Agent {
  id: string;
  email: string;
  name: string | null;
}
interface Brokerage {
  id: string;
  name: string;
  admin_email: string;
  max_seats: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  brokerage_agents: Agent[];
}

/**
 * Team / seat management for brokerage admins, rendered inside Vellum Settings.
 * Self-gating: it fetches the caller's brokerage and renders NOTHING unless the
 * signed-in email owns one (admin_email match), so solo agents never see it.
 * Reuses the same /api/brokerage endpoints as the legacy ManageTeam panel.
 */
const VellumTeamCard: React.FC<{ adminEmail: string }> = ({ adminEmail }) => {
  const [brokerage, setBrokerage] = useState<Brokerage | null>(null);
  const [checked, setChecked] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/brokerage?adminEmail=${encodeURIComponent(adminEmail)}`,
      );
      const data = await res.json();
      setBrokerage(data.ok && data.brokerage ? data.brokerage : null);
    } catch {
      setBrokerage(null);
    } finally {
      setChecked(true);
    }
  }, [adminEmail]);

  useEffect(() => {
    load();
  }, [load]);

  const addAgent = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/brokerage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail,
          action: "add_agent",
          agentEmail: email,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setNewEmail("");
        load();
      } else {
        setError(data.error || "Couldn't add that agent");
      }
    } catch {
      setError("Couldn't add that agent");
    } finally {
      setAdding(false);
    }
  };

  const removeAgent = async (agentEmail: string) => {
    setError("");
    try {
      const res = await fetch("/api/brokerage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail,
          action: "remove_agent",
          agentEmail,
        }),
      });
      const data = await res.json();
      if (data.ok) load();
      else setError(data.error || "Couldn't remove that agent");
    } catch {
      setError("Couldn't remove that agent");
    }
  };

  // Non-admins have no brokerage row → render nothing.
  if (!checked || !brokerage) return null;

  const agents = brokerage.brokerage_agents || [];
  const seatsUsed = agents.length;
  const seatsMax = brokerage.max_seats;
  const full = seatsUsed >= seatsMax;

  return (
    <div className="v-settings-card">
      <div className="v-gold-rule" />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>Team</h3>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--pale-gold)",
            border: "1px solid var(--pale-gold)",
            borderRadius: 999,
            padding: "3px 10px",
          }}
        >
          Admin
        </span>
      </div>
      <p className="v-muted" style={{ fontSize: 13, margin: "6px 0 18px" }}>
        {brokerage.name} · {seatsUsed}/{seatsMax} seats used. Agents you add get
        Vellum Pro on their next sign-in.
      </p>

      <div
        style={{
          height: 6,
          background: "var(--soft-stone)",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: `${Math.min((seatsUsed / seatsMax) * 100, 100)}%`,
            height: "100%",
            background: full ? "var(--state-error)" : "var(--pale-gold)",
            transition: "width 300ms ease",
          }}
        />
      </div>

      {!full ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: agents.length ? 16 : 0,
          }}
        >
          <input
            className="v-set-input"
            style={{ flex: 1 }}
            type="email"
            placeholder="agent@email.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addAgent();
            }}
          />
          <button
            className="v-btn v-btn--primary v-btn--sm"
            onClick={addAgent}
            disabled={!newEmail.trim() || adding}
          >
            {adding ? (
              "Adding…"
            ) : (
              <>
                <Icon name="plus" size={12} /> Add seat
              </>
            )}
          </button>
        </div>
      ) : (
        <p
          className="v-muted"
          style={{ fontSize: 12, marginBottom: agents.length ? 16 : 0 }}
        >
          All {seatsMax} seats are filled. Remove an agent to free a seat.
        </p>
      )}

      {error && (
        <p
          style={{
            fontSize: 12,
            color: "var(--state-error)",
            marginBottom: 12,
          }}
        >
          {error}
        </p>
      )}

      {agents.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {agents.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "9px 12px",
                borderRadius: 8,
                background: "var(--background-elevated)",
                border: "1px solid var(--border-light)",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: "var(--warm-ivory)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {a.email}
              </span>
              <button
                className="v-btn v-btn--ghost v-btn--sm"
                onClick={() => removeAgent(a.email)}
                title="Remove agent"
                style={{ flexShrink: 0 }}
              >
                <Icon name="x" size={12} /> Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VellumTeamCard;
