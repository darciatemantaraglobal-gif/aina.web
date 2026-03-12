# AINA - AI Assistant Masisir

An AI assistant web app for Indonesian students (Masisir) in Egypt. Built with React + TypeScript + Vite + TailwindCSS, using Supabase for authentication and database.

## Architecture

- **Frontend**: React 18 + TypeScript + Vite (runs on port 5000)
- **Auth & Database**: Supabase (Postgres + Auth with Google OAuth and Magic Link)
- **Styling**: TailwindCSS + shadcn/ui components
- **Routing**: React Router v6

## Project Structure

```
src/
  pages/        - Route-level pages (Index, Login, Dashboard, etc.)
  components/   - Reusable components (ChatArea, DashboardSidebar, etc.)
  integrations/
    supabase/   - Supabase client and TypeScript types
  hooks/        - Custom React hooks
  lib/          - Utilities (cn helper)
public/
  fonts/        - Custom fonts (Sunspire, Sk-Modernist)
supabase/
  migrations/   - Database schema SQL migrations
```

## Key Features

- **Landing page** with hero section, features, pricing, partner, berita sections
- **Auth**: Google OAuth + Magic Link (email OTP) via Supabase
- **Dashboard** with:
  - Chat AI (AINA assistant)
  - Productivity (daily tasks, habit tracker, notes)
  - Berita Masisir (news placeholder)
  - Contributor system (submit articles, knowledge base)
  - Admin panel (approve/reject contributor requests and articles)
  - Profile page

## Database Schema (Supabase Postgres)

Tables: `profiles`, `user_roles`, `chats`, `messages`, `knowledge_base`, `contributor_requests`, `tasks`
Enum: `app_role` = `user | contributor | senior_contributor | admin`

## Environment Variables

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon/public key
- `VITE_SUPABASE_PROJECT_ID` - Supabase project ID

## Running

The app starts automatically via the "Start application" workflow running `npm run dev` on port 5000.
