/**
 * hybridRetrievalService.js — Hybrid retrieval menggabungkan knowledge_base lama
 * dengan knowledge_sources/chunks baru dari news-harvester.
 *
 * ADDITIVE — tidak menggantikan fetchRelevantArticles(). Hanya aktif jika
 * env var USE_HYBRID_RETRIEVAL=true. Jika news side error, selalu fallback
 * ke hasil legacy. Tidak pernah throw ke caller.
 *
 * Dependency injection: menerima { getAdminClient, legacyFetch }
 * sehingga tidak ada circular import ke server.js.
 *
 * @param {{ getAdminClient: Function, legacyFetch: Function }} deps
 *   legacyFetch — reference ke fetchRelevantArticles di server.js
 */
import { createNewsKnowledgeService } from "./newsKnowledgeService.js";
import { adaptRetrievalResult }       from "./newsKnowledgeAdapter.js";

export function createHybridRetrievalService({ getAdminClient, legacyFetch }) {
  const newsSvc = createNewsKnowledgeService({ getAdminClient });

  return {
    /**
     * Jalankan retrieval hybrid:
     *   1. Legacy knowledge_base (selalu jalan, seperti biasa)
     *   2. knowledge_sources/chunks (news-harvester) — best-effort, tidak boleh gagalkan chat
     *   3. Gabungkan, deduplikasi judul, batasi total hasil
     *
     * Jika ada error di sisi legacy → lempar error ke caller (biarkan caller handle).
     * Jika ada error di sisi news  → log warn + abaikan, kembalikan hasil legacy saja.
     *
     * @param {string} query        Query yang sudah di-expand (kbQuery)
     * @param {string} intentType   Intent primer dari intentDetector
     * @returns {Promise<object[]>} Array artikel kompatibel dengan format fetchRelevantArticles
     */
    async retrieve(query, intentType) {
      // ── Steps 1 & 2 — parallel: legacy (mandatory) + news (best-effort) ──
      // News error is caught inside newsPromise so it never rejects Promise.all.
      // Returning null as sentinel lets us distinguish "failed" from "0 results".
      const newsPromise = newsSvc
        .retrieveByKeywords(query, { limit: 5, preferChunks: true })
        .catch(err => {
          console.warn("[Hybrid] News retrieval error (ignored, using legacy only):", err.message);
          return null; // sentinel: news side failed
        });

      const [legacyResults, rawNews] = await Promise.all([
        legacyFetch(query, intentType),
        newsPromise,
      ]);

      let newsResults = [];
      if (rawNews !== null) {
        newsResults = adaptRetrievalResult(rawNews, { preferChunks: true, limit: 5 });
      }

      console.log(`[Hybrid] legacy=${legacyResults.length} news=${newsResults.length} total_before_cap=${legacyResults.length + newsResults.length}`);

      if (newsResults.length === 0) return legacyResults;

      // ── Step 3: Merge + deduplicate by title (case-insensitive) ──────────
      const seenTitles = new Set(
        legacyResults.map(a => (a.title ?? "").toLowerCase().trim())
      );

      const uniqueNews = newsResults.filter(a => {
        const t = (a.title ?? "").toLowerCase().trim();
        if (seenTitles.has(t)) return false;
        seenTitles.add(t);
        return true;
      });

      // Legacy results first (higher trust), unique news appended after
      const combined = [...legacyResults, ...uniqueNews];

      // ── _topScore carry-over ──────────────────────────────────────────────
      // fetchRelevantArticles attaches _topScore as a custom property on the
      // array (keyword-search path). Spread and .slice() both create new arrays
      // and drop custom properties, so we carry it over explicitly to ensure
      // assessKBStrength() uses the score-based branch instead of the less-
      // precise "vector path" fallback.
      const final = combined.slice(0, 10);
      if (legacyResults._topScore !== undefined) {
        final._topScore = legacyResults._topScore;
      }

      console.log(`[Hybrid] unique_news=${uniqueNews.length} final=${final.length} _topScore=${final._topScore ?? "n/a"}`);

      return final;
    },
  };
}
