-- ─── Thread Votes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.thread_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id   UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, thread_id)
);
ALTER TABLE public.thread_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own thread votes"
  ON public.thread_votes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Authenticated view thread votes"
  ON public.thread_votes FOR SELECT TO authenticated USING (true);

-- ─── Article Votes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.article_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id  UUID NOT NULL REFERENCES public.knowledge_base(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, article_id)
);
ALTER TABLE public.article_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own article votes"
  ON public.article_votes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Authenticated view article votes"
  ON public.article_votes FOR SELECT TO authenticated USING (true);

-- ─── vote_count columns ─────────────────────────────────────────────────────
ALTER TABLE public.threads        ADD COLUMN IF NOT EXISTS vote_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS vote_count INTEGER NOT NULL DEFAULT 0;

-- ─── Thread vote-count trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_thread_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.threads SET vote_count = vote_count + 1 WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.threads SET vote_count = GREATEST(vote_count - 1, 0) WHERE id = OLD.thread_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_thread_vote_count ON public.thread_votes;
CREATE TRIGGER trg_thread_vote_count
  AFTER INSERT OR DELETE ON public.thread_votes
  FOR EACH ROW EXECUTE FUNCTION public.update_thread_vote_count();

-- ─── Article vote-count trigger ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_article_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.knowledge_base SET vote_count = vote_count + 1 WHERE id = NEW.article_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.knowledge_base SET vote_count = GREATEST(vote_count - 1, 0) WHERE id = OLD.article_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_article_vote_count ON public.article_votes;
CREATE TRIGGER trg_article_vote_count
  AFTER INSERT OR DELETE ON public.article_votes
  FOR EACH ROW EXECUTE FUNCTION public.update_article_vote_count();
