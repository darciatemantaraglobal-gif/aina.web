# AINA — Asisten Pintar Masisir

An AI-powered assistant for Indonesian students in Egypt (Masisir), built with React + Express + Supabase.

## Architecture

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui (port 5000)
- **Backend**: Express.js server (port 3001), proxied via Vite `/api` prefix
- **Auth & Database**: Supabase (PostgreSQL with RLS, Auth, Storage)
- **AI Engine**: OpenRouter (Gemini 2.5 Flash primary, Gemini 2.0 Flash fallback)
- **PWA**: `vite-plugin-pwa` + Workbox (service worker, offline caching, install prompt, mobile bottom nav)
- **Additional DB**: Replit PostgreSQL used for `masisir_procedures` table

## Running the App

```bash
npm run dev
```

This concurrently starts:
1. `node server.js` — Express API on port 3001
2. `vite` — React frontend on port 5000

## Key Environment Variables

### Secrets (set in Replit Secrets tab)
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side Supabase admin access
- `OPENROUTER_API_KEY` — AI chat (required)
- `OPENAI_API_KEY` — Optional: enables semantic/vector search
- `PERPLEXITY_API_KEY` — Optional: enables web search fallback
- `RESEND_API_KEY` — Optional: enables email notifications
- `GOOGLE_MAPS_API_KEY` — Optional: enables Places search

### Env Vars (set in Replit Environment Variables / shared)
- `SUPABASE_URL` / `VITE_SUPABASE_URL` — Supabase project URL (`https://qyzimrshfcenpwvuownz.supabase.co`)
- `SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon key
- `VITE_SUPABASE_PROJECT_ID` — Supabase project ID (`qyzimrshfcenpwvuownz`)
- `MASTER_ADMIN_IDS` — Comma-separated Supabase user UUIDs with master admin access
- `EMAIL_FROM` — Email sender name/address for notifications
- `PORT` — Express server port (3001)
- `DATABASE_URL` — Replit PostgreSQL URL (auto-managed, used for `masisir_procedures` table)

## Project Structure

```
├── src/                    # React frontend
│   ├── components/         # UI components (shadcn/ui + custom)
│   ├── pages/              # Route pages
│   ├── hooks/              # Custom React hooks
│   └── integrations/       # Supabase client config
├── server.js               # Main Express server (~11k lines)
├── api/engine/             # AI engine modules
│   ├── intentDetector.js   # Query intent classification
│   ├── sourceOrchestrator.js # Multi-source retrieval logic
│   ├── promptBuilder.js    # System prompt construction
│   ├── responseFormatter.js
│   ├── embedder.js         # OpenAI embedding support
│   └── placesSearch.js     # Google Maps integration
├── server/
│   ├── routes/             # productivity.js, productivityAI.js
│   └── services/           # reminderService.js, focusService.js, etc.
└── supabase/migrations/    # All DB schema SQL files
```

## Supabase Schema

Key tables: `profiles`, `user_roles`, `chats`, `messages`, `knowledge_base`, `threads`, `thread_replies`, `thread_votes`, `article_votes`, `tasks`, `user_memories`, `notifications`, `user_badges`, `pinned_updates`, `message_reports`, `beta_feedback`, `contributor_requests`, `subscriptions`, `daily_focus_items`, `admin_tracker_items`, `reminder_logs`, `query_log`, `missing_topics`, `user_notes`

## Deployment

Uses Replit Autoscale. Build command: `npm run build`. Run command: `node ./dist/index.cjs`.
