# AINA — Asisten Pintar Mahasiswa Indonesia di Mesir

AI assistant built for Masisir (Indonesian students in Egypt). React + Vite frontend, Express.js backend, Supabase for auth & database, OpenRouter for AI chat.

## Stack

- **Frontend**: React 18, Vite 5, Tailwind CSS, shadcn/ui, React Router v6
- **Backend**: Express.js (ESM), runs on `server.js`
- **Auth/DB**: Supabase (service-role key on backend, anon key on frontend)
- **AI**: OpenRouter API
- **Payments**: Midtrans (disabled unless `PAYMENT_ENABLED=true`)

## Running on Replit

```
npm run dev
```

Starts both the Express backend (port 3001) and the Vite dev server concurrently.

### Required environment secrets

| Secret | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (never expose to frontend) |
| `SUPABASE_ANON_KEY` | Supabase public anon key (server-side) |
| `VITE_SUPABASE_URL` | Supabase URL exposed to frontend |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key exposed to frontend |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ID exposed to frontend |
| `OPENROUTER_API_KEY` | OpenRouter key for AI chat |
| `CLIENT_URL` | Frontend origin for CORS (e.g. `https://your-app.vercel.app`) |
| `SESSION_SECRET` | Express session secret |

Optional secrets (features degrade gracefully without them):
- `PERPLEXITY_API_KEY` — web search
- `VOYAGEAI_API_KEY` — vector embeddings / RAG
- `OPENAI_API_KEY` — moderation, vision
- `RESEND_API_KEY` — email notifications
- `GOOGLE_MAPS_API_KEY` — Places search
- `MIDTRANS_SERVER_KEY` / `MIDTRANS_CLIENT_KEY` — payments (also set `PAYMENT_ENABLED=true`)
- `MASTER_ADMIN_IDS` — comma-separated Supabase user UUIDs for master admin access
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — Telegram notifications

## Build

```
npm run build
```

Produces `dist/` (frontend) and `dist/index.cjs` (server entry for production).

## Key source layout

```
server.js          — Express monolith (backend API)
src/               — React frontend
engine/            — AI pipeline (prompt builder, retrieval, etc.)
server/routes/     — Modular Express routers
server/services/   — Background services (reminders, job queue, etc.)
scripts/           — Build helpers
```

## Notes

- `npm test` will fail on Replit NixOS: the `canvas` package requires `libuuid.so.1` which is not available in this environment. This is a pre-existing limitation, not a code bug.
- The `esbuild`/`vite` moderate vulnerability (GHSA-67mh-4wv8-2f99) requires `npm audit fix --force` (major version bump to Vite 8). Intentionally deferred — upgrade separately when ready.
