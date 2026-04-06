/**
 * draftStorageService.js — Simpan, ambil, dan update status draft artikel KB.
 *
 * Tabel: kb_drafts (harus dibuat via migration SQL)
 * Tidak terhubung ke knowledge_base — draft tidak masuk ke retrieval.
 *
 * Functions:
 *   saveDraft(draft, deps)           — simpan draft baru (status='draft')
 *   getDrafts(status, deps)          — ambil list draft berdasarkan status
 *   updateDraftStatus(id, status, deps) — ubah status draft
 *   publishDraftToKnowledgeBase(draftId, deps) — PLACEHOLDER, tidak dipanggil otomatis
 */

const VALID_STATUSES = ["draft", "approved", "rejected"];

/* ── 1. saveDraft ────────────────────────────────────────────────────── */

/**
 * Simpan draft ke tabel kb_drafts.
 *
 * @param {{ topic, title, content, suggested_tags, model_used? }} draft
 * @param {{ getAdminClient: Function }} deps
 * @returns {Promise<Object>} — baris yang tersimpan
 */
export async function saveDraft(draft, deps) {
  const { getAdminClient } = deps;
  const supabase = getAdminClient();

  const { topic, title, content, suggested_tags, model_used } = draft;
  if (!title?.trim() || !content?.trim()) {
    throw new Error("saveDraft: title dan content tidak boleh kosong");
  }

  const { data, error } = await supabase
    .from("kb_drafts")
    .insert({
      topic:   topic   || null,
      title:   title.trim(),
      content: content.trim(),
      tags:    Array.isArray(suggested_tags) ? suggested_tags : [],
      source:  model_used ? `auto-generated (${model_used})` : "auto-generated",
      status:  "draft",
    })
    .select()
    .single();

  if (error) throw new Error(`saveDraft DB error: ${error.message}`);
  return data;
}

/* ── 2. getDrafts ────────────────────────────────────────────────────── */

/**
 * Ambil list draft berdasarkan status.
 *
 * @param {string} [status='draft'] — 'draft' | 'approved' | 'rejected' | 'all'
 * @param {{ getAdminClient: Function }} deps
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array>}
 */
export async function getDrafts(status = "draft", deps, opts = {}) {
  const { getAdminClient } = deps;
  const supabase = getAdminClient();
  const { limit = 50 } = opts;

  let query = supabase
    .from("kb_drafts")
    .select("id, topic, title, tags, source, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 100));

  if (status !== "all") {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Status tidak valid: ${status}. Gunakan: ${VALID_STATUSES.join(", ")}`);
    }
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`getDrafts DB error: ${error.message}`);
  return data || [];
}

/* ── 3. updateDraftStatus ────────────────────────────────────────────── */

/**
 * Update status draft (approved / rejected).
 *
 * @param {string} id — UUID draft
 * @param {string} status — 'approved' | 'rejected'
 * @param {{ getAdminClient: Function }} deps
 * @returns {Promise<Object>} — baris yang diupdate
 */
export async function updateDraftStatus(id, status, deps) {
  const { getAdminClient } = deps;
  const supabase = getAdminClient();

  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Status tidak valid: ${status}`);
  }
  if (!id?.trim()) throw new Error("ID draft tidak boleh kosong");

  const { data, error } = await supabase
    .from("kb_drafts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateDraftStatus DB error: ${error.message}`);
  if (!data)  throw new Error(`Draft dengan ID ${id} tidak ditemukan`);
  return data;
}

/* ── 4. publishDraftToKnowledgeBase — PLACEHOLDER ───────────────────── */

/**
 * PLACEHOLDER — Ambil draft dan insert ke knowledge_base, lalu set status = approved.
 *
 * ⚠️  TIDAK DIPANGGIL OTOMATIS. Harus dipanggil manual oleh admin setelah review.
 * Implementasi lengkap perlu skema knowledge_base (title, content, tags, dll).
 *
 * @param {string} _draftId
 * @param {Object} _deps
 */
export async function publishDraftToKnowledgeBase(_draftId, _deps) {
  throw new Error(
    "publishDraftToKnowledgeBase belum diimplementasi. " +
    "Lakukan manual: approve draft, lalu copy content ke knowledge_base melalui admin panel."
  );
}
