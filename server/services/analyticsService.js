/**
 * analyticsService.js — Service layer untuk query_analytics dan query_feedback.
 *
 * ADDITIVE — tidak menyentuh chat flow, retrieval, atau UI.
 * Semua metode non-critical; error di-swallow dan di-log sebagai warning.
 *
 * @param {{ getAdminClient: Function }} deps
 */
import { analyticsQueries } from "../db/analyticsQueries.js";

export function createAnalyticsService({ getAdminClient }) {
  function db() {
    const client = getAdminClient();
    if (!client) throw new Error("Admin DB client tidak tersedia");
    return analyticsQueries(client);
  }

  return {

    // ── Query logging ─────────────────────────────────────────────────────────

    /**
     * Simpan satu analytics entry. Selalu best-effort — tidak pernah throw.
     * @param {object} fields
     */
    async logQuery(fields) {
      try {
        return await db().insertQuery(fields);
      } catch (err) {
        console.warn("[Analytics] logQuery failed (non-critical):", err.message);
        return null;
      }
    },

    // ── Summary endpoints ─────────────────────────────────────────────────────

    /**
     * Ringkasan aggregate: total queries, per intent, per retrieval_mode,
     * external fallback count, berdasarkan data N hari terakhir.
     * @param {{ days?: number }} opts
     */
    async getSummary({ days = 30 } = {}) {
      const rows = await db().getRecent({ days, limit: 5000 });

      const total = rows.length;
      const byIntent     = {};
      const byMode       = {};
      let externalCount  = 0;

      for (const r of rows) {
        const intent = r.intent_class ?? "unknown";
        const mode   = r.retrieval_mode ?? "legacy";
        byIntent[intent] = (byIntent[intent] ?? 0) + 1;
        byMode[mode]     = (byMode[mode]     ?? 0) + 1;
        if (r.used_external_fallback) externalCount++;
      }

      return {
        period_days:            days,
        total_queries:          total,
        by_intent_class:        byIntent,
        by_retrieval_mode:      byMode,
        used_external_fallback: externalCount,
        external_fallback_pct:  total ? Math.round(externalCount / total * 100) : 0,
      };
    },

    /**
     * Top N query_text berdasarkan frekuensi dalam N hari terakhir.
     * @param {{ limit?: number, days?: number }} opts
     */
    async getTopQueries({ limit = 20, days = 30 } = {}) {
      const rows = await db().getRecent({ days, limit: 5000 });

      // Aggregate by normalized query_text (lowercase + trim)
      const freq = {};
      for (const r of rows) {
        if (!r.query_text) continue;
        const key = r.query_text.toLowerCase().trim().slice(0, 200);
        freq[key] = (freq[key] ?? 0) + 1;
      }

      return Object.entries(freq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([query, count]) => ({ query, count }));
    },

    /**
     * Query yang sering tidak terlayani KB atau butuh external fallback.
     * @param {{ limit?: number }} opts
     */
    async getWeakQueries({ limit = 20 } = {}) {
      return db().getWeakQueries({ limit });
    },

    /**
     * Distribusi top_origin: berapa query dominan legacy vs news vs mixed.
     * @param {{ days?: number }} opts
     */
    async getSourceMix({ days = 30 } = {}) {
      const rows = await db().getRecent({ days, limit: 5000 });

      const mix = { legacy: 0, news: 0, mixed: 0 };
      for (const r of rows) {
        const o = r.top_origin ?? "legacy";
        mix[o] = (mix[o] ?? 0) + 1;
      }

      const total = rows.length;
      return {
        period_days: days,
        total:       total,
        by_origin:   mix,
        pct: {
          legacy: total ? Math.round(mix.legacy / total * 100) : 0,
          news:   total ? Math.round(mix.news   / total * 100) : 0,
          mixed:  total ? Math.round(mix.mixed  / total * 100) : 0,
        },
      };
    },

    // ── Feedback ──────────────────────────────────────────────────────────────

    /**
     * Ringkasan feedback: total up/down + ratio.
     */
    async getFeedbackSummary() {
      const counts = await db().getFeedbackCounts();
      const total  = counts.up + counts.down;
      return {
        total,
        up:       counts.up,
        down:     counts.down,
        approval: total ? Math.round(counts.up / total * 100) : null,
      };
    },

    /**
     * Topik yang banyak dapat feedback 'down' — berguna untuk perbaikan KB.
     * @param {{ limit?: number }} opts
     */
    async getLowRatedTopics({ limit = 20 } = {}) {
      return db().getDownFeedback({ limit });
    },

    /**
     * Submit feedback dari user (dipanggil dari future feedback endpoint).
     * @param {object} payload
     */
    async submitFeedback(payload) {
      return db().insertFeedback(payload);
    },
  };
}
