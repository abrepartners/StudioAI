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

const AUTH_STORAGE_KEY = 'studioai_google_user';

export function readGoogleUser(): GoogleUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.email === 'string' && typeof parsed.sub === 'string') {
      return parsed as GoogleUser;
    }
    return null;
  } catch {
    return null;
  }
}

export function isAdmin(user: GoogleUser | null): boolean {
  return !!user && user.email.endsWith('@averyandbryant.com');
}
