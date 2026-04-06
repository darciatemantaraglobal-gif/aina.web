-- supabase/migrations/20260406_news_knowledge_schema.sql
--
-- Foundation layer for news-harvester knowledge integration.
--
-- ADDITIVE ONLY — does NOT modify the existing knowledge_base table,
-- its retrieval functions, or any current chat/RAG flow in server.js.
-- These tables are prepared for future integration; they are NOT queried
-- by the main chat route yet.

-- ── knowledge_sources ─────────────────────────────────────────────────────────
-- Stores harvested articles / news items produced by the news-harvester repo.
-- Schema mirrors news-harvester's output format so data can be ingested as-is.

CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  source_type     TEXT        NOT NULL DEFAULT 'article',   -- e.g. 'article','news','announcement'
  source_name     TEXT,                                      -- publication / outlet name
  source_url      TEXT,                                      -- original URL
  summary         TEXT,                                      -- short AI-generated summary
  tags            TEXT[]      DEFAULT '{}',                  -- topic tags
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','ready','rejected')),
  cleaned_content TEXT,                                      -- stripped / normalised full text
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── knowledge_chunks ──────────────────────────────────────────────────────────
-- Granular text chunks of each knowledge_source, suitable for RAG retrieval.
-- A pgvector embedding column can be added later when semantic search is wired in.

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      UUID        NOT NULL
                   REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  chunk_index    INTEGER     NOT NULL,         -- 0-based position within parent source
  chunk_text     TEXT        NOT NULL,
  chunk_summary  TEXT,                         -- optional per-chunk summary
  topic          TEXT,                         -- inferred topic label
  metadata_json  JSONB       DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ks_status       ON public.knowledge_sources(status);
CREATE INDEX IF NOT EXISTS idx_ks_source_type  ON public.knowledge_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_ks_created_at   ON public.knowledge_sources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ks_tags         ON public.knowledge_sources USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_kc_source_id    ON public.knowledge_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_kc_topic        ON public.knowledge_chunks(topic);
CREATE INDEX IF NOT EXISTS idx_kc_chunk_index  ON public.knowledge_chunks(source_id, chunk_index);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks  ENABLE ROW LEVEL SECURITY;

-- Admins can do everything (service role bypasses RLS entirely)
CREATE POLICY "Admins manage knowledge_sources"
  ON public.knowledge_sources FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage knowledge_chunks"
  ON public.knowledge_chunks FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can read sources that are marked ready
-- (future: expose to chat retrieval once integration is activated)
CREATE POLICY "Auth users read ready sources"
  ON public.knowledge_sources FOR SELECT
  USING (auth.role() = 'authenticated' AND status = 'ready');

CREATE POLICY "Auth users read chunks of ready sources"
  ON public.knowledge_chunks FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.knowledge_sources ks
      WHERE ks.id = knowledge_chunks.source_id AND ks.status = 'ready'
    )
  );
