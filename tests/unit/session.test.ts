import { describe, it, expect } from "vitest";

// session.ts captures SESSION_SECRET at module load, so the env must be set
// BEFORE the module is imported. Static ESM imports are hoisted, so we use a
// dynamic import that runs after these assignments.
process.env.SESSION_SECRET = "test-secret-32-chars-minimum-xxxxx";

const session = await import("../../api/_lib/session");
const {
  readSessionCookie,
  sessionCookieHeader,
  clearSessionCookieHeader,
  signSession,
  verifySession,
  SESSION_COOKIE,
} = session;

describe("readSessionCookie", () => {
  it("extracts the session token from a multi-cookie header", () => {
    const req = { headers: { cookie: "studioai_session=abc; other=1" } };
    expect(readSessionCookie(req)).toBe("abc");
  });

  it("returns the token regardless of cookie order and whitespace", () => {
    const req = { headers: { cookie: "other=1; studioai_session=xyz " } };
    expect(readSessionCookie(req)).toBe("xyz");
  });

  it("returns empty string when the session cookie is absent", () => {
    const req = { headers: { cookie: "other=1; foo=bar" } };
    expect(readSessionCookie(req)).toBe("");
  });

  it("returns empty string when there is no cookie header", () => {
    expect(readSessionCookie({ headers: {} })).toBe("");
    expect(readSessionCookie({})).toBe("");
  });

  it("uses the exported SESSION_COOKIE name", () => {
    const req = { headers: { cookie: `${SESSION_COOKIE}=tok123` } };
    expect(readSessionCookie(req)).toBe("tok123");
  });
});

describe("sessionCookieHeader", () => {
  const header = sessionCookieHeader("some-token");

  it("includes the token", () => {
    expect(header).toContain("studioai_session=some-token");
  });

  it("is HttpOnly, SameSite=Lax, Path=/, with a Max-Age", () => {
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).toContain("Max-Age=");
  });
});

describe("clearSessionCookieHeader", () => {
  const header = clearSessionCookieHeader();

  it("expires the cookie with Max-Age=0", () => {
    expect(header).toContain("Max-Age=0");
  });

  it("keeps the same attributes so the cookie is actually cleared", () => {
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
  });
});

describe("signSession / verifySession round-trip", () => {
  it("preserves email and sub through sign then verify", async () => {
    const token = await signSession({
      email: "agent@example.com",
      sub: "google-sub-123",
    });
    expect(typeof token).toBe("string");
    const claims = await verifySession(token);
    expect(claims).not.toBeNull();
    expect(claims?.email).toBe("agent@example.com");
    expect(claims?.sub).toBe("google-sub-123");
  });

  it("returns null for a garbage token", async () => {
    expect(await verifySession("garbage")).toBeNull();
  });

  it("returns null for an empty token", async () => {
    expect(await verifySession("")).toBeNull();
  });
});
