-- Add custom instructions columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_about        TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_instructions TEXT DEFAULT NULL;

-- No RLS changes needed — profiles already allows users to update their own row
-- and service role bypasses all RLS (used in admin reads)
