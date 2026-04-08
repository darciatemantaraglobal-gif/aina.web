-- Add leaderboard display preference to profiles
-- Allows contributors to choose how their name appears on the leaderboard:
--   'full_name' = nama asli (default)
--   'alias'     = nama panggilan/alias yang mereka tentukan sendiri
--   'code'      = kode unik otomatis, mis. KONT-A3F2

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS leaderboard_display TEXT NOT NULL DEFAULT 'full_name'
    CHECK (leaderboard_display IN ('full_name', 'alias', 'code')),
  ADD COLUMN IF NOT EXISTS alias TEXT;
