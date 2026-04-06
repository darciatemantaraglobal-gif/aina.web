/**
 * newsKnowledgeService.js — Service layer untuk knowledge_sources & knowledge_chunks.
 *
 * ADDITIVE — tidak mengubah, tidak menggantikan, dan tidak dipanggil oleh
 * route chat utama (/api/chat). fetchRelevantArticles() di server.js tetap
 * menjadi default retrieval pipeline.
 *
 * File ini disiapkan sebagai fondasi integrasi dengan repo news-harvester yang
 * memakai Supabase yang sama. Aktivasi penuh (wiring ke chat) dilakukan di tahap
 * berikutnya secara terpisah.
 *
 * Pola: sama dengan focusService.js — factory function, dependency injection.
 *
 * @param {{ getAdminClient: () => import('@supabase/supabase-js').SupabaseClient }} deps
 */
import { knowledgeSourceQueries } from "../db/knowledgeSourceQueries.js";

// ── Constants ─────────────────────────────────────────────────────────────────

export const VALID_SOURCE_TYPES = ["article", "news", "announcement", "guide", "faq", "other"];
export const VALID_STATUSES     = ["pending", "processing", "ready", "rejected"];

// Chunk size guidance (chars) — not enforced here, used by indexing callers
export const RECOMMENDED_CHUNK_SIZE    = 800;
export const RECOMMENDED_CHUNK_OVERLAP = 150;

// ── Service factory ───────────────────────────────────────────────────────────

export function createNewsKnowledgeService({ getAdminClient }) {
  function db() { return knowledgeSourceQueries(getAdminClient()); }

  return {

    // ── Sources ───────────────────────────────────────────────────────────────

    /**
     * Ambil satu source lengkap berdasarkan ID.
     * @param {string} id
     */
    async getSource(id) {
      const source = await db().getSourceById(id);
      return { source };
    },

    /**
     * Ambil sources siap pakai (status = 'ready'), dengan filter opsional.
     * @param {{ sourceType?: string, tags?: string[], limit?: number }} opts
     */
    async getReadySources(opts = {}) {
      const sources = await db().getReadySources(opts);
      return { sources, count: sources.length };
    },

    /**
     * Ambil sources berdasarkan status — untuk monitoring / admin dashboard.
     * @param {'pending'|'processing'|'ready'|'rejected'} status
     * @param {{ limit?: number, offset?: number }} opts
     */
    async getSourcesByStatus(status, opts = {}) {
      if (!VALID_STATUSES.includes(status)) {
        throw Object.assign(
          new Error(`status harus salah satu: ${VALID_STATUSES.join(", ")}`),
          { status: 400 }
        );
      }
      const sources = await db().getSourcesByStatus(status, opts);
      return { sources, count: sources.length };
    },

    /**
     * Ingest source baru dari news-harvester.
     * Validasi minimal, kemudian simpan dengan status 'pending'.
     *
     * @param {object} payload
     * @param {string} payload.title
     * @param {string} [payload.source_type]
     * @param {string} [payload.source_name]
     * @param {string} [payload.source_url]
     * @param {string} [payload.summary]
     * @param {string[]} [payload.tags]
     * @param {string} [payload.cleaned_content]
     */
    async ingestSource(payload) {
      const { title, source_type, source_name, source_url, summary, tags, cleaned_content } = payload;

      if (!title?.trim()) {
        throw Object.assign(new Error("title wajib diisi"), { status: 400 });
      }

      const sourceType = source_type ?? "article";
      if (!VALID_SOURCE_TYPES.includes(sourceType)) {
        throw Object.assign(
          new Error(`source_type harus salah satu: ${VALID_SOURCE_TYPES.join(", ")}`),
          { status: 400 }
        );
      }

      const source = await db().insertSource({
        title:           title.trim(),
        source_type:     sourceType,
        source_name:     source_name?.trim()  ?? null,
        source_url:      source_url?.trim()   ?? null,
        summary:         summary?.trim()      ?? null,
        tags:            Array.isArray(tags) ? tags : [],
        status:          "pending",
        cleaned_content: cleaned_content?.trim() ?? null,
      });

      return { source };
    },

    /**
     * Bulk ingest: terima array sources, proses satu per satu, kembalikan laporan.
     * @param {object[]} items
     */
    async ingestBulk(items) {
      if (!Array.isArray(items) || items.length === 0) {
        throw Object.assign(new Error("items harus berupa array tidak kosong"), { status: 400 });
      }

      const results = { ingested: [], failed: [] };
      for (const item of items) {
        try {
          const { source } = await this.ingestSource(item);
          results.ingested.push({ id: source.id, title: source.title });
        } catch (err) {
          results.failed.push({ title: item.title ?? "(tanpa judul)", reason: err.message });
        }
      }
      return results;
    },

    /**
     * Update status source (e.g. pending → processing → ready).
     * @param {string} id
     * @param {'pending'|'processing'|'ready'|'rejected'} newStatus
     */
    async updateStatus(id, newStatus) {
      if (!VALID_STATUSES.includes(newStatus)) {
        throw Object.assign(
          new Error(`status harus salah satu: ${VALID_STATUSES.join(", ")}`),
          { status: 400 }
        );
      }
      const source = await db().updateSource(id, { status: newStatus });
      return { source };
    },

    // ── Chunks ────────────────────────────────────────────────────────────────

    /**
     * Simpan chunks untuk satu source.
     * Menghapus chunks lama terlebih dahulu (idempotent re-index).
     *
     * @param {string} sourceId
     * @param {Array<{ chunk_index: number, chunk_text: string, chunk_summary?: string, topic?: string, metadata_json?: object }>} chunks
     */
    async indexChunks(sourceId, chunks) {
      if (!sourceId) {
        throw Object.assign(new Error("sourceId diperlukan"), { status: 400 });
      }
      if (!Array.isArray(chunks) || chunks.length === 0) {
        throw Object.assign(new Error("chunks harus berupa array tidak kosong"), { status: 400 });
      }

      // Delete old chunks first (idempotent)
      await db().deleteChunksBySource(sourceId);

      const payload = chunks.map((c, i) => ({
        source_id:     sourceId,
        chunk_index:   c.chunk_index ?? i,
        chunk_text:    c.chunk_text,
        chunk_summary: c.chunk_summary ?? null,
        topic:         c.topic ?? null,
        metadata_json: c.metadata_json ?? {},
      }));

      const inserted = await db().insertChunks(payload);

      // Mark source as ready after successful chunk indexing
      await db().updateSource(sourceId, { status: "ready" });

      return { chunksIndexed: inserted.length, sourceId };
    },

    /**
     * Ambil semua chunks milik satu source.
     * @param {string} sourceId
     */
    async getChunks(sourceId) {
      const chunks = await db().getChunksBySource(sourceId);
      return { chunks, count: chunks.length };
    },

    // ── Retrieval (future integration point) ──────────────────────────────────

    /**
     * Keyword-based retrieval dari knowledge_sources + knowledge_chunks.
     *
     * CATATAN: Fungsi ini BELUM dipanggil oleh route chat utama (/api/chat).
     * Ini adalah entry point yang disiapkan untuk tahap integrasi berikutnya.
     * Chat saat ini tetap menggunakan fetchRelevantArticles() di server.js.
     *
     * @param {string} query
     * @param {{ limit?: number, preferChunks?: boolean }} opts
     * @returns {{ sources: object[], chunks: object[] }}
     */
    async retrieveByKeywords(query, { limit = 5, preferChunks = true } = {}) {
      const keywords = query
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter(w => w.length >= 3)
        .slice(0, 12);

      if (keywords.length === 0) return { sources: [], chunks: [] };

      const [sources, chunks] = await Promise.all([
        db().searchReadySources(keywords, { limit }),
        preferChunks ? db().searchChunks(keywords, { limit }) : Promise.resolve([]),
      ]);

      return { sources, chunks };
    },

    // ── Stats / Health ─────────────────────────────────────────────────────────

    /**
     * Ringkasan jumlah sources per status — untuk health check / admin.
     */
    async getStats() {
      const counts = await db().countByStatus();
      return { counts };
    },
  };
}
