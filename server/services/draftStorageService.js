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

/* ── 4. publishDraftToKnowledgeBase ──────────────────────────────────── */

/**
 * Salin draft ke knowledge_base supaya benar-benar ikut retrieval AI, lalu
 * tandai draft-nya 'approved'.
 *
 * Sebelumnya ini placeholder yang sengaja throw, jadi seluruh rantai
 * gap → draft → approve buntu di sini: draft bisa di-approve tapi tidak
 * pernah sampai ke knowledge_base, sehingga AI tidak pernah jadi lebih pintar
 * dari proses ini.
 *
 * Dua field sengaja WAJIB dikirim caller, bukan ditebak:
 *   category — knowledge_base.category NOT NULL, dan menebak kategori artikel
 *              secara otomatis adalah persis jenis kesalahan yang merusak
 *              kualitas retrieval. Admin yang me-review yang memilih.
 *   authorId — knowledge_base.author_id NOT NULL. Yang tercatat sebagai penulis
 *              adalah admin yang menyetujui, supaya jejak pertanggungjawabannya
 *              jelas: artikel ini dibuat mesin, disetujui orang ini.
 *
 * @param {string} draftId
 * @param {{ getAdminClient: Function, embedArticle?: Function }} deps
 * @param {{ category: string, authorId: string, articleType?: string, status?: string }} opts
 * @returns {Promise<{ article: Object, draft: Object }>}
 */
export async function publishDraftToKnowledgeBase(draftId, deps, opts = {}) {
  const { getAdminClient, embedArticle } = deps;
  const supabase = getAdminClient();
  const { category, authorId, articleType = "narrative", status = "approved" } = opts;

  if (!draftId?.trim()) throw new Error("ID draft tidak boleh kosong");
  if (!category?.trim()) throw new Error("category wajib diisi — pilih kategori knowledge_base saat approve");
  if (!authorId?.trim()) throw new Error("authorId wajib diisi — diambil dari admin yang menyetujui");

  const { data: draft, error: readErr } = await supabase
    .from("kb_drafts")
    .select("*")
    .eq("id", draftId)
    .single();
  if (readErr) throw new Error(`publishDraft: draft tidak terbaca — ${readErr.message}`);
  if (!draft) throw new Error(`Draft dengan ID ${draftId} tidak ditemukan`);

  // Tolak publikasi ganda: kalau sudah approved, kemungkinan besar sudah pernah
  // disalin, dan artikel kembar di KB bikin retrieval makin buruk, bukan lebih baik.
  if (draft.status === "approved") {
    throw new Error("Draft ini sudah berstatus 'approved' — cek knowledge_base dulu sebelum publish ulang agar tidak duplikat.");
  }

  const { data: article, error: insertErr } = await supabase
    .from("knowledge_base")
    .insert({
      author_id:    authorId,
      title:        draft.title,
      content:      draft.content,
      category:     category.trim(),
      article_type: articleType,
      // Draft mesin masuk sebagai artikel aktif hanya karena seorang admin
      // menekan approve — jadi langsung 'approved', bukan 'pending' lagi.
      status,
      keywords:     Array.isArray(draft.tags) && draft.tags.length ? draft.tags.join(", ") : null,
      last_updated: new Date().toISOString(),
    })
    .select()
    .single();
  if (insertErr) throw new Error(`publishDraft: gagal insert ke knowledge_base — ${insertErr.message}`);

  const { data: updatedDraft, error: updErr } = await supabase
    .from("kb_drafts")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", draftId)
    .select()
    .single();
  if (updErr) {
    // Artikelnya sudah masuk KB — ini cuma gagal mencatat statusnya. Jangan
    // gagalkan seluruh operasi, tapi jangan diam juga.
    console.warn(`[publishDraft] artikel ${article.id} sudah masuk KB tapi status draft gagal diupdate: ${updErr.message}`);
  }

  // Tanpa embedding, artikel baru hanya bisa ketemu lewat keyword — separuh
  // dari sistem retrieval. Fire-and-forget supaya admin tidak menunggu.
  if (typeof embedArticle === "function") {
    Promise.resolve(embedArticle(article.id))
      .catch(e => console.warn(`[publishDraft] embedding artikel ${article.id} gagal: ${e.message}`));
  }

  console.log(`[publishDraft] draft "${draft.title}" → knowledge_base ${article.id} (kategori: ${category})`);
  return { article, draft: updatedDraft ?? draft };
}
