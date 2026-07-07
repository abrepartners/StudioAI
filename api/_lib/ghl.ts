/**
 * api/_lib/ghl.ts — server-only bridge that lands StudioAI signups in GoHighLevel.
 *
 * On a NEW StudioAI signup we upsert the user into Thomas's StudioAI GHL
 * sub-account as a contact and tag them. A GHL workflow (trigger: contact
 * tagged `studioai-signup`) authors and sends the welcome email and runs the
 * free-to-paid nurture. This module does NOT send email; it only gets the
 * contact + tag into GHL so the CRM side does the rest.
 *
 * Server-only: the Private Integration Token lives in Vercel env and must never
 * reach the browser bundle (same rule that purged the browser-side AI keys).
 *
 * Fails open, like the app's other optional gates (Supabase in track-login,
 * Gemini in orientation-judge): if the token is unset, or the call errors, we
 * log and no-op. Pushing a contact must never throw and never block login.
 *
 * Nothing runs until Thomas sets GHL_STUDIOAI_PIT (a Private Integration Token
 * for location mgMzXq5iQ4wD2Hqeuv5A) in Vercel. Until then every call is a
 * no-op.
 */

// Accept the StudioAI-specific token first, fall back to a generic GHL PIT.
const GHL_PIT = process.env.GHL_STUDIOAI_PIT || process.env.GHL_PIT || "";
// The StudioAI GHL sub-account. Overridable via env without a code change.
const GHL_LOCATION_ID =
  process.env.GHL_STUDIOAI_LOCATION_ID || "mgMzXq5iQ4wD2Hqeuv5A";
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

/** Tag that fires the GHL welcome + nurture workflow. */
export const STUDIOAI_SIGNUP_TAG = "studioai-signup";
/** Tier tag — new signups start on the free tier. */
export const STUDIOAI_FREE_TAG = "studioai-free";

/** True only when the GHL integration is configured. */
export function ghlEnabled(): boolean {
  return Boolean(GHL_PIT);
}

export interface GhlUpsertResult {
  ok: boolean;
  skipped?: boolean;
  contactId?: string;
  isNew?: boolean;
  error?: string;
}

/** Derive a first name from a full name when one is not supplied. */
function deriveFirstName(name?: string | null): string | undefined {
  const first = (name || "").trim().split(/\s+/)[0] || "";
  return first || undefined;
}

/**
 * Upsert a contact into the StudioAI GHL location and apply tags. Never throws.
 * - Token unset: logs and returns { ok:false, skipped:true }.
 * - API/network error: logs and returns { ok:false, error }.
 * - Success: returns { ok:true, contactId, isNew }.
 *
 * LeadConnector v2 POST /contacts/upsert matches on email within the location,
 * so calling this on every login is safe (it updates the existing contact); we
 * still gate the CALL to first-login only so the signup tag is applied once.
 */
export async function upsertContact(opts: {
  email: string;
  name?: string | null;
  firstName?: string | null;
  tags?: string[];
}): Promise<GhlUpsertResult> {
  if (!GHL_PIT) {
    console.warn(
      "[ghl] GHL_STUDIOAI_PIT unset — skipping contact push (no-op)",
    );
    return { ok: false, skipped: true };
  }
  try {
    const firstName =
      (opts.firstName || "").trim() || deriveFirstName(opts.name);
    const payload: Record<string, unknown> = {
      locationId: GHL_LOCATION_ID,
      email: opts.email.toLowerCase(),
    };
    if (opts.name) payload.name = opts.name;
    if (firstName) payload.firstName = firstName;
    if (opts.tags && opts.tags.length) payload.tags = opts.tags;

    const res = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GHL_PIT}`,
        Version: GHL_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[ghl] upsert failed ${res.status}: ${text.slice(0, 200)}`);
      return { ok: false, error: `status ${res.status}` };
    }

    const data: any = await res.json().catch(() => ({}));
    return {
      ok: true,
      contactId: data?.contact?.id,
      isNew: data?.new,
    };
  } catch (err: any) {
    console.warn(`[ghl] upsert threw (${err?.message}) — skipping`);
    return { ok: false, error: err?.message };
  }
}

/**
 * First-login helper: push a new StudioAI signup into GHL with the signup +
 * free-tier tags so the GHL welcome/nurture workflow takes over. Fire-and-forget
 * from the login path; never blocks the response.
 */
export async function pushSignupToGhl(opts: {
  email: string;
  name?: string | null;
  extraTags?: string[];
}): Promise<GhlUpsertResult> {
  const tags = [
    STUDIOAI_SIGNUP_TAG,
    STUDIOAI_FREE_TAG,
    ...(opts.extraTags || []),
  ];
  return upsertContact({ email: opts.email, name: opts.name, tags });
}
