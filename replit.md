# AINA - AI Assistant Masisir

An AI assistant web app for Indonesian students (Masisir) in Egypt. Built with React + TypeScript + Vite + TailwindCSS, using Supabase for authentication and database.

## Architecture

- **Frontend**: React 18 + TypeScript + Vite (port 5000)
- **Backend API**: Express.js server (port 3001) — proxies AI chat to OpenRouter, API key stays server-side
- **Auth & Database**: Supabase (Postgres + Auth with Google OAuth and Magic Link)
- **Styling**: TailwindCSS + shadcn/ui components
- **Routing**: React Router v6

## Dev Command

`npm run dev` starts both the Express API server (port 3001) AND Vite (port 5000) concurrently.
Vite proxies `/api/*` → `http://localhost:3001`.

## Project Structure

```
src/
  pages/        - Route-level pages (Index, Login, Dashboard, etc.)
  components/   - Reusable components (ChatArea, DashboardSidebar, AdminPage, etc.)
  integrations/
    supabase/   - Supabase client and TypeScript types
  hooks/        - Custom React hooks
  lib/          - Utilities (cn helper)
server.js       - Express backend: OpenRouter proxy at POST /api/chat
public/
  fonts/        - Custom fonts (Sunspire, Sk-Modernist)
supabase/
  migrations/   - Database schema SQL migrations
```

## Key Features

- **Landing page** with hero, features (bento-grid), pricing, partner, berita sections
- **Auth**: Google OAuth + Magic Link (email OTP) via Supabase
- **Dashboard** with:
  - Chat AI (AINA — powered by OpenRouter, multiple free model fallbacks)
  - Productivity (daily tasks, habit tracker, notes)
  - Berita Masisir (news placeholder)
  - Contributor system (submit articles, knowledge base)
  - **Admin Panel** — full control: user management, role assignment, contributor request moderation, knowledge base moderation
  - Profile page

## Database Schema (Supabase Postgres)

Tables: `profiles`, `user_roles`, `chats`, `messages`, `knowledge_base`, `contributor_requests`, `tasks`
Enum: `app_role` = `user | contributor | senior_contributor | admin`

RLS policies protect all tables. Admins get full access via `has_role()` security definer function.

## Role System

| Role | Description |
|------|-------------|
| `admin` | Full access: manage users, roles, content |
| `senior_contributor` | ≥10 approved articles |
| `contributor` | Verified, can submit articles |
| `user` | Default role for new signups |

## Admin Panel Setup

To grant admin access to an account, run this SQL in the Supabase SQL Editor:

```sql
-- Replace 'user@email.com' with the actual email
UPDATE public.user_roles
SET role = 'admin'
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'user@email.com'
);

-- If no row exists yet (shouldn't happen, but just in case):
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'user@email.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Also update the profile level display
UPDATE public.profiles
SET level = 'Admin'
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'user@email.com'
);
```

## AI Chat (OpenRouter)

- `OPENROUTER_API_KEY` stored in Replit Secrets
- Model fallback list (tries in order, skips if rate-limited):
  1. nvidia/nemotron-3-super-120b-a12b:free
  2. minimax/minimax-m2.5:free
  3. stepfun/step-3.5-flash:free
  4. meta-llama/llama-3.3-70b-instruct:free
  5. openai/gpt-oss-120b:free
  6. (+ 5 more fallbacks)

## Environment Variables

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon/public key
- `OPENROUTER_API_KEY` - OpenRouter API key (server-side only, never exposed to browser)
