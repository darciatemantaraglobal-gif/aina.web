-- ============================================================================
-- MIGRASI KRITIS — WAJIB DIJALANKAN MANUAL DI SUPABASE SQL EDITOR SEBELUM LAUNCH
-- ============================================================================
-- Masalah: kolom embedding dibuat vector(1536) untuk OpenAI text-embedding,
-- tapi engine/embedder.js sekarang pakai Voyage voyage-3-lite yang output-nya
-- 512 dimensi. Akibatnya:
--   1. Semua UPDATE embedding gagal ("expected 1536 dimensions, not 512")
--   2. RPC match_knowledge_base error setiap dipanggil
--   3. Vector/semantic RAG mati total — sistem diam-diam fallback ke keyword
--
-- Migrasi ini: reset kolom ke vector(512), rebuild index & RPC.
-- Embedding lama (1536, OpenAI) TIDAK kompatibel dengan Voyage dan memang
-- harus dibuang — auto-embed di startup server akan re-embed semua artikel
-- approved secara otomatis setelah migrasi ini jalan.
-- ============================================================================

-- 1. Drop index & function lama yang terikat ke vector(1536)
DROP INDEX IF EXISTS idx_kb_embedding;
DROP FUNCTION IF EXISTS match_knowledge_base(vector(1536), float, int);
DROP FUNCTION IF EXISTS match_knowledge_base(vector, float, int);

-- 2. Ganti kolom embedding ke 512 dimensi (embedding lama dibuang — memang tidak kompatibel)
ALTER TABLE public.knowledge_base DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.knowledge_base ADD COLUMN embedding vector(512);
UPDATE public.knowledge_base SET embedding_model = NULL;  -- paksa re-embed semua

-- 3. Rebuild index cosine
CREATE INDEX IF NOT EXISTS idx_kb_embedding
  ON public.knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- 4. Rebuild RPC dengan dimensi yang benar
CREATE OR REPLACE FUNCTION match_knowledge_base(
  query_embedding vector(512),
  match_threshold float DEFAULT 0.40,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  title text,
  content text,
  category text,
  hidden boolean,
  article_type text,
  keywords text,
  maps_url text,
  summary text,
  important_notes text,
  similarity float
)
LANGUAGE plpgsql
AS $func$
BEGIN
  RETURN QUERY
  SELECT
    kb.title,
    kb.content,
    kb.category,
    kb.hidden,
    kb.article_type,
    kb.keywords,
    kb.maps_url,
    kb.summary,
    kb.important_notes,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.status = 'approved'
    AND kb.embedding IS NOT NULL
    AND 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$func$;

-- 5. CATATAN Muqarrar: kalau tabel muqarrar_chunks + RPC match_muqarrar_chunks
-- juga dibuat dengan vector(1536) (dari era OpenAI), jalankan pola yang sama:
--   DROP FUNCTION IF EXISTS match_muqarrar_chunks(vector, float, int);
--   ALTER TABLE public.muqarrar_chunks DROP COLUMN embedding;
--   ALTER TABLE public.muqarrar_chunks ADD COLUMN embedding vector(512);
--   ... lalu CREATE OR REPLACE FUNCTION match_muqarrar_chunks dengan vector(512)
--   dan re-embed chunks-nya.
-- Cek dulu: SELECT atttypmod FROM pg_attribute WHERE attrelid = 'muqarrar_chunks'::regclass AND attname = 'embedding';
-- (atttypmod = dimensi untuk tipe vector)

-- 6. Tabel chat_usage — kuota harian free tier dihitung server-side
CREATE TABLE IF NOT EXISTS public.chat_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_usage_user_time ON public.chat_usage(user_id, created_at DESC);
ALTER TABLE public.chat_usage ENABLE ROW LEVEL SECURITY;
-- Tidak perlu policy: hanya diakses via service role dari backend.

-- 7. Reload schema cache PostgREST
SELECT pg_notify('pgrst', 'reload schema');
