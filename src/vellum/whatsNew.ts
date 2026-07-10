/**
 * What's New feed — hand-written, newest first. Add an entry when something
 * agent-visible ships; the panel and the unread dot key off WHATS_NEW[0].id,
 * so a new id at the top re-lights the dot for everyone.
 *
 * Keep entries in agent language (what they can do now), not commit language.
 */

export interface WhatsNewEntry {
  id: string;
  date: string; // human-readable, e.g. "June 2026"
  title: string;
  body: string;
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: "2026-07-magic-edit",
    date: "July 2026",
    title: "Magic edit: change anything with a sentence",
    body: "New Magic edit tool at the top of the editor. Type what you want, like \"remove the cars from the driveway\", \"add a fire in the fireplace\", or \"clean the dirt out of the pool\", and Vellum makes just that change on our best model. It's the catch-all for anything the preset tools don't cover.",
  },
  {
    id: "2026-06-mobile",
    date: "June 2026",
    title: "Vellum now feels right on your phone",
    body: "Full mobile pass: a navigation dock at the bottom of every page, editing tools in thumb reach, and fixes across billing, settings, and new-listing creation. Edit photos from the driveway.",
  },
  {
    id: "2026-06-replace-mode",
    date: "June 2026",
    title: "Restage furnished rooms",
    body: "Staging now handles rooms that already have furniture — the old set is removed and replaced in one step. No more empty-room-only staging.",
  },
  {
    id: "2026-06-staging-engine",
    date: "June 2026",
    title: "Sharper staging and cleanup",
    body: "Both virtual staging and declutter run on our newest image engine. Cleaner edges, better lighting, fewer do-overs.",
  },
];

export const COMING_SOON: string[] = [
  "Print flyers, open-house sheets & postcards",
  "AI listing descriptions in three tones",
  "One-tap social media packs",
];

export const LATEST_ID = WHATS_NEW[0]?.id ?? "";

const SEEN_KEY = "vellum_whatsnew_seen";

export const hasUnreadWhatsNew = (): boolean => {
  try {
    return localStorage.getItem(SEEN_KEY) !== LATEST_ID;
  } catch {
    return false;
  }
};

export const markWhatsNewSeen = (): void => {
  try {
    localStorage.setItem(SEEN_KEY, LATEST_ID);
  } catch {}
};
