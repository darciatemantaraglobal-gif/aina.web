# AINA — Asisten Pintar Masisir

AI assistant for Indonesian students in Egypt (Masisir). Built with React + Vite frontend and an Express backend, powered by Supabase for auth/database and OpenRouter for AI.

## Architecture

- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, React Router v6
- **Backend**: Node.js + Express (`server.js`), runs on port 3001
- **Auth & Database**: Supabase (external) — `@supabase/supabase-js` used on both frontend and backend
- **AI**: OpenRouter API (multiple free model fallbacks via `Promise.any`)
- **Email**: Resend API (optional, email notifications disabled if key not set)

## Running

The app runs with a single workflow: `npm run dev`
- Starts `node server.js` (API on port 3001) and `vite` (frontend on port 5000) concurrently
- Vite proxies `/api/*` requests to `localhost:3001`

## Required Environment Secrets

| Secret | Purpose |
|--------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL (used by frontend) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key (used by frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (used by server only) |
| `OPENROUTER_API_KEY` | OpenRouter API key for AI chat |
| `RESEND_API_KEY` | (Optional) Resend API key for email notifications |

## Optional Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 3001 | API server port |
| `EMAIL_FROM` | `AINA <noreply@ainalabs.pro>` | Sender address for emails |

## Key Files

- `server.js` — Express API server (chat, admin, avatar upload, email)
- `src/integrations/supabase/client.ts` — Supabase frontend client
- `src/App.tsx` — React app entry, routing
- `src/pages/` — Page components (Dashboard, Login, Admin, etc.)
- `src/components/` — Shared UI components
- `vite.config.ts` — Vite config with `/api` proxy to port 3001
- `supabase/migrations/` — Database schema SQL

## Database Schema (Supabase)

Tables: `profiles`, `user_roles`, `chats`, `messages`, `knowledge_base`, `contributor_requests`, `tasks`, `notifications`

Roles: `user`, `contributor`, `senior_contributor`, `admin`

## Features

- AI Chat with Knowledge Base context injection
- Daily message limit (3/day for free users, unlimited for contributors+)
- Knowledge Base — contributors write articles, admins approve
- Contributor request flow with email notifications
- Admin panel — user management, role assignment, article review
- Avatar upload via Supabase Storage
- Productivity tools (tasks, habits, notes)
