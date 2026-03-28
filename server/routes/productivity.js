/**
 * productivity.js — Express router untuk semua endpoint /api/productivity
 *
 * Menggunakan factory pattern: menerima { verifyAuth, getAdminClient } dari
 * server.js agar tidak perlu mengekstrak helper ke file tersendiri.
 *
 * Route yang ada di sini: CRUD fokus harian + CRUD admin tracker.
 * AI logic dan reminder tetap di server.js (belum dipindahkan).
 */
import { Router } from "express";
import { createFocusService } from "../services/focusService.js";
import { createTrackerService } from "../services/trackerService.js";

/**
 * @param {{ verifyAuth: Function, getAdminClient: Function }} deps
 * @returns {Router}
 */
export function createProductivityRouter({ verifyAuth, getAdminClient }) {
  const router    = Router();
  const focusSvc  = createFocusService({ getAdminClient });
  const trackerSvc = createTrackerService({ getAdminClient });

  // Helper: wraps async handler, otomatis tangkap error dan kirim JSON
  const h = (fn) => async (req, res) => {
    try {
      const user = await verifyAuth(req.headers.authorization);
      if (!user) return res.status(401).json({ error: "Login diperlukan" });
      await fn(req, res, user);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message || "Terjadi kesalahan" });
    }
  };

  // ════════════════════════════════════════════════════════
  // DAILY FOCUS
  // ════════════════════════════════════════════════════════

  /**
   * GET /api/productivity/focus/today
   * Ambil semua fokus hari ini milik user.
   */
  router.get("/focus/today", h(async (_req, res, user) => {
    const result = await focusSvc.getToday(user.id);
    res.json(result);
  }));

  /**
   * GET /api/productivity/focus/pending
   * Ambil fokus belum selesai dari semua tanggal.
   */
  router.get("/focus/pending", h(async (_req, res, user) => {
    const result = await focusSvc.getPending(user.id);
    res.json(result);
  }));

  /**
   * GET /api/productivity/focus/summary
   * Ringkasan fokus hari ini: total, done, active.
   */
  router.get("/focus/summary", h(async (_req, res, user) => {
    const result = await focusSvc.getDailySummary(user.id);
    res.json(result);
  }));

  /**
   * POST /api/productivity/focus
   * Buat fokus baru (manual / via AI).
   * Body: { title, description?, source_type?, focus_date?, priority?, original_input? }
   */
  router.post("/focus", h(async (req, res, user) => {
    const result = await focusSvc.create(user.id, req.body);
    res.status(201).json(result);
  }));

  /**
   * POST /api/productivity/focus/bulk
   * Buat banyak fokus sekaligus (AI suggest).
   * Body: { items: [{title, description?, priority?}], source_type? }
   */
  router.post("/focus/bulk", h(async (req, res, user) => {
    const { items, source_type } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items harus array dan tidak kosong" });
    }
    const result = await focusSvc.createBulk(user.id, items, source_type);
    res.status(201).json(result);
  }));

  /**
   * PATCH /api/productivity/focus/:id
   * Update status / title / description / priority.
   * Body: subset dari { status, title, description, priority }
   */
  router.patch("/focus/:id", h(async (req, res, user) => {
    const result = await focusSvc.update(req.params.id, user.id, req.body);
    res.json(result);
  }));

  /**
   * DELETE /api/productivity/focus/:id
   */
  router.delete("/focus/:id", h(async (req, res, user) => {
    const result = await focusSvc.delete(req.params.id, user.id);
    res.json(result);
  }));

  // ════════════════════════════════════════════════════════
  // ADMIN TRACKER
  // ════════════════════════════════════════════════════════

  /**
   * GET /api/productivity/tracker
   * Ambil semua item tracker.
   * Query params: ?status=not_started|preparing|submitted|completed|all
   *               ?category=iqomah|paspor|visa|kampus|safar|lainnya
   */
  router.get("/tracker", h(async (req, res, user) => {
    const result = await trackerSvc.getAll(user.id, req.query);
    res.json(result);
  }));

  /**
   * GET /api/productivity/tracker/urgent
   * Filter: item urgent yang belum selesai.
   */
  router.get("/tracker/urgent", h(async (_req, res, user) => {
    const result = await trackerSvc.getUrgent(user.id);
    res.json(result);
  }));

  /**
   * GET /api/productivity/tracker/due-soon
   * Filter: item dengan due date <= 7 hari ke depan.
   * Query params: ?days=7
   */
  router.get("/tracker/due-soon", h(async (req, res, user) => {
    const days = parseInt(req.query.days) || 7;
    const result = await trackerSvc.getDueSoon(user.id, days);
    res.json(result);
  }));

  /**
   * GET /api/productivity/tracker/summary
   * Ringkasan status: total_active, urgent, due_soon, by_category, by_status.
   */
  router.get("/tracker/summary", h(async (_req, res, user) => {
    const result = await trackerSvc.getSummary(user.id);
    res.json(result);
  }));

  /**
   * POST /api/productivity/tracker
   * Buat item tracker baru.
   * Body: { title, category?, notes?, due_date?, is_urgent?, reminder_enabled?, checklist_steps? }
   */
  router.post("/tracker", h(async (req, res, user) => {
    const result = await trackerSvc.create(user.id, req.body);
    res.status(201).json(result);
  }));

  /**
   * PATCH /api/productivity/tracker/:id
   * Update field yang diizinkan.
   */
  router.patch("/tracker/:id", h(async (req, res, user) => {
    const result = await trackerSvc.update(req.params.id, user.id, req.body);
    res.json(result);
  }));

  /**
   * DELETE /api/productivity/tracker/:id
   */
  router.delete("/tracker/:id", h(async (req, res, user) => {
    const result = await trackerSvc.delete(req.params.id, user.id);
    res.json(result);
  }));

  // ════════════════════════════════════════════════════════
  // USER NOTES  (format: 'note' | 'todo' | 'checklist')
  // Table: user_notes — created at startup via initUserNotes()
  // Auth enforced at app-layer (filter by user_id on every query)
  // ════════════════════════════════════════════════════════

  /** GET /api/productivity/notes — list all notes for user (newest first) */
  router.get("/notes", h(async (_req, res, user) => {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("user_notes")
      .select("id, title, format, content, items, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw Object.assign(new Error(error.message), { status: 500 });
    res.json({ notes: data ?? [] });
  }));

  /** GET /api/productivity/notes/:id — single note */
  router.get("/notes/:id", h(async (req, res, user) => {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("user_notes")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", user.id)
      .single();
    if (error) throw Object.assign(new Error("Catatan tidak ditemukan"), { status: 404 });
    res.json({ note: data });
  }));

  /** POST /api/productivity/notes — create note */
  router.post("/notes", h(async (req, res, user) => {
    const { title = "Catatan Baru", format = "note", content = null, items = [] } = req.body;
    if (!["note", "todo", "checklist"].includes(format))
      throw Object.assign(new Error("Format tidak valid"), { status: 400 });
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("user_notes")
      .insert({ user_id: user.id, title: title.slice(0, 200), format, content, items })
      .select()
      .single();
    if (error) throw Object.assign(new Error(error.message), { status: 500 });
    res.status(201).json({ note: data });
  }));

  /** PATCH /api/productivity/notes/:id — update title / content / items */
  router.patch("/notes/:id", h(async (req, res, user) => {
    const allowed = ["title", "content", "items"];
    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
    if (patch.title) patch.title = String(patch.title).slice(0, 200);
    patch.updated_at = new Date().toISOString();
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("user_notes")
      .update(patch)
      .eq("id", req.params.id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) throw Object.assign(new Error(error.message), { status: 500 });
    res.json({ note: data });
  }));

  /** DELETE /api/productivity/notes/:id */
  router.delete("/notes/:id", h(async (req, res, user) => {
    const sb = getAdminClient();
    const { error } = await sb
      .from("user_notes")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", user.id);
    if (error) throw Object.assign(new Error(error.message), { status: 500 });
    res.json({ success: true });
  }));

  return router;
}
