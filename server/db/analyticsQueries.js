/**
 * analyticsQueries.js — Query layer untuk query_analytics dan query_feedback.
 *
 * ADDITIVE — tidak menyentuh query_log, knowledge_base, atau retrieval existing.
 * Semua operasi bersifat best-effort; error tidak dipropagasikan ke chat flow.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export function analyticsQueries(supabase) {
  return {

    // ── query_analytics ───────────────────────────────────────────────────────

    /**
     * Insert satu baris analytics. Dipanggil fire-and-forget dari chat handler.
     * Jika tabel belum ada, error akan di-catch oleh caller.
     * @param {object} payload
     */
    async insertQuery(payload) {
      const { data, error } = await supabase
        .from("query_analytics")
        .insert({
          user_id:               payload.userId               ?? null,
          query_text:            (payload.queryText ?? "").slice(0, 500) || null,
          intent_class:          payload.intentClass           ?? null,
          retrieval_mode:        payload.retrievalMode         ?? "legacy",
          legacy_count:          payload.legacyCount           ?? 0,
          news_count:            payload.newsCount             ?? 0,
          final_count:           payload.finalCount            ?? 0,
          top_origin:            payload.topOrigin             ?? "legacy",
          kb_strength:           payload.kbStrength            ?? null,
          used_external_fallback: payload.usedExternalFallback ?? false,
          response_status:       payload.responseStatus        ?? "success",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data?.id ?? null;
    },

    /**
     * Ambil semua baris analytics dalam N hari terakhir.
     * Digunakan oleh service layer untuk agregasi di JS (lightweight).
     * @param {{ days?: number, limit?: number }} opts
     */
    async getRecent({ days = 30, limit = 2000 } = {}) {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("query_analytics")
        .select("intent_class, retrieval_mode, top_origin, kb_strength, used_external_fallback, query_text, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    /**
     * Ambil N baris terbaru dengan kb_strength = 'weak' atau used_external_fallback = true.
     * Berguna untuk mendeteksi query yang tidak terlayani KB.
     * @param {{ limit?: number }} opts
     */
    async getWeakQueries({ limit = 20 } = {}) {
      const { data, error } = await supabase
        .from("query_analytics")
        .select("query_text, intent_class, kb_strength, retrieval_mode, used_external_fallback, created_at")
        .or("kb_strength.eq.weak,kb_strength.eq.absent,used_external_fallback.eq.true")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    // ── query_feedback ────────────────────────────────────────────────────────

    /**
     * Insert satu feedback entry.
     * @param {object} payload
     */
    async insertFeedback(payload) {
      const { data, error } = await supabase
        .from("query_feedback")
        .insert({
          query_analytics_id: payload.queryAnalyticsId ?? null,
          user_id:            payload.userId            ?? null,
          feedback_type:      payload.feedbackType,
          notes:              payload.notes             ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data?.id ?? null;
    },

    /**
     * Ambil ringkasan feedback (total up/down).
     */
    async getFeedbackCounts() {
      const { data, error } = await supabase
        .from("query_feedback")
        .select("feedback_type");
      if (error) throw new Error(error.message);
      const counts = { up: 0, down: 0 };
      for (const row of (data ?? [])) {
        if (row.feedback_type in counts) counts[row.feedback_type]++;
      }
      return counts;
    },

    /**
     * Ambil feedback 'down' terbaru untuk melihat topik yang lemah.
     * @param {{ limit?: number }} opts
     */
    async getDownFeedback({ limit = 20 } = {}) {
      const { data, error } = await supabase
        .from("query_feedback")
        .select(`
          id, notes, created_at,
          query_analytics!inner(query_text, intent_class, kb_strength)
        `)
        .eq("feedback_type", "down")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  };
}
