# Urutan Migrasi Database — Checklist Pra-Launch (F3-1)

Repo ini punya **tiga folder/mekanisme migrasi berbeda** yang tidak
otomatis nyambung satu sama lain. Kalau dijalankan sembarangan urutan,
beberapa fitur akan gagal senyap (tabel/kolom belum ada, tapi kode tidak
crash — cuma warning di log atau fitur yang diam-diam tidak berfungsi).

Dokumen ini adalah urutan yang **sudah diverifikasi jalan dari nol** —
dites end-to-end di database Postgres 16 kosong (bukan cuma dibaca).

## Kenapa ada 3 mekanisme

| # | Lokasi | Cara jalan | Isinya |
|---|---|---|---|
| 1 | `supabase/migrations/*.sql` | Manual paste ke SQL Editor (atau `supabase db push` kalau project sudah di-link) | Tabel inti: profiles, chats, messages, knowledge_base, threads, votes, subscriptions, productivity, dll |
| 2 | `migrations/001-004.sql` (folder ini) | Manual paste ke SQL Editor | Tabel yang tidak masuk migration Supabase CLI, plus fungsi RPC (`exec_sql`, `increment_chat_usage`) |
| 3 | Auto-migration di `server.js` (`checkRequiredTables`, `runColumnMigrations`) | Otomatis tiap server boot | ALTER TABLE kolom baru + beberapa CREATE TABLE — **tapi CREATE TABLE-nya cuma jalan kalau fungsi `exec_sql` sudah ada** |

Sebagian tabel (`query_log`, `missing_topics`, `user_notes`) malah **cuma
didokumentasikan di komentar kode** — runtime cuma mengecek keberadaannya,
tidak pernah mencoba membuatnya. `masisir_procedures` dibuat lewat koneksi
Postgres langsung (`DATABASE_URL`), terpisah total dari Supabase client.

`migrations/004_full_schema_bootstrap.sql` menyatukan semua yang di poin
2 dan yang "cuma komentar" itu jadi satu file, diekstrak verbatim dari
`server.js` (bukan ditulis ulang manual).

## Urutan yang harus diikuti (project baru / fresh Supabase)

```
1. migrations/004_full_schema_bootstrap.sql
   → bootstrap exec_sql() + 24 tabel yang tidak ada di migration lain

2. supabase/migrations/*.sql — SEMUA file, urut nama file (sudah
   berurutan secara kronologis by design)

3. Kalau langkah 2 berhenti di 20260713_fix_vector_dims_voyage.sql
   dengan error "column ... does not exist":
     a. Jalankan ULANG migrations/004_full_schema_bootstrap.sql
        (aman — semua idempotent, cuma menambah kolom yang belum ada)
     b. Jalankan ulang 20260713_fix_vector_dims_voyage.sql
     c. Lanjutkan sisa file di supabase/migrations/

4. migrations/001_query_analytics.sql
5. migrations/002_kb_drafts.sql
6. migrations/003_chat_usage_atomic.sql
```

**Kenapa langkah 3 bisa terjadi:** `knowledge_base` adalah tabel yang
paling sering ditambah kolomnya, dan mayoritas kolom itu (`hidden`,
`embedding_model`, `keywords`, `maps_url`, `summary`, dll) **hanya**
pernah dibuat lewat auto-migration `server.js` yang butuh server sudah
sempat boot minimal sekali. Di project yang benar-benar baru (server
belum pernah nyala), migration 20260713 bisa gagal di langkah pertama.
File 004 sudah menyertakan kolom-kolom itu supaya masalah ini tertutup
tanpa perlu bolak-balik ke server — tapi urutannya tetap penting karena
`knowledge_base` sendiri baru dibuat di langkah 2.

## Verifikasi setelah selesai

Jalankan query di bagian akhir `004_full_schema_bootstrap.sql`
("BAGIAN 6 — Verifikasi") di SQL Editor. Hasil kosong (0 baris) berarti
semua tabel yang diketahui checklist ini sudah ada. Kalau ada baris yang
muncul, itu nama tabel yang masih hilang — cek folder mana yang belum
dijalankan.

## Kalau project SUDAH jalan lama (bukan fresh)

Migration 004 aman dijalankan kapan saja — semua statement pakai
`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / cek keberadaan tabel dulu.
Tidak akan menghapus data atau menimpa apa pun yang sudah ada. Paling
aman: jalankan 004 dulu satu kali, baru cek query verifikasi di atas
untuk tahu ada tidaknya migration lain yang perlu disusulkan.

## Environment variable yang perlu dicek

- `DATABASE_URL` — dulu tidak terdokumentasi di `.env.example`. Sekarang
  sudah ditambahkan (opsional): hanya dipakai untuk auto-seed data contoh
  di `masisir_procedures` saat boot pertama. Kalau migration 004 sudah
  dijalankan (tabelnya sudah ada), `DATABASE_URL` **tidak wajib** — fitur
  Panduan Prosedur tetap jalan lewat Supabase client biasa, cuma tidak
  ter-seed otomatis (isi manual lewat Admin Panel → Prosedur).
