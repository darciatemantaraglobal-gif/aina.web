/**
 * knowledgeInsights.js — Knowledge Gap Detection + Topic Recommendation + Draft Generator
 *
 * Mounting point: /api/internal/knowledge
 * Proteksi:       STRICT X-Internal-Key header (server-to-server only)
 *                 Fallback Bearer token untuk admin UI (verifyAuth)
 *
 * Endpoints:
 *   GET  /gaps             — detectKnowledgeGaps()
 *   GET  /recommendations  — getRecommendedTopics()
 *   POST /draft            — generateDraft(topic)
 *
 * ADDITIVE-ONLY: tidak mengubah /api/chat, tidak mengubah retrieval.
 */
import { Router } from "express";
import {
  detectKnowledgeGaps,
  getRecommendedTopics,
  generateDraft,
} from "../services/knowledgeGapService.js";

/**
 * @param {{ getAdminClient: Function, verifyAuth: Function, openRouterApiKey: string }} deps
 * @returns {Router}
 */
export function createKnowledgeInsightsRouter({ getAdminClient, verifyAuth, openRouterApiKey }) {
  const router = Router();
  const svcDeps = { getAdminClient, openRouterApiKey };

  // ── Auth guard ─────────────────────────────────────────────────────────
  // Prioritas 1: X-Internal-Key header (server-to-server / automation)
  // Prioritas 2: Bearer token (admin UI di browser)
  async function guardInternal(req, res) {
    const envKey   = process.env.INTERNAL_API_KEY;
    const provided = req.headers["x-internal-key"];

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

  // ── Async wrapper ──────────────────────────────────────────────────────
  const h = (fn) => async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      console.error("[KnowledgeInsights]", e.message);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  };

  // ── GET /gaps ──────────────────────────────────────────────────────────
  // Temukan query yang sering ditanya tapi KB-nya lemah/tidak ada/dapat rating buruk.
  //
  // Query params:
  //   ?min_frequency=3   — minimum frequency untuk dianggap (default: 3)
  //   ?days=30           — rentang hari data retrieval/rating (default: 30)
  //
  // Response: { count, gaps: [{ query, topic, frequency, issue, priority_score, last_seen }] }
  router.get("/gaps", h(async (req, res) => {
    if (!(await guardInternal(req, res))) return;

    const minFrequency = Math.max(1, parseInt(req.query.min_frequency) || 3);
    const days         = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));

    const gaps = await detectKnowledgeGaps(svcDeps, { minFrequency, days });
    res.json({ count: gaps.length, gaps });
  }));

  // ── GET /recommendations ───────────────────────────────────────────────
  // Grup gaps jadi topik terstruktur dengan prioritas high/medium/low.
  //
  // Query params: sama dengan /gaps
  //
  // Response: { count, topics: [{ topic, queries, total_frequency, priority, issues }] }
  router.get("/recommendations", h(async (req, res) => {
    if (!(await guardInternal(req, res))) return;

    const minFrequency = Math.max(1, parseInt(req.query.min_frequency) || 3);
    const days         = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));

    const topics = await getRecommendedTopics(svcDeps, { minFrequency, days });
    res.json({ count: topics.length, topics });
  }));

  // ── POST /draft ────────────────────────────────────────────────────────
  // Generate artikel panduan via OpenRouter untuk topik yang dipilih.
  //
  // Body: { topic: string, related_queries?: string[] }
  //
  // Response: { title, content, suggested_tags, model_used, topic }
  router.post("/draft", h(async (req, res) => {
    if (!(await guardInternal(req, res))) return;

    const { topic, related_queries } = req.body || {};
    if (!topic?.trim()) {
      return res.status(400).json({ error: "Field 'topic' wajib diisi" });
    }

    const draft = await generateDraft(topic.trim(), svcDeps, {
      relatedQueries: Array.isArray(related_queries) ? related_queries : [],
    });
    res.json(draft);
  }));

  return router;
}
