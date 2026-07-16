CREATE TABLE IF NOT EXISTS public.demo_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  origin_city text,
  faculty text,
  study_field text,
  ai_importance smallint NOT NULL CHECK (ai_importance BETWEEN 1 AND 5),
  ai_importance_reason text,
  access_code text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_access_requests ENABLE ROW LEVEL SECURITY;
-- No public policies on purpose: this table is accessed ONLY via the backend service role.
