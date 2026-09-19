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
  fuseByReciprocalRank,
  assessKBStrength,
  detectIntent,
  MASISIR_ALIASES_SEED,
  classifyConfidence,
  extractQuranReference,
  isFiqhQuery,
  cloneArticleList,
  needsFollowUpContext,
  buildFollowUpQuery,
} from "./server.js";
import { buildArticleEmbedText } from "./engine/embedder.js";

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

// ── fuseByReciprocalRank ────────────────────────────────────────────────────
// The actual bug: fetchRelevantArticles returned early on ANY vector hit, so
// the keyword path never ran. At the 0.40 similarity floor that meant five
// loosely-related neighbours could shut out the article whose title answered
// the question word-for-word.

describe("fuseByReciprocalRank", () => {
  it("ranks an article found by BOTH retrievers above one found by only one", () => {
    const keyword = [{ title: "Cara Perpanjang Iqomah" }, { title: "Biaya Hidup Kairo" }];
    const vector  = [{ title: "Visa Pelajar Mesir" }, { title: "Cara Perpanjang Iqomah" }];

    const fused = fuseByReciprocalRank(keyword, vector);

    // Present in both lists → accumulates from both → must come first.
    expect(fused[0].title).toBe("Cara Perpanjang Iqomah");
  });

  it("REGRESSION: a top keyword match survives even when vector returns a full page of others", () => {
    const keyword = [{ title: "Syarat Qaid Al-Azhar" }];
    const vector = [
      { title: "Sejarah Al-Azhar" },
      { title: "Fakultas di Al-Azhar" },
      { title: "Asrama Mahasiswa" },
      { title: "Beasiswa Al-Azhar" },
      { title: "Kalender Akademik" },
    ];

    const fused = fuseByReciprocalRank(keyword, vector);

    // Under the old short-circuit this article was never even fetched.
    expect(fused.map(a => a.title)).toContain("Syarat Qaid Al-Azhar");
    expect(fused[0].title).toBe("Syarat Qaid Al-Azhar");
  });

  it("merges fields across retrievers — keyword rows carry last_updated, vector rows carry similarity", () => {
    const keyword = [{ title: "Iqomah", last_updated: "2026-01-01", content: "full" }];
    const vector  = [{ title: "Iqomah", similarity: 0.82, content: "full" }];

    const [merged] = fuseByReciprocalRank(keyword, vector);

    expect(merged.last_updated).toBe("2026-01-01");
    expect(merged.similarity).toBe(0.82);
  });

  it("handles either side being empty", () => {
    expect(fuseByReciprocalRank([], [{ title: "A" }])).toHaveLength(1);
    expect(fuseByReciprocalRank([{ title: "A" }], [])).toHaveLength(1);
    expect(fuseByReciprocalRank([], [])).toHaveLength(0);
  });

  it("does not collapse distinct untitled articles into one", () => {
    const fused = fuseByReciprocalRank([{ content: "a" }, { content: "b" }], []);
    expect(fused).toHaveLength(2);
  });
});

// ── assessKBStrength ────────────────────────────────────────────────────────
// The actual bug: _topScore was only ever set on the keyword path. A
// vector-only result therefore hit the `articles.length >= 2 → "strong"`
// fallback, and "strong" makes the pipeline skip external sources, drop to the
// cheap model tier, and answer confidently — all on its weakest evidence.

function withSignals(articles, { topScore, topSimilarity } = {}) {
  const arr = [...articles];
  if (topScore !== undefined) arr._topScore = topScore;
  if (topSimilarity !== undefined) arr._topSimilarity = topSimilarity;
  return arr;
}

const article = (chars = 100) => ({ content: "x".repeat(chars) });

describe("assessKBStrength", () => {
  it("returns absent for no articles", () => {
    expect(assessKBStrength([])).toBe("absent");
    expect(assessKBStrength(null)).toBe("absent");
  });

  it("trusts a single article when keyword relevance is very high", () => {
    expect(assessKBStrength(withSignals([article()], { topScore: 8 }))).toBe("strong");
  });

  it("treats a low keyword score as weak regardless of article count", () => {
    expect(assessKBStrength(withSignals([article(), article()], { topScore: 2 }))).toBe("weak");
  });

  it("REGRESSION: two loosely-related vector hits are NOT strong", () => {
    // 0.45 similarity clears the 0.40 retrieval floor but is nowhere near
    // close enough to justify skipping external sources and the better model.
    const articles = withSignals([article(1000), article(1000)], { topSimilarity: 0.45 });
    expect(assessKBStrength(articles)).toBe("weak");
  });

  it("accepts vector-only evidence once similarity is genuinely close", () => {
    const articles = withSignals([article(1000), article(1000)], { topSimilarity: 0.75 });
    expect(assessKBStrength(articles)).toBe("strong");
  });

  it("still requires coverage even at high similarity", () => {
    const articles = withSignals([article(100)], { topSimilarity: 0.9 });
    expect(assessKBStrength(articles)).toBe("weak");
  });
});

// ── detectIntent.unmatched ──────────────────────────────────────────────────
// `unmatched` gates the (paid) LLM intent fallback. It must fire ONLY when no
// pattern matched at all — if it fired on every "factual" query we'd be paying
// for a classification call on a large share of normal traffic.

describe("detectIntent unmatched flag", () => {
  it("is false when a keyword pattern actually matched", () => {
    expect(detectIntent("gimana cara perpanjang iqomah").unmatched).toBe(false);
    expect(detectIntent("rekomendasi kost murah di Hay Asyir").unmatched).toBe(false);
    expect(detectIntent("aku bingung harus mulai dari mana").unmatched).toBe(false);
  });

  it("is true only for phrasings no pattern covers", () => {
    // Nothing in the procedural/recommend/brainstorm/confused keyword sets
    // covers this, so it silently became "factual" — the case worth an LLM call.
    const intent = detectIntent("iqomah gue tinggal seminggu lagi, aman gak");
    expect(intent.primary).toBe("factual");
    expect(intent.unmatched).toBe(true);
  });

  it("does not mark specialised intents as unmatched", () => {
    expect(detectIntent("tulisin surat ghaib bahasa arab").unmatched).toBe(false);
  });
});

// ── MASISIR_ALIASES_SEED ────────────────────────────────────────────────────
// The seed is the fallback KB search uses when masisir_aliases hasn't been
// migrated yet, so it must stay complete. It was moved out of
// fetchRelevantArticles programmatically; this guards against that move (or a
// later edit) quietly dropping entries.

describe("MASISIR_ALIASES_SEED", () => {
  it("still carries the full dictionary that migration 006 seeds", () => {
    expect(Object.keys(MASISIR_ALIASES_SEED)).toHaveLength(74);
    const total = Object.values(MASISIR_ALIASES_SEED).reduce((n, v) => n + v.length, 0);
    expect(total).toBe(242);
  });

  it("keeps the Masisir-specific terms a generic dictionary would miss", () => {
    expect(MASISIR_ALIASES_SEED.iqomah).toContain("izin tinggal");
    expect(MASISIR_ALIASES_SEED.qaid).toContain("shahada");
    expect(MASISIR_ALIASES_SEED.rasm).toContain("biaya kuliah");
    expect(MASISIR_ALIASES_SEED.imtihan).toContain("ujian");
  });

  it("maps every alias entry to a non-empty array of strings", () => {
    for (const [term, aliases] of Object.entries(MASISIR_ALIASES_SEED)) {
      expect(Array.isArray(aliases), `${term} must map to an array`).toBe(true);
      expect(aliases.length, `${term} must have aliases`).toBeGreaterThan(0);
      for (const a of aliases) expect(typeof a).toBe("string");
    }
  });
});

// ── classifyConfidence — weak-KB hint must not license silent fabrication ──
// The actual bug: the weak-KB hint said "jangan tambahkan disclaimer... jawab
// dari pengetahuan model dengan natural" — telling the model to blend
// fabricated details into a KB-grounded answer with no way for the user to
// tell which parts were real. That directly contradicted the base prompt's
// own rule (promptBuilder.js: "JANGAN mengarang... lebih baik jujur tidak
// tahu daripada salah"), and being the more specific instruction, it won.

describe("classifyConfidence — weak KB hint", () => {
  it("REGRESSION: no longer bans disclaimers or licenses silent gap-filling", () => {
    const { hint } = classifyConfidence({
      hasKB: true,
      kbStrength: "weak",
      hasPinned: false,
      hasWiki: false,
      hasDDG: false,
      intent: { primary: "factual" },
      query: "berapa biaya wafidin di al-azhar",
    });
    expect(hint).not.toMatch(/jangan tambahkan disclaimer/i);
    expect(hint).not.toMatch(/dengan natural/i);
    // Must instead require flagging ungrounded specifics rather than blending them in.
    expect(hint).toMatch(/tandai/i);
    expect(hint).toMatch(/jangan ditebak|jangan mengarang/i);
  });

  it("still lets the model answer confidently on what the KB actually covers", () => {
    const { hint } = classifyConfidence({
      hasKB: true,
      kbStrength: "weak",
      hasPinned: false,
      hasWiki: false,
      hasDDG: false,
      intent: { primary: "factual" },
      query: "berapa biaya wafidin di al-azhar",
    });
    expect(hint).toMatch(/percaya diri/i);
  });
});

// ── extractQuranReference ────────────────────────────────────────────────
// Fiqh answers cited Quranic Arabic purely from the model's memorized
// knowledge — zero ground-truth check, unlike hadith (verified via Dorar.net).
// This detects an explicit verse reference so the real text can be fetched
// from a Quran API instead of trusting the model's recall.

describe("extractQuranReference", () => {
  it("recognises the well-known named verse Ayat Kursi", () => {
    expect(extractQuranReference("apa arti ayat kursi")).toEqual({ surah: 2, ayah: 255, label: "Ayat Kursi" });
  });

  it("parses 'surat <name> ayat <n>' phrasing", () => {
    expect(extractQuranReference("apa arti surat al-baqarah ayat 255")).toEqual({ surah: 2, ayah: 255 });
  });

  it("parses 'QS <name>: <n>' phrasing", () => {
    expect(extractQuranReference("QS An-Nisa: 34")).toEqual({ surah: 4, ayah: 34 });
  });

  it("parses bare numeric surah with QS prefix", () => {
    expect(extractQuranReference("qs 2:255")).toEqual({ surah: 2, ayah: 255 });
  });

  it("resolves a colloquial surah name without the al-/an- prefix", () => {
    expect(extractQuranReference("surah baqarah ayat 183")).toEqual({ surah: 2, ayah: 183 });
  });

  it("resolves the 'Ali Imran' exception (not derivable by simple prefix-stripping)", () => {
    expect(extractQuranReference("qs ali imran ayat 190")).toEqual({ surah: 3, ayah: 190 });
  });

  it("returns null when there is no verse reference", () => {
    expect(extractQuranReference("gimana cara bikin surat izin tinggal")).toBeNull();
    expect(extractQuranReference("berapa biaya hidup di kairo")).toBeNull();
  });

  it("returns null for an out-of-range ayah number", () => {
    expect(extractQuranReference("qs al-baqarah ayat 999")).toBeNull();
  });
});

// ── isFiqhQuery — pure verse-reference gap ──────────────────────────────
// Before this fix, a query like "apa arti surat al-baqarah ayat 255" carried
// none of isFiqhQuery's trigger keywords (quran/dalil/hukum/fiqh/...) and a
// specific verse reference is not a FIQH_TERM_MAP topic word either, so it
// silently fell through to the generic "factual" intent — wrong response
// shape/hints for what is unmistakably a tafsir question.

describe("isFiqhQuery — verse-reference gap", () => {
  it("REGRESSION: a pure verse reference with no other fiqh keyword is still fiqh", () => {
    expect(isFiqhQuery("apa arti surat al-baqarah ayat 255")).toBe(true);
    expect(isFiqhQuery("QS An-Nisa: 34")).toBe(true);
  });

  it("still recognises existing keyword-based fiqh triggers", () => {
    expect(isFiqhQuery("apakah boleh puasa tanpa niat")).toBe(true);
  });

  it("does not misfire on an unrelated query containing the word 'surat'", () => {
    expect(isFiqhQuery("gimana cara bikin surat keterangan domisili")).toBe(false);
  });
});

// ── buildArticleEmbedText ───────────────────────────────────────────────
// The embedding input is capped at 8000 chars. What matters is WHICH 8000:
// the title/keywords/summary carry most of the retrieval signal, so they must
// sit ahead of the body and survive the cut. The Arabic translation is part of
// the input too — it was supported here all along but the caller never
// SELECTed the column, so every admin-generated translation sat unindexed.

describe("buildArticleEmbedText", () => {
  it("includes the Arabic translation when the article has one", () => {
    const text = buildArticleEmbedText({
      title: "Prosedur Iqomah",
      content: "Langkah pengurusan izin tinggal.",
      content_ar: "إجراءات الإقامة",
    });
    expect(text).toContain("إجراءات الإقامة");
  });

  it("keeps title, keywords and summary ahead of the body so truncation can't drop them", () => {
    const text = buildArticleEmbedText({
      title: "Biaya Wafidin",
      keywords: "wafidin, biaya, al-azhar",
      summary: "Rincian biaya wafidin terbaru.",
      content: "x".repeat(20000),
    });
    expect(text.length).toBe(8000);
    expect(text).toContain("Biaya Wafidin");
    expect(text).toContain("wafidin, biaya, al-azhar");
    expect(text).toContain("Rincian biaya wafidin terbaru.");
  });

  it("leaves a short article untouched", () => {
    const text = buildArticleEmbedText({ title: "Judul", content: "Isi singkat." });
    expect(text).toBe("Judul\n\nIsi singkat.");
  });
});

// ── cloneArticleList ────────────────────────────────────────────────────
// The KB cache used to hand out the stored array itself. The chat handler
// re-ranks what it gets IN PLACE (the city boost splices it), so the first
// user's city-personalised ordering was written straight back into the shared
// cache entry and served to everyone else asking the same question for the
// next 5 minutes.

describe("cloneArticleList", () => {
  it("REGRESSION: in-place re-ranking of the copy cannot reach the original", () => {
    const original = [{ title: "A" }, { title: "B" }];
    const copy = cloneArticleList(original);
    copy.splice(0, copy.length, { title: "B" }, { title: "A" });
    expect(original.map(a => a.title)).toEqual(["A", "B"]);
  });

  it("carries over the strength signals that live on the array itself", () => {
    const original = [{ title: "A" }];
    original._topScore = 8;
    original._topSimilarity = 0.72;
    const copy = cloneArticleList(original);
    expect(copy._topScore).toBe(8);
    expect(copy._topSimilarity).toBe(0.72);
  });

  it("leaves absent signals absent rather than inventing zeros", () => {
    const copy = cloneArticleList([{ title: "A" }]);
    expect(copy._topScore).toBeUndefined();
    expect(copy._topSimilarity).toBeUndefined();
  });
});

// ── Follow-up query resolution ──────────────────────────────────────────
// KB retrieval ran on the last message alone, so "berapa biayanya?" searched
// for "biayanya" — matching a little of every article that mentions a cost and
// nothing about the topic the user was actually still asking about.

describe("needsFollowUpContext", () => {
  it("flags a back-reference that carries no topic", () => {
    expect(needsFollowUpContext("berapa biayanya?")).toBe(true);
    expect(needsFollowUpContext("kapan tuh?")).toBe(true);
  });

  it("flags a standalone command", () => {
    expect(needsFollowUpContext("jelaskan")).toBe(true);
  });

  it("leaves a question that carries its own topic alone", () => {
    expect(needsFollowUpContext("berapa biaya wafidin al-azhar")).toBe(false);
    expect(needsFollowUpContext("gimana cara ngurus iqomah")).toBe(false);
  });

  it("is false for an empty message", () => {
    expect(needsFollowUpContext("")).toBe(false);
  });
});

describe("buildFollowUpQuery", () => {
  it("borrows the topic from the previous user turn", () => {
    const q = buildFollowUpQuery("berapa biayanya?", "gimana cara daftar kuliah di Al-Azhar");
    expect(q).toContain("biayanya");
    expect(q).toContain("daftar");
    expect(q).toContain("azhar");
  });

  it("does not touch a query that already stands on its own", () => {
    const q = "berapa biaya wafidin al-azhar";
    expect(buildFollowUpQuery(q, "pertanyaan sebelumnya soal iqomah")).toBe(q);
  });

  it("returns the query unchanged when there is no previous turn", () => {
    expect(buildFollowUpQuery("berapa biayanya?", null)).toBe("berapa biayanya?");
  });
});
