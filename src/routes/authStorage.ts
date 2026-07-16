/**
 * authStorage.ts — shared auth probe for routes
 *
 * Reads the same localStorage entry App.tsx writes after Google sign-in,
 * so adjacent routes (settings, listings) don't need to re-run OAuth.
 * If App.tsx renames the key, keep this in sync.
 */

export interface GoogleUser {
  name: string;
  email: string;
  picture: string;
  sub: string;
}

const AUTH_STORAGE_KEY = "studioai_google_user";

export function readGoogleUser(): GoogleUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.email === "string" &&
      typeof parsed.sub === "string"
    ) {
      return parsed as GoogleUser;
    }
    return null;
  } catch {
    return null;
  }
}

export function isAdmin(user: GoogleUser | null): boolean {
  return !!user && user.email.endsWith("@averyandbryant.com");
}

/**
 * Resolve the signed-in user: localStorage first (instant), then the session
 * cookie via GET /api/session. The cookie is the durable signal — it survives a
 * localStorage wipe (managed/enterprise browser, Safari ITP, incognito, a
 * second device), so this is what lets a returning user back in WITHOUT
 * re-running Google sign-in. On a successful cookie restore we repopulate
 * localStorage so the rest of the app (which reads it synchronously) sees the
 * user. Returns null only when neither signal is present — a genuine sign-in.
 */
export async function restoreGoogleUser(): Promise<GoogleUser | null> {
  const local = readGoogleUser();
  if (local) return local;
  try {
    const r = await fetch("/api/session", {
      method: "GET",
      credentials: "include",
    });
    if (!r.ok) return null;
    const data = await r.json();
    const u = data?.user;
    if (u && typeof u.email === "string" && typeof u.sub === "string") {
      const user: GoogleUser = {
        name: u.name || "",
        email: u.email,
        picture: u.picture || "",
        sub: u.sub,
      };
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      } catch {
        /* ignore storage-write failures — the in-memory user still works */
      }
      return user;
    }
    return null;
  } catch {
    // Offline or no session — fall through to the sign-in gate.
    return null;
  }
}
