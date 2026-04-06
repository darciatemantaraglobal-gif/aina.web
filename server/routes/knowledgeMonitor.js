/**
 * knowledgeMonitor.js — Monitoring route internal untuk knowledge pipeline.
 *
 * Mounting point: /api/internal/knowledge-monitor  (bukan /api/chat)
 * Proteksi:       Header X-Internal-Key: <INTERNAL_API_KEY env var>
 *                 atau verifyAuth admin sebagai fallback (pola sama dengan knowledgeTest.js)
 *
 * PENTING — ADDITIVE ONLY:
 * - Tidak mengubah flow /api/chat
 * - Tidak mengubah retrieval default
 * - Tidak mengubah frontend user
 * - Semua endpoint read-only — tidak ada write ke DB
 *
 * Endpoints:
 *   GET /health            — cek readability tabel + stats dasar
 *   GET /latest            — N sources terbaru (semua status)
 *   GET /pipeline-summary  — status breakdown, source_type breakdown, chunk total
 *   GET /ingestion-runs    — run history harvester (safe skip jika belum ada)
 */
import { Router } from "express";
import { createNewsKnowledgeService } from "../services/newsKnowledgeService.js";

/**
 * @param {{ getAdminClient: Function, verifyAuth: Function }} deps
 * @returns {Router}
 */
export function createKnowledgeMonitorRouter({ getAdminClient, verifyAuth }) {
  const router = Router();
  const svc    = createNewsKnowledgeService({ getAdminClient });

  // ── Auth guard ────────────────────────────────────────────────────────────
  // Prioritas 1: X-Internal-Key header (server-to-server / automation)
  // Prioritas 2: Bearer token (admin UI di browser)
  async function guardInternal(req, res) {
    const envKey  = process.env.INTERNAL_API_KEY;
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
      console.error("[KnowledgeMonitor]", err.message);
      res.status(err.status || 500).json({ ok: false, error: err.message });
    }
  };

  // ── GET /health ────────────────────────────────────────────────────────────
  // Verifikasi kedua tabel bisa dibaca + tampilkan counts dasar.
  // Aman: jika tabel belum ada, kembalikan error internal yang jelas.
  router.get("/health", h(async (_req, res) => {
    const supabase = getAdminClient();
    if (!supabase) {
      return res.status(503).json({ ok: false, error: "Admin DB client tidak tersedia" });
    }

    // Test baca knowledge_sources
    const srcResult = await supabase
      .from("knowledge_sources")
      .select("id", { count: "exact", head: true });

    // Test baca knowledge_chunks
    const chkResult = await supabase
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true });

    const sourcesOk = !srcResult.error;
    const chunksOk  = !chkResult.error;

    res.json({
      ok:      sourcesOk && chunksOk,
      tables: {
        knowledge_sources: {
          readable: sourcesOk,
          count:    srcResult.count ?? null,
          error:    srcResult.error?.message ?? null,
        },
        knowledge_chunks: {
          readable: chunksOk,
          count:    chkResult.count ?? null,
          error:    chkResult.error?.message ?? null,
        },
      },
      phase: 5,
      note:  "Monitoring-only. Flow /api/chat tidak dipengaruhi oleh endpoint ini.",
    });
  }));

  // ── GET /latest ────────────────────────────────────────────────────────────
  // Tampilkan N sources terbaru dari semua status (bukan hanya 'ready').
  // Berguna untuk memonitor pipeline ingest — apakah ada source baru masuk.
  router.get("/latest", h(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit ?? "10", 10), 50);

    const { sources, count } = await svc.getLatestSources({ limit });

    res.json({
      ok: true,
      count,
      sources,
      _meta: {
        note:   "Semua status ditampilkan (pending/processing/ready/rejected)",
        filter: `limit=${limit}`,
      },
    });
  }));

  // ── GET /pipeline-summary ──────────────────────────────────────────────────
  // Ringkasan aggregate pipeline: status breakdown, source_type, chunk total.
  // Format output sesuai spesifikasi Phase 5.
  router.get("/pipeline-summary", h(async (req, res) => {
    const summary = await svc.getPipelineSummary();

    res.json({
      ok: true,
      ...summary,
      _meta: {
        note:       "Data agregat — tidak real-time, sekitar 1-2 detik delay dari ingest terakhir",
        phase:      5,
        retrieval:  "Chat tetap pakai fetchRelevantArticles() atau resolveArticles() — bukan endpoint ini",
      },
    });
  }));

  // ── GET /ingestion-runs ────────────────────────────────────────────────────
  // Run history dari news-harvester jika tabel harvester_runs tersedia.
  // Safe skip: jika tabel belum ada atau query gagal, return not_available.
  router.get("/ingestion-runs", h(async (req, res) => {
    const supabase = getAdminClient();
    if (!supabase) {
      return res.status(503).json({ ok: false, error: "Admin DB client tidak tersedia" });
    }

    const limit = Math.min(parseInt(req.query.limit ?? "10", 10), 50);

    // Tabel ini dibuat oleh repo news-harvester — mungkin belum ada.
    // Tidak throw; kembalikan not_available jika tabel tidak ditemukan.
    const { data, error } = await supabase
      .from("harvester_runs")
      .select("id, status, source_count, chunk_count, started_at, finished_at, error_message")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) {
      // Tabel belum ada atau tidak bisa dibaca — bukan error fatal untuk monitoring
      return res.json({
        ok:            true,
        available:     false,
        not_available_reason: error.message,
        note: "Tabel harvester_runs belum ada. Akan aktif setelah news-harvester membuat tabelnya.",
      });
    }

    res.json({
      ok:        true,
      available: true,
      count:     data.length,
      runs:      data,
    });
  }));

  return router;
}
