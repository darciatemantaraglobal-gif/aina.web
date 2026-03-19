-- Threads feature: community sharing that can be promoted to knowledge base

CREATE TABLE IF NOT EXISTS public.threads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('Administrasi', 'Akademik', 'Kehidupan Mesir', 'Transport', 'Tempat Tinggal', 'Kuliner')),
  reply_count  INTEGER NOT NULL DEFAULT 0,
  promoted_to_kb BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Authenticated users can view threads" ON public.threads FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated users can create threads" ON public.threads FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authors can delete own threads" ON public.threads FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage all threads" ON public.threads FOR ALL USING (public.has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.thread_replies (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES public.threads(id) ON DELETE CASCADE NOT NULL,
  user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.thread_replies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Authenticated users can view replies" ON public.thread_replies FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated users can create replies" ON public.thread_replies FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authors can delete own replies" ON public.thread_replies FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage all replies" ON public.thread_replies FOR ALL USING (public.has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Auto-update reply_count on threads when replies are added/deleted
CREATE OR REPLACE FUNCTION public.update_thread_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.threads SET reply_count = reply_count + 1, updated_at = now() WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.threads SET reply_count = GREATEST(reply_count - 1, 0), updated_at = now() WHERE id = OLD.thread_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_threads_reply_count ON public.thread_replies;
CREATE TRIGGER update_threads_reply_count
  AFTER INSERT OR DELETE ON public.thread_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_thread_reply_count();

DROP TRIGGER IF EXISTS update_threads_updated_at ON public.threads;
CREATE TRIGGER update_threads_updated_at
  BEFORE UPDATE ON public.threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_threads_category ON public.threads(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_user ON public.threads(user_id);
CREATE INDEX IF NOT EXISTS idx_thread_replies_thread ON public.thread_replies(thread_id, created_at ASC);
