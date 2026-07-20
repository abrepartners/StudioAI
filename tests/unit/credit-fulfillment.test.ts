import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.SUPABASE_URL = "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "dummy_service_key";
process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.VITE_GOOGLE_CLIENT_ID = "test-client-id";
process.env.AUTH_ENFORCE = "enforce";

const handler = (await import("../../api/stripe-checkout")).default;

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
  return `studioai_session=${await signSession({ email, sub: `sub-${email}` })}`;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("credit fulfillment idempotency", () => {
  it("grants once and refuses the replay without calling add_credits again", async () => {
    let claimed = false;
    const addCreditsCalls: string[] = [];

    global.fetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      if (u.includes("/checkout/sessions/")) {
        return {
          ok: true,
          json: async () => ({
            payment_status: "paid",
            amount_total: 1500,
            metadata: { credits: "10", email: "buyer@example.com" },
          }),
        } as any;
      }
      if (u.includes("/rest/v1/credit_fulfillments")) {
        if (claimed) {
          // Postgres unique violation on replay.
          return {
            ok: false,
            status: 409,
            text: async () => "duplicate key",
          } as any;
        }
        claimed = true;
        return { ok: true, status: 201, text: async () => "[]" } as any;
      }
      if (u.includes("/rpc/add_credits")) {
        addCreditsCalls.push(String(init?.body || ""));
        return { ok: true, json: async () => ({}) } as any;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as any;

    const cookie = await signedCookieFor("buyer@example.com");
    const req = () => ({
      method: "POST",
      headers: { cookie },
      body: {
        action: "fulfill",
        sessionId: "cs_test_replay",
        email: "buyer@example.com",
      },
    });

    const first = makeRes();
    await handler(req(), first);
    expect(first._status).toBe(200);
    expect(addCreditsCalls.length).toBe(1);

    const second = makeRes();
    await handler(req(), second);
    expect(JSON.parse(second._body).already_fulfilled).toBe(true);
    expect(addCreditsCalls.length).toBe(1); // still 1: no second grant
  });
});

describe("credit fulfillment failure recovery", () => {
  it("releases the claim and returns an error when add_credits fails", async () => {
    let claimed = false;
    let deleteCalls = 0;

    global.fetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      const method = String(init?.method || "GET").toUpperCase();

      if (u.includes("/checkout/sessions/")) {
        return {
          ok: true,
          json: async () => ({
            payment_status: "paid",
            amount_total: 1500,
            metadata: { credits: "10", email: "buyer@example.com" },
          }),
        } as any;
      }
      if (u.includes("/rest/v1/credit_fulfillments")) {
        if (method === "DELETE") {
          deleteCalls += 1;
          expect(u).toContain("stripe_session_id=eq.cs_test_fail");
          return { ok: true, status: 204, text: async () => "" } as any;
        }
        claimed = true;
        return { ok: true, status: 201, text: async () => "[]" } as any;
      }
      if (u.includes("/rpc/add_credits")) {
        return { ok: false, status: 500, text: async () => "db error" } as any;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as any;

    const cookie = await signedCookieFor("buyer@example.com");
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie },
        body: {
          action: "fulfill",
          sessionId: "cs_test_fail",
          email: "buyer@example.com",
        },
      },
      res,
    );

    expect(claimed).toBe(true);
    expect(res._status).toBe(500);
    const parsed = JSON.parse(res._body);
    expect(parsed.ok).toBe(false);
    expect(parsed.already_fulfilled).toBeUndefined();
    expect(deleteCalls).toBe(1);
  });
});
