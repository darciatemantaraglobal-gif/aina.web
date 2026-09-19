/**
 * Which optional dashboard features are switched on.
 *
 * AINA launches narrow: chat, the knowledge base behind it, and the contributor
 * flow that keeps the KB growing. The rest ship in the build but stay hidden
 * until there is enough traffic to make them look alive — an empty forum or a
 * leaderboard with five names reads worse than not having one.
 *
 * A master admin flips them from Admin → Overview → Pengaturan Aplikasi. The
 * state lives in `app_config` on the server, so turning one on takes effect for
 * everyone without a redeploy.
 *
 * Flags load once per page load. Before they arrive, only the core is on — so
 * the app never briefly shows a section that is meant to be hidden.
 */
import { useEffect, useState } from "react";

/** Always present — the core product. */
const CORE_FEATURES = ["chat", "contributor", "profile", "admin"];

/** Ship hidden, switched on per-environment by a master admin. */
export const OPTIONAL_FEATURES = ["berita", "library", "productivity", "threads", "leaderboard"] as const;

export type OptionalFeature = (typeof OPTIONAL_FEATURES)[number];

/** Labels for the admin toggles, so the ids stay the single source of truth. */
export const FEATURE_LABELS: Record<OptionalFeature, string> = {
  berita: "Berita Masisir",
  library: "Library",
  productivity: "Ruang Produktif",
  threads: "Threads",
  leaderboard: "Leaderboard",
};

let enabled = new Set<string>();
let loadPromise: Promise<void> | null = null;

/** Fetch the flags once per page load; failures leave the core-only default. */
export function loadFeatures(): Promise<void> {
  if (!loadPromise) {
    loadPromise = fetch("/api/app/public-config")
      .then(r => r.json())
      .then((cfg: { features?: Record<string, boolean> }) => {
        enabled = new Set(OPTIONAL_FEATURES.filter(id => cfg.features?.[id] === true));
      })
      .catch(() => { /* stay narrow rather than guessing a section is on */ });
  }
  return loadPromise;
}

export function isFeatureEnabled(id: string): boolean {
  if (CORE_FEATURES.includes(id)) return true;
  return enabled.has(id);
}

/** Drop anything switched off from a list of nav items keyed by `id`. */
export function filterEnabled<T extends { id: string }>(items: T[]): T[] {
  return items.filter(item => isFeatureEnabled(item.id));
}

/** True once the flags have been fetched (or the fetch has failed). */
export function useFeaturesReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => { loadFeatures().then(() => setReady(true)); }, []);
  return ready;
}

/** Test seam: set the flags directly instead of fetching them. */
export function __setFeaturesForTest(ids: string[]): void {
  enabled = new Set(ids);
  loadPromise = Promise.resolve();
}
