import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// featureFlags reads import.meta.env at call time, so stub PROD per-test.
beforeEach(() => {
  vi.resetModules();
  (globalThis as any).localStorage = {
    _d: new Map<string, string>(),
    getItem(k: string) {
      return this._d.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      this._d.set(k, v);
    },
    removeItem(k: string) {
      this._d.delete(k);
    },
  };
  (globalThis as any).window = { location: { search: "" } };
});
afterEach(() => vi.restoreAllMocks());

describe("route_link_stability override contract", () => {
  it("defaults on with no override present", async () => {
    const { readFeatureFlagOverride } =
      await import("../../src/config/featureFlags");
    expect(readFeatureFlagOverride("route_link_stability") ?? true).toBe(true);
  });

  it("honors an explicit URL opt-out for debugging", async () => {
    (globalThis as any).window = {
      location: { search: "?ff_route_link_stability=0" },
    };
    const { readFeatureFlagOverride } =
      await import("../../src/config/featureFlags");
    expect(readFeatureFlagOverride("route_link_stability")).toBe(false);
  });
});
