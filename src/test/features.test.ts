// The launch-narrow gate: which dashboard tabs a user can see. Flags come from
// the server at runtime so a master admin can flip one without a redeploy.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isFeatureEnabled,
  filterEnabled,
  loadFeatures,
  OPTIONAL_FEATURES,
  FEATURE_LABELS,
  __setFeaturesForTest,
} from "@/lib/features";

beforeEach(() => __setFeaturesForTest([]));
afterEach(() => vi.unstubAllGlobals());

describe("isFeatureEnabled", () => {
  it("keeps the core product on regardless of the flags", () => {
    for (const id of ["chat", "contributor", "profile", "admin"]) {
      expect(isFeatureEnabled(id), `${id} is core`).toBe(true);
    }
  });

  it("holds every optional feature back until it is switched on", () => {
    for (const id of OPTIONAL_FEATURES) {
      expect(isFeatureEnabled(id), `${id} should start off`).toBe(false);
    }
  });

  it("reports exactly the features that were switched on", () => {
    __setFeaturesForTest(["leaderboard", "threads"]);
    expect(isFeatureEnabled("leaderboard")).toBe(true);
    expect(isFeatureEnabled("threads")).toBe(true);
    expect(isFeatureEnabled("berita")).toBe(false);
  });
});

describe("filterEnabled", () => {
  it("drops held-back items and keeps core ones, preserving order", () => {
    __setFeaturesForTest(["threads"]);
    const nav = [
      { id: "chat" }, { id: "berita" }, { id: "threads" },
      { id: "leaderboard" }, { id: "contributor" },
    ];
    expect(filterEnabled(nav).map(i => i.id)).toEqual(["chat", "threads", "contributor"]);
  });

  it("can empty a nav group entirely, so the group can be dropped", () => {
    expect(filterEnabled([{ id: "berita" }, { id: "library" }, { id: "productivity" }])).toEqual([]);
  });
});

describe("loadFeatures", () => {
  it("switches on what the server reports", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ features: { berita: true, threads: false, library: true } }),
    }));
    vi.resetModules();
    const mod = await import("@/lib/features");
    await mod.loadFeatures();
    expect(mod.isFeatureEnabled("berita")).toBe(true);
    expect(mod.isFeatureEnabled("library")).toBe(true);
    expect(mod.isFeatureEnabled("threads")).toBe(false);
  });

  it("REGRESSION: a failed fetch stays narrow instead of guessing a section is on", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.resetModules();
    const mod = await import("@/lib/features");
    await mod.loadFeatures();
    for (const id of mod.OPTIONAL_FEATURES) {
      expect(mod.isFeatureEnabled(id), `${id} must stay off`).toBe(false);
    }
    expect(mod.isFeatureEnabled("chat")).toBe(true);
  });

  it("ignores a feature id the server does not know about", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ features: { berita: true, nonsense: true } }),
    }));
    vi.resetModules();
    const mod = await import("@/lib/features");
    await mod.loadFeatures();
    expect(mod.isFeatureEnabled("berita")).toBe(true);
    expect(mod.isFeatureEnabled("nonsense")).toBe(false);
  });
});

describe("FEATURE_LABELS", () => {
  it("labels every optional feature, so the admin toggles can't render blank", () => {
    for (const id of OPTIONAL_FEATURES) {
      expect(FEATURE_LABELS[id], `${id} needs a label`).toBeTruthy();
    }
  });
});
