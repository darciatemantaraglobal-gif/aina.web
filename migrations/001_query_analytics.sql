-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001 — Query Analytics & Feedback Brain (Phase 5 Step 2)
-- Jalankan sekali di Supabase SQL Editor:
--   Dashboard → SQL Editor → paste seluruh file ini → Run
--
-- AMAN untuk dijalankan berulang kali (IF NOT EXISTS + DO $$...$$).
-- Tidak mengubah tabel existing (query_log, knowledge_base, dll).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. query_analytics ───────────────────────────────────────────────────────
-- Satu baris per request chat yang berhasil diproses.
-- Diisi fire-and-forget dari setImmediate di server.js.

CREATE TABLE IF NOT EXISTS public.query_analytics (
  id                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at             timestamptz  NOT NULL DEFAULT now(),

  -- User (nullable — bisa null jika user tidak login)
  user_id                uuid,

  -- Query
  query_text             text,                              -- max 500 chars, bisa null untuk privasi
  intent_class           text,                              -- intent.primary dari intentDetector

  -- Retrieval
  retrieval_mode         text         DEFAULT 'legacy',     -- 'legacy' | 'hybrid' | 'smart'
  legacy_count           int          DEFAULT 0,            -- jumlah artikel dari knowledge_base
  news_count             int          DEFAULT 0,            -- jumlah artikel dari knowledge_sources
  final_count            int          DEFAULT 0,            -- total artikel yang dikirim ke AI
  top_origin             text         DEFAULT 'legacy',     -- 'legacy' | 'news' | 'mixed'

  -- KB quality
  kb_strength            text,                              -- 'strong' | 'weak' | 'absent'
  used_external_fallback boolean      DEFAULT false,        -- true jika wiki/DDG/Perplexity dipakai

  -- Response
  response_status        text         DEFAULT 'success'     -- 'success' | 'failed'
);

-- Index untuk query analytics yang sering dipakai
CREATE INDEX IF NOT EXISTS idx_qa_created_at    ON public.query_analytics (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_intent_class  ON public.query_analytics (intent_class);
CREATE INDEX IF NOT EXISTS idx_qa_retrieval_mode ON public.query_analytics (retrieval_mode);
CREATE INDEX IF NOT EXISTS idx_qa_kb_strength   ON public.query_analytics (kb_strength);

-- ── 2. query_feedback ────────────────────────────────────────────────────────
-- Feedback thumbs up/down dari user.
-- query_analytics_id bisa null jika feedback tidak dihubungkan ke query spesifik.

CREATE TABLE IF NOT EXISTS public.query_feedback (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz  NOT NULL DEFAULT now(),

  query_analytics_id uuid         REFERENCES public.query_analytics(id) ON DELETE CASCADE,
  user_id            uuid,                                  -- nullable
  feedback_type      text         NOT NULL CHECK (feedback_type IN ('up', 'down')),
  notes              text                                   -- optional free-text dari user
);

CREATE INDEX IF NOT EXISTS idx_qf_feedback_type ON public.query_feedback (feedback_type);
CREATE INDEX IF NOT EXISTS idx_qf_analytics_id  ON public.query_feedback (query_analytics_id);

-- ── 3. RLS (Row Level Security) ───────────────────────────────────────────────
-- Analytics table: service role bisa baca/tulis; user biasa tidak bisa akses langsung.
-- Karena AINA backend pakai service role key, ini cukup.

ALTER TABLE public.query_analytics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.query_feedback   ENABLE ROW LEVEL SECURITY;

-- Hanya service role yang bisa INSERT/SELECT (backend menggunakan service role key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'query_analytics' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.query_analytics
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'query_feedback' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.query_feedback
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Verifikasi ────────────────────────────────────────────────────────────────
SELECT
  'query_analytics' AS tabel, count(*) AS row_count FROM public.query_analytics
UNION ALL
SELECT
  'query_feedback'  AS tabel, count(*) AS row_count FROM public.query_feedback;
