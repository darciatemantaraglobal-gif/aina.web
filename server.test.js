// Unit tests for the pure/testable logic exported from server.js — the
// launch-blocking bugs found and fixed in the pre-launch audit (Fase 1/F3-2):
//   - resolveEntitlement: paid-user detection (role OR active subscription)
//   - consumeRateWindow / checkChatUserRate: rate limiting that can't be
//     bypassed by forging an unverified JWT `sub` claim
//   - isAllowedOrigin: CORS allowlist
//
// These import directly from server.js (VITEST=true, set automatically by
// the test runner, skips app.listen()/DB bootstrap on import — see the
// guard at the bottom of server.js). No real Supabase/network access is
// used: resolveEntitlement takes a fake `supabase`-shaped object.
import { describe, it, expect } from "vitest";
import {
  resolveEntitlement,
  consumeRateWindow,
  checkChatUserRate,
  isAllowedOrigin,
} from "./server.js";

// ── resolveEntitlement ──────────────────────────────────────────────────────
// The actual bug (Fase 1): a Midtrans-paid or admin-granted Pro user with
// the plain "user" role was still capped at the free daily chat limit,
// because entitlement only checked roles, never the subscriptions table.

function fakeSupabase({ roles = [], subscription = null } = {}) {
  return {
    from(table) {
      if (table === "user_roles") {
        return { select: () => ({ eq: () => Promise.resolve({ data: roles }) }) };
      }
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: subscription, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  };
}

describe("resolveEntitlement", () => {
  it("grants unlimited access via an unlimited role (contributor/senior_contributor/admin)", async () => {
    for (const role of ["contributor", "senior_contributor", "admin"]) {
      const supabase = fakeSupabase({ roles: [{ role }] });
      const result = await resolveEntitlement(supabase, "u1");
      expect(result).toEqual({ isPaid: true, source: "role" });
    }
  });

  it("REGRESSION: grants access via an active subscription even with the plain 'user' role", async () => {
    // This is the exact bug: paid Pro user, role stays "user".
    const futureExpiry = new Date(Date.now() + 30 * 86400_000).toISOString();
    const supabase = fakeSupabase({ roles: [{ role: "user" }], subscription: { expires_at: futureExpiry } });
    const result = await resolveEntitlement(supabase, "paid-user");
    expect(result).toEqual({ isPaid: true, source: "subscription" });
  });

  it("does not grant access for an expired subscription", async () => {
    const pastExpiry = new Date(Date.now() - 86400_000).toISOString();
    const supabase = fakeSupabase({ roles: [{ role: "user" }], subscription: { expires_at: pastExpiry } });
    const result = await resolveEntitlement(supabase, "expired-user");
    expect(result).toEqual({ isPaid: false, source: null });
  });

  it("does not grant access with no unlimited role and no subscription row", async () => {
    const supabase = fakeSupabase({ roles: [{ role: "user" }], subscription: null });
    const result = await resolveEntitlement(supabase, "free-user");
    expect(result).toEqual({ isPaid: false, source: null });
  });

  it("skips the roles query when roles are already fetched by the caller", async () => {
    let rolesQueried = false;
    const supabase = {
      from(table) {
        if (table === "user_roles") { rolesQueried = true; return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }; }
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
      },
    };
    await resolveEntitlement(supabase, "u1", [{ role: "admin" }]);
    expect(rolesQueried).toBe(false);
  });
});

// ── consumeRateWindow / checkChatUserRate ───────────────────────────────────
// The actual bug (Fase 2): the pre-auth chat rate limiter decoded a Bearer
// JWT's payload WITHOUT verifying its signature and used the `sub` claim as
// the rate-limit key — an attacker could forge a fresh `sub` on every
// request to get a new bucket each time, bypassing the limit entirely.
// checkChatUserRate is the per-user limiter that replaced it, only ever
// consulted AFTER the token has been cryptographically verified.

describe("consumeRateWindow", () => {
  it("allows exactly `max` calls then blocks", () => {
    const store = new Map();
    const results = Array.from({ length: 7 }, () => consumeRateWindow(store, "key-a", 60_000, 5));
    expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true);
    expect(results.slice(5).every((r) => !r.allowed)).toBe(true);
  });

  it("tracks independent keys independently (no cross-user interference)", () => {
    const store = new Map();
    for (let i = 0; i < 5; i++) consumeRateWindow(store, "user-a", 60_000, 5);
    const blockedA = consumeRateWindow(store, "user-a", 60_000, 5);
    const firstB = consumeRateWindow(store, "user-b", 60_000, 5);
    expect(blockedA.allowed).toBe(false);
    expect(firstB.allowed).toBe(true);
  });

  it("REGRESSION: a forged/rotating key can no longer bypass the limit — the guarantee only holds when the key is fixed (e.g. IP or a verified user id)", () => {
    // Simulates the OLD vulnerable behavior (attacker rotates the key every
    // request, as was possible when the key came from an unverified JWT
    // `sub`) purely to document why the fix (fixed IP key pre-auth, fixed
    // verified-user-id key post-auth) matters: with a rotating key, nothing
    // ever accumulates enough hits to be blocked.
    const store = new Map();
    const resultsWithRotatingKey = Array.from({ length: 25 }, (_, i) =>
      consumeRateWindow(store, `forged-sub-${i}`, 60_000, 20)
    );
    expect(resultsWithRotatingKey.every((r) => r.allowed)).toBe(true); // the vulnerability, illustrated

    // With a FIXED key (what the real IP-based / verified-user-id based
    // limiter actually does), the same 25 calls correctly get capped.
    const resultsWithFixedKey = Array.from({ length: 25 }, () =>
      consumeRateWindow(store, "fixed-ip-1.2.3.4", 60_000, 20)
    );
    expect(resultsWithFixedKey.filter((r) => r.allowed).length).toBe(20);
    expect(resultsWithFixedKey.filter((r) => !r.allowed).length).toBe(5);
  });

  it("resets the window after it expires", async () => {
    const store = new Map();
    consumeRateWindow(store, "k", 50, 1); // windowMs=50ms, max=1
    expect(consumeRateWindow(store, "k", 50, 1).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 70));
    expect(consumeRateWindow(store, "k", 50, 1).allowed).toBe(true);
  });
});

describe("checkChatUserRate", () => {
  it("enforces a 20/minute cap per (verified) user id", () => {
    const userId = `test-user-${Math.random()}`; // unique per run — module-level store is shared across tests
    const results = Array.from({ length: 25 }, () => checkChatUserRate(userId));
    expect(results.filter((r) => r.allowed).length).toBe(20);
    expect(results.filter((r) => !r.allowed).length).toBe(5);
  });
});

// ── isAllowedOrigin (CORS) ───────────────────────────────────────────────────
// The actual finding (Fase 1): production accepted CORS requests (with
// credentials: true) from ANY *.vercel.app/*.replit.app/*.replit.dev
// origin. Wildcard matching is now gated behind ALLOW_PREVIEW_ORIGINS,
// which is not set in this test run — so the assertions below cover the
// secure-by-default (wildcards OFF) behavior.

describe("isAllowedOrigin", () => {
  it("allows requests with no Origin header (same-origin / non-browser)", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
  });

  it("REGRESSION: rejects an arbitrary *.vercel.app origin when ALLOW_PREVIEW_ORIGINS is not set", () => {
    expect(isAllowedOrigin("https://some-random-clone.vercel.app")).toBe(false);
  });

  it("rejects an arbitrary *.replit.app / *.replit.dev origin when ALLOW_PREVIEW_ORIGINS is not set", () => {
    expect(isAllowedOrigin("https://some-random.replit.app")).toBe(false);
    expect(isAllowedOrigin("https://some-random.replit.dev")).toBe(false);
  });

  it("rejects a malformed origin instead of throwing", () => {
    expect(isAllowedOrigin("not-a-valid-url")).toBe(false);
  });
});
