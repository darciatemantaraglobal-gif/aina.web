/**
 * smartRetrievalService.js — Smart retrieval berbasis scoring multi-dimensi.
 *
 * ADDITIVE — hanya aktif jika USE_SMART_RETRIEVAL=true.
 * Jika error, caller (resolveArticles di server.js) fallback ke hybrid lalu legacy.
 *
 * Scoring komponen (semua additive):
 *   relevanceScore  0–10  keyword/semantic match (dari _relevanceScore legacy, atau keyword hitung untuk news)
 *   freshnessScore  0–3   semakin baru semakin tinggi; hanya aktif untuk news items
 *   trustScore      0–2   legacy=2, news=1.5
 *   intentBoost    -1–+2  disesuaikan dengan intentClass query
 *
 *   finalScore = relevance + freshness + trust + intentBoost
 *
 * Dedup: title-based, simpan yang finalScore lebih tinggi.
 * Cap: 8–10 item.
 *
 * @param {{ getAdminClient: Function, legacyFetch: Function }} deps
 */
import { createNewsKnowledgeService } from "./newsKnowledgeService.js";
import {
  adaptSourceToKbFormat,
  adaptChunkToKbFormat,
} from "./newsKnowledgeAdapter.js";

// ── Intent classification ─────────────────────────────────────────────────────

const INTENT_PATTERNS = {
  fresh_update: /terbaru|update\b|berita|kebijakan|pengumuman|info baru|terkini/i,
  definition:   /apa itu|definisi|\barti\b|pengertian|maksud/i,
  procedural:   /\bcara\b|langkah|prosedur|bagaimana|tutorial|\bpanduan\b/i,
};

/**
 * Klasifikasi query → fresh_update | definition | procedural | general
 * @param {string} query
 * @returns {"fresh_update"|"definition"|"procedural"|"general"}
 */
function classifyQuery(query) {
  const q = String(query ?? "");
  for (const [cls, re] of Object.entries(INTENT_PATTERNS)) {
    if (re.test(q)) return cls;
  }
  return "general";
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

/**
 * Hitung relevance sederhana dari keyword match.
 * Dipakai untuk news items yang tidak punya _relevanceScore.
 * @param {string} text
 * @param {string} query
 * @returns {number} 0–5
 */
function keywordRelevance(text, query) {
  if (!text || !query) return 2.0; // neutral default
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3);
  if (words.length === 0) return 2.0;
  const haystack = text.toLowerCase();
  let hits = 0;
  for (const w of words) {
    if (haystack.includes(w)) hits++;
  }
  return Math.min(5, (hits / words.length) * 5);
}

/**
 * Freshness score — hanya relevan untuk news/chunks (evergreen KB tidak perlu ini).
 * @param {string|null} dateStr
 * @param {boolean} isNews
 * @returns {number} 0–3
 */
function freshnessScore(dateStr, isNews) {
  if (!dateStr || !isNews) return 0;
  const ageMs = Date.now() - new Date(dateStr).getTime();
  if (isNaN(ageMs) || ageMs < 0) return 0;
  const days = ageMs / 86_400_000;
  if (days <= 7)  return 3;
  if (days <= 30) return 2;
  if (days <= 90) return 1;
  return 0;
}

/**
 * Trust score — legacy KB lebih terpercaya karena sudah dikurasi.
 * @param {boolean} isNews
 * @returns {number} 1.5–2
 */
function trustScore(isNews) {
  return isNews ? 1.5 : 2.0;
}

/**
 * Intent alignment boost.
 * fresh_update → boost news, penalti legacy
 * definition   → boost legacy, slight penalti news
 * procedural   → slight boost legacy, netral news
 * general      → netral semua
 * @param {"fresh_update"|"definition"|"procedural"|"general"} intentClass
 * @param {boolean} isNews
 * @returns {number} -1–+2
 */
function intentBoost(intentClass, isNews) {
  switch (intentClass) {
    case "fresh_update": return isNews ?  2.0 : -0.5;
    case "definition":   return isNews ? -0.5 :  1.5;
    case "procedural":   return isNews ?  0.0 :  0.5;
    default:             return 0;
  }
}

/**
 * Skor total satu artikel.
 * @param {object} article  KB-compatible article (sudah di-adapt)
 * @param {string} query
 * @param {"fresh_update"|"definition"|"procedural"|"general"} intentClass
 * @returns {number}
 */
function scoreArticle(article, query, intentClass) {
  const isNews = article._origin === "news_harvester" ||
                 article._origin === "news_harvester_chunk";

  // Relevance — pakai _relevanceScore per-article dari legacy jika tersedia
  const rel = article._relevanceScore !== undefined
    ? article._relevanceScore
    : keywordRelevance(
        `${article.title ?? ""} ${article.content ?? ""} ${article.summary ?? ""}`,
        query
      );

  // Date field — news adapter sets `last_updated` from chunk.created_at or source dates
  const dateStr = article.last_updated ?? article.created_at ?? null;

  return rel
    + freshnessScore(dateStr, isNews)
    + trustScore(isNews)
    + intentBoost(intentClass, isNews);
}

// ── Service factory ───────────────────────────────────────────────────────────

export function createSmartRetrievalService({ getAdminClient, legacyFetch }) {
  const newsSvc = createNewsKnowledgeService({ getAdminClient });

  return {
    /**
     * @param {string} query       kbQuery (expanded)
     * @param {string} intentType  intent.primary dari intentDetector
     * @returns {Promise<object[]>} Array KB-compatible articles, sorted by finalScore
     */
    async retrieve(query, intentType) {
      const intentClass = classifyQuery(query);
      console.log(`[Smart] query="${query.slice(0, 60)}" intentClass=${intentClass}`);

      // ── Parallel fetch: legacy (mandatory) + news (best-effort) ─────────
      const newsPromise = newsSvc
        .retrieveByKeywords(query, { limit: 8, preferChunks: true })
        .catch(err => {
          console.warn("[Smart] News fetch error (ignored):", err.message);
          return null; // sentinel
        });

      const [legacyResults, rawNews] = await Promise.all([
        legacyFetch(query, intentType),
        newsPromise,
      ]);

      // ── Adapt news → KB-compatible with _origin tags ─────────────────────
      let newsItems = [];
      if (rawNews !== null) {
        const { sources = [], chunks = [] } = rawNews;
        if (chunks.length > 0) {
          newsItems = chunks
            .slice(0, 8)
            .map(c => adaptChunkToKbFormat(c, c.knowledge_sources ?? null))
            .filter(Boolean);
        } else {
          newsItems = sources
            .slice(0, 8)
            .map(adaptSourceToKbFormat)
            .filter(Boolean);
        }
      }

      console.log(`[Smart] legacy=${legacyResults.length} news=${newsItems.length}`);

      // ── Score every item ──────────────────────────────────────────────────
      const allItems = [
        ...legacyResults.map(a => ({ ...a })), // shallow copy so we don't mutate originals
        ...newsItems,
      ];

      const scored = allItems.map(a => {
        try {
          const s = scoreArticle(a, query, intentClass);
          return { ...a, _finalScore: s };
        } catch {
          return { ...a, _finalScore: 0 };
        }
      });

      // ── Deduplicate by title — keep highest score ─────────────────────────
      const titleMap = new Map(); // title → index into deduped
      const deduped  = [];

      for (const item of scored) {
        const key = (item.title ?? "").toLowerCase().trim();
        if (!key) { deduped.push(item); continue; } // no title → keep as-is
        if (titleMap.has(key)) {
          const idx = titleMap.get(key);
          if (item._finalScore > deduped[idx]._finalScore) {
            deduped[idx] = item; // replace with higher-scored version
          }
        } else {
          titleMap.set(key, deduped.length);
          deduped.push(item);
        }
      }

      // ── Sort descending by finalScore, cap at 10 ──────────────────────────
      deduped.sort((a, b) => b._finalScore - a._finalScore);
      const final = deduped.slice(0, 10);

      // ── Carry _topScore from legacy so assessKBStrength stays accurate ────
      if (legacyResults._topScore !== undefined) {
        final._topScore = legacyResults._topScore;
      }

      // ── Logging ───────────────────────────────────────────────────────────
      const topItem   = final[0];
      const topOrigin = topItem?._origin ?? "legacy";
      const topScore  = topItem?._finalScore?.toFixed(2) ?? "n/a";
      console.log(
        `[Smart] intentClass=${intentClass} legacy=${legacyResults.length}` +
        ` news=${newsItems.length} final=${final.length}` +
        ` top="${topItem?.title?.slice(0, 40) ?? "-"}" origin=${topOrigin} score=${topScore}`
      );

      return final;
    },
  };
}
