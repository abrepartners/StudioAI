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

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("stripe-checkout authorization", () => {
  for (const action of [
    "pause_subscription",
    "resume_subscription",
    "fulfill",
  ]) {
    it(`refuses anonymous ${action} without calling Stripe`, async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;
      const res = makeRes();
      await handler(
        {
          method: "POST",
          headers: {},
          body: {
            action,
            email: "victim@example.com",
            days: 90,
            sessionId: "cs_test_1",
          },
        },
        res,
      );
      expect(res._status).toBe(401);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }
});
