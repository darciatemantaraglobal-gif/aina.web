# AINA — Asisten Pintar Masisir

AI-powered assistant platform for Indonesian students in Egypt (Masisir). Features an AI chat system, crowdsourced knowledge base, contributor management, badge system, and productivity tools.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite (port 5000)
- **Backend**: Express.js API server (port 3001)
- **Auth & Database**: Supabase (PostgreSQL + GoTrue auth + Storage)
- **AI**: OpenRouter API (multiple free models with fallback)
- **Styling**: Tailwind CSS + shadcn/ui (Radix UI)
- **State**: TanStack Query (React Query)

## Architecture

- Single `npm run dev` command runs both the Express backend and Vite frontend concurrently
- Vite proxies `/api` requests to `http://localhost:3001` in development
- Frontend uses Supabase JS client for auth (login, signup, session management)
- Backend uses Supabase service role key for admin operations (user management, role verification)
- AI chat is handled server-side via `/api/chat` endpoint using OpenRouter

## Required Environment Secrets

| Secret | Purpose |
|--------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL (used by frontend + server) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key (frontend auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side admin) |
| `OPENROUTER_API_KEY` | OpenRouter API key for AI chat |
| `MASTER_ADMIN_IDS` | Comma-separated Supabase user UUIDs with super-admin access |
| `RESEND_API_KEY` | (Optional) Resend API key for email notifications |

## Database

Managed entirely by Supabase. Schema is in `supabase/migrations/`. Tables:
- `profiles` — user profiles
- `user_roles` — role assignments (user/contributor/senior_contributor/admin)
- `chats` + `messages` — AI chat history
- `knowledge_base` — crowdsourced articles
- `contributor_requests` — contributor applications
- `tasks` — personal productivity tasks
- `user_badges` — badge/achievement system
- `notifications` — in-app notifications

## Running the Project

```bash
npm install   # Install dependencies
npm run dev   # Start both backend (port 3001) and frontend (port 5000)
```

## Features

- **AI Chat** — Multi-model fallback via OpenRouter (10 free models, `Promise.any()`)
- **Knowledge Base** — Contributor-submitted articles, admin moderation workflow
- **Article Types** — `narrative` vs `step_by_step` with format-aware AI prompting
- **User Personalization** — Profile study info (faculty, jurusan, angkatan, kota asal) injected into AI context
- **Breaking Updates** — Admin pins urgent info; auto-injected at highest priority into every AI chat
- **Message Reports** — Users flag inaccurate AI responses; admin reviews in dashboard
- **RBAC** — user / contributor / senior_contributor / admin; rate limit 3 msgs/day for free users
- **Badges** — Achievement system stored in `user_badges`
- **Admin Dashboard** — Overview, Users (master admin), Monitor, Requests, Knowledge Base, Breaking Updates, Laporan tabs

## Key Files

- `server.js` — Express backend with all API routes
- `src/integrations/supabase/client.ts` — Supabase client config
- `vite.config.ts` — Vite config with proxy and env var definitions
- `supabase/migrations/` — Database schema migrations (run manually in Supabase dashboard)
