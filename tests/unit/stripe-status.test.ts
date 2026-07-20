import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// stripe-status.ts captures env at module load, so set it before importing.
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.SUPABASE_URL = "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "dummy_service_key";
process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.VITE_GOOGLE_CLIENT_ID = "test-client-id";
process.env.AUTH_ENFORCE = "enforce";

const handler = (await import("../../api/stripe-status")).default;

function jsonRes(body: any, ok = true) {
  return { ok, json: async () => body };
}

// Minimal Vercel `res` mock matching api/utils.ts json(): status().setHeader(),
// then send(string).
function makeRes() {
  const res: any = { _status: 0, _body: "", _headers: {} };
  res.status = (s: number) => {
    res._status = s;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res._headers[k] = v;
    return res;
  };
  res.send = (b: string) => {
    res._body = b;
    return res;
  };
  res.end = () => res;
  return res;
}

async function signedCookieFor(email: string): Promise<string> {
  const { signSession } = await import("../../api/_lib/session");
  const token = await signSession({ email, sub: `sub-${email}` });
  return `studioai_session=${token}`;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("stripe-status — free-gens counter is read by google_id (regression)", () => {
  // Regression lock for the credits-reset bug: the counter row is created and
  // maintained by reserve_generation keyed on google_id (the table's unique
  // key). Reading the display by email — which is NOT unique and may be absent
  // — is what made the count read 0 and reset the "5 free" on every reload.
  it("queries users by google_id, never email, and returns the persisted count", async () => {
    const userTableUrls: string[] = [];
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/customers/search")) return jsonRes({ data: [] }) as any; // free: no Stripe customer
      if (u.includes("/rest/v1/brokerage_agents")) return jsonRes([]) as any; // not a brokerage agent
      if (u.includes("/rest/v1/users")) {
        userTableUrls.push(u);
        if (u.includes("select=credits"))
          return jsonRes([{ credits: 0 }]) as any;
        if (u.includes("select=lifetime_free_gens_used"))
          return jsonRes([{ lifetime_free_gens_used: 3 }]) as any;
        return jsonRes([]) as any;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as any;

    const req: any = {
      method: "GET",
      headers: { cookie: await signedCookieFor("user@example.com") },
      query: { email: "user@example.com", google_id: "g-abc-123" },
    };
    const res = makeRes();
    await handler(req, res);

    // Every users-table read must be keyed by google_id, never by email.
    expect(userTableUrls.length).toBeGreaterThan(0);
    for (const u of userTableUrls) {
      expect(u).toContain("google_id=eq.g-abc-123");
      expect(u).not.toContain("email=eq.");
    }

    const body = JSON.parse(res._body);
    expect(body.ok).toBe(true);
    expect(body.lifetimeFreeGensUsed).toBe(3);
    expect(body.generationsUsed).toBe(3); // within the 5-lifetime cap
  });
});
