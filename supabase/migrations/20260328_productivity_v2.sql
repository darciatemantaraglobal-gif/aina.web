-- ─── Daily Focus Items ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_focus_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  focus_date     DATE NOT NULL,
  original_input TEXT,
  title          TEXT NOT NULL,
  description    TEXT,
  source_type    TEXT NOT NULL DEFAULT 'manual'
                 CHECK (source_type IN ('manual','ai_assist','ai_suggest')),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','done')),
  priority       INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_focus_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own focus items"
  ON public.daily_focus_items FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_daily_focus_user_date ON public.daily_focus_items(user_id, focus_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_focus_status    ON public.daily_focus_items(status);
CREATE INDEX IF NOT EXISTS idx_daily_focus_created   ON public.daily_focus_items(created_at DESC);

DROP TRIGGER IF EXISTS update_daily_focus_updated_at ON public.daily_focus_items;
CREATE TRIGGER update_daily_focus_updated_at
  BEFORE UPDATE ON public.daily_focus_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Admin Tracker Items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_tracker_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title            TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'lainnya'
                   CHECK (category IN ('iqomah','paspor','visa','kampus','safar','lainnya')),
  notes            TEXT,
  due_date         DATE,
  status           TEXT NOT NULL DEFAULT 'not_started'
                   CHECK (status IN ('not_started','preparing','submitted','completed')),
  is_urgent        BOOLEAN NOT NULL DEFAULT false,
  reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  checklist_steps  JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_tracker_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tracker items"
  ON public.admin_tracker_items FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_admin_tracker_user   ON public.admin_tracker_items(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_tracker_due    ON public.admin_tracker_items(due_date);
CREATE INDEX IF NOT EXISTS idx_admin_tracker_status ON public.admin_tracker_items(status);
CREATE INDEX IF NOT EXISTS idx_admin_tracker_urgent ON public.admin_tracker_items(is_urgent);

DROP TRIGGER IF EXISTS update_admin_tracker_updated_at ON public.admin_tracker_items;
CREATE TRIGGER update_admin_tracker_updated_at
  BEFORE UPDATE ON public.admin_tracker_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Reminder Logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminder_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_type   TEXT NOT NULL
                CHECK (target_type IN ('daily_focus','admin_tracker','weekly_recap')),
  target_id     UUID,
  channel       TEXT NOT NULL DEFAULT 'in_app'
                CHECK (channel IN ('in_app','email')),
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reminder_date DATE NOT NULL,
  metadata      JSONB
);

ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own reminder logs"
  ON public.reminder_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Server can insert reminder logs"
  ON public.reminder_logs FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_reminder_logs_user ON public.reminder_logs(user_id, reminder_date DESC);
