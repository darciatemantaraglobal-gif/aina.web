/**
 * Which optional dashboard features are switched on.
 *
 * AINA launches narrow: chat, the knowledge base behind it, and the contributor
 * flow that keeps the KB growing. The rest ship in the build but stay hidden
 * until there is enough traffic to make them look alive — an empty forum or a
 * leaderboard with five names reads worse than not having one.
 *
 * Turn features on by listing them in VITE_ENABLED_FEATURES (comma-separated):
 *
 *   VITE_ENABLED_FEATURES=leaderboard,threads
 *   VITE_ENABLED_FEATURES=all          # everything
 *
 * Unset means none of the optional ones. Vite bakes this at build time, so
 * flipping it takes a redeploy — enabling a feature is a deliberate, rare act,
 * not a routine one.
 */

/** Features that are always present — the core product. */
const CORE_FEATURES = ["chat", "contributor", "profile", "admin"];

/** Features that ship hidden and are switched on by env. */
export const OPTIONAL_FEATURES = ["berita", "library", "productivity", "threads", "leaderboard"];

const enabledFromEnv: string[] = (() => {
  const raw = (import.meta.env.VITE_ENABLED_FEATURES ?? "").trim();
  if (!raw) return [];
  if (raw.toLowerCase() === "all") return [...OPTIONAL_FEATURES];
  return raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
})();

export function isFeatureEnabled(id: string): boolean {
  if (CORE_FEATURES.includes(id)) return true;
  return enabledFromEnv.includes(id);
}

/** Drop anything switched off from a list of nav items keyed by `id`. */
export function filterEnabled<T extends { id: string }>(items: T[]): T[] {
  return items.filter(item => isFeatureEnabled(item.id));
}
