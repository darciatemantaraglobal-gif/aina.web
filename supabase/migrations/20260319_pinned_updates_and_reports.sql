-- Feature #4: Breaking Updates (pinned_updates)
CREATE TABLE IF NOT EXISTS public.pinned_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       TEXT NOT NULL,
  content     TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  expires_at  TIMESTAMPTZ,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pinned_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage pinned_updates"
  ON public.pinned_updates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Server can read pinned_updates"
  ON public.pinned_updates FOR SELECT
  USING (true);

-- Feature #9: Message Reports (message_reports)
CREATE TABLE IF NOT EXISTS public.message_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message_id      TEXT,
  message_content TEXT,
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  admin_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own reports"
  ON public.message_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin can manage all reports"
  ON public.message_reports FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_pinned_updates_active ON public.pinned_updates(active, expires_at);
CREATE INDEX IF NOT EXISTS idx_message_reports_status ON public.message_reports(status, created_at DESC);
