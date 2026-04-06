/**
 * knowledgeAnalytics.js — Admin analytics route untuk query_analytics + feedback.
 *
 * Mounting point: /api/internal/knowledge-analytics  (bukan /api/chat)
 * Proteksi:       Header X-Internal-Key: <INTERNAL_API_KEY env var>
 *                 atau verifyAuth sebagai fallback (pola identik knowledgeMonitor.js)
 *
 * ADDITIVE ONLY:
 * - Tidak mengubah /api/chat
 * - Tidak mengubah retrieval (smart/hybrid/legacy)
 * - Tidak mengubah UI frontend
 * - Semua endpoint read-only (kecuali POST /feedback — hanya uji internal)
 *
 * Endpoints:
 *   GET /summary              — total queries, by intent, by retrieval_mode, external fallback
 *   GET /top-queries          — query paling sering muncul
 *   GET /weak-queries         — query dengan kb lemah atau butuh external
 *   GET /source-mix           — distribusi legacy vs news vs mixed
 *   GET /feedback-summary     — total up/down, approval rate
 *   GET /low-rated-topics     — topik yang banyak dapat 'down'
 */
import { Router } from "express";
import { createAnalyticsService } from "../services/analyticsService.js";

/**
 * @param {{ getAdminClient: Function, verifyAuth: Function }} deps
 * @returns {Router}
 */
export function createKnowledgeAnalyticsRouter({ getAdminClient, verifyAuth }) {
  const router = Router();
  const svc    = createAnalyticsService({ getAdminClient });

  // ── Auth guard ────────────────────────────────────────────────────────────
  // Prioritas 1: X-Internal-Key header (server-to-server / automation)
  // Prioritas 2: Bearer token (admin UI di browser)
  async function guardInternal(req, res) {
    const envKey   = process.env.INTERNAL_API_KEY;
    const provided = req.headers["x-internal-key"];

    // Jika X-Internal-Key dikirim → validasi ketat (langsung terima atau tolak)
    if (provided) {
      if (envKey && provided === envKey) return true;
      res.status(403).json({ error: "X-Internal-Key tidak valid" });
      return false;
    }

    // Fallback: Bearer token (admin yang login lewat browser)
    try {
      const user = await verifyAuth(req.headers.authorization);
      if (!user) { res.status(401).json({ error: "Login diperlukan" }); return false; }
      return true;
    } catch {
      res.status(401).json({ error: "Autentikasi gagal" });
      return false;
    }
  }

  // ── Async handler wrapper ──────────────────────────────────────────────────
  const h = (fn) => async (req, res) => {
    try {
      const ok = await guardInternal(req, res);
      if (!ok) return;
      await fn(req, res);
    } catch (err) {
      console.error("[KnowledgeAnalytics]", err.message);
      // Distinguish "table doesn't exist yet" from other errors
      const isTableMissing = err.message?.includes("does not exist") ||
                             err.message?.includes("42P01");
      if (isTableMissing) {
        return res.status(503).json({
          ok:    false,
          error: "Tabel analytics belum ada. Jalankan migrations/001_query_analytics.sql di Supabase.",
          migration: "migrations/001_query_analytics.sql",
        });
      }
      res.status(err.status || 500).json({ ok: false, error: err.message });
    }
  };

  // ── GET /summary ───────────────────────────────────────────────────────────
  // Total queries, breakdown per intent_class + retrieval_mode + external fallback.
  router.get("/summary", h(async (req, res) => {
    const days = Math.min(parseInt(req.query.days ?? "30", 10), 365);
    const summary = await svc.getSummary({ days });
    res.json({ ok: true, ...summary });
  }));

  // ── GET /top-queries ───────────────────────────────────────────────────────
  // Query paling sering diajukan user dalam periode tertentu.
  router.get("/top-queries", h(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 100);
    const days  = Math.min(parseInt(req.query.days  ?? "30", 10), 365);
    const data  = await svc.getTopQueries({ limit, days });
    res.json({ ok: true, count: data.length, period_days: days, queries: data });
  }));

  // ── GET /weak-queries ──────────────────────────────────────────────────────
  // Query dengan KB lemah atau sering butuh fallback external — target KB improvement.
  router.get("/weak-queries", h(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 100);
    const data  = await svc.getWeakQueries({ limit });
    res.json({
      ok:    true,
      count: data.length,
      note:  "Query ini kandidat konten baru di knowledge_base atau knowledge_sources",
      queries: data,
    });
  }));

  // ── GET /source-mix ────────────────────────────────────────────────────────
  // Distribusi dominansi hasil retrieval: legacy vs news vs mixed.
  router.get("/source-mix", h(async (req, res) => {
    const days = Math.min(parseInt(req.query.days ?? "30", 10), 365);
    const data = await svc.getSourceMix({ days });
    res.json({ ok: true, ...data });
  }));

  // ── GET /feedback-summary ──────────────────────────────────────────────────
  // Ringkasan thumbs up/down dari user. Safe skip jika tabel belum ada.
  router.get("/feedback-summary", h(async (req, res) => {
    const summary = await svc.getFeedbackSummary();
    res.json({ ok: true, ...summary });
  }));

  // ── GET /low-rated-topics ──────────────────────────────────────────────────
  // Topik yang paling banyak mendapat feedback negatif — prioritas perbaikan.
  router.get("/low-rated-topics", h(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 100);
    const data  = await svc.getLowRatedTopics({ limit });
    res.json({ ok: true, count: data.length, topics: data });
  }));

  return router;
}
