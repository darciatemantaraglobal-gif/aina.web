/**
 * focusQueries.js — Query layer untuk tabel daily_focus_items.
 *
 * Semua fungsi hanya berurusan dengan database: tidak ada business logic di sini.
 * Menerima `supabase` client sebagai dependency injection agar mudah di-test.
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export function focusQueries(supabase) {
  return {
    /**
     * Ambil semua fokus milik user pada tanggal tertentu, urut prioritas.
     */
    async getByDate(userId, date) {
      const { data, error } = await supabase
        .from("daily_focus_items")
        .select("*")
        .eq("user_id", userId)
        .eq("focus_date", date)
        .order("priority", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    /**
     * Hitung berapa item aktif (non-done) pada tanggal tertentu.
     */
    async countActive(userId, date) {
      const { count, error } = await supabase
        .from("daily_focus_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("focus_date", date)
        .neq("status", "done");
      if (error) throw new Error(error.message);
      return count ?? 0;
    },

    /**
     * Insert satu fokus baru, kembalikan row yang baru dibuat.
     */
    async insert(payload) {
      const { data, error } = await supabase
        .from("daily_focus_items")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },

    /**
     * Update field tertentu pada satu fokus milik user.
     */
    async update(id, userId, fields) {
      const { data, error } = await supabase
        .from("daily_focus_items")
        .update(fields)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },

    /**
     * Hapus satu fokus milik user.
     */
    async delete(id, userId) {
      const { error } = await supabase
        .from("daily_focus_items")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    },

    // ── Filters ────────────────────────────────────────────────

    /**
     * Filter: fokus hari ini (semua status).
     */
    async getToday(userId) {
      const today = new Date().toISOString().slice(0, 10);
      return this.getByDate(userId, today);
    },

    /**
     * Filter: fokus belum selesai (pending + in_progress), semua tanggal.
     */
    async getPending(userId) {
      const { data, error } = await supabase
        .from("daily_focus_items")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["pending", "in_progress"])
        .order("focus_date", { ascending: false })
        .order("priority", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    /**
     * Filter: fokus N hari terakhir (untuk rekap/analitik).
     */
    async getRecentDays(userId, days = 7) {
      const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("daily_focus_items")
        .select("id, title, status, focus_date, priority")
        .eq("user_id", userId)
        .gte("focus_date", from)
        .order("focus_date", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  };
}
