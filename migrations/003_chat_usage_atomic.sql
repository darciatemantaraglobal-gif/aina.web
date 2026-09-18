-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003 — increment_chat_usage: atomic daily chat quota
-- Jalankan sekali di Supabase SQL Editor:
--   Dashboard → SQL Editor → paste seluruh file ini → Run
--
-- AMAN untuk dijalankan berulang kali (CREATE OR REPLACE / IF NOT EXISTS).
--
-- Kenapa: enforcement kuota chat harian sebelumnya SELECT count lalu INSERT
-- terpisah (fire-and-forget). Dua request bersamaan bisa sama-sama membaca
-- count yang sama dan sama-sama lolos limit, dan error pada INSERT ditelan
-- diam-diam sehingga penggunaan tidak tercatat. Fungsi ini menggabungkan
-- keduanya jadi satu round-trip DB yang dikunci per user (advisory lock),
-- sehingga cek dan catat kuota jadi atomik.
--
-- Return value:
--   - integer (jumlah pesan user SETELAH increment ini) jika masih di bawah limit
--   - NULL jika limit sudah tercapai (tidak jadi insert apa pun)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_chat_usage(
  p_user_id uuid,
  p_window_start timestamptz,
  p_limit int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_count int;
BEGIN
  -- Advisory lock keyed on the user's UUID so concurrent requests from the
  -- SAME user serialize here, while different users never block each other.
  -- hashtextextended gives a stable bigint from the uuid text representation.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT count(*) INTO v_count
  FROM public.chat_usage
  WHERE user_id = p_user_id
    AND created_at >= p_window_start;

  IF v_count >= p_limit THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.chat_usage (user_id) VALUES (p_user_id);

  RETURN v_count + 1;
END;
$func$;

-- Only the backend's service-role key calls this (never exposed to anon/authenticated
-- directly), but revoke broad grants defensively since SECURITY DEFINER runs as owner.
REVOKE ALL ON FUNCTION public.increment_chat_usage(uuid, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_chat_usage(uuid, timestamptz, int) TO service_role;
