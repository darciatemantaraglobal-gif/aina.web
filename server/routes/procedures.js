/**
 * procedures.js — Express router untuk fitur "Panduan Prosedur"
 * (GET /api/procedures + CRUD /api/admin/procedures/*).
 *
 * Extracted verbatim from server.js as a first concrete step on F4-5
 * ("lanjutkan pemecahan monolit server.js") — small, self-contained
 * feature cluster (one table: masisir_procedures), good first candidate.
 * Behavior is unchanged from the original inline routes; only the file
 * location and the dependency-injection wiring changed.
 *
 * Uses the same factory pattern as server/routes/productivity.js: receives
 * its dependencies from server.js instead of importing them directly, so
 * there's no circular import back into the monolith.
 *
 * Mounted at "/api" (not "/api/procedures") because this cluster spans two
 * different prefixes (/api/procedures for the public GET, /api/admin/procedures
 * for master-admin CRUD) that don't share a common ancestor narrower than /api.
 */
import { Router } from "express";

/**
 * @param {{
 *   getAdminClient: Function,
 *   verifyAdminUser: Function,
 *   isMasterAdminId: Function,
 *   sanitizeErr: Function,
 *   writeLimiter: import('express').RequestHandler,
 *   defaultProcedures: Array,
 * }} deps
 * @returns {Router}
 */
export function createProceduresRouter({
  getAdminClient,
  verifyAdminUser,
  isMasterAdminId,
  sanitizeErr,
  writeLimiter,
  defaultProcedures,
}) {
  const router = Router();

  /* GET /api/procedures — public, returns active procedures */
  router.get("/procedures", async (req, res) => {
    const supabase = getAdminClient();
    if (!supabase) return res.json({ procedures: defaultProcedures.map(p => ({ ...p, is_active: true })) });
    const { data, error } = await supabase
      .from("masisir_procedures")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (error) {
      // Table may not exist yet — fallback to hardcoded defaults
      if (error.code === "42P01") return res.json({ procedures: defaultProcedures.map(p => ({ ...p, is_active: true })), fallback: true });
      return res.status(500).json({ error: sanitizeErr(error) });
    }
    res.json({ procedures: data });
  });

  /* POST /api/admin/procedures — create procedure (master admin only) */
  router.post("/admin/procedures", writeLimiter, async (req, res) => {
    const admin = await verifyAdminUser(req.headers.authorization);
    if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Hanya master admin" });
    const { title, subtitle, icon_name = "FileText", color = "text-violet-400", steps = [], display_order = 0 } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Judul wajib diisi" });
    const id = `proc_${Date.now()}`;
    const supabase = getAdminClient();
    const { data, error } = await supabase.from("masisir_procedures").insert({
      id, title: title.trim(), subtitle: subtitle?.trim() || null,
      icon_name, color, steps, display_order, is_active: true,
    }).select().single();
    if (error) return res.status(500).json({ error: sanitizeErr(error) });
    res.status(201).json({ procedure: data });
  });

  /* PUT /api/admin/procedures/:id — update procedure (master admin only) */
  router.put("/admin/procedures/:id", writeLimiter, async (req, res) => {
    const admin = await verifyAdminUser(req.headers.authorization);
    if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Hanya master admin" });
    const { title, subtitle, icon_name, color, steps, display_order, is_active } = req.body;
    const updates = {};
    if (title !== undefined)         updates.title         = title?.trim();
    if (subtitle !== undefined)      updates.subtitle      = subtitle?.trim() || null;
    if (icon_name !== undefined)     updates.icon_name     = icon_name;
    if (color !== undefined)         updates.color         = color;
    if (steps !== undefined)         updates.steps         = steps;
    if (display_order !== undefined) updates.display_order = display_order;
    if (is_active !== undefined)     updates.is_active     = !!is_active;
    updates.updated_at = new Date().toISOString();
    const supabase = getAdminClient();
    const { data, error } = await supabase.from("masisir_procedures").update(updates).eq("id", req.params.id).select().single();
    if (error) return res.status(500).json({ error: sanitizeErr(error) });
    res.json({ procedure: data });
  });

  /* DELETE /api/admin/procedures/:id — delete procedure (master admin only) */
  router.delete("/admin/procedures/:id", writeLimiter, async (req, res) => {
    const admin = await verifyAdminUser(req.headers.authorization);
    if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Hanya master admin" });
    const supabase = getAdminClient();
    const { error } = await supabase.from("masisir_procedures").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: sanitizeErr(error) });
    res.json({ success: true });
  });

  /* POST /api/admin/procedures/reorder — save new display_order (master admin only) */
  router.post("/admin/procedures/reorder", writeLimiter, async (req, res) => {
    const admin = await verifyAdminUser(req.headers.authorization);
    if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Hanya master admin" });
    const { order } = req.body; // [{ id, display_order }]
    if (!Array.isArray(order)) return res.status(400).json({ error: "Format tidak valid" });
    const supabase = getAdminClient();
    await Promise.all(order.map(({ id, display_order }) =>
      supabase.from("masisir_procedures").update({ display_order, updated_at: new Date().toISOString() }).eq("id", id)
    ));
    res.json({ success: true });
  });

  return router;
}
