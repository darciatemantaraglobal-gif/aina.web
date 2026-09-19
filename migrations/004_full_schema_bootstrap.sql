-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004 — Full schema bootstrap (launch checklist Fase 3 / F3-1)
-- Jalankan sekali di Supabase SQL Editor:
--   Dashboard → SQL Editor → paste seluruh file ini → Run
--
-- AMAN untuk dijalankan berulang kali (semua CREATE pakai IF NOT EXISTS).
-- Tidak mengubah tabel yang sudah ada, tidak menghapus data apa pun.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- KENAPA FILE INI ADA
--
-- server.js punya EMPAT jalur pembuatan skema yang berbeda-beda, dan
-- sebagian di antaranya TIDAK PERNAH otomatis jalan tanpa setup manual:
--
--   1. supabase/migrations/*.sql  — migration bergaya Supabase CLI
--      (timestamped), dipakai kalau project sudah di-link via `supabase
--      db push`. Mencakup: profiles, user_roles, chats, messages,
--      knowledge_base, threads, votes, subscriptions, productivity_v2,
--      beta_feedback, demo_access_requests, dll.
--
--   2. migrations/001, 002, 003   — script manual (folder ini), memang
--      didesain untuk di-paste manual ke SQL Editor.
--
--   3. Auto-migration DI DALAM server.js (checkRequiredTables() +
--      runColumnMigrations(), jalan di setiap boot) — tapi HANYA bisa
--      benar-benar membuat tabel kalau fungsi Postgres exec_sql() SUDAH
--      ada di database. Kalau exec_sql belum di-bootstrap sekali secara
--      manual, semua CREATE TABLE di jalur ini gagal SENYAP (di-log
--      sebagai warning, aplikasi tetap jalan tapi fitur terkait rusak).
--      Bagian PERTAMA file ini membuat exec_sql secara langsung (tanpa
--      lewat RPC yang butuh exec_sql itu sendiri — masalah ayam-telur
--      yang ada di kode aslinya).
--
--   4. Beberapa tabel HANYA didokumentasikan di komentar kode (query_log,
--      missing_topics, user_notes) — runtime cuma CEK apakah tabelnya ada
--      dan mencatat warning kalau tidak; TIDAK PERNAH mencoba membuatnya.
--      masisir_procedures dibuat lewat koneksi Postgres langsung
--      (DATABASE_URL + package `pg`), terpisah total dari Supabase client
--      — kalau DATABASE_URL belum diset (tidak terdokumentasi di
--      .env.example sebelum perbaikan ini), tabel ini juga tidak pernah
--      dibuat.
--
-- File ini menyatukan SEMUA tabel dari jalur (3) dan (4) yang TIDAK
-- punya file migration sendiri, diekstrak verbatim dari definisi asli di
-- server.js (bukan ditulis ulang manual) supaya kolomnya dijamin sama
-- persis dengan yang dibaca/ditulis kode aplikasi.
--
-- Tabel yang SUDAH punya migration resmi di supabase/migrations/ (mis.
-- beta_feedback) TIDAK diulang di sini.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- BAGIAN 1 — Bootstrap fungsi exec_sql
-- Wajib ada sebelum auto-migration di server.js (runColumnMigrations,
-- ALTER TABLE kolom baru, dll) bisa jalan otomatis di boot berikutnya.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$ BEGIN EXECUTE sql; END; $$;

REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- BAGIAN 2 — Tabel dari auto-migration server.js (jalur exec_sql)
-- Urutan memperhatikan foreign key (tabel induk sebelum tabel anak).
-- ═══════════════════════════════════════════════════════════════════════════

-- Kolom-kolom knowledge_base yang HARUS ada sebelum
-- supabase/migrations/20260713_fix_vector_dims_voyage.sql dijalankan —
-- ditemukan lewat testing end-to-end (menjalankan seluruh urutan migration
-- di database Postgres kosong). knowledge_base adalah tabel yang paling
-- sering ditambah kolomnya, dan SEMUA kolom di bawah ini HANYA pernah
-- dibuat lewat runColumnMigrations() (exec_sql, jalan di boot server) —
-- tidak satu pun ada di migration file manapun. Kalau SQL Editor dipakai
-- duluan di project yang benar-benar baru (server belum pernah boot):
--   - `hidden` hilang → match_knowledge_base() RPC di 20260713 error
--   - `embedding_model` hilang → UPDATE di 20260713 error
--   - `maps_url`, `summary`, `important_notes`, `contact_number`,
--     `content_ar`, `image_url`, `last_updated` hilang → fitur artikel KB
--     terkait (lokasi/maps, ringkasan, terjemahan Arab, dll) diam-diam
--     tidak berfungsi meski tidak selalu error keras
--
-- Dibungkus DO block + cek keberadaan tabel supaya AMAN dijalankan kapan pun
-- file 004 ini dieksekusi relatif terhadap supabase/migrations/ — kalau
-- knowledge_base belum ada (004 dijalankan duluan sebelum migration
-- pertama), bagian ini otomatis di-skip tanpa error. Urutan yang
-- direkomendasikan: 004 → semua supabase/migrations/ → KALAU 20260713
-- error "column ... does not exist", jalankan ulang 004 (aman, idempotent)
-- lalu ulangi 20260713. Lihat migrations/README.md untuk urutan lengkapnya.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'knowledge_base') THEN
    ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS embedding_model varchar(80);
    ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS keywords TEXT NOT NULL DEFAULT '';
    ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS contact_number TEXT;
    ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS maps_url TEXT;
    ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS summary TEXT;
    ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS important_notes TEXT;
    ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ;
    ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS content_ar TEXT;
    ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS image_url TEXT;
  END IF;
END $$;

-- Config & settings sederhana (key-value)
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pengumuman sistem
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'announcement' CHECK (type IN ('welcome','announcement')),
  target_audience TEXT NOT NULL DEFAULT 'all_users' CHECK (target_audience IN ('new_users','old_users','all_users')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  button_text TEXT,
  button_link TEXT,
  image_url TEXT,
  dismissible BOOLEAN NOT NULL DEFAULT true,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_announcement_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  announcement_id UUID REFERENCES public.system_announcements(id) ON DELETE CASCADE NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ,
  UNIQUE(user_id, announcement_id)
);

-- Feedback & jawaban tersimpan
CREATE TABLE IF NOT EXISTS public.answer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('helpful','not_accurate','outdated','saved')),
  note TEXT,
  intent TEXT,
  confidence TEXT,
  sources JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saved_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message_id TEXT NOT NULL,
  content TEXT NOT NULL,
  sources JSONB,
  source_summary TEXT,
  intent TEXT,
  promoted_to_kb BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, message_id)
);

-- Flashcards
CREATE TABLE IF NOT EXISTS public.flashcard_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  source TEXT,
  bilingual BOOLEAN NOT NULL DEFAULT false,
  cards JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Berita Masisir + komentar
CREATE TABLE IF NOT EXISTS public.masisir_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'kehidupan_mesir',
  image_url TEXT,
  source_url TEXT,
  source_name TEXT,
  author_id UUID REFERENCES auth.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.masisir_news_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id UUID NOT NULL REFERENCES public.masisir_news(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL DEFAULT 'Anonim',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Library (koleksi referensi/kitab)
CREATE TABLE IF NOT EXISTS public.library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'umum' CHECK (category IN ('muqorror', 'panduan', 'referensi', 'umum')),
  faculty TEXT,
  year_level TEXT,
  drive_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'pdf',
  tags TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Misi kontributor
CREATE TABLE IF NOT EXISTS public.mission_templates (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  form_schema JSONB NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  base_points INTEGER NOT NULL DEFAULT 50,
  kb_category TEXT NOT NULL DEFAULT 'Kehidupan Mesir',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.daily_missions (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES public.mission_templates(id),
  mission_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(template_id, mission_date)
);

CREATE TABLE IF NOT EXISTS public.mission_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_mission_id INTEGER REFERENCES public.daily_missions(id),
  contributor_id UUID NOT NULL,
  form_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_note TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewer_id UUID,
  kb_article_id UUID,
  points_awarded INTEGER,
  UNIQUE(daily_mission_id, contributor_id)
);

-- Eval / benchmark kualitas AI (dipakai Admin Panel → Analitik → Eval)
CREATE TABLE IF NOT EXISTS public.eval_benchmarks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question          TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('factual','procedural','confused','recommendation','brainstorming','current_role','kb_first','memory')),
  expected_behavior TEXT,
  is_edge_case      BOOLEAN NOT NULL DEFAULT false,
  edge_note         TEXT,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.eval_results (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id          UUID REFERENCES public.eval_benchmarks(id) ON DELETE SET NULL,
  run_id                UUID NOT NULL DEFAULT gen_random_uuid(),
  question              TEXT NOT NULL,
  category              TEXT NOT NULL,
  answer                TEXT NOT NULL,
  score_accuracy        SMALLINT CHECK (score_accuracy BETWEEN 1 AND 5),
  score_relevance       SMALLINT CHECK (score_relevance BETWEEN 1 AND 5),
  score_structure       SMALLINT CHECK (score_structure BETWEEN 1 AND 5),
  score_human_feel      SMALLINT CHECK (score_human_feel BETWEEN 1 AND 5),
  score_trustworthiness SMALLINT CHECK (score_trustworthiness BETWEEN 1 AND 5),
  total_score           NUMERIC(5,2),
  notes                 TEXT,
  version_tag           TEXT NOT NULL,
  eval_mode             TEXT NOT NULL DEFAULT 'manual',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.eval_edge_cases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question            TEXT NOT NULL,
  risk_type           TEXT NOT NULL CHECK (risk_type IN ('current_role_error','kb_refusal','memory_over_injection','weak_recommendation','hallucination','other')),
  description         TEXT,
  example_bad_answer  TEXT,
  resolved            BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Intel / analitik retrieval (Admin Panel → Analitik → Query Analytics)
CREATE TABLE IF NOT EXISTS public.intel_retrieval_stats (
  id BIGSERIAL PRIMARY KEY,
  intent TEXT,
  kb_strength TEXT,
  had_kb BOOLEAN NOT NULL DEFAULT false,
  had_wiki BOOLEAN NOT NULL DEFAULT false,
  had_ddg BOOLEAN NOT NULL DEFAULT false,
  had_pinned BOOLEAN NOT NULL DEFAULT false,
  had_perplexity BOOLEAN NOT NULL DEFAULT false,
  confidence_level TEXT,
  external_tier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intel_query_patterns (
  id BIGSERIAL PRIMARY KEY,
  topic_cluster TEXT NOT NULL,
  sample_query TEXT,
  frequency INTEGER NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intel_edge_cases (
  id BIGSERIAL PRIMARY KEY,
  pattern_type TEXT NOT NULL,
  topic_hint TEXT,
  frequency INTEGER NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intel_message_ratings (
  id BIGSERIAL PRIMARY KEY,
  rating INTEGER NOT NULL,
  intent TEXT,
  confidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- BAGIAN 3 — Tabel yang SEBELUMNYA cuma didokumentasikan di komentar kode
-- (query_log, missing_topics, user_notes) — runtime hanya mengecek
-- keberadaannya dan tidak pernah mencoba membuatnya sendiri.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.query_log (
  id            BIGSERIAL PRIMARY KEY,
  query_text    TEXT NOT NULL,
  intent_type   TEXT,
  source_used   TEXT,
  confidence    TEXT,
  user_id       TEXT,
  has_kb_result BOOLEAN DEFAULT false,
  is_transport  BOOLEAN DEFAULT false,
  rating        SMALLINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.missing_topics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query       TEXT NOT NULL,
  intent_type TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  title       TEXT NOT NULL DEFAULT 'Catatan Baru',
  format      TEXT NOT NULL DEFAULT 'note'
              CHECK (format IN ('todo', 'checklist', 'note')),
  content     TEXT,
  items       JSONB DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_notes_user
  ON public.user_notes(user_id, updated_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════
-- BAGIAN 4 — masisir_procedures ("Panduan Prosedur")
-- Sebelumnya HANYA dibuat via koneksi Postgres langsung (DATABASE_URL +
-- package `pg`), terpisah dari Supabase client. Kalau DATABASE_URL belum
-- diset (belum terdokumentasi di .env.example sebelum perbaikan ini),
-- tabel ini tidak pernah dibuat dan fitur Panduan Prosedur rusak.
-- Operasional CRUD hariannya sudah lewat Supabase client biasa (lihat
-- /api/procedures di server.js), jadi begitu tabel ini ada, DATABASE_URL
-- tidak wajib lagi — kecuali kamu mau data contoh (Perpanjang Iqama,
-- Legalisir KBRI, dll) ter-seed otomatis, yang tetap bisa diisi manual
-- lewat Admin Panel → Prosedur.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.masisir_procedures (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  icon_name TEXT NOT NULL DEFAULT 'FileText',
  color TEXT NOT NULL DEFAULT 'text-violet-400',
  steps JSONB NOT NULL DEFAULT '[]',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- BAGIAN 5 — Row Level Security (deny-all default)
--
-- Semua tabel di atas HANYA diakses backend lewat service-role key
-- (getAdminClient() di server.js) — sudah diverifikasi TIDAK ADA satu pun
-- dipanggil langsung dari kode frontend (src/) dengan anon key. service
-- role SELALU bypass RLS, jadi mengaktifkan RLS di sini TIDAK mengubah
-- perilaku aplikasi sama sekali.
--
-- Tapi tanpa RLS, Supabase secara default bisa saja mengizinkan role
-- `anon`/`authenticated` (yaitu: SIAPAPUN yang punya publishable/anon key,
-- yang MEMANG publik dan ada di source frontend) untuk baca/tulis tabel
-- ini langsung, melewati semua validasi & rate limit di server.js. Baris
-- di bawah menutup itu tanpa menambah policy apa pun (deny-all) — cukup
-- untuk kebutuhan aplikasi saat ini, karena tidak ada akses langsung dari
-- browser yang perlu diizinkan.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_config', 'system_settings', 'system_announcements',
    'user_announcement_views', 'answer_feedback', 'saved_answers',
    'flashcard_sets', 'masisir_news', 'masisir_news_comments',
    'library_items', 'mission_templates', 'daily_missions',
    'mission_submissions', 'eval_benchmarks', 'eval_results',
    'eval_edge_cases', 'intel_retrieval_stats', 'intel_query_patterns',
    'intel_edge_cases', 'intel_message_ratings', 'query_log',
    'missing_topics', 'user_notes', 'masisir_procedures'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- BAGIAN 6 — Verifikasi
-- Jalankan query ini SETELAH migration di atas untuk memastikan semua
-- tabel yang dipakai aplikasi (dari SEMUA jalur: supabase/migrations/,
-- migrations/, dan bootstrap ini) benar-benar ada. Baris yang muncul di
-- hasil = tabel yang MASIH HILANG.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT expected.table_name AS tabel_hilang
FROM (VALUES
  -- dari supabase/migrations/*.sql
  ('profiles'), ('user_roles'), ('chats'), ('messages'), ('knowledge_base'),
  ('contributor_requests'), ('tasks'), ('threads'), ('thread_replies'),
  ('thread_votes'), ('article_votes'), ('pinned_updates'), ('message_reports'),
  ('notifications'), ('user_badges'), ('beta_feedback'), ('user_memories'),
  ('subscriptions'), ('daily_focus_items'), ('admin_tracker_items'),
  ('knowledge_sources'), ('knowledge_chunks'), ('demo_access_requests'),
  -- dari migrations/*.sql
  ('query_analytics'), ('query_feedback'), ('kb_drafts'), ('chat_usage'),
  ('reminder_logs'), ('payment_orders'),
  -- dari file bootstrap ini (Bagian 2-4)
  ('app_config'), ('system_settings'), ('system_announcements'),
  ('user_announcement_views'), ('answer_feedback'), ('saved_answers'),
  ('flashcard_sets'), ('masisir_news'), ('masisir_news_comments'),
  ('library_items'), ('mission_templates'), ('daily_missions'),
  ('mission_submissions'), ('eval_benchmarks'), ('eval_results'),
  ('eval_edge_cases'), ('intel_retrieval_stats'), ('intel_query_patterns'),
  ('intel_edge_cases'), ('intel_message_ratings'), ('query_log'),
  ('missing_topics'), ('user_notes'), ('masisir_procedures')
) AS expected(table_name)
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = expected.table_name
WHERE t.table_name IS NULL;
-- Hasil kosong (0 baris) = semua tabel yang diketahui checklist ini sudah ada.
