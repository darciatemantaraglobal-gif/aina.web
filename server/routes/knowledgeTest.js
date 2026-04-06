/**
 * knowledgeTest.js — Internal test route untuk memverifikasi integrasi
 * knowledge_sources / knowledge_chunks TANPA memengaruhi flow chat utama.
 *
 * Mounting point: /api/internal/knowledge-test  (bukan /api/chat)
 * Proteksi:       Header  X-Internal-Key: <INTERNAL_API_KEY env var>
 *                 atau verifyAuth admin sebagai fallback
 *
 * TUJUAN SAJA: membuktikan AINA bisa membaca tabel baru sebelum integrasi penuh.
 * Tidak ada efek ke chat, retrieval lama, atau UI.
 *
 * Endpoints:
 *   GET /health              — cek tabel ada + hitung rows per status
 *   GET /sources             — list news sources (status=ready, type=news)
 *   GET /sources/:id/chunks  — source + seluruh chunks-nya
 *   GET /search?q=query      — test keyword retrieval + format adapter
 */
import { Router } from "express";
import { createNewsKnowledgeService } from "../services/newsKnowledgeService.js";
import { adaptRetrievalResult, adaptSourceToKbFormat } from "../services/newsKnowledgeAdapter.js";

/**
 * @param {{ getAdminClient: Function, verifyAuth: Function }} deps
 * @returns {Router}
 */
export function createKnowledgeTestRouter({ getAdminClient, verifyAuth }) {
  const router = Router();
  const svc    = createNewsKnowledgeService({ getAdminClient });

  // ── Auth guard ─────────────────────────────────────────────────────────────
  // Akses via X-Internal-Key header (cocok untuk CI / postman testing).
  // Jika key tidak di-set di env, fallback ke verifyAuth (harus admin).

  async function guardInternal(req, res) {
    const envKey = process.env.INTERNAL_API_KEY;

    if (envKey) {
      const provided = req.headers["x-internal-key"];
      if (provided !== envKey) {
        res.status(403).json({ error: "X-Internal-Key tidak valid" });
        return false;
      }
      return true;
    }

    // Fallback: autentikasi user biasa jika INTERNAL_API_KEY belum di-set
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
      console.error("[KnowledgeTest]", err.message);
      res.status(err.status || 500).json({ error: err.message });
    }
  };

  // ── GET /health ────────────────────────────────────────────────────────────
  // Verifikasi tabel ada dan kembalikan statistik dasar.
  router.get("/health", h(async (_req, res) => {
    const { counts } = await svc.getStats();
    res.json({
      ok:      true,
      tables:  ["knowledge_sources", "knowledge_chunks"],
      counts,
      note:    "Status 'ready' = artikel/berita siap dibaca. 'published' dari news-harvester perlu mapping ke 'ready'.",
      phase:   2,
    });
  }));

  // ── GET /sources ───────────────────────────────────────────────────────────
  // List news sources yang ready — dengan format asli DAN format KB-adapted.
  router.get("/sources", h(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit ?? "10", 10), 50);
    const tags  = req.query.tags ? req.query.tags.split(",").map(t => t.trim()) : undefined;

    const { sources, count } = await svc.getPublishedNews({ limit, tags });

    res.json({
      count,
      sources,
      adapted: sources.map(adaptSourceToKbFormat),
      _meta: {
        filter:  "status=ready, source_type=news",
        note:    "Field 'adapted' menunjukkan format KB-compatible untuk integrasi masa depan",
      },
    });
  }));

  // ── GET /sources/:id/chunks ────────────────────────────────────────────────
  // Ambil satu source beserta seluruh chunks-nya.
  router.get("/sources/:id/chunks", h(async (req, res) => {
    const { id } = req.params;
    const { source, chunks } = await svc.getSourceWithChunks(id);

    if (!source) {
      return res.status(404).json({ error: "Source tidak ditemukan atau belum ready" });
    }

    res.json({
      source,
      chunks,
      chunkCount: chunks.length,
      adapted:    adaptSourceToKbFormat(source),
    });
  }));

  // ── GET /search?q=query ────────────────────────────────────────────────────
  // Test keyword retrieval — tunjukkan hasil raw dan format KB-adapted.
  router.get("/search", h(async (req, res) => {
    const q = (req.query.q ?? "").trim();
    if (!q) return res.status(400).json({ error: "Parameter q diperlukan" });

    const limit       = Math.min(parseInt(req.query.limit ?? "5", 10), 20);
    const preferChunks = req.query.prefer !== "sources";

    const { sources, chunks } = await svc.retrieveByKeywords(q, { limit, preferChunks });
    const adapted = adaptRetrievalResult({ sources, chunks }, { preferChunks, limit });

    res.json({
      query:    q,
      raw:      { sources, chunks },
      adapted,
      adaptedCount: adapted.length,
      _meta: {
        note:    "Field 'adapted' adalah format yang kompatibel dengan output fetchRelevantArticles()",
        default: "Chat utama MASIH menggunakan fetchRelevantArticles() → tabel knowledge_base",
      },
    });
  }));

  return router;
}
