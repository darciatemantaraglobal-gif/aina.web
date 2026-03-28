/**
 * focusService.js — Service layer untuk daily_focus_items.
 *
 * Bertanggung jawab atas:
 * - Business rules (max 3 aktif, validasi field)
 * - Orkestrasi query (panggil focusQueries)
 * - Format response yang konsisten
 *
 * Tidak tahu apa-apa tentang HTTP — hanya terima data, kembalikan hasil/error.
 */
import { focusQueries } from "../db/focusQueries.js";

export const MAX_ACTIVE_FOCUS = 3;

export const ALLOWED_STATUS   = ["pending", "in_progress", "done"];
export const ALLOWED_SOURCE   = ["manual", "ai_assist", "ai_suggest"];
export const UPDATABLE_FIELDS = ["status", "title", "description", "priority"];

/**
 * @param {{ getAdminClient: () => import('@supabase/supabase-js').SupabaseClient }} deps
 */
export function createFocusService({ getAdminClient }) {
  function db() { return focusQueries(getAdminClient()); }

  return {
    // ── Read ──────────────────────────────────────────────────

    /**
     * Ambil fokus hari ini milik user.
     */
    async getToday(userId) {
      const today = new Date().toISOString().slice(0, 10);
      const items = await db().getByDate(userId, today);
      return { items };
    },

    /**
     * Ambil fokus belum selesai (semua tanggal).
     */
    async getPending(userId) {
      const items = await db().getPending(userId);
      return { items };
    },

    // ── Create ────────────────────────────────────────────────

    /**
     * Buat fokus baru.
     * Rules:
     *  - title wajib ada
     *  - max 3 item aktif per hari
     *  - source_type harus valid
     */
    async create(userId, body) {
      const { title, description, source_type, focus_date, priority, original_input } = body;

      if (!title?.trim()) {
        throw Object.assign(new Error("Judul fokus diperlukan"), { status: 400 });
      }

      const sourceType = source_type || "manual";
      if (!ALLOWED_SOURCE.includes(sourceType)) {
        throw Object.assign(new Error(`source_type harus salah satu: ${ALLOWED_SOURCE.join(", ")}`), { status: 400 });
      }

      const date = focus_date || new Date().toISOString().slice(0, 10);
      const activeCount = await db().countActive(userId, date);

      if (activeCount >= MAX_ACTIVE_FOCUS) {
        throw Object.assign(
          new Error(`Maksimal ${MAX_ACTIVE_FOCUS} fokus aktif per hari`),
          { status: 400 }
        );
      }

      const item = await db().insert({
        user_id:        userId,
        focus_date:     date,
        title:          title.trim(),
        description:    description?.trim() || null,
        source_type:    sourceType,
        priority:       priority ?? null,
        original_input: original_input?.trim() || null,
      });

      return { item };
    },

    /**
     * Buat banyak fokus sekaligus (dipakai AI suggest).
     * Setiap item tetap diperiksa limit harian.
     */
    async createBulk(userId, items, sourceType = "ai_suggest") {
      const date  = new Date().toISOString().slice(0, 10);
      const saved = [];

      for (const it of items) {
        const active = await db().countActive(userId, date);
        if (active >= MAX_ACTIVE_FOCUS) break;

        const item = await db().insert({
          user_id:     userId,
          focus_date:  date,
          title:       it.title.trim(),
          description: it.description?.trim() || null,
          source_type: sourceType,
          priority:    it.priority ?? null,
        });
        saved.push(item);
      }

      return { items: saved };
    },

    // ── Update ────────────────────────────────────────────────

    /**
     * Update field yang diizinkan saja.
     */
    async update(id, userId, body) {
      const updates = {};
      for (const key of UPDATABLE_FIELDS) {
        if (body[key] !== undefined) updates[key] = body[key];
      }

      if (Object.keys(updates).length === 0) {
        throw Object.assign(new Error("Tidak ada field yang diupdate"), { status: 400 });
      }

      if (updates.status && !ALLOWED_STATUS.includes(updates.status)) {
        throw Object.assign(
          new Error(`Status harus salah satu: ${ALLOWED_STATUS.join(", ")}`),
          { status: 400 }
        );
      }

      const item = await db().update(id, userId, updates);
      return { item };
    },

    // ── Delete ────────────────────────────────────────────────

    async delete(id, userId) {
      await db().delete(id, userId);
      return { ok: true };
    },

    // ── Helpers ───────────────────────────────────────────────

    /**
     * Ringkasan fokus hari ini: total, selesai, aktif.
     */
    async getDailySummary(userId) {
      const today = new Date().toISOString().slice(0, 10);
      const items = await db().getByDate(userId, today);
      return {
        date:   today,
        total:  items.length,
        done:   items.filter(i => i.status === "done").length,
        active: items.filter(i => i.status !== "done").length,
        items,
      };
    },
  };
}
