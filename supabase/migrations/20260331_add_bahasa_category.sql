-- Add "Bahasa" to the knowledge_base category CHECK constraint
-- Previously only had: Administrasi, Akademik, Kehidupan Mesir, Transport, Tempat Tinggal, Kuliner
-- "Bahasa" was added as a category after the initial schema — this migration makes it accepted by the DB.

-- knowledge_base table
ALTER TABLE public.knowledge_base
  DROP CONSTRAINT IF EXISTS knowledge_base_category_check;

ALTER TABLE public.knowledge_base
  ADD CONSTRAINT knowledge_base_category_check
  CHECK (category IN ('Administrasi', 'Akademik', 'Kehidupan Mesir', 'Transport', 'Tempat Tinggal', 'Kuliner', 'Bahasa'));

-- threads table (same constraint issue)
ALTER TABLE public.threads
  DROP CONSTRAINT IF EXISTS threads_category_check;

ALTER TABLE public.threads
  ADD CONSTRAINT threads_category_check
  CHECK (category IN ('Administrasi', 'Akademik', 'Kehidupan Mesir', 'Transport', 'Tempat Tinggal', 'Kuliner', 'Bahasa'));
