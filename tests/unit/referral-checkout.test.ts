import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.SUPABASE_URL = "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "dummy_service_key";
process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.VITE_GOOGLE_CLIENT_ID = "test-client-id";
process.env.AUTH_ENFORCE = "enforce";

const handler = (await import("../../api/referral")).default;

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

type MockOpts = {
  referrals?: any[];
  referralCodes?: any[];
};

function installStripeMock(opts: MockOpts = {}) {
  const referrals = opts.referrals ?? [];
  const referralCodes = opts.referralCodes ?? [];
  const createdPrices: URLSearchParams[] = [];

  const fetchSpy = vi.fn(async (url: any, init: any = {}) => {
    const u = String(url);

    if (u.includes("/v1/customers/search")) {
      return {
        ok: true,
        json: async () => ({ data: [{ id: "cus_123" }] }),
      } as any;
    }
    if (u.includes("/v1/subscriptions")) {
      return { ok: true, json: async () => ({ data: [] }) } as any;
    }
    if (u.includes("/v1/products/search")) {
      return { ok: true, json: async () => ({ data: [] }) } as any;
    }
    if (u.includes("/rest/v1/referrals")) {
      return { ok: true, text: async () => JSON.stringify(referrals) } as any;
    }
    if (u.includes("/rest/v1/referral_codes")) {
      return {
        ok: true,
        text: async () => JSON.stringify(referralCodes),
      } as any;
    }
    if (u.includes("/v1/prices")) {
      const params = new URLSearchParams(String(init.body || ""));
      createdPrices.push(params);
      return {
        ok: true,
        json: async () => ({ id: `price_${createdPrices.length}` }),
      } as any;
    }
    if (u.includes("/v1/products")) {
      return { ok: true, json: async () => ({ id: "prod_123" }) } as any;
    }
    if (u.includes("/checkout/sessions")) {
      return {
        ok: true,
        json: async () => ({
          url: "https://checkout.stripe.com/xyz",
          id: "cs_test_1",
        }),
      } as any;
    }
    throw new Error(`unexpected fetch: ${u}`);
  });

  global.fetch = fetchSpy as any;
  return { fetchSpy, createdPrices };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("referral checkout pricing is server-derived", () => {
  it("ignores a client-supplied price and charges the Pro catalog rate", async () => {
    const { createdPrices } = installStripeMock({ referrals: [] });

    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("buyer@example.com") },
        body: {
          action: "checkout",
          email: "buyer@example.com",
          userId: "u1",
          price: 1,
        },
      },
      res,
    );

    expect(res._status).not.toBe(500);
    const amounts = createdPrices.map((p) => p.get("unit_amount"));
    expect(amounts).not.toContain("1");
    expect(amounts).toContain("5900");
  });

  it("honors a referred user's server-side discount price", async () => {
    const { createdPrices } = installStripeMock({
      referrals: [{ referral_code_id: "rc1" }],
      referralCodes: [{ discount_price: 1400 }],
    });

    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("referred@example.com") },
        body: {
          action: "checkout",
          email: "referred@example.com",
          userId: "u2",
        },
      },
      res,
    );

    expect(res._status).not.toBe(500);
    const amounts = createdPrices.map((p) => p.get("unit_amount"));
    expect(amounts).toContain("1400");
  });

  it("refuses anonymous checkout with 401 and never calls Stripe", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          action: "checkout",
          email: "victim@example.com",
          userId: "u3",
          price: 1,
        },
      },
      res,
    );

    expect(res._status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
