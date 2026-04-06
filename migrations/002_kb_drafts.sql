-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002 — kb_drafts: Auto-Knowledge Loop storage
-- Jalankan sekali di Supabase SQL Editor:
--   Dashboard → SQL Editor → paste seluruh file ini → Run
--
-- AMAN untuk dijalankan berulang kali (IF NOT EXISTS).
-- Tidak mengubah tabel existing. Draft tidak ikut retrieval knowledge_base.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kb_drafts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       text,
  title       text        NOT NULL,
  content     text        NOT NULL,
  tags        text[]      DEFAULT '{}',
  source      text        DEFAULT 'auto-generated',
  status      text        DEFAULT 'draft'        -- draft | approved | rejected
                          CHECK (status IN ('draft', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_drafts_status ON public.kb_drafts (status);
CREATE INDEX IF NOT EXISTS idx_kb_drafts_topic  ON public.kb_drafts (topic);
CREATE INDEX IF NOT EXISTS idx_kb_drafts_created ON public.kb_drafts (created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.kb_drafts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'kb_drafts' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.kb_drafts
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Verifikasi ────────────────────────────────────────────────────────────────
SELECT 'kb_drafts' AS tabel, count(*) AS row_count FROM public.kb_drafts;
