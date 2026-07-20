import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.VITE_GOOGLE_CLIENT_ID = "test_google_client_id_1234567890";
process.env.AUTH_ENFORCE = "enforce";

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
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("requireBillingSession", () => {
  it("rejects an anonymous caller with 401", async () => {
    const { requireBillingSession } =
      await import("../../api/_lib/billing-auth");
    const res = makeRes();
    const claims = await requireBillingSession({ headers: {} }, res);
    expect(claims).toBeNull();
    expect(res._status).toBe(401);
  });

  it("rejects acting on another customer's email with 403", async () => {
    const { requireBillingSession } =
      await import("../../api/_lib/billing-auth");
    const res = makeRes();
    const req = {
      headers: { cookie: await signedCookieFor("attacker@example.com") },
    };
    const claims = await requireBillingSession(req, res, {
      actingOn: "lawson@hdhomesar.com",
    });
    expect(claims).toBeNull();
    expect(res._status).toBe(403);
  });

  it("allows acting on your own email", async () => {
    const { requireBillingSession } =
      await import("../../api/_lib/billing-auth");
    const res = makeRes();
    const req = {
      headers: { cookie: await signedCookieFor("owner@example.com") },
    };
    const claims = await requireBillingSession(req, res, {
      actingOn: "OWNER@example.com",
    });
    expect(claims?.email).toBe("owner@example.com");
    expect(res._status).toBe(0);
  });

  it("allows an admin to act on any email", async () => {
    const { requireBillingSession } =
      await import("../../api/_lib/billing-auth");
    const res = makeRes();
    const req = {
      headers: { cookie: await signedCookieFor("book@averyandbryant.com") },
    };
    const claims = await requireBillingSession(req, res, {
      actingOn: "someone@else.com",
    });
    expect(claims?.email).toBe("book@averyandbryant.com");
    expect(res._status).toBe(0);
  });
});
