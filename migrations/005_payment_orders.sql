-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005 — payment_orders: exact order_id → user mapping (F4-2)
-- Jalankan sekali di Supabase SQL Editor:
--   Dashboard → SQL Editor → paste seluruh file ini → Run
--
-- AMAN untuk dijalankan berulang kali (IF NOT EXISTS).
--
-- Kenapa: webhook Midtrans (/api/payment/webhook) sebelumnya mencocokkan
-- user dengan cara mengekstrak 8 karakter pertama UUID dari order_id lalu
-- `ilike("user_id", prefix + "%")` — dua user dengan 8 karakter awal UUID
-- yang sama bisa saling tertukar status Pro-nya. order_id tidak bisa
-- menyimpan UUID penuh karena Midtrans membatasi order_id maksimal 50
-- karakter (AINA-PRO_MONTHLY-<uuid 36 char>-<timestamp> sudah melebihi
-- itu). Solusinya: simpan pemetaan order_id → user_id secara eksplisit
-- saat order dibuat (exact match, tidak ambigu), bukan menebak dari
-- string order_id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_orders (
  order_id   TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan       TEXT NOT NULL CHECK (plan IN ('pro_monthly', 'pro_annual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON public.payment_orders(user_id);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
-- Deny-all by default — only accessed via service role from the backend
-- (create-order write, webhook read), never directly from the frontend.
