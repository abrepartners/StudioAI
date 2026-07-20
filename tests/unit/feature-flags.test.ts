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
  it("returns null with no override present (caller supplies the true default)", async () => {
    const { readFeatureFlagOverride } =
      await import("../../src/config/featureFlags");
    expect(readFeatureFlagOverride("route_link_stability")).toBeNull();
  });

  it("the ?? true fallback resolves an absent override to enabled", async () => {
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

describe("MarketingRoute wiring (regression guard)", () => {
  it("computes routeLinkStability from readFeatureFlagOverride, not getFeatureFlag", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/MarketingRoute.tsx"),
      "utf-8",
    );

    const bindingMatch = source.match(
      /const\s+routeLinkStability\s*=\s*useMemo\(\s*\(\)\s*=>\s*([^,]+?),/,
    );
    expect(
      bindingMatch,
      "Could not find the routeLinkStability useMemo binding in MarketingRoute.tsx. " +
        "If the binding was restructured, update this guard to match its new shape.",
    ).not.toBeNull();

    const bindingExpression = bindingMatch![1];
    const regressionMessage =
      "routeLinkStability must be computed via readFeatureFlagOverride(...), not getFeatureFlag(...). " +
      "getFeatureFlag resolves through a percentage-rollout (DEFAULT_PERCENT_PROD = 10 in production), " +
      "which previously redirected roughly 90% of pricing/features/faq/gallery visitors back to the " +
      "homepage. Reverting this wiring reintroduces that bounce regression even though the unit tests " +
      "above (which call readFeatureFlagOverride directly) would still pass.";

    expect(bindingExpression.includes("readFeatureFlagOverride"), regressionMessage).toBe(true);
    expect(bindingExpression.includes("getFeatureFlag"), regressionMessage).toBe(false);
  });
});
