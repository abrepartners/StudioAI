import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
process.env.SUPABASE_URL = "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "dummy_service_key";

const handler = (await import("../../api/stripe-webhook")).default;

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

/** A request object that yields the raw body via async iteration. */
function rawReq(body: string, signatureHeader: string) {
  return {
    method: "POST",
    headers: { "stripe-signature": signatureHeader },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(body);
    },
  };
}

function sign(body: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  const mac = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${mac}`;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const EVENT = JSON.stringify({
  id: "evt_1",
  type: "invoice.payment_failed",
  data: { object: {} },
});

describe("stripe webhook signature verification", () => {
  it("rejects a bad signature with 400 and never writes", async () => {
    const writes: string[] = [];
    global.fetch = vi.fn(async (u: any) => {
      writes.push(String(u));
      return { ok: true, status: 201, text: async () => "[]" } as any;
    }) as any;
    const res = makeRes();
    await handler(rawReq(EVENT, sign(EVENT, "whsec_WRONG")), res);
    expect(res._status).toBe(400);
    expect(writes.length).toBe(0);
  });

  it("rejects a stale timestamp outside tolerance", async () => {
    global.fetch = vi.fn(
      async () => ({ ok: true, status: 201, text: async () => "[]" }) as any,
    ) as any;
    const res = makeRes();
    const old = Math.floor(Date.now() / 1000) - 3600;
    await handler(rawReq(EVENT, sign(EVENT, "whsec_test_secret", old)), res);
    expect(res._status).toBe(400);
  });

  it("accepts a valid signature and records the event", async () => {
    const writes: string[] = [];
    global.fetch = vi.fn(async (u: any) => {
      writes.push(String(u));
      return { ok: true, status: 201, text: async () => "[]" } as any;
    }) as any;
    const res = makeRes();
    await handler(rawReq(EVENT, sign(EVENT, "whsec_test_secret")), res);
    expect(res._status).toBe(200);
    expect(writes.some((w) => w.includes("stripe_events"))).toBe(true);
  });

  it("returns 200 on a duplicate delivery without reprocessing", async () => {
    global.fetch = vi.fn(
      async () =>
        ({ ok: false, status: 409, text: async () => "duplicate key" }) as any,
    ) as any;
    const res = makeRes();
    await handler(rawReq(EVENT, sign(EVENT, "whsec_test_secret")), res);
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body).duplicate).toBe(true);
  });
});
