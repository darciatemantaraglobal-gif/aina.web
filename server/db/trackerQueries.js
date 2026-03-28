/**
 * trackerQueries.js — Query layer untuk tabel admin_tracker_items.
 *
 * Semua fungsi hanya berurusan dengan database: tidak ada business logic di sini.
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export function trackerQueries(supabase) {
  return {
    /**
     * Ambil semua item tracker milik user dengan filter opsional.
     * @param {string} userId
     * @param {{ status?: string, category?: string, urgent?: boolean }} filters
     */
    async getAll(userId, filters = {}) {
      let q = supabase
        .from("admin_tracker_items")
        .select("*")
        .eq("user_id", userId);

      if (filters.status && filters.status !== "all") {
        q = q.eq("status", filters.status);
      }
      if (filters.category) {
        q = q.eq("category", filters.category);
      }
      if (filters.urgent === true) {
        q = q.eq("is_urgent", true);
      }

      q = q
        .order("is_urgent", { ascending: false })
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    /**
     * Insert satu item tracker baru.
     */
    async insert(payload) {
      const { data, error } = await supabase
        .from("admin_tracker_items")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },

    /**
     * Update field tertentu pada satu item milik user.
     */
    async update(id, userId, fields) {
      const { data, error } = await supabase
        .from("admin_tracker_items")
        .update(fields)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },

    /**
     * Hapus satu item milik user.
     */
    async delete(id, userId) {
      const { error } = await supabase
        .from("admin_tracker_items")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    },

    // ── Filters ────────────────────────────────────────────────

    /**
     * Filter: item urgent yang belum selesai.
     */
    async getUrgent(userId) {
      const { data, error } = await supabase
        .from("admin_tracker_items")
        .select("*")
        .eq("user_id", userId)
        .eq("is_urgent", true)
        .neq("status", "completed")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    /**
     * Filter: item yang due date-nya dalam N hari ke depan (belum selesai).
     */
    async getDueSoon(userId, days = 7) {
      const today = new Date().toISOString().slice(0, 10);
      const limit = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("admin_tracker_items")
        .select("*")
        .eq("user_id", userId)
        .neq("status", "completed")
        .gte("due_date", today)
        .lte("due_date", limit)
        .order("due_date", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    /**
     * Filter: item urgent ATAU due date dekat (kombinasi untuk dashboard alert).
     */
    async getUrgentOrDueSoon(userId, days = 7) {
      const soonDate = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("admin_tracker_items")
        .select("id, title, category, due_date, is_urgent, status")
        .eq("user_id", userId)
        .neq("status", "completed")
        .or(`is_urgent.eq.true,due_date.lte.${soonDate}`)
        .order("is_urgent", { ascending: false })
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(10);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  };
}
