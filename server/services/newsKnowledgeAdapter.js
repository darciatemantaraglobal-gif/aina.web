/**
 * newsKnowledgeAdapter.js — Adapter layer untuk mengonversi schema knowledge baru
 * (knowledge_sources / knowledge_chunks) ke format yang kompatibel dengan
 * output fetchRelevantArticles() di server.js.
 *
 * ADDITIVE — tidak diimport oleh server.js atau route chat utama.
 * Digunakan oleh newsKnowledgeService dan knowledgeTest route untuk
 * membuktikan kompatibilitas format sebelum integrasi penuh.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Format output fetchRelevantArticles() (schema lama - knowledge_base):
 *   { title, content, category, hidden, last_updated,
 *     article_type?, keywords?, maps_url?, summary?, important_notes? }
 *
 * Format knowledge_sources (schema baru):
 *   { id, title, source_type, source_name, source_url, summary,
 *     tags, status, cleaned_content, created_at, updated_at }
 *
 * Format knowledge_chunks (schema baru):
 *   { id, source_id, chunk_index, chunk_text, chunk_summary, topic,
 *     metadata_json, created_at }
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NOTE — Status naming:
 *   Schema AINA memakai 'ready' sebagai padanan 'published' dari news-harvester.
 *   Jika news-harvester memakai status 'published', CHECK constraint di Supabase
 *   perlu di-update:
 *     ALTER TABLE knowledge_sources
 *       DROP CONSTRAINT IF EXISTS knowledge_sources_status_check,
 *       ADD CONSTRAINT knowledge_sources_status_check
 *         CHECK (status IN ('pending','processing','ready','rejected','published'));
 */

// ── Source adapter ────────────────────────────────────────────────────────────

/**
 * Konversi satu baris knowledge_sources → format kompatibel dengan KB lama.
 * Hasilnya bisa langsung disatukan dengan output fetchRelevantArticles().
 *
 * @param {object} source  Row dari tabel knowledge_sources
 * @returns {object}       KB-compatible article object
 */
export function adaptSourceToKbFormat(source) {
  if (!source) return null;

  return {
    // ── Field mapping ke schema KB lama ──────────────────────────
    title:           source.title,
    content:         source.cleaned_content ?? source.summary ?? "",
    category:        mapSourceTypeToCategory(source.source_type),
    hidden:          false,   // ready sources are public by definition
    last_updated:    source.updated_at ?? source.created_at ?? null,

    // ── Optional fields (KB lama juga optional) ───────────────────
    article_type:    source.source_type ?? null,
    keywords:        Array.isArray(source.tags) ? source.tags.join(", ") : null,
    summary:         source.summary ?? null,
    maps_url:        null,          // not applicable for news
    important_notes: null,          // not applicable for news

    // ── Extra metadata (aman karena promptBuilder hanya pakai field di atas) ──
    _source_id:      source.id,
    _source_name:    source.source_name ?? null,
    _source_url:     source.source_url ?? null,
    _origin:         "news_harvester",
  };
}

/**
 * Konversi satu baris knowledge_chunks → format mirip KB lama.
 * Chunks lebih granular — berguna untuk retrieval berbasis chunk.
 *
 * @param {object} chunk   Row dari tabel knowledge_chunks
 * @param {object} [source] Opsional: parent knowledge_sources row untuk enrichment
 * @returns {object}
 */
export function adaptChunkToKbFormat(chunk, source = null) {
  if (!chunk) return null;

  return {
    title:           source?.title ?? `Chunk #${chunk.chunk_index}`,
    content:         chunk.chunk_text,
    category:        source ? mapSourceTypeToCategory(source.source_type) : "News",
    hidden:          false,
    last_updated:    chunk.created_at ?? null,

    article_type:    "chunk",
    keywords:        chunk.topic ?? null,
    summary:         chunk.chunk_summary ?? null,
    maps_url:        null,
    important_notes: null,

    _chunk_id:       chunk.id,
    _source_id:      chunk.source_id,
    _chunk_index:    chunk.chunk_index,
    _topic:          chunk.topic ?? null,
    _origin:         "news_harvester_chunk",
  };
}

/**
 * Konversi hasil penuh retrieveByKeywords() → array KB-compatible articles.
 * Prioritas: chunks (lebih granular) lalu sources sebagai fallback.
 *
 * @param {{ sources: object[], chunks: object[] }} result
 * @param {{ preferChunks?: boolean, limit?: number }} opts
 * @returns {object[]}  Array siap disatukan dengan output fetchRelevantArticles()
 */
export function adaptRetrievalResult({ sources = [], chunks = [] }, { preferChunks = true, limit = 5 } = {}) {
  if (preferChunks && chunks.length > 0) {
    return chunks
      .slice(0, limit)
      .map(c => adaptChunkToKbFormat(c, c.knowledge_sources ?? null));
  }

  return sources
    .slice(0, limit)
    .map(adaptSourceToKbFormat)
    .filter(Boolean);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Petakan source_type dari news-harvester ke category yang dipakai KB lama.
 * @param {string} [sourceType]
 * @returns {string}
 */
function mapSourceTypeToCategory(sourceType) {
  const MAP = {
    news:         "News",
    article:      "Artikel",
    announcement: "Pengumuman",
    guide:        "Panduan",
    faq:          "FAQ",
    other:        "Lainnya",
  };
  return MAP[sourceType] ?? "News";
}
