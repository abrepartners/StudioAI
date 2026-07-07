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

// --- Unlimited-plan fair-use / COGS ceiling --------------------------------
// The unlimited (pro/team) branch meters monthly usage via a HEAD count on
// generation_logs and applies a two-tier ceiling. Below fair-use: allow.
// At/above the abuse cap: deny with reason "fair_use_exceeded". Metering
// throw: FAIL-OPEN (allow) so a paying customer is never blocked by an outage.

// HEAD count response: PostgREST returns the count in the content-range header
// as `*​/N`. `res.ok` is checked, then `res.headers.get("content-range")`.
function headCountRes(count: number, ok = true) {
  return {
    ok,
    headers: {
      get: (h: string) =>
        h.toLowerCase() === "content-range" ? `*/${count}` : null,
    },
    json: async () => ({}),
  };
}

// Build a fetch mock for an unlimited (pro) user whose monthlyUsage HEAD count
// resolves to `count`. Stripe search/subscriptions resolve the pro plan first.
function proFetchWithUsage(count: number) {
  return vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    if (u.includes("/customers/search")) {
      return jsonRes({ data: [{ id: "cus_pro" }] }) as any;
    }
    if (u.includes("/subscriptions")) {
      return jsonRes({
        data: [{ id: "sub_pro", metadata: { studioai_plan: "pro" } }],
      }) as any;
    }
    if (u.includes("/rest/v1/generation_logs")) {
      // Should be the HEAD count query.
      expect(init?.method).toBe("HEAD");
      return headCountRes(count) as any;
    }
    throw new Error(`unexpected fetch: ${u}`);
  });
}

describe("reserveQuota — unlimited fair-use ceiling", () => {
  it("allows an unlimited user below the fair-use soft ceiling", async () => {
    global.fetch = proFetchWithUsage(1200) as any;

    const result = await reserveQuota("pro@example.com", "google-pro", 1);

    expect(result.allowed).toBe(true);
    expect(result.method).toBe("unlimited");
    expect(result.refundHandle).toBeNull();
  });

  it("allows (with a warning) at/above the soft ceiling but below the abuse cap", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = proFetchWithUsage(2000) as any; // >= 1500 soft, < 6000 hard

    const result = await reserveQuota("pro@example.com", "google-pro", 1);

    expect(result.allowed).toBe(true);
    expect(result.method).toBe("unlimited");
    expect(warn).toHaveBeenCalled();
  });

  it("denies at/above the abuse cap with reason fair_use_exceeded", async () => {
    global.fetch = proFetchWithUsage(6000) as any; // >= 6000 hard cap

    const result = await reserveQuota("pro@example.com", "google-pro", 1);

    expect(result.allowed).toBe(false);
    expect(result.method).toBe("denied");
    expect(result.reason).toBe("fair_use_exceeded");
    expect(result.refundHandle).toBeNull();
  });

  it("fails OPEN (allows) when the metering count query throws", async () => {
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
      if (u.includes("/rest/v1/generation_logs")) {
        throw new Error("metering backend down");
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as any;

    const result = await reserveQuota("pro@example.com", "google-pro", 1);

    expect(result.allowed).toBe(true);
    expect(result.method).toBe("unlimited");
    expect(result.refundHandle).toBeNull();
  });
});
