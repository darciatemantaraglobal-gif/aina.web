/**
 * trackerService.js — Service layer untuk admin_tracker_items.
 *
 * Bertanggung jawab atas:
 * - Validasi field (category, status)
 * - Orkestrasi query (panggil trackerQueries)
 * - Format response konsisten
 *
 * Tidak tahu apa-apa tentang HTTP.
 */
import { trackerQueries } from "../db/trackerQueries.js";

export const ALLOWED_CATEGORIES = ["iqomah", "paspor", "visa", "kampus", "safar", "lainnya"];
export const ALLOWED_STATUSES   = ["not_started", "preparing", "submitted", "completed"];
export const UPDATABLE_FIELDS   = [
  "title", "category", "notes", "due_date",
  "status", "is_urgent", "reminder_enabled", "checklist_steps",
];

/**
 * @param {{ getAdminClient: () => import('@supabase/supabase-js').SupabaseClient }} deps
 */
export function createTrackerService({ getAdminClient }) {
  function db() { return trackerQueries(getAdminClient()); }

  return {
    // ── Read ──────────────────────────────────────────────────

    /**
     * Ambil semua item tracker dengan filter opsional.
     * @param {string} userId
     * @param {{ status?: string, category?: string }} query  - dari req.query
     */
    async getAll(userId, query = {}) {
      const filters = {
        status:   query.status   || "all",
        category: query.category || undefined,
      };
      const items = await db().getAll(userId, filters);
      return { items };
    },

    /**
     * Filter: item urgent yang belum selesai.
     */
    async getUrgent(userId) {
      const items = await db().getUrgent(userId);
      return { items };
    },

    /**
     * Filter: item dengan due date dekat (default 7 hari).
     */
    async getDueSoon(userId, days = 7) {
      const items = await db().getDueSoon(userId, days);
      return { items };
    },

    /**
     * Filter kombinasi: urgent ATAU due date dekat.
     * Berguna untuk dashboard alert dan reminder.
     */
    async getUrgentOrDueSoon(userId, days = 7) {
      const items = await db().getUrgentOrDueSoon(userId, days);
      return { items };
    },

    // ── Create ────────────────────────────────────────────────

    /**
     * Buat item tracker baru.
     */
    async create(userId, body) {
      const { title, category, notes, due_date, status, is_urgent, reminder_enabled, checklist_steps } = body;

      if (!title?.trim()) {
        throw Object.assign(new Error("Judul urusan diperlukan"), { status: 400 });
      }

      const cat = category || "lainnya";
      if (!ALLOWED_CATEGORIES.includes(cat)) {
        throw Object.assign(
          new Error(`Kategori harus salah satu: ${ALLOWED_CATEGORIES.join(", ")}`),
          { status: 400 }
        );
      }

      const item = await db().insert({
        user_id:          userId,
        title:            title.trim(),
        category:         cat,
        notes:            notes?.trim() || null,
        due_date:         due_date || null,
        status:           status || "not_started",
        is_urgent:        is_urgent === true || is_urgent === "true",
        reminder_enabled: reminder_enabled !== false,
        checklist_steps:  checklist_steps || null,
      });

      return { item };
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

      if (updates.category && !ALLOWED_CATEGORIES.includes(updates.category)) {
        throw Object.assign(
          new Error(`Kategori tidak valid: ${updates.category}`),
          { status: 400 }
        );
      }

      if (updates.status && !ALLOWED_STATUSES.includes(updates.status)) {
        throw Object.assign(
          new Error(`Status tidak valid: ${updates.status}`),
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
     * Ringkasan status tracker: pending, urgent, due soon.
     */
    async getSummary(userId) {
      const [allItems, urgentItems, dueSoonItems] = await Promise.all([
        db().getAll(userId, { status: "all" }),
        db().getUrgent(userId),
        db().getDueSoon(userId, 7),
      ]);

      const active = allItems.filter(i => i.status !== "completed");
      return {
        total_active: active.length,
        urgent:       urgentItems.length,
        due_soon:     dueSoonItems.length,
        by_category:  _countBy(active, "category"),
        by_status:    _countBy(active, "status"),
      };
    },
  };
}

function _countBy(arr, key) {
  return arr.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
}
