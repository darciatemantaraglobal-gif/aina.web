-- File: supabase/migrations/20260319_beta_feedback.sql
-- Beta feedback table (replaces local file storage, works on Vercel serverless)

create table if not exists beta_feedback (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('bug', 'suggestion', 'general')) default 'general',
  message     text not null,
  user_id     uuid references auth.users(id) on delete set null,
  user_email  text,
  created_at  timestamptz not null default now()
);

-- Admins can read all feedback; users can insert their own
alter table beta_feedback enable row level security;

create policy "Admins can read feedback"
  on beta_feedback for select
  using (
    exists (
      select 1 from user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

create policy "Authenticated users can insert feedback"
  on beta_feedback for insert
  with check (auth.uid() = user_id);
