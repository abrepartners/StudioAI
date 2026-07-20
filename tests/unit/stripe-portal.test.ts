import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.VITE_GOOGLE_CLIENT_ID = "test-client-id";
process.env.AUTH_ENFORCE = "enforce";

const handler = (await import("../../api/stripe-portal")).default;

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

function mockStripeFetch(customerId = "cus_123") {
  const calls: { url: string; opts: any }[] = [];
  global.fetch = vi.fn(async (url: any, opts: any) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes("/customers/search")) {
      return { json: async () => ({ data: [{ id: customerId }] }) } as any;
    }
    if (String(url).includes("/billing_portal/sessions")) {
      return {
        json: async () => ({ url: "https://billing.stripe.com/session/xyz" }),
      } as any;
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as any;
  return calls;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("stripe-portal authorization", () => {
  it("refuses an unauthenticated request and never calls Stripe", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const res = makeRes();
    await handler(
      { method: "POST", headers: {}, body: { email: "victim@example.com" } },
      res,
    );
    expect(res._status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks a signed-in caller from opening another customer's portal (IDOR)", async () => {
    const calls = mockStripeFetch();
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("attacker@example.com") },
        body: { email: "victim@example.com" },
      },
      res,
    );
    expect(res._status).toBe(403);
    expect(calls.length).toBe(0);
  });

  it("opens the portal for the signed-in customer's own email and hardcodes return_url, ignoring a body-supplied returnUrl", async () => {
    const calls = mockStripeFetch();
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("owner@example.com") },
        body: {
          email: "owner@example.com",
          returnUrl: "https://evil.example.com/steal",
        },
      },
      res,
    );
    expect(res._status).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.ok).toBe(true);
    expect(body.url).toBe("https://billing.stripe.com/session/xyz");

    const portalCall = calls.find((c) => c.url.includes("/billing_portal/sessions"));
    expect(portalCall).toBeDefined();
    expect(portalCall!.opts.body).toContain("return_url=https%3A%2F%2Fvellum.homes");
    expect(portalCall!.opts.body).not.toContain("evil.example.com");
  });

  it("falls back to the session's own email when no email is supplied in the body", async () => {
    const calls = mockStripeFetch();
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("owner@example.com") },
        body: {},
      },
      res,
    );
    expect(res._status).toBe(200);
    const searchCall = calls.find((c) => c.url.includes("/customers/search"));
    expect(searchCall).toBeDefined();
    expect(decodeURIComponent(searchCall!.url)).toContain("owner@example.com");
  });

  it("lets an admin open the portal for another customer's email (support bypass)", async () => {
    const calls = mockStripeFetch();
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: {
          cookie: await signedCookieFor("book@averyandbryant.com"),
        },
        body: { email: "someone@else.com" },
      },
      res,
    );
    expect(res._status).toBe(200);
    const searchCall = calls.find((c) => c.url.includes("/customers/search"));
    expect(searchCall).toBeDefined();
    expect(decodeURIComponent(searchCall!.url)).toContain("someone@else.com");
  });
});
