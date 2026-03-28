/**
 * productivityAI.js
 * Routes: AI Focus + Reminder System
 *
 * Dipasang di server.js:
 *   import { createProductivityAIRouter } from "./server/routes/productivityAI.js";
 *   app.use("/api/productivity", createProductivityAIRouter({ verifyAuth, getAdminClient, sendEmail, emailTemplate, getUserEmail }));
 *
 * Endpoints:
 *   POST /api/productivity/focus/ai-assist       — ubah teks bebas → fokus
 *   POST /api/productivity/focus/ai-suggest      — suggest dari konteks user
 *   GET  /api/productivity/reminders/summary     — panel in-app (no email)
 *   POST /api/productivity/reminders/daily       — kirim daily focus reminder (email)
 *   POST /api/productivity/reminders/admin       — kirim admin tracker reminder (email)
 *   POST /api/productivity/reminders/weekly-recap — kirim weekly recap (email)
 */

import { Router } from "express";
import { generateFocus }                                         from "../services/focusAiService.js";
import { getPendingFocusToday, getUrgentAdminItems,
         sendDailyReminder, sendAdminReminder, sendWeeklyRecap } from "../services/reminderService.js";

export function createProductivityAIRouter({ verifyAuth, getAdminClient, sendEmail, emailTemplate, getUserEmail }) {
  const router = Router();

  /** Shared dependency bundle for reminder functions */
  const reminderDeps = { getAdminClient, sendEmail, emailTemplate, getUserEmail };

  /** Auth + try/catch wrapper */
  const h = (fn) => async (req, res) => {
    const user = await verifyAuth(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Login diperlukan" });
    try {
      await fn(req, res, user);
    } catch (e) {
      console.error(`[${req.method} ${req.path}]`, e.message);
      res.status(e.status || 500).json({ error: e.message || "Terjadi kesalahan, coba lagi" });
    }
  };

  // ── AI Focus ───────────────────────────────────────────────────────────────

  /**
   * POST /focus/ai-assist
   * Body: { userInput: string }
   * Ubah kalimat bebas user → 1–3 fokus actionable.
   */
  router.post("/focus/ai-assist", h(async (req, res) => {
    const { userInput } = req.body;
    if (!userInput?.trim()) {
      return res.status(400).json({ error: "Input tidak boleh kosong" });
    }
    const { items } = await generateFocus({ mode: "ai_assist", userInput: userInput.trim() });
    res.json({ items });
  }));

  /**
   * POST /focus/ai-suggest
   * Body: {} (konteks diambil dari DB user)
   * Buat saran fokus berdasarkan pending + urgent + riwayat.
   */
  router.post("/focus/ai-suggest", h(async (req, res, user) => {
    const supabase  = getAdminClient();
    const today     = new Date().toISOString().slice(0, 10);
    const sevenAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const soonDate  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [{ data: pendingFocus }, { data: urgentAdmin }, { data: history }] = await Promise.all([
      supabase
        .from("daily_focus_items")
        .select("title, status")
        .eq("user_id", user.id)
        .neq("status", "done")
        .neq("focus_date", today)
        .limit(5),
      supabase
        .from("admin_tracker_items")
        .select("title, category, due_date")
        .eq("user_id", user.id)
        .neq("status", "completed")
        .or(`is_urgent.eq.true,due_date.lte.${soonDate}`)
        .limit(5),
      supabase
        .from("daily_focus_items")
        .select("title, status, focus_date")
        .eq("user_id", user.id)
        .gte("focus_date", sevenAgo)
        .order("focus_date", { ascending: false })
        .limit(10),
    ]);

    const { items } = await generateFocus({
      mode:        "ai_suggest",
      pendingFocus: pendingFocus || [],
      urgentAdmin:  urgentAdmin  || [],
      history:      history      || [],
    });
    res.json({ items });
  }));

  // ── Reminders ──────────────────────────────────────────────────────────────

  /**
   * GET /reminders/summary
   * Panel in-app — tidak kirim email, hanya data ringkasan.
   */
  router.get("/reminders/summary", h(async (req, res, user) => {
    const supabase  = getAdminClient();
    const today     = new Date().toISOString().slice(0, 10);

    const [focusToday, urgentItems] = await Promise.all([
      supabase
        .from("daily_focus_items")
        .select("id, title, status")
        .eq("user_id", user.id)
        .eq("focus_date", today)
        .then(r => r.data || []),
      getUrgentAdminItems(supabase, user.id),
    ]);

    const focusDone    = focusToday.filter(f => f.status === "done").length;
    const pendingFocus = focusToday.filter(f => f.status !== "done");

    res.json({
      focus: { total: focusToday.length, done: focusDone, pending: pendingFocus },
      urgentAdmin: urgentItems,
    });
  }));

  /**
   * POST /reminders/daily
   * Kirim daily focus reminder via email (anti-spam: 1x/hari).
   */
  router.post("/reminders/daily", h(async (req, res, user) => {
    const result = await sendDailyReminder(user.id, reminderDeps);
    res.json(result);
  }));

  /**
   * POST /reminders/admin
   * Kirim admin tracker reminder via email (anti-spam: 1x/hari).
   */
  router.post("/reminders/admin", h(async (req, res, user) => {
    const result = await sendAdminReminder(user.id, reminderDeps);
    res.json(result);
  }));

  /**
   * POST /reminders/weekly-recap
   * Kirim weekly recap via email (anti-spam: 1x/7 hari).
   */
  router.post("/reminders/weekly-recap", h(async (req, res, user) => {
    const result = await sendWeeklyRecap(user.id, reminderDeps);
    res.json(result);
  }));

  return router;
}
