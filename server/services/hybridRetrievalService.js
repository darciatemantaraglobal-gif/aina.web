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
      // ── Step 1: Legacy retrieval (selalu jalan, tidak boleh di-skip) ──────
      const legacyResults = await legacyFetch(query, intentType);

      // ── Step 2: News retrieval — best-effort, error tidak propagate ───────
      let newsResults = [];
      try {
        const rawNews = await newsSvc.retrieveByKeywords(query, {
          limit:        5,
          preferChunks: true,
        });
        newsResults = adaptRetrievalResult(rawNews, { preferChunks: true, limit: 5 });
      } catch (err) {
        console.warn("[Hybrid] News retrieval error (ignored, using legacy only):", err.message);
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

      console.log(`[Hybrid] unique_news=${uniqueNews.length} final=${Math.min(combined.length, 10)}`);

      return combined.slice(0, 10);
    },
  };
}
