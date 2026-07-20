import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.SUPABASE_URL = "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "dummy_service_key";
process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.VITE_GOOGLE_CLIENT_ID = "test-client-id";
process.env.AUTH_ENFORCE = "enforce";

const handler = (await import("../../api/brokerage")).default;

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

describe("brokerage authorization", () => {
  it("refuses an anonymous brokerage creation", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          action: "create",
          adminEmail: "attacker@example.com",
          name: "Free Co",
        },
      },
      res,
    );
    expect(res._status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses acting as a different admin", async () => {
    global.fetch = vi.fn() as any;
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("attacker@example.com") },
        body: {
          action: "remove_agent",
          adminEmail: "lawson@hdhomesar.com",
          agentEmail: "agent@x.com",
        },
      },
      res,
    );
    expect(res._status).toBe(403);
  });
});

describe("brokerage tier pricing", () => {
  it("never selects a Stripe price whose amount differs from the tier", async () => {
    const sessions: Record<string, string>[] = [];
    global.fetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      if (u.includes("/customers/search"))
        return {
          ok: true,
          json: async () => ({ data: [{ id: "cus_1" }] }),
        } as any;
      if (u.includes("/subscriptions?"))
        return { ok: true, json: async () => ({ data: [] }) } as any;
      if (u.includes("/products/search"))
        return {
          ok: true,
          json: async () => ({ data: [{ id: "prod_team" }] }),
        } as any;
      if (u.includes("/v1/prices?product=")) {
        // The live account's stale $119 price, which must NOT be chosen.
        return {
          ok: true,
          json: async () => ({
            data: [{ id: "price_119", unit_amount: 11900 }],
          }),
        } as any;
      }
      if (u.includes("/v1/prices"))
        return { ok: true, json: async () => ({ id: "price_149" }) } as any;
      if (u.includes("/checkout/sessions")) {
        sessions.push(
          Object.fromEntries(
            new URLSearchParams(String(init?.body || "")),
          ) as Record<string, string>,
        );
        return {
          ok: true,
          json: async () => ({ url: "https://stripe.test/x", id: "cs_1" }),
        } as any;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as any;

    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("admin@example.com") },
        body: {
          action: "checkout",
          adminEmail: "admin@example.com",
          tier: "team",
        },
      },
      res,
    );

    expect(sessions[0]?.["line_items[0][price]"]).toBe("price_149");
    expect(
      sessions[0]?.["subscription_data[metadata][studioai_plan]"],
    ).toBe("team");
  });
});
