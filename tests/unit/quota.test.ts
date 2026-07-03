import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// quota.ts captures STRIPE_SECRET_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY at
// module load, so the env must be set BEFORE the module is imported. Static ESM
// imports are hoisted, so we use a dynamic import that runs after these
// assignments.
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.SUPABASE_URL = "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "dummy_service_key";

const { reserveQuota } = await import("../../api/_lib/quota");

// A minimal Response-like object. Stripe calls do `.then(r => r.json())`;
// callRpc checks `res.ok` then calls `res.json()`.
function jsonRes(body: any, ok = true) {
  return { ok, json: async () => body };
}

const RPC_URL = "/rest/v1/rpc/reserve_generation";

beforeEach(() => {
  // Silence the intentional console.warn/error the fail-closed branches emit.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reserveQuota — unlimited (pro) plan", () => {
  it("returns unlimited and never calls the reserve RPC", async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/customers/search")) {
        return jsonRes({ data: [{ id: "cus_pro" }] }) as any;
      }
      if (u.includes("/subscriptions")) {
        return jsonRes({
          data: [{ id: "sub_pro", metadata: { studioai_plan: "pro" } }],
        }) as any;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as any;

    const result = await reserveQuota("pro@example.com", "google-pro", 1);

    expect(result.allowed).toBe(true);
    expect(result.method).toBe("unlimited");
    expect(result.refundHandle).toBeNull();

    const urls = (global.fetch as any).mock.calls.map((c: any[]) =>
      String(c[0]),
    );
    expect(urls.some((u: string) => u.includes(RPC_URL))).toBe(false);
  });
});

describe("reserveQuota — free user, RPC allows", () => {
  it("reserves via the RPC and returns a refund handle", async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/customers/search")) {
        return jsonRes({ data: [] }) as any; // no Stripe customer => free
      }
      if (u.includes(RPC_URL)) {
        return jsonRes({
          allowed: true,
          method: "lifetime",
          lifetime_used: 1,
        }) as any;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as any;

    const result = await reserveQuota("free@example.com", "google-free", 1);

    expect(result.allowed).toBe(true);
    expect(result.method).toBe("lifetime");
    expect(result.refundHandle).not.toBeNull();
    expect(result.refundHandle?.googleId).toBe("google-free");
    expect(result.refundHandle?.amount).toBe(1);
  });
});

describe("reserveQuota — free user, RPC denies", () => {
  it("returns not-allowed with the RPC reason and no refund handle", async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/customers/search")) {
        return jsonRes({ data: [] }) as any;
      }
      if (u.includes(RPC_URL)) {
        return jsonRes({ allowed: false, reason: "quota_exhausted" }) as any;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as any;

    const result = await reserveQuota("free@example.com", "google-free", 1);

    expect(result.allowed).toBe(false);
    expect(result.method).toBe("denied");
    expect(result.reason).toBe("quota_exhausted");
    expect(result.refundHandle).toBeNull();
  });
});

describe("reserveQuota — reserve backend down (fail-closed)", () => {
  it("denies with quota_backend_unavailable when the RPC fetch throws", async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/customers/search")) {
        return jsonRes({ data: [] }) as any;
      }
      if (u.includes(RPC_URL)) {
        throw new Error("network down");
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as any;

    const result = await reserveQuota("free@example.com", "google-free", 1);

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("quota_backend_unavailable");
    expect(result.refundHandle).toBeNull();
  });
});
