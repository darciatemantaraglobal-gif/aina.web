# AINA — Asisten Pintar Mahasiswa Indonesia di Mesir

AINA adalah asisten AI yang dirancang khusus untuk Masisir (Mahasiswa Indonesia di Mesir). Dibangun dengan React + Vite di frontend dan Express.js di backend, menggunakan Supabase untuk autentikasi dan database.

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- Express.js (backend API)
- Supabase (auth + database + storage)
- OpenRouter (AI model routing)

## Development

```sh
# Install dependencies
npm install

# Start development server (frontend port 5000, backend port 3001)
npm run dev
```

## Environment Variables

Dibutuhkan di Replit Secrets:

- `OPENROUTER_API_KEY` — API key untuk OpenRouter
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key Supabase

## Deployment

Deploy via Replit — klik tombol **Publish** di panel Replit.
