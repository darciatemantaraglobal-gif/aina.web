// The launch-narrow gate: which dashboard tabs exist in a given build.
// The env var is read once at module load, so each case re-imports the module
// with a different value stubbed in.
import { describe, it, expect, vi, afterEach } from "vitest";

async function loadWith(value?: string) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv("VITE_ENABLED_FEATURES", "");
  else vi.stubEnv("VITE_ENABLED_FEATURES", value);
  return import("@/lib/features");
}

afterEach(() => vi.unstubAllEnvs());

describe("isFeatureEnabled", () => {
  it("keeps the core product on with no env var set", async () => {
    const { isFeatureEnabled } = await loadWith();
    expect(isFeatureEnabled("chat")).toBe(true);
    expect(isFeatureEnabled("contributor")).toBe(true);
    expect(isFeatureEnabled("profile")).toBe(true);
    expect(isFeatureEnabled("admin")).toBe(true);
  });

  it("holds every optional feature back by default", async () => {
    const { isFeatureEnabled, OPTIONAL_FEATURES } = await loadWith();
    for (const id of OPTIONAL_FEATURES) {
      expect(isFeatureEnabled(id), `${id} should be off by default`).toBe(false);
    }
  });

  it("switches on exactly what the env var lists", async () => {
    const { isFeatureEnabled } = await loadWith("leaderboard,threads");
    expect(isFeatureEnabled("leaderboard")).toBe(true);
    expect(isFeatureEnabled("threads")).toBe(true);
    expect(isFeatureEnabled("berita")).toBe(false);
    expect(isFeatureEnabled("productivity")).toBe(false);
  });

  it("tolerates spacing and casing in the list", async () => {
    const { isFeatureEnabled } = await loadWith(" Leaderboard , THREADS ");
    expect(isFeatureEnabled("leaderboard")).toBe(true);
    expect(isFeatureEnabled("threads")).toBe(true);
  });

  it("turns everything on for 'all'", async () => {
    const { isFeatureEnabled, OPTIONAL_FEATURES } = await loadWith("all");
    for (const id of OPTIONAL_FEATURES) {
      expect(isFeatureEnabled(id), `${id} should be on`).toBe(true);
    }
  });
});

describe("filterEnabled", () => {
  it("drops held-back items and keeps core ones, preserving order", async () => {
    const { filterEnabled } = await loadWith("threads");
    const nav = [
      { id: "chat" }, { id: "berita" }, { id: "threads" },
      { id: "leaderboard" }, { id: "contributor" },
    ];
    expect(filterEnabled(nav).map(i => i.id)).toEqual(["chat", "threads", "contributor"]);
  });

  it("can empty a nav group entirely, so the group can be dropped", async () => {
    const { filterEnabled } = await loadWith();
    expect(filterEnabled([{ id: "berita" }, { id: "library" }, { id: "productivity" }])).toEqual([]);
  });
});
