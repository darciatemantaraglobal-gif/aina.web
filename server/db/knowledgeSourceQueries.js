/**
 * knowledgeSourceQueries.js — Query layer untuk tabel knowledge_sources dan knowledge_chunks.
 *
 * ADDITIVE — tidak mengubah atau menggantikan fetchRelevantArticles() maupun
 * query ke tabel knowledge_base yang sudah berjalan di server.js.
 *
 * Pola: dependency injection supabase client (sama seperti focusQueries.js).
 * Tidak ada business logic di sini — hanya raw DB access.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export function knowledgeSourceQueries(supabase) {
  return {

    // ── knowledge_sources ─────────────────────────────────────────────────────

    /**
     * Ambil satu source berdasarkan ID.
     * @param {string} id
     */
    async getSourceById(id) {
      const { data, error } = await supabase
        .from("knowledge_sources")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },

    /**
     * Ambil semua sources dengan status tertentu, diurutkan terbaru.
     * @param {'pending'|'processing'|'ready'|'rejected'} status
     * @param {{ limit?: number, offset?: number }} opts
     */
    async getSourcesByStatus(status, { limit = 20, offset = 0 } = {}) {
      const { data, error } = await supabase
        .from("knowledge_sources")
        .select("id, title, source_type, source_name, source_url, summary, tags, status, created_at")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    /**
     * Ambil sources yang siap digunakan (status = 'ready'), dengan filter opsional.
     * @param {{ sourceType?: string, tags?: string[], limit?: number }} opts
     */
    async getReadySources({ sourceType, tags, limit = 10 } = {}) {
      let q = supabase
        .from("knowledge_sources")
        .select("id, title, source_type, source_name, source_url, summary, tags, created_at")
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (sourceType) q = q.eq("source_type", sourceType);
      if (tags && tags.length > 0) q = q.overlaps("tags", tags);

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    /**
     * Full-text keyword search di title + summary + cleaned_content.
     * Dipakai oleh service layer saat retrieval diaktifkan.
     * @param {string[]} keywords
     * @param {{ limit?: number }} opts
     */
    async searchReadySources(keywords, { limit = 8 } = {}) {
      if (!keywords || keywords.length === 0) return [];

      const orFilter = keywords
        .flatMap(kw => [
          `title.ilike.%${kw}%`,
          `summary.ilike.%${kw}%`,
          `cleaned_content.ilike.%${kw}%`,
          `tags.cs.{${kw}}`,
        ])
        .join(",");

      const { data, error } = await supabase
        .from("knowledge_sources")
        .select("id, title, source_type, source_name, source_url, summary, tags, created_at")
        .eq("status", "ready")
        .or(orFilter)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw new Error(error.message);
      return data ?? [];
    },

    /**
     * Insert source baru, kembalikan row yang dibuat.
     * @param {object} payload
     */
    async insertSource(payload) {
      const { data, error } = await supabase
        .from("knowledge_sources")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },

    /**
     * Update field tertentu pada satu source.
     * @param {string} id
     * @param {object} fields
     */
    async updateSource(id, fields) {
      const { data, error } = await supabase
        .from("knowledge_sources")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },

    // ── knowledge_chunks ──────────────────────────────────────────────────────

    /**
     * Ambil semua chunks milik satu source, urut chunk_index.
     * @param {string} sourceId
     */
    async getChunksBySource(sourceId) {
      const { data, error } = await supabase
        .from("knowledge_chunks")
        .select("*")
        .eq("source_id", sourceId)
        .order("chunk_index", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    /**
     * Cari chunks berdasarkan keyword (fallback saat vector search belum aktif).
     * @param {string[]} keywords
     * @param {{ limit?: number, topic?: string }} opts
     */
    async searchChunks(keywords, { limit = 10, topic } = {}) {
      if (!keywords || keywords.length === 0) return [];

      const orFilter = keywords
        .flatMap(kw => [
          `chunk_text.ilike.%${kw}%`,
          `chunk_summary.ilike.%${kw}%`,
        ])
        .join(",");

      let q = supabase
        .from("knowledge_chunks")
        .select(`
          id, source_id, chunk_index, chunk_text, chunk_summary, topic,
          knowledge_sources!inner(title, source_name, source_url, status)
        `)
        .or(orFilter)
        .eq("knowledge_sources.status", "ready")
        .order("chunk_index", { ascending: true })
        .limit(limit);

      if (topic) q = q.eq("topic", topic);

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    /**
     * Insert banyak chunks sekaligus (bulk upsert saat indexing).
     * @param {object[]} chunks  Array of chunk payloads with source_id.
     */
    async insertChunks(chunks) {
      if (!chunks || chunks.length === 0) return [];
      const { data, error } = await supabase
        .from("knowledge_chunks")
        .insert(chunks)
        .select("id, source_id, chunk_index");
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    /**
     * Hapus semua chunks milik satu source (sebelum re-indexing).
     * @param {string} sourceId
     */
    async deleteChunksBySource(sourceId) {
      const { error } = await supabase
        .from("knowledge_chunks")
        .delete()
        .eq("source_id", sourceId);
      if (error) throw new Error(error.message);
    },

    // ── Combined ──────────────────────────────────────────────────────────────

    /**
     * Ambil satu source beserta seluruh chunks-nya sekaligus.
     * Mengembalikan { source, chunks } — source null jika tidak ditemukan.
     * Hanya membaca source dengan status 'ready' untuk keamanan.
     * @param {string} sourceId
     */
    async getSourceWithChunks(sourceId) {
      const [sourceRes, chunksRes] = await Promise.all([
        supabase
          .from("knowledge_sources")
          .select("*")
          .eq("id", sourceId)
          .eq("status", "ready")
          .maybeSingle(),
        supabase
          .from("knowledge_chunks")
          .select("*")
          .eq("source_id", sourceId)
          .order("chunk_index", { ascending: true }),
      ]);

      if (sourceRes.error) throw new Error(sourceRes.error.message);
      if (chunksRes.error) throw new Error(chunksRes.error.message);

      return { source: sourceRes.data ?? null, chunks: chunksRes.data ?? [] };
    },

    /**
     * Ambil sources dengan source_type = 'news' yang sudah ready.
     * Shortcut aman yang dipakai Phase 2 untuk membaca berita dari news-harvester.
     * @param {{ limit?: number, tags?: string[] }} opts
     */
    async getPublishedNews({ limit = 10, tags } = {}) {
      let q = supabase
        .from("knowledge_sources")
        .select("id, title, source_type, source_name, source_url, summary, tags, created_at")
        .eq("status", "ready")
        .eq("source_type", "news")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (tags && tags.length > 0) q = q.overlaps("tags", tags);

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    // ── Stats ─────────────────────────────────────────────────────────────────

    /**
     * Hitung jumlah sources per status — untuk dashboard / health check.
     */
    async countByStatus() {
      const { data, error } = await supabase
        .from("knowledge_sources")
        .select("status");
      if (error) throw new Error(error.message);

      const counts = { pending: 0, processing: 0, ready: 0, rejected: 0 };
      for (const row of (data ?? [])) {
        if (row.status in counts) counts[row.status]++;
      }
      return counts;
    },

    /**
     * Hitung total baris di knowledge_chunks — indikator seberapa banyak
     * konten yang sudah diindeks.
     * @returns {number}
     */
    async countChunksTotal() {
      const { count, error } = await supabase
        .from("knowledge_chunks")
        .select("*", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return count ?? 0;
    },

    /**
     * Hitung sources per source_type (news, article, announcement, dll).
     * Hanya yang berstatus 'ready' — mencerminkan konten aktif di pipeline.
     * @returns {Record<string, number>}
     */
    async countBySourceType() {
      const { data, error } = await supabase
        .from("knowledge_sources")
        .select("source_type")
        .eq("status", "ready");
      if (error) throw new Error(error.message);

      const counts = {};
      for (const row of (data ?? [])) {
        const t = row.source_type ?? "unknown";
        counts[t] = (counts[t] ?? 0) + 1;
      }
      return counts;
    },

    /**
     * Ambil N sources terbaru dari semua status — untuk monitoring pipeline.
     * Berbeda dengan getReadySources() yang filter hanya 'ready'.
     * @param {{ limit?: number }} opts
     */
    async getLatestSources({ limit = 10 } = {}) {
      const { data, error } = await supabase
        .from("knowledge_sources")
        .select("id, title, source_type, source_name, source_url, status, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  };
}
