# AINA — Asisten Pintar Masisir

AI assistant platform for Indonesian students studying in Egypt (Masisir). Built with React + Vite frontend and an Express.js backend, using Supabase for auth and database.

## Architecture

- **Frontend**: React + TypeScript + Vite (port 5000)
- **Backend**: Express.js API server (port 3001), proxied via Vite's `/api/*` proxy
- **Auth & Database**: Supabase (hosted) — auth, profiles, chats, knowledge_base, tasks, user_roles
- **AI Chat**: OpenRouter API with multi-model fallback chain

## Running the App

```bash
npm run dev
```

This starts both the Express server (`node server.js`) and Vite dev server concurrently.

## Key Files

- `server.js` — Express API server: AI chat endpoint, admin endpoints (stats, users, articles, contributor requests)
- `src/integrations/supabase/client.ts` — Supabase client (uses anon key, safe for frontend)
- `src/components/ChatArea.tsx` — Chat UI, calls `/api/chat`
- `src/components/AdminPage.tsx` — Admin dashboard, calls `/api/admin/*` with auth token
- `src/components/ContributorPage.tsx` — Contributor registration & article submission
- `src/components/ProductivityPage.tsx` — Tasks, habits, notes (Supabase direct)
- `src/pages/Login.tsx` — Email/password + Google OAuth login
- `src/pages/AuthCallback.tsx` — Supabase OAuth callback handler

## Environment Variables

Set in Replit Secrets (sensitive) or `.replit` [userenv.shared] (non-sensitive):

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | userenv.shared | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | userenv.shared | Supabase anon/public key |
| `OPENROUTER_API_KEY` | Secret | OpenRouter AI API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Supabase service role key (admin operations) |

## Database Schema (Supabase)

Tables: `profiles`, `user_roles`, `chats`, `messages`, `knowledge_base`, `contributor_requests`, `tasks`

Roles: `user` → `contributor` → `senior_contributor` → `admin`

- Contributors can submit articles to the knowledge base
- Senior Contributors: ≥10 approved articles
- Admins: full access via admin panel

## Deployment

Configured for Replit Autoscale deployment. Build command: `npm run build`. Run: `node ./dist/index.cjs`.
