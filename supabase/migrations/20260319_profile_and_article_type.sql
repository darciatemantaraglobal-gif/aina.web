-- #2: Article type field for step-by-step vs narrative articles
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS article_type TEXT NOT NULL DEFAULT 'narrative'
  CHECK (article_type IN ('narrative', 'step_by_step'));

-- #3: Extended profile fields for personalization
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS faculty TEXT,
  ADD COLUMN IF NOT EXISTS study_field TEXT,
  ADD COLUMN IF NOT EXISTS arrival_year INTEGER,
  ADD COLUMN IF NOT EXISTS origin_city TEXT;
