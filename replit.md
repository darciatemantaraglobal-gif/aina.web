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
- `contributor_requests` — contributor applications (includes `reason`, `article_content`, `article_file_url`, `portfolio_link`, `review_notes`, `reviewed_by`, `reviewed_at`; status: `pending` | `article_reviewed` | `approved` | `rejected`)
- `system_announcements` — admin-managed popup announcements (type, target_audience, is_active, schedule, optional CTA button)
- `user_announcement_views` — tracks which announcements each user has seen/dismissed
- `tasks` — personal productivity tasks
- `user_badges` — badge/achievement system
- `notifications` — in-app notifications
- `thread_votes` — upvotes on threads (user_id + thread_id, UNIQUE; triggers update `threads.vote_count`)
- `article_votes` — upvotes on KB articles (user_id + article_id, UNIQUE; triggers update `knowledge_base.vote_count`)

## Security Measures (server.js)

- **Helmet** — HTTP security headers (XSS, clickjacking, MIME sniffing protection)
- **Rate limiting** — Global 200 req/min per IP; stricter limits per route:
  - `/api/chat` — 20 req/min (chatLimiter) + auth required + daily per-user DB limit
  - `/api/upload-avatar` — 5 req/min (uploadLimiter)
  - `/api/feedback` — 5 req/min (feedbackLimiter) + auth required
  - Write endpoints (threads, replies, reports) — 30 req/min (writeLimiter)
  - `/api/setup/claim-admin` — 10 req/min (strictLimiter)
- **CORS** — Exact origin matching only; suffix-checks `*.replit.dev` / `*.replit.app`
- **Body size** — 64KB default for all routes; 2MB only for avatar upload
- **Input length caps** — Thread title ≤200, content ≤10k, reply ≤2k, feedback ≤2k, reason ≤500
- **Avatar mimeType whitelist** — Only jpeg/png/webp/gif accepted; extension derived server-side
- **Admin cache bounded** — Max 500 entries with LRU eviction (prevents memory-leak attack)
- **Chat auth enforced** — `/api/chat` requires valid Supabase JWT; unauthenticated requests blocked before reaching OpenRouter

## Running the Project

```bash
npm install   # Install dependencies
npm run dev   # Start both backend (port 3001) and frontend (port 5000) using concurrently
```

## Replit Setup Notes

- `concurrently` is a devDependency; dev script uses explicit `node_modules/.bin/concurrently` path for Replit compatibility
- All environment variables are set via Replit's environment (not `.env` file in production)
- Secrets stored in Replit Secrets: `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`
- Public env vars stored in Replit shared env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `MASTER_ADMIN_IDS`, `EMAIL_FROM`, `PORT`
- Supabase Storage buckets (`avatars`, `temp-uploads`, `announcements`, `thread-images`) are auto-created on server startup if missing
- If Vite fails to start with a source map error in `node_modules/lucide-react`, delete the corrupt `.map` file and restart

## Pricing & Payments

- **Pricing page** has 3 tiers: Gratis (Rp 0), Pro (Rp 29.000/bln | Rp 249.000/thn), Contributor (gratis via kontribusi)
- **Pro tier** is "Segera Hadir" — UI fully built, payment not yet active
- **Payment gateway: Midtrans** — supports GoPay, OVO, ShopeePay, DANA, QRIS, VA BCA/BRI/BNI/Mandiri/Permata
- **Activation**: Set `PAYMENT_ENABLED=true` + `MIDTRANS_SERVER_KEY` + `MIDTRANS_CLIENT_KEY` + `MIDTRANS_IS_PRODUCTION=true` (for production)
- **Subscription table**: needs `subscriptions` table in Supabase before going live (schema in payment webhook code)
- **Webhook**: `/api/payment/webhook` — Midtrans notifies this endpoint on successful payment
- **PaymentModal**: `src/components/PaymentModal.tsx` — shows waitlist signup, coming soon notice, and payment methods

## AI Chat Routing Architecture (server.js)

**Source priority (strict 3-layer):**
1. **Layer 1 — Knowledge Base (KB)**: Always checked first. If `kbStrength === "strong"`, answer from KB only, no external calls.
2. **Layer 2 — Perplexity**: Fires for ALL non-casual queries where KB is absent/weak. Primary external intelligence source. If Perplexity key is configured but call fails → go straight to model (no Wikipedia/DDG fallback).
3. **Layer 3 — Model fallback**: Training knowledge, used for stable facts (definitions, history, concepts) or when all external sources fail.
4. **Wikipedia/DDG**: Only active when Perplexity API key is entirely unconfigured. Not used in normal flow.
5. **Currency (exchange-rate API)**: Currency/kurs queries bypass Perplexity entirely. Uses Frankfurter API. If API fails → hard block injected into prompt to prevent hallucinated numbers.
6. **Dorar.net (حديث)**: Runs in parallel with Wave 1 fetches when `intent.primary === "fiqh"`. Fetches from `dorar.net/dorar_api.json?skey=<Arabic term>`. Returns up to 5 hadiths; AI displays Arabic text + Indonesian translation + attribution. Badge displayed in emerald green. Trust score: 82 (high). Perplexity/Wikipedia/DDG all skipped for fiqh intent — Dorar is the sole external source.

**Intent types** (`detectIntent` in server.js):
- `fiqh` — NEW: Islamic knowledge questions (fiqh, hadith, aqidah). Always Tier B model. Dorar.net fetched. Perplexity/Wikipedia/DDG skipped. Methodology hint: Quran dalil → Hadith → scholar opinion → legal conclusion. Detected via `isFiqhQuery()`.
- `arabic_writing` — Arabic academic writing tasks. Always Tier B model. No external fetch. Arabic response mandatory.
- `factual/procedural/confused/recommendation/brainstorming` — General Indonesian intents. Tier A/B based on KB strength.

**Answer mode system** (`detectAnswerMode` / `buildAnswerModeHint` in server.js):
- `concise` — 2-3 sentences / 3-4 bullets max
- `balanced` (default) — direct answer + short explanation + practical context; feels complete, not clipped
- `detailed` — full explanation, organized, with context and tips
- Detected from `userProfile.answerMode` → legacy `responseLength` (`ringkas`/`lengkap`) → default `balanced`
- Injected as a `[Mode Jawaban]` block at the end of the system prompt

**Structured per-turn log** (`[SourceDecision]` JSON):
```
kb_used, kb_strength, query_type, external_type, external_called,
external_success, fallback_used, final_source, answer_mode
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
- **Leaderboard** — Top contributors ranked by article count + top voted KB articles with live upvote toggle
- **Upvote System** — Toggle upvotes on threads (list + detail view) and approved KB articles; counts maintained via DB triggers
- **Guided Tour** — Custom 8-step onboarding tour (`GuidedTour.tsx`) auto-shown to first-time users; spotlight + tooltip overlay via React portal; skippable and restartable via "Panduan Fitur" button in sidebar; state persisted in `localStorage` under `aina_tour_seen_v1`

## Key Files

- `server.js` — Express backend with all API routes
- `src/integrations/supabase/client.ts` — Supabase client config
- `vite.config.ts` — Vite config with proxy and env var definitions
- `supabase/migrations/` — Database schema migrations (run manually in Supabase dashboard)
