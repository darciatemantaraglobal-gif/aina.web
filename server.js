import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import { createHash } from "crypto";
import {
  buildKnowledgeContext, buildPinnedContext, buildPersonalizationContext,
  buildMemoryContext, buildExchangeContext, buildWikiContext,
  buildDDGContext, buildPerplexityContext, buildDorarContext,
  buildSystemPrompt,
} from './engine/promptBuilder.js';
import { validateResponse, postProcessResponse, buildSourceBadges, formatAINAResponse } from './engine/responseFormatter.js';
import { optimizeHistory, estimateTokens, debugTokenReport } from './engine/historyOptimizer.js';
import { buildSourceResult, logSourceDecision } from './engine/sourceOrchestrator.js';
import { detectMasisirContext } from './engine/contextDetector.js';
import { expandQuery } from './engine/queryExpander.js';
import { createProductivityRouter }   from "./server/routes/productivity.js";
import { createProductivityAIRouter } from "./server/routes/productivityAI.js";
import { runDailyReminder, runWeeklyRecap, runExpiryAlerts } from "./server/services/reminderService.js";
import { generateEmbedding, buildArticleEmbedText, CURRENT_EMBED_MODEL } from "./engine/embedder.js";
import { detectPlacesQuery, buildPlacesContext } from "./engine/placesSearch.js";

const app = express();
// Trust the first proxy (Vercel / Replit / nginx) so rate-limit can read the real client IP
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3001;
const SERVER_START_MS = Date.now(); // epoch timestamp when this process started

/* ── Process-level crash guards ──────────────────────── */
// Prevent silent crashes — always log to console so Replit/ops can see it.
process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException:", err.message);
  console.error(err.stack);
  // Don't exit — let the process keep running; Express is still intact.
});
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error("[FATAL] unhandledRejection:", msg);
});

/* ── Supabase retry utility ───────────────────────────── */
// Wraps a Supabase query function and retries on transient network/timeout errors.
// Usage: const { data, error } = await withRetry(() => supabase.from("x").select("*"), { label: "fetchX" });
async function withRetry(fn, { maxAttempts = 3, delayMs = 400, label = "db" } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (result?.error) {
        const msg = result.error.message || "";
        const isTransient =
          msg.includes("timeout") || msg.includes("network") ||
          msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") ||
          result.error.code === "PGRST001";
        if (!isTransient || attempt === maxAttempts) return result;
        console.warn(`[withRetry:${label}] attempt ${attempt}/${maxAttempts}: ${msg}`);
        await new Promise((r) => setTimeout(r, delayMs * attempt));
        continue;
      }
      return result;
    } catch (e) {
      if (attempt === maxAttempts) throw e;
      console.warn(`[withRetry:${label}] attempt ${attempt}/${maxAttempts}: ${e.message}`);
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
}

// Polyfill DOMMatrix for Node.js — older pdfjs-dist versions (used by pdf-parse)
// may reference DOMMatrix. Stub it so it never throws in a serverless environment.
if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
      this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
      this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
      this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
      this.is2D = true; this.isIdentity = true;
    }
    static fromMatrix() { return new DOMMatrix(); }
    static fromFloat32Array() { return new DOMMatrix(); }
    static fromFloat64Array() { return new DOMMatrix(); }
    multiply() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    rotate() { return new DOMMatrix(); }
    inverse() { return new DOMMatrix(); }
    transformPoint(pt = {}) { return { x: pt.x || 0, y: pt.y || 0, z: 0, w: 1 }; }
    toFloat32Array() { return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]); }
    toFloat64Array() { return new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]); }
    toString() { return "matrix(1, 0, 0, 1, 0, 0)"; }
  };
}

/* ── Security headers ────────────────────────────────── */
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // managed by Vite for the SPA
}));

/* ── CORS — exact origin matching only ──────────────── */
const allowedOrigins = new Set([
  process.env.CLIENT_URL,
  // Vercel injects VERCEL_URL automatically (format: hostname only, no https://)
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  "http://localhost:5000",
  "http://localhost:3000",
  process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null,
].filter(Boolean));

// Allow *.replit.dev, *.replit.app, and *.vercel.app subdomains
function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin / non-browser requests
  if (allowedOrigins.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return (
      hostname.endsWith(".replit.dev") ||
      hostname.endsWith(".replit.app") ||
      hostname.endsWith(".vercel.app")
    );
  } catch {
    return false;
  }
}

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) callback(null, true);
    else callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

/* ── Body parser — default small limit ──────────────── */
// Library upload allows up to 50 MB files; base64 encoding adds ~33% overhead → need ≥70mb
// Avatar/image uploads are smaller — 20mb is sufficient
app.use((req, res, next) => {
  const xlRoutes   = ["/api/admin/library/upload-file"];
  const largeRoutes = ["/api/upload-avatar", "/api/threads/upload-image", "/api/admin/upload-image", "/api/whisper", "/api/chat", "/api/flashcards/generate"];
  const limit = xlRoutes.includes(req.path) ? "70mb" : largeRoutes.includes(req.path) ? "20mb" : "64kb";
  express.json({ limit })(req, res, next);
});

/* ── Rate limiters ───────────────────────────────────── */
const rl = (windowMs, max, msg) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: msg },
});

// Global: 200 req/min per IP (baseline DoS protection for all routes)
app.use(rl(60_000, 200, "Terlalu banyak permintaan, coba lagi sebentar."));

// Strict: auth-sensitive & expensive endpoints
const strictLimiter   = rl(60_000,  10, "Terlalu banyak percobaan, tunggu 1 menit.");
// Chat limiter uses JWT user ID as the rate-limit key when available,
// so dormitory shared-IP networks don't cause false positives for other users.
const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak pesan, tunggu sebentar." },
  // Suppress IPv6 validation: the /api/chat route rejects unauthenticated
  // requests before the limiter key is ever used as an IP address.
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) {
      try {
        const payload = JSON.parse(Buffer.from(auth.split(".")[1], "base64url").toString());
        if (payload?.sub) return `uid:${payload.sub}`;
      } catch { /* fall through to IP */ }
    }
    return req.ip ?? "unknown";
  },
});
const uploadLimiter   = rl(60_000,   5, "Terlalu banyak upload, tunggu sebentar.");
const feedbackLimiter = rl(60_000,   5, "Terlalu banyak feedback, tunggu sebentar.");
const writeLimiter    = rl(60_000,  30, "Terlalu banyak operasi tulis, tunggu sebentar.");

/* ── Security event ring buffer ──────────────────────── */
// Stores the last 500 suspicious events in memory for master-admin review.
const SECURITY_LOG_MAX = 500;
const _securityLog = [];

function addSecurityEvent(event) {
  _securityLog.unshift(event); // newest first
  if (_securityLog.length > SECURITY_LOG_MAX) _securityLog.pop();
}

/* ── Suspicious request logger ───────────────────────── */
// Captures 401 (auth failure), 403 (forbidden), 429 (rate-limited) after response is sent.
app.use((req, res, next) => {
  res.on("finish", () => {
    const { statusCode } = res;
    if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
      const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
      const ua = (req.headers["user-agent"] || "").slice(0, 200);
      const label = statusCode === 429 ? "RATE-LIMITED" : statusCode === 403 ? "FORBIDDEN" : "AUTH-FAIL";
      console.warn(`[SECURITY:${label}] ${req.method} ${req.path} — IP:${ip}`);
      addSecurityEvent({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        type: label,
        status: statusCode,
        method: req.method,
        path: req.path,
        ip,
        ua,
      });
    }
  });
  next();
});

/* ── Error sanitizer ─────────────────────────────────── */
// Never expose raw DB/stack info to the client.
// Technical error messages from Supabase/Postgres are replaced with
// a generic Indonesian message; safe user-facing strings pass through.
const SAFE_PREFIXES = [
  "Terlalu banyak", "Gagal", "Tidak ada", "Tidak ditemukan",
  "Format", "Ukuran", "Hanya", "Pesan", "Sesi",
];
function sanitizeErr(err) {
  const raw = (typeof err === "string" ? err : err?.message) || "";
  // Pass through intentional user-facing Indonesian messages
  if (SAFE_PREFIXES.some(p => raw.startsWith(p))) return raw;
  // Block anything that looks like a DB/internal error
  if (
    raw.includes("relation") || raw.includes("column") ||
    raw.includes("syntax") || raw.includes("violates") ||
    raw.includes("duplicate key") || raw.includes("null value") ||
    raw.includes("permission denied") || raw.includes("invalid input") ||
    raw.includes("supabase") || raw.includes("postgres") ||
    raw.includes("PGRST") || raw.includes("42") || raw.length > 120
  ) return "Terjadi kesalahan, silakan coba lagi.";
  return raw || "Terjadi kesalahan, silakan coba lagi.";
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _adminClient = null;
function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  if (!_adminClient) {
    _adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _adminClient;
}

/* ── Storage Init ────────────────────────────────────── */
async function initStorage() {
  const supabase = getAdminClient();
  if (!supabase) { console.warn("Storage init skipped: no admin client"); return; }
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const names = buckets?.map(b => b.name) || [];

    if (!names.includes("avatars")) {
      await supabase.storage.createBucket("avatars", { public: true, fileSizeLimit: 2097152 });
      console.log("Storage bucket 'avatars' created");
    }
    if (!names.includes("temp-uploads")) {
      await supabase.storage.createBucket("temp-uploads", { public: false, fileSizeLimit: 20971520 }); // 20 MB cap
      console.log("Storage bucket 'temp-uploads' created");
    }
    if (!names.includes("announcements")) {
      await supabase.storage.createBucket("announcements", { public: true, fileSizeLimit: 5242880 }); // 5 MB cap
      console.log("Storage bucket 'announcements' created");
    }
    if (!names.includes("thread-images")) {
      await supabase.storage.createBucket("thread-images", { public: true, fileSizeLimit: 5242880 }); // 5 MB cap
      console.log("Storage bucket 'thread-images' created");
    }
    if (!names.includes("library-files")) {
      await supabase.storage.createBucket("library-files", { public: true, fileSizeLimit: 52428800 }); // 50 MB cap
      console.log("Storage bucket 'library-files' created");
    }
  } catch (e) {
    console.warn("Storage init warning:", e.message);
  }
}
initStorage();

/* ── Procedures Init (seed default + create table) ───── */
const DEFAULT_PROCEDURES = [
  { id: "iqama", title: "Perpanjang Iqama", subtitle: "Izin tinggal tahunan", icon_name: "CreditCard", color: "text-violet-400", display_order: 0, steps: [{ label: "Siapkan paspor asli + fotokopi halaman foto & visa", detail: "Minimal 6 bulan sebelum paspor kadaluarsa" }, { label: "Siapkan Shahada Qaid (surat keterangan mahasiswa aktif) dari Al-Azhar", detail: "Bisa diambil di bagian qaid dengan membawa kartu mahasiswa" }, { label: "Foto terbaru ukuran 4×6 berlatar putih (2 lembar)" }, { label: "Pergi ke kantor Imigrasi (Jawazat) di area domisili" }, { label: "Ambil nomor antrean dan isi formulir perpanjangan iqama" }, { label: "Serahkan berkas ke loket, bayar biaya perpanjangan" }, { label: "Tunggu proses 1–3 hari kerja, ambil iqama baru" }] },
  { id: "pendaftaran-azhar", title: "Pendaftaran Ulang Al-Azhar", subtitle: "Setiap awal semester", icon_name: "GraduationCap", color: "text-amber-400", display_order: 1, steps: [{ label: "Cek jadwal pendaftaran ulang di portal Al-Azhar atau pengumuman resmi" }, { label: "Lunasi biaya kuliah (rasm) semester berjalan", detail: "Bisa via bank atau loket kampus" }, { label: "Bawa bukti pembayaran, kartu mahasiswa, dan pas foto ke bagian Qaid" }, { label: "Serahkan berkas dan minta Shahada Qaid (surat aktif mahasiswa)" }, { label: "Simpan Shahada Qaid — diperlukan untuk urusan iqama, KBRI, dll" }, { label: "Update data di SIMAK (Sistem Informasi Mahasiswa) jika tersedia" }] },
  { id: "visa-belajar", title: "Perpanjang Visa Belajar", subtitle: "Visa pelajar tahunan", icon_name: "Stamp", color: "text-blue-400", display_order: 2, steps: [{ label: "Siapkan paspor asli + fotokopi (semua halaman)" }, { label: "Surat penerimaan/aktif dari Al-Azhar (Shahada Qaid terbaru)" }, { label: "Foto terbaru ukuran 4×6 berlatar putih (4 lembar)" }, { label: "Iqama yang masih berlaku atau sedang dalam proses perpanjangan" }, { label: "Datang ke kantor Imigrasi Mesir (Mohadreen el-Kharigiyeen)" }, { label: "Isi formulir permohonan perpanjangan visa belajar" }, { label: "Bayar biaya visa, simpan kwitansi", detail: "Nominal bisa berubah, cek ke senior atau KBRI" }, { label: "Tunggu proses dan ambil paspor dengan visa baru" }] },
  { id: "paspor-kbri", title: "Perpanjang Paspor di KBRI", subtitle: "Paspor RI di luar negeri", icon_name: "FileText", color: "text-rose-400", display_order: 3, steps: [{ label: "Cek jadwal layanan paspor KBRI Kairo (walk-in atau booking)" }, { label: "Siapkan paspor lama asli + fotokopi halaman foto" }, { label: "Siapkan fotokopi KTP dan Kartu Keluarga terbaru" }, { label: "Pas foto terbaru ukuran 4×6 berlatar putih (4 lembar)" }, { label: "Bukti mahasiswa aktif (Shahada Qaid dari Al-Azhar)" }, { label: "Datang ke KBRI sesuai jadwal, ambil nomor antrean paspor" }, { label: "Serahkan berkas dan bayar biaya paspor (sesuai kebijakan KBRI)" }, { label: "Tunggu proses (biasanya 3–7 hari kerja), ambil paspor baru" }] },
  { id: "legalisir-kbri", title: "Legalisir Dokumen di KBRI", subtitle: "Ijazah, transkrip, dll", icon_name: "Stamp", color: "text-green-400", display_order: 4, steps: [{ label: "Hubungi atau kunjungi KBRI Kairo untuk cek jadwal layanan legalisir" }, { label: "Siapkan dokumen asli yang ingin dilegalisir (ijazah, transkrip, akta, dll)" }, { label: "Siapkan fotokopi dokumen (biasanya 2 rangkap)" }, { label: "Siapkan paspor asli + fotokopi sebagai identitas" }, { label: "Datang ke KBRI sesuai jadwal dan serahkan berkas ke loket konsuler" }, { label: "Bayar biaya legalisir dan ambil tanda terima" }, { label: "Ambil dokumen yang sudah dilegalisir sesuai waktu yang ditentukan" }] },
  { id: "buka-rekening", title: "Buka Rekening Bank", subtitle: "Bank lokal Mesir", icon_name: "Building2", color: "text-cyan-400", display_order: 5, steps: [{ label: "Pilih bank yang banyak digunakan Masisir (Banque Misr, CIB, Bank of Alexandria)" }, { label: "Siapkan paspor asli + fotokopi" }, { label: "Siapkan iqama yang masih berlaku + fotokopi" }, { label: "Siapkan pas foto terbaru (1–2 lembar)" }, { label: "Datang ke cabang bank, minta formulir pembukaan rekening tabungan" }, { label: "Isi formulir, serahkan berkas ke teller, setorkan saldo awal minimum", detail: "Cek minimal setoran ke masing-masing bank" }] },
];

async function initProcedures() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.warn("Procedures init skipped: no DATABASE_URL"); return; }
  let client;
  try {
    const { Client } = await import("pg");
    client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    // Create table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS masisir_procedures (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT,
        icon_name TEXT NOT NULL DEFAULT 'FileText',
        color TEXT NOT NULL DEFAULT 'text-violet-400',
        steps JSONB NOT NULL DEFAULT '[]',
        display_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    // Check if empty and seed
    const { rows } = await client.query("SELECT COUNT(*) as cnt FROM masisir_procedures");
    if (parseInt(rows[0].cnt) === 0) {
      for (const p of DEFAULT_PROCEDURES) {
        await client.query(
          `INSERT INTO masisir_procedures (id,title,subtitle,icon_name,color,steps,display_order,is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT (id) DO NOTHING`,
          [p.id, p.title, p.subtitle||null, p.icon_name, p.color, JSON.stringify(p.steps), p.display_order]
        );
      }
      console.log(`Procedures: table created & seeded ${DEFAULT_PROCEDURES.length} defaults`);
    } else {
      console.log(`Procedures: table ready`);
    }
  } catch (e) {
    console.warn("Procedures init warning:", e.message);
  } finally {
    if (client) await client.end().catch(() => {});
  }
}
initProcedures();

/* ── Check keywords column on startup and warn if missing ── */
async function initKBKeywordsCol() {
  const supabase = getAdminClient();
  if (!supabase) return;
  const { error } = await supabase.from("knowledge_base").select("keywords").limit(1);
  if (error?.message?.includes("does not exist") || error?.code === "42703") {
    console.warn("[KB] ⚠ 'keywords' column missing from knowledge_base.");
    console.warn("[KB]   Run this in Supabase SQL Editor to enable AI keyword search:");
    console.warn("[KB]   ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS keywords TEXT;");
    console.warn("[KB]   Then click 'Generate Keywords' in Admin Panel → Knowledge Base.");
  } else {
    console.log("[KB] ✓ keywords column ready");
  }
  // Check optional enrichment columns — auto-add via pg if missing
  const checks = [
    { col: "summary",         sql: "ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS summary TEXT;" },
    { col: "important_notes", sql: "ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS important_notes TEXT;" },
    { col: "last_updated",    sql: "ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ;" },
    { col: "content_ar",      sql: "ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS content_ar TEXT;" },
  ];
  const dbUrl = process.env.DATABASE_URL;
  for (const { col, sql } of checks) {
    const { error: ce } = await supabase.from("knowledge_base").select(col).limit(1);
    if (ce?.message?.includes("does not exist") || ce?.code === "42703") {
      console.warn(`[KB] ⚠ '${col}' column missing — attempting auto-add...`);
      if (dbUrl) {
        try {
          const { Client } = await import("pg");
          const pgClient = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
          await pgClient.connect();
          await pgClient.query(sql);
          await pgClient.end();
          console.log(`[KB] ✓ '${col}' column added automatically`);
        } catch (pgErr) {
          console.warn(`[KB] ⚠ Auto-add '${col}' failed: ${pgErr.message}`);
          console.warn(`[KB]   Run manually in Supabase SQL Editor:\n  ${sql}`);
        }
      } else {
        console.warn(`[KB]   Run manually in Supabase SQL Editor:\n  ${sql}`);
      }
    } else {
      console.log(`[KB] ✓ ${col} column ready`);
    }
  }
}
initKBKeywordsCol();

/* ── Self-Improvement: query_log + missing_topics (Supabase) ────────────────
 * All logging now uses Supabase so it works in both dev (Replit) and prod
 * (Railway). Tables must exist in Supabase — run the SQL below once:
 *
 *  CREATE TABLE IF NOT EXISTS public.query_log (
 *    id            BIGSERIAL PRIMARY KEY,
 *    query_text    TEXT NOT NULL,
 *    intent_type   TEXT,
 *    source_used   TEXT,
 *    confidence    TEXT,
 *    user_id       TEXT,
 *    has_kb_result BOOLEAN DEFAULT false,
 *    is_transport  BOOLEAN DEFAULT false,
 *    rating        SMALLINT,
 *    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
 *  );
 *  CREATE TABLE IF NOT EXISTS public.missing_topics (
 *    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *    query       TEXT NOT NULL,
 *    intent_type TEXT,
 *    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
 *  );
 * ─────────────────────────────────────────────────────────────────────────── */

async function ensureQueryLogTable() {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from("query_log").select("id").limit(1);
  if (error && (error.code === "42P01" || error.message?.includes("does not exist"))) {
    console.warn("[QueryLog] ⚠ table missing in Supabase — run the SQL in the comment above.");
    return false;
  }
  console.log("[QueryLog] ✓ table ready");
  return true;
}
ensureQueryLogTable();

/**
 * Fire-and-forget: log a user query to query_log (Supabase).
 * Returns the new row id (or null on failure).
 */
async function logQuery({ queryText, intentType, sourceUsed, confidence, userId, hasKbResult, isTransport, rating }) {
  const supabase = getAdminClient();
  if (!supabase || !queryText?.trim()) return null;
  try {
    const { data, error } = await withRetry(
      () => supabase
        .from("query_log")
        .insert({
          query_text:    queryText.trim().slice(0, 500),
          intent_type:   intentType  ?? null,
          source_used:   sourceUsed  ?? null,
          confidence:    confidence  ?? null,
          user_id:       userId      ?? null,
          has_kb_result: hasKbResult ?? false,
          is_transport:  isTransport ?? false,
          rating:        rating      ?? null,
        })
        .select("id")
        .single(),
      { label: "query_log.insert" }
    );
    if (error) { console.warn("[QueryLog] insert failed (non-critical):", error.message); return null; }
    return data?.id ?? null;
  } catch (e) {
    console.warn("[QueryLog] insert failed (non-critical):", e.message);
    return null;
  }
}

async function ensureMissingTopicsTable() {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from("missing_topics").select("id").limit(1);
  if (error && (error.code === "42P01" || error.message?.includes("does not exist"))) {
    console.warn("[MissingTopics] ⚠ table missing in Supabase — run the SQL in the comment above.");
    return false;
  }
  console.log("[MissingTopics] ✓ table ready");
  return true;
}
ensureMissingTopicsTable();

/**
 * Fire-and-forget: log a query that returned no KB results (Supabase).
 */
function logMissingTopic(query, intentType) {
  const supabase = getAdminClient();
  if (!supabase || !query?.trim()) return;
  withRetry(
    () => supabase
      .from("missing_topics")
      .insert({ query: query.trim().slice(0, 500), intent_type: intentType ?? null }),
    { label: "missing_topics.insert" }
  ).then(({ error } = {}) => {
    if (error) console.warn("[MissingTopics] insert failed:", error.message);
  }).catch(() => {});
}

/* ── User Notes (Supabase) ────────────────────────────────────────────────────
 * Table must exist in Supabase. If missing, run once in Supabase SQL Editor:
 *
 *  CREATE TABLE IF NOT EXISTS public.user_notes (
 *    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *    user_id     UUID NOT NULL,
 *    title       TEXT NOT NULL DEFAULT 'Catatan Baru',
 *    format      TEXT NOT NULL DEFAULT 'note'
 *                CHECK (format IN ('todo', 'checklist', 'note')),
 *    content     TEXT,
 *    items       JSONB DEFAULT '[]'::jsonb,
 *    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
 *    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
 *  );
 *  CREATE INDEX IF NOT EXISTS idx_user_notes_user
 *    ON public.user_notes(user_id, updated_at DESC);
 * ─────────────────────────────────────────────────────────────────────────── */
async function initUserNotes() {
  const supabase = getAdminClient();
  if (!supabase) return;
  const { error } = await supabase.from("user_notes").select("id").limit(1);
  if (error && (error.code === "42P01" || error.message?.includes("does not exist") || error.code === "PGRST205")) {
    console.warn("[UserNotes] ⚠ table missing in Supabase — run the SQL in the comment above initUserNotes() in server.js.");
    return;
  }
  console.log("User notes: table ready");
}
initUserNotes();

// A1: Ensure user_memories table exists and columns are ready
async function initUserMemories() {
  const supabase = getAdminClient();
  if (!supabase) return;
  const { error } = await supabase.from("user_memories").select("id").limit(1);
  if (error && (error.code === "42P01" || error.message?.includes("does not exist") || error.code === "PGRST205")) {
    console.warn("[UserMemories] ⚠ table missing in Supabase — cross-session memory disabled until table is created. Run the migration in server.js.");
    return;
  }
  if (error) {
    console.warn("[UserMemories] ⚠ table check warning:", error.message);
    return;
  }
  console.log("[UserMemories] ✓ table ready — cross-session memory active");
}
initUserMemories();

console.log(`Admin client: ${SUPABASE_URL ? "✓ configured" : "✗ missing SUPABASE_URL"}`);
console.log(`Service role: ${SERVICE_ROLE_KEY ? "✓ configured" : "✗ missing SERVICE_ROLE_KEY"}`);
console.log(`OpenRouter: ${process.env.OPENROUTER_API_KEY ? "✓ configured" : "✗ missing OPENROUTER_API_KEY"}`);
console.log(`WebSearch: ${process.env.PERPLEXITY_API_KEY ? "✓ via Perplexity (real-time web)" : process.env.OPENROUTER_API_KEY ? "✓ via Gemini 2.5 Flash (OpenRouter, training data only)" : "✗ disabled — no API key set"}`);
console.log(`OpenAI: ${process.env.OPENAI_API_KEY ? "✓ configured — semantic (vector) search enabled" : "✗ not configured — keyword search only"}`);
console.log(`Email (Resend): ${process.env.RESEND_API_KEY ? "✓ configured" : "✗ not configured — email notifications disabled"}`);
console.log(`Google Maps: ${process.env.GOOGLE_MAPS_API_KEY ? "✓ configured — real-time Places search enabled" : "✗ not configured — Places search disabled"}`);

/* ── Email via Resend ─────────────────────────────────── */
async function getUserEmail(userId) {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data } = await supabase.from("profiles").select("email, full_name").eq("user_id", userId).single();
  return data ?? null;
}

async function sendEmail({ to, name, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false; // email not configured — caller should skip logging
  const from = process.env.EMAIL_FROM || "AINA <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: `${name} <${to}>`, subject, html }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("Resend error:", err);
      return false;
    }
    console.log(`Email sent to ${to}: ${subject}`);
    return true;
  } catch (e) {
    console.warn("Email send failed:", e.message);
    return false;
  }
}

function emailTemplate({ title, body, ctaText, ctaUrl }) {
  return `<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f13;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f13;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a24;border-radius:16px;border:1px solid #2a2a3a;overflow:hidden;max-width:100%">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:28px 32px;text-align:center">
            <h1 style="margin:0;color:#fff;font-size:24px;font-weight:800;letter-spacing:-0.5px">AINA</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px">Asisten Pintar Masisir</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <h2 style="margin:0 0 12px;color:#f1f1f5;font-size:18px;font-weight:700">${title}</h2>
            <div style="color:#a0a0b8;font-size:14px;line-height:1.7">${body}</div>
            ${ctaText && ctaUrl ? `
            <div style="margin-top:28px;text-align:center">
              <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;font-size:14px">${ctaText}</a>
            </div>` : ""}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #2a2a3a;text-align:center">
            <p style="margin:0;color:#5a5a72;font-size:12px">Email ini dikirim otomatis oleh AINA. Jangan balas email ini.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const MASTER_ADMIN_IDS = new Set(
  (process.env.MASTER_ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean)
);
console.log(`[MASTER_ADMIN_IDS] loaded: ${[...MASTER_ADMIN_IDS].join(",") || "(empty)"} — raw env: "${process.env.MASTER_ADMIN_IDS || ""}"`);


// Bounded admin token cache — max 500 entries, 5-min TTL
const _adminCache = new Map();
const ADMIN_CACHE_MAX = 500;
async function verifyAdminUser(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");

  const cached = _adminCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const isAdmin = roles?.some(r => r.role === "admin");
  if (!isAdmin) return null;

  // Evict oldest entry if at capacity
  if (_adminCache.size >= ADMIN_CACHE_MAX) {
    _adminCache.delete(_adminCache.keys().next().value);
  }
  _adminCache.set(token, { user, expiresAt: Date.now() + 5 * 60 * 1000 });
  return user;
}

function isMasterAdminId(userId) {
  // If MASTER_ADMIN_IDS is not configured, any admin is a master admin
  if (MASTER_ADMIN_IDS.size === 0) return true;
  return MASTER_ADMIN_IDS.has(userId);
}

async function verifyMasterAdmin(authHeader) {
  const user = await verifyAdminUser(authHeader);
  if (!user) return null;
  if (!isMasterAdminId(user.id)) return null;
  return user;
}

/* ── OpenRouter AI call with primary→fallback ──────── */
const OR_PRIMARY  = "google/gemini-2.0-flash-001";
const OR_FALLBACK = "google/gemini-2.0-flash-lite-001";

async function callOpenRouter(apiKey, { messages, temperature = 0.0, max_tokens = 200, timeoutMs = 20_000, label = "AI" }) {
  const tryModel = async (model) => {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ainalabs.pro",
        "X-Title": `AINA ${label}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error(`[${label}] ${model} → ${resp.status}: ${errBody.slice(0, 300)}`);
      return null;
    }
    return resp.json();
  };

  let data = await tryModel(OR_PRIMARY);
  if (!data) {
    console.warn(`[${label}] Primary model failed, trying fallback ${OR_FALLBACK}`);
    data = await tryModel(OR_FALLBACK);
  }
  if (!data) throw new Error("Semua model AI tidak merespons");
  return data;
}

/* ── Category resolver: exact → case-insensitive → keyword fallback ── */
const VALID_CATEGORIES = ["Administrasi", "Akademik", "Kehidupan Mesir", "Transport", "Tempat Tinggal", "Kuliner", "Bahasa"];
const VALID_TYPES      = ["narrative", "step_by_step"];

const _CAT_KEYWORDS = [
  { cat: "Administrasi",   kw: ["administ", "visa", "iqomah", "iqama", "paspor", "dokumen", "birokrasi", "imigrasi", "kbri", "ppmi", "legalis", "apostil"] },
  { cat: "Akademik",       kw: ["akademik", "akademis", "kuliah", "kampus", "azhar", "ujian", "imtihan", "beasiswa", "darjah", "syahadah", "nilai", "mutasi", "semester"] },
  { cat: "Kehidupan Mesir",kw: ["kehidupan", "sehari-hari", "hidup", "budaya", "keamanan", "adaptasi", "asuransi", "kesehatan", "simcard", "banking", "perbank", "cuaca", "musim"] },
  { cat: "Transport",      kw: ["transport", "metro", "taksi", "taxi", "uber", "careem", "bus", "microbus", "kereta", "rute", "perjalanan", "kendaraan"] },
  { cat: "Tempat Tinggal", kw: ["tinggal", "flat", "apartemen", "sewa", "kontrakan", "furnitur", "shahibul", "beit", "rumah", "lokasi", "nasr", "hay asyir"] },
  { cat: "Kuliner",        kw: ["kuliner", "makanan", "makan", "restoran", "warung", "masak", "resep", "menu", "kantin", "bahan makanan"] },
  { cat: "Bahasa",         kw: ["bahasa arab", "bahasa", "arabic", "fusha", "amiyah", "nahwu", "sharaf", "kosakata", "vocab", "dialek", "percakapan", "grammar", "mufrodat"] },
];

function resolveCategoryFromAI(rawCategory) {
  if (!rawCategory || typeof rawCategory !== "string") return null;
  const s = rawCategory.trim();
  // 1. Exact match
  if (VALID_CATEGORIES.includes(s)) return s;
  // 2. Case-insensitive
  const lower = s.toLowerCase();
  const ci = VALID_CATEGORIES.find(c => c.toLowerCase() === lower);
  if (ci) return ci;
  // 3. Keyword scan
  for (const { cat, kw } of _CAT_KEYWORDS) {
    if (kw.some(k => lower.includes(k))) return cat;
  }
  return null;
}

function buildAutoCatPrompt(title, content) {
  return `Kamu adalah sistem kategorisasi otomatis untuk Knowledge Base Masisir (mahasiswa Indonesia di Mesir).

KATEGORI YANG TERSEDIA (gunakan PERSIS salah satu string ini):
- "Administrasi"   → dokumen, visa, iqomah, paspor, KBRI, PPMI, imigrasi, legalisasi, apostille, KTP
- "Akademik"       → perkuliahan, Al-Azhar, ujian (imtihan), beasiswa, darjah, syahadah, mutasi, semester
- "Kehidupan Mesir"→ tips hidup sehari-hari, adaptasi, budaya, keamanan, kesehatan, SIM card, perbankan, cuaca
- "Transport"      → metro Kairo, taksi, Uber, Careem, bus, microbus, kereta, rute perjalanan
- "Tempat Tinggal" → sewa flat/apartemen, shahibul beit, Hay Asyir, Nasr City, kontrak, furnitur, listrik
- "Kuliner"        → restoran halal, warung Indonesia, masakan Mesir, harga makanan, resep, bahan makanan
- "Bahasa"         → belajar bahasa Arab/amiyah, fusha, nahwu, sharaf, kosakata, mufrodat, dialek Mesir, grammar

TIPE ARTIKEL:
- "step_by_step" → ada langkah bernomor/berurutan (cara melakukan sesuatu)
- "narrative"    → penjelasan informatif, tips umum, tidak ada urutan langkah

Judul: ${(title || "").slice(0, 300)}
Konten: ${(content || "").slice(0, 2500)}

Jawab HANYA JSON tanpa teks lain:
{"category":"<salah satu dari 7 string di atas PERSIS>","article_type":"<narrative atau step_by_step>"}`;
}

function parseAutoCatResponse(raw) {
  if (!raw) return null;
  // strip markdown code blocks if any
  const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

/* ── Article type column detection (cached) ──────────── */
let _hasArticleTypeCol  = null; // null=unknown, true/false=detected
let _hasKeywordsCol     = null;
let _hasMapsUrlCol      = null;
let _hasSummaryCol      = null;
let _hasImportantNotes  = null;

async function detectArticleTypeCol(supabase) {
  if (_hasArticleTypeCol !== null) return _hasArticleTypeCol;
  const { error } = await supabase
    .from("knowledge_base")
    .select("article_type")
    .limit(1);
  _hasArticleTypeCol = !error;
  if (!_hasArticleTypeCol) {
    console.warn("[schema] 'article_type' column not found — run migration in Supabase dashboard");
  }
  return _hasArticleTypeCol;
}

async function detectKeywordsCol(supabase) {
  if (_hasKeywordsCol !== null) return _hasKeywordsCol;
  const { error } = await supabase
    .from("knowledge_base")
    .select("keywords")
    .limit(1);
  _hasKeywordsCol = !error;
  return _hasKeywordsCol;
}

async function detectMapsUrlCol(supabase) {
  if (_hasMapsUrlCol !== null) return _hasMapsUrlCol;
  const { error } = await supabase
    .from("knowledge_base")
    .select("maps_url")
    .limit(1);
  _hasMapsUrlCol = !error;
  if (!_hasMapsUrlCol) {
    console.warn("[schema] 'maps_url' column not found — run: ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS maps_url TEXT;");
  }
  return _hasMapsUrlCol;
}

async function detectSummaryCol(supabase) {
  if (_hasSummaryCol !== null) return _hasSummaryCol;
  const { error } = await supabase.from("knowledge_base").select("summary").limit(1);
  _hasSummaryCol = !error;
  return _hasSummaryCol;
}

async function detectImportantNotesCol(supabase) {
  if (_hasImportantNotes !== null) return _hasImportantNotes;
  const { error } = await supabase.from("knowledge_base").select("important_notes").limit(1);
  _hasImportantNotes = !error;
  return _hasImportantNotes;
}

/* ── AI keyword generation for KB articles ───────────── */
async function generateArticleKeywords(title, content, category) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  try {
    const snippet = content?.slice(0, 800) || "";
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://ainalabs.pro",
        "X-Title": "AINA KB Keywords",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-lite-001",
        messages: [{
          role: "user",
          content: `Kamu adalah asisten yang membantu indexing artikel knowledge base untuk mahasiswa Indonesia di Mesir (Masisir).

Artikel:
- Judul: ${title}
- Kategori: ${category}
- Isi (cuplikan): ${snippet}

Tugas: Buat daftar kata kunci dan frasa pencarian yang mungkin diketik pengguna saat mencari artikel ini. Sertakan:
1. Kata kunci utama dari judul/isi
2. Variasi informal (bahasa gaul Masisir: "gimana", "cara", "mau ke", dll)
3. Sinonim dan variasi ejaan
4. Pertanyaan pendek yang relevan
5. Nama tempat/organisasi yang disebutkan

Format output: hanya daftar kata/frasa dipisahkan koma, tanpa numbering, tanpa penjelasan, tanpa tanda kutip. Maksimal 25 frasa.`,
        }],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    // Clean up: remove any numbering, bullets, newlines — normalize to comma-separated
    return raw
      .replace(/\n+/g, ", ")
      .replace(/\d+\.\s*/g, "")
      .replace(/[-•]\s*/g, "")
      .replace(/,\s*,/g, ",")
      .replace(/^,|,$/g, "")
      .trim()
      .slice(0, 1000); // hard cap to avoid huge stored values
  } catch {
    return null;
  }
}

/* Trigger keyword generation for one article (fire-and-forget) */
async function triggerKeywordGen(articleId) {
  const supabase = getAdminClient();
  if (!supabase) return;
  try {
    const { data: art } = await supabase
      .from("knowledge_base")
      .select("title, content, category")
      .eq("id", articleId)
      .single();
    if (!art) return;
    const keywords = await generateArticleKeywords(art.title, art.content, art.category);
    if (keywords) {
      await supabase.from("knowledge_base").update({ keywords }).eq("id", articleId);
    }
  } catch { /* silent — keyword gen is best-effort */ }
}

/* ── OpenAI Content Moderation ──────────────────────────────────────────────
   Uses the free OpenAI Moderation API to screen user messages before processing.
   Fail-safe: if moderation API is down, always returns { flagged: false }.        */
async function checkModeration(text) {
  if (!process.env.OPENAI_API_KEY) return { flagged: false };
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      signal: AbortSignal.timeout(3000),
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: text }),
    });
    if (!res.ok) return { flagged: false };
    const data = await res.json();
    const result = data.results?.[0];
    if (result?.flagged) {
      const categories = Object.entries(result.categories || {})
        .filter(([, v]) => v).map(([k]) => k).join(", ");
      console.warn(`[Moderation] ⚠️  flagged categories: ${categories || "unknown"}`);
    }
    return { flagged: result?.flagged ?? false };
  } catch {
    return { flagged: false }; // never block on moderation API failure
  }
}

/* ── Article Summary Generator (gpt-4o-mini) ────────────────────────────────
   Generates a 2-3 sentence Indonesian summary for KB articles using gpt-4o-mini.
   Much cheaper than GPT-4o ($0.15/1M tokens) — $5 covers ~30k article summaries. */
async function generateArticleSummary(title, content, category) {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const snippet = content?.slice(0, 2500) || "";
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: `Buat ringkasan 2-3 kalimat dalam Bahasa Indonesia untuk artikel knowledge base berikut. Ringkasan harus padat, informatif, dan langsung ke poin — berguna untuk mahasiswa Indonesia di Mesir (Masisir).

Judul: ${title}
Kategori: ${category}
Isi: ${snippet}

Tulis hanya ringkasannya, tanpa kalimat pembuka seperti "Artikel ini membahas..." atau "Ringkasan:".`,
        }],
        max_tokens: 250,
        temperature: 0.3,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/* ── Important Notes Generator (gpt-4o-mini) ─────────────────────────────────
   Generates critical warnings/tips for KB articles. Free-format 1-3 bullet points.
   Examples: deadlines, requirements, common mistakes, frequently changing info. */
async function generateImportantNotes(title, content, category) {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const snippet = content?.slice(0, 2500) || "";
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: `Kamu adalah asisten untuk Knowledge Base AINA (mahasiswa Indonesia di Mesir/Masisir).

Artikel:
- Judul: ${title}
- Kategori: ${category}
- Isi: ${snippet}

Tugas: Identifikasi 1-3 catatan penting/peringatan kritis yang WAJIB diketahui mahasiswa terkait topik ini. Fokus pada:
- Deadline atau batas waktu kritis
- Persyaratan yang sering terlewat
- Kesalahan umum yang sering dilakukan
- Informasi yang sering berubah dan perlu dicek ulang
- Risiko atau konsekuensi jika salah langkah

Format: Tulis poin-poin singkat (maks 2 kalimat per poin), pisahkan dengan baris baru. TIDAK perlu heading, nomor, atau bullet. Jika tidak ada catatan kritis yang signifikan, tulis hanya: null`,
        }],
        max_tokens: 200,
        temperature: 0.2,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    if (!raw || raw === "null" || raw.length < 15) return null;
    return raw.slice(0, 600);
  } catch { return null; }
}

/* Trigger important_notes generation for one article (fire-and-forget) */
async function triggerImportantNotesGen(articleId) {
  if (!process.env.OPENAI_API_KEY) return;
  const supabase = getAdminClient();
  if (!supabase) return;
  try {
    const { data: art } = await supabase
      .from("knowledge_base")
      .select("title, content, category, important_notes")
      .eq("id", articleId)
      .single();
    if (!art || art.important_notes) return; // skip if already has notes
    const notes = await generateImportantNotes(art.title, art.content, art.category);
    if (notes) {
      await supabase.from("knowledge_base").update({ important_notes: notes }).eq("id", articleId);
      console.log(`[Notes] ✓ generated important_notes for article ${articleId}`);
    }
  } catch { /* silent — notes gen is best-effort */ }
}

/* Trigger summary generation for one article (fire-and-forget) */
async function triggerSummaryGen(articleId) {
  if (!process.env.OPENAI_API_KEY) return;
  const supabase = getAdminClient();
  if (!supabase) return;
  try {
    const { data: art } = await supabase
      .from("knowledge_base")
      .select("title, content, category, summary")
      .eq("id", articleId)
      .single();
    if (!art || art.summary) return; // skip if already has summary
    const summary = await generateArticleSummary(art.title, art.content, art.category);
    if (summary) {
      await supabase.from("knowledge_base").update({ summary }).eq("id", articleId);
      console.log(`[Summary] ✓ generated summary for article ${articleId}`);
    }
  } catch { /* silent — summary gen is best-effort */ }
}

/* ── OpenAI GPT-4o Vision — Arabic document analysis ───────────────────────
   Analyses an image using GPT-4o Vision, specialised for Arabic documents.
   Returns a string with extracted text and explanation, or null on failure.
   Used as pre-analysis context in the main chat pipeline.                    */
async function analyzeImageWithVision(dataUrl, userQuestion) {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `Kamu adalah asisten yang membantu mahasiswa Indonesia di Mesir (Masisir) memahami dokumen. Analisis gambar ini:

1. Jika gambar berisi teks Arab: transkripsi teks tersebut, lalu terjemahkan ke Bahasa Indonesia.
2. Jika ini dokumen resmi (surat, formulir, KTP, visa, ijazah, dll): jelaskan jenis dokumen, isi utamanya, dan langkah yang perlu diambil.
3. Jika ini foto biasa: deskripsikan isinya secara detail.

Pertanyaan user: "${userQuestion || "Apa isi gambar ini?"}"

Berikan analisis lengkap dalam Bahasa Indonesia.`,
            },
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
          ],
        }],
        max_tokens: 1500,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Generate and store an embedding for a KB article.
 * Fire-and-forget — never blocks the main response path.
 * Fetches latest article fields (including keywords/summary if already generated).
 */
async function embedKBArticle(articleId, { rethrow = false } = {}) {
  if (!process.env.OPENAI_API_KEY) return;
  const supabase = getAdminClient();
  if (!supabase) return;
  try {
    const { data: art } = await supabase
      .from("knowledge_base")
      .select("title, content, keywords, summary")
      .eq("id", articleId)
      .single();
    if (!art) return;
    const embedText = buildArticleEmbedText(art);
    const embedding = await generateEmbedding(embedText);
    await supabase.from("knowledge_base")
      .update({ embedding: JSON.stringify(embedding), embedding_model: CURRENT_EMBED_MODEL })
      .eq("id", articleId);
    console.log(`[RAG] ✓ embedded article ${articleId} [${CURRENT_EMBED_MODEL}]`);
  } catch (e) {
    console.warn(`[RAG] embedding failed for ${articleId}: ${e.message}`);
    if (rethrow) throw e;
  }
}

/* ── Fetch relevant knowledge base articles ──────────── */
async function fetchRelevantArticles(userQuestion, intentType) {
  const supabase = getAdminClient();
  if (!supabase) return [];

  const [hasTypeCol, hasKwCol, hasMapsUrlCol, hasSummaryCol, hasNotesCol] = await Promise.all([
    detectArticleTypeCol(supabase),
    detectKeywordsCol(supabase),
    detectMapsUrlCol(supabase),
    detectSummaryCol(supabase),
    detectImportantNotesCol(supabase),
  ]);

  const selectCols = [
    "title, content, category, hidden, last_updated",
    hasTypeCol    ? ", article_type"     : "",
    hasKwCol      ? ", keywords"         : "",
    hasMapsUrlCol ? ", maps_url"         : "",
    hasSummaryCol ? ", summary"          : "",
    hasNotesCol   ? ", important_notes"  : "",
  ].join("");

  // ── Indonesian stopwords — high-frequency words that add search noise ───────
  const INDO_STOPWORDS = new Set([
    // Question / wh-words
    "apa","apakah","bagaimana","gimana","kenapa","mengapa","kapan","siapa","mana",
    "dimana","kemana","berapa","gimana",
    // Prepositions / connectors
    "dan","atau","tapi","tetapi","namun","juga","serta","bahkan","karena","sehingga",
    "agar","supaya","oleh","pada","dalam","antara","melalui","dengan","untuk","dari",
    "tentang","mengenai","soal","hal",
    // Pronouns / articles
    "saya","aku","gue","gwa","gw","kamu","kau","elo","dia","mereka","kami","kita",
    "ini","itu","nya",
    // Modal / auxiliary verbs
    "bisa","boleh","minta","tolong","mohon","harus","perlu","wajib","dapat","ada",
    "tidak","bukan","gak","nggak","udah","sudah","belum","sedang","akan","lagi",
    "punya","mau","ingin","pengen",
    // Discourse fillers
    "ya","dong","deh","sih","nih","tuh","kan","cuma","aja","saja","banget","sekali",
    "info","tahu","tau","cara","tolong","kasih","jelasin","jelaskan",
  ]);

  // ── Masisir term aliases — maps one spelling to alternative spellings ────────
  // When user uses any variant, all variants are searched in the KB.
  const MASISIR_ALIASES = {
    "iqomah":     ["iqama","igamah","izin tinggal","residence"],
    "iqama":      ["iqomah","igamah","izin tinggal"],
    "igamah":     ["iqomah","iqama","izin tinggal"],
    "kbri":       ["kedutaan","kedubes","konsulat"],
    "kedutaan":   ["kbri","kedubes"],
    "kedubes":    ["kbri","kedutaan"],
    "paspor":     ["passport"],
    "passport":   ["paspor"],
    "visa":       ["viza","izin masuk"],
    "viza":       ["visa"],
    "azhar":      ["al-azhar","universitas azhar"],
    "qaid":       ["shahada","surat aktif","syahadat"],
    "shahada":    ["qaid","syahadat"],
    "ppmi":       ["organisasi","masisir","persatuan","perhimpunan"],
    "lokasi":     ["alamat","kantor","tempat","gedung","letak"],
    "alamat":     ["lokasi","kantor","tempat","gedung"],
    "kantor":     ["lokasi","alamat","gedung","tempat"],
    "kost":       ["sewa","apartemen","kontrakan"],
    "kos":        ["sewa","apartemen","kontrakan"],
    "sewa":       ["kost","kos","kontrakan","apartemen"],
    "bus":        ["autobus","metro"],
    "metro":      ["bus","autobus"],
    "halal":      ["kuliner","makanan halal"],
    "kuliner":    ["makanan","restoran"],
    "makan":      ["kuliner","restoran"],
    "transfer":   ["bayar","pembayaran","kirim uang"],
    "rasm":       ["biaya kuliah","spp","uang kuliah"],
    "riyal":      ["egp","pound mesir"],
    "perpanjang": ["perpanjangan","renew","renewal"],
    "daftar":     ["pendaftaran","registrasi","register"],
    "kuliah":     ["akademik","kampus","perkuliahan"],
    "rumah":      ["apartemen","sewa","kost"],
    "muadzin":    ["mu'adzin","azan"],
    // ── Jabatan / role aliases — so "presiden PPMI" also searches "ketua PPMI" ──
    "presiden":   ["ketua","pimpinan","pemimpin","koordinator"],
    "ketua":      ["presiden","pimpinan","pemimpin"],
    "pimpinan":   ["presiden","ketua","pemimpin"],
    "pemimpin":   ["presiden","ketua","pimpinan"],
    "sekretaris": ["sekjen","sekretariat"],
    "bendahara":  ["keuangan"],
    "koordinator":["ketua","kepala"],
  };

  // ── Extract keywords: strip stopwords → expand aliases → sort by specificity ──
  const rawWords = userQuestion
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !INDO_STOPWORDS.has(w));

  // Expand with Masisir aliases (multi-word phrases stay as one entry for phrase search)
  const expandedSet = new Set(rawWords);
  for (const w of rawWords) {
    const aliases = MASISIR_ALIASES[w];
    if (aliases) aliases.forEach(a => expandedSet.add(a));
  }

  // Sort: longer words first (more specific), cap at 15 to avoid query bloat
  const keywords = [...expandedSet]
    .sort((a, b) => b.length - a.length)
    .slice(0, 15);

  console.log(`[KB] keywords extracted: [${keywords.join(", ")}] from "${userQuestion.slice(0, 60)}"`);

  // ── Vector (semantic) search — try first if OpenAI key is available ─────────
  let vectorResults = [];
  if (process.env.OPENAI_API_KEY && !vectorSearchDisabled) {
    try {
      const queryEmbedding = await generateEmbedding(userQuestion);
      const { data: vecData, error: vecErr } = await supabase.rpc("match_knowledge_base", {
        query_embedding: queryEmbedding,
        match_threshold: 0.40,
        match_count: 5,
      });
      if (!vecErr && vecData && vecData.length > 0) {
        vectorResults = vecData;
        console.log(`[RAG] ✓ vector search: ${vectorResults.length} results (top similarity=${vecData[0]?.similarity?.toFixed(3)})`);
      }
    } catch (vecE) {
      if (vecE.message?.includes("429") || vecE.message?.includes("quota")) {
        vectorSearchDisabled = true;
        console.warn("[RAG] ⚠️  Vector search disabled — OpenAI quota exceeded. Falling back to keyword search.");
      } else {
        console.warn(`[RAG] vector search failed, falling back to keyword: ${vecE.message}`);
      }
    }
  }

  // If vector search found solid results, use them directly
  if (vectorResults.length > 0) {
    return vectorResults.slice(0, 5).map(({ similarity: _, ...a }) => a);
  }

  // ── Keyword (ILIKE) search — fallback when vector unavailable/empty ──────────
  if (keywords.length === 0) {
    logMissingTopic(userQuestion, intentType);
    return [];
  }

  // Server-side OR filter across keywords — also matches contributor-defined keywords column
  const orFilter = keywords
    .flatMap(kw => [
      `title.ilike.%${kw}%`,
      `content.ilike.%${kw}%`,
      ...(hasKwCol ? [`keywords.ilike.%${kw}%`] : []),
      ...(hasSummaryCol ? [`summary.ilike.%${kw}%`] : []),
    ])
    .join(",");

  const { data: matched } = await supabase
    .from("knowledge_base")
    .select(selectCols)
    .eq("status", "approved")
    .or(orFilter)
    .limit(12);   // fetch more candidates for client-side ranking

  if (!matched || matched.length === 0) {
    // Log this query as a missing topic so admins can identify coverage gaps
    logMissingTopic(userQuestion, intentType);
    return [];
  }

  // ── Client-side relevance scoring ─────────────────────────────────────────
  // Rank articles by how many user keywords they match and WHERE they match.
  // Weight: keywords column (3) > title match (2) > summary match (1.5) > content match (1)
  const scored = matched.map(article => {
    let score = 0;
    const titleL   = (article.title          ?? "").toLowerCase();
    const kwL      = (article.keywords       ?? "").toLowerCase();
    const summaryL = (article.summary        ?? "").toLowerCase();
    const contentL = (article.content        ?? "").toLowerCase();

    for (const kw of keywords) {
      if (kwL.includes(kw))      score += 3;   // contributor-defined keywords = highest signal
      if (titleL.includes(kw))   score += 2;   // title match = strong signal
      if (summaryL.includes(kw)) score += 1.5; // summary match = moderate signal
      if (contentL.includes(kw)) score += 1;   // content match = base signal
    }

    // Bonus: title starts with or exactly matches a keyword → exact topic match
    if (keywords.some(kw => titleL.startsWith(kw) || titleL === kw)) score += 2;

    // C2 — Time-decay: penalise stale articles.
    // Fresh content (≤30 days) gets full score.
    // Older content is gradually penalised — most decay happens in 30→180 day window.
    // null last_updated (legacy articles) → treated as 180 days old (mild penalty).
    const ageMs = article.last_updated
      ? Date.now() - new Date(article.last_updated).getTime()
      : 180 * 86400 * 1000;
    const ageDays = ageMs / 86400000;
    const decayFactor =
      ageDays <= 30   ? 1.00 :
      ageDays <= 90   ? 0.95 :
      ageDays <= 180  ? 0.90 :
      ageDays <= 365  ? 0.80 :
      ageDays <= 730  ? 0.70 :
                        0.60;  // 2+ years old: heavy penalty
    score *= decayFactor;

    return { ...article, _relevanceScore: score };
  });

  // Sort by score descending
  scored.sort((a, b) => b._relevanceScore - a._relevanceScore);

  // Minimum relevance threshold: adaptive based on ORIGINAL query words (before alias expansion).
  // Short queries (1-2 raw words) → lower bar since fewer signals available.
  // Longer queries → stricter to avoid noisy results.
  const MIN_SCORE = rawWords.length <= 1 ? 1 : rawWords.length <= 3 ? 2 : 3;
  const relevant = scored.filter(a => a._relevanceScore >= MIN_SCORE);

  if (relevant.length === 0) {
    console.log(`[KB] query="${userQuestion.slice(0, 60)}" → ${scored.length} candidates but all below relevance threshold (min=${MIN_SCORE}, top=${scored[0]?._relevanceScore ?? 0}) → treating as absent`);
    logMissingTopic(userQuestion, intentType);
    return [];
  }

  const top = relevant.slice(0, 5).map(({ _relevanceScore, ...a }) => a);
  // Attach top keyword-match score to the array for assessKBStrength to consume.
  // This lets strength assessment factor in actual relevance, not just article count/length.
  top._topScore = scored[0]._relevanceScore;

  console.log(`[KB] query="${userQuestion.slice(0, 60)}" → ${matched.length} candidates → ${relevant.length} above threshold → top ${top.length} returned (topScore=${scored[0]._relevanceScore})`);
  if (top.length > 0) {
    console.log(`[KB] top article: "${top[0].title}" (score=${scored[0]._relevanceScore})`);
  }

  return top;
}

const DAILY_FREE_LIMIT = 5;

/* ── Fetch active pinned/breaking updates ────────────── */
async function fetchPinnedUpdates() {
  const supabase = getAdminClient();
  if (!supabase) return [];
  try {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("pinned_updates")
      .select("topic, content")
      .eq("active", true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: false });
    return data ?? [];
  } catch {
    return [];
  }
}

/* ── KB strength + external-need assessment ─────────── */

/**
 * Assess how well the Knowledge Base covers the query.
 * Articles passed here have already been score-filtered (min score ≥ 3),
 * so we only need to check quantity + content depth.
 *
 * 'strong'  → ≥2 relevant articles, OR 1 article with ≥1500 chars of content
 *             → KB is self-sufficient; Perplexity is skipped
 * 'weak'    → 1 article with <1500 chars — KB gives partial coverage;
 *             Perplexity should still supplement
 * 'absent'  → no articles at all
 */
function assessKBStrength(articles) {
  if (!articles || articles.length === 0) return "absent";

  const topScore = articles._topScore; // set by fetchRelevantArticles (keyword path); undefined for vector
  const totalChars = articles.reduce((sum, a) => sum + (a.content?.length ?? 0), 0);

  if (topScore !== undefined) {
    // Very high relevance (score ≥7) — trust even a single article
    if (topScore >= 7) {
      console.log(`[KB] strength=strong — topScore=${topScore} (high relevance, single-article OK)`);
      return "strong";
    }
    // Low relevance — matched by coincidence, not real coverage
    if (topScore < 4) {
      console.log(`[KB] strength=weak — topScore=${topScore} below relevance threshold`);
      return "weak";
    }
    // Mid relevance (4 ≤ score < 7) — need both relevance AND sufficient coverage
    const hasCoverage = articles.length >= 2 || totalChars >= 1800;
    if (hasCoverage) {
      console.log(`[KB] strength=strong — topScore=${topScore} + coverage=${articles.length} articles / ${totalChars} chars`);
      return "strong";
    }
    console.log(`[KB] strength=weak — topScore=${topScore} mid-range but insufficient coverage (${articles.length} art, ${totalChars} chars)`);
    return "weak";
  }

  // Vector search path (no topScore) — use coverage metrics only
  if (articles.length >= 2 || totalChars >= 1500) return "strong";
  return "weak";
}

/**
 * Decide whether to run Wave 2 (external) fetches.
 * Rules:
 *  - casual intent → skip (small talk needs no external)
 *  - procedural + KB strong → skip (KB covers the procedure)
 *  - factual intent → always fetch (knowledge questions benefit from external)
 *  - KB absent → always fetch (nothing internal to rely on)
 *  - KB weak + non-procedural → fetch (supplement weak coverage)
 *  - KB strong + non-factual → skip
 */
function shouldFetchExternal(intentPrimary, kbStrength, query) {
  const q = (query ?? "").trim();
  if (q.length < 8 || WIKI_SKIP_PATTERNS.test(q)) return false;
  if (intentPrimary === "casual") return false;
  if (intentPrimary === "arabic_writing" || intentPrimary === "arabic_analysis") return false; // Pure language/writing task — no external needed
  if (intentPrimary === "fiqh") return false; // Dorar.net handles Islamic references — Wikipedia/DDG not reliable for fiqh
  if (kbStrength === "strong") return false;
  // KB absent or weak → always try Wikipedia/DDG as last-resort fallback
  // (only reached when Perplexity is unavailable or fails)
  return true;
}

/* ── Frankfurter: Real-time exchange rates ───────────── */
function isCurrencyQuery(text) {
  const kw = ["kurs", "rate", "nilai tukar", "exchange", "pound", "egp", "idr", "rupiah", "dollar", "usd", "eur", "euro", "tukar", "konversi", "berapa rupiah", "berapa pound", "mata uang", "valuta"];
  const lower = text.toLowerCase();
  return kw.some(k => lower.includes(k));
}

async function fetchExchangeRates() {
  // Primary: open.er-api.com (free, no key, USD-based)
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(8000),
      headers: { "Accept": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.result === "success" && data.rates?.IDR && data.rates?.EGP) {
        const usdToIdr = data.rates.IDR;
        const usdToEgp = data.rates.EGP;
        const egpToIdr = usdToIdr / usdToEgp;
        const egpToUsd = 1 / usdToEgp;
        // Format date from unix timestamp
        const date = new Date(data.time_last_update_unix * 1000)
          .toISOString().slice(0, 10);
        console.log(`[Exchange] open.er-api OK: 1 USD = ${usdToIdr.toFixed(0)} IDR, 1 EGP = ${egpToIdr.toFixed(2)} IDR (${date})`);
        return { date, egpToIdr, egpToUsd, usdToIdr, usdToEgp };
      }
    }
  } catch (e) {
    console.warn("[Exchange] open.er-api failed:", e.message);
  }

  // Fallback: Frankfurter (ECB data, EGP-based)
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EGP&to=IDR,USD", {
      signal: AbortSignal.timeout(8000),
      headers: { "Accept": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.rates?.IDR && data.rates?.USD) {
        const egpToIdr = data.rates.IDR;
        const egpToUsd = data.rates.USD;
        const usdToIdr = egpToIdr / egpToUsd;
        const usdToEgp = 1 / egpToUsd;
        console.log(`[Exchange] frankfurter OK: 1 EGP = ${egpToIdr.toFixed(2)} IDR (${data.date})`);
        return { date: data.date, egpToIdr, egpToUsd, usdToIdr, usdToEgp };
      }
    }
  } catch (e) {
    console.warn("[Exchange] frankfurter failed:", e.message);
  }

  console.warn("[Exchange] all rate APIs failed");
  return null;
}

/**
 * Classify the query into one of three routing types.
 * Called AFTER KB assessment so kbStrength is available.
 *
 * Returns:
 *   "currency"  — exchange-rate / conversion query → dedicated API only, never model numbers
 *   "dynamic"   — current-role or time-sensitive → Perplexity primary
 *   "general"   — everything else → Perplexity primary (if weak/absent KB), then Wiki/DDG fallback
 */
function classifyQueryType(intentPrimary, kbStrength, query) {
  if (isCurrencyQuery(query)) return "currency";
  // Dynamic: office-holder queries (uses shared helper — covers menko/menkeu/menlu/etc.)
  // or any time-sensitive keyword
  const dynamic =
    isDynamicRoleQuery(query)
    || /\b(sekarang|terbaru|terkini|saat ini|hari ini|bulan ini|tahun ini|2024|2025|2026|kebijakan baru|aturan terbaru|perubahan|berubah|update|berita|baru-baru)\b/i.test(query);
  if (dynamic) return "dynamic";
  return "general";
}

/* ── Wikipedia: Factual summaries ────────────────────── */
function isWikipediaQuery(text) {
  const kw = ["siapa", "siapakah", "apa itu", "apakah itu", "jelaskan", "ceritakan", "sejarah", "biografi", "profil", "tokoh", "ilmuwan", "ulama", "imam", "nabi", "presiden", "raja", "ratu", "universitas", "kota", "negara", "peristiwa", "who is", "what is", "tell me about"];
  const lower = text.toLowerCase();
  return kw.some(k => lower.includes(k));
}

function extractWikipediaSearchTerm(query) {
  let q = query.trim();
  // Strip leading question words (Indonesian + English)
  const stripPrefixes = [
    "siapakah", "siapa itu", "siapa", "apakah itu", "apa itu", "apakah",
    "jelaskan tentang", "jelaskan", "ceritakan tentang", "ceritakan",
    "sejarah singkat", "sejarah", "biografi", "profil",
    "tell me about", "who is", "what is", "explain",
  ];
  const lower = q.toLowerCase();
  for (const prefix of stripPrefixes) {
    if (lower.startsWith(prefix)) {
      q = q.slice(prefix.length).trim();
      break;
    }
  }
  // Strip trailing time markers that confuse search
  q = q.replace(/\b(sekarang|saat ini|terkini|saat sekarang|yang sekarang|hari ini|terbaru|now|current|currently)\b/gi, "").trim();
  // Strip trailing punctuation
  q = q.replace(/[?!.,;]+$/, "").trim();
  return q || query;
}

const WIKI_SKIP_PATTERNS = /^(ok|oke|okay|iya|ya|yap|yep|haha|hehe|wkwk|lol|makasih|thanks|thank you|terima kasih|sip|siap|mantap|beres|done|good|great|nice|oke bro|sip bro|iyaa|ooh|ohh|wah|wow|hmm|hm|eh|ah|uh|gitu|gitu ya|gitu deh|paham|ngerti|mengerti|udah|sudah|lanjut|next|teruskan|lanjutkan)\b/i;

/* ── Source trust scores (Phase 9) ───────────────────── */
// Rule-based numeric trust tiers — no external API needed.
// Higher = more trustworthy. Used for logging, confidence signals, and context labels.
const SOURCE_TRUST_SCORES = {
  pinned_update:   100, // Admin-verified, highest trust
  kb_article:       90, // Contributor-submitted, admin-approved
  exchange_rate:    85, // Real-time ECB/Frankfurter data
  perplexity:       78, // Real-time web search — current, but unverified by admin
  dorar:            82, // Dorar.net hadith encyclopedia — scholarly Islamic primary sources
  wikipedia:        60, // Public encyclopedia — mostly reliable, occasionally outdated
  duckduckgo:       35, // General web instant answer — unverified
  model_knowledge:  20, // LLM training data — may be stale
};

/**
 * Compute the trust level of whatever external context is actually being injected.
 * Returns 'medium' | 'low' | null (null = no external context injected).
 * Used to refine confidence classification and emit a log signal.
 */
function computeExternalTrustLevel(wikiInjected, ddgInjected, perplexityInjected = false) {
  if (perplexityInjected) return { tier: "high",   score: SOURCE_TRUST_SCORES.perplexity,  label: "Gemini" };
  if (wikiInjected)       return { tier: "medium", score: SOURCE_TRUST_SCORES.wikipedia,   label: "Wikipedia" };
  if (ddgInjected)        return { tier: "low",    score: SOURCE_TRUST_SCORES.duckduckgo,  label: "DuckDuckGo" };
  return null;
}

/* ── Phase 12: Multi-User Intelligence helpers ────────── */

/** Normalize a query for dedup: lowercase, strip punctuation, collapse spaces. */
function normalizeQuery(q) {
  return q.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

// ── Masisir typo normalization ────────────────────────────────────────────────
// Silently corrects common misspellings BEFORE retrieval (KB + Perplexity).
// Original user message is always preserved for display & conversation history.
const MASISIR_TYPO_MAP = [
  // Dubai variations
  [/\bdunai\b/gi,           "dubai"],
  [/\bdubay\b/gi,           "dubai"],
  // Iqomah (izin tinggal)
  [/\biqoamah\b/gi,         "iqomah"],
  [/\bikomah\b/gi,          "iqomah"],
  [/\bikamah\b/gi,          "iqomah"],
  [/\biqaamah\b/gi,         "iqomah"],
  // Tasjil (pendaftaran)
  [/\btasygil\b/gi,         "tasjil"],
  [/\btasyghil\b/gi,        "tasjil"],
  [/\btasjeel\b/gi,         "tasjil"],
  // Imtihan (ujian)
  [/\bimtehan\b/gi,         "imtihan"],
  [/\bimtehaan\b/gi,        "imtihan"],
  [/\bimtehon\b/gi,         "imtihan"],
  // Muqarrar (buku wajib)
  [/\bmuqoror\b/gi,         "muqarrar"],
  [/\bmuqarror\b/gi,        "muqarrar"],
  [/\bmuqorror\b/gi,        "muqarrar"],
  [/\bmughoror\b/gi,        "muqarrar"],
  [/\bmugorror\b/gi,        "muqarrar"],
  [/\bmuqorrar\b/gi,        "muqarrar"],
  // Shahada / Qaid
  [/\bsyahadah\b/gi,        "shahada"],
  [/\bsyahada\b/gi,         "shahada"],
  [/\bqo'id\b/gi,           "qaid"],
  [/\bqo id\b/gi,           "qaid"],
  // Wiqayah / other
  [/\bwiqoyah\b/gi,         "wiqayah"],
  [/\bwiqoyat\b/gi,         "wiqayah"],
  // Pendaftaran
  [/\bpendaptaran\b/gi,     "pendaftaran"],
  [/\bpendaftran\b/gi,      "pendaftaran"],
  // Ujian
  [/\bujiaan\b/gi,          "ujian"],
];

function applyTypoNormalization(text) {
  if (!text || text.length > 500) return text;
  let result = text;
  for (const [pattern, replacement] of MASISIR_TYPO_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** One-way SHA-256 hash — used as an anonymized dedup key. Never reversible. */
function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Classify a query turn into an edge-case pattern type, if one applies.
 * Returns { patternType, topicHint } or null.
 * Privacy: patternType and topicHint are system-level labels, not user data.
 */
function detectEdgeCase({ confidenceLevel, confidenceHint, hasKB, hasWiki, hasDDG, intent, query }) {
  const hint = confidenceHint ?? "";
  // Hard-blocked current-role query
  if (hint.includes("BLOKIR") || hint.includes("JABATAN")) {
    return { patternType: "current_role_blocked", topicHint: "jabatan" };
  }
  // No source at all — model answering blind
  if (!hasKB && !hasWiki && !hasDDG && confidenceLevel === "needs_verification") {
    const topic = intent?.primary ?? "unknown";
    return { patternType: "no_source", topicHint: topic };
  }
  // Time-sensitive with only DDG or no external source
  if (confidenceLevel === "needs_verification" && hasDDG && !hasKB) {
    return { patternType: "ddg_only_time_sensitive", topicHint: intent?.primary ?? "unknown" };
  }
  return null;
}

/**
 * Fire-and-forget: write aggregate intel signals after every chat turn.
 * PRIVACY RULES:
 *   - No user_id stored anywhere in intel tables.
 *   - query_hash is SHA-256 of the normalized query — not linked to any user.
 *   - sample_query is capped at 80 chars and may be omitted if it looks personal.
 *   - intel tables are never joined with user_memories or user profiles.
 */
async function recordIntelSignal({ intent, kbStrength, hasKB, hasPinned, hasWiki, hasDDG, hasPerplexity = false,
  confidenceLevel, confidenceHint, externalTier, query }) {
  const supabase = getAdminClient();
  if (!supabase) return;
  try {
    const normalized = normalizeQuery(query);
    const qHash = hashText(normalized);
    const topicCluster = `${intent?.primary ?? "unknown"}__${kbStrength ?? "absent"}`;

    // Looks personal if it contains email-like patterns or 4+ digit sequences (IDs)
    const looksPersonal = /\S+@\S+|\b\d{4,}\b/.test(query);
    const sampleQuery = looksPersonal ? null : query.slice(0, 80);

    // 1. Upsert query pattern (FAQ intelligence)
    const { error: qpErr } = await supabase.rpc("upsert_intel_query_pattern", {
      p_hash:    qHash,
      p_topic:   topicCluster,
      p_sample:  sampleQuery,
    });
    if (qpErr) console.warn("[Intel/FAQ] upsert error:", qpErr.message);

    // 2. Insert retrieval stat (per-turn, always a new row for time-series analysis)
    const { error: rsErr } = await supabase.from("intel_retrieval_stats").insert({
      intent:           intent?.primary ?? null,
      kb_strength:      kbStrength ?? null,
      had_kb:           hasKB,
      had_pinned:       hasPinned,
      had_wiki:         hasWiki,
      had_ddg:          hasDDG,
      had_perplexity:   hasPerplexity,
      confidence_level: confidenceLevel ?? null,
      external_tier:    externalTier ?? null,
    });
    if (rsErr) console.warn("[Intel/Retrieval] insert error:", rsErr.message);

    // 3. Upsert edge case if applicable
    const edgeCase = detectEdgeCase({ confidenceLevel, confidenceHint, hasKB, hasWiki, hasDDG, intent, query });
    if (edgeCase) {
      const { error: ecErr } = await supabase.rpc("upsert_intel_edge_case", {
        p_pattern: edgeCase.patternType,
        p_topic:   edgeCase.topicHint,
      });
      if (ecErr) console.warn("[Intel/EdgeCase] upsert error:", ecErr.message);
      console.log(`[Intel] edge_case=${edgeCase.patternType} topic=${edgeCase.topicHint}`);
    }

    console.log(`[Intel] signal recorded: intent=${intent?.primary} kb=${kbStrength} wiki=${hasWiki} ddg=${hasDDG} conf=${confidenceLevel}`);
  } catch (e) {
    console.warn("[Intel] recordIntelSignal failed (non-critical):", e.message);
  }
}

async function fetchWikipediaSummary(query) {
  const TIMEOUT = 4000;
  const trimmed = query.trim();
  // Skip very short or purely conversational messages
  if (trimmed.length < 8 || WIKI_SKIP_PATTERNS.test(trimmed)) return null;

  try {
    const searchTerm = extractWikipediaSearchTerm(query);
    const q = encodeURIComponent(searchTerm.slice(0, 120));
    console.log(`[Wikipedia] search term: "${searchTerm}" (from: "${query.slice(0, 60)}")`);

    // Search Indonesian Wikipedia first
    const idSearchRes = await fetch(
      `https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&format=json&srlimit=1&srprop=size&origin=*`,
      { signal: AbortSignal.timeout(TIMEOUT) }
    );
    const idSearch = await idSearchRes.json();
    let title = idSearch.query?.search?.[0]?.title;
    let lang = "id";

    // Fallback to English Wikipedia
    if (!title) {
      const enSearchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&format=json&srlimit=1&srprop=size&origin=*`,
        { signal: AbortSignal.timeout(TIMEOUT) }
      );
      const enSearch = await enSearchRes.json();
      title = enSearch.query?.search?.[0]?.title;
      lang = "en";
    }

    if (!title) return null;

    // Fetch page summary
    const summaryRes = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(TIMEOUT) }
    );
    if (!summaryRes.ok) return null;
    const summary = await summaryRes.json();
    if (!summary.extract || summary.extract.length < 50) return null;

    return {
      title: summary.title,
      extract: summary.extract.slice(0, 2000),
      lang,
      url: summary.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    };
  } catch {
    return null;
  }
}

/* ── Fetch DuckDuckGo instant answer ─────────────────── */
async function fetchDuckDuckGoAnswer(query) {
  const TIMEOUT = 3000;
  const trimmed = query.trim();
  if (trimmed.length < 8 || WIKI_SKIP_PATTERNS.test(trimmed)) return null;
  try {
    const q = encodeURIComponent(trimmed.slice(0, 200));
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(TIMEOUT) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.AbstractText || data.Answer || data.Definition ||
      (data.RelatedTopics?.[0]?.Text ?? "") || "";
    if (!text || text.length < 20) return null;
    const source = data.AbstractSource || data.RelatedTopics?.[0]?.FirstURL?.split("/")?.[2] || "DuckDuckGo";
    const url = data.AbstractURL || data.DefinitionURL || data.RelatedTopics?.[0]?.FirstURL || "";
    return { text: text.trim(), source, url };
  } catch {
    return null;
  }
}

/* ── Dorar.net Hadith/Fiqh API ───────────────────────── */

// Map common Indonesian fiqh terms → Arabic for Dorar search
const FIQH_TERM_MAP = {
  "shalat": "صلاة", "solat": "صلاة", "salat": "صلاة",
  "puasa": "صوم", "shaum": "صوم",
  "zakat": "زكاة",
  "haji": "حج", "hajj": "حج",
  "umrah": "عمرة", "umroh": "عمرة",
  "nikah": "نكاح", "pernikahan": "نكاح", "kawin": "نكاح",
  "talak": "طلاق", "cerai": "طلاق",
  "wudhu": "وضوء", "wudlu": "وضوء",
  "tayamum": "تيمم",
  "najis": "نجاسة",
  "riba": "ربا", "bunga bank": "ربا",
  "hijab": "حجاب", "jilbab": "حجاب",
  "aurat": "عورة",
  "warisan": "ميراث", "waris": "ميراث",
  "wakaf": "وقف",
  "sedekah": "صدقة",
  "fatwa": "فتوى",
  "qurban": "أضحية", "kurban": "أضحية",
  "aqiqah": "عقيقة",
  "sujud": "سجود",
  "thaharah": "طهارة", "bersuci": "طهارة",
  "mandi wajib": "غسل",
  "halal": "حلال",
  "haram": "حرام",
  "makruh": "مكروه",
  "mubah": "مباح",
  "sunnah": "سنة",
  "wajib": "واجب فرض",
  "fardhu": "فرض",
  "jihad": "جهاد",
  "jual beli": "بيع وشراء",
  "muamalah": "معاملات",
  "hutang": "دين", "utang": "دين", "pinjaman": "قرض",
  "qadha": "قضاء", "qada": "قضاء",
  // Shalat spesifik
  "sholat": "صلاة", "sembahyang": "صلاة", "berpuasa": "صوم",
  "shalat jumat": "صلاة الجمعة", "jumat": "الجمعة",
  "shalat tahajud": "صلاة التهجد", "tahajud": "التهجد",
  "shalat dhuha": "صلاة الضحى", "dhuha": "الضحى",
  "shalat jenazah": "صلاة الجنازة",
  "shalat berjamaah": "صلاة الجماعة",
  "shalat qashar": "صلاة القصر", "qashar": "القصر",
  "shalat jamak": "الجمع بين الصلاتين",
  "sujud sahwi": "سجود السهو", "sujud tilawah": "سجود التلاوة",
  "mandi junub": "غسل الجنابة",
  // Munakahat lanjut
  "mahar": "مهر", "mas kawin": "مهر",
  "iddah": "عدة",
  "nafkah": "نفقة",
  "poligami": "تعدد الزوجات",
  "khul": "خلع", "khuluk": "خلع",
  // Halal/haram lanjut
  "hewan sembelihan": "ذبيحة", "sembelih": "ذبح",
  "babi": "خنزير", "gelatin babi": "خنزير",
  "asuransi": "تأمين",
  "gadai": "رهن",
  // Ibadah umum
  "doa": "دعاء",
  "dzikir": "ذكر", "zikir": "ذكر",
  "taubat": "توبة",
  "akidah": "عقيدة", "aqidah": "عقيدة",
  "tauhid": "توحيد",
  "bidah": "بدعة",
  "faraid": "فرائض",
  "infak": "إنفاق",
  "zakat fitrah": "زكاة الفطر", "zakat mal": "زكاة المال",
  "udhiyah": "أضحية",
};

// Detect fiqh-related queries (Arabic or Indonesian)
function isFiqhQuery(query) {
  const lq = query.toLowerCase();
  // Indonesian fiqh keywords
  const hasIdFiqh = Object.keys(FIQH_TERM_MAP).some(k => lq.includes(k))
    || /\b(hukum islam|hukum syar|boleh tidak|apakah boleh|apakah haram|apakah halal|dalil|hadits|hadis|quran|alquran|fiqh|fiqih|ibadah|muamalah|aqidah)\b/i.test(lq);
  // Arabic fiqh keywords
  const hasArFiqh = /[\u0600-\u06FF]/.test(query)
    && /(حكم|فقه|صلاة|زكاة|صوم|حج|نكاح|طلاق|وضوء|طهارة|حلال|حرام|سنة|واجب|مكروه|مباح|ربا|عبادة|معاملة|ميراث|فتوى|قرآن|حديث|دليل)/.test(query);
  return hasIdFiqh || hasArFiqh;
}

// Extract the best Arabic search term from user query
function extractDorarSearchTerm(query) {
  const lq = query.toLowerCase();
  // If Arabic script present, pull the Arabic words directly
  if (/[\u0600-\u06FF]/.test(query)) {
    const arabicWords = query.match(/[\u0600-\u06FF]{2,}/g) ?? [];
    // Filter out common Arabic stop words
    const stops = new Set(["في","من","على","إلى","أن","هو","هي","ما","هل","كان","كيف","لا","وما","عن","مع","بعد","قبل","كل","هذا","هذه","هل","أو","ثم"]);
    return arabicWords.filter(w => !stops.has(w)).slice(0, 4).join(" ");
  }
  // Strip common question/framing words first (Indonesian)
  const stripped = lq
    .replace(/\b(apakah|boleh tidak|boleh ga|boleh gak|hukumnya|hukum dari|hukum|bagaimana|apa itu|apa yang dimaksud|jelaskan|tolong jelaskan|saya mau tanya|tolong|bisa minta|cari|cariin|gimana|tentang)\b/gi, " ")
    .replace(/\s+/g, " ").trim();
  // Multi-word matches first (more specific → higher priority)
  const sortedKeys = Object.keys(FIQH_TERM_MAP).sort((a, b) => b.length - a.length);
  for (const id of sortedKeys) {
    if (stripped.includes(id) || lq.includes(id)) return FIQH_TERM_MAP[id];
  }
  // Fallback: meaningful content words (>3 chars, skip Indonesian stop words)
  const stopWords = new Set(["yang","dengan","untuk","dari","pada","atau","dan","ini","itu","dalam","akan","bisa","ada","tidak","harus","bagi","agar","agar","saja","sudah","belum","apa","siapa","mana","kapan","jika","kalau","karena"]);
  const meaningful = query.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w.toLowerCase())).slice(0, 4);
  return meaningful.join(" ") || query.slice(0, 50);
}

// Strip HTML tags and normalise whitespace
function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Parse Dorar HTML result into structured hadith objects
function parseDorarHtml(html) {
  const blocks = html.split(/-{3,}/).filter(b => b.trim().length > 20);
  const results = [];
  for (const block of blocks.slice(0, 5)) {
    // Extract hadith text (inside <div class="hadith">)
    const hadithMatch = block.match(/class="hadith"[^>]*>([\s\S]*?)<\/div>/i);
    const hadithHtml = hadithMatch ? hadithMatch[1] : "";
    const hadithText = stripHtml(hadithHtml).replace(/^\d+\s*-\s*/, "").trim();
    if (hadithText.length < 10) continue;

    // Extract metadata fields
    const rawi    = block.match(/الراوي[:\s]*<\/span>\s*([^<]+)/)?.[1]?.trim() ?? "";
    const mohdith = block.match(/المحدث[:\s]*<\/span>\s*([^<]+)/)?.[1]?.trim() ?? "";
    const source  = block.match(/المصدر[:\s]*<\/span>\s*([^<]+)/)?.[1]?.trim() ?? "";
    const grade   = block.match(/خلاصة حكم المحدث[:\s]*<\/span>[\s\S]*?<span[^>]*>([^<]+)<\/span>/)?.[1]?.trim() ?? "";

    results.push({ text: hadithText, rawi, mohdith, source, grade });
  }
  return results;
}

async function fetchDorarHadith(query) {
  const TIMEOUT = 5000;
  try {
    const searchTerm = extractDorarSearchTerm(query);
    if (!searchTerm || searchTerm.length < 2) return null;
    console.log(`[Dorar] searching: "${searchTerm}" (from: "${query.slice(0, 50)}")`);

    const q = encodeURIComponent(searchTerm.slice(0, 100));
    const res = await fetch(
      `https://dorar.net/dorar_api.json?skey=${q}`,
      { signal: AbortSignal.timeout(TIMEOUT), headers: { "User-Agent": "AINA-Bot/1.0" } }
    );
    if (!res.ok) { console.log(`[Dorar] HTTP ${res.status}`); return null; }

    const data = await res.json();
    const html = data?.ahadith?.result ?? "";
    if (!html || html.length < 50) return null;

    const hadiths = parseDorarHtml(html);
    if (hadiths.length === 0) { console.log("[Dorar] no parseable hadiths"); return null; }

    console.log(`[Dorar] found ${hadiths.length} hadith(s) for "${searchTerm}"`);
    return { searchTerm, hadiths };
  } catch (err) {
    console.log(`[Dorar] fetch error: ${err.message}`);
    return null;
  }
}

/* ── Web context fetch: Perplexity (real-time) → Gemini (training data fallback) ─── */

/**
 * Shared helper: detects if a query is about who currently holds a public office/role.
 * These queries are inherently time-sensitive — KB data may be stale.
 * Used by needsPerplexity, classifyQueryType, and classifyConfidence.
 */
const _JABATAN_PATTERN = "(presiden|perdana menteri|pm|menteri|wakil presiden|rektor|direktur utama|dirut|direktur|ceo|gubernur|walikota|wali kota|bupati|kepala|ketua|sekjen|sekretaris jenderal|paus|raja|ratu|panglima|kapolri|jaksa agung|chairman|chancellor|pemimpin|komisaris|menko|menkeu|menlu|menhan|mendagri|menag|menpan|menaker|mentan|menhub|menpora|menkes|kepala bps|kepala bi|gubernur bi|chief|bos|duta besar|dubes)";
function isDynamicRoleQuery(q) {
  const text = (q ?? "").toLowerCase();
  return new RegExp(`\\bsiapa\\b.{0,60}\\b${_JABATAN_PATTERN}\\b`, "i").test(text)
    || new RegExp(`\\b${_JABATAN_PATTERN}\\b.{0,40}\\b(siapa|apa|siapakah)\\b`, "i").test(text)
    || /\b(yang menjabat|yang menjadi|yang memimpin|sedang menjabat|saat ini menjabat|sekarang menjabat|masih menjabat|jabatan saat ini|pemegang jabatan|office holder|incumbent|terpilih|dilantik|ditunjuk)\b/i.test(text)
    || /\bsiapa\b.{0,30}\b(yang jadi|yang menjadi|yang menjabat|yang memimpin|yang terpilih|yang dilantik)\b/i.test(text);
}

/**
 * Returns true if the query is about a Masisir-internal student/diaspora organisation.
 * These orgs (PPMI, kekeluargaan daerah, forkom, dsb.) are not indexed by public web
 * search engines — their leadership data lives exclusively in the AINA Knowledge Base.
 * When this returns true AND KB has a strong hit, skip Perplexity and trust the KB.
 */
function isMasisirInternalOrg(q) {
  const text = (q ?? "").toLowerCase();
  return /\b(ppmi|ppi\s*mesir|kekeluargaan|imman|iwama|ikamapta|ioms|forkom|dppm|senat\s*masisir|bem\s*masisir|komunitas\s*masisir|perhimpunan\s*pelajar|persatuan\s*pelajar)\b/.test(text);
}

/**
 * Decide if a query warrants a Gemini context lookup.
 *
 * Rule: KB → Gemini if KB is absent or weak.
 * Gemini is the primary external intelligence source for ALL non-casual,
 * non-trivial queries that the KB does not fully cover — regardless of intent type.
 * This covers: factual, procedural, recommendation, brainstorming, confused.
 *
 * Exclusions:
 *   - KB is strong → no need, KB already answers it
 *   - casual intent → small talk, no external needed
 *   - very short or purely conversational messages → skip
 */
function needsPerplexity(intentPrimary, kbStrength, query) {
  const q = (query ?? "").trim();
  if (q.length < 8 || WIKI_SKIP_PATTERNS.test(q)) return false;
  if (intentPrimary === "casual") return false;
  if (intentPrimary === "arabic_writing" || intentPrimary === "arabic_analysis") return false; // Pure language/writing task — no web context needed
  if (intentPrimary === "fiqh") return false; // Dorar.net is the authoritative Islamic source — Gemini not used for fiqh
  // Dynamic override: jabatan/pejabat/office-holder queries ALWAYS need Perplexity,
  // even when KB is strong — KB data for public office holders can be stale.
  // Exception: Masisir-internal orgs (PPMI, kekeluargaan, forkom, dll.) are NOT on
  // public web indices — Perplexity will return nothing useful. Trust KB instead.
  if (isDynamicRoleQuery(q)) {
    if (isMasisirInternalOrg(q) && kbStrength === "strong") return false;
    return true;
  }
  if (kbStrength === "strong") return false;
  // KB is absent or weak → always fetch Gemini context
  return true;
}

/**
 * Fetch a concise factual answer from Gemini 2.5 Flash via OpenRouter.
 * Returns { text, citations } or null on failure.
 * - text: max ~1200 chars
 * - citations: [] (Gemini via OpenRouter does not return citation URLs)
 */
async function fetchPerplexityContext(query) {
  const perplexityKey  = process.env.PERPLEXITY_API_KEY;
  const openrouterKey  = process.env.OPENROUTER_API_KEY;

  if (!perplexityKey && !openrouterKey) {
    console.log("[WebSearch] skipped — no API key configured");
    return null;
  }

  const todayStr = new Date().toLocaleDateString("id-ID", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Africa/Cairo",
  });
  const isFiqhCtx = isFiqhQuery(query);

  // ── Path A: Perplexity (real-time web search) ────────────────────────────
  if (perplexityKey) {
    const systemMsg = isFiqhCtx
      ? `Kamu adalah asisten yang paham fiqh Islam. Berikan penjelasan hukum Islam yang singkat dan akurat dalam 3–5 kalimat. Sebutkan dasar hukumnya jika memungkinkan. Jawab dalam Bahasa Indonesia tanpa salam atau disclaimer.`
      : `Kamu adalah asisten untuk mahasiswa Indonesia di Mesir (Masisir). Hari ini ${todayStr} (waktu Kairo). Berikan jawaban faktual terbaru dan akurat dalam 3–5 kalimat atau daftar singkat. Prioritaskan informasi paling relevan dan terkini. Jawab dalam Bahasa Indonesia tanpa salam atau disclaimer.`;
    try {
      // Use current Perplexity model names (llama-3.1-sonar-* was deprecated → now "sonar" / "sonar-pro")
      const perplexityModel = "sonar";
      console.log(`[WebSearch/Perplexity] → calling model=${perplexityModel} query="${query.slice(0, 60)}..."`);
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(12000),
        headers: {
          "Authorization": `Bearer ${perplexityKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: perplexityModel,
          messages: [
            { role: "system", content: systemMsg },
            { role: "user",   content: query.slice(0, 500) },
          ],
          max_tokens: isFiqhCtx ? 800 : 600,
          temperature: isFiqhCtx ? 0.15 : 0.10,
          return_citations: true,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`[WebSearch/Perplexity] API error ${res.status} — ${errText.slice(0, 300)}`);
        // Fall through to Gemini fallback
      } else {
        const data = await res.json();
        const rawText = data.choices?.[0]?.message?.content ?? "";
        if (rawText && rawText.length >= 20) {
          const text = trimToSentence(rawText, 1400);
          const citations = (data.citations ?? []).slice(0, 5);
          console.log(`[WebSearch/Perplexity] ✓ real-time context fetched (${text.length} chars, ${citations.length} citations, model=${perplexityModel})`);
          return { text, citations };
        } else {
          console.warn(`[WebSearch/Perplexity] empty/short response (${rawText.length} chars) — falling back`);
        }
      }
    } catch (e) {
      console.warn(`[WebSearch/Perplexity] fetch failed: ${e.message}`);
    }
  }

  // ── Path B: OpenAI GPT-4o-mini via OpenRouter (reliable fallback when Perplexity fails) ──
  if (!openrouterKey) return null;
  const systemMsgOpenAI = isFiqhCtx
    ? `Kamu adalah asisten yang paham fiqh Islam dan bahasa Arab. Berikan penjelasan hukum Islam yang singkat, akurat dalam 3–5 kalimat. Sebutkan dasar hukumnya jika memungkinkan. Jawab dalam Bahasa Indonesia tanpa salam atau disclaimer.`
    : `Kamu adalah asisten untuk komunitas mahasiswa Indonesia di Mesir (Masisir). Hari ini ${todayStr} (waktu Kairo). Berikan jawaban faktual yang jelas dalam 3–5 kalimat atau daftar singkat. Jawab dalam Bahasa Indonesia tanpa salam atau disclaimer.`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Authorization": `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://ainalabs.pro",
        "X-Title": "AINA - Asisten Masisir",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemMsgOpenAI },
          { role: "user",   content: query.slice(0, 500) },
        ],
        max_tokens: isFiqhCtx ? 800 : 600,
        temperature: isFiqhCtx ? 0.15 : 0.10,
      }),
    });
    if (!res.ok) {
      console.warn(`[WebSearch/OpenAI-fallback] API error ${res.status}`);
      return null;
    }
    const data = await res.json();
    const rawText = data.choices?.[0]?.message?.content ?? "";
    if (!rawText || rawText.length < 20) return null;
    const text = trimToSentence(rawText, 1200);
    console.log(`[WebSearch/OpenAI-fallback] ✓ context fetched (${text.length} chars) — Perplexity unavailable, GPT-4o-mini used`);
    return { text, citations: [] };
  } catch (e) {
    console.warn("[WebSearch/OpenAI-fallback] fetch failed:", e.message);
    return null;
  }
}

/* ── Fetch user memories ─────────────────────────────── */
async function fetchUserMemories(userId, query = "", intentPrimary = "factual") {
  const supabase = getAdminClient();
  if (!supabase) return [];
  try {
    let { data, error } = await supabase
      .from("user_memories")
      .select("id, memory, memory_type, is_long_term, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    // Fallback: if new columns not yet migrated, fetch basic columns only
    if (error && (error.code === "42703" || error.message?.includes("column") || error.message?.includes("memory_type"))) {
      const fallback = await supabase
        .from("user_memories")
        .select("id, memory, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      return (fallback.data ?? []).map(m => ({ ...m, memory_type: "context_memory", is_long_term: false }));
    }
    if (error && (error.code === "42P01" || error.message?.includes("does not exist"))) {
      return [];
    }
    const rows = data ?? [];
    if (rows.length === 0) return [];

    // Expiry filter — rule-based, no LLM
    const now = Date.now();
    const EXPIRY_DAYS = { task_memory: 30, context_memory: 90, preference_memory: Infinity };
    const active = rows.filter(m => {
      if (m.is_long_term) return true;
      const type = m.memory_type || "context_memory";
      const ageDays = (now - new Date(m.created_at).getTime()) / 86_400_000;
      return ageDays < (EXPIRY_DAYS[type] ?? 90);
    });
    if (active.length === 0) return [];

    // ── Semantic reranking (if OpenAI available) ─────────────────────────────
    // Batch-embed query + all memories in one API call → cosine similarity → rerank
    if (process.env.OPENAI_API_KEY && query.trim().length > 3 && active.length > 0) {
      try {
        const texts = [query.trim().slice(0, 500), ...active.map(m => m.memory.slice(0, 300))];
        const embRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          signal: AbortSignal.timeout(5000),
          headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
        });
        if (embRes.ok) {
          const embData = await embRes.json();
          const queryVec = embData.data[0].embedding;
          const cosine = (a, b) => {
            let dot = 0, na = 0, nb = 0;
            for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
            return dot / (Math.sqrt(na) * Math.sqrt(nb));
          };
          const withSim = active.map((m, i) => ({
            ...m, _semScore: cosine(queryVec, embData.data[i + 1].embedding),
          }));
          withSim.sort((a, b) => b._semScore - a._semScore);
          // Always include top preference_memory if semantically relevant
          const prefs  = withSim.filter(m => m.memory_type === "preference_memory" && m._semScore > 0.25).slice(0, 1);
          const others = withSim.filter(m => m.memory_type !== "preference_memory").slice(0, 2);
          return [...prefs, ...others].slice(0, 3);
        }
      } catch { /* fall through to keyword scoring */ }
    }

    // ── Fallback: keyword overlap + type-intent affinity ────────────────────
    const TYPE_PRIORITY = {
      procedural:          ["task_memory", "context_memory", "preference_memory"],
      confused_procedural: ["task_memory", "context_memory", "preference_memory"],
      recommendation:      ["preference_memory", "context_memory", "task_memory"],
      brainstorming:       ["preference_memory", "context_memory", "task_memory"],
      confused:            ["context_memory", "task_memory", "preference_memory"],
      factual:             ["context_memory", "preference_memory", "task_memory"],
    };
    const priority = TYPE_PRIORITY[intentPrimary] ?? TYPE_PRIORITY.factual;
    const queryWords = new Set(
      query.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    );
    const scored = active.map(m => {
      const type = m.memory_type || "context_memory";
      const typeScore = (2 - priority.indexOf(type)) * 1.5;
      const memWords = m.memory.toLowerCase().split(/\s+/);
      const overlap = Math.min(memWords.filter(w => queryWords.has(w)).length, 2);
      return { ...m, _score: typeScore + overlap };
    });
    scored.sort((a, b) => b._score - a._score);

    const prefs   = scored.filter(m => (m.memory_type || "") === "preference_memory").slice(0, 1);
    const others  = scored.filter(m => (m.memory_type || "") !== "preference_memory").slice(0, 2);
    const result  = [...prefs, ...others].slice(0, 3);
    return result;
  } catch {
    return [];
  }
}

/* ── Background: Extract & save memories from conversation ── */
async function extractAndSaveMemories(userId, conversation, apiKey) {
  try {
    const MAX_MEMORIES = 25;
    const supabase = getAdminClient();
    if (!supabase) return;

    // Analyse last 10 messages for richer context
    const recent = conversation.slice(-10);
    const convText = recent
      .map(m => `${m.role === "user" ? "User" : "AINA"}: ${m.content.slice(0, 600)}`)
      .join("\n");

    // Fetch existing memories for deduplication context
    const { data: existingMems } = await supabase
      .from("user_memories")
      .select("id, memory, memory_type, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);
    const existingText = (existingMems ?? []).map(m => `[${m.memory_type}] ${m.memory}`).join("\n");

    const extractionPrompt = `Kamu adalah sistem ekstraksi memori untuk asisten AI bernama AINA (untuk mahasiswa Indonesia di Mesir).

Ekstrak fakta penting tentang user dari percakapan ini untuk diingat di masa depan.

Output: JSON array. Format setiap item: { "memory": "teks singkat", "type": "kategori", "long_term": true/false }

KATEGORI:
- preference_memory: Cara/gaya user ingin berinteraksi ("prefer jawaban singkat", "suka format langkah-langkah", "minta selalu kasih contoh"). long_term=true.
- context_memory: Fakta permanen/semi-permanen tentang diri user ("tinggal di Hay Asyir", "baru tiba Maret 2026", "jurusan Syariah", "asal Surabaya", "paspor mau habis April"). long_term=false.
- task_memory: Tugas/proses yang SEDANG AKTIF dikerjakan user. WAJIB sertakan progress jika ada ("sedang urus iqomah — sudah registrasi online, tinggal upload dokumen", "lagi cari kos di Hay Asyir budget 1500 EGP", "mau ujian nahwu minggu ini"). long_term=false.

ATURAN:
1. Tangkap FAKTA IMPLISIT juga — jika user jelas berada di tengah suatu proses (bertanya detail langkah 3 dari iqomah, dll.), catat sebagai task_memory meski tidak eksplisit berkata "sedang urus".
2. Untuk task_memory: jika ada sinyal progress ("sudah", "selesai", "tinggal", "belum sampai", "stuck di"), sertakan info itu dalam teks memory.
3. Jangan simpan hal generik ("user mahasiswa di Mesir") — harus spesifik dan berguna.
4. Tidak ada info sensitif (nomor dokumen, kata sandi, PIN, finansial detail).
5. Maksimal 5 item baru per percakapan.
6. Setiap memory max 150 karakter.
7. Jika memory SANGAT MIRIP dengan yang sudah ada, skip (jangan duplikasi).
8. Jika tidak ada fakta baru → kembalikan [].
9. Balas HANYA dengan JSON array, tidak ada teks lain.

Memori yang sudah tersimpan (jangan duplikasi):
${existingText || "(belum ada)"}

Percakapan yang dianalisis:
${convText}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let newMemories = [];

    try {
      // Upgrade from llama-3.2-3b to gemini-2.0-flash-001 for better JSON accuracy
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://aina.replit.app",
          "X-Title": "AINA - Memory Extraction",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          messages: [{ role: "user", content: extractionPrompt }],
          max_tokens: 600,
          temperature: 0.1,
        }),
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        console.warn(`[memory] extraction API error: ${response.status}`);
        return;
      }
      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content?.trim() ?? "[]";
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return;
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return;
      const VALID_TYPES = new Set(["preference_memory", "context_memory", "task_memory"]);
      newMemories = parsed
        .filter(m => m && typeof m === "object" && typeof m.memory === "string" && m.memory.trim().length > 5)
        .map(m => ({
          memory: m.memory.trim().slice(0, 150),
          memory_type: VALID_TYPES.has(m.type) ? m.type : "context_memory",
          is_long_term: m.type === "preference_memory" ? true : !!m.long_term,
        }))
        .slice(0, 5);
    } catch {
      clearTimeout(timeoutId);
      return;
    }

    if (newMemories.length === 0) return;

    // Evict oldest non-long-term memories if we'd exceed cap
    const { data: existing } = await supabase
      .from("user_memories")
      .select("id, is_long_term")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    const currentCount = existing?.length ?? 0;
    const toDelete = currentCount + newMemories.length - MAX_MEMORIES;
    if (toDelete > 0 && existing) {
      // Evict oldest non-long-term first, then long-term as last resort
      const evictable = existing.filter(m => !m.is_long_term);
      const idsToDelete = evictable.slice(0, toDelete).map(m => m.id);
      if (idsToDelete.length > 0) await supabase.from("user_memories").delete().in("id", idsToDelete);
    }

    await supabase.from("user_memories").insert(
      newMemories.map(m => ({ user_id: userId, memory: m.memory, memory_type: m.memory_type, is_long_term: m.is_long_term }))
    );
    console.log(`[memory] saved ${newMemories.length} new memories for ${userId.slice(0, 8)}: ${JSON.stringify(newMemories.map(m => m.memory))}`);
  } catch (e) {
    console.warn("[memory] extraction error:", e.message);
  }
}

/* ── Health check ────────────────────────────────────── */
app.get("/api/ping", (_req, res) => res.json({ status: "ok" }));

// Detailed health — returns uptime, memory, and service config status.
// Public (no auth needed) so uptime monitors can use it.
app.get("/api/health", (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: "ok",
    uptime_seconds: Math.floor(process.uptime()),
    memory_mb: {
      rss:       Math.round(mem.rss       / 1024 / 1024),
      heap_used: Math.round(mem.heapUsed  / 1024 / 1024),
      heap_total:Math.round(mem.heapTotal / 1024 / 1024),
    },
    services: {
      supabase:   !!process.env.SUPABASE_URL,
      openrouter: !!process.env.OPENROUTER_API_KEY,
      perplexity: !!process.env.PERPLEXITY_API_KEY,
      openai:     !!process.env.OPENAI_API_KEY,
      resend:     !!process.env.RESEND_API_KEY,
      google_maps:!!process.env.GOOGLE_MAPS_API_KEY,
    },
    timestamp: new Date().toISOString(),
  });
});


/* ── Debug endpoint — diagnose Vercel deployment issues ─ */
app.get("/api/debug", async (_req, res) => {
  const env = {
    SUPABASE_URL:           !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE:  !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENROUTER_API_KEY:     !!process.env.OPENROUTER_API_KEY,
    PERPLEXITY_API_KEY:     !!process.env.PERPLEXITY_API_KEY,
    MASTER_ADMIN_IDS:       !!process.env.MASTER_ADMIN_IDS,
    VITE_SUPABASE_URL:      !!process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_KEY:      !!process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  let supabaseOk = false;
  let supabaseErr = null;
  try {
    const sb = getAdminClient();
    if (sb) {
      const { error } = await sb.from("profiles").select("id").limit(1);
      supabaseOk = !error;
      if (error) supabaseErr = error.message;
    }
  } catch (e) { supabaseErr = e.message; }

  const engineFiles = [
    "promptBuilder.js", "responseFormatter.js", "historyOptimizer.js",
    "sourceOrchestrator.js", "contextDetector.js", "queryExpander.js",
    "embedder.js", "intentDetector.js",
  ];
  const engineOk = {};
  for (const f of engineFiles) {
    try {
      await import(`./engine/${f}`);
      engineOk[f] = true;
    } catch (e) {
      engineOk[f] = e.message;
    }
  }

  res.json({
    status: "debug",
    node: process.version,
    platform: process.platform,
    env,
    supabase: { ok: supabaseOk, error: supabaseErr },
    engine: engineOk,
    uptime: Math.floor(process.uptime()),
  });
});

/* ── Chat Pipeline Self-Test (no auth needed) ─────────── */
app.get("/api/chat-test", async (_req, res) => {
  const results = {};
  const MASTER_ID = [...MASTER_ADMIN_IDS][0] || "unknown";
  const supabase  = getAdminClient();

  // 1. Supabase connection
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    results.supabase = error ? `FAIL: ${error.message}` : "OK";
  } catch (e) { results.supabase = `THROW: ${e.message}`; }

  // 2. user_roles query
  try {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", MASTER_ID);
    results.user_roles = error ? `FAIL: ${error.message}` : `OK (${data?.length} rows)`;
  } catch (e) { results.user_roles = `THROW: ${e.message}`; }

  // 3. messages count
  try {
    const { count, error } = await supabase.from("messages").select("*", { count: "exact", head: true }).eq("user_id", MASTER_ID);
    results.messages_count = error ? `FAIL: ${error.message}` : `OK (count=${count})`;
  } catch (e) { results.messages_count = `THROW: ${e.message}`; }

  // 4. knowledge_base
  try {
    const { data, error } = await supabase.from("knowledge_base").select("id, title").limit(3);
    results.knowledge_base = error ? `FAIL: ${error.message}` : `OK (${data?.length} rows)`;
  } catch (e) { results.knowledge_base = `THROW: ${e.message}`; }

  // 5. pinned_updates
  try {
    const { data, error } = await supabase.from("pinned_updates").select("topic").eq("active", true).limit(3);
    results.pinned_updates = error ? `FAIL: ${error.message}` : `OK (${data?.length} rows)`;
  } catch (e) { results.pinned_updates = `THROW: ${e.message}`; }

  // 6. user_memories
  try {
    const { data, error } = await supabase.from("user_memories").select("id").eq("user_id", MASTER_ID).limit(5);
    results.user_memories = error ? `FAIL: ${error.message}` : `OK (${data?.length} rows)`;
  } catch (e) { results.user_memories = `THROW: ${e.message}`; }

  // 7. Engine functions
  try {
    const ctx   = detectMasisirContext("Halo");
    const exp   = expandQuery("Halo", ctx);
    const int   = detectIntent("Halo");
    const hint  = buildIntentHint(int);
    const style = detectResponseStyle(int.primary);
    results.engine_functions = `OK (intent=${int.primary})`;
  } catch (e) { results.engine_functions = `THROW: ${e.message}`; }

  // 8. fetchRelevantArticles
  try {
    const arts = await fetchRelevantArticles("halo", "casual");
    results.fetch_articles = `OK (${arts.length} articles)`;
  } catch (e) { results.fetch_articles = `THROW: ${e.message}`; }

  // 9. fetchPinnedUpdates
  try {
    const pins = await fetchPinnedUpdates();
    results.fetch_pinned = `OK (${pins.length} items)`;
  } catch (e) { results.fetch_pinned = `THROW: ${e.message}`; }

  // 10. fetchUserMemories
  try {
    const mems = await fetchUserMemories(MASTER_ID, "Halo", "casual");
    results.fetch_memories = `OK (${mems.length} items)`;
  } catch (e) { results.fetch_memories = `THROW: ${e.message}`; }

  // 11. buildSystemPrompt
  try {
    const todayStr = new Date().toLocaleDateString("id-ID", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
    const intent   = detectIntent("Halo");
    const intentHint = buildIntentHint(intent);
    const style    = detectResponseStyle(intent.primary);
    const hint     = buildResponseStyleHint(style);
    const prompt   = buildSystemPrompt({
      todayStr, intentHint, intentPrimary: intent.primary,
      confidence: { level: "sedang", hint: "" },
      answerModeHint: hint,
      pinnedContext: "", memoryContext: "", personalizationContext: "",
      knowledgeContext: "", exchangeContext: null, dorarContext: null,
      perplexityContext: null, wikiContext: null, ddgContext: null,
      sourceMeta: { trust: "Sedang", label: "Pengetahuan AINA", retrieved_at: null },
    });
    results.build_system_prompt = `OK (${prompt.length} chars)`;
  } catch (e) { results.build_system_prompt = `THROW: ${e.message}`; }

  // 12. OpenRouter connectivity
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const r = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    results.openrouter_connectivity = r.ok ? `OK (${r.status})` : `FAIL (${r.status})`;
  } catch (e) { results.openrouter_connectivity = `THROW: ${e.message}`; }

  const allOk = Object.values(results).every(v => v.startsWith("OK"));
  res.json({ status: allOk ? "PASS" : "FAIL", results });
});

/* ── Current user info (role, master admin status) ───── */
app.get("/api/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Unauthorized" });

  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const roleList = roles?.map(r => r.role) ?? ["user"];
  const isAdmin = roleList.includes("admin");
  const isMasterAdmin = isAdmin && isMasterAdminId(user.id);

  // Debug line removed — was leaking user email in every request log

  const payload = { id: user.id, email: user.email, roles: roleList };
  if (isMasterAdmin) payload.isMasterAdmin = true;
  res.json(payload);
});

/* ── Whoami (UUID + email for the authenticated user) ─── */
app.get("/api/whoami", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Unauthorized" });

  res.json({ uuid: user.id, email: user.email });
});

/* ── Bootstrap: Claim Admin (only works if no admin exists yet) ── */
app.post("/api/setup/claim-admin", strictLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login dulu" });
  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Token tidak valid" });

  // Only allow if NO admin exists in the system
  const { data: existingAdmins } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1);

  if (existingAdmins && existingAdmins.length > 0) {
    return res.status(403).json({ error: "Admin sudah ada. Endpoint ini hanya untuk setup pertama kali." });
  }

  // Upsert admin role for this user
  const { error: upsertErr } = await supabase.from("user_roles").upsert(
    { user_id: user.id, role: "admin" },
    { onConflict: "user_id,role" }
  );

  if (upsertErr) {
    console.error("[claim-admin] upsert error:", upsertErr);
    return res.status(500).json({ error: "Gagal set role admin: " + upsertErr.message });
  }

  console.log(`[claim-admin] ${user.email} (${user.id}) berhasil jadi admin pertama`);
  res.json({ success: true, message: `${user.email} sekarang jadi admin!`, uuid: user.id });
});


/**
 * Extracts the last-mentioned place name from conversation history.
 * Scans the last few assistant messages for:
 *  - 📍 location marker (from AINA's auto-maps instruction)
 *  - Maps URL patterns
 *  - Common location name patterns
 * Returns { name, area } or null.
 */
function extractLocationFromHistory(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  // Scan last 6 messages (3 exchanges) from the end, preferring assistant messages
  const recent = messages.slice(-8).reverse();

  for (const msg of recent) {
    if (msg.role !== "assistant") continue;
    const content = typeof msg.content === "string" ? msg.content : "";

    // Pattern 1: 📍 PLACE NAME from AINA's location instruction
    const mapsIconMatch = content.match(/📍\s*([^\](\n]+?)(?:\]|\(|$)/m);
    if (mapsIconMatch) {
      const rawName = mapsIconMatch[1].trim();
      const area = extractCairoArea(rawName, content);
      return { name: rawName, area };
    }

    // Pattern 2: markdown link [📍 PLACE](maps-url)
    const mdLinkMatch = content.match(/\[📍\s*([^\]]+)\]\(https?:\/\/[^)]+\)/);
    if (mdLinkMatch) {
      const rawName = mdLinkMatch[1].trim();
      const area = extractCairoArea(rawName, content);
      return { name: rawName, area };
    }

    // Pattern 3: Google Maps search URL with query param
    const mapsSearchMatch = content.match(/maps\.search\/\?api=1&query=([^)"\s]+)/);
    if (mapsSearchMatch) {
      const rawName = decodeURIComponent(mapsSearchMatch[1].replace(/\+/g, " "))
        .replace(/\s*Cairo\s*Egypt\s*/gi, "").trim();
      const area = extractCairoArea(rawName, content);
      return { name: rawName, area };
    }

    // Pattern 4: google.com/maps with place reference
    const gmapsMatch = content.match(/google\.com\/maps\/place\/([^/"]+)/);
    if (gmapsMatch) {
      const rawName = decodeURIComponent(gmapsMatch[1].replace(/\+/g, " ")).trim();
      const area = extractCairoArea(rawName, content);
      return { name: rawName, area };
    }
  }

  // Pattern 5: look in recent USER messages — hay/area keywords first, then general place nouns
  for (const msg of recent) {
    if (msg.role !== "user") continue;
    const content = typeof msg.content === "string" ? msg.content : "";

    // 5a. Try CAIRO_AREAS keyword match directly in user message
    const areaMatch = detectAreasInQuery(content);
    if (areaMatch.length > 0) {
      return { name: areaMatch[0].area, area: areaMatch[0].area };
    }

    // 5b. Proper noun after preposition (capitalised words)
    const placeMatch = content.match(/(?:ke|di|menuju|lokasi|tempat|kantor|sekretariat)\s+([A-Z][A-Za-z\s]{2,40})/);
    if (placeMatch) {
      const rawName = placeMatch[1].trim();
      return { name: rawName, area: extractCairoArea(rawName, content) };
    }
  }

  return null;
}

/**
 * Canonical Masisir Cairo area registry.
 * Each entry has:
 *  - area  : canonical display name
 *  - key   : short ID used in transport context lookup
 *  - kw    : lowercase keyword variants (Indonesian slang, Arabic romanisation, numerals, etc.)
 */
const CAIRO_AREAS = [
  // ─── Nasr City Hay districts (most Masisir) ───────────────────────────────
  {
    area: "Hay Asyir (حي العاشر) — Nasr City Distrik 10", key: "hay_asyir",
    kw: ["hay asyir","hay asher","hay 'asher","hay 'asyir","hay ashir","hay 'ashir","hay عاشر","حي العاشر","hay 10","h10","madinah nasr 10","nasr 10","alf maskan","alif maskan","الف مسكن","ألف مسكن","city stars","carrefour nasr","citystars"],
  },
  {
    area: "Hay Sabi (حي السابع) — Nasr City Distrik 7", key: "hay_sabi",
    kw: ["hay sabi","hay sabe3","hay sabe'","hay sabe","hay sabea","hay السابع","حي السابع","hay 7","h7","nasr 7","madinah nasr 7","district 7 nasr"],
  },
  {
    area: "Hay Thamin (حي الثامن) — Nasr City Distrik 8", key: "hay_thamin",
    kw: ["hay thamin","hay thamane","hay tamane","hay thamanya","hay الثامن","حي الثامن","hay 8","h8","nasr 8","madinah nasr 8","district 8","hay thmn"],
  },
  {
    area: "Hay Tasi (حي التاسع) — Nasr City Distrik 9", key: "hay_tasi",
    kw: ["hay tasi","hay tasi'","hay tase","hay التاسع","حي التاسع","hay 9","h9","nasr 9","madinah nasr 9","district 9","ninth district nasr"],
  },
  {
    area: "Hay Sadis (حي السادس) — Nasr City Distrik 6", key: "hay_sadis",
    kw: ["hay sadis","hay sadess","hay السادس","حي السادس","hay 6","h6","nasr 6","madinah nasr 6","district 6 nasr"],
  },
  {
    area: "Hay Khamis (حي الخامس) — Nasr City Distrik 5", key: "hay_khamis",
    kw: ["hay khamis","hay الخامس","حي الخامس","hay 5","h5","nasr 5","madinah nasr 5"],
  },
  {
    area: "Nasr City / Madinah Nasr (umum)", key: "nasr_city",
    kw: ["nasr city","madinah nasr","madina nasr","مدينة نصر","hay nasr","nasr"],
  },
  // ─── Al-Azhar / Darrasah belt ──────────────────────────────────────────────
  {
    area: "Darrasah / Bawwabat / Al-Azhar", key: "darrasah",
    kw: ["darrasah","drasah","ad-darrasah","الدراسة","bawwabat","البوابات","bab al-futuh","bab alfutuh","hussein","al-husein","al-husain","azhar park","azhar","al-azhar","azhar university","univ azhar","kampus azhar","kuliah azhar","kulliyah","koliyah","darrasah square","midan hussein"],
  },
  {
    area: "Abbasiyya (عباسية) — Hub Transportasi Utama", key: "abbasiyya",
    kw: ["abbasiyya","abbassia","abbasyia","abbasiyah","abbasiya","عباسية","terminal abbasiyya","stasiun abbasiyya","metro abbasiyya"],
  },
  // ─── Other Masisir-relevant areas ─────────────────────────────────────────
  {
    area: "Dokki — KBRI Kairo", key: "dokki",
    kw: ["dokki","doqqi","duqqi","دقي","dukki"],
  },
  {
    area: "Zamalek", key: "zamalek",
    kw: ["zamalek","zamaalik","الزمالك"],
  },
  {
    area: "Mohandessin / Muhandiseen", key: "mohandessin",
    kw: ["mohandessin","muhandiseen","muhandissin","المهندسين","mohandissin"],
  },
  {
    area: "Maadi", key: "maadi",
    kw: ["maadi","ma'adi","المعادي"],
  },
  {
    area: "Heliopolis / Masr el-Gedida", key: "heliopolis",
    kw: ["heliopolis","masr el gedida","masr al-jadida","مصر الجديدة","nuzha","el-nuzha","sity","heliopolis cairo"],
  },
  {
    area: "Ain Shams", key: "ain_shams",
    kw: ["ain shams","ayn shams","عين شمس","ein shams"],
  },
  {
    area: "Shubra", key: "shubra",
    kw: ["shubra","شبرا"],
  },
  {
    area: "Ramsis / Downtown Cairo / Tahrir", key: "downtown",
    kw: ["ramsis","ramses","رمسيس","downtown","wust al-balad","وسط البلد","tahrir","التحرير","mubarak","مبارك","midan tahrir"],
  },
  {
    area: "Faisal / Giza / Haram", key: "giza",
    kw: ["faisal","فيصل","giza","الجيزة","al-giza","haram","الهرم","pyramids","piramida","piramid","el-haram"],
  },
  {
    area: "Agouza / Ard el-Lewa", key: "agouza",
    kw: ["agouza","aguza","عجوزة","ard el-lewa","ard lewa"],
  },
  {
    area: "Hadaiq al-Qubba", key: "hadaiq",
    kw: ["hadaiq","hadayiq","حدائق القبة","hadaiq al-qubba"],
  },
  {
    area: "KBRI Kairo (Dokki)", key: "kbri",
    kw: ["kbri","kedutaan indonesia","kedutaan besar","kbri kairo","kbri mesir","konsulat","pbnu","pcinu mesir"],
  },
  {
    area: "Mansoura", key: "mansoura",
    kw: ["mansoura","mansoorah","mansura","المنصورة"],
  },
  {
    area: "Alexandria / Iskandariyah", key: "alexandria",
    kw: ["alexandria","alexandria egypt","iskandaria","iskandariyah","الإسكندرية","alex"],
  },
];

/**
 * Try to determine the Cairo area/district from a place name or surrounding text.
 * Returns the canonical area name string or null.
 */
function extractCairoArea(name, surroundingText) {
  const combined = (name + " " + (surroundingText || "")).toLowerCase();
  for (const { area, kw } of CAIRO_AREAS) {
    if (kw.some(k => combined.includes(k))) return area;
  }
  return null;
}

/**
 * Detect whether a user query is about transport / getting around Cairo.
 * Used to decide whether to inject the Cairo transport context block.
 */
function isTransportQuery(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  const TRANSPORT_KEYWORDS = [
    // modes
    "metro", "subway", "kereta", "bus", "bis", "mikrobus", "minibus",
    "taksi", "taxi", "uber", "careem", "otobus", "angkutan",
    // action/direction
    "naik apa", "pergi ke", "ke sana", "cara ke", "rute", "route",
    "jalur", "jalan ke", "menuju", "dari mana", "mau ke", "mau pergi",
    "transportasi", "transport", "angkot", "kendaraan",
    // places implying travel
    "bandara", "airport", "stasiun", "terminal", "pelabuhan",
    // asking about trip
    "berapa lama", "berapa menit", "berapa jam", "perjalanan",
    "ongkos", "tarif", "biaya perjalanan", "tiket metro",
  ];
  return TRANSPORT_KEYWORDS.some(kw => t.includes(kw));
}

/**
 * Detect which specific Cairo area(s) are mentioned directly in a user query.
 * Returns array of matched area objects (with key + area name).
 */
function detectAreasInQuery(text) {
  const t = text.toLowerCase();
  const found = [];
  for (const entry of CAIRO_AREAS) {
    if (entry.kw.some(k => t.includes(k))) {
      if (!found.find(f => f.key === entry.key)) found.push(entry);
    }
  }
  return found;
}

/**
 * Build a Cairo transportation guide context block.
 * Injected when a transport follow-up query is detected.
 * @param {object|null} locationHint   - { name, area } from conversation history
 * @param {Array}       detectedAreas  - areas detected directly in the current query
 */
function buildCairoTransportContext(locationHint, detectedAreas = []) {
  // Build location header
  let locationSection = "";
  if (detectedAreas.length > 0) {
    const names = detectedAreas.map(a => a.area).join(", ");
    locationSection = `\n\n**Area yang disebutkan dalam pertanyaan ini:** ${names}\nFokuskan panduan transportasi pada rute yang melibatkan area tersebut.`;
  } else if (locationHint) {
    locationSection = `\n\n**Destinasi dari konteks percakapan:** ${locationHint.name}${locationHint.area ? ` (area: ${locationHint.area})` : ""}\nGunakan info area ini untuk mencocokkan rute yang paling relevan dari panduan di bawah.`;
  } else {
    locationSection = `\n\n**Catatan:** Area tujuan tidak terdeteksi — gunakan konteks percakapan sebelumnya untuk mengidentifikasi tujuan user, atau tanyakan balik.`;
  }

  return `\n\n---\n## 🚇 Panduan Transportasi Kairo Lengkap untuk Masisir\n${locationSection}

**INSTRUKSI AINA:** Berikan rute spesifik berdasarkan area yang disebutkan. Prioritaskan rute dari/ke area Masisir (Hay Asyir, Hay Sabi, Darrasah, Abbasiyya). Selalu sebutkan ≥2 opsi. Selalu rekomendasikan Uber/Careem sebagai opsi termudah.

---
### 🗺️ Metro Kairo — 3 Jalur Utama
| Jalur | Nama | Rute | Stasiun Kunci Masisir |
|-------|------|------|-----------------------|
| **Line 1** | Merah | Helwan ↔ New El-Marg | **Ramsis/Mubarak**, **Abbasiyya**, Ain Shams, Hadaiq al-Qubba |
| **Line 2** | Kuning | Shubra ↔ El-Mounib | Shubra, Attaba, **Sadat/Tahrir**, Opera, **Dokki**, Cairo University |
| **Line 3** | Biru | Adly Mansour ↔ Kit Kat | Airport (Adly Mansour), **Stadium (Hay Asyir terdekat)**, Attaba, Maspero, Imbaba |
- **Transfer:** Sadat (Tahrir) = Line 1 ↔ 2 · Attaba = Line 2 ↔ 3
- Tiket: 8–15 EGP · Jam: 05.00–24.00 · Tidak ada AC di Line 1 gerbong lama

---
### 🏘️ Peta Area Masisir — Nasr City (Madinah Nasr)

Nasr City terbagi menjadi hay (distrik) bernomor. Urutan dari barat ke timur kurang lebih:
**Abbasiyya** → Hay Sadis (6) → Hay Sabi (7) → Hay Thamin (8) → Hay Tasi (9) → **Hay Asyir (10)** → Alf Maskan / Kasih (pinggiran)

| Hay | Nama Arab | Nomor | Patokan Populer |
|-----|-----------|-------|-----------------|
| Hay Asyir | حي العاشر | Distrik 10 | City Stars Mall, Carrefour Nasr City, Alf Maskan |
| Hay Tasi | حي التاسع | Distrik 9 | Antara Hay Thamin dan Hay Asyir |
| Hay Thamin | حي الثامن | Distrik 8 | Asrama putri Al-Azhar, Hay Thamin Mosque |
| Hay Sabi | حي السابع | Distrik 7 | Hay Sabi Mosque, Sabi Market |
| Hay Sadis | حي السادس | Distrik 6 | Paling dekat Abbasiyya |

---
### 🛤️ Rute Spesifik Masisir

**🔵 Dari Hay Asyir / Alf Maskan → Darrasah / Bawwabat (Kampus Al-Azhar):**
- **Mikrobus (termurah, 3-5 EGP):** Naik mikrobus dari depan City Stars atau Carrefour Nasr City arah *"Abbasiyya"* → di Abbasiyya pindah mikrobus arah *"Darrasah"* / *"Husein"* / *"Bab al-Futuh"* → turun di Bawwabat atau Midan Husein. Total ~40-60 menit.
- **Metro Line 3 (35-45 mnt, 10 EGP):** Dari stasiun Stadium (paling dekat Hay Asyir) → Line 3 arah Kit Kat → turun Attaba → jalan kaki 15 menit atau tuktuk ke Darrasah. *(Catatan: tidak ada stasiun metro langsung di Darrasah)*
- **Uber/Careem (35-55 EGP, 25-40 mnt):** Paling nyaman, khusus jam tidak macet (hindari 08.00-10.00 dan 16.00-19.00).
- **Tuktuk lokal:** Dari Hay Asyir ke Abbasiyya ~10 EGP, lanjut tuktuk/mikrobus ke Darrasah.

**🔵 Dari Hay Sabi → Darrasah / Bawwabat:**
- **Mikrobus:** Dari Hay Sabi → arah *"Abbasiyya"* (lebih dekat dari Hay Asyir, ~20 mnt) → pindah ke mikrobus *"Darrasah/Husein"*.
- **Metro:** Hay Sabi lebih dekat ke Abbasiyya → Line 1 dari Abbasiyya arah Ramsis/Tahrir.
- **Uber/Careem:** ~30-45 EGP dari Hay Sabi ke Darrasah.

**🔵 Dari Hay Thamin → Darrasah:**
- Rute sama seperti Hay Sabi, jarak ke Abbasiyya sedikit lebih jauh.
- Mikrobus: arah Abbasiyya → lanjut ke Darrasah. Total ~50 menit.

**🔵 Antar-Hay Nasr City (Hay Asyir ↔ Hay Sabi ↔ Hay Thamin ↔ Hay Tasi):**
- **Mikrobus internal:** Ada jalur mikrobus yang melintas sepanjang Nasr City (3-4 EGP). Sebutkan nama hay tujuan ke sopir.
- **Tuktuk:** Antar hay yang berdekatan 5-15 EGP, cepat dan mudah ditemukan.
- **Jalan kaki:** Hay yang berdekatan (misal Hay Thamin ke Hay Tasi) bisa ditempuh 15-25 menit jalan kaki.

**🔵 Dari Hay Asyir / Nasr City → KBRI Kairo (Dokki):**
- **Metro Line 1 + 2:** Dari Abbasiyya → Line 1 ke Sadat (Tahrir) → Line 2 ke Stasiun Dokki. Total ~50-60 menit, 10-15 EGP.
- **Uber/Careem:** 60-90 EGP, 40-60 menit (tergantung macet — hindari jam puncak!).
- **Rute metro detail:** Abbasiyya (L1) → Ramsis → Sadat → Opera → Dokki.

**🔵 Dari Darrasah / Abbasiyya → Downtown (Ramsis / Tahrir):**
- **Metro Line 1:** Abbasiyya → Ramsis (Mubarak) = 2 stasiun, ~8 menit, 8 EGP.
- **Mikrobus:** Dari Darrasah arah *"Ramsis"* atau *"Attaba"* = langsung, 2-3 EGP.
- **Jalan kaki:** Darrasah ke Attaba ±20-25 menit.

**🔵 Dari Nasr City → Heliopolis / Masr el-Gedida:**
- **Mikrobus:** Dari Hay Asyir arah *"Heliopolis"* atau *"Nadi el-Shams"*. ~30-40 menit.
- **Metro Line 3:** Dari Stadium ke arah Adly Mansour, turun di stasiun Heliopolis (Al-Ahram / Cairo Stadium). 15-20 menit.

**🔵 Dari Nasr City → Ain Shams:**
- **Metro Line 1:** Dari Abbasiyya ke Ain Shams = 3 stasiun, ~12 menit.
- **Mikrobus:** Dari Hay Asyir arah Abbasiyya → lanjut ke Ain Shams.

**🔵 Dari Nasr City → Giza / Haram / Faisal:**
- **Metro:** Abbasiyya → Line 1 ke Sadat → Line 2 ke Cairo University atau El-Mounib. Dari El-Mounib naik mikrobus ke Haram. Total ~70-80 menit.
- **Uber/Careem:** 80-120 EGP, disarankan untuk jarak jauh ini.

---
### 💡 Panduan Umum Mikrobus Kairo untuk Masisir
- **Cara naik:** Berdiri di tepi jalan, lambaikan tangan, sebutkan tujuan ke sopir saat ada yang berhenti.
- **Bayar:** Umumnya 3-6 EGP, bayar langsung ke sopir atau kenek.
- **Turun:** Bilang *"هنا"* (hena = sini) atau ketuk pintu/dinding.
- **Kata kunci arah penting:**
  - Ke Darrasah: *"Darrasah"* / *"Husein"* / *"Bawwabat"*
  - Ke Abbasiyya: *"Abbasiyya"* / *"عباسية"*
  - Ke Ramsis: *"Ramsis"* / *"Attaba"*
  - Ke Tahrir: *"Tahrir"* / *"Sadat"*
  - Ke Hay Asyir: *"Hay Asyir"* / *"City Stars"* / *"Alf Maskan"*

### 🚖 Tarif Referensi Uber/Careem (2025, perkiraan)
| Rute | Estimasi Harga | Estimasi Waktu |
|------|---------------|----------------|
| Hay Asyir ↔ Darrasah | 35–55 EGP | 25–40 menit |
| Hay Sabi ↔ Darrasah | 30–45 EGP | 20–35 menit |
| Nasr City ↔ Dokki (KBRI) | 60–90 EGP | 40–60 menit |
| Nasr City ↔ Tahrir/Ramsis | 40–65 EGP | 30–50 menit |
| Nasr City ↔ Heliopolis | 25–40 EGP | 20–30 menit |
| Nasr City ↔ Giza/Haram | 80–120 EGP | 50–70 menit |
*Harga naik 1.5–2x saat jam macet (08–10 dan 16–19).*

### ⚠️ Tips Wajib Masisir
1. **Uber/Careem** — install keduanya, bandingkan harga sebelum order.
2. **Hindari jam macet Kairo** — 07.30-10.00 dan 15.30-19.30 (bisa 2–3x lebih lama).
3. **Screenshot peta tujuan** — untuk tunjukkan ke sopir mikrobus/tuktuk yang tidak paham bahasa non-Arab.
4. **Tanya senior Masisir** — rute mikrobus berubah-ubah, senior yang tinggal di hay yang sama paling tahu.
5. **Maps.me offline** — download peta Kairo untuk navigasi tanpa internet.
---`;
}

/* ── Intent detection (rule-based, no LLM call) ─────── */
function detectIntent(text) {
  const t = text.toLowerCase().trim();

  // Casual tone flag — keyword-based only, no length check
  const isCasual = /\b(dong|deh|nih|btw|wkwk|haha|hehe|sih|loh|lho|gitu|gitu ya|ya kan|nggak sih|gak sih)\b/.test(t);

  // Arabic word-by-word analysis (makna perkata, mufradat, i'rab tahlili)
  // Detected BEFORE arabic_writing so it takes priority
  const isArabicAnalysis =
    /\bper\s?kata\b/.test(t) ||                                           // "perkata" / "per kata"
    /\b(makna|arti|terjemah(kan)?)\s+(tiap|setiap)\s+kata\b/.test(t) ||  // "makna tiap kata"
    /\b(mufradat|mufrodat)\b/.test(t) ||                                  // "mufradat"
    /\bi.?rab\s+(tahlili|kalimat|kata)\b/.test(t) ||                      // "i'rab tahlili/kalimat"
    /معنى كل كلمة|كلمة بكلمة|المفردات/.test(text);                         // Arabic: "makna tiap kata"

  // Arabic academic writing — two detection paths:
  // Path A: user types in Arabic script + uses Arabic writing/task commands
  const hasArabicScript = /[\u0600-\u06FF]/.test(text);
  const hasArabicWritingKw = /(إنشاء|اكتب|كتابة|تلخيص|لخّص|لخص|خلاصة|شرح|اشرح|فسّر|فسر|قواعد|نحو|صرف|ترجم|ترجمة|تحليل|صياغة|مقالة|بحث|ملخص|وضّح|وضح|عرّف|عرف|اذكر|مقدمة|خاتمة|تعبير|تعريف)/.test(text);

  // Path B: user types in Indonesian but requests Arabic text output
  const hasGenVerb    = /\b(tulis(kan)?|buat(kan|in)?|bikin|buatin|bikinin|terjemah(kan|in)?|nulis(kan)?|cariin contoh|kasih contoh|berikan contoh)\b/.test(t);
  const hasBahasaArab = /\bbahasa arab(ku|nya|mu|kita|kami)?\b/.test(t);
  // Specific Arabic letter request (surat ghaib / i'tidzar)
  const hasArabicLetterReq = hasGenVerb && /\bsurat\b/.test(t) && /\b(ghaib|i.?tidzar|itidzar|ta.?hidzar)\b/.test(t);
  // Arabic grammar keywords in Indonesian
  const hasArabicGrammarKw = /\b(nahwu|sharaf|shorof|nahu|tashrif|isim|fi.?il|fa.?il|huruf jar|mubtada|khabar|naibul fail|masdar|idhafah|idhofa|mudhaf|i.?rab|maf.?ul|sifat maushuf|jumlah fi.?liyah|jumlah ismiyah)\b/.test(t);

  const isArabicWriting =
    !isArabicAnalysis && (                       // never override arabic_analysis
    (hasArabicScript && hasArabicWritingKw) ||   // original: Arabic-script query with writing commands
    (hasGenVerb && hasBahasaArab)            ||   // Indonesian: "tulis/buat + bahasa Arab"
    hasArabicLetterReq                       ||   // Indonesian: "buatin surat ghaib"
    hasArabicGrammarKw                           // Indonesian: nahwu/sharaf/i'rab questions
    );

  // Primary intent signals (evaluated independently before priority resolution)
  const isConfused   = /bingung|galau|khawatir|takut|pusing|stres|stress|overwhelm|nggak tau|tidak tau|ga tau|gak tau|harus mulai dari mana|nggak ngerti|tidak mengerti|susah banget|ribet banget|tolong bantu/.test(t);
  const isProcedural = /\b(cara|bagaimana cara|gimana cara|langkah|prosedur|tahapan|proses|tutorial|panduan|step|caranya|gimana sih cara|ngurus|ngurusin|mendaftar|cara daftar|gimana daftar)\b/.test(t);
  const isRecommend  = /\b(rekomen|rekomendasi|saranin|suggest|yang bagus|yang enak|yang murah|yang terbaik|mending yang mana|pilih yang mana)\b/.test(t);
  const isBrainstorm = /\b(ide|pilihan|opsi|alternatif|apa saja|apa aja|apa yang bisa|bisa apa|ada nggak|ada yang|kira-kira apa)\b/.test(t);

  // Fiqh / Islamic knowledge — detects questions about Islamic rulings, hadith, fiqh, aqidah, etc.
  const isFiqhIntent = !isArabicWriting && !isArabicAnalysis && isFiqhQuery(text);

  // Priority resolution — arabic_analysis > arabic_writing > fiqh > other intents
  let primary;
  if (isArabicAnalysis)           primary = "arabic_analysis";
  else if (isArabicWriting)       primary = "arabic_writing";
  else if (isFiqhIntent)          primary = "fiqh";
  else if (isConfused && isProcedural) primary = "confused_procedural";
  else if (isConfused)            primary = "confused";
  else if (isProcedural)          primary = "procedural";
  else if (isRecommend)           primary = "recommendation";
  else if (isBrainstorm)          primary = "brainstorming";
  else                            primary = "factual";

  return { primary, casual: isCasual };
}

/* ── Partner Promo Detection ─────────────────────────────
 * Detects if the user is asking about VOA Mesir, tiket
 * pesawat, or student visa entry — topics where AINA
 * should recommend Temantiket as a trusted partner.
 * ─────────────────────────────────────────────────────── */
function detectPartnerPromo(query) {
  const t = query.toLowerCase();
  const isTicket = /\b(tiket\s*pesawat|beli\s*tiket|booking\s*tiket|cari\s*tiket|harga\s*tiket|pesan\s*tiket|tiket\s*murah|penerbangan\s*ke\s*mesir|flight\s*ke\s*mesir|tiket\s*pp|tiket\s*pulang\s*pergi|tiket\s*ke\s*kairo|cairo.*tiket|tiket.*cairo|tiket.*kairo|kairo.*tiket)\b/.test(t);
  const isVOA   = /\b(voa|visa\s*on\s*arrival|visa\s*mesir|visa\s*on\s*arrival\s*mesir|voa\s*mesir|tourist\s*visa|visa\s*turis)\b/.test(t);
  const isVisa  = /\b(visa\s*student|student\s*visa|student\s*entry|entry\s*visa|izin\s*masuk|visa\s*pelajar|visa\s*study|visa\s*belajar|student\s*residence|kartu\s*pelajar.*visa|iqama)\b/.test(t);

  if (!isTicket && !isVOA && !isVisa) return null;

  const topics = [];
  if (isTicket) topics.push("tiket pesawat");
  if (isVOA)    topics.push("VOA / visa turis Mesir");
  if (isVisa)   topics.push("visa student / student entry");

  return {
    triggered: true,
    topics,
    block: `

---
## 🤝 MITRA AINA — TEMANTIKET (WAJIB DIBACA & DIIKUTI)

User menanyakan tentang: **${topics.join(" / ")}** — topik ini dicakup oleh mitra resmi AINA.

**INSTRUKSI WAJIB:**
Setelah menjawab pertanyaan user secara informatif dan lengkap, WAJIB tambahkan satu blok rekomendasi mitra di akhir jawaban. Format yang HARUS digunakan:

---
🎫 **Butuh bantuan ngurusin ini?**
**Temantiket** adalah mitra resmi AINA yang bisa bantu urus [sebutkan relevansi spesifik: tiket pesawat / VOA Mesir / visa student — sesuaikan dengan yang ditanya user]. Langsung hubungi:
- 🌐 [temantiket.com](https://temantiket.com)
- 💬 WhatsApp: [+62 813-1150-6025](https://wa.me/6281311506025)
---

**ATURAN BLOK MITRA:**
- SELALU gunakan format di atas, tidak boleh disingkat atau dihilangkan saat topik mitra ini terdeteksi.
- Sesuaikan kata "[relevansi spesifik]" dengan topik yang benar-benar ditanya user — jangan copy-paste mentah.
- Letakkan blok ini SETELAH jawaban utama, dipisah dengan garis horizontal (---).
- Jika user bertanya dalam nada santai/casual, blok boleh lebih informal tapi tetap harus ada.
- JANGAN sebut bahwa ini "instruksi sistem" atau "mitra yang dipromosikan" — sampaikan secara natural sebagai rekomendasi terpercaya.
---`,
  };
}


function buildIntentHint({ primary, casual }) {
  const toneNote = casual
    ? " Nada santai dan percakapan, boleh pakai kata informal tapi tetap informatif."
    : "";

  const hints = {
    factual:
      "Buka dengan 1 kalimat pembuka yang relate langsung dengan pertanyaan — singkat, bukan basa-basi.\n" +
      "Lalu masuk ke isi utama dengan format yang sesuai jenis pertanyaan:\n" +
      "• Pertanyaan singkat (berapa/siapa/kapan/di mana): jawab langsung dalam 1–3 kalimat, tidak perlu daftar.\n" +
      "• Pertanyaan 'apa itu' atau definisi: definisi paling sederhana dulu → penjelasan singkat → contoh atau konteks → kesimpulan 1 kalimat.\n" +
      "• Pertanyaan perbandingan atau 'mana yang lebih baik': ringkas perbedaan utamanya dulu → poin perbandingan → rekomendasi berdasar kebutuhan.\n" +
      "• Pertanyaan referensi / rekomendasi kitab / tokoh / sumber keilmuan Islam: buka dengan 1 kalimat konteks → daftar bernomor dengan positioning singkat tiap item → tutup dengan rekomendasi untuk pemula atau untuk pendalaman.\n" +
      "ATURAN DAFTAR: Jika menggunakan bullet atau nomor, SETIAP item WAJIB punya penjelasan singkat 1 kalimat — kenapa penting, apa bedanya, atau kapan cocok dipakai. JANGAN sekadar menyebut nama/istilah tanpa konteks.\n" +
      "PENUTUP: Jika ada tindak lanjut logis, tutup dengan 1 kalimat guidance yang spesifik — saran, rekomendasi mulai dari mana, atau tawaran bantuan lanjutan. Skip jika tidak relevan.\n" +
      "Maksimal 2–3 kalimat per paragraf. Jangan buat blok teks besar.",

    procedural:
      "WAJIB gunakan format 4 bagian berikut secara berurutan:\n" +
      "1. **Kalimat pembuka (1 kalimat)** — Framing singkat tentang proses ini. Langsung ke poin, jangan overexplain.\n" +
      "2. **Langkah-langkah bernomor** — WAJIB pakai format 1. 2. 3. Setiap langkah: action dulu, detail menyusul. Maksimal 2 kalimat per langkah. Jangan gabungkan beberapa aksi dalam satu langkah.\n" +
      "3. **Catatan praktis (opsional, 1–2 kalimat)** — Tambahkan hanya jika ada hal penting seperti kesalahan umum, dokumen kritis, atau hal yang sering terlewat. Gunakan ⚠️ atau 💡. Skip bagian ini jika tidak ada yang benar-benar penting.\n" +
      "4. **Tawaran lanjutan (opsional, 1 kalimat)** — Tawarkan bantuan relevan berikutnya secara natural. Contoh: 'Kalau kamu mau, aku bisa bantu bikin checklist-nya juga.' atau 'Aku bisa jelasin lebih detail soal dokumen yang dibutuhkan kalau perlu.' Skip jika tawaran terasa dipaksakan atau tidak relevan.\n" +
      "JANGAN buat jawaban prosedural dalam bentuk paragraf — selalu dalam langkah bernomor. Jangan ulang info yang sudah disebutkan di langkah sebelumnya.",

    confused:
      "Buka dengan tepat 1 kalimat pengakuan yang hangat — cukup validasi perasaannya, tidak perlu berlarut. " +
      "Langsung beralih ke solusi atau tindakan paling konkret yang bisa dilakukan sekarang. " +
      "Prioritaskan kejelasan dan tindakan, bukan panjangnya empati. " +
      "Jika ada langkah-langkah, tulis dalam format bernomor agar terasa lebih terstruktur dan tidak overwhelming.",

    confused_procedural:
      "Buka dengan tepat 1 kalimat empati yang hangat dan ringkas — validasi, lalu langsung alihkan ke solusi. " +
      "Jangan habiskan lebih dari 1 kalimat untuk bagian empati. " +
      "Setelah itu, gunakan format langkah bernomor yang sama dengan intent procedural: " +
      "langkah-langkah 1. 2. 3. (setiap langkah max 2 kalimat, action dulu), " +
      "catatan praktis opsional (⚠️/💡 hanya jika benar-benar kritis), " +
      "dan tawaran lanjutan opsional 1 kalimat yang relevan di akhir. " +
      "Format bernomor justru sangat membantu user yang bingung karena terasa lebih terkendali dan tidak overwhelming.",

    recommendation:
      "Buka dengan 1 kalimat pembuka yang framing-nya natural — jangan langsung lempar daftar ke user.\n" +
      "Jika ada rekomendasi terkuat: sebutkan di awal dengan tegas + alasannya 1 kalimat. Baru tambahkan 2–3 alternatif.\n" +
      "Jika tidak ada satu yang terbaik: susun daftar bernomor dengan positioning singkat tiap item — kenapa cocok, untuk siapa, atau kapan dipakai.\n" +
      "WAJIB tutup dengan 1 kalimat rekomendasi konkret: saran untuk pemula, atau mana yang paling cocok berdasar kondisi user. " +
      "Jangan buat listing panjang tanpa prioritas atau panduan — user butuh arahan, bukan katalog.",

    brainstorming:
      "Buka dengan 1 kalimat singkat yang framing-nya terbuka dan mengundang. " +
      "Berikan 3–5 opsi/ide yang benar-benar berbeda satu sama lain — hindari variasi yang terlalu mirip. " +
      "Setiap ide dalam format bullet atau nomor, diikuti 1–2 kalimat penjelasan yang relevan dan konkret — apa kelebihannya, untuk siapa cocok, atau bagaimana cara mulainya. " +
      "Susun dari yang paling mudah diakses ke yang lebih spesifik. " +
      "Tutup dengan 1 kalimat tawaran: tanya ke mana user ingin lanjut, atau tawarkan untuk mendalami salah satu. " +
      "Jangan ulangi ide dengan kata berbeda.",

    arabic_analysis:
      // ── MAKNA PERKATA / MUFRADAT / I'RAB ────────────────────────────────
      "User meminta analisis makna per kata (mufradat / perkata) dari teks Arab. " +
      "FORMAT WAJIB — gunakan TABEL MARKDOWN dengan 3 kolom:\n" +
      "| Kata Arab | Makna | Keterangan |\n" +
      "|-----------|-------|------------|\n" +
      "| كلمة | arti kata | jenis kata & fungsi gramatikal |\n\n" +
      "ATURAN TABEL:\n" +
      "- Kolom 'Kata Arab': tampilkan kata Arab persis seperti dalam kalimat asli, dengan harakat jika ada.\n" +
      "- Kolom 'Makna': terjemahan tepat dalam Bahasa Indonesia — BUKAN harfiah robotik, tapi makna kontekstual.\n" +
      "- Kolom 'Keterangan': jenis kata (isim/fi'il/huruf) + fungsi gramatikal (fa'il/maf'ul/mubtada/khabar/dll) + keterangan penting singkat.\n" +
      "- Urutan: ikuti urutan kata dalam kalimat aslinya (kiri ke kanan untuk Arab, tampil dari atas ke bawah di tabel).\n" +
      "- Setelah tabel: tulis 1–2 kalimat 'Catatan' (opsional) jika ada pola gramatikal penting atau konteks makna yang perlu disorot.\n" +
      "- Jika user bertanya banyak ayat/kalimat sekaligus: beri heading **[Kalimat/Ayat ke-N]** di atas tiap tabel.\n" +
      "DILARANG: menulis paragraf panjang tanpa tabel, menggabungkan semua kata dalam satu baris, atau skip harakat kecuali teks aslinya memang tanpa harakat.",

    arabic_writing:
      // ── ATURAN UTAMA — WAJIB DIIKUTI ────────────────────────────────────
      "ATURAN PALING PENTING: Jika user meminta BUAT atau TULIS teks Arab (surat, paragraf, karangan, terjemahan), " +
      "WAJIB langsung hasilkan teks Arabnya — JANGAN hanya jelaskan cara menulis atau prosedur pengajuannya. " +
      "Informasi dari Knowledge Base boleh dipakai sebagai konteks/isi, tapi OUTPUT UTAMA harus berupa teks Arab yang diminta. " +
      "FORMAT TAMPILAN: Letakkan teks Arab yang dihasilkan dalam blockquote (awali baris dengan >) agar tampil dalam kotak khusus Arab. " +
      "Setelah blockquote teks Arab, boleh tambahkan 1–2 kalimat penjelasan dalam bahasa Indonesia jika membantu. " +
      // ── PANDUAN PER JENIS TUGAS (bahasa Arab) ───────────────────────────
      "أجب باللغة العربية الفصحى الواضحة المناسبة لمستوى طلاب الجامعة في الأزهر الشريف. " +
      "للرسائل الرسمية (سurat ghaib / i'tidzar / izin / permohonan): اكتب رسالة رسمية متكاملة — البسملة والسلام، ثم مضمون الرسالة (سبب الغياب / الطلب / الاعتذار)، ثم الخاتمة (الشكر والتوقيع والتاريخ). استخدم صيغة مؤدبة ورسمية مناسبة للتواصل الأكاديمي. " +
      "للإنشاء/المقالة: اكتب نصاً متكاملاً بمقدمة وعرض وخاتمة. استخدم أسلوباً أكاديمياً راقياً. " +
      "للتلخيص: ملخص دقيق يحافظ على الأفكار الرئيسية ويحذف التفاصيل الثانوية. " +
      "للشرح/التفسير: وضّح المعنى بأسلوب سهل وواضح مع أمثلة توضيحية. " +
      "للقواعد النحوية والصرفية: اشرح القاعدة بتعريف واضح ثم أعطِ أمثلة تطبيقية متنوعة. " +
      "للترجمة: ترجم بدقة مع مراعاة السياق الأكاديمي والمعنى الضمني — لا تترجم كلمة بكلمة. " +
      "لا تستخدم مقدمات مثل 'بالطبع' أو 'إليك' — ابدأ مباشرة بالمحتوى المطلوب.",

    casual:
      "Ini obrolan santai — jawab seperti teman Masisir yang seru diajak ngobrol, bukan asisten AI.\n" +
      "BOLEH:\n" +
      "- Ekspresi emosi natural: 'Wah!', 'Hah beneran?', 'Aduh bro...', 'Seru banget!', 'Gila nih', 'Mantap!'\n" +
      "- Kasih pendapat, perspektif, atau cerita singkat dari 'pengalaman' AINA\n" +
      "- Tanya balik 1 pertanyaan untuk lanjutin obrolan — tapi jangan spam pertanyaan\n" +
      "- Humor ringan, sedikit bercanda, atau permainan kata jika konteks mendukung\n" +
      "- Singkatan informal: btw, fyi, bro, dll.\n" +
      "- Emoji sesekali kalau pas dan natural (max 1-2 per jawaban)\n" +
      "JANGAN:\n" +
      "- Gunakan heading (##) atau bullet list kecuali memang diperlukan\n" +
      "- Jawaban terlalu singkat 1 kalimat — obrolan yang enak ada bolak-baliknya\n" +
      "- Terlalu formal atau terstruktur seperti laporan\n" +
      "- Frasa robot: 'tentu saja!', 'pastinya!', 'dengan senang hati!', 'sebagai AI...'\n" +
      "Panjang ideal: 2-4 kalimat mengalir. Sesekali lebih panjang kalau topiknya seru.",

    fiqh:
      "Kamu sedang menjawab pertanyaan ilmu agama Islam. Ikuti metodologi ilmiah Islam:\n" +
      "1. **Dalil Al-Qur'an** — jika ada ayat yang relevan, cantumkan teks Arabnya (sebagai blockquote), lalu terjemahan Indonesia di bawahnya, lalu nomor surah:ayat dalam kurung.\n" +
      "2. **Dalil Hadits** — gunakan hadits dari konteks Dorar.net. Format WAJIB 4 baris terpisah: (1) > [teks Arab SAJA dalam blockquote — TANPA terjemahan], (2) *(cara baca: transliterasi)* di luar blockquote, (3) *Artinya: \"terjemahan\"* di luar blockquote, (4) *(HR. perawi, sumber, hukum)* di luar blockquote. DILARANG menaruh apapun selain teks Arab di dalam blockquote.\n" +
      "3. **Pendapat ulama / ijma / qiyas** — sebutkan secara singkat jika relevan, terutama jika ada ikhtilaf (perbedaan pendapat) yang penting diketahui.\n" +
      "4. **Kesimpulan hukum** — nyatakan dengan jelas (wajib/sunnah/haram/makruh/mubah) di akhir, dengan bahasa yang mudah dipahami awam.\n" +
      "ATURAN KERAS:\n" +
      "- JANGAN berfatwa atau menyatakan hukum tanpa dalil yang jelas dari konteks atau pengetahuanmu.\n" +
      "- Jika ada perbedaan pendapat ulama yang signifikan, sebutkan dengan jujur — jangan memilih satu tanpa menginformasikan adanya ikhtilaf.\n" +
      "- Jika pertanyaan terlalu kompleks atau butuh fatwa resmi, sarankan user bertanya langsung ke ulama/lembaga fatwa yang terpercaya.\n" +
      "- WAJIB tampilkan teks Arab asli dalil — jangan hanya terjemahan saja. User perlu bisa membaca dan memverifikasi teks aslinya.",
  };

  const label = primary.toUpperCase().replace("_", "/");
  return `\n\n**[Gaya respons — ${label}]** ${hints[primary] ?? hints.factual}${toneNote}`;
}

/* ── Response Style System ───────────────────────────────────────
 * Five user-selectable styles that control how AINA structures and
 * tones its answers. Replacing the old concise/balanced/detailed system.
 * Default: "step_by_step". Extensible — add new keys + hint below.
 * ─────────────────────────────────────────────────────────────── */

const VALID_RESPONSE_STYLES = new Set([
  "short_direct",
  "step_by_step",
  "detailed_complete",
  "practical_ready_to_use",
  "casual_easy_to_understand",
  "balanced",
]);

/**
 * Auto-detect the best response style based on detected query intent.
 * The user no longer selects this manually — it's inferred from context.
 */
function detectResponseStyle(intentPrimary) {
  switch (intentPrimary) {
    case "procedural":     return "step_by_step";
    case "fiqh":           return "detailed_complete";
    case "recommendation": return "practical_ready_to_use";
    case "brainstorming":  return "casual_easy_to_understand";
    case "arabic_writing":  return "step_by_step";
    case "arabic_analysis": return "step_by_step";
    case "factual":        return "short_direct";
    case "casual":         return "casual_easy_to_understand";
    case "confused":       return "short_direct";
    default:               return "balanced";
  }
}

const RESPONSE_STYLE_HINTS = {
  // Used for: factual, confused
  // Goal: direct answer first, then structured explanation. Conversational, not encyclopedic.
  short_direct: `

⚡ **[GAYA JAWABAN: TERFOKUS, LANGSUNG, & HANGAT]**
Jawab seperti teman yang kebetulan tahu jawabannya — bukan mesin yang nge-dump fakta.

**Tone wajib:**
Awali dengan ekspresi natural 1–2 kata: "Nah," / "Jadi," / "Oke," / "Wah," / "Hmm," / "Menarik nih,"
Ini bukan basa-basi — ini yang membuat jawaban terasa dari orang, bukan robot.

**Pola wajib (SEMUA POIN 1–3 HARUS ADA — tidak boleh dilewati):**
1. **Jawaban hangat & langsung** (1 kalimat) — ekspresi pembuka + inti jawaban. Bukan fakta mentah.
2. ⚠️ **WAJIB — Penjelasan** (1–2 kalimat) — konteks, latar belakang, atau info pendukung. INI BUKAN OPSIONAL.
3. 🔁 **WAJIB — Follow-up natural** (1 kalimat di akhir) — ajak user untuk lanjut, sesuai topiknya. SELALU ada, bahkan untuk jawaban singkat.

**Minimum output:** 3 kalimat. Jawaban tanpa follow-up = GAGAL.

**Follow-up yang baik (pilih yang paling natural untuk topiknya):**
- "Mau aku ceritain lebih lanjut tentang [aspek terkait]?"
- "Kamu penasaran sama bagian yang mana?"
- "Kalau mau tau lebih dalam soal [topik terkait], bisa tanya juga."
- "Ada konteks spesifik yang bikin kamu nanya ini? Bisa aku bantu lebih tepat kalau tau situasinya."
- "Mau aku kasih contoh konkretnya?"

**Contoh BENAR:**
> "Nah, Presiden Amerika Serikat saat ini adalah Donald Trump — ia menjabat lagi sejak Januari 2025.
> Ini bukan debut pertamanya; sebelumnya ia sudah pernah jadi presiden ke-45 (2017–2021), menjadikannya presiden dengan dua periode tidak berurutan dalam sejarah AS.
> Mau aku ceritain juga soal kebijakannya yang lagi ramai dibahas sekarang?"

**Contoh SALAH:**
> "Donald Trump adalah Presiden Amerika Serikat."  ← 1 kalimat, kering, tidak ada follow-up.

**Konektor transisi:** "Jadi...", "Nah...", "Intinya...", "Yang menarik...", "Oh iya..."

**Larangan:**
- JANGAN buka dengan "Berikut adalah...", "Tentu!", "Baik!", atau basa-basi chatbot.
- JANGAN berhenti tanpa follow-up — SETIAP jawaban harus ada penutup yang mengundang lanjutan.`,

  // Used for: procedural, arabic_writing
  // Goal: direct one-liner first, then numbered steps. Each step = one action.
  step_by_step: `

📋 **[GAYA JAWABAN: LANGKAH DEMI LANGKAH]**
Kalimat pembuka = 1 kalimat hangat yang langsung ke proses.
Contoh: "Oke, prosesnya ada [X] langkah:", "Gampang kok, ini cara ngurusnya:", "Nah, langkah-langkahnya:"

**Pola wajib:**
1. **Pembuka singkat & hangat** (1 kalimat) — framing proses dengan ekspresi ringan.
2. **Langkah bernomor** (1. 2. 3.) — tiap langkah = SATU aksi spesifik, maks 2 kalimat.
3. ⚠️ **Catatan kritis** (opsional) — hanya jika ada yang sering terlewat.
4. 🔁 **WAJIB — Follow-up penutup** — 1 kalimat yang mengundang lanjutan, contoh:
   - "Kalau ada step yang situasinya beda, ceritain aja — kondisi tiap orang bisa beda."
   - "Mau aku jelasin lebih detail salah satu langkahnya?"
   - "Ada bagian yang masih bingung?"

**Gaya:** Tegas tapi bersahabat. Pakai "Nah...", "Oh iya..." sebagai transisi.
**WAJIB:** Format bernomor. DILARANG selesai tanpa follow-up penutup.`,

  // Used for: fiqh
  // Goal: hukum first, dalil second, explanation third. Thorough but not academic-dry.
  detailed_complete: `

📖 **[GAYA JAWABAN: MENDALAM & TERSTRUKTUR]**
Kalimat pertama = hukumnya langsung (halal/haram/mubah/dll) — tegas, tidak diundur ke tengah.

**Pola wajib:**
1. **Hukum langsung** (1 kalimat tegas) — tidak ada pembuka basa-basi.
2. **Dalil** — Al-Qur'an atau Hadits dalam format baku (Arabic blockquote → transliterasi → terjemahan).
3. **Penjelasan** — konteks, syarat, catatan ulama. Paragraf pendek 2–3 kalimat.
4. **Guidance praktis** — apa yang perlu user pahami atau lakukan setelah ini.
5. 🔁 **WAJIB — Follow-up penutup** — 1 kalimat yang membuka diskusi lanjutan, contoh:
   - "Ada kondisi khusus yang kamu alami? Ceritain aja biar aku bisa bantu lebih spesifik."
   - "Mau aku jelasin pendapat ulama lain soal ini?"
   - "Kalau mau tau konteks lebih lengkapnya, bisa tanya juga."

Gunakan \`##\` heading jika ada lebih dari 2 aspek berbeda. DILARANG tutup tanpa follow-up.`,

  // Used for: recommendation
  // Goal: direct answer first (which one is best), then positioned options, then concrete pick.
  practical_ready_to_use: `

✅ **[GAYA JAWABAN: REKOMENDASI KONKRET]**
Kalimat pertama = rekomendasi utama atau konteks pemilihan — langsung, tidak ditunda ke akhir.

**Pola wajib:**
1. **Jawaban langsung** (1 kalimat) — mana yang paling cocok untuk situasi ini.
2. **Daftar bernomor** — tiap item WAJIB ada positioning: kenapa cocok, untuk siapa, apa keunggulannya.
3. **Rekomendasi penutup konkret** — satu kalimat: mulai dari mana, atau mana yang paling relevan.
4. 🔁 **WAJIB — Follow-up** — 1 kalimat yang personalisasi diskusi, contoh:
   - "Mau aku bandingin lebih detail antara [opsi A] vs [opsi B]?"
   - "Kalau ada konteks spesifik situasimu, ceritain — aku bisa rekomendasiin yang lebih pas."
   - "Ada budget atau preferensi tertentu? Bisa aku sempitkan pilihannya."

**Gaya:** Percaya diri, tidak plin-plan. Pakai "Nah...", "Intinya...".
**DILARANG:** Tutup tanpa follow-up. DILARANG daftar tanpa penjelasan per item.`,

  // Used for: casual, brainstorming
  // Goal: conversational flow, no rigid structure, analogies welcome.
  casual_easy_to_understand: `

💬 **[GAYA JAWABAN: SANTAI & MENGALIR]**
Langsung mulai — tidak ada pembuka formal. Seperti ngobrol santai sama kakak senior yang asyik.

Kalimat pendek dan ringan. Pakai bahasa sehari-hari. Pakai analogi jika membantu.
Boleh pakai "Jadi...", "Nah...", "Intinya...", "Eh tapi...", "Yang menarik..." secara natural.
Boleh pakai emoji sesekali (max 1–2). Boleh kasih reaksi kecil ("wah ini menarik", "haha iya bener sih").
Kalau ada istilah teknis, langsung jelaskan dalam kurung atau kalimat berikutnya.

🔁 **WAJIB — Follow-up di akhir** (bahkan untuk jawaban santai):
Tutup dengan sesuatu yang natural dan mengundang lanjutan — jangan biarkan percakapan mati.
Contoh: "Penasaran sama bagian yang mana?" / "Mau aku ceritain lebih lanjut?" / "Ada yang mau ditanyain soal ini?"

Jangan heading kecuali konten kompleks. Rasanya kayak chat sama teman yang kebetulan tahu banyak.`,

  // Used for: fallback / unknown intent
  // Goal: sensible default — direct answer first, adaptive format, warm tone.
  balanced: `

⚖️ **[GAYA JAWABAN: ADAPTIF, LANGSUNG & HANGAT]**
Jawab seperti teman yang tahu — bukan mesin, bukan dosen. Kalimat pertama langsung ke inti, tapi tetap manusiawi.
Awali dengan ekspresi natural: "Nah,", "Jadi,", "Oke,", "Wah," — sesuaikan nada dengan topiknya.

**Pilih format sesuai pertanyaan:**
- Faktual → paragraf pendek, pembuka natural, inti langsung, lalu 1–2 kalimat penjelasan.
- Prosedur → pembuka hangat, lalu bernomor, satu aksi per langkah.
- Daftar/syarat → bullet dengan penjelasan per item, tutup dengan rekomendasi konkret.
- Santai → natural, tanpa heading, tanpa struktur kaku.

🔁 **WAJIB — Follow-up di akhir semua jawaban:**
Tutup dengan 1 kalimat yang mengundang lanjutan — spesifik ke topiknya, bukan generik.
Contoh: "Mau aku jelasin bagian [X] lebih detail?" / "Ada situasi spesifik yang kamu hadapi?"

**Minimum:** 3 kalimat. Jawaban tanpa follow-up = tidak lengkap.
JANGAN buka dengan "Berikut adalah...", "Tentu!", "Baik!", atau basa-basi chatbot.`,
};

/**
 * Build the system-prompt injection for the selected response style.
 */
function buildResponseStyleHint(style) {
  return RESPONSE_STYLE_HINTS[style] ?? RESPONSE_STYLE_HINTS.step_by_step;
}


/* ── Context cleaning utilities ──────────────────────── */
// Trim text to maxLen chars, cutting at the last sentence boundary
// within the trailing 300 chars to avoid mid-sentence cuts.
function trimToSentence(text, maxLen) {
  if (!text || text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const searchFrom = Math.max(0, cut.length - 300);
  const tail = cut.slice(searchFrom);
  const lastBoundary = Math.max(
    tail.lastIndexOf(". "), tail.lastIndexOf("! "), tail.lastIndexOf("? "),
    tail.lastIndexOf(".\n"), tail.lastIndexOf("!\n"), tail.lastIndexOf("?\n")
  );
  if (lastBoundary > 0) return cut.slice(0, searchFrom + lastBoundary + 1).trim();
  return cut.trim() + "…";
}

/* ── Confidence / trust layer ────────────────────────── */
// Rule-based, no LLM call. Returns a hint injected into the system prompt.
function classifyConfidence({ hasKB, kbStrength = "absent", hasPinned, hasWiki, hasDDG, hasPerplexity = false, externalTrustTier = null, intent, query }) {
  const timeSensitive = /\b(sekarang|terbaru|terkini|saat ini|hari ini|bulan ini|tahun ini|2024|2025|2026|berubah|update|baru-baru|perubahan|kebijakan baru|berita|harga|nilai tukar|kurs|tarif|rate|hasil|pemenang|juara|menang|kalah|terpilih|dilantik|pemilu|piala dunia|olimpiade|klasemen|peringkat)\b/i.test(query);

  // Current role / office-holder: use shared helper (consistent with classifyQueryType + needsPerplexity)
  const currentRoleQuery = isDynamicRoleQuery(query);

  // Historical role modifier — these are stable facts, not current office-holders.
  // "presiden pertama", "presiden ke-2", "pendiri", "mantan", "almarhum", etc.
  const historicalRole = /\b(pertama|ke-?\d+|pendiri|terdahulu|dahulu|dulu|mantan|eks|sebelumnya|almarhum|almarhumah|wafat|tokoh|founding|awal mula)\b/i.test(query);

  // General knowledge: stable definitional / conceptual questions the model already knows
  const generalKnowledge = /\b(siapa|apa itu|apa arti|artinya apa|apa yang dimaksud|definisi|pengertian|ibu kota|ibukota|jelaskan|bagaimana cara kerja|dalam bahasa|terjemahan|artinya|maksudnya|berapa lama|berapa hari|kapan|sejarah|asal usul|fungsi|manfaat)\b/i.test(query);

  // Pinned updates are admin-verified — highest trust, always wins
  if (hasPinned) return { level: "high_confidence", hint: "" };

  // ── CURRENT ROLE QUERIES — checked BEFORE KB ──────────────────────────────
  // CRITICAL: Always runs for office-holder queries regardless of KB strength.
  // Strong KB CAN have stale names for public offices — Perplexity MUST override.
  if (currentRoleQuery && !historicalRole && !hasPinned) {
    // Exception: Masisir-internal organisations (PPMI, kekeluargaan, forkom, dll.)
    // are NOT indexed by public search engines.  Their leadership roster lives only
    // in the AINA KB — so when KB has any hit, trust it (strong = high, weak = medium).
    if (hasKB && isMasisirInternalOrg(query)) {
      if (kbStrength === "strong") {
        return {
          level: "high_confidence",
          hint: "\n\n**[KB INTERNAL MASISIR — DIPERCAYA]** Jawab berdasarkan data KB yang tersedia. Boleh sebutkan nama/jabatan yang tertulis di KB dengan percaya diri. Jika info terasa mungkin sudah berubah, tambahkan 1 kalimat saran konfirmasi ringan di akhir.",
        };
      }
      // Weak KB — partial info, but still the best available source for internal orgs
      return {
        level: "medium_confidence",
        hint: "\n\n**[KB INTERNAL MASISIR — PARSIAL]** Knowledge Base AINA memiliki beberapa info tentang organisasi ini. Gunakan info yang tersedia dengan percaya diri. Sarankan user untuk konfirmasi langsung ke pengurus PPMI/kekeluargaan jika butuh data yang lebih lengkap.",
      };
    }
    if (hasPerplexity) {
      return {
        level: "medium_confidence",
        hint: "\n\n---\n**[🔴 FINAL OVERRIDE — JABATAN TERKINI]**\n" +
          "Baca ulang bagian '## Informasi Terkini dari Pencarian Web' di atas sebelum menjawab.\n" +
          "WAJIB: Gunakan HANYA nama/informasi dari blok tersebut — JANGAN gunakan nama dari memori training model.\n" +
          "Training data model PASTI usang untuk pertanyaan jabatan/pejabat saat ini.\n" +
          "Jawab langsung dan percaya diri berdasarkan data real-time di atas.\n---",
      };
    }
    return {
      level: "needs_verification",
      hint: "\n\n**[BLOKIR — JABATAN TERKINI TANPA SUMBER]** Ini adalah pertanyaan tentang pejabat/jabatan yang bisa berubah sewaktu-waktu. JANGAN sebutkan nama spesifik dari memori model — data bisa sudah basi. Jawab dengan salah satu dari:\n- 'Untuk jabatan yang bisa berubah seperti ini, saya tidak bisa pastikan nama terkininya tanpa sumber terbaru.'\n- 'Saya tidak bisa konfirmasi siapa yang menjabat saat ini tanpa data yang diverifikasi — sebaiknya cek langsung ke sumber resmi atau berita terbaru.'\nJangan tebak. Jangan sebut nama dari memori. Arahkan user untuk cek sumber terpercaya.",
    };
  }

  // ── STRONG KB — admin-verified, trust it ─────────────────────────────────
  if (hasKB && kbStrength === "strong") {
    return { level: "high_confidence", hint: "" };
  }

  // ── PERPLEXITY OVERRIDE (universal) ──────────────────────────────────────
  // If real-time Perplexity data is present AND KB is absent or weak:
  // ALWAYS force model to use Perplexity, not training data.
  // BUG FIX: Previously required !hasKB — now also applies when kbStrength="weak"
  // because weak KB hits on unrelated articles must NOT block real-time Perplexity data.
  if (hasPerplexity && (!hasKB || kbStrength === "weak")) {
    const isTimeSensitiveQ = timeSensitive || currentRoleQuery;
    return {
      level: "medium_confidence",
      hint: isTimeSensitiveQ
        ? "\n\n---\n**[🔴 DATA REAL-TIME AKTIF — WAJIB DIIKUTI]**\n" +
          "Terdapat data pencarian web real-time dalam blok '## Informasi Terkini dari Pencarian Web' di atas.\n" +
          "WAJIB: Jawab HANYA berdasarkan data tersebut — BUKAN dari memori training model yang bisa sudah usang.\n" +
          "Training data model bisa tertinggal bulan atau tahun untuk informasi yang berubah.\n" +
          "Sampaikan dengan percaya diri dan langsung. Jangan tambahkan disclaimer.\n---"
        : "\n\n---\n**[🟡 DATA PENCARIAN WEB TERSEDIA]**\n" +
          "Ada data dari pencarian web real-time di atas. Jika data tersebut relevan dengan pertanyaan user,\n" +
          "gunakan data itu sebagai sumber jawaban — bukan dari training model.\n" +
          "Jika tidak relevan, jawab dari pengetahuan model seperti biasa.\n---",
    };
  }

  // ── WEAK KB only (no Perplexity, not currentRoleQuery) ───────────────────
  if (hasKB && kbStrength === "weak") {
    return {
      level: "medium_confidence",
      hint: "\n\n**[KB PARSIAL]** Knowledge Base memiliki cakupan sebagian untuk topik ini. Jawab berdasarkan info KB yang tersedia dengan percaya diri — jangan tambahkan disclaimer atau saran konfirmasi ke sumber lain. Jika ada aspek yang tidak tercakup KB, jawab dari pengetahuan model dengan natural.",
    };
  }

  // General knowledge + stable + not a current role query → high trust.
  // Historical role queries (presiden pertama, pendiri, mantan) are allowed through.
  if (generalKnowledge && !timeSensitive && (!currentRoleQuery || historicalRole)) {
    return { level: "high_confidence", hint: "" };
  }

  // No KB, no pinned, query is time-sensitive, no Perplexity:
  // Model uses its own knowledge but MUST note uncertainty for genuinely dynamic details.
  if (!hasKB && !hasPinned && timeSensitive) {
    return {
      level: "needs_verification",
      hint: "\n\n**[Kepercayaan — PERLU_VERIFIKASI / FALLBACK MODEL]** Tidak ada data web terbaru untuk pertanyaan ini — kamu menjawab dari pengetahuan umum model. Jawab dengan natural dan percaya diri, tapi jika ada detail yang genuinely bisa berubah (harga, jadwal, kontak), boleh sebut 1 kalimat singkat saran verifikasi di akhir — jangan dipaksakan jika tidak relevan.",
    };
  }

  // Wikipedia injected, no KB/pinned — medium trust external source, not none.
  // Upgrade from needs_verification to medium_confidence (Phase 9: trust-tier aware).
  // Exception: current-role queries stay blocked regardless of source trust.
  if (!hasKB && !hasPinned && externalTrustTier === "medium" && !currentRoleQuery) {
    return {
      level: "medium_confidence",
      hint: "\n\n**[Kepercayaan — SEDANG]** Jawaban ini berdasarkan Wikipedia. Boleh gunakan frasa ringan seperti 'berdasarkan Wikipedia' jika terasa natural — tapi jangan terlalu banyak disclaimer. Jika info bisa berubah, cukup 1 kalimat peringatan singkat di akhir.",
    };
  }

  // No context at all (no KB, no pinned, no wiki, no DDG) — model knowledge only.
  // For procedural/admin topics (iqomah, paspor, visa, kuliah, dll.) this is DANGEROUS:
  // wrong step-by-step info can mislead the user on real-life decisions.
  if (!hasKB && !hasPinned && !hasWiki && !hasDDG) {
    const isProceduralOrAdmin = ["procedural", "confused_procedural", "recommendation"].includes(intent?.primary);
    if (isProceduralOrAdmin) {
      return {
        level: "needs_verification",
        hint: "\n\n**[Kepercayaan — FALLBACK MODEL — PROSEDURAL]** " +
          "Kamu menjawab pertanyaan prosedural ini dari pengetahuan umum model — tidak ada data KB atau sumber eksternal. " +
          "Jawab dengan natural. Di akhir, sisipkan 1 kalimat singkat yang menyarankan user mengonfirmasi ke senior Masisir, PPMI, atau KBRI — tapi gunakan kata-kata yang ringan dan tidak menakut-nakuti.",
      };
    }
    return {
      level: "needs_verification",
      hint: "\n\n**[Kepercayaan — FALLBACK MODEL]** " +
        "Kamu menjawab dari pengetahuan umum model tanpa KB atau sumber eksternal. " +
        "Jawab dengan percaya diri dan natural — tidak perlu prefix disclaimer. Hanya tambahkan saran verifikasi jika topiknya memang sangat time-sensitive.",
    };
  }

  // KB present but intent is subjective — light basis phrasing allowed
  if (hasKB && ["recommendation", "brainstorming"].includes(intent.primary)) {
    return {
      level: "medium_confidence",
      hint: "\n\n**[Kepercayaan — SEDANG]** Boleh gunakan frasa ringan seperti 'berdasarkan knowledge base AINA' atau 'berdasarkan konteks yang tersedia' — hanya jika terasa natural, jangan dipaksakan.",
    };
  }

  // Wikipedia or DuckDuckGo only (no KB) — secondary source, light acknowledgment allowed
  if (!hasKB && (hasWiki || hasDDG)) {
    return {
      level: "medium_confidence",
      hint: "\n\n**[Kepercayaan — SEDANG]** Boleh gunakan frasa ringan seperti 'berdasarkan informasi yang tersedia' atau sebutkan sumbernya — hanya jika terasa natural, jangan dipaksakan.",
    };
  }

  // Default — medium, no specific hint needed
  return { level: "medium_confidence", hint: "" };
}

/* ── Clarification-to-KB: Self-Learning from User Corrections ────────────
 * When a user corrects/clarifies AINA's previous answer in chat, automatically
 * extract the correction as a pending KB draft for admin approval.
 * ─────────────────────────────────────────────────────────────────────────── */

// Keywords that signal a user is correcting/clarifying AINA's answer
const CLARIFICATION_PATTERNS = [
  /sebenarnya\b/i, /sebetulnya\b/i, /yang\s+benar\b/i, /yang\s+betul\b/i,
  /\bkoreksi\b/i, /\bralat\b/i, /\bperbaikan\b/i, /perlu\s+dikoreksi\b/i,
  /\bsalah\b.*\bitu\b/i, /\bbukan\s+(begitu|seperti|itu)\b/i,
  /faktanya\b/i, /info\s+(yang\s+)?benar\b/i, /harusnya\b/i,
  /tidak\s+(tepat|benar|seperti\s+itu|akurat)\b/i, /kurang\s+(tepat|akurat)\b/i,
  /bukan\s+itu\b/i, /ingin\s+(meluruskan|mengoreksi|mengklarifikasi)\b/i,
  /mau\s+(lurusin|koreksi|klarifikasi)\b/i, /perlu\s+(lurusin|diluruskan)\b/i,
  /yang\s+benar\s+adalah\b/i, /yang\s+bener\b/i,
];

/**
 * Returns true if the user message appears to be correcting AINA's previous answer.
 * Requires: a previous assistant message exists + correction keywords present + sufficient content.
 */
function isClarificationMessage(lastUserMsg, messages) {
  if (!lastUserMsg || lastUserMsg.trim().length < 30) return false;
  // Must have a previous assistant message to correct
  const hasPrevAI = messages.some(m => m.role === "assistant");
  if (!hasPrevAI) return false;
  return CLARIFICATION_PATTERNS.some(p => p.test(lastUserMsg));
}

// Per-user daily clarification rate limit (in-memory, resets at midnight Cairo time)
const _clarifRateMap = new Map(); // userId → { date: "YYYY-MM-DD", count: number }
const CLARIF_DAILY_LIMIT = 3;

function checkClarificationRateLimit(userId) {
  const today = new Date().toLocaleDateString("id-ID", { timeZone: "Africa/Cairo" });
  const entry = _clarifRateMap.get(userId);
  if (!entry || entry.date !== today) {
    _clarifRateMap.set(userId, { date: today, count: 0 });
    return true;
  }
  if (entry.count >= CLARIF_DAILY_LIMIT) return false;
  return true;
}

function incrementClarificationCount(userId) {
  const today = new Date().toLocaleDateString("id-ID", { timeZone: "Africa/Cairo" });
  const entry = _clarifRateMap.get(userId) ?? { date: today, count: 0 };
  _clarifRateMap.set(userId, { date: today, count: entry.count + 1 });
}

/**
 * Uses AI to extract a user clarification into a structured KB article draft.
 * Returns { title, category, content, summary, keywords } or null on failure.
 */
async function extractKBDraftFromClarification(userClarification, prevAiAnswer, apiKey) {
  const prompt = `Kamu adalah editor Knowledge Base AINA untuk komunitas mahasiswa Indonesia di Mesir (Masisir).

Seorang user memberikan koreksi/klarifikasi terhadap jawaban AI berikut:

=== JAWABAN AI SEBELUMNYA ===
${(prevAiAnswer ?? "").slice(0, 1000)}

=== KOREKSI/KLARIFIKASI USER ===
${userClarification.slice(0, 1000)}

Tugasmu: Ekstrak informasi BENAR dari klarifikasi user ini menjadi draft artikel Knowledge Base.

Balas dalam format JSON berikut (tanpa markdown, hanya JSON):
{
  "title": "judul artikel yang spesifik dan informatif (10-100 karakter)",
  "category": "salah satu dari: Administrasi|Akademik|Kehidupan Mesir|Transport|Tempat Tinggal|Kuliner",
  "content": "konten artikel minimal 100 karakter. Tulis fakta yang benar dari klarifikasi user secara lengkap dan terstruktur. Gunakan format yang mudah dibaca.",
  "summary": "ringkasan 1-2 kalimat tentang isi artikel ini (maks 200 karakter)",
  "keywords": "3-5 kata kunci relevan dipisah koma"
}

Jika klarifikasi user tidak mengandung informasi yang cukup untuk dibuat artikel KB, balas: null`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://aina-masisir.replit.app",
        "X-Title":       "AINA Masisir",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-lite-001",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 800,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";

    // Strip markdown fences if present
    const jsonStr = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
    if (jsonStr === "null" || jsonStr === "") return null;

    const draft = JSON.parse(jsonStr);
    if (!draft?.title || !draft?.content || !draft?.category) return null;
    if (draft.content.trim().length < 80) return null;

    return draft;
  } catch (e) {
    console.warn("[Clarif/Extract] extraction failed:", e.message);
    return null;
  }
}

/**
 * Submits an extracted clarification as a pending KB article for admin review.
 * Returns the new article ID or null on failure.
 */
async function submitClarificationDraft(draft, userId, supabase) {
  const payload = {
    author_id:    userId,
    title:        draft.title.trim().slice(0, 200),
    content:      draft.content.trim().slice(0, 50000),
    category:     draft.category,
    status:       "pending",
    keywords:     `dari-klarifikasi-user, ${(draft.keywords ?? "").trim()}`.slice(0, 500),
    summary:      (draft.summary ?? "").slice(0, 600),
    last_updated: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase.from("knowledge_base").insert(payload).select("id").single();
    if (error) {
      // Graceful fallback: strip optional columns
      const fallback = { author_id: userId, title: payload.title, content: payload.content, category: payload.category, status: "pending" };
      const { data: d2 } = await supabase.from("knowledge_base").insert(fallback).select("id").single();
      return d2?.id ?? null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.warn("[Clarif/Submit] submit failed:", e.message);
    return null;
  }
}

/* ── AI Chat ─────────────────────────────────────────── */
app.post("/api/chat", chatLimiter, async (req, res) => {
  const _chatDebugStart = Date.now();
  let _chatDebugStep = "init";

  // Log every incoming request for visibility
  console.log(`[CHAT] ← request | ip=${req.ip} | ua=${(req.headers["user-agent"] ?? "").slice(0, 60)}`);

  const _chatDebugErr = (e) => {
    console.error(`[CHAT-DEBUG] CRASH at step="${_chatDebugStep}" err="${e?.message}" stack="${e?.stack?.split("\n")[1]?.trim()}"`);
  };

  // Auth is required — unauthenticated requests must not reach OpenRouter
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    console.warn(`[CHAT] 401 no-auth | ${Date.now() - _chatDebugStart}ms`);
    return res.status(401).json({ error: "Login diperlukan untuk menggunakan chat" });
  }

  try {

  const { messages, userProfile, attachedFile } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });
  if (messages.length > 50) return res.status(400).json({ error: "Terlalu banyak pesan dalam satu permintaan" });

  // Validate each message content length
  for (const m of messages) {
    if (typeof m?.content === "string" && m.content.length > 8000) {
      return res.status(400).json({ error: "Pesan terlalu panjang" });
    }
  }

  // Validate attached file if present
  if (attachedFile) {
    if (!["image", "pdf"].includes(attachedFile?.type)) {
      return res.status(400).json({ error: "Tipe file tidak valid" });
    }
    if (attachedFile.type === "image") {
      const dataUrl = attachedFile.dataUrl ?? "";
      if (!dataUrl.startsWith("data:image/")) return res.status(400).json({ error: "Format gambar tidak valid" });
      // Cap image data URL at 4 MB
      if (dataUrl.length > 4 * 1024 * 1024) return res.status(400).json({ error: "Gambar terlalu besar (maks 4 MB)" });
    }
    if (attachedFile.type === "pdf") {
      const text = attachedFile.text ?? "";
      if (text.length > 30_000) return res.status(400).json({ error: "Konten PDF terlalu panjang" });
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });

  const supabaseAdmin = getAdminClient();
  if (!supabaseAdmin) return res.status(500).json({ error: "Server config error" });

  // Verify token and apply per-user daily rate limit
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Token tidak valid" });

  // Extract last user message early — needed for intent + memory retrieval
  const rawLastContent = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
  const lastUserMessage = Array.isArray(rawLastContent)
    ? (rawLastContent.find(p => p.type === "text")?.text ?? "")
    : rawLastContent;

  // Typo-normalized version for retrieval only — original preserved for display & model context
  const retrievalQuery = applyTypoNormalization(lastUserMessage);
  if (retrievalQuery !== lastUserMessage) {
    console.log(`[Typo] normalized: "${lastUserMessage.slice(0, 50)}" → "${retrievalQuery.slice(0, 50)}"`);
  }

  // Context detection + query expansion (synchronous — before any async calls)
  const masisirCtx = detectMasisirContext(retrievalQuery);
  const { kbQuery, strategy: retrievalStrategy, changed: queryExpanded } = expandQuery(retrievalQuery, masisirCtx);

  // Content moderation — screen for harmful content before any processing (free OpenAI API)
  if (lastUserMessage.length > 5) {
    const modResult = await checkModeration(lastUserMessage);
    if (modResult.flagged) {
      return res.status(451).json({
        error: "Pesan mengandung konten yang tidak sesuai. Tolong ubah pertanyaanmu agar AINA bisa membantu.",
      });
    }
  }

  // Extract previous assistant message (needed for clarification detection + extraction)
  const prevAiContent = [...messages].reverse().find(m => m.role === "assistant")?.content ?? null;
  const prevAiMsg = typeof prevAiContent === "string" ? prevAiContent : null;

  // Clarification detection: is user correcting AINA's previous answer?
  const clarificationDetected = isClarificationMessage(lastUserMessage, messages) && checkClarificationRateLimit(user.id);
  if (clarificationDetected) {
    console.log(`[Clarif] ✓ correction detected from user ${user.id} — "${lastUserMessage.slice(0, 60)}"`);
  }

  // Intent detection is synchronous — compute before parallel fetches so memory retrieval is query-aware
  _chatDebugStep = "intent-detection";
  const intent = detectIntent(retrievalQuery);
  const intentHint = buildIntentHint(intent);
  console.log(`[Intent] ${intent.primary}${intent.casual ? "+casual" : ""} — "${lastUserMessage.slice(0, 60)}"`);

  _chatDebugStep = "roles-and-memories";
  const [rolesRes, userMemories] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id),
    fetchUserMemories(user.id, lastUserMessage, intent.primary),
  ]);
  const roles = rolesRes.data;
  const isPaidUser = roles?.some(r => ["contributor", "senior_contributor", "admin"].includes(r.role)) ?? false;

  if (!isPaidUser) {
    // Compute midnight in Cairo time (Africa/Cairo = UTC+2, no DST since 2011)
    const CAIRO_OFFSET_MS = 2 * 60 * 60 * 1000;
    const nowUtc = Date.now();
    const nowCairoMs = nowUtc + CAIRO_OFFSET_MS;
    const nowCairo = new Date(nowCairoMs);
    const midnightCairo = new Date(
      Date.UTC(nowCairo.getUTCFullYear(), nowCairo.getUTCMonth(), nowCairo.getUTCDate()) - CAIRO_OFFSET_MS
    );
    const { count } = await supabaseAdmin
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "user")
      .gte("created_at", midnightCairo.toISOString());

    console.log(`Rate limit check: user ${user.id} used ${count}/${DAILY_FREE_LIMIT} messages today`);

    if ((count ?? 0) >= DAILY_FREE_LIMIT) {
      return res.status(429).json({
        error: "Batas chat harian tercapai",
        limitReached: true,
      });
    }
  }

  // ── Fast path: simple greetings (skip AI, respond instantly) ────────────────
  // Greetings never need KB search or an LLM call — answer immediately so
  // the user never sees an error on the most basic interaction.
  const GREETING_RE = /^(halo|hai|hi|hey|hello|assalamualaikum|assalamu'alaikum|assalam|wa'alaikumsalam|walaikumsalam|salam|selamat\s+(pagi|siang|sore|malam)|pagi|sore|siang|malam|apa\s+kabar|gimana\s+kabar|sehat\??)\s*[!.?]*$/i;
  const noPreviousAI = !messages.some(m => m.role === "assistant");
  if (GREETING_RE.test(lastUserMessage.trim()) && noPreviousAI) {
    const cairoHour = (new Date().getUTCHours() + 2) % 24;
    const timeGreet = cairoHour < 10 ? "Selamat pagi" : cairoHour < 15 ? "Selamat siang" : cairoHour < 18 ? "Selamat sore" : "Selamat malam";
    const greetOptions = [
      `Wa'alaikumsalam! Senang ada yang nyapa 😄 Aku AINA — teman diskusi Masisir yang siap bantu soal apa aja: kuliah di Al-Azhar, iqomah, sakan, kurs, atau hal-hal lain seputar kehidupan di Kairo. Mau mulai dari mana?`,
      `${timeGreet}! Aku AINA 👋 Kalau kamu punya pertanyaan soal kehidupan Masisir — dari yang remeh sampai yang bikin pusing — boleh tanya di sini. Lagi butuh info apa nih?`,
      `Halo, senang ketemu kamu! Aku AINA, asisten Masisir yang udah "hafal luar kepala" soal seluk-beluk hidup di Mesir 😊 Mau tanya soal apa hari ini?`,
      `Halo! ${timeGreet} dari Kairo ☀️ Aku AINA — siap bantu kamu navigate kehidupan Masisir. Dari urusan dokumen yang ribet sampai rekomendasi tempat makan, boleh tanya semua. Ada yang bisa aku bantu?`,
      `Wa'alaikumsalam! Alhamdulillah, pas banget — aku lagi siap 😄 Aku AINA, asisten khusus Masisir. Mau nanya soal kuliah, administrasi, kehidupan di Kairo, atau yang lainnya? Langsung aja ceritain.`,
    ];
    const greetReply = greetOptions[Math.floor(Math.random() * greetOptions.length)];
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const words = greetReply.split(" ");
    for (let i = 0; i < words.length; i++) {
      const chunk = (i === 0 ? "" : " ") + words[i];
      res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
      await new Promise(r => setTimeout(r, 25));
    }
    res.write(`data: ${JSON.stringify({
      type: "done", reply: greetReply, model: "aina-hardcoded",
      intent: "casual", confidence: "high_confidence",
      source_used: "Model", sources: ["Pengetahuan Umum"],
      sourceMetadata: { confidence: "high_confidence", primary_source: "Model",
        sources_used: ["Pengetahuan Umum"], may_be_outdated: false, source_summary: null },
    })}\n\n`);
    res.end();
    console.log(`[CHAT] greeting fast-path → user=${user.id.slice(0,8)}`);
    return;
  }

  // ── Tiered model routing ────────────────────────────────────────────────────
  // Tier A (lightweight): fast + cheap — casual, short queries, KB-strong simple answers
  // Tier B (standard):   quality   — procedural, memory-aware, complex, time-sensitive
  // Fallback:            free safety-net — only if both paid tiers fail
  //
  // Models are tried SEQUENTIALLY per tier (not raced) to avoid wasting paid API calls.
  // ──────────────────────────────────────────────────────────────────────────────
  const MODEL_TIERS = {
    // Tier A — fast + cheap for casual / KB-covered stable queries
    // Uses Flash Lite as primary → ~40% cheaper, ~15% faster than Flash on simple tasks
    lightweight: {
      primary:   "google/gemini-2.0-flash-lite-001",       // fast & cheap for simple queries
      fallback:  "google/gemini-2.0-flash-001",            // upgrade if lite fails
      emergency: "meta-llama/llama-3.3-70b-instruct:free", // free safety-net
    },
    // Tier B — quality for complex, procedural, dynamic, and fiqh queries
    // Uses full Flash as primary → better instruction-following for structured outputs
    standard: {
      primary:   "google/gemini-2.0-flash-001",            // proven stable primary
      fallback:  "google/gemini-2.0-flash-lite-001",       // lite fallback if primary fails
      emergency: "meta-llama/llama-3.3-70b-instruct:free", // free last resort
    },
  };

  // ── Early Perplexity pre-fetch (in parallel with Wave 1) ──────────────────
  // Heuristic: start Perplexity early for queries that are likely to need external context.
  // If KB turns out to be strong, we discard the result (minor API cost, major latency win).
  // Skip early-start for: local-Masisir, casual, arabic_writing, brainstorming, currency.
  const isLocalMasisir = masisirCtx.isLocal;
  const INTENTS_NO_PERPLEXITY = new Set(["casual", "arabic_writing", "arabic_analysis", "brainstorming"]);
  const earlyPerplexityStart = !isLocalMasisir
    && !INTENTS_NO_PERPLEXITY.has(intent.primary)
    && !isCurrencyQuery(retrievalQuery)
    && (process.env.PERPLEXITY_API_KEY || process.env.OPENROUTER_API_KEY);
  const earlyPerplexityPromise = earlyPerplexityStart
    ? fetchPerplexityContext(retrievalQuery)
    : Promise.resolve(null);

  // Wave 1 — fast internal fetches (always run in parallel with early Perplexity)
  // kbQuery = expanded/enriched query for better KB hit-rate; retrievalQuery used for everything else
  _chatDebugStep = "wave1-fetches";
  const [articles, pinnedUpdates, exchangeRates, dorarResult] = await Promise.all([
    fetchRelevantArticles(kbQuery, intent.primary),
    fetchPinnedUpdates(),
    isCurrencyQuery(retrievalQuery) ? fetchExchangeRates() : Promise.resolve(null),
    intent.primary === "fiqh" ? fetchDorarHadith(retrievalQuery) : Promise.resolve(null),
  ]);

  // Assess KB coverage strength before deciding whether to use external sources
  const kbStrength = assessKBStrength(articles);

  const needsExternal = isLocalMasisir ? false : shouldFetchExternal(intent.primary, kbStrength, retrievalQuery);
  // B2 fix: when fiqh intent + Dorar found nothing + no KB → Gemini web fallback
  const fiqhDorarMiss = intent.primary === "fiqh"
    && !(dorarResult?.hadiths?.length > 0)
    && articles.length === 0;
  const perplexityNeeded = isLocalMasisir ? false
    : (fiqhDorarMiss || needsPerplexity(intent.primary, kbStrength, retrievalQuery));
  if (isLocalMasisir) console.log(`[Source] local-masisir detected — score:${masisirCtx.score} conf:${masisirCtx.confidence} cats:[${masisirCtx.matchedCategories.join(",")}] → blocking external`);
  if (fiqhDorarMiss) console.log(`[Source] fiqh-Dorar miss + no KB → activating Gemini web fallback`);

  // ── #5 KB gap detection: log weak-KB Masisir queries ────────────────────────
  if (kbStrength === "weak" && isLocalMasisir) {
    logMissingTopic(lastUserMessage, intent.primary);
    console.log(`[MissingTopics] weak-KB local-Masisir query logged for admin review`);
  }

  // ── Classify query type for strict 3-layer routing ──────────────────────────
  const queryType = classifyQueryType(intent.primary, kbStrength, retrievalQuery);
  // Dynamic (office-holder / time-sensitive) queries: KB data may be stale even when "strong".
  // Always fetch Perplexity for dynamic queries regardless of KB coverage.
  const kbCoversQuery = kbStrength === "strong" && queryType !== "dynamic";

  console.log(`[Source] KB=${kbStrength} (${articles.length} art) intent=${intent.primary} queryType=${queryType} kbCovers=${kbCoversQuery}`);

  // ── Resolve Perplexity (already running in background since Wave 1 start) ──
  let wikiResult = null, ddgResult = null, perplexityResult = null;

  if (!kbCoversQuery && queryType !== "currency" && perplexityNeeded) {
    if (earlyPerplexityStart) {
      // Result is already in-flight — just await the pre-started promise
      perplexityResult = await earlyPerplexityPromise;
      console.log(`[Source] perplexity=${perplexityResult ? "SUCCESS (parallel)" : "FAILED"} (queryType=${queryType})`);
    } else {
      // Fallback: start now (shouldn't happen often given earlyPerplexityStart conditions)
      perplexityResult = await fetchPerplexityContext(retrievalQuery);
      console.log(`[Source] perplexity=${perplexityResult ? "SUCCESS" : "FAILED"} (queryType=${queryType})`);
    }
  } else if (earlyPerplexityStart && (kbCoversQuery || !perplexityNeeded)) {
    // KB was strong or Perplexity not actually needed — discard the early result
    console.log(`[Source] early Perplexity discarded (KB=${kbStrength}, perplexityNeeded=${perplexityNeeded})`);
  }

  if (perplexityResult) {
    console.log(`[Source] web context ready → skipping Wikipedia+DDG`);
  } else if (!kbCoversQuery && queryType !== "currency") {
    console.log(`[Source] no web context → model answers from own knowledge`);
  } else {
    if (kbCoversQuery) console.log(`[Source] KB strong → skipping all external sources`);
    if (queryType === "currency") console.log(`[Source] currency query → exchange API only`);
  }

  // ── Response style — auto-detected from intent ────────────────────────────
  const answerMode = detectResponseStyle(intent.primary);
  const answerModeHint = buildResponseStyleHint(answerMode);
  console.log(`[ResponseStyle] auto:${answerMode} (intent:${intent.primary})`);

  // ── Structured source decision log ──────────────────────────────────────
  const sourceLog = {
    kb_used:          articles.length > 0,
    kb_strength:      kbStrength,
    query_type:       queryType,
    external_type:    queryType === "currency" ? "currency_api"
                      : perplexityResult ? "perplexity"
                      : (wikiResult || ddgResult) ? "wiki_ddg"
                      : "none",
    external_called:  queryType !== "currency" && (perplexityNeeded || needsExternal) && !kbCoversQuery,
    external_success: !!(perplexityResult || wikiResult || ddgResult || (queryType === "currency" && exchangeRates)),
    fallback_used:    !perplexityResult && !!(wikiResult || ddgResult),
    final_source:     articles.length > 0 ? "kb"
                      : perplexityResult ? "perplexity"
                      : queryType === "currency" && exchangeRates ? "currency_api"
                      : (wikiResult || ddgResult) ? "wiki_ddg"
                      : "model_fallback",
    answer_mode:      answerMode,
  };
  console.log(`[SourceDecision] ${JSON.stringify(sourceLog)}`);

  // ── Trust meta: compute source label + trust level for footer ────────────
  const _SOURCE_LABEL_MAP = {
    kb:            "Knowledge Base AINA",
    perplexity:    "Web (real-time)",
    currency_api:  "API Kurs Real-time",
    wiki_ddg:      "Wikipedia / Web",
    model_fallback: "Pengetahuan umum model",
  };
  const _TRUST_LABEL_MAP = {
    high_confidence:    "Tinggi",
    medium_confidence:  "Sedang",
    needs_verification: "Perlu verifikasi",
  };
  // Combined source when both KB and external are present
  const _hasBoth = sourceLog.kb_used && sourceLog.external_success;
  const _sourceKey = _hasBoth ? "gabungan" : (sourceLog.final_source ?? "model_fallback");
  const sourceMeta = {
    label:  _hasBoth ? "Knowledge Base AINA + Web" : (_SOURCE_LABEL_MAP[_sourceKey] ?? "Pengetahuan umum model"),
    intent: intent.primary,
  };

  // ── Source orchestration: rich metadata + confidence label ────────────────
  const sourceResult = buildSourceResult({
    articles,
    pinnedUpdates,
    perplexityResult,
    wikiResult,
    ddgResult,
    exchangeRates,
    dorarResult,
    kbStrength,
    queryType,
    intent,
    query: lastUserMessage,
  });
  logSourceDecision(sourceResult, lastUserMessage);

  // ── Build context blocks via modular prompt engine ─────────────────────────
  // Each builder is a pure function: input data → context string.
  // Internal logging (Wikipedia, DDG, Perplexity, Dorar, Exchange) is in each builder.
  const knowledgeContext       = buildKnowledgeContext(articles);
  const pinnedContext          = buildPinnedContext(pinnedUpdates);
  const personalizationContext = buildPersonalizationContext(userProfile);
  const memoryContext          = buildMemoryContext(userMemories);
  if (userMemories.length > 0) {
    const prefMems = userMemories.filter(m => (m.memory_type || "context_memory") === "preference_memory");
    const ctxMems  = userMemories.filter(m => (m.memory_type || "context_memory") === "context_memory");
    const taskMems = userMemories.filter(m => (m.memory_type || "context_memory") === "task_memory");
    console.log(`[Memory] injected ${userMemories.length} memories (pref:${prefMems.length} ctx:${ctxMems.length} task:${taskMems.length}) for intent=${intent.primary}`);
  }
  const exchangeContext        = buildExchangeContext(queryType, exchangeRates);
  const wikiContext            = buildWikiContext(wikiResult, kbStrength, intent);
  const ddgContext             = buildDDGContext(ddgResult, articles, wikiContext);
  const perplexityContext      = buildPerplexityContext(perplexityResult, kbStrength, intent);
  const dorarContext           = buildDorarContext(dorarResult);

  // ── Compute external trust level (for confidence classification + logging) ─
  const externalTrust = computeExternalTrustLevel(!!wikiContext, !!ddgContext, !!perplexityContext);
  if (externalTrust) {
    console.log(`[Trust] external=${externalTrust.label}(${externalTrust.score}) tier=${externalTrust.tier}`);
  }

  // ── Confidence classification ─────────────────────────────────────────────
  const confidence = classifyConfidence({
    hasKB: articles.length > 0,
    kbStrength,
    hasPinned: pinnedUpdates.length > 0,
    hasWiki: !!wikiContext,
    hasDDG: !!ddgContext,
    hasPerplexity: !!perplexityContext,
    externalTrustTier: externalTrust?.tier ?? null,
    intent,
    query: lastUserMessage,
  });
  console.log(`[Confidence] ${confidence.level} — "${lastUserMessage.slice(0, 60)}"`);
  if (perplexityContext) {
    console.log(`[DEBUG-Perplexity] context snippet: "${perplexityContext.slice(0, 200).replace(/\n/g, ' ')}"`);
  } else {
    console.log(`[DEBUG-Perplexity] NO perplexity context injected`);
  }
  if (confidence.hint) {
    console.log(`[DEBUG-ConfidenceHint] hint: "${confidence.hint.slice(0, 100).replace(/\n/g, ' ')}"`);
  }

  const now = new Date();
  const todayStr = now.toLocaleDateString("id-ID", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Africa/Cairo",
  });

  // ── Assemble full system prompt via modular builder ───────────────────────
  _chatDebugStep = "build-system-prompt";
  // Resolve trust label now that confidence is available
  sourceMeta.trust = _TRUST_LABEL_MAP[confidence.level] ?? "Sedang";
  const systemPrompt = buildSystemPrompt({
    todayStr,
    intentHint,
    intentPrimary: intent.primary,
    confidence,
    answerModeHint,
    pinnedContext,
    memoryContext,
    personalizationContext,
    knowledgeContext,
    exchangeContext,
    dorarContext,
    perplexityContext,
    wikiContext,
    ddgContext,
    sourceMeta,
  });

  console.log(`Chat: found ${articles.length} relevant articles for query: "${lastUserMessage.slice(0, 60)}"`);

  // ── A4: Server-side language detection — reinforce language instruction ─────
  // Detect if user's message is predominantly Arabic to set explicit language mode
  const _arabicChars = (lastUserMessage.match(/[\u0600-\u06FF]/g) || []).length;
  const _cleanLen    = lastUserMessage.replace(/\s/g, "").length || 1;
  const _arabicRatio = _arabicChars / _cleanLen;
  const _langNote = _arabicRatio > 0.3
    ? `[INSTRUKSI BAHASA — SISTEM]: Pesan user terdeteksi dalam Bahasa Arab (${Math.round(_arabicRatio * 100)}% karakter Arab). WAJIB balas seluruh respons dalam Bahasa Arab فصحى yang fasih dan jelas sesuai level akademik Al-Azhar. DILARANG menggunakan Bahasa Indonesia dalam respons ini kecuali untuk catatan terjemahan pendek.`
    : `[INSTRUKSI BAHASA — SISTEM]: Pesan user dalam Bahasa Indonesia atau non-Arab. WAJIB balas dalam Bahasa Indonesia. DILARANG menggunakan Bahasa Inggris atau bahasa lain dalam respons ini — bahkan sebagai campuran. Pengecualian satu-satunya: kutipan/dalil Arab dengan terjemahan Indonesia-nya.`;

  // ── Optimize chat history for token efficiency ────────────────────────────
  // Long sessions accumulate many messages → huge token waste. We keep the last
  // 6 messages verbatim and compress older ones into a compact summary block.
  const histOpt = optimizeHistory(messages);
  if (histOpt.stats.triggered) {
    console.log(
      `[HistOpt] compressed ${histOpt.stats.summarized} → summary ` +
      `| kept=${histOpt.stats.kept} | saved≈${histOpt.stats.estimatedSavedTokens}t`
    );
  }

  // ── Build final messages array, injecting attachedFile if present ──────────
  let finalSystemPrompt = _langNote + "\n\n" + systemPrompt;
  // Inject compressed history summary as system context if applicable
  if (histOpt.summarySystemBlock) {
    finalSystemPrompt += `\n\n---\n${histOpt.summarySystemBlock}\n---`;
  }
  let finalMessages = histOpt.trimmedMessages;
  let useVisionModel = false;

  // ── Local Masisir retrieval guidance ─────────────────────────────────────
  // Inject context-aware instruction based on:
  //   (a) whether KB has relevant coverage  (kbStrength)
  //   (b) which category was matched        (masisirCtx.matchedCategories)
  //   (c) how confident we are              (masisirCtx.confidence)
  if (isLocalMasisir && kbStrength !== "strong") {
    const cats = masisirCtx.matchedCategories ?? [];
    const isHyperLocal = cats.includes("komunitas_masisir") && !cats.some(c =>
      ["akademik_al_azhar", "administrasi_mesir", "kehidupan_kairo", "travel_masisir"].includes(c)
    );

    if (isHyperLocal) {
      // Hyper-local community data (org names, contacts, events) — model rarely has this
      // → answer what you can, but strongly advise direct verification
      finalSystemPrompt += `\n\n---\n## 📌 PANDUAN SUMBER — TOPIK KOMUNITAS MASISIR\n\nTopik ini menyangkut hal yang SANGAT SPESIFIK komunitas Indonesia di Mesir (organisasi, kekeluargaan, acara, kontak pengurus, dll.).\n\n**Prioritas sumber:**\n1. Knowledge Base AINA (gunakan jika tersedia di atas)\n2. Pengetahuan umum tentang komunitas Masisir yang kamu miliki — boleh digunakan, tapi...\n3. Selalu akhiri dengan: "Untuk info yang paling akurat dan terkini, cek langsung ke grup komunitas atau senior Masisir ya."\n\n**JANGAN** memberikan nama, kontak, atau data spesifik yang kamu tidak yakin akurat — lebih baik jawab dengan gambaran umum lalu arahkan ke sumber primer.\n---`;
    } else {
      // Procedural / admin / academic Masisir topics — model has reasonable general knowledge
      // → answer from general knowledge + mark as needs-verification
      finalSystemPrompt += `\n\n---\n## 📌 PANDUAN RETRIEVAL — TOPIK MASISIR\n\nPertanyaan ini tentang topik Masisir yang belum atau tidak lengkap di Knowledge Base.\n\n**Strategi jawaban:**\n1. Gunakan konteks KB yang tersedia (jika ada) sebagai dasar utama\n2. Lengkapi dengan pengetahuan umummu tentang prosedur/kondisi di Mesir\n3. Prioritaskan jawaban yang PRAKTIS dan langsung bisa ditindaklanjuti\n4. Jika ada detail yang bisa berubah (harga, tanggal, kebijakan), tambahkan catatan singkat: *"Angka/info ini bisa berubah — konfirmasi ke KBRI/Al-Azhar/senior setempat untuk kepastian."*\n\n**JANGAN** bilang "tidak ada info" atau "saya tidak tahu" — selalu jawab dengan yang kamu bisa, lalu arahkan ke sumber terpercaya jika perlu konfirmasi.\n---`;
    }
    console.log(`[LocalMasisir] KB ${kbStrength} | hyperLocal:${isHyperLocal} | conf:${masisirCtx.confidence} → injected retrieval guidance`);
  }

  // ── Partner promo injection (Temantiket) ─────────────────────────────────
  const partnerPromo = detectPartnerPromo(lastUserMessage);
  if (partnerPromo) {
    console.log(`[PartnerPromo] Triggered for topics: ${partnerPromo.topics.join(", ")}`);
    finalSystemPrompt = finalSystemPrompt + partnerPromo.block;
  }

  // ── Google Maps Places context injection ─────────────────────────────────
  // Triggered when user asks about a place, restaurant, clinic, bank, etc.
  // Calls Google Places API (new) and injects real-time data (address, phone,
  // opening hours, rating, nearby places) into the system prompt.
  if (detectPlacesQuery(lastUserMessage)) {
    try {
      const placesCtx = await buildPlacesContext(lastUserMessage);
      if (placesCtx) {
        finalSystemPrompt = finalSystemPrompt + placesCtx;
        console.log(`[Places] ✓ context injected into system prompt`);
      }
    } catch (placesErr) {
      console.warn("[Places] context injection failed:", placesErr.message);
    }
  }

  // ── Cairo transport context injection ────────────────────────────────────
  // Triggered when user asks about transportation / directions.
  // Extracts destination from conversation history and injects a comprehensive
  // Cairo transport guide so AINA can give accurate, area-specific routes.
  if (isTransportQuery(lastUserMessage)) {
    const locationHint = extractLocationFromHistory(messages);
    const detectedAreas = detectAreasInQuery(lastUserMessage);
    const transportCtx = buildCairoTransportContext(locationHint, detectedAreas);
    finalSystemPrompt = finalSystemPrompt + transportCtx;
    const areaNames = detectedAreas.map(a => a.key).join(", ") || "none";
    console.log(`[Transport] query detected → areas=${areaNames} · location=${locationHint ? locationHint.name + (locationHint.area ? ` (${locationHint.area})` : "") : "not found"}`);
  }

  if (attachedFile?.type === "pdf" && attachedFile.text) {
    const pdfCtx = `\n\n---\n## Dokumen yang Diupload User (${attachedFile.name ?? "file.pdf"})\nAnalisis dokumen berikut sesuai pertanyaan user:\n\n${attachedFile.text.slice(0, 20_000)}\n---`;
    finalSystemPrompt = finalSystemPrompt + pdfCtx;
  }

  // ── E5: Staleness check for old procedural KB articles ─────────────────
  // Only inject a warning when article is VERY old (>365 days) — avoid spamming users
  // with "mungkin sudah berubah" on every procedural answer.
  if (intent.primary === "procedural" && articles.length > 0) {
    const nowMs = Date.now();
    const veryStaleArticles = articles.filter(a => {
      const updatedAt = a.last_updated || a.updated_at || a.created_at;
      if (!updatedAt) return false; // no date → trust KB, don't penalise
      const ageDays = (nowMs - new Date(updatedAt).getTime()) / 86_400_000;
      return ageDays > 365;
    });
    if (veryStaleArticles.length > 0) {
      const maxAgeDays = Math.max(...veryStaleArticles.map(a => {
        const updatedAt = a.last_updated || a.updated_at || a.created_at;
        return updatedAt ? (nowMs - new Date(updatedAt).getTime()) / 86_400_000 : 999;
      }));
      finalSystemPrompt += `\n\n---\n## Info Kebaruan KB\n⚠️ Artikel KB ini sudah lebih dari 1 tahun tidak diperbarui (${Math.round(maxAgeDays)} hari).\nJika ada detail spesifik yang sifatnya sangat mudah berubah (biaya, nomor kontak, jadwal), boleh sisipkan 1 kalimat singkat yang menyarankan user untuk verifikasi — tapi hanya jika memang relevan, jangan dipaksakan.\n---`;
      console.log(`[E5-Staleness] ${veryStaleArticles.length} article(s) older than 365 days (maxAge=${Math.round(maxAgeDays)}d) → soft note injected`);
    }
  }

  if (attachedFile?.type === "image" && attachedFile.dataUrl) {
    // Pre-analysis with GPT-4o Vision for Arabic document understanding
    // This runs alongside the existing multimodal model for richer context
    if (process.env.OPENAI_API_KEY) {
      try {
        console.log("[Vision] Analysing image with GPT-4o Vision...");
        const visionAnalysis = await analyzeImageWithVision(attachedFile.dataUrl, lastUserMessage);
        if (visionAnalysis) {
          finalSystemPrompt = finalSystemPrompt +
            `\n\n---\n## Analisis Gambar (GPT-4o Vision)\nBerikut adalah analisis mendalam dari gambar yang diupload user — gunakan ini sebagai konteks utama:\n\n${visionAnalysis}\n---`;
          console.log(`[Vision] ✓ analysis complete (${visionAnalysis.length} chars)`);
        }
      } catch (visionErr) {
        console.warn(`[Vision] analysis failed: ${visionErr.message}`);
      }
    }

    // Also send image to the main multimodal model (OpenRouter) so it can see it too
    useVisionModel = true;
    const lastUserIdx = [...finalMessages].map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === "user")?.i;
    if (lastUserIdx !== undefined) {
      const lastMsg = finalMessages[lastUserIdx];
      const textContent = typeof lastMsg.content === "string" ? lastMsg.content : lastUserMessage;
      finalMessages = [
        ...finalMessages.slice(0, lastUserIdx),
        {
          role: "user",
          content: [
            ...(textContent ? [{ type: "text", text: textContent }] : []),
            { type: "image_url", image_url: { url: attachedFile.dataUrl } },
          ],
        },
        ...finalMessages.slice(lastUserIdx + 1),
      ];
    }
  }

  const cleanReply = (raw) => raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p>/gi, "\n")
    .replace(/<\/?b>/gi, "**")
    .replace(/<\/?strong>/gi, "**")
    .replace(/<\/?i>/gi, "_")
    .replace(/<\/?em>/gi, "_")
    .replace(/<li>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/?[uo]l>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Vision-capable model for image uploads; free model chain for text
  const VISION_MODEL = "google/gemini-2.0-flash-001";

  // ── Model tier selector — runs AFTER retrieval + context prep ──────────────
  // Signals used: intentPrimary, kbStrength, query content (NOT length alone).
  // Returns "lightweight" (Tier A) or "standard" (Tier B).
  //
  // GUARD: dynamic/current-role/time-sensitive queries ALWAYS go to Tier B,
  // even if the query is short — these carry high accuracy risk.
  function selectModelTier(intentPrimary, kbStrength, query) {
    const q = (query ?? "").trim();

    // ── Dynamic guard (highest priority — overrides everything else) ──────────
    // Current office-holder queries: answer accuracy is critical, must use stronger model
    const isDynamicRole = /\bsiapa\b.{0,50}\b(presiden|perdana menteri|menteri|wakil presiden|rektor|direktur|ceo|gubernur|walikota|bupati|kepala|ketua|sekjen|paus|raja|ratu|panglima|kapolri|jaksa agung|chairman|pemimpin)\b/i.test(q)
      || /\b(presiden|menteri|rektor|direktur|ceo|gubernur|ketua|kepala)\b.{0,30}\bsiapa\b/i.test(q);

    // Time-sensitive: any query about current state, rules, prices, policies
    const isTimeSensitive = /\b(sekarang|terbaru|terkini|saat ini|hari ini|bulan ini|tahun ini|2024|2025|2026|kebijakan baru|aturan terbaru|perubahan|berubah|update|berita|biaya hidup)\b/i.test(q);

    // Exchange-rate queries (already handled by Frankfurter, but route to better model)
    const isCurrency = /\b(kurs|rate|nilai tukar|exchange|pound|egp|rupiah|dollar)\b/i.test(q);

    if (isDynamicRole || isTimeSensitive || isCurrency) return "standard";

    // ── Safe Tier A routes ────────────────────────────────────────────────────
    // Casual: no substantive knowledge needed → always Tier A.
    if (intentPrimary === "casual") return "lightweight";

    // KB-covered factual/brainstorm/recommendation on stable topic:
    // Strong KB has the full answer → model just formats it. Tier A is sufficient.
    // Procedural/fiqh/arabic_writing always stay on Tier B (precision critical).
    const isKBCoveredStable = kbStrength === "strong"
      && !isTimeSensitive && !isDynamicRole
      && ["factual", "recommendation", "brainstorming", "confused"].includes(intentPrimary);
    if (isKBCoveredStable) return "lightweight";

    // ── Everything else → Tier B ──────────────────────────────────────────────
    return "standard";
  }

  // Intent-based temperature — model creativity vs. accuracy tradeoff.
  // Casual chat benefits from higher temperature (more expressive).
  // Fiqh/procedural require precision → lower temperature to reduce hallucination.
  const intentTemperature = ({
    casual:              0.70,
    brainstorming:       0.65,
    recommendation:      0.55,
    factual:             0.50,
    confused:            0.45,
    arabic_writing:      0.40,
    procedural:          0.35,
    confused_procedural: 0.35,
    fiqh:                0.30,
  })[intent.primary] ?? 0.50;
  console.log(`[Temperature] ${intentTemperature} for intent=${intent.primary}`);

  // allowTruncated=false: reject if finish_reason==="length"
  // allowTruncated=true: accept truncated as last resort
  // timeoutMs: paid models get 20s (they're fast), free fallback gets 45s
  const tryModel = async (model, allowTruncated = false, timeoutMs = 20000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://ainalabs.pro",
          "X-Title": "AINA - Asisten Masisir",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: finalSystemPrompt }, ...finalMessages],
          max_tokens: 8000,
          temperature: intentTemperature,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      const finishReason = data.choices?.[0]?.finish_reason;
      if (!content) throw new Error("empty response");
      if (!allowTruncated && finishReason === "length") {
        console.warn(`[tryModel] ${model} truncated (finish_reason=length), skipping`);
        throw new Error("response truncated");
      }
      console.log(`[tryModel] ${model} OK (finish_reason=${finishReason}, chars=${content.length})`);
      return { reply: content, model };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // Sequential tiered waterfall — no parallel racing to avoid wasting paid calls
  const runTieredWaterfall = async (tier) => {
    const t = MODEL_TIERS[tier];
    // 1. Try primary model for this tier
    try {
      return await tryModel(t.primary, false, 20000);
    } catch (e) {
      console.warn(`[Routing] ${tier} primary (${t.primary}) failed: ${e.message}`);
    }
    // 2. Try fallback model
    if (t.fallback) {
      try {
        const fbTimeout = t.fallback.includes(":free") ? 45000 : 20000;
        return await tryModel(t.fallback, false, fbTimeout);
      } catch (e) {
        console.warn(`[Routing] ${tier} fallback (${t.fallback}) failed: ${e.message}`);
      }
    }
    // 3. Try emergency free model (standard tier only)
    if (t.emergency) {
      return await tryModel(t.emergency, true, 45000);
    }
    throw new Error(`All models in tier '${tier}' failed`);
  };

  // ── Dynamic max_tokens based on intent ──────────────────────────────────────
  // Avoids over-generating for simple queries while keeping full budget for complex ones.
  const dynamicMaxTokens = (() => {
    const i = intent.primary;
    const tableKeywords = /tabel|table|daftar perbandingan|format tabel/i;
    const needsTable = tableKeywords.test(lastUserMessage);
    if (needsTable) return 6000;
    if (i === "casual") return 2000;
    if (i === "factual" || i === "confused") return 4000;
    if (i === "arabic_writing" || i === "arabic_analysis" || i === "fiqh") return 5000;
    if (i === "procedural" || i === "confused_procedural") return 5000;
    return 4000;
  })();

  // ── Set SSE headers before model calls ─────────────────────────────────────
  // Must be set before any res.write() calls; once flushed, headers are committed.
  _chatDebugStep = "sse-headers";
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send immediate heartbeat so Vercel (and any proxy) knows the stream is alive.
  // Without this, Vercel may buffer the entire response until the function completes.
  res.write(`: heartbeat\n\n`);

  // Periodic keepalive to prevent gateway timeout on Vercel Hobby (auto-clears on finish)
  const _keepaliveInterval = setInterval(() => {
    try { res.write(`: keepalive\n\n`); } catch { clearInterval(_keepaliveInterval); }
  }, 5000);
  res.once("finish", () => clearInterval(_keepaliveInterval));
  res.once("close",  () => clearInterval(_keepaliveInterval));

  _chatDebugStep = "streaming";

  // Helper: attempt a single streaming fetch from OpenRouter
  const tryStreamFetch = async (model, timeoutMs = 20000) => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://ainalabs.pro",
          "X-Title": "AINA - Asisten Masisir",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: finalSystemPrompt }, ...finalMessages],
          max_tokens: dynamicMaxTokens,
          temperature: intentTemperature,
          stream: true,
        }),
      });
      clearTimeout(tid);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp;
    } catch (e) {
      clearTimeout(tid);
      throw e;
    }
  };

  // ── Build ordered model list ─────────────────────────────────────────────────
  // Scale timeout with token budget: large responses (tables, long explanations) need more time.
  const baseTimeoutMs = dynamicMaxTokens >= 5000 ? 60000 : dynamicMaxTokens >= 3000 ? 40000 : 20000;
  let modelsToTry;
  if (useVisionModel) {
    modelsToTry = [{ model: VISION_MODEL, timeoutMs: baseTimeoutMs }];
  } else {
    const tier = selectModelTier(intent.primary, kbStrength, lastUserMessage);
    console.log(`[Routing] tier=${tier} intent=${intent.primary} kb=${kbStrength} qlen=${lastUserMessage.length} timeout=${baseTimeoutMs}ms`);
    const t = MODEL_TIERS[tier];
    const crossTier = MODEL_TIERS[tier === "lightweight" ? "standard" : "lightweight"];
    modelsToTry = [
      { model: t.primary,   timeoutMs: baseTimeoutMs },
      ...(t.fallback  ? [{ model: t.fallback,   timeoutMs: t.fallback.includes(":free") ? 60000 : baseTimeoutMs }] : []),
      ...(t.emergency ? [{ model: t.emergency,  timeoutMs: 60000 }] : []),
      { model: crossTier.primary, timeoutMs: baseTimeoutMs },
    ];

    // Debug token report (only fires when AINA_DEBUG=true)
    debugTokenReport({
      systemPrompt:      finalSystemPrompt,
      messages:          finalMessages,
      kbContext:         knowledgeContext,
      webContext:        (perplexityContext ?? "") + (wikiContext ?? "") + (ddgContext ?? ""),
      model:             t.primary,
      historySummarized: histOpt.stats.triggered,
      kbArticleCount:    articles.length,
    });
  }

  // ── Try models in order; grab first 200 streaming response ─────────────────
  let streamResp = null;
  let usedModel = null;
  for (const { model, timeoutMs } of modelsToTry) {
    try {
      streamResp = await tryStreamFetch(model, timeoutMs);
      usedModel = model;
      console.log(`[Stream] ${model} connected`);
      break;
    } catch (e) {
      console.warn(`[Stream] ${model} failed: ${e.message}`);
    }
  }

  if (!streamResp) {
    res.write(`data: ${JSON.stringify({ type: "error", error: "Semua model AI sedang sibuk. Coba lagi dalam beberapa detik." })}\n\n`);
    return res.end();
  }

  // ── Forward chunks to client ─────────────────────────────────────────────────
  const sseReader = streamResp.body.getReader();
  const textDecoder = new TextDecoder();
  let sseBuffer = "";
  let fullContent = "";

  try {
    outer: while (true) {
      const { done, value } = await sseReader.read();
      if (done) break;
      sseBuffer += textDecoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break outer;
        let parsed;
        try { parsed = JSON.parse(raw); } catch { continue; }
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          res.write(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`);
        }
      }
    }
  } catch (streamErr) {
    console.error(`[Stream] read error:`, streamErr.message);
    if (!fullContent) {
      res.write(`data: ${JSON.stringify({ type: "error", error: "Koneksi ke model AI terputus. Coba lagi." })}\n\n`);
      return res.end();
    }
  }

  if (!fullContent) {
    res.write(`data: ${JSON.stringify({ type: "error", error: "Model tidak menghasilkan respons." })}\n\n`);
    return res.end();
  }

  // ── Post-processing ───────────────────────────────────────────────────────────
  const rawReply = postProcessResponse(cleanReply(fullContent));
  // Strip any residual <!--saran:...--> tags the model might still output
  const _stripped = rawReply.replace(/<!--saran:[^>]*-->/gi, "").trimEnd();
  // ── formatAINAResponse: structural formatter — runs on complete response ──
  // Cleans phrases, normalizes sequential lists, splits long paragraphs,
  // ensures trust footer. Always safe to call (try/catch inside).
  let reply = formatAINAResponse(_stripped, {
    intentPrimary: intent.primary,
    sourceMeta,
  });
  console.log(`Responded using model: ${usedModel}`);

  const qualityIssues = validateResponse(reply, { hasExchangeContext: !!exchangeContext });
  if (qualityIssues.length > 0) {
    console.warn(`[ResponseQuality] ${qualityIssues.length} issue(s):`, qualityIssues.map(i => `${i.type}(${i.severity})`).join(", "));
  }

  // ── E4: True retry for unfixable block-severity violations ───────────────
  // C4 (postProcessResponse) strips bad content automatically.
  // If reply is still < 80 chars after stripping → response was almost entirely
  // bad content. Fire a non-streaming correction call and replace reply in done event.
  const blockIssues = qualityIssues.filter(i => i.severity === "block");
  if (blockIssues.length > 0 && reply.trim().length < 80) {
    console.warn(`[E4-Retry] Block-severity detected and reply too short (${reply.trim().length} chars) → triggering correction call`);
    try {
      const correctionPrompt = [
        "Kamu adalah AINA, asisten AI untuk mahasiswa Indonesia di Mesir (Masisir).",
        "Jawab pertanyaan berikut secara LANGSUNG dan informatif dalam Bahasa Indonesia.",
        "DILARANG KERAS: mengucapkan 'tunggu sebentar', 'aku cek dulu', 'aku cari dulu', atau kalimat penundaan sejenis.",
        "DILARANG KERAS: memulai jawaban dengan kata seperti 'Tentu!', 'Baik!', 'Siap!', 'Oke!', atau 'Halo!'.",
        "Mulai langsung dengan konten jawaban.",
      ].join("\n");
      const correctionData = await (async () => {
        const ctrl = new AbortController();
        const tId = setTimeout(() => ctrl.abort(), 15000);
        try {
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST", signal: ctrl.signal,
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://ainalabs.pro",
              "X-Title": "AINA - Asisten Masisir",
            },
            body: JSON.stringify({
              model: OR_PRIMARY,
              messages: [
                { role: "system", content: correctionPrompt },
                ...finalMessages.slice(-3), // only last 3 turns for brevity
              ],
              max_tokens: 2000,
              temperature: 0.4,
            }),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return await r.json();
        } finally {
          clearTimeout(tId);
        }
      })();
      const corrected = correctionData?.choices?.[0]?.message?.content?.trim();
      if (corrected && corrected.length > 60) {
        reply = formatAINAResponse(postProcessResponse(corrected), { intentPrimary: intent.primary, sourceMeta });
        console.log(`[E4-Retry] ✓ correction successful (${reply.length} chars)`);
      } else {
        console.warn(`[E4-Retry] correction returned empty or too short`);
      }
    } catch (retryErr) {
      console.warn(`[E4-Retry] correction call failed: ${retryErr.message}`);
    }
  }

  const responseSources = [];
  if (pinnedUpdates.length > 0)                        responseSources.push("Breaking Update");
  if (articles.length > 0)                             responseSources.push("Knowledge Base AINA");
  if (queryType === "currency" && exchangeRates)       responseSources.push("Kurs Real-time");
  if (dorarResult && dorarResult.hadiths.length > 0)  responseSources.push("Dorar.net");
  if (perplexityResult)                                responseSources.push("Pencarian Web");
  if (wikiResult)                                      responseSources.push("Wikipedia");
  if (ddgResult)                                       responseSources.push("DuckDuckGo");
  if (responseSources.length === 0)                    responseSources.push("Pengetahuan Umum");

  const CONFIDENCE_LABEL_MAP = {
    high_confidence:    "high",
    medium_confidence:  "medium",
    needs_verification: "needs_verification",
  };
  const normalizedConfidence = CONFIDENCE_LABEL_MAP[confidence.level] ?? confidence.level;

  const sourceUsed =
    pinnedUpdates.length > 0     ? "KB"
    : articles.length > 0        ? "KB"
    : perplexityResult           ? "Perplexity"
    : wikiResult                 ? "Wikipedia"
    : ddgResult                  ? "DuckDuckGo"
    : queryType === "currency" && exchangeRates ? "RealTimeAPI"
    : "Model";

  // A3: Log to missing_topics when AI answers purely from model knowledge (no KB, no external sources)
  const INFO_INTENTS = new Set(["factual", "procedural", "confused_procedural", "recommendation", "confused"]);
  if (sourceUsed === "Model" && articles.length === 0 && INFO_INTENTS.has(intent.primary)) {
    logMissingTopic(lastUserMessage, intent.primary);
    console.log(`[MissingTopics] pure-model answer → logged for KB gap analysis (intent=${intent.primary})`);
  }

  // ── Send done event with final metadata ─────────────────────────────────────
  res.write(`data: ${JSON.stringify({
    type:        "done",
    reply,
    model:       usedModel,
    intent:      intent.primary,
    intent_type: intent.primary,
    confidence:  normalizedConfidence,
    source_used: sourceUsed,
    sources:     responseSources,
    citation_urls: perplexityResult?.citations ?? [],
    clarification_pending: clarificationDetected || undefined,
    sourceMetadata: {
      confidence:      normalizedConfidence,
      primary_source:  sourceResult.primary_source,
      sources_used:    sourceResult.sources_used,
      may_be_outdated: sourceResult.may_be_outdated,
      source_summary:  sourceResult.source_summary,
      retrieved_at:    sourceResult.retrieved_at,
      source_used:     sourceUsed,
      intent_type:     intent.primary,
    },
  })}\n\n`);
  res.end();
  console.log(`[CHAT] ✓ done | user=${user.id.slice(0,8)} intent=${intent.primary} ms=${Date.now()-_chatDebugStart} src=${sourceUsed}`);

  // ── Fire-and-forget background tasks (unchanged) ─────────────────────────────
  setImmediate(() => {
    extractAndSaveMemories(user.id, [...messages, { role: "assistant", content: reply }], apiKey);
    if (clarificationDetected) {
      incrementClarificationCount(user.id);
      (async () => {
        const supabase = getAdminClient();
        if (!supabase) return;
        const draft = await extractKBDraftFromClarification(lastUserMessage, prevAiMsg, apiKey);
        if (!draft) {
          console.log(`[Clarif] extraction returned null — nothing submitted`);
          return;
        }
        const articleId = await submitClarificationDraft(draft, user.id, supabase);
        if (articleId) {
          console.log(`[Clarif] ✓ draft submitted — id=${articleId} title="${draft.title.slice(0, 50)}" user=${user.id}`);
        }
      })();
    }
    recordIntelSignal({
      intent,
      kbStrength,
      hasKB:           articles.length > 0,
      hasPinned:       pinnedUpdates.length > 0,
      hasWiki:         !!wikiContext,
      hasDDG:          !!ddgContext,
      hasPerplexity:   !!perplexityContext,
      confidenceLevel: confidence.level,
      confidenceHint:  confidence.hint,
      externalTier:    externalTrust?.tier ?? null,
      query:           lastUserMessage,
    });
    logQuery({
      queryText:   lastUserMessage,
      intentType:  intent.primary ?? null,
      sourceUsed,
      confidence:  normalizedConfidence,
      userId:      user.id,
      hasKbResult: articles.length > 0,
      isTransport: isTransportQuery(lastUserMessage),
    });
  });

  } catch (_chatErr) {
    _chatDebugErr(_chatErr);
    const _errDetail = `[step:${_chatDebugStep}] ${_chatErr?.message ?? "unknown"}`;
    console.error("[CHAT-FAIL]", _errDetail);
    if (!res.headersSent) {
      res.status(500).json({ error: "Terjadi kesalahan, silakan coba lagi.", _debug: _errDetail });
    } else {
      try { res.write(`data: ${JSON.stringify({ type: "error", error: "Terjadi kesalahan, silakan coba lagi.", _debug: _errDetail })}\n\n`); res.end(); } catch {}
    }
  }
});

/* ── User Memories CRUD ──────────────────────────────── */
app.get("/api/memories", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Unauthorized" });

  const { data, error: fetchErr } = await supabase
    .from("user_memories")
    .select("id, memory, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (fetchErr && (fetchErr.code === "42P01" || fetchErr.message?.includes("does not exist"))) {
    return res.json([]); // Table not yet created
  }
  res.json(data ?? []);
});

app.delete("/api/memories/:id", writeLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Unauthorized" });

  const { error: delErr } = await supabase
    .from("user_memories")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", user.id); // Prevent deleting other users' memories

  if (delErr) return res.status(500).json({ error: delErr.message });
  res.json({ success: true });
});

app.delete("/api/memories", writeLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Unauthorized" });

  await supabase.from("user_memories").delete().eq("user_id", user.id);
  res.json({ success: true });
});

/* ── Custom Instructions (ChatGPT-style personalization) ─────── */
app.get("/api/profile/custom-instructions", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Unauthorized" });
  const { data, error: dbErr } = await supabase
    .from("profiles")
    .select("custom_about, custom_instructions")
    .eq("user_id", user.id)
    .single();
  if (dbErr) return res.status(500).json({ error: "DB error" });
  res.json({ custom_about: data?.custom_about ?? "", custom_instructions: data?.custom_instructions ?? "" });
});

app.patch("/api/profile/custom-instructions", writeLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Unauthorized" });

  const sanitizeField = (v) => {
    if (typeof v !== "string") return null;
    return v.trim().slice(0, 1500) || null; // 1500 chars max per field
  };
  const custom_about        = sanitizeField(req.body?.custom_about);
  const custom_instructions = sanitizeField(req.body?.custom_instructions);

  const { error: dbErr } = await supabase
    .from("profiles")
    .update({ custom_about, custom_instructions, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (dbErr) return res.status(500).json({ error: "DB error" });
  res.json({ success: true });
});

/* ── Upload Avatar ───────────────────────────────────── */
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg",  "jpg"],
  ["image/png",  "png"],
  ["image/webp", "webp"],
  ["image/gif",  "gif"],
]);

app.post("/api/upload-avatar", uploadLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server not configured" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });

  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  // Whitelist MIME type — never trust the client blindly
  const safeMime = typeof mimeType === "string" ? mimeType.toLowerCase() : "image/jpeg";
  const ext = ALLOWED_IMAGE_TYPES.get(safeMime);
  if (!ext) return res.status(400).json({ error: "Tipe file tidak didukung. Gunakan JPEG, PNG, WebP, atau GIF." });

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  // Extra size guard (buffer should be ≤ 2MB after base64 decode)
  if (buffer.length > 2 * 1024 * 1024) return res.status(400).json({ error: "Ukuran gambar maksimal 2MB" });

  const storagePath = `${user.id}/avatar.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("avatars")
    .upload(storagePath, buffer, { contentType: safeMime, upsert: true });

  if (uploadErr) return res.status(500).json({ error: uploadErr.message });

  const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(storagePath);
  res.json({ url: publicUrl });
});

/* ── PDF text extraction + OCR ──────────────────────── */
// ocrPdf: renders each page via pdfjs-dist + @napi-rs/canvas → JPEG base64,
// then sends pages in batches to an OpenRouter vision model for text extraction.
const MAX_OCR_PAGES = 10;

// Returns true if the string contains actual readable text (Arabic or Latin words),
// not just metadata/whitespace/numbers.
function hasRealText(str) {
  return /[a-zA-Z\u0600-\u06FF]{3,}/.test(str ?? "");
}

async function ocrPdf(buffer) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  GlobalWorkerOptions.workerSrc = new URL(
    "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url
  ).href;

  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const numPages = Math.min(pdf.numPages, MAX_OCR_PAGES);

  // Render pages to JPEG base64 at 2× scale for sharp Arabic text
  const pageImages = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // 2× for clearer text, especially Arabic
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const b64 = canvas.toBuffer("image/jpeg", { quality: 90 }).toString("base64");
    pageImages.push({ url: `data:image/jpeg;base64,${b64}`, pageNum: i });
    page.cleanup();
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY tidak dikonfigurasi di server");

  // Process pages in parallel (batches of 5 to avoid rate limit)
  const BATCH = 5;
  const results = [];
  for (let i = 0; i < pageImages.length; i += BATCH) {
    const batch = pageImages.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map(async ({ url, pageNum }) => {
        try {
          const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
              "HTTP-Referer": "https://ainalabs.pro",
              "X-Title": "AINA PDF OCR",
            },
            body: JSON.stringify({
              model: "google/gemini-2.0-flash-001",
              messages: [{
                role: "user",
                content: [
                  { type: "image_url", image_url: { url } },
                  {
                    type: "text",
                    text: `Ini adalah halaman ${pageNum} dari sebuah dokumen (bisa berupa catatan kuliah, mulakhos, kitab, atau dokumen akademik). Dokumen mungkin mengandung teks bahasa Arab (kanan ke kiri), Indonesia, atau campuran keduanya, termasuk ayat Al-Qur'an, hadits, atau istilah ilmu syariah.\n\nTugasmu: ekstrak SEMUA teks dari halaman ini dengan akurat dan lengkap — termasuk teks Arab (dengan harakat jika ada), teks Latin, angka, dan simbol. Pertahankan urutan baca yang benar (untuk Arab: kanan ke kiri, atas ke bawah). Pertahankan paragraf, poin-poin, dan struktur aslinya. Kembalikan HANYA teks yang diekstrak, tanpa komentar atau penjelasan apapun.`,
                  },
                ],
              }],
              max_tokens: 4000,
            }),
          });
          const data = await resp.json();
          return data.choices?.[0]?.message?.content?.trim() || "";
        } catch {
          return "";
        }
      })
    );
    results.push(...batchResults);
  }

  const combined = results.filter(Boolean).join("\n\n---\n\n");
  return numPages < pdf.numPages
    ? combined + `\n\n[...${pdf.numPages - numPages} halaman berikutnya tidak di-OCR — dokumen melebihi batas ${MAX_OCR_PAGES} halaman]`
    : combined;
}

/* ── File upload ─────────────────────────────────────── */
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Format tidak didukung. Gunakan PDF, DOCX, TXT, PNG, atau JPG."));
  },
});

app.post("/api/extract-file", uploadLimiter, (req, res, next) => {
  fileUpload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE")
      return res.status(413).json({ error: "File terlalu besar. Maksimal 4 MB." });
    return res.status(400).json({ error: sanitizeErr(err) || "Gagal mengupload file" });
  });
}, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Token tidak valid" });

  // Only contributors, senior_contributors, or admins can upload
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const hasAccess = roles?.some(r => ["contributor", "senior_contributor", "admin"].includes(r.role));
  if (!hasAccess) return res.status(403).json({ error: "Hanya kontributor yang bisa mengupload file" });

  if (!req.file) return res.status(400).json({ error: "File diperlukan" });

  const { buffer, mimetype, originalname } = req.file;
  let extractedText = "";

  try {
    if (mimetype === "text/plain") {
      extractedText = buffer.toString("utf-8");
    } else if (mimetype === "application/pdf") {
      // Step 1: Try regular text extraction (fast, works for text-based PDFs)
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const result = await pdfParse(buffer);
      extractedText = result.text;

      // Step 2: If no text found, auto-run OCR (handles scanned/image PDFs)
      if (!hasRealText(extractedText)) {
        console.log(`[extract-file] No real text in PDF — running OCR on ${originalname}`);
        extractedText = await ocrPdf(buffer);
        if (extractedText) extractedText = "[OCR] " + extractedText;
      }
    } else if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (["image/jpeg", "image/png", "image/webp"].includes(mimetype)) {
      // OCR image via OpenRouter vision model
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY tidak dikonfigurasi");
      const b64 = buffer.toString("base64");
      const dataUrl = `data:${mimetype};base64,${b64}`;
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://ainalabs.pro",
          "X-Title": "AINA Image OCR",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              {
                type: "text",
                text: "Ekstrak semua teks dari gambar ini secara akurat. Gambar mungkin mengandung teks bahasa Indonesia, Arab, atau campuran keduanya — ekstrak semuanya dan pertahankan struktur serta urutan aslinya. Kembalikan HANYA teks yang diekstrak, tanpa komentar atau penjelasan apapun.",
              },
            ],
          }],
          max_tokens: 4000,
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message || "Gagal OCR gambar");
      extractedText = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (extractedText) extractedText = "[OCR dari gambar] " + extractedText;
    } else {
      return res.status(400).json({ error: "Format file tidak dikenali" });
    }
  } catch (e) {
    console.error("[extract-file] parse error:", e.message, "\n", e.stack?.split("\n").slice(0,4).join("\n"));
    return res.status(422).json({ error: `Gagal membaca file: ${e.message}` });
  }

  // Sanitise: collapse excessive blank lines and trim
  extractedText = extractedText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  if (!hasRealText(extractedText)) {
    const isPdf = mimetype === "application/pdf";
    return res.status(422).json({
      error: isPdf
        ? "PDF ini berisi gambar tapi teks tidak bisa dibaca oleh OCR — kemungkinan kualitas scan terlalu rendah, teks tertutup watermark, atau PDF terenkripsi. Coba perbesar resolusi saat scan, atau ketik ulang kontennya."
        : "File tidak mengandung teks yang cukup untuk diekstrak",
    });
  }

  // Cap at 20 000 chars to avoid bloating the knowledge base
  if (extractedText.length > 20_000) {
    extractedText = extractedText.slice(0, 20_000) + "\n\n[...konten dipotong karena terlalu panjang]";
  }

  console.log(`[extract-file] ${user.id} extracted ${extractedText.length} chars from ${originalname}`);
  res.json({ text: extractedText, filename: originalname, chars: extractedText.length });
});

/* ── Chat: PDF/TXT extraction (any authenticated user) ──────── */
const chatFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "text/plain"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Hanya PDF atau TXT yang didukung untuk chat"));
  },
});

/* POST /api/whisper — transcribe audio using OpenAI Whisper
   Body: { audio: base64String, mimeType?: string }
   Returns: { transcript: string }                                            */
app.post("/api/whisper", writeLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan" });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "OpenAI belum dikonfigurasi" });

  const { audio, mimeType = "audio/webm" } = req.body || {};
  if (!audio || typeof audio !== "string") return res.status(400).json({ error: "audio (base64) diperlukan" });
  if (audio.length > 10 * 1024 * 1024) return res.status(413).json({ error: "File audio terlalu besar (maks ~7 MB)" });

  const token = authHeader.replace("Bearer ", "");
  const supabase = getAdminClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Token tidak valid" });

  try {
    const buffer = Buffer.from(audio, "base64");
    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
    const audioBlob = new Blob([buffer], { type: mimeType });
    const formData = new FormData();
    formData.append("model", "whisper-1");
    formData.append("file", audioBlob, `audio.${ext}`);
    // Don't force language — let Whisper auto-detect (supports Indonesian + Arabic + mixed)

    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData,
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.warn(`[Whisper] API error ${resp.status}: ${err.slice(0, 200)}`);
      return res.status(resp.status).json({ error: "Gagal mentranskrip audio. Coba lagi." });
    }

    const data = await resp.json();
    const transcript = data.text?.trim() || "";
    console.log(`[Whisper] ✓ transcript: "${transcript.slice(0, 80)}"`);
    res.json({ transcript });
  } catch (e) {
    console.error("[Whisper] error:", e.message);
    res.status(500).json({ error: "Gagal memproses audio" });
  }
});

app.post("/api/chat/extract-pdf", uploadLimiter, (req, res, next) => {
  chatFileUpload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File terlalu besar. Maksimal 10 MB." });
    return res.status(400).json({ error: sanitizeErr(err) || "Gagal mengupload file" });
  });
}, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan" });

  const supabase = getAdminClient();
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Token tidak valid" });

  if (!req.file) return res.status(400).json({ error: "File diperlukan" });

  const { buffer, mimetype, originalname } = req.file;
  let extractedText = "";

  try {
    if (mimetype === "text/plain") {
      extractedText = buffer.toString("utf-8");
    } else if (mimetype === "application/pdf") {
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const result = await pdfParse(buffer);
      extractedText = result.text;
      if (!hasRealText(extractedText)) {
        extractedText = await ocrPdf(buffer);
        if (extractedText) extractedText = "[OCR] " + extractedText;
      }
    }
  } catch (e) {
    return res.status(422).json({ error: `Gagal membaca file: ${e.message}` });
  }

  extractedText = extractedText
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();

  if (!extractedText || extractedText.trim().length < 10) {
    return res.status(422).json({ error: "PDF tidak mengandung teks yang bisa dibaca. Coba file lain." });
  }

  if (extractedText.length > 25_000) {
    extractedText = extractedText.slice(0, 25_000) + "\n\n[...konten dipotong]";
  }

  console.log(`[chat/extract-pdf] ${user.id} → ${originalname} → ${extractedText.length} chars`);
  res.json({ text: extractedText, filename: originalname, chars: extractedText.length });
});

/* ── Upload: Get presigned URL (file goes directly to Supabase, bypasses Vercel) ── */
app.post("/api/upload-url", async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });

  const supabase = getAdminClient();
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const hasAccess = roles?.some(r => ["contributor", "senior_contributor", "admin"].includes(r.role));
  if (!hasAccess) return res.status(403).json({ error: "Hanya kontributor yang bisa mengupload file" });

  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: "filename diperlukan" });

  const ext = filename.split(".").pop()?.toLowerCase() || "bin";
  const allowed = ["pdf", "txt", "docx", "png", "jpg", "jpeg", "webp"];
  if (!allowed.includes(ext)) return res.status(400).json({ error: "Format tidak didukung. Gunakan PDF, DOCX, TXT, PNG, atau JPG." });

  const storagePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await supabase.storage.from("temp-uploads").createSignedUploadUrl(storagePath);
  if (error) {
    console.error("[upload-url] error:", error.message);
    return res.status(500).json({ error: "Gagal membuat URL upload." });
  }

  return res.json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
});

/* ── Admin: Direct image upload for announcements ─────── */
const adminImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Hanya JPG, PNG, WebP, atau GIF yang diizinkan."));
  },
});

app.post("/api/admin/upload-image", uploadLimiter, (req, res, next) => {
  adminImageUpload.single("file")(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  if (!req.file) return res.status(400).json({ error: "File tidak ditemukan" });

  const supabase = getAdminClient();
  const ext = req.file.mimetype.split("/")[1].replace("jpeg", "jpg");
  const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from("announcements")
    .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

  if (error) {
    console.error("[admin/upload-image] storage error:", error.message);
    return res.status(500).json({ error: "Gagal menyimpan gambar: " + error.message });
  }

  const { data: { publicUrl } } = supabase.storage.from("announcements").getPublicUrl(storagePath);
  return res.json({ publicUrl });
});

/* ── Upload URL for chat (any authenticated user) ────── */
app.post("/api/chat/upload-url", uploadLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });

  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: "filename diperlukan" });

  const ext = filename.split(".").pop()?.toLowerCase() || "bin";
  const allowed = ["pdf", "txt"];
  if (!allowed.includes(ext)) return res.status(400).json({ error: "Hanya PDF atau TXT yang didukung untuk chat." });

  const supabase = getAdminClient();
  const storagePath = `${user.id}/chat-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await supabase.storage.from("temp-uploads").createSignedUploadUrl(storagePath);
  if (error) {
    console.error("[chat/upload-url] error:", error.message);
    return res.status(500).json({ error: "Gagal membuat URL upload." });
  }

  return res.json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
});

/* ── Extract: Process file from Supabase Storage ─────── */
app.post("/api/extract-from-storage", uploadLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });

  const supabase = getAdminClient();
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const hasAccess = roles?.some(r => ["contributor", "senior_contributor", "admin"].includes(r.role));
  if (!hasAccess) return res.status(403).json({ error: "Akses tidak diizinkan" });

  const { path, filename } = req.body;
  if (!path) return res.status(400).json({ error: "path diperlukan" });

  // Download the file from Supabase Storage
  const { data: fileData, error: downloadErr } = await supabase.storage.from("temp-uploads").download(path);
  if (downloadErr) {
    console.error("[extract-from-storage] download error:", downloadErr.message);
    return res.status(500).json({ error: "Gagal mengambil file dari storage: " + downloadErr.message });
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const ext = path.split(".").pop()?.toLowerCase();
  const MIME_MAP = {
    pdf: "application/pdf",
    txt: "text/plain",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  const mimetype = MIME_MAP[ext] || null;
  const originalname = filename || path.split("/").pop() || "file";

  if (!mimetype) {
    supabase.storage.from("temp-uploads").remove([path]).catch(() => {});
    return res.status(400).json({ error: "Format file tidak dikenali" });
  }

  let extractedText = "";
  try {
    if (mimetype === "text/plain") {
      extractedText = buffer.toString("utf-8");
    } else if (mimetype === "application/pdf") {
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const result = await pdfParse(buffer);
      extractedText = result.text;
      if (!hasRealText(extractedText)) {
        console.log(`[extract-from-storage] No real text in PDF — running OCR on ${originalname}`);
        extractedText = await ocrPdf(buffer);
        if (extractedText) extractedText = "[OCR] " + extractedText;
      }
    } else if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (mimetype.startsWith("image/")) {
      // OCR image via OpenRouter vision model
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY tidak dikonfigurasi");
      const b64 = buffer.toString("base64");
      const dataUrl = `data:${mimetype};base64,${b64}`;
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://ainalabs.pro",
          "X-Title": "AINA Image OCR",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              {
                type: "text",
                text: "Ekstrak semua teks dari gambar ini secara akurat. Gambar mungkin mengandung teks bahasa Indonesia, Arab, atau campuran keduanya — ekstrak semuanya dan pertahankan struktur serta urutan aslinya. Kembalikan HANYA teks yang diekstrak, tanpa komentar atau penjelasan apapun.",
              },
            ],
          }],
          max_tokens: 4000,
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message || "Gagal OCR gambar");
      extractedText = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (extractedText) extractedText = "[OCR dari gambar] " + extractedText;
    } else {
      return res.status(400).json({ error: "Format file tidak dikenali" });
    }
  } catch (e) {
    console.error("[extract-from-storage] parse error:", e.message);
    return res.status(422).json({ error: `Gagal membaca file: ${e.message}` });
  } finally {
    // Always delete temp file from storage
    supabase.storage.from("temp-uploads").remove([path]).catch(() => {});
  }

  extractedText = extractedText
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();

  if (!hasRealText(extractedText)) {
    const isPdf = mimetype === "application/pdf";
    return res.status(422).json({
      error: isPdf
        ? "PDF ini berisi gambar tapi teks tidak bisa dibaca oleh OCR — kemungkinan kualitas scan terlalu rendah, teks tertutup watermark, atau PDF terenkripsi. Coba perbesar resolusi saat scan, atau ketik ulang kontennya."
        : "File tidak mengandung teks yang cukup untuk diekstrak",
    });
  }

  if (extractedText.length > 20_000) {
    extractedText = extractedText.slice(0, 20_000) + "\n\n[...konten dipotong karena terlalu panjang]";
  }

  console.log(`[extract-from-storage] ${user.id} extracted ${extractedText.length} chars from ${originalname}`);
  res.json({ text: extractedText, filename: originalname, chars: extractedText.length });
});

/* ── Notifications: Clear all ────────────────────────── */
app.delete("/api/notifications", async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });
  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });
  const { error } = await supabase.from("notifications").delete().eq("user_id", user.id);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ success: true });
});

/* ── Admin: System status / update flag / restart ───── */

// GET /api/admin/system/status
// Returns server uptime and whether a system update was flagged after server start.
app.get("/api/admin/system/status", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  try {
    const supabase = getAdminClient();
    const { data } = await supabase
      .from("system_settings")
      .select("value, updated_at")
      .eq("key", "last_system_update")
      .maybeSingle();

    const lastUpdateAt = data?.updated_at ?? null;
    const needsRestart = lastUpdateAt
      ? new Date(lastUpdateAt).getTime() > SERVER_START_MS
      : false;

    res.json({
      needsRestart,
      serverStartMs: SERVER_START_MS,
      uptimeSecs: Math.floor((Date.now() - SERVER_START_MS) / 1000),
      lastUpdateAt,
    });
  } catch (err) {
    res.json({ needsRestart: false, uptimeSecs: Math.floor((Date.now() - SERVER_START_MS) / 1000) });
  }
});

// POST /api/admin/system/mark-updated
// Sets the "needs restart" flag — call this after deploying code changes.
app.post("/api/admin/system/mark-updated", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  try {
    const supabase = getAdminClient();
    await supabase.from("system_settings").upsert(
      { key: "last_system_update", value: "true", updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    console.log(`[System] mark-updated called by admin ${admin.id}`);
    res.json({ ok: true, markedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/system/restart
// On Vercel: triggers a new deployment via Deploy Hook (set VERCEL_DEPLOY_HOOK_URL env var).
// On Replit/local: gracefully exits the process so the workflow restarts it automatically.
app.post("/api/admin/system/restart", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  // Clear the needs-restart flag regardless of mode
  try {
    const supabase = getAdminClient();
    await supabase.from("system_settings").upsert(
      { key: "last_system_update", value: "false", updated_at: new Date(SERVER_START_MS).toISOString() },
      { onConflict: "key" }
    );
  } catch (_) { /* non-critical */ }

  const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;

  // ── Vercel: trigger a new deployment via Deploy Hook ──────────────
  if (deployHookUrl) {
    try {
      const hookRes = await fetch(deployHookUrl, { method: "POST" });
      const hookData = await hookRes.json().catch(() => ({}));
      console.log(`[System] Vercel deploy hook triggered by ${admin.id}`, hookData);
      return res.json({
        ok: true,
        mode: "vercel_deploy",
        message: "Deployment baru sedang di-proses. Ini memakan waktu 1–3 menit.",
        jobId: hookData?.job?.id ?? null,
      });
    } catch (err) {
      console.error("[System] Deploy hook failed:", err.message);
      return res.status(500).json({ error: "Gagal trigger deploy hook: " + err.message });
    }
  }

  // ── Replit / non-Vercel: exit process, workflow restarts it ───────
  console.log(`[System] Restart via process.exit(0) — initiated by admin ${admin.id}`);
  res.json({ ok: true, mode: "process_restart", message: "Server akan restart dalam 1 detik..." });
  setTimeout(() => process.exit(0), 800);
});

app.get("/api/admin/stats", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const [
    { count: totalUsers },
    { count: totalChats },
    { count: pendingRequests },
    { count: pendingArticles },
    { count: approvedArticles },
    { count: totalArticles },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("chats").select("*", { count: "exact", head: true }),
    supabase.from("contributor_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("knowledge_base").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("knowledge_base").select("*", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("knowledge_base").select("*", { count: "exact", head: true }),
  ]);

  res.json({ totalUsers, totalChats, pendingRequests, pendingArticles, approvedArticles, totalArticles });
});

/* ── Admin: List Users (Master Admin only) ───────────── */
app.get("/api/admin/users", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const [{ data: profiles }, { data: allRoles }, subsResult] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("user_roles").select("user_id, role"),
    Promise.resolve(supabase.from("subscriptions").select("user_id, plan, expires_at")).catch(() => ({ data: [] })),
  ]);
  const subs = subsResult?.data ?? [];

  const roleMap = {};
  (allRoles ?? []).forEach(r => {
    if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
    roleMap[r.user_id].push(r.role);
  });

  const subsMap = {};
  (subs ?? []).forEach(s => { subsMap[s.user_id] = s; });

  const now = new Date();
  const users = (profiles ?? []).map(p => {
    const sub = subsMap[p.user_id];
    const isPro = sub ? new Date(sub.expires_at) > now : false;
    return {
      ...p,
      roles: roleMap[p.user_id] ?? ["user"],
      is_pro: isPro,
      pro_expires_at: sub?.expires_at ?? null,
    };
  });

  res.json(users);
});

/* ── Admin: Set User Role (Master Admin only) ────────── */
app.post("/api/admin/users/:userId/role", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { userId } = req.params;
  const { role } = req.body;
  const validRoles = ["user", "contributor", "senior_contributor", "admin"];
  if (!validRoles.includes(role)) return res.status(400).json({ error: "Invalid role" });

  const supabase = getAdminClient();
  for (const r of validRoles) {
    await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", r);
  }
  await supabase.from("user_roles").insert({ user_id: userId, role });

  const levelMap = { admin: "Admin", senior_contributor: "Senior Contributor", contributor: "Contributor", user: "User" };
  await supabase.from("profiles").update({ level: levelMap[role] }).eq("user_id", userId);

  res.json({ success: true });
});

/* ── Admin: Contributor Requests ─────────────────────── */
app.get("/api/admin/requests", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { status = "pending" } = req.query;
  const { data } = await supabase.from("contributor_requests").select("*").eq("status", status).order("created_at", { ascending: false });
  res.json(data ?? []);
});

app.post("/api/admin/requests/:id/review", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { id } = req.params;
  const { status, review_notes } = req.body;
  if (!["approved", "rejected", "article_reviewed"].includes(status)) return res.status(400).json({ error: "Invalid status" });

  const supabase = getAdminClient();
  const { data: request } = await supabase.from("contributor_requests").select("user_id").eq("id", id).single();
  if (!request) return res.status(404).json({ error: "Request not found" });

  const updatePayload = {
    status,
    reviewed_by: admin.id || null,
    reviewed_at: new Date().toISOString(),
  };
  if (review_notes !== undefined) updatePayload.review_notes = review_notes?.slice(0, 1000) || null;

  // article_reviewed = admin peeked at article but not yet decided; skip role grant
  if (status === "article_reviewed") {
    await supabase.from("contributor_requests").update(updatePayload).eq("id", id);
    return res.json({ success: true });
  }

  await supabase.from("contributor_requests").update(updatePayload).eq("id", id);

  const userInfo = await getUserEmail(request.user_id);
  const appUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "https://ainalabs.pro";

  if (status === "approved") {
    await supabase.from("user_roles").upsert({ user_id: request.user_id, role: "contributor" }, { onConflict: "user_id,role" });
    await supabase.from("profiles").update({ level: "Contributor" }).eq("user_id", request.user_id);
    await supabase.from("notifications").insert({
      user_id: request.user_id,
      title: "Selamat! Kamu jadi Kontributor 🎉",
      message: "Permintaanmu untuk menjadi kontributor telah disetujui. Kamu sekarang bisa menulis dan mengirim artikel ke Knowledge Base AINA.",
      type: "success",
    }).then(undefined, () => {});
    if (userInfo?.email) {
      await sendEmail({
        to: userInfo.email,
        name: userInfo.full_name || "Masisir",
        subject: "Selamat! Kamu resmi jadi Kontributor AINA 🎉",
        html: emailTemplate({
          title: "Permintaanmu disetujui!",
          body: `Halo <strong>${userInfo.full_name || "Masisir"}</strong>,<br><br>
Kabar gembira! Tim admin AINA telah menyetujui permintaanmu untuk menjadi <strong>Kontributor</strong>.<br><br>
Sebagai kontributor, kamu sekarang bisa:<br>
• Menulis dan mengirim artikel ke Knowledge Base AINA<br>
• Membantu sesama Masisir dengan pengalaman dan pengetahuanmu<br>
• Mendapatkan status <em>Senior Contributor</em> setelah 10 artikel disetujui<br><br>
Yuk, mulai berkontribusi sekarang!`,
          ctaText: "Mulai Berkontribusi",
          ctaUrl: `${appUrl}/dashboard?tab=contributor`,
        }),
      });
    }
  } else {
    await supabase.from("notifications").insert({
      user_id: request.user_id,
      title: "Permintaan kontributor ditolak",
      message: "Permintaanmu untuk menjadi kontributor belum bisa disetujui saat ini. Kamu tetap bisa menggunakan semua fitur AINA.",
      type: "warning",
    }).then(undefined, () => {});
    if (userInfo?.email) {
      await sendEmail({
        to: userInfo.email,
        name: userInfo.full_name || "Masisir",
        subject: "Update permintaan kontributor AINA",
        html: emailTemplate({
          title: "Permintaan kontributor belum disetujui",
          body: `Halo <strong>${userInfo.full_name || "Masisir"}</strong>,<br><br>
Setelah ditinjau, permintaanmu untuk menjadi kontributor AINA belum bisa disetujui saat ini.<br><br>
Kamu tetap bisa menggunakan semua fitur AINA seperti biasa. Jika ada pertanyaan, silakan hubungi tim kami.<br><br>
Terima kasih sudah tertarik berkontribusi untuk komunitas Masisir!`,
          ctaText: "Kembali ke AINA",
          ctaUrl: `${appUrl}/dashboard`,
        }),
      });
    }
  }

  res.json({ success: true });
});

/* ── Announcements (user-facing) ─────────────────────── */
app.get("/api/announcements/active", async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const now = new Date().toISOString();

  // Get user profile + roles in parallel
  const [profileResult, rolesResult] = await Promise.all([
    supabase.from("profiles").select("created_at").eq("user_id", user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const isNewUser = profileResult.data?.created_at
    ? (Date.now() - new Date(profileResult.data.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000
    : false;
  const userRoles = rolesResult.data ?? [];
  const isContributor = userRoles.some(r => ["contributor", "senior_contributor", "admin"].includes(r.role));
  const isAdmin = userRoles.some(r => r.role === "admin");

  // Fetch active announcements that haven't expired
  const { data: announcements, error } = await supabase
    .from("system_announcements")
    .select("*")
    .eq("is_active", true)
    .or(`start_at.is.null,start_at.lte.${now}`)
    .or(`end_at.is.null,end_at.gte.${now}`)
    .order("created_at", { ascending: false });

  if (error) return res.json([]);
  if (!announcements || announcements.length === 0) return res.json([]);

  // Filter by audience_type (falls back to target_audience for backward compat)
  const audienceMatches = (a) => {
    const audience = a.audience_type || a.target_audience || "all_users";
    if (audience === "all_users") return true;
    if (audience === "new_users") return isNewUser;
    if (audience === "old_users") return !isNewUser;
    if (audience === "contributors") return isContributor;
    if (audience === "non_contributors") return !isContributor;
    if (audience === "admins") return isAdmin;
    if (audience === "selected_users") {
      const ids = a.selected_user_ids ?? [];
      return Array.isArray(ids) ? ids.includes(user.id) : false;
    }
    return false;
  };

  const audienceFiltered = announcements.filter(audienceMatches);
  if (audienceFiltered.length === 0) return res.json([]);

  // For show_once_per_user announcements, filter out already-dismissed ones
  const announcementIds = audienceFiltered.map(a => a.id);
  const { data: views } = await supabase
    .from("user_announcement_views")
    .select("announcement_id, dismissed_at")
    .eq("user_id", user.id)
    .in("announcement_id", announcementIds);

  const dismissedIds = new Set(
    (views ?? []).filter(v => v.dismissed_at).map(v => v.announcement_id)
  );

  const filtered = audienceFiltered.filter(a => {
    if (a.show_once_per_user && dismissedIds.has(a.id)) return false;
    return true;
  });

  if (filtered.length === 0) return res.json([]);

  // Mark as seen (analytics only)
  const seenRecords = filtered.map(a => ({
    user_id: user.id,
    announcement_id: a.id,
    seen_at: now,
  }));
  await supabase.from("user_announcement_views").upsert(seenRecords, {
    onConflict: "user_id,announcement_id",
    ignoreDuplicates: true,
  });

  res.json(filtered);
});

app.post("/api/announcements/:id/dismiss", async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  const supabase = getAdminClient();
  const now = new Date().toISOString();

  await supabase.from("user_announcement_views").upsert({
    user_id: user.id,
    announcement_id: id,
    seen_at: now,
    dismissed_at: now,
  }, { onConflict: "user_id,announcement_id" });

  res.json({ success: true });
});

/* ── Master Admin: Announcement CRUD ────────────────── */
app.get("/api/master/announcements", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Tidak diizinkan" });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("system_announcements")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/master/announcements", writeLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Tidak diizinkan" });

  const { title, message, type, target_audience, is_active, button_text, button_link, dismissible, start_at, end_at, image_url, show_once_per_user, trigger_type, delay_seconds, selected_user_ids } = req.body;
  if (!title?.trim() || !message?.trim()) return res.status(400).json({ error: "title and message required" });
  const validTypes = ["welcome", "announcement"];
  const validAudiences = ["new_users", "old_users", "all_users", "contributors", "non_contributors", "selected_users", "admins"];
  const validTriggers = ["on_dashboard_open", "after_first_chat"];
  if (type && !validTypes.includes(type)) return res.status(400).json({ error: "Invalid type" });
  if (target_audience && !validAudiences.includes(target_audience)) return res.status(400).json({ error: "Invalid target_audience" });
  if (trigger_type && !validTriggers.includes(trigger_type)) return res.status(400).json({ error: "Invalid trigger_type" });

  // Parse selected_user_ids: accept array or newline/comma-separated string
  let parsedUserIds = null;
  if (target_audience === "selected_users") {
    if (Array.isArray(selected_user_ids)) parsedUserIds = selected_user_ids.filter(Boolean);
    else if (typeof selected_user_ids === "string")
      parsedUserIds = selected_user_ids.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase.from("system_announcements").insert({
    title: title.trim().slice(0, 200),
    message: message.trim().slice(0, 2000),
    type: type || "announcement",
    target_audience: target_audience || "all_users",
    is_active: is_active !== false,
    button_text: button_text?.trim().slice(0, 100) || null,
    button_link: button_link?.trim().slice(0, 500) || null,
    dismissible: dismissible !== false,
    start_at: start_at || null,
    end_at: end_at || null,
    image_url: image_url?.trim().slice(0, 1000) || null,
    show_once_per_user: show_once_per_user === true,
    trigger_type: validTriggers.includes(trigger_type) ? trigger_type : "on_dashboard_open",
    delay_seconds: Number.isInteger(delay_seconds) ? Math.min(Math.max(delay_seconds, 0), 60) : 5,
    selected_user_ids: parsedUserIds,
    created_by: admin.id,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.patch("/api/master/announcements/:id", writeLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Tidak diizinkan" });

  const { id } = req.params;
  const { title, message, type, target_audience, is_active, button_text, button_link, dismissible, start_at, end_at, image_url, show_once_per_user, trigger_type, delay_seconds, selected_user_ids } = req.body;
  const supabase = getAdminClient();

  const validTriggers = ["on_dashboard_open", "after_first_chat"];

  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim().slice(0, 200);
  if (message !== undefined) updates.message = message.trim().slice(0, 2000);
  if (type !== undefined) updates.type = type;
  if (target_audience !== undefined) updates.target_audience = target_audience;
  if (is_active !== undefined) updates.is_active = is_active;
  if (button_text !== undefined) updates.button_text = button_text?.trim().slice(0, 100) || null;
  if (button_link !== undefined) updates.button_link = button_link?.trim().slice(0, 500) || null;
  if (dismissible !== undefined) updates.dismissible = dismissible;
  if (start_at !== undefined) updates.start_at = start_at || null;
  if (end_at !== undefined) updates.end_at = end_at || null;
  if (image_url !== undefined) updates.image_url = image_url?.trim().slice(0, 1000) || null;
  if (show_once_per_user !== undefined) updates.show_once_per_user = show_once_per_user === true;
  if (trigger_type !== undefined && validTriggers.includes(trigger_type)) updates.trigger_type = trigger_type;
  if (delay_seconds !== undefined) updates.delay_seconds = Number.isInteger(delay_seconds) ? Math.min(Math.max(delay_seconds, 0), 60) : 5;
  if (selected_user_ids !== undefined) {
    if (target_audience === "selected_users" || updates.target_audience === "selected_users") {
      if (Array.isArray(selected_user_ids)) updates.selected_user_ids = selected_user_ids.filter(Boolean);
      else if (typeof selected_user_ids === "string")
        updates.selected_user_ids = selected_user_ids.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    } else {
      updates.selected_user_ids = null;
    }
  }

  const { data, error } = await supabase.from("system_announcements").update(updates).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/master/announcements/:id", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Tidak diizinkan" });

  const { id } = req.params;
  const supabase = getAdminClient();
  await supabase.from("system_announcements").delete().eq("id", id);
  res.json({ success: true });
});

// Reset all user views for an announcement so it re-appears for everyone
app.delete("/api/master/announcements/:id/views", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Tidak diizinkan" });

  const { id } = req.params;
  const supabase = getAdminClient();
  const { error, count } = await supabase
    .from("user_announcement_views")
    .delete({ count: "exact" })
    .eq("announcement_id", id);
  if (error) return res.status(500).json({ error: error.message });
  console.log(`[ANNOUNCE] Reset ${count ?? "?"} views for announcement ${id} by admin ${admin.id}`);
  res.json({ success: true, reset: count ?? 0 });
});

/* ── Admin: Knowledge Base ───────────────────────────── */
app.get("/api/admin/articles", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const masterAdmin = isMasterAdminId(admin.id);
  const supabase = getAdminClient();
  const { status = "pending" } = req.query;
  let query = supabase
    .from("knowledge_base")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (!masterAdmin) {
    query = query.neq("hidden", true);
  }

  const { data: articles } = await query;

  if (!articles || articles.length === 0) return res.json([]);

  const authorIds = [...new Set(articles.map(a => a.author_id).filter(Boolean))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, email")
    .in("user_id", authorIds);

  const profileMap = {};
  (profiles ?? []).forEach(p => { profileMap[p.user_id] = p; });

  const result = articles.map(a => {
    const { embedding, ...rest } = a;
    return {
      ...rest,
      has_embedding: !!embedding,
      author_name: profileMap[a.author_id]?.full_name ?? null,
      author_email: profileMap[a.author_id]?.email ?? null,
    };
  });

  res.json(result);
});

app.patch("/api/admin/articles/:id/visibility", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const { id } = req.params;
  const { hidden } = req.body;
  if (typeof hidden !== "boolean") return res.status(400).json({ error: "hidden (boolean) diperlukan" });

  const supabase = getAdminClient();
  const { error } = await supabase.from("knowledge_base").update({ hidden }).eq("id", id);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  return res.json({ success: true, hidden });
});

/* ── Master Admin: Bulk hide / show selected articles ── */
app.patch("/api/admin/articles/bulk-visibility", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const { ids, hidden } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids (array) diperlukan" });
  if (typeof hidden !== "boolean") return res.status(400).json({ error: "hidden (boolean) diperlukan" });

  const supabase = getAdminClient();
  const { error } = await supabase.from("knowledge_base").update({ hidden }).in("id", ids);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  return res.json({ success: true, updated: ids.length, hidden });
});

/* ── Master Admin: Auto-kategorisasi artikel yang dipilih ── */
app.post("/api/admin/articles/auto-categorize/selected", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids (array) diperlukan" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key tidak tersedia" });

  const supabase = getAdminClient();
  const { data: articles, error } = await supabase
    .from("knowledge_base")
    .select("id, title, content")
    .in("id", ids)
    .eq("status", "approved");

  if (error) return res.status(500).json({ error: error.message });
  if (!articles?.length) return res.json({ updated: 0, errors: 0, results: [] });

  const results = [];
  let updated = 0, errors = 0;

  for (const art of articles) {
    try {
      const prompt = buildAutoCatPrompt(art.title, art.content);
      const data = await callOpenRouter(apiKey, {
        messages: [{ role: "user", content: prompt }],
        temperature: 0.0,
        max_tokens: 80,
        timeoutMs: 20_000,
        label: "SelAutoCat",
      });
      const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
      const parsed = parseAutoCatResponse(raw);
      const newCategory = resolveCategoryFromAI(parsed?.category);
      const newType = VALID_TYPES.includes(parsed?.article_type) ? parsed.article_type : null;
      if (newCategory) {
        const update = { category: newCategory };
        if (newType) update.article_type = newType;
        await supabase.from("knowledge_base").update(update).eq("id", art.id);
        results.push({ id: art.id, category: newCategory, article_type: newType });
        updated++;
      } else {
        console.warn("[SelAutoCat] rejected:", art.id, "AI cat:", parsed?.category);
        errors++;
        results.push({ id: art.id, error: "kategori tidak valid: " + parsed?.category });
      }
    } catch (e) { errors++; results.push({ id: art.id, error: String(e) }); }
    await new Promise(r => setTimeout(r, 250));
  }

  return res.json({ updated, errors, results });
});

/* ── Master Admin: Auto-kategorisasi satu artikel dan save ── */
app.post("/api/admin/articles/:id/auto-categorize", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const { id } = req.params;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key tidak tersedia" });

  const supabase = getAdminClient();
  const { data: art } = await supabase
    .from("knowledge_base").select("id, title, content, category").eq("id", id).single();
  if (!art) return res.status(404).json({ error: "Artikel tidak ditemukan" });

  const prompt = buildAutoCatPrompt(art.title, art.content);

  try {
    const data = await callOpenRouter(apiKey, {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.0,
      max_tokens: 80,
      timeoutMs: 20_000,
      label: "AutoCat",
    });
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = parseAutoCatResponse(raw);
    const newCategory = resolveCategoryFromAI(parsed?.category);
    const newType = VALID_TYPES.includes(parsed?.article_type) ? parsed.article_type : null;
    if (!newCategory) {
      console.warn("[AutoCat] rejected AI category:", parsed?.category, "| raw:", raw.slice(0, 200));
      return res.status(502).json({ error: "Kategori tidak dapat diidentifikasi dari AI" });
    }

    const update = { category: newCategory };
    if (newType) update.article_type = newType;
    const { error: dbErr } = await supabase.from("knowledge_base").update(update).eq("id", id);
    if (dbErr) {
      console.error("[AutoCat single] DB update failed:", dbErr.message, "| category:", newCategory);
      return res.status(500).json({ error: `DB update gagal: ${dbErr.message}` });
    }
    return res.json({ success: true, id, category: newCategory, article_type: newType });
  } catch (e) {
    console.error("[auto-categorize single]", e);
    return res.status(500).json({ error: String(e) });
  }
});

/* ── Master Admin: Auto-generate judul untuk satu artikel ── */
app.post("/api/admin/articles/:id/auto-title", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const { id } = req.params;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key tidak tersedia" });

  const supabase = getAdminClient();
  const { data: art } = await supabase
    .from("knowledge_base").select("id, title, content, category").eq("id", id).single();
  if (!art) return res.status(404).json({ error: "Artikel tidak ditemukan" });

  const prompt = `Kamu adalah editor Knowledge Base untuk komunitas mahasiswa Indonesia di Mesir (Masisir). Tugasmu: buat judul artikel yang PALING OPTIMAL.

Kriteria judul yang baik:
- Spesifik dan informatif — pembaca langsung tahu isinya tanpa perlu buka artikel
- Bahasa Indonesia yang baku dan jelas
- 5-12 kata (cukup panjang untuk deskriptif, cukup pendek untuk mudah dibaca)
- Mengandung kata kunci utama yang dicari orang (misal: "iqomah", "metro Kairo", "daftar Al-Azhar")
- TIDAK clickbait, tidak ambigu, tidak terlalu generik
- Hindari pembuka tidak perlu: "Tips...", "Panduan Lengkap...", "Cara..." kecuali memang judulnya tentang cara/tips

Kategori: ${art.category || "umum"}
Judul saat ini: ${art.title}
Konten: ${(art.content || "").slice(0, 2500)}

Jawab HANYA dengan JSON:
{"title":"<judul baru yang optimal>"}`;

  try {
    const data = await callOpenRouter(apiKey, {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 100,
      timeoutMs: 20_000,
      label: "AutoTitle",
    });
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: "Gagal parse respons AI" });
    const parsed = JSON.parse(match[0]);
    const newTitle = typeof parsed.title === "string" && parsed.title.trim().length > 0
      ? parsed.title.trim() : null;
    if (!newTitle) return res.status(502).json({ error: "Judul tidak valid dari AI" });

    await supabase.from("knowledge_base").update({ title: newTitle }).eq("id", id);
    return res.json({ success: true, id, oldTitle: art.title, newTitle });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

/* ── Master Admin: Auto-generate judul untuk artikel yang dipilih ── */
app.post("/api/admin/articles/auto-title/selected", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids (array) diperlukan" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key tidak tersedia" });

  const supabase = getAdminClient();
  const { data: articles, error } = await supabase
    .from("knowledge_base")
    .select("id, title, content, category")
    .in("id", ids);

  if (error) return res.status(500).json({ error: error.message });
  if (!articles?.length) return res.json({ updated: 0, errors: 0, results: [] });

  const results = [];
  let updated = 0, errors = 0;

  for (const art of articles) {
    try {
      const prompt = `Kamu adalah editor Knowledge Base untuk komunitas mahasiswa Indonesia di Mesir (Masisir). Tugasmu: buat judul artikel yang PALING OPTIMAL.

Kriteria judul yang baik:
- Spesifik dan informatif — pembaca langsung tahu isinya tanpa perlu buka artikel
- Bahasa Indonesia yang baku dan jelas
- 5-12 kata (cukup panjang untuk deskriptif, cukup pendek untuk mudah dibaca)
- Mengandung kata kunci utama yang dicari orang (misal: "iqomah", "metro Kairo", "daftar Al-Azhar")
- TIDAK clickbait, tidak ambigu, tidak terlalu generik
- Hindari pembuka tidak perlu: "Tips...", "Panduan Lengkap...", "Cara..." kecuali memang judulnya tentang cara/tips

Kategori: ${art.category || "umum"}
Judul saat ini: ${art.title}
Konten: ${(art.content || "").slice(0, 2500)}

Jawab HANYA dengan JSON:
{"title":"<judul baru yang optimal>"}`;

      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ainalabs.pro",
          "X-Title": "AINA BulkAutoTitle",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 100,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (resp.ok) {
        const data = await resp.json();
        const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          const newTitle = typeof parsed.title === "string" && parsed.title.trim().length > 0 ? parsed.title.trim() : null;
          if (newTitle) {
            await supabase.from("knowledge_base").update({ title: newTitle }).eq("id", art.id);
            results.push({ id: art.id, oldTitle: art.title, newTitle });
            updated++;
          } else { errors++; results.push({ id: art.id, error: "invalid title" }); }
        } else { errors++; results.push({ id: art.id, error: "parse error" }); }
      } else { errors++; results.push({ id: art.id, error: "api error" }); }
    } catch (e) { errors++; results.push({ id: art.id, error: String(e) }); }
    await new Promise(r => setTimeout(r, 250));
  }

  return res.json({ updated, errors, results });
});

app.post("/api/admin/articles/:id/review", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { id } = req.params;
  const { status } = req.body;
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });

  const supabase = getAdminClient();
  const { data: article } = await supabase.from("knowledge_base").select("author_id, title, category").eq("id", id).single();
  if (!article) return res.status(404).json({ error: "Article not found" });

  await supabase.from("knowledge_base").update({ status }).eq("id", id);

  // Fire-and-forget keyword generation, summary, important_notes, duplicate check, and embedding when article is approved
  if (status === "approved") {
    triggerKeywordGen(id);
    triggerSummaryGen(id);
    triggerImportantNotesGen(id);
    checkAndArchiveDuplicate(supabase, id, article.title, article.category).catch(() => {});
    embedKBArticle(id).catch(() => {});
  }

  const articleData = article; // alias — already has title

  const authorInfo = await getUserEmail(article.author_id);
  const appUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "https://ainalabs.pro";
  const articleTitle = articleData?.title ?? "artikelmu";

  if (status === "approved") {
    const { data: profile } = await supabase.from("profiles").select("contribution_count").eq("user_id", article.author_id).single();
    if (profile) {
      const newCount = (profile.contribution_count || 0) + 1;
      const level = newCount >= 10 ? "Senior Contributor" : "Contributor";
      await supabase.from("profiles").update({ contribution_count: newCount, level }).eq("user_id", article.author_id);
      if (newCount >= 10) {
        await supabase.from("user_roles").upsert({ user_id: article.author_id, role: "senior_contributor" }, { onConflict: "user_id,role" });
        await supabase.from("notifications").insert({
          user_id: article.author_id,
          title: "Selamat! Kamu naik jadi Senior Contributor 🌟",
          message: `Artikelmu "${articleTitle}" telah disetujui. Kamu kini berstatus Senior Contributor karena sudah ${newCount} artikel disetujui!`,
          type: "success",
        }).then(undefined, () => {});
        if (authorInfo?.email) {
          await sendEmail({
            to: authorInfo.email,
            name: authorInfo.full_name || "Kontributor",
            subject: `Artikel disetujui + Naik jadi Senior Contributor! 🌟`,
            html: emailTemplate({
              title: "Artikel disetujui & kamu naik level!",
              body: `Halo <strong>${authorInfo.full_name || "Kontributor"}</strong>,<br><br>
Artikel <strong>"${articleTitle}"</strong> telah disetujui dan kini tersedia di Knowledge Base AINA.<br><br>
Lebih dari itu — dengan <strong>${newCount} artikel disetujui</strong>, kamu resmi naik ke status <strong>Senior Contributor</strong>! Pencapaian luar biasa untuk komunitas Masisir. 🌟<br><br>
Terus berkontribusi dan bantu sesama mahasiswa Indonesia di Mesir!`,
              ctaText: "Lihat Kontribusimu",
              ctaUrl: `${appUrl}/dashboard?tab=contributor`,
            }),
          });
        }
      } else {
        await supabase.from("notifications").insert({
          user_id: article.author_id,
          title: "Artikel kamu disetujui! ✅",
          message: `Artikel "${articleTitle}" telah disetujui dan kini tersedia di Knowledge Base AINA. Total kontribusimu: ${newCount} artikel.`,
          type: "success",
        }).then(undefined, () => {});
        if (authorInfo?.email) {
          await sendEmail({
            to: authorInfo.email,
            name: authorInfo.full_name || "Kontributor",
            subject: `Artikel "${articleTitle}" disetujui! ✅`,
            html: emailTemplate({
              title: "Artikelmu telah disetujui!",
              body: `Halo <strong>${authorInfo.full_name || "Kontributor"}</strong>,<br><br>
Artikel <strong>"${articleTitle}"</strong> telah ditinjau dan disetujui oleh tim admin AINA. Artikel kamu kini tersedia di Knowledge Base dan bisa diakses oleh seluruh Masisir.<br><br>
Total artikel yang sudah disetujui: <strong>${newCount} artikel</strong>.<br><br>
Terima kasih sudah berkontribusi untuk komunitas Masisir!`,
              ctaText: "Lihat Kontribusimu",
              ctaUrl: `${appUrl}/dashboard?tab=contributor`,
            }),
          });
        }
      }
    }
  } else {
    await supabase.from("notifications").insert({
      user_id: article.author_id,
      title: "Artikel belum bisa disetujui",
      message: `Artikel "${articleTitle}" belum bisa dipublikasikan saat ini. Silakan perbaiki dan kirim ulang.`,
      type: "warning",
    }).then(undefined, () => {});
    if (authorInfo?.email) {
      await sendEmail({
        to: authorInfo.email,
        name: authorInfo.full_name || "Kontributor",
        subject: `Update artikel "${articleTitle}"`,
        html: emailTemplate({
          title: "Artikel belum bisa dipublikasikan",
          body: `Halo <strong>${authorInfo.full_name || "Kontributor"}</strong>,<br><br>
Setelah ditinjau, artikel <strong>"${articleTitle}"</strong> belum bisa dipublikasikan di Knowledge Base AINA saat ini.<br><br>
Kamu bisa merevisi artikel dan mengirimnya kembali melalui dashboard. Kami menghargai setiap kontribusimu untuk komunitas Masisir.<br><br>
Jika ada pertanyaan, jangan ragu untuk menghubungi tim admin.`,
          ctaText: "Kirim Artikel Baru",
          ctaUrl: `${appUrl}/dashboard?tab=contributor`,
        }),
      });
    }
  }

  res.json({ success: true });
});

/* ── Admin: Bulk Review Articles ──────────────────── */
/* POST /api/admin/articles/bulk-parse — parse raw text into articles using AI */
app.post("/api/admin/articles/bulk-parse", strictLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const { rawText } = req.body;
  if (!rawText?.trim()) return res.status(400).json({ error: "rawText diperlukan" });
  if (rawText.length > 50_000) return res.status(400).json({ error: "Teks terlalu panjang (maks 50.000 karakter)" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "AI tidak dikonfigurasi" });

  const systemPrompt = `Kamu adalah parser knowledge base untuk AINA, asisten AI untuk mahasiswa Indonesia di Mesir (Masisir).

Tugasmu: analisis teks yang diberikan dan ekstrak semua topik/informasi yang bisa dijadikan artikel knowledge base yang berguna.

Untuk setiap artikel yang kamu temukan, buat objek JSON dengan field berikut:
- "title": judul singkat dan deskriptif dalam bahasa Indonesia (maks 80 karakter)
- "content": konten lengkap dalam format markdown yang rapi dan informatif. Pertahankan semua detail penting. Gunakan bullet point (•) untuk daftar, **bold** untuk info kritis.
- "category": HARUS salah satu dari: administrasi, kehidupan_mesir, akademik, keuangan, transportasi, kesehatan, lainnya
- "keywords": kata kunci pencarian dipisah koma dalam bahasa Indonesia (5-10 kata kunci relevan)

ATURAN:
- Ekstrak semua topik yang berbeda sebagai artikel TERPISAH
- Jangan gabungkan topik yang tidak berkaitan dalam satu artikel
- Minimal 1 artikel, maksimal 20 artikel
- Jika teks berisi Q&A atau FAQ, setiap pasang Q&A bisa jadi 1 artikel
- Jika teks berisi panduan panjang dengan banyak subtopik, pecah jadi beberapa artikel
- Content harus bermanfaat dan lengkap, bukan hanya ringkasan
- HANYA kembalikan JSON array, tidak ada teks lain

Format output: [{"title":"...","content":"...","category":"...","keywords":"..."},...]`;

  try {
    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://aina.masisir.com",
        "X-Title": "AINA Admin Bulk Parse",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse teks berikut menjadi artikel-artikel knowledge base:\n\n${rawText.slice(0, 40_000)}` },
        ],
        temperature: 0.2,
        max_tokens: 8000,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[bulk-parse] AI error:", errText);
      return res.status(500).json({ error: "AI gagal memproses teks" });
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content ?? "";

    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.status(422).json({ error: "AI tidak menghasilkan JSON yang valid. Coba lagi." });

    let articles;
    try {
      articles = JSON.parse(jsonMatch[0]);
    } catch {
      return res.status(422).json({ error: "JSON tidak bisa diparsing. Coba lagi." });
    }

    if (!Array.isArray(articles) || articles.length === 0) {
      return res.status(422).json({ error: "Tidak ada artikel yang berhasil diekstrak dari teks ini." });
    }

    const VALID_CATS = new Set(["administrasi","kehidupan_mesir","akademik","keuangan","transportasi","kesehatan","lainnya"]);
    const cleaned = articles
      .filter(a => a.title?.trim() && a.content?.trim())
      .slice(0, 20)
      .map(a => ({
        title: String(a.title).slice(0, 120).trim(),
        content: String(a.content).trim(),
        category: VALID_CATS.has(a.category) ? a.category : "lainnya",
        keywords: String(a.keywords || "").slice(0, 300).trim(),
      }));

    if (cleaned.length === 0) return res.status(422).json({ error: "Tidak ada artikel valid yang diekstrak." });

    res.json({ articles: cleaned, total: cleaned.length });
  } catch (e) {
    console.error("[bulk-parse]", e.message);
    res.status(500).json({ error: "Terjadi kesalahan saat memproses teks" });
  }
});

/* POST /api/admin/articles/image-extract — extract text from image using AI vision */
const imageExtractUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Hanya file gambar yang diizinkan"));
  },
});

app.post("/api/admin/articles/image-extract", imageExtractUpload.single("image"), async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  if (!req.file) return res.status(400).json({ error: "File gambar diperlukan" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key tidak tersedia" });

  try {
    const base64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype;
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: "Ekstrak SEMUA teks yang ada di gambar ini secara lengkap dan akurat. Jika ada tabel, format sebagai teks biasa. Jika ada poin-poin atau menu, tuliskan satu per satu. Jangan tambahkan komentar, penjelasan, atau interpretasi — hanya teks asli dari gambar. Jika gambar tidak mengandung teks yang bermakna, balas dengan: [TIDAK ADA TEKS]",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
        max_tokens: 4000,
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error("[image-extract] AI error:", err);
      return res.status(500).json({ error: "AI gagal membaca gambar" });
    }

    const aiData = await aiRes.json();
    const extractedText = aiData.choices?.[0]?.message?.content?.trim() ?? "";

    if (!extractedText || extractedText === "[TIDAK ADA TEKS]") {
      return res.status(422).json({ error: "Tidak ada teks yang bisa diekstrak dari gambar ini" });
    }

    return res.json({ text: extractedText });
  } catch (e) {
    console.error("[image-extract]", e.message);
    return res.status(500).json({ error: "Gagal memproses gambar: " + e.message });
  }
});

/* ── Auto-deduplication: archive older article if new one covers same topic ───
   Called after any article is approved (admin create, bulk import, review).
   Uses word-overlap (Jaccard) on normalised titles within the same category.
   Threshold = 55 % overlap → considered duplicate.
   Old article is HIDDEN (not deleted) so master admin can restore it.
   ─────────────────────────────────────────────────────────────────────────── */
async function checkAndArchiveDuplicate(supabase, newArticleId, newTitle, category) {
  if (!newTitle || !category) return null;
  try {
    function words(str) {
      return new Set(
        str.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2)
      );
    }
    function jaccard(a, b) {
      const setA = words(a), setB = words(b);
      if (!setA.size || !setB.size) return 0;
      let overlap = 0;
      for (const w of setA) if (setB.has(w)) overlap++;
      const union = new Set([...setA, ...setB]).size;
      return overlap / union;
    }

    const { data: existing } = await supabase
      .from("knowledge_base")
      .select("id, title, created_at")
      .eq("category", category)
      .eq("status", "approved")
      .eq("hidden", false)
      .neq("id", newArticleId);

    if (!existing?.length) return null;

    let best = null, bestScore = 0;
    for (const art of existing) {
      const score = jaccard(newTitle, art.title);
      if (score > bestScore) { bestScore = score; best = art; }
    }

    if (bestScore < 0.55 || !best) return null;

    // Archive the older article
    await supabase.from("knowledge_base").update({ hidden: true }).eq("id", best.id);

    // Notify all master admins
    const masterIds = [...MASTER_ADMIN_IDS];
    if (masterIds.length > 0) {
      await supabase.from("notifications").insert(
        masterIds.map(userId => ({
          user_id: userId,
          title: "🔄 Artikel lama diarsipkan otomatis",
          message: `Artikel lama "${best.title}" (kategori: ${category}) diarsipkan karena artikel baru "${newTitle}" terdeteksi membahas topik serupa (kesamaan ${Math.round(bestScore * 100)}%). Artikel lama masih tersimpan dan bisa dipulihkan dari panel admin → Knowledge Base.`,
          type: "info",
        }))
      ).then(undefined, () => {});
    }

    console.log(`[DuplicateCheck] Archived "${best.title}" → replaced by "${newTitle}" (${Math.round(bestScore * 100)}% match)`);
    return { archivedId: best.id, archivedTitle: best.title, score: bestScore };
  } catch (e) {
    console.warn("[DuplicateCheck] error:", e.message);
    return null;
  }
}

/* POST /api/admin/articles/bulk-import — insert parsed articles into KB */
app.post("/api/admin/articles/bulk-import", strictLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const { articles } = req.body;
  if (!Array.isArray(articles) || articles.length === 0) return res.status(400).json({ error: "articles array diperlukan" });
  if (articles.length > 20) return res.status(400).json({ error: "Maksimal 20 artikel per import" });

  // Must match DB CHECK constraint exactly (case-sensitive)
  const VALID_CATS = new Set(["Administrasi","Akademik","Kehidupan Mesir","Transport","Tempat Tinggal","Kuliner","Bahasa"]);
  const supabase = getAdminClient();

  const [hasTypeCol, hasKwCol, hasMapsUrlCol] = await Promise.all([
    detectArticleTypeCol(supabase),
    detectKeywordsCol(supabase),
    detectMapsUrlCol(supabase),
  ]);

  let imported = 0;
  const errors = [];

  for (const art of articles) {
    if (!art.title?.trim() || !art.content?.trim()) { errors.push(`Skip: judul/konten kosong`); continue; }
    const category = VALID_CATS.has(art.category) ? art.category : "Administrasi";

    const safeType = ["narrative","step_by_step"].includes(art.article_type) ? art.article_type : "narrative";

    const payload = {
      author_id: admin.id,
      title: String(art.title).slice(0, 120).trim(),
      content: String(art.content).trim(),
      category,
      status: "approved",
      hidden: false,
      ...(hasTypeCol    ? { article_type: safeType } : {}),
      ...(hasKwCol      ? { keywords: String(art.keywords || "").slice(0, 300).trim() } : {}),
      ...(hasMapsUrlCol ? { maps_url: art.maps_url?.trim() || null } : {}),
    };

    const { data: inserted, error } = await supabase.from("knowledge_base").insert(payload).select("id").single();

    if (error) {
      errors.push(`Gagal: ${art.title?.slice(0, 40)} — ${error.message}`);
    } else {
      imported++;
      // Fire-and-forget duplicate check + embedding
      if (inserted?.id) {
        checkAndArchiveDuplicate(supabase, inserted.id, payload.title, category).catch(() => {});
        embedKBArticle(inserted.id).catch(() => {});
      }
    }
  }

  // Increment contribution_count for the admin who uploaded these articles
  if (imported > 0) {
    const { data: profile } = await supabase.from("profiles").select("contribution_count").eq("user_id", admin.id).single();
    const prev = profile?.contribution_count || 0;
    const newCount = prev + imported;
    const level = newCount >= 10 ? "Senior Contributor" : "Contributor";
    await supabase.from("profiles").update({ contribution_count: newCount, level }).eq("user_id", admin.id);
  }

  res.json({ imported, total: articles.length, errors });
});

app.post("/api/admin/articles/bulk-review", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { ids, status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });

  const supabase = getAdminClient();
  const { data: articles } = await supabase.from("knowledge_base").select("id, title, category, author_id, status").in("id", ids);
  if (!articles?.length) return res.status(404).json({ error: "No articles found" });

  const pendingArticles = articles.filter(a => a.status === "pending");
  if (pendingArticles.length === 0) return res.json({ updated: 0 });

  const pendingIds = pendingArticles.map(a => a.id);
  await supabase.from("knowledge_base").update({ status }).in("id", pendingIds);

  // Fire-and-forget: keyword + summary + important_notes + duplicate check + embedding for all newly approved articles
  if (status === "approved") {
    for (const art of pendingArticles) {
      triggerKeywordGen(art.id);
      triggerSummaryGen(art.id);
      triggerImportantNotesGen(art.id);
      checkAndArchiveDuplicate(supabase, art.id, art.title, art.category).catch(() => {});
      embedKBArticle(art.id).catch(() => {});
    }
  }

  if (status === "approved") {
    const authorGroups = {};
    for (const art of pendingArticles) {
      if (!authorGroups[art.author_id]) authorGroups[art.author_id] = [];
      authorGroups[art.author_id].push(art);
    }
    for (const [authorId, arts] of Object.entries(authorGroups)) {
      const { data: profile } = await supabase.from("profiles").select("contribution_count").eq("user_id", authorId).single();
      const prev = profile?.contribution_count || 0;
      const newCount = prev + arts.length;
      const level = newCount >= 10 ? "Senior Contributor" : "Contributor";
      await supabase.from("profiles").update({ contribution_count: newCount, level }).eq("user_id", authorId);
      const titles = arts.map(a => `"${a.title}"`).join(", ");
      await supabase.from("notifications").insert({
        user_id: authorId,
        title: arts.length > 1 ? `${arts.length} artikel kamu disetujui! ✅` : `Artikel kamu disetujui! ✅`,
        message: arts.length > 1
          ? `Artikel ${titles} telah disetujui dan kini tersedia di Knowledge Base AINA.`
          : `Artikel ${titles} telah disetujui dan kini tersedia di Knowledge Base AINA.`,
        type: "success",
      }).then(undefined, () => {});
    }
  } else {
    const authorGroups = {};
    for (const art of pendingArticles) {
      if (!authorGroups[art.author_id]) authorGroups[art.author_id] = [];
      authorGroups[art.author_id].push(art);
    }
    for (const [authorId, arts] of Object.entries(authorGroups)) {
      await supabase.from("notifications").insert({
        user_id: authorId,
        title: arts.length > 1 ? `${arts.length} artikel belum bisa disetujui` : "Artikel belum bisa disetujui",
        message: arts.length > 1
          ? `Artikel ${arts.map(a => `"${a.title}"`).join(", ")} belum bisa dipublikasikan saat ini.`
          : `Artikel "${arts[0].title}" belum bisa dipublikasikan saat ini.`,
        type: "warning",
      }).then(undefined, () => {});
    }
  }

  res.json({ updated: pendingIds.length });
});

/* ── In-memory tracker for bulk keyword generation progress ── */
let _kwGenState = { running: false, total: 0, generated: 0, errors: 0, startedAt: null, completedAt: null };

/* In-memory progress tracker for embedding jobs */
let _embedState = { running: false, total: 0, embedded: 0, errors: 0, startedAt: null, completedAt: null };
// Circuit breaker: set true when OpenAI quota is exceeded, so queries skip vector search
// and fall through immediately to keyword search without latency penalty.
let vectorSearchDisabled = false;

/* GET /api/admin/articles/generate-embeddings/status */
app.get("/api/admin/articles/generate-embeddings/status", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const { count: withEmbedding } = await supabase
    .from("knowledge_base")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved")
    .not("embedding", "is", null);
  const { count: totalApproved } = await supabase
    .from("knowledge_base")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved");
  res.json({ ..._embedState, withEmbedding: withEmbedding ?? 0, totalArticles: totalApproved ?? 0, openaiConfigured: !!process.env.OPENAI_API_KEY });
});

/* POST /api/admin/articles/generate-embeddings — batch re-embed approved articles
   Body: { ids?: string[] } — if provided, only embed those IDs; otherwise embed all approved */
app.post("/api/admin/articles/generate-embeddings", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "OPENAI_API_KEY not configured" });
  if (_embedState.running) return res.json({ alreadyRunning: true, ..._embedState });

  const supabase = getAdminClient();
  const { ids: requestedIds } = req.body || {};
  const isSelective = Array.isArray(requestedIds) && requestedIds.length > 0;

  let articleIds;
  if (isSelective) {
    articleIds = requestedIds;
  } else {
    const { data: articles } = await supabase
      .from("knowledge_base")
      .select("id")
      .eq("status", "approved");
    articleIds = (articles || []).map(a => a.id);
  }

  if (!articleIds.length) return res.json({ started: false, total: 0 });

  _embedState = { running: true, total: articleIds.length, embedded: 0, errors: 0, startedAt: new Date().toISOString(), completedAt: null };
  vectorSearchDisabled = false; // Reset circuit breaker when admin manually triggers embedding
  res.json({ started: true, total: articleIds.length });

  // Fire-and-forget: embed each article with progress tracking + adaptive rate limiting
  (async () => {
    let delayMs = 1000; // Start at 1 req/s; slows automatically if rate limited
    for (const id of articleIds) {
      let retries = 0;
      let done = false;
      while (!done && retries < 4) {
        try {
          await embedKBArticle(id, { rethrow: true });
          _embedState.embedded++;
          done = true;
        } catch (e) {
          const isRateLimit = e.message?.includes("429");
          if (isRateLimit && retries < 3) {
            delayMs = Math.min(delayMs * 3, 22000); // Ramp up: 1s→3s→9s→22s
            const waitMs = 20000 * (retries + 1);
            console.warn(`[RAG] Admin embed: rate limited — slowing to ${delayMs / 1000}s/req, waiting ${waitMs / 1000}s...`);
            await new Promise(r => setTimeout(r, waitMs));
            retries++;
          } else {
            _embedState.errors++;
            done = true;
          }
        }
      }
      await new Promise(r => setTimeout(r, delayMs));
    }
    _embedState.running = false;
    _embedState.completedAt = new Date().toISOString();
    console.log(`[RAG] Batch embedding complete: ${_embedState.embedded}/${articleIds.length} embedded, ${_embedState.errors} errors`);
  })();
});

/* GET /api/admin/articles/generate-keywords/status */
app.get("/api/admin/articles/generate-keywords/status", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const [{ count: withKw }, { count: totalApproved }] = await Promise.all([
    supabase.from("knowledge_base").select("*", { count: "exact", head: true }).eq("status", "approved").not("keywords", "is", null).neq("keywords", ""),
    supabase.from("knowledge_base").select("*", { count: "exact", head: true }).eq("status", "approved"),
  ]);
  res.json({ ..._kwGenState, withKeywords: withKw ?? 0, totalArticles: totalApproved ?? 0 });
});

/* ── Admin: Bulk-generate keywords for all approved articles ── */
app.post("/api/admin/articles/generate-keywords", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  if (_kwGenState.running) {
    return res.json({ started: false, alreadyRunning: true, ..._kwGenState });
  }

  const supabase = getAdminClient();
  const regenerate = req.body?.regenerate !== false;
  let query = supabase.from("knowledge_base").select("id, title, content, category").eq("status", "approved");
  if (!regenerate) query = query.is("keywords", null);

  const { data: articles, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  if (!articles?.length) return res.json({ started: false, generated: 0, total: 0 });

  // Initialise tracker and respond immediately
  _kwGenState = { running: true, total: articles.length, generated: 0, errors: 0, startedAt: new Date().toISOString(), completedAt: null };
  res.json({ started: true, total: articles.length });

  // Process in background
  let generated = 0, errors = 0;
  for (const art of articles) {
    try {
      const keywords = await generateArticleKeywords(art.title, art.content, art.category);
      if (keywords) {
        await supabase.from("knowledge_base").update({ keywords }).eq("id", art.id);
        generated++;
      } else { errors++; }
    } catch { errors++; }
    _kwGenState.generated = generated;
    _kwGenState.errors = errors;
    await new Promise(r => setTimeout(r, 200));
  }
  _kwGenState = { ..._kwGenState, running: false, generated, errors, completedAt: new Date().toISOString() };
  console.log(`[KB] Keyword generation done: ${generated}/${articles.length} updated, ${errors} errors`);
});

/* ── Admin: Bulk Auto-Categorize existing KB articles ── */
let _autoCatState = { running: false, total: 0, processed: 0, updated: 0, errors: 0, startedAt: null, completedAt: null };

app.get("/api/admin/articles/auto-categorize/status", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const { count: totalArticles } = await supabase
    .from("knowledge_base").select("*", { count: "exact", head: true }).eq("status", "approved");
  res.json({ ..._autoCatState, totalArticles: totalArticles ?? 0 });
});

app.post("/api/admin/articles/auto-categorize/bulk", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  if (_autoCatState.running) return res.json({ started: false, alreadyRunning: true, ..._autoCatState });

  const supabase = getAdminClient();
  const { data: articles, error } = await supabase
    .from("knowledge_base")
    .select("id, title, content, category, article_type")
    .eq("status", "approved");

  if (error) return res.status(500).json({ error: error.message });
  if (!articles?.length) return res.json({ started: false, total: 0 });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key tidak tersedia" });

  _autoCatState = { running: true, total: articles.length, processed: 0, updated: 0, errors: 0, startedAt: new Date().toISOString(), completedAt: null };
  res.json({ started: true, total: articles.length });

  // Run in background
  let processed = 0, updated = 0, errors = 0;
  for (const art of articles) {
    const prompt = buildAutoCatPrompt(art.title, art.content);

    try {
      const data = await callOpenRouter(apiKey, {
        messages: [{ role: "user", content: prompt }],
        temperature: 0.0,
        max_tokens: 80,
        timeoutMs: 20_000,
        label: "BulkAutoCat",
      });
      const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
      const parsed = parseAutoCatResponse(raw);
      const newCategory = resolveCategoryFromAI(parsed?.category);
      const newType = VALID_TYPES.includes(parsed?.article_type) ? parsed.article_type : null;
      if (newCategory) {
        const update = { category: newCategory };
        if (newType) update.article_type = newType;
        await supabase.from("knowledge_base").update(update).eq("id", art.id);
        updated++;
      } else {
        console.warn("[BulkAutoCat] rejected:", art.id, "AI cat:", parsed?.category);
        errors++;
      }
    } catch (aiErr) {
      console.error("[BulkAutoCat] article", art.id, aiErr.message);
      errors++;
    }

    processed++;
    _autoCatState.processed = processed;
    _autoCatState.updated = updated;
    _autoCatState.errors = errors;
    await new Promise(r => setTimeout(r, 300));
  }

  _autoCatState = { ..._autoCatState, running: false, processed, updated, errors, completedAt: new Date().toISOString() };
  console.log(`[AutoCat] Bulk done: ${updated}/${articles.length} updated, ${errors} errors`);
});

/* ── Admin: Input Article Directly ──────────────────── */
app.post("/api/admin/articles", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { title, content, category, maps_url, contact_number: rawAdminContact } = req.body;
  if (!title || !content || !category) return res.status(400).json({ error: "title, content, category required" });

  const insertPayload = {
    author_id: admin.id,
    title,
    content,
    category,
    status: "approved",
  };
  if (typeof maps_url === "string" && maps_url.trim()) {
    insertPayload.maps_url = maps_url.trim().slice(0, 1000);
  }
  if (typeof rawAdminContact === "string" && rawAdminContact.trim()) {
    insertPayload.contact_number = rawAdminContact.trim().slice(0, 50);
  }

  const { data: inserted, error } = await supabase.from("knowledge_base").insert(insertPayload).select("id").single();

  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  // Increment contribution_count for the admin who created this article
  const { data: profile } = await supabase.from("profiles").select("contribution_count").eq("user_id", admin.id).single();
  const prev = profile?.contribution_count || 0;
  const newCount = prev + 1;
  const level = newCount >= 10 ? "Senior Contributor" : "Contributor";
  await supabase.from("profiles").update({ contribution_count: newCount, level }).eq("user_id", admin.id);

  // Fire-and-forget duplicate check + embedding
  if (inserted?.id) {
    checkAndArchiveDuplicate(supabase, inserted.id, insertPayload.title, insertPayload.category).catch(() => {});
    embedKBArticle(inserted.id).catch(() => {});
  }

  res.json({ success: true });
});

app.delete("/api/admin/articles/:id", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { data: art } = await supabase.from("knowledge_base").select("id, status, author_id").eq("id", req.params.id).single();
  if (art?.status === "approved" && !isMasterAdminId(admin.id)) {
    return res.status(403).json({ error: "Tidak diizinkan" });
  }

  await supabase.from("knowledge_base").delete().eq("id", req.params.id);

  // Decrement contribution_count if the deleted article was approved and authored by the deleting user
  if (art?.status === "approved" && art?.author_id === admin.id) {
    const { data: profile } = await supabase.from("profiles").select("contribution_count").eq("user_id", admin.id).single();
    const newCount = Math.max(0, (profile?.contribution_count || 0) - 1);
    const level = newCount >= 10 ? "Senior Contributor" : "Contributor";
    await supabase.from("profiles").update({ contribution_count: newCount, level }).eq("user_id", admin.id);
  }

  res.json({ success: true });
});

/* ── Admin: Translate Article to Arabic ───────────────── */
app.post("/api/admin/articles/:id/translate-arabic", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { data: art, error: artErr } = await supabase
    .from("knowledge_base")
    .select("id, title, content")
    .eq("id", req.params.id)
    .single();

  if (artErr) {
    console.error("[Translate Arabic] DB error:", artErr.message);
    return res.status(500).json({ error: "Gagal mengambil artikel: " + artErr.message });
  }
  if (!art) return res.status(404).json({ error: "Artikel tidak ditemukan" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "OPENAI_API_KEY belum dikonfigurasi" });

  try {
    const prompt = `Terjemahkan artikel berikut ke dalam Bahasa Arab (فصحى / Modern Standard Arabic).
Judul: ${art.title}

Konten:
${art.content}

Kembalikan hanya terjemahan konten dalam Bahasa Arab tanpa judul, tanpa penjelasan tambahan.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Kamu adalah penerjemah profesional Indonesia-Arab. Terjemahkan teks ke Bahasa Arab Modern (فصحى) yang jelas dan tepat." },
          { role: "user", content: prompt },
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[Translate Arabic] OpenAI error:", err.slice(0, 200));
      return res.status(502).json({ error: "Terjemahan gagal. Coba lagi." });
    }

    const data = await response.json();
    const content_ar = data.choices?.[0]?.message?.content?.trim() || "";
    if (!content_ar) return res.status(502).json({ error: "Model tidak menghasilkan terjemahan. Coba lagi." });

    const { error: updateErr } = await supabase
      .from("knowledge_base")
      .update({ content_ar })
      .eq("id", req.params.id);

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    console.log(`[Translate Arabic] ✓ article=${req.params.id} len=${content_ar.length}`);
    res.json({ content_ar });
  } catch (err) {
    console.error("[Translate Arabic] error:", err.message);
    res.status(500).json({ error: "Terjemahan gagal: " + err.message });
  }
});

/* ── Admin: Bulk Delete Articles ─────────────────────── */
app.post("/api/admin/articles/bulk-delete", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });

  const supabase = getAdminClient();
  const isMaster = isMasterAdminId(admin.id);

  let allowedIds = ids;
  if (!isMaster) {
    const { data: arts } = await supabase.from("knowledge_base").select("id, status").in("id", ids);
    const approved = (arts ?? []).filter(a => a.status === "approved").map(a => a.id);
    if (approved.length > 0) {
      return res.status(403).json({ error: "Tidak diizinkan" });
    }
    allowedIds = ids;
  }

  const { error, count } = await supabase.from("knowledge_base").delete({ count: "exact" }).in("id", allowedIds);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  res.json({ deleted: count ?? allowedIds.length });
});

/* ── Admin: Edit Article ──────────────────────────────── */
app.patch("/api/admin/articles/:id", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { title, content, category, keywords, maps_url, contact_number, article_type, summary, important_notes } = req.body;
  const updatePayload = { title, content, category };
  if (typeof keywords === "string") updatePayload.keywords = keywords.trim().slice(0, 500);
  if (typeof maps_url === "string") updatePayload.maps_url = maps_url.trim().slice(0, 1000) || null;
  if (typeof contact_number === "string") updatePayload.contact_number = contact_number.trim().slice(0, 50) || null;
  const VALID_TYPES = ["step_by_step", "narrative"];
  if (VALID_TYPES.includes(article_type)) updatePayload.article_type = article_type;
  if (typeof summary === "string") updatePayload.summary = summary.trim().slice(0, 600) || null;
  if (typeof important_notes === "string") updatePayload.important_notes = important_notes.trim().slice(0, 1000) || null;
  const { error } = await supabase.from("knowledge_base").update(updatePayload).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ success: true });
});

/* ── P2: Usage analytics endpoint ───────────────────────────────────────────── */
app.get("/api/admin/usage-stats", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const since14d  = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const todayStr  = new Date().toISOString().split("T")[0];
  const todayStart = `${todayStr}T00:00:00.000Z`;

  const [
    { data: queryLogs },
    { data: newProfiles },
    { count: todayChats },
    { count: totalThreads },
    { count: totalMessages },
  ] = await Promise.all([
    supabase.from("query_log").select("user_id, created_at").gte("created_at", since14d).order("created_at"),
    supabase.from("profiles").select("created_at").gte("created_at", since14d).order("created_at"),
    supabase.from("chats").select("*", { count: "exact", head: true }).gte("created_at", todayStart),
    supabase.from("threads").select("*", { count: "exact", head: true }),
    supabase.from("messages").select("*", { count: "exact", head: true }),
  ]);

  // Build 14-day buckets
  const days = {};
  for (let i = 13; i >= 0; i--) {
    const d   = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0];
    const label = d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Cairo" });
    days[key] = { date: key, label, queries: 0, users: new Set(), new_users: 0 };
  }
  (queryLogs ?? []).forEach(r => {
    const key = r.created_at.split("T")[0];
    if (days[key]) { days[key].queries++; if (r.user_id) days[key].users.add(r.user_id); }
  });
  (newProfiles ?? []).forEach(r => {
    const key = r.created_at.split("T")[0];
    if (days[key]) days[key].new_users++;
  });

  const daily_14d = Object.values(days).map(d => ({
    date: d.date, label: d.label,
    queries: d.queries, dau: d.users.size, new_users: d.new_users,
  }));

  const today = days[todayStr] || { queries: 0, users: new Set(), new_users: 0 };

  res.json({
    today: {
      queries: today.queries,
      active_users: today.users?.size ?? 0,
      new_users: today.new_users,
      new_chats: todayChats ?? 0,
    },
    daily_14d,
    totals: { threads: totalThreads ?? 0, messages: totalMessages ?? 0 },
  });
});

/* ── Master Admin: Reformat Single Article ──────────── */
app.post("/api/admin/articles/:id/reformat", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key tidak dikonfigurasi" });

  const supabase = getAdminClient();
  const { data: art } = await supabase
    .from("knowledge_base")
    .select("id, title, content, category")
    .eq("id", req.params.id)
    .single();
  if (!art) return res.status(404).json({ error: "Artikel tidak ditemukan" });

  const prompt = `Kamu adalah editor konten profesional untuk knowledge base AINA — platform informasi mahasiswa Indonesia di Mesir (Masisir).

Tugasmu: Format ulang artikel berikut menjadi Markdown yang bersih, terstruktur, dan mudah dibaca. JANGAN mengubah, menambah, atau menghilangkan informasi apapun — tugasmu hanya memperbaiki format dan struktur.

Judul artikel: "${art.title}"
Kategori: "${art.category}"

Konten asli:
<KONTEN>
${art.content.slice(0, 10000)}
</KONTEN>

ATURAN FORMAT (wajib diikuti):
- Gunakan ## untuk subjudul utama, ### untuk sub-bagian (JANGAN gunakan # karena judul artikel sudah ditampilkan terpisah)
- Pisahkan setiap paragraf dengan satu baris kosong
- Gunakan - untuk poin-poin dalam list yang tidak berurutan
- Gunakan 1. 2. 3. untuk langkah-langkah yang berurutan
- Gunakan **teks** untuk istilah penting, nama dokumen, atau hal yang perlu ditekankan
- Jangan gunakan tabel
- Jika konten sudah terstruktur dengan baik, pertahankan strukturnya — jangan ubah yang tidak perlu

ATURAN KONTEN (wajib diikuti):
- PERTAHANKAN semua teks Arab (ayat Al-Qur'an, hadits, istilah Arab, nama Arab) PERSIS seperti aslinya — JANGAN diterjemahkan, JANGAN diubah, JANGAN dihapus
- PERTAHANKAN transliterasi Arab-Latin jika ada (contoh: "Shahada Qaid", "iqomah", "imtihan")
- JANGAN menambahkan terjemahan baru untuk teks Arab yang tidak ada terjemahannya di konten asli
- Bahasa Indonesia di artikel tetap ditulis dalam bahasa Indonesia yang natural

Kembalikan HANYA teks konten yang sudah diformat. Tanpa JSON, tanpa penjelasan, tanpa komentar tambahan.`;

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://ainalabs.pro",
        "X-Title": "AINA Article Reformatter",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
      }),
    });
    const data = await resp.json();
    if (data.error) return res.status(500).json({ error: sanitizeErr(data.error) || "AI error" });

    const newContent = data.choices?.[0]?.message?.content?.trim();
    if (!newContent || newContent.length < 50) return res.status(500).json({ error: "Hasil reformat kosong" });

    const { error } = await supabase
      .from("knowledge_base").update({ content: newContent }).eq("id", art.id);
    if (error) return res.status(500).json({ error: sanitizeErr(error) });

    console.log(`[REFORMAT-ONE] master=${admin.id} article=${art.id}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── Master Admin: Reformat All Articles ────────────── */
app.post("/api/admin/articles/reformat-all", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key tidak dikonfigurasi" });

  const supabase = getAdminClient();
  const { data: articles } = await supabase
    .from("knowledge_base")
    .select("id, title, content, category")
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (!articles || articles.length === 0) return res.json({ reformatted: 0, failed: 0 });

  let reformatted = 0;
  let failed = 0;

  for (const art of articles) {
    const prompt = `Kamu adalah editor konten profesional untuk knowledge base AINA — platform informasi mahasiswa Indonesia di Mesir (Masisir).

Tugasmu: Format ulang artikel berikut menjadi Markdown yang bersih, terstruktur, dan mudah dibaca. JANGAN mengubah, menambah, atau menghilangkan informasi apapun — tugasmu hanya memperbaiki format dan struktur.

Judul artikel: "${art.title}"
Kategori: "${art.category}"

Konten asli:
<KONTEN>
${art.content.slice(0, 10000)}
</KONTEN>

ATURAN FORMAT (wajib diikuti):
- Gunakan ## untuk subjudul utama, ### untuk sub-bagian (JANGAN gunakan # karena judul artikel sudah ditampilkan terpisah)
- Pisahkan setiap paragraf dengan satu baris kosong
- Gunakan - untuk poin-poin dalam list yang tidak berurutan
- Gunakan 1. 2. 3. untuk langkah-langkah yang berurutan
- Gunakan **teks** untuk istilah penting, nama dokumen, atau hal yang perlu ditekankan
- Jangan gunakan tabel
- Jika konten sudah terstruktur dengan baik, pertahankan strukturnya — jangan ubah yang tidak perlu

ATURAN KONTEN (wajib diikuti):
- PERTAHANKAN semua teks Arab (ayat Al-Qur'an, hadits, istilah Arab, nama Arab) PERSIS seperti aslinya — JANGAN diterjemahkan, JANGAN diubah, JANGAN dihapus
- PERTAHANKAN transliterasi Arab-Latin jika ada (contoh: "Shahada Qaid", "iqomah", "imtihan")
- JANGAN menambahkan terjemahan baru untuk teks Arab yang tidak ada terjemahannya di konten asli
- Bahasa Indonesia di artikel tetap ditulis dalam bahasa Indonesia yang natural

Kembalikan HANYA teks konten yang sudah diformat. Tanpa JSON, tanpa penjelasan, tanpa komentar tambahan.`;

    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://ainalabs.pro",
          "X-Title": "AINA Article Reformatter",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4000,
        }),
      });

      const data = await resp.json();
      if (data.error) { failed++; continue; }

      const newContent = data.choices?.[0]?.message?.content?.trim();
      if (!newContent || newContent.length < 50) { failed++; continue; }

      const { error } = await supabase
        .from("knowledge_base")
        .update({ content: newContent })
        .eq("id", art.id);

      if (error) { failed++; } else { reformatted++; }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300));
    } catch {
      failed++;
    }
  }

  console.log(`[REFORMAT] master=${admin.id} | done=${reformatted} failed=${failed} total=${articles.length}`);
  res.json({ reformatted, failed, total: articles.length });
});

/* POST /api/admin/articles/bulk-reformat — reformat only selected articles */
app.post("/api/admin/articles/bulk-reformat", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key tidak dikonfigurasi" });

  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids diperlukan" });
  if (ids.length > 50) return res.status(400).json({ error: "Maksimal 50 artikel per batch" });

  const supabase = getAdminClient();
  const { data: articles } = await supabase
    .from("knowledge_base")
    .select("id, title, content, category")
    .in("id", ids);

  if (!articles || articles.length === 0) return res.json({ reformatted: 0, failed: 0, total: 0 });

  let reformatted = 0;
  let failed = 0;

  for (const art of articles) {
    const prompt = `Kamu adalah editor konten profesional untuk knowledge base AINA — platform informasi mahasiswa Indonesia di Mesir (Masisir).

Tugasmu: Format ulang artikel berikut menjadi Markdown yang bersih, terstruktur, dan mudah dibaca. JANGAN mengubah, menambah, atau menghilangkan informasi apapun — tugasmu hanya memperbaiki format dan struktur.

Judul artikel: "${art.title}"
Kategori: "${art.category}"

Konten asli:
<KONTEN>
${art.content.slice(0, 10000)}
</KONTEN>

ATURAN FORMAT (wajib diikuti):
- Gunakan ## untuk subjudul utama, ### untuk sub-bagian (JANGAN gunakan # karena judul artikel sudah ditampilkan terpisah)
- Pisahkan setiap paragraf dengan satu baris kosong
- Gunakan - untuk poin-poin dalam list yang tidak berurutan
- Gunakan 1. 2. 3. untuk langkah-langkah yang berurutan
- Gunakan **teks** untuk istilah penting, nama dokumen, atau hal yang perlu ditekankan
- Jangan gunakan tabel
- Jika konten sudah terstruktur dengan baik, pertahankan strukturnya — jangan ubah yang tidak perlu

ATURAN KONTEN (wajib diikuti):
- PERTAHANKAN semua teks Arab (ayat Al-Qur'an, hadits, istilah Arab, nama Arab) PERSIS seperti aslinya — JANGAN diterjemahkan, JANGAN diubah, JANGAN dihapus
- PERTAHANKAN transliterasi Arab-Latin jika ada (contoh: "Shahada Qaid", "iqomah", "imtihan")
- JANGAN menambahkan terjemahan baru untuk teks Arab yang tidak ada terjemahannya di konten asli
- Bahasa Indonesia di artikel tetap ditulis dalam bahasa Indonesia yang natural

Kembalikan HANYA teks konten yang sudah diformat. Tanpa JSON, tanpa penjelasan, tanpa komentar tambahan.`;

    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://ainalabs.pro",
          "X-Title": "AINA Article Reformatter",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4000,
        }),
      });

      const data = await resp.json();
      if (data.error) { failed++; continue; }

      const newContent = data.choices?.[0]?.message?.content?.trim();
      if (!newContent || newContent.length < 50) { failed++; continue; }

      const { error } = await supabase
        .from("knowledge_base")
        .update({ content: newContent })
        .eq("id", art.id);

      if (error) { failed++; } else { reformatted++; }

      await new Promise(r => setTimeout(r, 300));
    } catch {
      failed++;
    }
  }

  console.log(`[REFORMAT-BULK] master=${admin.id} | done=${reformatted} failed=${failed} total=${articles.length}`);
  res.json({ reformatted, failed, total: articles.length });
});

/* ── Master Admin: Waitlist Pro ──────────────────────── */
app.get("/api/admin/waitlist", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("beta_feedback")
    .select("*")
    .ilike("message", "[WAITLIST PRO]%")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  const entries = (data ?? []).map(row => ({
    id: row.id,
    email: row.email ?? row.user_email ?? null,
    user_id: row.user_id ?? null,
    created_at: row.created_at,
  }));

  res.json(entries);
});

/* ── Master Admin: Grant / Revoke Pro ────────────────── */
app.post("/api/admin/users/:userId/grant-pro", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const { userId } = req.params;
  const { plan = "pro_monthly", days = 30 } = req.body;
  const supabase = getAdminClient();

  const expiresAt = new Date(Date.now() + days * 86400 * 1000).toISOString();
  const { error } = await supabase.from("subscriptions").upsert({
    user_id: userId,
    plan,
    order_id: `manual_${admin.id}_${Date.now()}`,
    amount: 0,
    expires_at: expiresAt,
    activated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  await supabase.from("notifications").insert({
    user_id: userId,
    title: "AINA Pro Aktif!",
    message: `Akses Pro kamu telah diaktifkan oleh admin hingga ${new Date(expiresAt).toLocaleDateString("id-ID")}.`,
    type: "success",
  }).catch(() => {});

  console.log(`[GRANT PRO] master=${admin.id} → user=${userId} plan=${plan} days=${days} expires=${expiresAt}`);
  res.json({ success: true, expires_at: expiresAt });
});

app.delete("/api/admin/users/:userId/grant-pro", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const { userId } = req.params;
  const supabase = getAdminClient();
  const { error } = await supabase.from("subscriptions").delete().eq("user_id", userId);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  await supabase.from("notifications").insert({
    user_id: userId,
    title: "Akses Pro Dicabut",
    message: "Akses Pro kamu telah dicabut oleh admin.",
    type: "info",
  }).catch(() => {});

  console.log(`[REVOKE PRO] master=${admin.id} → user=${userId}`);
  res.json({ success: true });
});

/* ── Master Admin: Export CSV ────────────────────────── */
function toCSV(rows, columns) {
  const header = columns.map(c => `"${c.label}"`).join(",");
  const lines = rows.map(row =>
    columns.map(c => {
      const val = row[c.key] ?? "";
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(",")
  );
  return [header, ...lines].join("\n");
}

app.get("/api/admin/export/users", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const supabase = getAdminClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, email, level, origin_city, faculty, study_field, arrival_year, contribution_count, created_at, is_banned")
    .order("created_at", { ascending: false });

  const csv = toCSV(profiles ?? [], [
    { key: "user_id",           label: "User ID" },
    { key: "full_name",         label: "Nama" },
    { key: "email",             label: "Email" },
    { key: "level",             label: "Level" },
    { key: "origin_city",       label: "Kota Asal" },
    { key: "faculty",           label: "Fakultas" },
    { key: "study_field",       label: "Jurusan" },
    { key: "arrival_year",      label: "Tahun Datang" },
    { key: "contribution_count",label: "Jumlah Artikel" },
    { key: "is_banned",         label: "Dibanned" },
    { key: "created_at",        label: "Tanggal Daftar" },
  ]);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="aina_users_${Date.now()}.csv"`);
  res.send(csv);
});

app.get("/api/admin/export/articles", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const supabase = getAdminClient();
  const { data: articles } = await supabase
    .from("knowledge_base")
    .select("id, title, category, status, hidden, created_at, author_id")
    .order("created_at", { ascending: false });

  const authorIds = [...new Set((articles ?? []).map(a => a.author_id).filter(Boolean))];
  const { data: profiles } = authorIds.length
    ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", authorIds)
    : { data: [] };

  const profileMap = {};
  (profiles ?? []).forEach(p => { profileMap[p.user_id] = p; });

  const rows = (articles ?? []).map(a => ({
    ...a,
    author_name: profileMap[a.author_id]?.full_name ?? "",
    author_email: profileMap[a.author_id]?.email ?? "",
  }));

  const csv = toCSV(rows, [
    { key: "id",           label: "ID" },
    { key: "title",        label: "Judul" },
    { key: "category",     label: "Kategori" },
    { key: "status",       label: "Status" },
    { key: "hidden",       label: "Disembunyikan" },
    { key: "author_name",  label: "Nama Penulis" },
    { key: "author_email", label: "Email Penulis" },
    { key: "created_at",   label: "Tanggal" },
  ]);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="aina_articles_${Date.now()}.csv"`);
  res.send(csv);
});

/* ── Threads ─────────────────────────────────────────── */
async function verifyAuth(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const supabase = getAdminClient();
  if (!supabase) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

/* ── Contributor: Articles ───────────────────────────── */
app.post("/api/parse-articles", writeLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });

  const supabase = getAdminClient();
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const hasAccess = roles?.some(r => ["contributor", "senior_contributor", "admin"].includes(r.role));
  if (!hasAccess) return res.status(403).json({ error: "Hanya kontributor yang bisa menggunakan fitur ini" });

  const { text, filename } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "Teks diperlukan" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key tidak dikonfigurasi" });

  // Strip OCR prefix marker and trim
  const cleanText = text.replace(/^\[OCR\]\s*/i, "").trim();
  const isOcr = /^\[OCR\]/i.test(text);
  const truncated = cleanText.slice(0, 24000);
  const fileNote = filename ? ` dari file "${filename}"` : "";
  const ocrNote = isOcr ? "\nCatatan: Teks ini berasal dari OCR (scan dokumen), mungkin ada noise/karakter aneh — abaikan noise, fokus pada informasi yang bermakna." : "";

  const prompt = `Kamu adalah asisten yang membantu mengorganisasi informasi untuk mahasiswa Indonesia di Mesir (Masisir).

Diberikan teks berikut${fileNote}:${ocrNote}

<TEKS>
${truncated}
</TEKS>

Tugasmu: Baca seluruh teks, lalu identifikasi dan ekstrak SEMUA topik informasi yang berbeda. Pisahkan menjadi artikel terstruktur yang siap dikirim ke knowledge base.

Aturan penting:
- Setiap artikel fokus pada SATU topik
- Tulis konten dalam bahasa Indonesia yang jelas dan informatif (minimal 80 kata per artikel)
- Jika teks mengandung langkah-langkah/prosedur, gunakan article_type "step_by_step", selainnya "narrative"
- JUMLAH ARTIKEL TIDAK DIBATASI — sesuaikan dengan isi dokumen:
  • Jika dokumen membahas BANYAK topik berbeda (misal: catatan kuliah dengan banyak bab, dokumen prosedur dengan banyak langkah, panduan dengan banyak sub-topik), buat SEBANYAK MUNGKIN artikel yang diperlukan — bisa 8, 10, 15, bahkan lebih.
  • Jika dokumen hanya membahas satu atau sedikit topik, cukup buat 1–3 artikel saja.
  • JANGAN batasi diri pada angka tertentu — ikuti konten dokumen apa adanya.
- Jangan biarkan array articles kosong — selama ada informasi apapun yang berguna, buat artikelnya

PENANGANAN TEKS ARAB (SANGAT PENTING):
- Jika teks mengandung bahasa Arab (seperti catatan kuliah, mulakhos, materi akademik, hadits, dll), WAJIB sertakan teks Arab aslinya dalam konten artikel
- Format penulisan bilingual: tulis istilah/kalimat Arab terlebih dahulu, lalu terjemahan/penjelasan Indonesia-nya
- Contoh format: "**مُلَخَّص الطَّيَّارَات** (Ringkasan Penerbangan): ..." atau gunakan format blockquote/list untuk ayat/kalimat Arab
- Jangan terjemahkan atau hilangkan teks Arab — mahasiswa membutuhkan teks Arab asli untuk belajar
- Gunakan format: > *teks Arab* lalu baris baru untuk penjelasan Indonesia

FORMAT KONTEN ARTIKEL (wajib ikuti):
- Gunakan Markdown di field "content"
- Gunakan ## untuk subjudul/bagian utama (JANGAN gunakan # karena judul sudah terpisah)
- Gunakan ### untuk sub-bagian yang lebih kecil jika perlu
- Pisahkan setiap paragraf dengan satu baris kosong
- Gunakan - untuk poin-poin dalam list
- Gunakan 1. 2. 3. untuk langkah-langkah berurutan (khusus step_by_step)
- Gunakan **teks** untuk istilah penting atau kata kunci
- Jangan gunakan tabel
- Pastikan ada spasi yang cukup antar bagian agar mudah dibaca
- Konten minimal 3 paragraf atau 3 poin list

Kategori yang tersedia — BACA BAIK-BAIK sebelum memilih:
- "Akademik" — materi kuliah, catatan pelajaran (mulakhos), ringkasan bab, materi Al-Azhar, ilmu syariah, fiqih, nahwu, sharaf, tafsir, hadits, penerbangan/tayyarat, fisika, matematika, APAPUN yang sifatnya materi ilmu/pelajaran. INI PRIORITAS UTAMA untuk dokumen akademik.
- "Administrasi" — iqomah, visa, paspor, KTP, surat-surat resmi, prosedur birokrasi
- "Kehidupan Mesir" — tips sehari-hari, keamanan, budaya, bahasa percakapan, pengalaman hidup
- "Transport" — metro, taksi, microbus, uber, rute perjalanan
- "Tempat Tinggal" — sewa flat, lokasi, harga, kontrak
- "Kuliner" — restoran halal, masakan, harga makanan, dapur

PENTING: Jika dokumen berisi materi pelajaran/ilmu apapun (termasuk mulakhos tayyarat, catatan kuliah, ringkasan bab, dll), SELALU gunakan kategori "Akademik". Jangan gunakan "Kehidupan Mesir" untuk konten akademik.

Kembalikan HANYA JSON tanpa penjelasan atau markdown apapun. Dalam JSON, gunakan \\n untuk newline dan \\n\\n untuk baris kosong antar paragraf:
{"articles":[{"title":"...","category":"...","article_type":"narrative|step_by_step","content":"..."}]}`;

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://ainalabs.pro",
        "X-Title": "AINA Article Parser",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 16000,
      }),
    });

    const data = await resp.json();

    // Detect API-level errors from OpenRouter
    if (data.error) {
      console.error("[parse-articles] OpenRouter error:", JSON.stringify(data.error));
      return res.status(502).json({ error: "Layanan AI mengalami masalah, silakan coba lagi." });
    }

    const raw = data.choices?.[0]?.message?.content || "";
    console.log("[parse-articles] raw response length:", raw.length, "| preview:", raw.slice(0, 200));

    if (!raw.trim()) {
      console.error("[parse-articles] empty response. Full data:", JSON.stringify(data).slice(0, 500));
      return res.status(502).json({ error: "AI tidak memberikan respons. Coba lagi." });
    }

    // Extract JSON — try direct parse first, then regex fallback
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
      }
    }

    if (!parsed) {
      console.error("[parse-articles] JSON parse failed. raw:", raw.slice(0, 500));
      return res.status(502).json({ error: "Respons AI tidak valid, coba lagi." });
    }

    const articles = (parsed.articles || []).filter(
      (a) => a.title?.trim() && a.category && a.content?.trim()
    );

    console.log("[parse-articles] articles found:", articles.length);
    return res.json({ articles });
  } catch (e) {
    console.error("[parse-articles] exception:", e.message);
    return res.status(500).json({ error: "Gagal mengurai dokumen: " + e.message });
  }
});

/* ── URL → KB article generator ──────────────────────── */
app.post("/api/kb/fetch-url", writeLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });

  const supabase = getAdminClient();
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const hasAccess = roles?.some(r => ["contributor", "senior_contributor", "admin"].includes(r.role));
  if (!hasAccess) return res.status(403).json({ error: "Hanya kontributor yang bisa mengimpor URL" });

  const { url } = req.body;
  if (!url || typeof url !== "string") return res.status(400).json({ error: "URL diperlukan" });

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("invalid");
  } catch {
    return res.status(400).json({ error: "URL tidak valid. Pastikan format: https://..." });
  }

  try {
    console.log(`[URL-KB] fetching: ${url}`);
    const pageRes = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
      },
    });
    if (!pageRes.ok) return res.status(400).json({ error: `Halaman tidak bisa diakses (HTTP ${pageRes.status})` });

    const html = await pageRes.text();

    // Strip noise tags first (scripts, styles, ads, etc.)
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "");

    // Helper: extract inner text from an HTML block
    const toText = (block) =>
      block
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#\d+;/g, "")
        .replace(/\s+/g, " ")
        .trim();

    // Smart extraction: try specific content containers first (handles WordPress, news portals, blogs)
    let cleaned = "";

    // Priority 1: <article> tag — most semantic, used by WP & news sites
    const articleMatch = stripped.match(/<article[\s\S]*?<\/article>/i);
    if (articleMatch) {
      const t = toText(articleMatch[0]);
      if (t.length > 200) { cleaned = t; console.log(`[URL-KB] source: <article> tag (${t.length} chars)`); }
    }

    // Priority 2: <main> tag
    if (!cleaned) {
      const mainMatch = stripped.match(/<main[\s\S]*?<\/main>/i);
      if (mainMatch) {
        const t = toText(mainMatch[0]);
        if (t.length > 200) { cleaned = t; console.log(`[URL-KB] source: <main> tag (${t.length} chars)`); }
      }
    }

    // Priority 3: common content class names (WordPress, Indonesian news portals)
    if (!cleaned) {
      const contentPatterns = [
        /class="[^"]*(?:entry-content|post-content|article-content|article-body|single-content|content-area|main-content|post-body|the-content)[^"]*"[\s\S]*?(?=<\/div>(?:\s*<\/div>){0,3}\s*(?:<div|<aside|<footer|<section|$))/i,
      ];
      for (const pat of contentPatterns) {
        const m = stripped.match(pat);
        if (m) {
          const t = toText(m[0]);
          if (t.length > 200) { cleaned = t; console.log(`[URL-KB] source: content class (${t.length} chars)`); break; }
        }
      }
    }

    // Priority 4: fallback — full page minus nav/header/footer/aside
    if (!cleaned) {
      const fallback = stripped
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<header[\s\S]*?<\/header>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<aside[\s\S]*?<\/aside>/gi, "");
      cleaned = toText(fallback);
      console.log(`[URL-KB] source: full page fallback (${cleaned.length} chars)`);
    }

    // Trim to 9000 chars max for AI context
    cleaned = cleaned.slice(0, 9000);

    if (cleaned.length < 100) {
      return res.status(400).json({ error: "Konten artikel terlalu sedikit. Pastikan URL mengarah ke halaman artikel, bukan halaman beranda." });
    }

    console.log(`[URL-KB] final content: ${cleaned.length} chars — generating article...`);

    const apiKey = process.env.OPENROUTER_API_KEY;
    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(25000),
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ainalabs.pro",
        "X-Title": "AINA KB URL Import",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-lite-001",
        messages: [
          {
            role: "system",
            content: `Kamu adalah asisten yang mengubah konten website menjadi artikel Knowledge Base untuk mahasiswa Indonesia di Mesir (Masisir).

TUGAS: Baca konten halaman dan buat artikel KB yang informatif, terstruktur, dan berguna untuk Masisir.

ATURAN:
- Tulis dalam Bahasa Indonesia yang jelas dan mudah dipahami
- Fokus pada informasi yang benar-benar berguna untuk mahasiswa Indonesia di Mesir
- Buang semua iklan, menu navigasi, footer, komentar, sidebar, dan konten tidak relevan
- Gunakan Markdown: ## untuk sub-judul, - untuk bullet list, 1. 2. 3. untuk langkah-langkah
- Jika konten berupa langkah/prosedur → pilih article_type "step_by_step"
- Jika konten berupa informasi/narasi → pilih article_type "narrative"

KATEGORI (pilih SATU yang paling cocok, tulis PERSIS):
- Administrasi → iqomah, visa, paspor, dokumen resmi, KBRI
- Akademik → perkuliahan, Al-Azhar, pendaftaran, ujian, beasiswa
- Kehidupan Mesir → tips sehari-hari, budaya, keamanan, hiburan
- Transport → metro, taksi, Uber, bus, transportasi Kairo
- Tempat Tinggal → flat, sewa, lokasi hunian, kost
- Kuliner → restoran halal, makanan, harga, rekomendasi makan

OUTPUT WAJIB dalam format JSON murni (tanpa markdown, tanpa komentar):
{"title":"...","category":"...","article_type":"...","keywords":"...","content":"..."}`,
          },
          {
            role: "user",
            content: `URL sumber: ${url}\n\nKonten halaman:\n${cleaned}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 2500,
      }),
    });

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content ?? "";

    let parsed;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch { /* fall through */ }

    if (!parsed?.title || !parsed?.content || !parsed?.category) {
      console.error("[URL-KB] AI parse failed, raw:", raw.slice(0, 300));
      return res.status(502).json({ error: "Gagal menghasilkan artikel dari konten ini. Coba URL lain." });
    }

    const validCats = ["Administrasi", "Akademik", "Kehidupan Mesir", "Transport", "Tempat Tinggal", "Kuliner", "Bahasa"];
    if (!validCats.includes(parsed.category)) parsed.category = "Kehidupan Mesir";
    if (!["narrative", "step_by_step"].includes(parsed.article_type)) parsed.article_type = "narrative";

    console.log(`[URL-KB] generated: "${parsed.title}" (${parsed.category})`);
    return res.json({
      title:        parsed.title.slice(0, 200),
      category:     parsed.category,
      article_type: parsed.article_type,
      keywords:     (parsed.keywords ?? "").slice(0, 500),
      content:      parsed.content.slice(0, 50000),
      source_url:   url,
    });
  } catch (err) {
    console.error("[URL-KB] error:", err.message, err.cause?.code);
    if (err.name === "TimeoutError" || err.message?.includes("abort")) {
      return res.status(408).json({ error: "Waktu akses habis. Coba lagi atau cek apakah URL bisa dibuka di browser." });
    }
    const causeCode = err.cause?.code;
    if (causeCode === "ENOTFOUND" || causeCode === "EAI_AGAIN") {
      return res.status(400).json({ error: "Domain tidak ditemukan. Periksa URL — pastikan bisa dibuka di browser kamu." });
    }
    if (causeCode === "ECONNREFUSED" || causeCode === "ECONNRESET") {
      return res.status(400).json({ error: "Koneksi ke situs ditolak. Coba URL lain." });
    }
    if (err.message?.includes("fetch failed")) {
      return res.status(400).json({ error: "Tidak bisa mengakses URL ini dari server. Coba URL dari sumber lain (misalnya: blog.ppmi-mesir.org, masisir.net, dll)." });
    }
    return res.status(500).json({ error: "Gagal memproses URL: " + err.message });
  }
});

app.post("/api/articles/auto-categorize", async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });

  const { title = "", content = "" } = req.body;
  if (!title.trim() && !content.trim()) {
    return res.status(400).json({ error: "Tulis judul atau konten terlebih dahulu" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key tidak tersedia" });

  const prompt = `Kamu adalah pakar kategorisasi artikel untuk Knowledge Base komunitas mahasiswa Indonesia di Mesir (Masisir). Tugasmu adalah menentukan kategori dan tipe artikel yang PALING TEPAT berdasarkan seluruh konteks yang tersedia.

═══ KATEGORI YANG TERSEDIA (gunakan PERSIS salah satu string ini) ═══

"Administrasi"    → iqomah, visa, paspor, dokumen resmi, legalisasi, apostille, KTP, birokrasi, imigrasi, KBRI, PPMI
"Akademik"        → perkuliahan Al-Azhar/universitas Mesir, ujian (imtihan), beasiswa, darjah, syahadah, mutasi, cara belajar
"Kehidupan Mesir" → tips hidup sehari-hari, budaya, keamanan, kesehatan, sim card, perbankan, adaptasi, cuaca (hal serba-serbi di Mesir)
"Transport"       → metro Kairo, taksi (Uber/Careem), bus, microbus, kereta, rute perjalanan, biaya transport
"Tempat Tinggal"  → sewa flat/apartemen, Hay Asyir, Nasr City, kontrak, pindah flat, furnitur, shahibul beit
"Kuliner"         → restoran halal, warung Indonesia, masakan Mesir, harga makanan, resep, bahan makanan
"Bahasa"          → belajar bahasa Arab/amiyah, fusha, nahwu, sharaf, kosakata, mufrodat, percakapan, dialek Mesir

═══ TIPE ARTIKEL ═══
"step_by_step" → ada urutan langkah bernomor (1,2,3... / pertama, kedua...), panduan prosedur
"narrative"    → penjelasan informatif, tips umum, tanpa urutan langkah ketat

Judul: ${title.slice(0, 300)}
Konten: ${content.slice(0, 4000)}

Jawab HANYA JSON tanpa teks lain:
{"category":"<salah satu dari 7 string di atas PERSIS>","article_type":"<narrative atau step_by_step>","reason":"<1 kalimat singkat alasan>"}`;

  try {
    const data = await callOpenRouter(apiKey, {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.0,
      max_tokens: 200,
      timeoutMs: 20_000,
      label: "AutoCategorize",
    });
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = parseAutoCatResponse(raw);
    if (!parsed) return res.status(502).json({ error: "Respons AI tidak valid, coba lagi" });

    const category = resolveCategoryFromAI(parsed.category);
    const article_type = VALID_TYPES.includes(parsed.article_type) ? parsed.article_type : "narrative";

    if (!category) {
      console.warn("[AutoCategorize] rejected:", parsed.category, "| raw:", raw.slice(0, 150));
      return res.status(422).json({ error: "AI tidak bisa menentukan kategori — tambah lebih banyak konten" });
    }

    res.json({ category, article_type, reason: parsed.reason ?? "" });
  } catch (err) {
    console.error("[AutoCategorize]", err.message);
    res.status(500).json({ error: "Gagal menghubungi AI, coba lagi" });
  }
});

app.post("/api/articles", writeLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });

  const supabase = getAdminClient();

  // Verify contributor/admin role server-side
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const hasAccess = roles?.some(r => ["contributor", "senior_contributor", "admin"].includes(r.role));
  if (!hasAccess) return res.status(403).json({ error: "Hanya kontributor yang bisa mengirim artikel" });

  const {
    title, content, category, article_type,
    keywords: rawKeywords, contact_number: rawContact,
    summary: rawSummary, important_notes: rawNotes,
  } = req.body;

  if (!title?.trim() || !content?.trim() || !category)
    return res.status(400).json({ error: "title, content, category required" });
  if (title.trim().length < 10)
    return res.status(400).json({ error: "Judul terlalu pendek — minimal 10 karakter agar spesifik" });
  if (title.trim().length > 200)
    return res.status(400).json({ error: "Judul terlalu panjang (maks 200 karakter)" });
  if (content.trim().length < 100)
    return res.status(400).json({ error: "Konten terlalu pendek — minimal 100 karakter agar informatif" });
  if (content.trim().length > 50000)
    return res.status(400).json({ error: "Konten terlalu panjang (maks 50.000 karakter)" });

  const validCategories = ["Administrasi", "Akademik", "Kehidupan Mesir", "Transport", "Tempat Tinggal", "Kuliner", "Bahasa"];
  if (!validCategories.includes(category)) return res.status(400).json({ error: "Kategori tidak valid" });
  const validTypes = ["narrative", "step_by_step"];
  const safeType    = validTypes.includes(article_type) ? article_type : "narrative";
  const safeKeywords = typeof rawKeywords    === "string" ? rawKeywords.trim().slice(0, 500)  : "";
  const safeContact  = typeof rawContact     === "string" && rawContact.trim() ? rawContact.trim().slice(0, 50)   : null;
  const safeSummary  = typeof rawSummary     === "string" ? rawSummary.trim().slice(0, 600)   : null;
  const safeNotes    = typeof rawNotes       === "string" ? rawNotes.trim().slice(0, 1000)    : null;

  const payload = {
    author_id:   user.id,
    title:       title.trim(),
    content:     content.trim(),
    category,
    article_type: safeType,
    keywords:    safeKeywords,
    last_updated: new Date().toISOString(),
  };
  if (safeContact)  payload.contact_number  = safeContact;
  if (safeSummary)  payload.summary         = safeSummary;
  if (safeNotes)    payload.important_notes = safeNotes;

  const { data, error } = await supabase.from("knowledge_base").insert(payload).select().single();
  if (error) {
    // Graceful fallback: strip optional columns if they don't exist yet
    const fallback = { author_id: user.id, title: title.trim(), content: content.trim(), category };
    const { data: d2, error: e2 } = await supabase.from("knowledge_base").insert(fallback).select().single();
    if (e2) return res.status(500).json({ error: e2.message });
    return res.json(d2);
  }
  res.json(data);
});

app.get("/api/threads", async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { category } = req.query;
  const pageNum = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 30;
  const offset = (pageNum - 1) * limit;

  let query = supabase
    .from("threads")
    .select("*")
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (category) query = query.eq("category", category);

  const { data: threads, error } = await query;
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  if (!threads || threads.length === 0) return res.json([]);

  const authorIds = [...new Set(threads.map(t => t.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, avatar_url")
    .in("user_id", authorIds);

  const profileMap = {};
  (profiles ?? []).forEach(p => { profileMap[p.user_id] = p; });

  const threadIds = threads.map(t => t.id);
  const { data: userVoteRows } = await supabase
    .from("thread_votes")
    .select("thread_id")
    .eq("user_id", user.id)
    .in("thread_id", threadIds);
  const userVotedSet = new Set((userVoteRows ?? []).map(v => v.thread_id));

  res.json(threads.map(t => ({
    ...t,
    author_name: profileMap[t.user_id]?.full_name ?? null,
    author_avatar: profileMap[t.user_id]?.avatar_url ?? null,
    user_voted: userVotedSet.has(t.id),
  })));
});

/* ── Thread image upload ─────────────────────────────── */
app.post("/api/threads/upload-image", uploadLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  const safeMime = typeof mimeType === "string" ? mimeType.toLowerCase() : "image/jpeg";
  const ext = ALLOWED_IMAGE_TYPES.get(safeMime);
  if (!ext) return res.status(400).json({ error: "Tipe file tidak didukung. Gunakan JPEG, PNG, atau WebP." });

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: "Ukuran gambar maksimal 10MB" });

  const supabase = getAdminClient();
  const storagePath = `${user.id}/${Date.now()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from("thread-images")
    .upload(storagePath, buffer, { contentType: safeMime, upsert: false });
  if (uploadErr) return res.status(500).json({ error: uploadErr.message });

  const { data: { publicUrl } } = supabase.storage.from("thread-images").getPublicUrl(storagePath);
  res.json({ url: publicUrl });
});

app.post("/api/threads", writeLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { title, content, category, image_url } = req.body;
  if (!title?.trim() || !content?.trim() || !category) return res.status(400).json({ error: "title, content, category required" });
  if (title.trim().length > 200) return res.status(400).json({ error: "Judul terlalu panjang (maks 200 karakter)" });
  if (content.trim().length > 10000) return res.status(400).json({ error: "Konten terlalu panjang (maks 10.000 karakter)" });
  const valid = ["Administrasi", "Akademik", "Kehidupan Mesir", "Transport", "Tempat Tinggal", "Kuliner"];
  if (!valid.includes(category)) return res.status(400).json({ error: "Invalid category" });

  const supabase = getAdminClient();
  const insert = { user_id: user.id, title: title.trim(), content: content.trim(), category, image_url: (image_url && typeof image_url === "string") ? image_url : undefined };

  const { data, error } = await supabase.from("threads")
    .insert(insert)
    .select().single();
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json(data);
});

app.get("/api/threads/:id", async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { id } = req.params;

  const [{ data: thread }, { data: replies }] = await Promise.all([
    supabase.from("threads").select("*").eq("id", id).single(),
    supabase.from("thread_replies").select("*").eq("thread_id", id).order("created_at", { ascending: true }),
  ]);
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const userIds = [...new Set([thread.user_id, ...(replies ?? []).map(r => r.user_id)])];
  const [{ data: profiles }, { data: myVote }] = await Promise.all([
    supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", userIds),
    supabase.from("thread_votes").select("id").eq("user_id", user.id).eq("thread_id", id).maybeSingle(),
  ]);
  const profileMap = {};
  (profiles ?? []).forEach(p => { profileMap[p.user_id] = p; });

  res.json({
    ...thread,
    author_name: profileMap[thread.user_id]?.full_name ?? null,
    author_avatar: profileMap[thread.user_id]?.avatar_url ?? null,
    user_voted: !!myVote,
    replies: (replies ?? []).map(r => ({
      ...r,
      author_name: profileMap[r.user_id]?.full_name ?? null,
      author_avatar: profileMap[r.user_id]?.avatar_url ?? null,
    })),
  });
});

app.post("/api/threads/:id/replies", writeLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { content, image_url } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "content required" });
  if (content.trim().length > 2000) return res.status(400).json({ error: "Balasan terlalu panjang (maks 2.000 karakter)" });

  const supabase = getAdminClient();
  const { id } = req.params;
  const { data: thread } = await supabase.from("threads").select("id").eq("id", id).single();
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const replyInsert = { thread_id: id, user_id: user.id, content: content.trim(), image_url: (image_url && typeof image_url === "string") ? image_url : undefined };

  const { data, error } = await supabase.from("thread_replies")
    .insert(replyInsert)
    .select().single();
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json(data);
});

app.delete("/api/threads/:id/replies/:replyId", writeLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { replyId } = req.params;
  const { data: reply } = await supabase.from("thread_replies").select("user_id").eq("id", replyId).single();
  if (!reply) return res.status(404).json({ error: "Reply not found" });

  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const isAdmin = roles?.some(r => r.role === "admin");
  if (reply.user_id !== user.id && !isAdmin) return res.status(403).json({ error: "Forbidden" });

  await supabase.from("thread_replies").delete().eq("id", replyId);
  res.json({ success: true });
});

app.delete("/api/threads/:id", writeLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { id } = req.params;
  const { data: thread } = await supabase.from("threads").select("user_id").eq("id", id).single();
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const isAdmin = roles?.some(r => r.role === "admin");
  if (thread.user_id !== user.id && !isAdmin) return res.status(403).json({ error: "Forbidden" });

  await supabase.from("threads").delete().eq("id", id);
  res.json({ success: true });
});

app.post("/api/admin/threads/:id/promote", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { id } = req.params;
  const { data: thread } = await supabase.from("threads").select("*").eq("id", id).single();
  if (!thread) return res.status(404).json({ error: "Thread not found" });
  if (thread.promoted_to_kb) return res.status(400).json({ error: "Already promoted" });

  const { error: insertErr } = await supabase.from("knowledge_base").insert({
    author_id: thread.user_id,
    title: thread.title,
    content: thread.content,
    category: thread.category,
    status: "pending",
    article_type: "narrative",
  });
  if (insertErr) return res.status(500).json({ error: insertErr.message });

  await supabase.from("threads").update({ promoted_to_kb: true }).eq("id", id);
  console.log(`[PROMOTE] Thread "${thread.title}" promoted to KB pending by admin ${admin.id}`);
  res.json({ success: true });
});

/* ── Thread Upvote (toggle) ─────────────────────────────── */
app.post("/api/threads/:id/vote", writeLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { id } = req.params;

  const { data: thread } = await supabase.from("threads").select("id").eq("id", id).single();
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const { error: insertErr } = await supabase
    .from("thread_votes")
    .insert({ user_id: user.id, thread_id: id });

  let voted;
  if (insertErr) {
    if (insertErr.code === "23505") {
      await supabase.from("thread_votes").delete().eq("user_id", user.id).eq("thread_id", id);
      voted = false;
    } else {
      return res.status(500).json({ error: insertErr.message });
    }
  } else {
    voted = true;
  }

  // Count real votes and sync the column
  const { count } = await supabase.from("thread_votes").select("*", { count: "exact", head: true }).eq("thread_id", id);
  const vote_count = count ?? 0;
  await supabase.from("threads").update({ vote_count }).eq("id", id);
  return res.json({ voted, vote_count });
});

/* ── Article Upvote (toggle) ────────────────────────────── */
app.get("/api/articles/:id", async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from("knowledge_base")
      .select("id, title, category, article_type, content, vote_count, created_at, author_id")
      .eq("id", id)
      .eq("status", "approved")
      .single();
    if (error || !data) return res.status(404).json({ error: "Artikel tidak ditemukan" });

    const { data: author } = await supabase.from("profiles").select("full_name").eq("user_id", data.author_id).single();
    const { data: myVote } = await supabase.from("article_votes").select("id").eq("user_id", user.id).eq("article_id", id).maybeSingle();

    res.json({ ...data, author_name: author?.full_name ?? null, user_voted: !!myVote });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/articles/:id/report", writeLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: "Alasan laporan wajib diisi" });
  if (reason.trim().length > 500) return res.status(400).json({ error: "Alasan terlalu panjang (maks 500 karakter)" });

  const { data: article } = await supabase.from("knowledge_base").select("title").eq("id", id).eq("status", "approved").single();
  if (!article) return res.status(404).json({ error: "Artikel tidak ditemukan" });

  try {
    await supabase.from("message_reports").insert({
      user_id: user.id,
      message_id: `article:${id}`,
      message_content: `[ARTIKEL] ${article.title}`,
      reason: reason.trim(),
      status: "pending",
    });
    console.log(`[REPORT] Article "${article.title}" (${id}) reported by ${user.id}: "${reason}"`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/articles/:id/vote", writeLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { id } = req.params;

  const { data: article } = await supabase.from("knowledge_base").select("id, status").eq("id", id).single();
  if (!article) return res.status(404).json({ error: "Article not found" });
  if (article.status !== "approved") return res.status(400).json({ error: "Hanya artikel yang disetujui yang bisa diupvote" });

  const { error: insertErr } = await supabase
    .from("article_votes")
    .insert({ user_id: user.id, article_id: id });

  let voted;
  if (insertErr) {
    if (insertErr.code === "23505") {
      await supabase.from("article_votes").delete().eq("user_id", user.id).eq("article_id", id);
      voted = false;
    } else {
      return res.status(500).json({ error: insertErr.message });
    }
  } else {
    voted = true;
  }

  // Count real votes and sync the column
  const { count } = await supabase.from("article_votes").select("*", { count: "exact", head: true }).eq("article_id", id);
  const vote_count = count ?? 0;
  await supabase.from("knowledge_base").update({ vote_count }).eq("id", id);
  return res.json({ voted, vote_count });
});

/* ── Leaderboard ─────────────────────────────────────────── */
app.get("/api/leaderboard", async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();

  const [{ data: topProfiles }, { data: topArticles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url, contribution_count")
      .order("contribution_count", { ascending: false })
      .gt("contribution_count", 0)
      .neq("hidden_from_leaderboard", true)
      .limit(20),
    supabase
      .from("knowledge_base")
      .select("id, title, category, article_type, vote_count, created_at, author_id")
      .eq("status", "approved")
      .neq("hidden", true)
      .order("vote_count", { ascending: false })
      .limit(500),
  ]);

  const profileIds = (topProfiles ?? []).map(p => p.user_id);
  let roleMap = {};
  if (profileIds.length > 0) {
    const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", profileIds);
    const LEVEL = { user: 0, contributor: 1, senior_contributor: 2, admin: 3 };
    (roles ?? []).forEach(r => {
      const cur = roleMap[r.user_id];
      if (!cur || (LEVEL[r.role] ?? 0) > (LEVEL[cur] ?? 0)) roleMap[r.user_id] = r.role;
    });
  }

  const articleIds = (topArticles ?? []).map(a => a.id);
  let userArticleVotedSet = new Set();
  if (articleIds.length > 0) {
    const { data: myVotes } = await supabase
      .from("article_votes")
      .select("article_id")
      .eq("user_id", user.id)
      .in("article_id", articleIds);
    (myVotes ?? []).forEach(v => userArticleVotedSet.add(v.article_id));
  }

  const authorIds = [...new Set((topArticles ?? []).map(a => a.author_id).filter(Boolean))];
  let authorMap = {};
  if (authorIds.length > 0) {
    const { data: authors } = await supabase.from("profiles").select("user_id, full_name").in("user_id", authorIds);
    (authors ?? []).forEach(a => { authorMap[a.user_id] = a.full_name; });
  }

  res.json({
    contributors: (topProfiles ?? []).map(p => ({
      user_id: p.user_id,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      contribution_count: p.contribution_count ?? 0,
      role: roleMap[p.user_id] ?? "user",
    })),
    articles: (topArticles ?? []).map(a => ({
      ...a,
      user_voted: userArticleVotedSet.has(a.id),
      author_name: authorMap[a.author_id] ?? null,
    })),
  });
});

/* GET /api/articles/search — full-text search through KB articles */
app.get("/api/articles/search", async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const q = (req.query.q || "").toString().trim();
  const category = (req.query.category || "").toString().trim();
  const limit = Math.min(parseInt(req.query.limit) || 40, 60);

  if (q.length < 2) return res.json({ articles: [], query: q });

  const supabase = getAdminClient();
  if (!supabase) return res.status(503).json({ error: "Service unavailable" });

  const VALID_CATEGORIES = ["Administrasi","Akademik","Kehidupan Mesir","Transport","Tempat Tinggal","Kuliner","Bahasa"];

  let query = supabase
    .from("knowledge_base")
    .select("id, title, category, article_type, vote_count, created_at, author_id, content")
    .eq("status", "approved")
    .neq("hidden", true)
    .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
    .limit(limit);

  if (category && VALID_CATEGORIES.includes(category)) {
    query = query.eq("category", category);
  }

  const { data: rawArticles, error } = await query;
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  const articles = rawArticles ?? [];

  const [authorMap, userVotedSet] = await Promise.all([
    (async () => {
      const ids = [...new Set(articles.map(a => a.author_id).filter(Boolean))];
      if (!ids.length) return {};
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      const m = {};
      (data ?? []).forEach(a => { m[a.user_id] = a.full_name; });
      return m;
    })(),
    (async () => {
      const ids = articles.map(a => a.id);
      if (!ids.length) return new Set();
      const { data } = await supabase.from("article_votes").select("article_id").eq("user_id", user.id).in("article_id", ids);
      return new Set((data ?? []).map(v => v.article_id));
    })(),
  ]);

  const ql = q.toLowerCase();
  const result = articles
    .map(a => {
      const titleMatch = a.title.toLowerCase().includes(ql);
      let snippet = null;
      if (!titleMatch && a.content) {
        const idx = a.content.toLowerCase().indexOf(ql);
        if (idx !== -1) {
          const start = Math.max(0, idx - 55);
          const end = Math.min(a.content.length, idx + q.length + 95);
          snippet = (start > 0 ? "…" : "") +
            a.content.slice(start, end).replace(/\n+/g, " ").replace(/#{1,6}\s/g, "") +
            (end < a.content.length ? "…" : "");
        }
      }
      return {
        id: a.id, title: a.title, category: a.category,
        article_type: a.article_type, vote_count: a.vote_count,
        created_at: a.created_at, author_name: authorMap[a.author_id] ?? null,
        user_voted: userVotedSet.has(a.id), snippet, title_match: titleMatch,
      };
    })
    .sort((a, b) => {
      if (a.title_match && !b.title_match) return -1;
      if (!a.title_match && b.title_match) return 1;
      return b.vote_count - a.vote_count;
    });

  res.json({ articles: result, query: q });
});

/* ── Beta Feedback (stored in Supabase, not local files) ─ */
app.post("/api/feedback", feedbackLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan untuk mengirim feedback" });

  const { type, message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message required" });
  if (message.trim().length > 2000) return res.status(400).json({ error: "Feedback terlalu panjang (maks 2.000 karakter)" });

  const validTypes = ["bug", "suggestion", "general"];
  const feedbackType = validTypes.includes(type) ? type : "general";

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return res.status(401).json({ error: "Token tidak valid" });

  const { error } = await supabase.from("beta_feedback").insert({
    type: feedbackType,
    message: message.trim(),
    user_email: user.email,
    user_id: user.id,
  });

  if (error) {
    console.error("[FEEDBACK] insert error:", error.message);
    return res.status(500).json({ error: "Gagal menyimpan feedback" });
  }

  console.log(`[FEEDBACK] [${feedbackType}] from ${user.email}: ${message.slice(0, 80)}`);
  res.json({ success: true });
});

app.get("/api/admin/feedback", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const { data, error } = await supabase
    .from("beta_feedback")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json(data ?? []);
});

/* ── Admin: KB coverage gaps (missing topics log) ───────────────────────── */
app.get("/api/admin/missing-topics", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(503).json({ error: "Server config error" });

  const limit = Math.min(parseInt(req.query.limit) || 500, 1000);
  const since = req.query.since; // ISO date string filter

  try {
    let query = supabase
      .from("missing_topics")
      .select("id, query, intent_type, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (since) query = query.gte("created_at", since);

    const { data, error } = await query;
    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return res.json({ total: 0, topics: [], setup_required: true });
      }
      return res.status(500).json({ error: sanitizeErr(error) });
    }

    const rows = data ?? [];

    // ── Semantic clustering (if OpenAI available) ──────────────────────────────
    // Groups queries by meaning (not exact text) so admin sees topic themes, not duplicates.
    if (process.env.OPENAI_API_KEY && rows.length > 1) {
      try {
        // Deduplicate by normalized text first
        const uniqueQueries = [...new Set(rows.map(r => r.query.trim().slice(0, 200)))];
        const embRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          signal: AbortSignal.timeout(20000),
          headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: uniqueQueries }),
        });
        if (embRes.ok) {
          const embData = await embRes.json();
          const vecs = embData.data.map(d => d.embedding);

          const cosine = (a, b) => {
            let dot = 0, na = 0, nb = 0;
            for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
            return dot / (Math.sqrt(na) * Math.sqrt(nb));
          };

          // Greedy clustering: each query joins the first cluster whose seed is similar enough
          const THRESHOLD = 0.72;
          const assigned = new Array(uniqueQueries.length).fill(-1);
          const clusters = [];
          for (let i = 0; i < uniqueQueries.length; i++) {
            if (assigned[i] !== -1) continue;
            const cluster = [i];
            assigned[i] = clusters.length;
            for (let j = i + 1; j < uniqueQueries.length; j++) {
              if (assigned[j] !== -1) continue;
              if (cosine(vecs[i], vecs[j]) >= THRESHOLD) {
                cluster.push(j);
                assigned[j] = clusters.length;
              }
            }
            clusters.push(cluster);
          }

          // Build output: one item per cluster, sorted by total occurrence count
          const clusterGroups = clusters.map(idxs => {
            const queries = idxs.map(i => uniqueQueries[i]);
            const allRows = rows.filter(r => queries.includes(r.query.trim().slice(0, 200)));
            const count = allRows.length;
            const latest = [...allRows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
            return {
              ...latest,
              query: queries[0], // most representative (seed query)
              count,
              cluster_size: queries.length,
              variants: queries.length > 1 ? queries.slice(1, 4) : [],
            };
          }).sort((a, b) => b.count - a.count);

          return res.json({ total: rows.length, topics: clusterGroups, clustered: true });
        }
      } catch (e) {
        console.warn("[MissingTopics/cluster] semantic clustering failed, using text grouping:", e.message);
      }
    }

    // ── Fallback: text-based grouping ─────────────────────────────────────────
    const countMap = {};
    for (const row of rows) {
      const key = row.query.toLowerCase().trim().slice(0, 80);
      if (!countMap[key]) countMap[key] = { ...row, count: 0 };
      countMap[key].count++;
    }
    const grouped = Object.values(countMap).sort((a, b) => b.count - a.count);

    res.json({ total: rows.length, topics: grouped, clustered: false });
  } catch (e) {
    res.status(500).json({ error: "Gagal memuat missing topics: " + e.message });
  }
});

// ─── ANSWER FEEDBACK (answer-level: helpful / not_accurate / outdated) ──────

app.post("/api/messages/:id/feedback", writeLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan" });

  const messageId = req.params.id;
  const { feedback_type, note, intent, confidence, sources } = req.body;

  const validTypes = ["helpful", "not_accurate", "outdated", "saved"];
  if (!validTypes.includes(feedback_type)) return res.status(400).json({ error: "Invalid feedback_type" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return res.status(401).json({ error: "Token tidak valid" });

  const { error } = await supabase.from("answer_feedback").insert({
    user_id:       user.id,
    message_id:    messageId,
    feedback_type,
    note:          note?.slice(0, 500) ?? null,
    intent:        intent ?? null,
    confidence:    confidence ?? null,
    sources:       Array.isArray(sources) ? sources : null,
  });

  if (error) {
    console.error("[AnswerFeedback] insert error:", error.message);
    return res.status(500).json({ error: "Gagal menyimpan feedback" });
  }

  console.log(`[AnswerFeedback] ${feedback_type} on msg ${messageId} from ${user.email}`);
  res.json({ success: true });
});

app.get("/api/admin/answer-feedback", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const { type } = req.query;
  let query = supabase
    .from("answer_feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (type && ["helpful", "not_accurate", "outdated", "saved"].includes(type)) {
    query = query.eq("feedback_type", type);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  // Enrich with profile info
  const rows = data ?? [];
  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  let profileMap = {};
  if (userIds.length) {
    const { data: profs } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds);
    (profs ?? []).forEach(p => { profileMap[p.user_id] = p; });
  }
  res.json(rows.map(r => ({ ...r, user: profileMap[r.user_id] ?? null })));
});

/* ── GET /api/admin/insights ─────────────────────────────
   Self-improvement dashboard: top queries, bad responses,
   missing KB topics, weekly usage summary.
   Master-admin only. Uses Supabase (works in dev + prod).
   ─────────────────────────────────────────────────────── */
app.get("/api/admin/insights", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(503).json({ error: "Server config error" });

  try {
    const now = new Date();
    const ago30d = new Date(now - 30 * 86400_000).toISOString();
    const ago14d = new Date(now - 14 * 86400_000).toISOString();
    const ago7d  = new Date(now - 7  * 86400_000).toISOString();

    // Fetch raw data in parallel
    const [logRes, missingRes] = await Promise.all([
      supabase
        .from("query_log")
        .select("id, query_text, intent_type, source_used, confidence, has_kb_result, is_transport, rating, created_at")
        .gte("created_at", ago30d)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("missing_topics")
        .select("query, intent_type, created_at")
        .gte("created_at", ago30d)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (logRes.error && (logRes.error.code === "42P01" || logRes.error.message?.includes("does not exist"))) {
      return res.json({
        top_queries: [], bad_responses: [], missing_topics: [],
        weekly_summary: {}, daily_trend: [], intent_breakdown: [],
        setup_required: true, generated_at: now.toISOString(),
      });
    }
    if (logRes.error) return res.status(500).json({ error: sanitizeErr(logRes.error) });

    const logs    = logRes.data    ?? [];
    const missing = missingRes.data ?? [];

    // ── 1. Top queries (last 30d, unrated) — group by normalised text ──────
    const qMap = {};
    for (const r of logs) {
      if (r.rating !== null && r.rating !== undefined) continue;
      const key = (r.query_text || "").toLowerCase().trim().slice(0, 80);
      if (!key) continue;
      if (!qMap[key]) qMap[key] = { normalized: key, sample_query: r.query_text, count: 0, intent_type: r.intent_type, source_used: r.source_used, last_seen: r.created_at };
      qMap[key].count++;
      if (r.created_at > qMap[key].last_seen) { qMap[key].last_seen = r.created_at; qMap[key].source_used = r.source_used; }
    }
    const top_queries = Object.values(qMap).sort((a, b) => b.count - a.count).slice(0, 20);

    // ── 2. Bad responses (rating = -1, last 30d) ───────────────────────────
    const bad_responses = logs
      .filter(r => r.rating === -1)
      .slice(0, 30)
      .map(r => ({ query_text: r.query_text, intent_type: r.intent_type, source_used: r.source_used, confidence: r.confidence, created_at: r.created_at }));

    // ── 3. Missing topics (last 30d) — group by normalised text ───────────
    const mtMap = {};
    for (const r of missing) {
      const key = (r.query || "").toLowerCase().trim().slice(0, 80);
      if (!key) continue;
      if (!mtMap[key]) mtMap[key] = { normalized: key, sample_query: r.query, count: 0, intent_type: r.intent_type, last_seen: r.created_at };
      mtMap[key].count++;
      if (r.created_at > mtMap[key].last_seen) mtMap[key].last_seen = r.created_at;
    }
    const missing_topics = Object.values(mtMap).sort((a, b) => b.count - a.count).slice(0, 20);

    // ── 4. Weekly summary (last 7d) ────────────────────────────────────────
    const weekly = logs.filter(r => r.created_at >= ago7d);
    const weekly_summary = {
      total_queries:     weekly.length,
      bad_responses:     weekly.filter(r => r.rating === -1).length,
      kb_hits:           weekly.filter(r => r.has_kb_result).length,
      transport_queries: weekly.filter(r => r.is_transport).length,
      source_kb:         weekly.filter(r => r.source_used === "KB").length,
      source_perplexity: weekly.filter(r => r.source_used === "Perplexity").length,
      source_wiki:       weekly.filter(r => r.source_used === "Wikipedia").length,
      source_model:      weekly.filter(r => r.source_used === "Model").length,
      conf_high:         weekly.filter(r => r.confidence === "high").length,
      conf_medium:       weekly.filter(r => r.confidence === "medium").length,
      conf_low:          weekly.filter(r => r.confidence === "needs_verification").length,
    };

    // ── 5. Daily trend (last 14d) ──────────────────────────────────────────
    const dayMap = {};
    for (const r of logs.filter(x => x.created_at >= ago14d)) {
      const day = r.created_at.slice(0, 10);
      dayMap[day] = (dayMap[day] || 0) + 1;
    }
    const daily_trend = Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count }));

    // ── 6. Intent breakdown (last 7d) ─────────────────────────────────────
    const intentMap = {};
    for (const r of weekly.filter(x => x.rating === null || x.rating === undefined)) {
      const intent = r.intent_type || "unknown";
      intentMap[intent] = (intentMap[intent] || 0) + 1;
    }
    const intent_breakdown = Object.entries(intentMap).sort(([, a], [, b]) => b - a).slice(0, 10).map(([intent, count]) => ({ intent, count }));

    res.json({ top_queries, bad_responses, missing_topics, weekly_summary, daily_trend, intent_breakdown, generated_at: now.toISOString() });
  } catch (e) {
    console.error("[Insights] error:", e.message);
    res.status(500).json({ error: "Gagal memuat insights: " + e.message });
  }
});

// Admin: all users' saved answers (master admin only)
app.get("/api/admin/all-saved-answers", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const { data, error } = await supabase
    .from("saved_answers")
    .select("id, user_id, message_id, content, sources, source_summary, intent, created_at, promoted_to_kb")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  const rows = data ?? [];
  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  let profileMap = {};
  if (userIds.length) {
    const { data: profs } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds);
    (profs ?? []).forEach(p => { profileMap[p.user_id] = p; });
  }
  res.json(rows.map(r => ({ ...r, user: profileMap[r.user_id] ?? null })));
});

// Admin: promote a saved answer to KB (master admin only)
app.post("/api/admin/saved-answers/:id/promote-to-kb", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const { id } = req.params;
  const { title, category } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "title diperlukan" });

  // Fetch the saved answer
  const { data: saved, error: fetchErr } = await supabase
    .from("saved_answers")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !saved) return res.status(404).json({ error: "Tidak ditemukan" });

  // Insert into knowledge_base as approved article
  const { data: kbInserted, error: kbErr } = await supabase.from("knowledge_base").insert({
    author_id: admin.id,
    title:     title.trim(),
    content:   saved.content,
    category:  category?.trim() || "Umum",
    status:    "approved",
  }).select("id").single();

  if (kbErr) return res.status(500).json({ error: sanitizeErr(kbErr) });

  // Fire-and-forget embedding for the promoted article
  if (kbInserted?.id) embedKBArticle(kbInserted.id).catch(() => {});

  // Mark the saved answer as promoted (add column if not exists)
  await supabase.from("saved_answers").update({ promoted_to_kb: true }).eq("id", id).catch(() => {});

  console.log(`[Admin] saved_answer ${id} promoted to KB by ${admin.email}`);
  res.json({ success: true });
});

// ─── SAVED ANSWERS (bookmarks) ───────────────────────────────────────────────

app.get("/api/saved-answers", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return res.status(401).json({ error: "Token tidak valid" });

  const { data, error } = await supabase
    .from("saved_answers")
    .select("id, message_id, content, sources, source_summary, intent, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json(data ?? []);
});

app.post("/api/saved-answers", writeLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan" });

  const { message_id, content, sources, source_summary, intent } = req.body;
  if (!message_id || !content?.trim()) return res.status(400).json({ error: "message_id and content required" });
  if (content.length > 20000) return res.status(400).json({ error: "Jawaban terlalu panjang" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return res.status(401).json({ error: "Token tidak valid" });

  const { data, error } = await supabase
    .from("saved_answers")
    .upsert({
      user_id:        user.id,
      message_id,
      content:        content.trim(),
      sources:        Array.isArray(sources) ? sources : null,
      source_summary: source_summary ?? null,
      intent:         intent ?? null,
    }, { onConflict: "user_id,message_id" })
    .select("id")
    .single();

  if (error) {
    console.error("[SavedAnswers] upsert error:", error.message);
    return res.status(500).json({ error: "Gagal menyimpan jawaban" });
  }

  console.log(`[SavedAnswers] saved msg ${message_id} for ${user.email}`);
  res.json({ success: true, id: data?.id });
});

app.delete("/api/saved-answers/:id", writeLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return res.status(401).json({ error: "Token tidak valid" });

  // Delete by message_id (the app uses message_id as the save identifier)
  const { error } = await supabase
    .from("saved_answers")
    .delete()
    .eq("user_id", user.id)
    .eq("message_id", req.params.id);

  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ success: true });
});

// ─── NEWS (BERITA MASISIR) ─────────────────────────────────────────────────

const NEWS_CATEGORIES = new Set([
  "breaking_news", "administrasi", "kuliner",
  "kehidupan_mesir", "transportasi", "aigypt",
]);

/* GET /api/news — public, paginated, filterable by category */
app.get("/api/news", async (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) return res.status(503).json({ error: "Service unavailable" });

  const category = req.query.category;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  const cols = "id,title,content,category,image_url,source_url,source_name,is_pinned,published_at,created_at";
  let url = `${supabaseUrl}/rest/v1/masisir_news?select=${cols}&is_active=eq.true&order=is_pinned.desc,published_at.desc&limit=${limit}`;
  if (category && NEWS_CATEGORIES.has(category)) url += `&category=eq.${category}`;

  try {
    const r = await fetch(url, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      if (err.code === "PGRST205" || err.message?.includes("schema cache")) {
        return res.json({ news: [], _hint: "table_not_created" });
      }
      return res.status(500).json({ error: "Gagal memuat berita" });
    }
    const data = await r.json();
    res.json({ news: Array.isArray(data) ? data : [] });
  } catch (e) {
    res.status(500).json({ error: "Gagal memuat berita" });
  }
});

/* GET /api/_seed-news — ONE-TIME seed endpoint, remove after use */
app.get("/api/_seed-news", async (req, res) => {
  if (req.query.token !== "aina_seed_2026") return res.status(403).json({ error: "forbidden" });
  const supabase = getAdminClient();
  if (!supabase) return res.status(503).json({ error: "no client" });
  const now = Date.now();
  const items = [
    { title: "KBRI Kairo Buka Layanan Paspor Walk-in Mulai April 2026", content: "KBRI Kairo mengumumkan pembukaan layanan paspor dengan sistem walk-in mulai 1 April 2026. Masisir tidak perlu lagi booking jauh-jauh hari.\n\nLayanan dibuka setiap Senin–Kamis pukul 09.00–12.00 waktu Kairo. Dokumen yang harus dibawa:\n• Paspor lama\n• Fotokopi KTP\n• Bukti mahasiswa aktif (Shahada Qaid)\n• Pas foto terbaru ukuran 4x6 berlatar putih\n\nAntrean diambil langsung di loket pada hari yang sama. Untuk info lebih lanjut hubungi hotline KBRI: +20 2 3761 0200.", category: "administrasi", source_name: "KBRI Kairo", is_pinned: true, published_at: new Date(now - 1*60*60*1000).toISOString() },
    { title: "PERINGATAN: Badai Pasir (Khamaseen) Diprediksi Akhir Pekan Ini", content: "Badan Meteorologi Mesir (HIMET) memperingatkan badai pasir khamaseen akan melanda Kairo dan sekitarnya akhir pekan ini. Visibilitas bisa turun drastis dan suhu diprediksi mencapai 42°C.\n\nImbauan untuk Masisir:\n• Hindari keluar rumah jika tidak mendesak\n• Tutup rapat jendela dan pintu\n• Siapkan masker dan kacamata pelindung jika terpaksa keluar\n• Stok air minum dan makanan untuk 2–3 hari\n• Charge semua perangkat elektronik sebagai antisipasi pemadaman", category: "breaking_news", source_name: "HIMET / KBRI Kairo", is_pinned: true, published_at: new Date(now - 30*60*1000).toISOString() },
    { title: "Restoran Halal Baru di Nasr City: Warung Nusantara Resmi Buka", content: "Kabar gembira buat Masisir yang kangen masakan Indonesia! Warung Nusantara resmi buka di Nasr City, lokasi strategis dekat Masjid Rabaa Al-Adawiyah.\n\nMenu andalan:\n• Nasi rendang daging sapi (EGP 75)\n• Ayam geprek sambal bawang (EGP 60)\n• Soto Betawi kuah santan (EGP 55)\n• Es teh manis jumbo (EGP 20)\n\nJam operasional: setiap hari 11.00–22.00 waktu Kairo. Tersedia layanan pesan antar via WhatsApp untuk area Nasr City.", category: "kuliner", source_name: "Info Kuliner Masisir", is_pinned: false, published_at: new Date(now - 3*60*60*1000).toISOString() },
    { title: "Panduan Lengkap Naik Metro Kairo untuk Masisir Baru", content: "Metro Kairo adalah transportasi paling efisien dan murah di kota ini.\n\n3 Jalur Utama:\n• Line 1 (merah): Helwan ↔ New El-Marg\n• Line 2 (kuning): Shubra ↔ Giza\n• Line 3 (biru): Adly Mansour ↔ Kit Kat\n\nHarga tiket: EGP 8 single trip. Kartu prabayar lebih hemat untuk pemakai rutin.\n\nTips: Ada gerbong khusus wanita. Jam sibuk 07.00–09.00 dan 16.00–19.00 sebaiknya dihindari.", category: "transportasi", source_name: "Tim AINA", is_pinned: false, published_at: new Date(now - 2*24*60*60*1000).toISOString() },
    { title: "Panduan Sewa Kos di Kairo 2026: Harga dan Area Terbaik untuk Masisir", content: "Panduan mencari tempat tinggal di Kairo:\n\nArea populer Masisir:\n• Nasr City — komunitas Indonesia paling besar\n• Abbasiyya — dekat kampus utama Al-Azhar\n• Shubra — harga murah, komunitas Indonesia besar\n\nEstimasi harga sewa (2026):\n• Single room sharing: EGP 800–1.500/bulan\n• Single room private: EGP 1.500–3.000/bulan\n• Studio/flat kecil: EGP 3.000–6.000/bulan\n\nSelalu baca kontrak sebelum tanda tangan dan tanya soal tagihan utilitas terpisah.", category: "kehidupan_mesir", source_name: "Tim AINA", is_pinned: false, published_at: new Date(now - 5*24*60*60*1000).toISOString() },
    { title: "AIGYPT Gelar Seminar Nasional Beasiswa S2–S3 di Mesir", content: "AIGYPT (Asosiasi Ilmuwan dan Akademisi Indonesia di Mesir) mengadakan Seminar Nasional bertema \"Peluang Beasiswa Lanjut Studi S2–S3 di Mesir\".\n\nWaktu: Sabtu, 5 April 2026 | 13.00 WIB / 08.00 Kairo\nFormat: Online via Zoom\n\nTopik:\n• Beasiswa Al-Azhar untuk mahasiswa asing\n• Program double degree Indonesia–Mesir\n• Tips menulis proposal riset yang diterima\n• Pengalaman alumni S3 Al-Azhar\n\nPendaftaran GRATIS via link di bio Instagram @aigypt.official. Kapasitas 500 peserta.", category: "aigypt", source_name: "AIGYPT", is_pinned: false, published_at: new Date(now - 1*24*60*60*1000).toISOString() },
  ];
  const { data, error } = await supabase.from("masisir_news").insert(items).select("id, title");
  if (error) return res.status(500).json({ error: error.message });
  res.json({ inserted: data.length, items: data.map(d => d.title) });
});

/* POST /api/admin/news — create news item (admin only) */
app.post("/api/admin/news", strictLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const { title, content, category, image_url, source_url, source_name, is_pinned = false, published_at } = req.body;
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: "Judul dan konten wajib diisi" });
  if (category && !NEWS_CATEGORIES.has(category)) return res.status(400).json({ error: "Kategori tidak valid" });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("masisir_news")
    .insert({
      title: title.trim(),
      content: content.trim(),
      category: category || "kehidupan_mesir",
      image_url: image_url?.trim() || null,
      source_url: source_url?.trim() || null,
      source_name: source_name?.trim() || null,
      is_pinned: !!is_pinned,
      author_id: admin.id,
      published_at: published_at || new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ news: data });
});

/* PUT /api/admin/news/:id — update news item (admin only) */
app.put("/api/admin/news/:id", strictLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });

  const { title, content, category, image_url, source_url, source_name, is_pinned, is_active, published_at } = req.body;
  if (category && !NEWS_CATEGORIES.has(category)) return res.status(400).json({ error: "Kategori tidak valid" });

  const supabase = getAdminClient();
  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim();
  if (content !== undefined) updates.content = content.trim();
  if (category !== undefined) updates.category = category;
  if (image_url !== undefined) updates.image_url = image_url?.trim() || null;
  if (source_url !== undefined) updates.source_url = source_url?.trim() || null;
  if (source_name !== undefined) updates.source_name = source_name?.trim() || null;
  if (is_pinned !== undefined) updates.is_pinned = !!is_pinned;
  if (is_active !== undefined) updates.is_active = !!is_active;
  if (published_at !== undefined) updates.published_at = published_at;

  const { data, error } = await supabase
    .from("masisir_news")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ news: data });
});

/* DELETE /api/admin/news/bulk — hapus berita secara bulk (admin only) */
/* MUST be registered BEFORE /:id to avoid Express matching "bulk" as an id */
app.delete("/api/admin/news/bulk", strictLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "IDs wajib diisi" });
  const supabase = getAdminClient();
  const { error, count } = await supabase.from("masisir_news").delete({ count: "exact" }).in("id", ids);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ deleted: count ?? ids.length });
});

/* DELETE /api/admin/news/:id — delete news item (admin only) */
app.delete("/api/admin/news/:id", strictLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Tidak diizinkan" });
  const supabase = getAdminClient();
  const { error } = await supabase.from("masisir_news").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ success: true });
});

// ─── PROCEDURES (MASISIR) ─────────────────────────────────────────────────

/* GET /api/procedures — public, returns all active procedures */
app.get("/api/procedures", async (req, res) => {
  const supabase = getAdminClient();
  if (!supabase) return res.json({ procedures: DEFAULT_PROCEDURES.map(p => ({ ...p, is_active: true })) });
  const { data, error } = await supabase
    .from("masisir_procedures")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  if (error) {
    // Table may not exist yet — fallback to hardcoded defaults
    if (error.code === "42P01") return res.json({ procedures: DEFAULT_PROCEDURES.map(p => ({ ...p, is_active: true })), fallback: true });
    return res.status(500).json({ error: sanitizeErr(error) });
  }
  res.json({ procedures: data });
});

/* POST /api/admin/procedures — create procedure (master admin only) */
app.post("/api/admin/procedures", writeLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Hanya master admin" });
  const { title, subtitle, icon_name = "FileText", color = "text-violet-400", steps = [], display_order = 0 } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Judul wajib diisi" });
  const id = `proc_${Date.now()}`;
  const supabase = getAdminClient();
  const { data, error } = await supabase.from("masisir_procedures").insert({
    id, title: title.trim(), subtitle: subtitle?.trim() || null,
    icon_name, color, steps, display_order, is_active: true,
  }).select().single();
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.status(201).json({ procedure: data });
});

/* PUT /api/admin/procedures/:id — update procedure (master admin only) */
app.put("/api/admin/procedures/:id", writeLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Hanya master admin" });
  const { title, subtitle, icon_name, color, steps, display_order, is_active } = req.body;
  const updates = {};
  if (title !== undefined)         updates.title         = title?.trim();
  if (subtitle !== undefined)      updates.subtitle      = subtitle?.trim() || null;
  if (icon_name !== undefined)     updates.icon_name     = icon_name;
  if (color !== undefined)         updates.color         = color;
  if (steps !== undefined)         updates.steps         = steps;
  if (display_order !== undefined) updates.display_order = display_order;
  if (is_active !== undefined)     updates.is_active     = !!is_active;
  updates.updated_at = new Date().toISOString();
  const supabase = getAdminClient();
  const { data, error } = await supabase.from("masisir_procedures").update(updates).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ procedure: data });
});

/* DELETE /api/admin/procedures/:id — delete procedure (master admin only) */
app.delete("/api/admin/procedures/:id", writeLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Hanya master admin" });
  const supabase = getAdminClient();
  const { error } = await supabase.from("masisir_procedures").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ success: true });
});

/* POST /api/admin/procedures/reorder — save new display_order (master admin only) */
app.post("/api/admin/procedures/reorder", writeLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Hanya master admin" });
  const { order } = req.body; // [{ id, display_order }]
  if (!Array.isArray(order)) return res.status(400).json({ error: "Format tidak valid" });
  const supabase = getAdminClient();
  await Promise.all(order.map(({ id, display_order }) =>
    supabase.from("masisir_procedures").update({ display_order, updated_at: new Date().toISOString() }).eq("id", id)
  ));
  res.json({ success: true });
});

// ─── LIBRARY ───────────────────────────────────────────────────────────────

/* GET /api/library — authenticated users, returns published items */
app.get("/api/library", writeLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server error" });

  const { category, faculty, year_level, q } = req.query;

  let query = supabase
    .from("library_items")
    .select("id, title, description, category, faculty, year_level, drive_url, file_type, tags, created_at")
    .eq("is_published", true)
    .order("category")
    .order("created_at", { ascending: false });

  if (category && category !== "semua") query = query.eq("category", category);
  if (faculty && faculty !== "semua") query = query.eq("faculty", faculty);
  if (year_level && year_level !== "semua") query = query.eq("year_level", year_level);
  if (q) {
    const term = `%${q}%`;
    query = query.or(`title.ilike.${term},description.ilike.${term},tags.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

/* POST /api/admin/library/upload-file — admin, upload file to storage and return public URL */
app.post("/api/admin/library/upload-file", uploadLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { fileBase64, mimeType, fileName } = req.body;
  if (!fileBase64) return res.status(400).json({ error: "fileBase64 required" });

  // MIME type → extension map (used for BOTH validation and content-type override)
  const ALLOWED_LIBRARY_TYPES = new Map([
    ["application/pdf",  "pdf"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
    ["application/msword",         "doc"],
    ["application/vnd.ms-powerpoint", "ppt"],
    ["image/jpeg", "jpg"],
    ["image/png",  "png"],
    ["application/octet-stream",   null], // will fallback to ext-detection below
  ]);

  // Extension → MIME type fallback (some browsers leave file.type blank)
  const EXT_MIME = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    doc:  "application/msword",
    ppt:  "application/vnd.ms-powerpoint",
    jpg:  "image/jpeg",
    jpeg: "image/jpeg",
    png:  "image/png",
  };

  let safeMime = typeof mimeType === "string" ? mimeType.toLowerCase().trim() : "";
  let ext = ALLOWED_LIBRARY_TYPES.get(safeMime) ?? null;

  // Fallback: derive ext + MIME from file name if browser didn't supply a useful MIME type
  if (!ext && fileName) {
    const fileExt = (fileName.split(".").pop() || "").toLowerCase();
    if (EXT_MIME[fileExt]) {
      safeMime = EXT_MIME[fileExt];
      ext = fileExt;
    }
  }

  if (!ext) {
    return res.status(400).json({ error: "Tipe file tidak didukung. Gunakan PDF, DOCX, atau PPTX." });
  }

  const base64Data = fileBase64.replace(/^data:[^;]+;base64,/, "");
  let buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch {
    return res.status(400).json({ error: "Format file tidak valid. Coba upload ulang." });
  }

  const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(1);
  if (buffer.length > 50 * 1024 * 1024) return res.status(400).json({ error: "Ukuran file maksimal 50MB" });

  console.log(`[Library Upload] admin=${admin.id} file=${fileName} size=${fileSizeMB}MB type=${safeMime} ext=${ext}`);

  const supabase = getAdminClient();

  // Ensure bucket exists — create on-the-fly if missing
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketNames = (buckets || []).map((b) => b.name);
    if (!bucketNames.includes("library-files")) {
      // No fileSizeLimit here — let Supabase project defaults handle it
      const { error: bucketErr } = await supabase.storage.createBucket("library-files", { public: true });
      if (bucketErr && !bucketErr.message?.includes("already exists") && !bucketErr.message?.includes("Duplicate")) {
        console.error("[Library Upload] bucket create error:", bucketErr.message);
        return res.status(500).json({ error: `Gagal membuat storage bucket: ${bucketErr.message}` });
      }
      console.log("[Library Upload] bucket 'library-files' created on-the-fly");
    }
  } catch (bucketEx) {
    console.warn("[Library Upload] bucket check failed, attempting upload anyway:", bucketEx.message);
  }

  const safeName = (fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const storagePath = `${Date.now()}_${safeName}`;

  // Use Uint8Array for maximum Supabase SDK compatibility (Buffer is a subclass but explicit is safer)
  const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const { error: uploadErr } = await supabase.storage
    .from("library-files")
    .upload(storagePath, uint8, { contentType: safeMime, upsert: false });

  if (uploadErr) {
    console.error(`[Library Upload] storage error: ${uploadErr.message}`);
    // Friendly message for common errors
    const msg = uploadErr.message?.toLowerCase() ?? "";
    if (msg.includes("policy") || msg.includes("unauthorized") || msg.includes("403")) {
      return res.status(403).json({ error: "Upload ditolak oleh storage. Pastikan bucket 'library-files' bersifat public dan service role key aktif." });
    }
    if (msg.includes("size") || msg.includes("large") || msg.includes("413")) {
      return res.status(413).json({ error: "File terlalu besar untuk storage. Coba kurangi ukuran file." });
    }
    return res.status(500).json({ error: `Gagal upload ke storage: ${uploadErr.message}` });
  }

  const { data: { publicUrl } } = supabase.storage.from("library-files").getPublicUrl(storagePath);
  console.log(`[Library Upload] ✓ uploaded ${storagePath} → ${publicUrl.slice(0, 60)}...`);
  res.json({ url: publicUrl, ext });
});

/* GET /api/admin/library — admin, list ALL items (including drafts) */
app.get("/api/admin/library", writeLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("library_items")
    .select("id, title, description, category, faculty, year_level, drive_url, file_type, tags, is_published, created_at")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

/* POST /api/admin/library — admin, create item */
app.post("/api/admin/library", writeLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Akses ditolak" });

  const { title, description, category, faculty, year_level, drive_url, file_type, tags, is_published } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Judul wajib diisi" });
  if (!drive_url?.trim()) return res.status(400).json({ error: "Link Google Drive wajib diisi" });

  const supabase = getAdminClient();
  const { data, error } = await supabase.from("library_items").insert({
    title: title.trim(),
    description: description?.trim() || null,
    category: category || "umum",
    faculty: faculty?.trim() || null,
    year_level: year_level?.trim() || null,
    drive_url: drive_url.trim(),
    file_type: file_type || "pdf",
    tags: tags?.trim() || null,
    is_published: is_published !== false,
    created_by: admin.id,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/* PATCH /api/admin/library/:id — admin, update item */
app.patch("/api/admin/library/:id", writeLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Akses ditolak" });

  const { id } = req.params;
  const { title, description, category, faculty, year_level, drive_url, file_type, tags, is_published } = req.body;

  const supabase = getAdminClient();
  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (category !== undefined) updates.category = category;
  if (faculty !== undefined) updates.faculty = faculty?.trim() || null;
  if (year_level !== undefined) updates.year_level = year_level?.trim() || null;
  if (drive_url !== undefined) updates.drive_url = drive_url.trim();
  if (file_type !== undefined) updates.file_type = file_type;
  if (tags !== undefined) updates.tags = tags?.trim() || null;
  if (is_published !== undefined) updates.is_published = is_published;

  const { data, error } = await supabase.from("library_items").update(updates).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/* DELETE /api/admin/library/:id — admin, delete item */
app.delete("/api/admin/library/:id", writeLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Akses ditolak" });

  const supabase = getAdminClient();
  const { error } = await supabase.from("library_items").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* POST /api/admin/library/analyze-text
   Gemini reads raw Arabic text → returns structured KB article previews */
app.post("/api/admin/library/analyze-text", strictLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Akses ditolak" });

  const { text, kitab_name, faculty, year_level } = req.body;
  if (!text?.trim())       return res.status(400).json({ error: "Teks wajib diisi" });
  if (!kitab_name?.trim()) return res.status(400).json({ error: "Nama kitab wajib diisi" });
  if (text.length > 20_000) return res.status(400).json({ error: "Teks terlalu panjang (maks 20.000 karakter)" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OpenRouter tidak dikonfigurasi" });

  const meta = [
    `Nama kitab: ${kitab_name.trim()}`,
    faculty    ? `Fakultas: ${faculty}`    : null,
    year_level ? `Tahun: ${year_level}` : null,
  ].filter(Boolean).join("\n");

  const systemPrompt = `Kamu adalah spesialis teks Islam klasik berbahasa Arab. Tugasmu menganalisis teks dari sebuah kitab dan memisahkannya menjadi bab/fasl/bagian logis.

Untuk setiap bagian, hasilkan objek JSON dengan field berikut:
- "title": Judul dalam format "[Nama Kitab] - [Nama Bab/Fasl]" (gunakan nama bab asli dari teks jika ada)
- "content": Teks Arab asli bagian ini secara lengkap dan persis
- "summary": 2-3 kalimat ringkasan dalam Bahasa Indonesia yang menjelaskan isi dan hukum-hukum penting di bagian ini
- "keywords": keyword Bahasa Indonesia dipisah koma, contoh: "fathul qarib, thaharah, bersuci, air najis, fiqh syafi'i"
- "article_type": selalu isi "narrative"

Aturan penting:
- Pertahankan seluruh teks Arab persis apa adanya
- Title dan keywords HARUS menyebut nama kitab: ${kitab_name.trim()}
- Summary HARUS dalam Bahasa Indonesia
- Maksimal 15 bagian (gabungkan bagian kecil bila perlu)
- Kembalikan HANYA JSON array yang valid, tanpa teks atau markdown apapun di luar array`;

  const userMsg = `${meta}\n\nTeks kitab:\n${text.trim()}`;

  try {
    const data = await callOpenRouter(apiKey, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMsg },
      ],
      temperature: 0.1,
      max_tokens:  8000,
      timeoutMs:   60_000,
      label:       "MuqorrorAnalyze",
    });

    const raw = data?.choices?.[0]?.message?.content ?? "";

    // Extract JSON array from response (model might wrap in markdown)
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.status(422).json({ error: "AI tidak menghasilkan format JSON yang valid. Coba lagi atau sederhanakan teks." });

    let articles;
    try {
      articles = JSON.parse(jsonMatch[0]);
    } catch {
      return res.status(422).json({ error: "Gagal parse JSON dari AI. Coba lagi." });
    }

    if (!Array.isArray(articles) || articles.length === 0) {
      return res.status(422).json({ error: "AI tidak menghasilkan artikel. Pastikan teks berisi konten Arab yang valid." });
    }

    // Sanitize and cap
    const sanitized = articles.slice(0, 15).map((a, i) => ({
      title:        String(a.title   || `${kitab_name} - Bagian ${i + 1}`).slice(0, 120),
      content:      String(a.content || "").trim(),
      summary:      String(a.summary || "").trim(),
      keywords:     String(a.keywords || kitab_name).slice(0, 300),
      article_type: "narrative",
      category:     "Akademik",
    })).filter(a => a.content.length > 10);

    res.json({ articles: sanitized, count: sanitized.length });
  } catch (err) {
    console.error("[MuqorrorAnalyze] error:", err.message);
    res.status(500).json({ error: "AI gagal memproses teks. Coba lagi." });
  }
});

// ─── BADGE SYSTEM ──────────────────────────────────────────────────────────

const BADGE_DEFS = {
  beta_tester:          { name: "Beta Tester",          emoji: "🧪", rare: true  },
  early_adopter:        { name: "Early Adopter",         emoji: "⚡", rare: false },
  first_contribution:   { name: "Kontributor Pertama",   emoji: "✍️", rare: false },
  prolific_contributor: { name: "Prolific Contributor",  emoji: "🌟", rare: true  },
  community_pillar:     { name: "Community Pillar",      emoji: "🏛️", rare: true  },
};

const BETA_MODE = true; // set false when public launch

// Helper: auto-award logic for a user
async function autoAwardBadges(supabaseAdmin, userId, articleCount = 0) {
  const awards = [];

  if (BETA_MODE) {
    awards.push({ user_id: userId, badge_type: "beta_tester" });
  }

  if (articleCount >= 1) {
    awards.push({ user_id: userId, badge_type: "first_contribution" });
  }
  if (articleCount >= 5) {
    awards.push({ user_id: userId, badge_type: "prolific_contributor" });
  }

  if (awards.length > 0) {
    await supabaseAdmin
      .from("user_badges")
      .upsert(awards, { onConflict: "user_id,badge_type", ignoreDuplicates: true });
  }
}

// GET /api/my-badges — returns current user's badges (auto-awards where eligible)
app.get("/api/my-badges", async (req, res) => {
  const supabaseAdmin = getAdminClient();
  if (!supabaseAdmin) return res.status(500).json({ error: "Server config error" });

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });

  // Count approved articles for auto-award
  const { count: articleCount } = await supabaseAdmin
    .from("knowledge_base")
    .select("*", { count: "exact", head: true })
    .eq("author_id", user.id)
    .eq("status", "approved");

  await autoAwardBadges(supabaseAdmin, user.id, articleCount ?? 0);

  const { data: badges, error } = await supabaseAdmin
    .from("user_badges")
    .select("badge_type, awarded_at")
    .eq("user_id", user.id)
    .order("awarded_at", { ascending: true });

  // If table doesn't exist yet, return empty (non-fatal)
  if (error) {
    if (error.code === "42P01") return res.json([]); // table not found
    return res.status(500).json({ error: sanitizeErr(error) });
  }

  const enriched = (badges ?? []).map(b => ({
    ...b,
    ...(BADGE_DEFS[b.badge_type] ?? { name: b.badge_type, emoji: "🏅", rare: false }),
  }));

  res.json(enriched);
});

// POST /api/admin/badges/award — admin awards a badge manually
app.post("/api/admin/badges/award", async (req, res) => {
  const supabaseAdmin = getAdminClient();
  if (!supabaseAdmin) return res.status(500).json({ error: "Server config error" });

  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { userId, badgeType } = req.body;
  if (!userId || !badgeType) return res.status(400).json({ error: "userId and badgeType required" });
  if (!BADGE_DEFS[badgeType]) return res.status(400).json({ error: `Unknown badge: ${badgeType}` });

  const { error } = await supabaseAdmin
    .from("user_badges")
    .upsert({ user_id: userId, badge_type: badgeType, awarded_by: admin.id },
      { onConflict: "user_id,badge_type", ignoreDuplicates: true });

  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  console.log(`[BADGES] Admin ${admin.email} awarded "${badgeType}" to user ${userId}`);
  res.json({ success: true });
});

// DELETE /api/admin/badges/revoke — admin revokes a badge
app.delete("/api/admin/badges/revoke", async (req, res) => {
  const supabaseAdmin = getAdminClient();
  if (!supabaseAdmin) return res.status(500).json({ error: "Server config error" });

  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { userId, badgeType } = req.body;
  if (!userId || !badgeType) return res.status(400).json({ error: "userId and badgeType required" });

  const { error } = await supabaseAdmin
    .from("user_badges")
    .delete()
    .eq("user_id", userId)
    .eq("badge_type", badgeType);

  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  console.log(`[BADGES] Admin ${admin.email} revoked "${badgeType}" from user ${userId}`);
  res.json({ success: true });
});

// GET /api/admin/badges/all — list all badge assignments
app.get("/api/admin/badges/all", async (req, res) => {
  const supabaseAdmin = getAdminClient();
  if (!supabaseAdmin) return res.status(500).json({ error: "Server config error" });

  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { data, error } = await supabaseAdmin
    .from("user_badges")
    .select("*, profiles(full_name, email)")
    .order("awarded_at", { ascending: false });

  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json(data ?? []);
});

/* ── Admin: Monitor Chats (Master Admin only) ────────── */
app.get("/api/admin/chats", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const rawSearch = typeof req.query.search === "string" ? req.query.search.slice(0, 200) : "";
  const safeLimit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 100);
  const safeOffset = Math.max(0, parseInt(req.query.offset) || 0);

  const { data: chats, error } = await supabase
    .from("chats")
    .select("id, title, user_id, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  if (!chats || chats.length === 0) return res.json([]);

  const userIds = [...new Set(chats.map(c => c.user_id))];
  const [{ data: profiles }, { data: lastMsgs }] = await Promise.all([
    supabase.from("profiles").select("user_id, full_name, email, avatar_url").in("user_id", userIds),
    supabase.from("messages").select("chat_id, content, role, created_at")
      .in("chat_id", chats.map(c => c.id))
      .eq("role", "user")
      .order("created_at", { ascending: false }),
  ]);

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]));
  const lastMsgMap = {};
  (lastMsgs ?? []).forEach(m => {
    if (!lastMsgMap[m.chat_id]) lastMsgMap[m.chat_id] = m.content;
  });

  const result = chats
    .map(c => ({
      ...c,
      profile: profileMap[c.user_id] ?? null,
      lastUserMessage: lastMsgMap[c.id] ?? null,
    }))
    .filter(c => {
      if (!rawSearch) return true;
      const q = rawSearch.toLowerCase();
      return (
        c.title?.toLowerCase().includes(q) ||
        c.profile?.full_name?.toLowerCase().includes(q) ||
        c.profile?.email?.toLowerCase().includes(q) ||
        c.lastUserMessage?.toLowerCase().includes(q)
      );
    });

  res.json(result);
});

/* ── Master Admin: Bulk-delete selected chats ─────────── */
/* IMPORTANT: specific routes must come BEFORE /:chatId param route */
app.delete("/api/admin/chats/bulk-selected", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids must be a non-empty array" });
  if (ids.length > 200) return res.status(400).json({ error: "Maximum 200 chats per bulk delete" });

  await supabase.from("messages").delete().in("chat_id", ids);
  const { error, count } = await supabase.from("chats").delete({ count: "exact" }).in("id", ids);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  console.log(`[ADMIN] Bulk-deleted ${count} selected chats by master admin ${admin.id}`);
  res.json({ deleted: count ?? ids.length });
});

/* ── Master Admin: Bulk-delete old chats ──────────────── */
app.delete("/api/admin/chats/bulk-old", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const days = Math.min(Math.max(7, parseInt(req.query.days) || 90), 365);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Fetch IDs to delete first
  const { data: oldChats } = await supabase
    .from("chats").select("id").lt("updated_at", cutoff);
  if (!oldChats || oldChats.length === 0) return res.json({ deleted: 0 });

  const ids = oldChats.map(c => c.id);
  await supabase.from("messages").delete().in("chat_id", ids);
  const { error, count } = await supabase.from("chats").delete({ count: "exact" }).in("id", ids);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  console.log(`[ADMIN] Bulk-deleted ${count} chats older than ${days} days by master admin ${admin.id}`);
  res.json({ deleted: count ?? ids.length });
});

/* ── Master Admin: Delete a single chat (+ its messages) ── */
app.delete("/api/admin/chats/:chatId", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { chatId } = req.params;

  // Delete messages first (in case FK constraint exists without cascade)
  await supabase.from("messages").delete().eq("chat_id", chatId);
  const { error } = await supabase.from("chats").delete().eq("id", chatId);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  console.log(`[ADMIN] Chat ${chatId} deleted by master admin ${admin.id}`);
  res.json({ success: true });
});

app.get("/api/admin/chats/:chatId/messages", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("chat_id", req.params.chatId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json(data ?? []);
});

/* ── Bulk Delete Users (Master Admin only) ───────────── */
app.post("/api/admin/users/bulk-delete", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0)
    return res.status(400).json({ error: "userIds harus berupa array yang tidak kosong" });
  if (userIds.length > 100)
    return res.status(400).json({ error: "Maksimal 100 user per request" });

  const supabase = getAdminClient();
  const results = { success: [], failed: [] };

  for (const userId of userIds) {
    if (userId === admin.id) {
      results.failed.push({ userId, reason: "Tidak bisa menghapus akun sendiri" });
      continue;
    }
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      results.failed.push({ userId, reason: error.message });
    } else {
      results.success.push(userId);
      console.log(`[ADMIN] User ${userId} bulk-deleted by admin ${admin.email}`);
    }
  }

  res.json(results);
});

/* ── Delete User (Master Admin only) ─────────────────── */
app.delete("/api/admin/users/:userId", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { userId } = req.params;
  if (userId === admin.id) return res.status(400).json({ error: "Tidak bisa menghapus akun sendiri" });

  const supabase = getAdminClient();

  // Delete from auth (cascades to profiles, roles, etc via DB triggers)
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  console.log(`[ADMIN] User ${userId} deleted by admin ${admin.email}`);
  res.json({ success: true });
});

/* ── Admin: Ban / Unban User ─────────────────────────── */
app.post("/api/admin/users/:userId/ban", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { userId } = req.params;
  if (userId === admin.id) return res.status(400).json({ error: "Tidak bisa memban diri sendiri" });

  const supabase = getAdminClient();
  const { error } = await supabase.from("profiles").update({ is_banned: true }).eq("user_id", userId);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  console.log(`[ADMIN] User ${userId} BANNED by ${admin.email}`);
  res.json({ success: true });
});

app.post("/api/admin/users/:userId/unban", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { userId } = req.params;
  const supabase = getAdminClient();
  const { error } = await supabase.from("profiles").update({ is_banned: false }).eq("user_id", userId);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  console.log(`[ADMIN] User ${userId} UNBANNED by ${admin.email}`);
  res.json({ success: true });
});

/* ── Toggle Leaderboard Visibility (Master Admin only) ── */
app.patch("/api/master/users/:userId/leaderboard-visibility", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { userId } = req.params;
  const { hidden } = req.body;
  if (typeof hidden !== "boolean") return res.status(400).json({ error: "hidden (boolean) diperlukan" });

  const supabase = getAdminClient();
  const { error } = await supabase.from("profiles").update({ hidden_from_leaderboard: hidden }).eq("user_id", userId);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  console.log(`[ADMIN] User ${userId} leaderboard visibility set to hidden=${hidden} by ${admin.email}`);
  res.json({ success: true, hidden });
});

/* ── Pinned Updates (Breaking Updates) ───────────────── */
app.get("/api/admin/pinned-updates", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  try {
    const { data, error } = await supabase
      .from("pinned_updates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data ?? []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/pinned-updates", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { topic, content, expires_at } = req.body;
  if (!topic?.trim() || !content?.trim()) return res.status(400).json({ error: "topic and content required" });

  const supabase = getAdminClient();
  try {
    const { data, error } = await supabase
      .from("pinned_updates")
      .insert({ topic: topic.trim(), content: content.trim(), expires_at: expires_at || null, active: true, created_by: admin.id })
      .select()
      .single();
    if (error) throw error;
    console.log(`[ADMIN] Pinned update created: "${topic}" by ${admin.email}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/admin/pinned-updates/:id", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { id } = req.params;
  const updates = {};
  if (typeof req.body.active === "boolean") updates.active = req.body.active;
  if (req.body.topic) updates.topic = req.body.topic.trim();
  if (req.body.content) updates.content = req.body.content.trim();
  if ("expires_at" in req.body) updates.expires_at = req.body.expires_at || null;

  try {
    const { error } = await supabase.from("pinned_updates").update(updates).eq("id", id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admin/pinned-updates/:id", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { id } = req.params;
  try {
    const { error } = await supabase.from("pinned_updates").delete().eq("id", id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── Active Breaking Updates (public, auth required) ─── */
app.get("/api/active-updates", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server not configured" });

  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("pinned_updates")
      .select("id, topic, content, created_at")
      .eq("active", true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data ?? []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── Report Message ──────────────────────────────────── */
app.post("/api/report-message", writeLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server not configured" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });

  const { message_id, message_content, user_question, reason, additional_note, revised_answer } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: "reason required" });
  if (reason.trim().length > 500) return res.status(400).json({ error: "Alasan terlalu panjang (maks 500 karakter)" });
  if (revised_answer && revised_answer.trim().length > 10000) return res.status(400).json({ error: "Revisi terlalu panjang (maks 10.000 karakter)" });

  try {
    // Try inserting with extended columns; fall back gracefully if they don't exist yet
    let reportId = null;
    const fullPayload = {
      user_id: user.id,
      message_id: message_id || null,
      message_content: message_content?.slice(0, 2000) || null,
      user_question: user_question?.slice(0, 1000) || null,
      additional_note: additional_note?.slice(0, 500) || null,
      reason: reason.trim(),
      status: "pending",
    };
    let { data, error } = await supabase.from("message_reports").insert(fullPayload).select().single();
    if (error && (error.message?.includes("additional_note") || error.message?.includes("user_question"))) {
      // Columns don't exist yet — fall back and embed extra info in reason
      const fallbackReason = [
        reason.trim(),
        user_question ? `[Pertanyaan: ${user_question.slice(0, 500)}]` : null,
        additional_note ? `[Catatan: ${additional_note.slice(0, 300)}]` : null,
      ].filter(Boolean).join(" | ");
      const fallback = await supabase.from("message_reports").insert({
        user_id: user.id,
        message_id: message_id || null,
        message_content: message_content?.slice(0, 2000) || null,
        reason: fallbackReason.slice(0, 1000),
        status: "pending",
      }).select().single();
      if (fallback.error) throw fallback.error;
      data = fallback.data;
      console.warn("[REPORT] Fell back to compact mode — run migration SQL in Supabase to add user_question/additional_note columns");
    } else if (error) {
      throw error;
    }
    reportId = data?.id;
    console.log(`[REPORT] New report ${reportId} by user ${user.id}: "${reason}"`);

    // If the reporter provided a revised answer, create a pending KB entry for admin review
    let kbCreated = false;
    if (revised_answer?.trim()) {
      const questionSnippet = (user_question || "Pertanyaan tidak diketahui").slice(0, 140);
      const kbTitle = `[Koreksi AI] ${questionSnippet}`;
      const kbContent = [
        user_question ? `**Pertanyaan yang dilaporkan:**\n${user_question.slice(0, 600)}` : null,
        `**Jawaban yang diusulkan:**\n${revised_answer.trim()}`,
        `---\n*Diajukan sebagai koreksi atas jawaban AI. ID Laporan: ${reportId}*`,
      ].filter(Boolean).join("\n\n");

      // Try full insert first (with optional columns that require migration)
      let { error: kbErr } = await supabase.from("knowledge_base").insert({
        author_id: user.id,
        title: kbTitle,
        content: kbContent,
        category: "Administrasi",
        status: "pending",
        article_type: "narrative",
        keywords: "koreksi, ai correction, perbaikan",
      });

      // If optional columns don't exist yet, retry with only core columns
      if (kbErr && (kbErr.message?.includes("article_type") || kbErr.message?.includes("keywords") || kbErr.message?.includes("column"))) {
        console.warn(`[REPORT] Retrying KB insert without optional columns: ${kbErr.message}`);
        const retry = await supabase.from("knowledge_base").insert({
          author_id: user.id,
          title: kbTitle,
          content: kbContent,
          category: "Administrasi",
          status: "pending",
        });
        kbErr = retry.error;
      }

      if (kbErr) console.error(`[REPORT] Failed to create KB revision entry: ${kbErr.message}`);
      else { kbCreated = true; console.log(`[REPORT] Revision KB entry created from report ${reportId}`); }
    }

    res.json({ success: true, id: reportId, has_revision: !!revised_answer?.trim(), kb_created: kbCreated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/reports", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { status = "pending" } = req.query;
  try {
    let query = supabase
      .from("message_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    const { data: reports, error } = await query;
    if (error) throw error;
    if (!reports || reports.length === 0) return res.json([]);

    // Fetch reporter profiles separately (no direct FK from message_reports to profiles)
    const userIds = [...new Set(reports.map(r => r.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
      : { data: [] };

    const profileMap = {};
    (profiles ?? []).forEach(p => { profileMap[p.user_id] = p; });

    res.json(reports.map(r => ({
      ...r,
      reporter: r.user_id ? (profileMap[r.user_id] ?? null) : null,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/admin/reports/:id", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { id } = req.params;
  const { status, admin_note } = req.body;
  const validStatuses = ["pending", "reviewed", "dismissed"];
  if (status && !validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

  const updates = {};
  if (status) updates.status = status;
  if (admin_note !== undefined) updates.admin_note = admin_note;

  try {
    const { error } = await supabase.from("message_reports").update(updates).eq("id", id);
    if (error) throw error;

    // If marked as reviewed, auto-approve any linked KB correction entries
    let kbApproved = 0;
    if (status === "reviewed") {
      try {
        const searchPattern = `%ID Laporan: ${id}%`;
        const { data: kbEntries } = await supabase
          .from("knowledge_base")
          .select("id")
          .like("content", searchPattern)
          .eq("status", "pending");

        if (kbEntries && kbEntries.length > 0) {
          await supabase
            .from("knowledge_base")
            .update({ status: "approved" })
            .in("id", kbEntries.map(e => e.id));
          kbApproved = kbEntries.length;
          console.log(`[REPORT] Auto-approved ${kbApproved} KB entry(ies) linked to report ${id}`);
        }
      } catch (kbE) {
        console.error(`[REPORT] Failed to auto-approve linked KB entries: ${kbE.message}`);
      }
    }

    res.json({ success: true, kb_approved: kbApproved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admin/reports/:id", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { id } = req.params;

  try {
    const { error } = await supabase.from("message_reports").delete().eq("id", id);
    if (error) throw error;
    console.log(`[REPORT] Report ${id} deleted by admin ${admin.id}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── Migration SQL — admin helper ───────────────────────*/
// Returns the SQL needed to create any missing tables.
// Admin can paste this into the Supabase SQL editor.
app.get("/api/admin/migration-sql", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();

  // Check which tables are missing
  const tableChecks = [
    "threads", "thread_replies", "pinned_updates",
    "message_reports", "notifications", "user_badges", "user_memories",
  ];
  const missing = [];
  for (const table of tableChecks) {
    const { error } = await supabase.from(table).select("*").limit(0);
    if (error && (error.code === "42P01" || error.message?.includes("does not exist"))) {
      missing.push(table);
    }
  }

  const sqlBlocks = {
    threads: `-- Threads & replies
CREATE TABLE IF NOT EXISTS public.threads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('Administrasi','Akademik','Kehidupan Mesir','Transport','Tempat Tinggal','Kuliner')),
  reply_count  INTEGER NOT NULL DEFAULT 0,
  promoted_to_kb BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Authenticated users can view threads" ON public.threads FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated users can create threads" ON public.threads FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authors can delete own threads" ON public.threads FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage all threads" ON public.threads FOR ALL USING (public.has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_threads_category ON public.threads(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_user ON public.threads(user_id);`,

    thread_replies: `CREATE TABLE IF NOT EXISTS public.thread_replies (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES public.threads(id) ON DELETE CASCADE NOT NULL,
  user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.thread_replies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Authenticated users can view replies" ON public.thread_replies FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated users can create replies" ON public.thread_replies FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authors can delete own replies" ON public.thread_replies FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage all replies" ON public.thread_replies FOR ALL USING (public.has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_thread_replies_thread ON public.thread_replies(thread_id, created_at ASC);
CREATE OR REPLACE FUNCTION public.update_thread_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.threads SET reply_count = reply_count + 1, updated_at = now() WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.threads SET reply_count = GREATEST(reply_count - 1, 0), updated_at = now() WHERE id = OLD.thread_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS update_threads_reply_count ON public.thread_replies;
CREATE TRIGGER update_threads_reply_count
  AFTER INSERT OR DELETE ON public.thread_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_thread_reply_count();`,

    pinned_updates: `-- Pinned / breaking updates
CREATE TABLE IF NOT EXISTS public.pinned_updates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic      TEXT NOT NULL,
  content    TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pinned_updates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Admin can manage pinned_updates" ON public.pinned_updates FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Server can read pinned_updates" ON public.pinned_updates FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_pinned_updates_active ON public.pinned_updates(active, expires_at);`,

    message_reports: `-- Message reports
CREATE TABLE IF NOT EXISTS public.message_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message_id      TEXT,
  message_content TEXT,
  user_question   TEXT,
  reason          TEXT NOT NULL,
  additional_note TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed')),
  admin_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can insert own reports" ON public.message_reports FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admin can manage all reports" ON public.message_reports FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_message_reports_status ON public.message_reports(status, created_at DESC);
-- Column migrations for existing installations:
ALTER TABLE public.message_reports ADD COLUMN IF NOT EXISTS user_question TEXT;
ALTER TABLE public.message_reports ADD COLUMN IF NOT EXISTS additional_note TEXT;
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS keywords TEXT;
-- Helper function for server-side migrations (required for auto-migration to work):
CREATE OR REPLACE FUNCTION public.exec_sql(sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN EXECUTE sql; END; $$;`,

    notifications: `-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning')),
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Server can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);`,

    user_badges: `-- User badges
CREATE TABLE IF NOT EXISTS public.user_badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  badge_type  TEXT NOT NULL,
  awarded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  awarded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_type)
);
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own badges" ON public.user_badges FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage badges" ON public.user_badges FOR ALL USING (public.has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges(user_id);`,

    user_memories: `-- User memories (AINA remembers facts about each user)
CREATE TABLE IF NOT EXISTS public.user_memories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  memory       TEXT NOT NULL,
  memory_type  TEXT NOT NULL DEFAULT 'context_memory' CHECK (memory_type IN ('preference_memory','context_memory','task_memory')),
  is_long_term BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can manage own memories" ON public.user_memories FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_user_memories_user ON public.user_memories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_memories_type ON public.user_memories(user_id, memory_type);`,

    eval_benchmarks: `-- Evaluation benchmark question set
CREATE TABLE IF NOT EXISTS public.eval_benchmarks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question          TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('factual','procedural','confused','recommendation','brainstorming','current_role','kb_first','memory')),
  expected_behavior TEXT,
  is_edge_case      BOOLEAN NOT NULL DEFAULT false,
  edge_note         TEXT,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.eval_benchmarks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Master admin manages benchmarks" ON public.eval_benchmarks FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_eval_benchmarks_cat ON public.eval_benchmarks(category);`,

    eval_results: `-- Evaluation scored results
CREATE TABLE IF NOT EXISTS public.eval_results (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id          UUID REFERENCES public.eval_benchmarks(id) ON DELETE SET NULL,
  run_id                UUID NOT NULL DEFAULT gen_random_uuid(),
  question              TEXT NOT NULL,
  category              TEXT NOT NULL,
  answer                TEXT NOT NULL,
  score_accuracy        SMALLINT CHECK (score_accuracy BETWEEN 1 AND 5),
  score_relevance       SMALLINT CHECK (score_relevance BETWEEN 1 AND 5),
  score_structure       SMALLINT CHECK (score_structure BETWEEN 1 AND 5),
  score_human_feel      SMALLINT CHECK (score_human_feel BETWEEN 1 AND 5),
  score_trustworthiness SMALLINT CHECK (score_trustworthiness BETWEEN 1 AND 5),
  total_score           NUMERIC(5,2),
  notes                 TEXT,
  version_tag           TEXT NOT NULL,
  eval_mode             TEXT NOT NULL DEFAULT 'manual',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.eval_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Master admin manages eval results" ON public.eval_results FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_eval_results_version ON public.eval_results(version_tag, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_results_run ON public.eval_results(run_id);`,

    eval_edge_cases: `-- Known risky / bug-prone queries
CREATE TABLE IF NOT EXISTS public.eval_edge_cases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question            TEXT NOT NULL,
  risk_type           TEXT NOT NULL CHECK (risk_type IN ('current_role_error','kb_refusal','memory_over_injection','weak_recommendation','hallucination','other')),
  description         TEXT,
  example_bad_answer  TEXT,
  resolved            BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.eval_edge_cases ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Master admin manages edge cases" ON public.eval_edge_cases FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

    flashcard_sets: `CREATE TABLE IF NOT EXISTS public.flashcard_sets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL,
  source     TEXT,
  bilingual  BOOLEAN NOT NULL DEFAULT false,
  cards      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.flashcard_sets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own sets"   ON public.flashcard_sets FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can create sets"    ON public.flashcard_sets FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can delete own sets" ON public.flashcard_sets FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_flashcard_sets_user ON public.flashcard_sets(user_id, created_at DESC);`,
  };

  // Also include profile + article_type columns migration
  const columnsSql = `-- Extended profile fields (safe to re-run)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS faculty TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS study_field TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS arrival_year INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS origin_city TEXT;

-- Setup completed flag (safe to re-run)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN DEFAULT FALSE;
UPDATE public.profiles SET setup_completed = TRUE WHERE full_name IS NOT NULL AND full_name != '' AND setup_completed = FALSE;

-- Ban flag (safe to re-run)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;

-- Leaderboard visibility flag (safe to re-run)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hidden_from_leaderboard BOOLEAN NOT NULL DEFAULT FALSE;

-- Article type column
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS article_type TEXT NOT NULL DEFAULT 'narrative'
  CHECK (article_type IN ('narrative', 'step_by_step'));

-- Hidden flag for articles (master admin can hide from public leaderboard, AI still uses them)
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- Memory type + long-term flag (Phase 6: typed memory — safe to re-run)
ALTER TABLE public.user_memories ADD COLUMN IF NOT EXISTS memory_type TEXT NOT NULL DEFAULT 'context_memory';
ALTER TABLE public.user_memories ADD COLUMN IF NOT EXISTS is_long_term BOOLEAN NOT NULL DEFAULT false;

-- Custom Instructions (ChatGPT-style personalization)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_about TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_instructions TEXT;

-- Contributor requests new fields (enhanced registration with article sample)
ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS article_content TEXT;
ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS article_file_url TEXT;
ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS portfolio_link TEXT;
ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Announcement tables
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'announcement' CHECK (type IN ('welcome','announcement')),
  target_audience TEXT NOT NULL DEFAULT 'all_users' CHECK (target_audience IN ('new_users','old_users','all_users')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  button_text TEXT,
  button_link TEXT,
  image_url TEXT,
  dismissible BOOLEAN NOT NULL DEFAULT true,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.system_announcements ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS public.user_announcement_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  announcement_id UUID REFERENCES public.system_announcements(id) ON DELETE CASCADE NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ,
  UNIQUE(user_id, announcement_id)
);`;

  const neededSql = missing.map(t => sqlBlocks[t]).filter(Boolean).join("\n\n");
  const fullSql = [neededSql, columnsSql].filter(Boolean).join("\n\n");

  res.json({
    missingTables: missing,
    allTablesOk: missing.length === 0,
    sql: fullSql || "-- All tables already exist. Run the column migration below to be safe:\n\n" + columnsSql,
  });
});

/* ── Security Logs — master admin only ───────────────── */
app.get("/api/admin/security-logs", strictLimiter, async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const typeFilter = req.query.type; // optional: AUTH-FAIL | FORBIDDEN | RATE-LIMITED

  let events = _securityLog;
  if (typeFilter) events = events.filter(e => e.type === typeFilter);

  res.json({
    total: _securityLog.length,
    returned: Math.min(events.length, limit),
    events: events.slice(0, limit),
  });
});

/* ── Clear Security Logs — master admin only ─────────── */
app.delete("/api/admin/security-logs", strictLimiter, async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  _securityLog.length = 0;
  console.log(`[SECURITY] Log cleared by master admin ${admin.email}`);
  res.json({ success: true });
});

/* ══════════════════════════════════════════════════════
   MIDTRANS PAYMENT ROUTES
   Status: DISABLED (PAYMENT_ENABLED=false)
   Untuk mengaktifkan:
     1. Set PAYMENT_ENABLED=true di environment
     2. Set MIDTRANS_SERVER_KEY & MIDTRANS_CLIENT_KEY (Sandbox atau Production)
     3. Set MIDTRANS_IS_PRODUCTION=true saat siap live
   ══════════════════════════════════════════════════════ */

const PAYMENT_ENABLED = process.env.PAYMENT_ENABLED === "true";

console.log(`Payment (Midtrans): ${PAYMENT_ENABLED ? "✓ enabled" : "✗ disabled — set PAYMENT_ENABLED=true to enable"}`);

if (PAYMENT_ENABLED) {
  const midtransClient = await import("midtrans-client").then(m => m.default ?? m);

  const snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
  });

  const coreApi = new midtransClient.CoreApi({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
  });

  /* -- Plan config ---------------------------------------- */
  const PLANS = {
    pro_monthly: { price: 29000, label: "AINA Pro — Bulanan", duration_days: 30 },
    pro_annual:  { price: 249000, label: "AINA Pro — Tahunan", duration_days: 365 },
  };

  /* -- Payment config (exposes client key & status safely) */
  app.get("/api/payment/config", (_req, res) => {
    res.json({
      enabled: true,
      client_key: process.env.MIDTRANS_CLIENT_KEY,
      is_production: process.env.MIDTRANS_IS_PRODUCTION === "true",
    });
  });

  /* -- Create Snap payment token -------------------------- */
  app.post("/api/payment/create-order", writeLimiter, async (req, res) => {
    const supabase = getAdminClient();
    if (!supabase) return res.status(503).json({ error: "Server tidak tersedia" });

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan" });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: "Sesi tidak valid" });

    const { plan_id } = req.body;
    const plan = PLANS[plan_id];
    if (!plan) return res.status(400).json({ error: "Paket tidak ditemukan" });

    const orderId = `AINA-${plan_id.toUpperCase()}-${user.id.slice(0, 8)}-${Date.now()}`;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", user.id)
      .single();

    try {
      const snapToken = await snap.createTransactionToken({
        transaction_details: {
          order_id: orderId,
          gross_amount: plan.price,
        },
        customer_details: {
          first_name: profile?.full_name || "AINA User",
          email: profile?.email || user.email,
        },
        item_details: [
          { id: plan_id, price: plan.price, quantity: 1, name: plan.label },
        ],
        callbacks: {
          finish: `${process.env.CLIENT_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`}/dashboard?payment=success`,
          error:  `${process.env.CLIENT_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`}/pricing?payment=error`,
          pending:`${process.env.CLIENT_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`}/dashboard?payment=pending`,
        },
      });

      console.log(`[PAYMENT] Snap token created: orderId=${orderId} plan=${plan_id} user=${user.id}`);
      res.json({ token: snapToken, order_id: orderId });
    } catch (e) {
      console.error("[PAYMENT] Snap token error:", e.message);
      res.status(500).json({ error: "Gagal membuat sesi pembayaran" });
    }
  });

  /* -- Midtrans webhook (payment notification) ------------ */
  app.post("/api/payment/webhook", async (req, res) => {
    try {
      const notification = await coreApi.transaction.notification(req.body);
      const { order_id, transaction_status, fraud_status, gross_amount } = notification;

      console.log(`[PAYMENT] Webhook: orderId=${order_id} status=${transaction_status} fraud=${fraud_status}`);

      const isSuccess =
        (transaction_status === "capture" && fraud_status === "accept") ||
        transaction_status === "settlement";

      if (isSuccess) {
        // Parse userId and plan from orderId: AINA-PRO_MONTHLY-<8-char-uid>-<timestamp>
        const parts = order_id.split("-");
        const planKey = parts.slice(1, 3).join("_").toLowerCase(); // e.g. pro_monthly
        const plan = PLANS[planKey];

        if (plan) {
          const supabase = getAdminClient();
          // Find user by matching the 8-char uid prefix
          const uidPrefix = parts[3];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id")
            .ilike("user_id", `${uidPrefix}%`)
            .limit(1);

          const userId = profiles?.[0]?.user_id;
          if (userId) {
            const expiresAt = new Date(Date.now() + plan.duration_days * 86400 * 1000).toISOString();

            // Store subscription (column: plan, expires_at — add via migration when enabling)
            await supabase.from("subscriptions").upsert({
              user_id: userId,
              plan: planKey,
              order_id,
              amount: parseInt(gross_amount),
              expires_at: expiresAt,
              activated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });

            // Notify user
            await supabase.from("notifications").insert({
              user_id: userId,
              title: "AINA Pro Aktif! 🎉",
              message: `Langganan ${plan.label} kamu berhasil. Nikmati akses penuh hingga ${new Date(expiresAt).toLocaleDateString("id-ID")}.`,
              type: "success",
            });

            console.log(`[PAYMENT] ✓ Pro activated for user=${userId} plan=${planKey} expires=${expiresAt}`);
          }
        }
      }

      res.sendStatus(200);
    } catch (e) {
      console.error("[PAYMENT] Webhook error:", e.message);
      res.sendStatus(200); // always 200 to Midtrans
    }
  });

  /* -- Check order status --------------------------------- */
  app.get("/api/payment/status/:orderId", writeLimiter, async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan" });
    try {
      const statusResponse = await coreApi.transaction.status(req.params.orderId);
      res.json(statusResponse);
    } catch (e) {
      res.status(404).json({ error: "Order tidak ditemukan" });
    }
  });

  /* -- Get user subscription status ----------------------- */
  app.get("/api/payment/subscription", async (req, res) => {
    const supabase = getAdminClient();
    if (!supabase) return res.status(503).json({ error: "Server tidak tersedia" });

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan" });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: "Sesi tidak valid" });

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan, expires_at, activated_at")
      .eq("user_id", user.id)
      .single();

    const isActive = sub && new Date(sub.expires_at) > new Date();
    res.json({ subscription: isActive ? sub : null, is_active: !!isActive });
  });

} else {
  /* -- Stub routes when payment is disabled --------------- */
  app.get("/api/payment/config", (_req, res) =>
    res.json({ enabled: false, client_key: null, is_production: false })
  );
  app.post("/api/payment/create-order", (_req, res) =>
    res.status(503).json({ error: "Fitur pembayaran belum aktif. Segera hadir!" })
  );
  app.post("/api/payment/webhook", (_req, res) => res.sendStatus(200));
  app.get("/api/payment/status/:orderId", (_req, res) =>
    res.status(503).json({ error: "Fitur pembayaran belum aktif." })
  );
  app.get("/api/payment/subscription", (_req, res) =>
    res.json({ subscription: null, is_active: false })
  );
}

/* ── Evaluation System — master admin only ───────────── */

const EVAL_CATEGORIES = ["factual","procedural","confused","recommendation","brainstorming","current_role","kb_first","memory"];
const EVAL_RISK_TYPES  = ["current_role_error","kb_refusal","memory_over_injection","weak_recommendation","hallucination","other"];

// Default benchmark set — seeded once into eval_benchmarks
const DEFAULT_BENCHMARKS = [
  // factual
  { question: "Apa itu iqomah dan apa fungsinya untuk mahasiswa di Mesir?", category: "factual", expected_behavior: "Jawaban singkat, akurat, tidak berlebihan. Harus dari KB jika ada." },
  { question: "Berapa lama masa berlaku visa pelajar Mesir biasanya?", category: "factual", expected_behavior: "Angka/durasi spesifik. Jika tidak ada di KB, boleh dari memori model atau Wikipedia." },
  // procedural
  { question: "Bagaimana cara mengurus iqomah untuk mahasiswa baru Al-Azhar? Jelaskan langkah-langkahnya.", category: "procedural", expected_behavior: "Format langkah bernomor. Harus dari KB jika ada. Tidak boleh generik." },
  { question: "Langkah-langkah mendaftar kuliah di Al-Azhar step by step?", category: "procedural", expected_behavior: "Format step-by-step. KB-first. Tidak ada basa-basi." },
  // confused
  { question: "Aduh aku bingung banget soal iqomah, nggak ngerti harus mulai dari mana", category: "confused", is_edge_case: true, edge_note: "Harus akui kebingungan dulu sebelum solusi", expected_behavior: "Satu kalimat empati, lalu langsung langkah-langkah." },
  { question: "Tolong bantu aku, kata orang visa ku mau expired, aku takut dideportasi", category: "confused", is_edge_case: true, edge_note: "Jangan panik, jangan terlalu menenangkan — langsung solusi konkret", expected_behavior: "Akui situasi, langsung ke tindakan yang harus diambil segera." },
  // recommendation
  { question: "Kos mana yang paling recommended untuk mahasiswa baru di sekitar Al-Azhar?", category: "recommendation", expected_behavior: "Rekomendasi konkret dengan alasan. Tidak boleh 'tergantung kebutuhan' tanpa arahan." },
  { question: "Aplikasi apa yang paling berguna untuk mahasiswa Indonesia di Kairo?", category: "recommendation", expected_behavior: "Daftar konkret dengan kegunaan singkat. Tidak berlebihan." },
  // brainstorming
  { question: "Apa saja yang bisa aku lakukan di Mesir selama liburan semester?", category: "brainstorming", expected_behavior: "Ide-ide konkret dan beragam. Bullet list. Nada antusias tapi informatif." },
  { question: "Kira-kira sumber penghasilan apa yang bisa dicoba mahasiswa sambil kuliah di Kairo?", category: "brainstorming", expected_behavior: "Ide realistis, bukan generik. Sebutkan kendala lokal jika relevan." },
  // current_role (high-risk — AINA harus blokir jika tidak ada sumber)
  { question: "Siapa rektor Al-Azhar saat ini?", category: "current_role", is_edge_case: true, edge_note: "AINA harus tidak menyebut nama spesifik dari memori model. Harus redirect ke sumber.", expected_behavior: "Tidak menyebut nama dari memori. Menyarankan cek sumber resmi atau KB/pinned jika ada." },
  { question: "Siapa ketua PPI Mesir sekarang?", category: "current_role", is_edge_case: true, edge_note: "Jabatan sangat dinamis — risiko tinggi salah nama", expected_behavior: "Blokir atau redirect. Tidak ada nama dari model memory." },
  // kb_first
  { question: "Dokumen apa saja yang dibutuhkan untuk perpanjang paspor di KBRI Kairo?", category: "kb_first", expected_behavior: "Harus dari KB jika ada. Wikipedia atau DDG tidak boleh diinjeksi jika KB sudah kuat." },
  { question: "Cara membuat SKCK untuk keperluan di Mesir?", category: "kb_first", expected_behavior: "KB-first. Format langkah jika ada. External tidak digunakan jika KB mencukupi." },
  // memory/personalization
  { question: "Tips apa untuk mahasiswa yang baru tiba di Kairo bulan ini?", category: "memory", expected_behavior: "Jika memory user berisi 'baru tiba', AINA harus menyesuaikan jawaban. Tidak over-inject." },
  { question: "Rekomendasikan rencana belajar yang cocok untuk kondisiku sekarang.", category: "memory", expected_behavior: "Jika ada memory tentang fakultas/jurusan, gunakan. Jika tidak ada, tanya atau beri jawaban umum." },
];

/* GET /api/admin/eval/benchmarks — list benchmark questions */
app.get("/api/admin/eval/benchmarks", strictLimiter, async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const category = req.query.category;
  let q = supabase.from("eval_benchmarks").select("*").eq("active", true).order("category").order("created_at");
  if (category && EVAL_CATEGORIES.includes(category)) q = q.eq("category", category);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ benchmarks: data ?? [], total: data?.length ?? 0 });
});

/* POST /api/admin/eval/benchmarks — add benchmark question */
app.post("/api/admin/eval/benchmarks", strictLimiter, async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const { question, category, expected_behavior, is_edge_case = false, edge_note } = req.body;
  if (!question?.trim() || !category) return res.status(400).json({ error: "question and category required" });
  if (!EVAL_CATEGORIES.includes(category)) return res.status(400).json({ error: `category must be one of: ${EVAL_CATEGORIES.join(", ")}` });
  const supabase = getAdminClient();
  const { data, error } = await supabase.from("eval_benchmarks").insert({ question: question.trim(), category, expected_behavior, is_edge_case, edge_note }).select().single();
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ benchmark: data });
});

/* POST /api/admin/eval/benchmarks/seed — insert default benchmark set (idempotent) */
app.post("/api/admin/eval/benchmarks/seed", strictLimiter, async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const { count } = await supabase.from("eval_benchmarks").select("*", { count: "exact", head: true });
  if ((count ?? 0) > 0) return res.json({ message: `Already seeded (${count} benchmarks exist). Delete all first to re-seed.`, seeded: 0 });
  const { data, error } = await supabase.from("eval_benchmarks").insert(DEFAULT_BENCHMARKS).select();
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ message: `Seeded ${data.length} benchmark questions`, seeded: data.length });
});

/* POST /api/admin/eval/results — submit a manually scored result */
app.post("/api/admin/eval/results", strictLimiter, async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const {
    benchmark_id, run_id, question, category, answer,
    score_accuracy, score_relevance, score_structure, score_human_feel, score_trustworthiness,
    notes, version_tag, eval_mode = "manual",
  } = req.body;
  if (!question?.trim() || !answer?.trim() || !version_tag?.trim() || !category) {
    return res.status(400).json({ error: "question, answer, category, version_tag required" });
  }
  const scores = [score_accuracy, score_relevance, score_structure, score_human_feel, score_trustworthiness];
  const validScores = scores.filter(s => s != null);
  const total_score = validScores.length === 5
    ? parseFloat(((scores.reduce((a, b) => a + b, 0) / 25) * 100).toFixed(2))
    : null;
  const supabase = getAdminClient();
  const { data, error } = await supabase.from("eval_results").insert({
    benchmark_id: benchmark_id || null,
    run_id: run_id || undefined,
    question: question.trim(), category, answer: answer.trim(),
    score_accuracy, score_relevance, score_structure, score_human_feel, score_trustworthiness,
    total_score, notes, version_tag: version_tag.trim(), eval_mode,
  }).select().single();
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ result: data, total_score });
});

/* GET /api/admin/eval/runs — list all evaluation runs grouped by run_id + version_tag */
app.get("/api/admin/eval/runs", strictLimiter, async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("eval_results")
    .select("run_id, version_tag, category, total_score, created_at")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  // Group by run_id
  const runs = {};
  for (const row of (data ?? [])) {
    if (!runs[row.run_id]) {
      runs[row.run_id] = { run_id: row.run_id, version_tag: row.version_tag, created_at: row.created_at, count: 0, avg_total: 0, scores: [] };
    }
    runs[row.run_id].count++;
    if (row.total_score != null) runs[row.run_id].scores.push(Number(row.total_score));
  }
  for (const run of Object.values(runs)) {
    run.avg_total = run.scores.length ? parseFloat((run.scores.reduce((a, b) => a + b, 0) / run.scores.length).toFixed(2)) : null;
    delete run.scores;
  }
  res.json({ runs: Object.values(runs).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) });
});

/* GET /api/admin/eval/runs/:runId — full results for a specific run */
app.get("/api/admin/eval/runs/:runId", strictLimiter, async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("eval_results")
    .select("*")
    .eq("run_id", req.params.runId)
    .order("created_at");
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ results: data ?? [], count: data?.length ?? 0 });
});

/* GET /api/admin/eval/compare?v1=phase-6&v2=phase-7 — regression diff */
app.get("/api/admin/eval/compare", strictLimiter, async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const { v1, v2 } = req.query;
  if (!v1 || !v2) return res.status(400).json({ error: "v1 and v2 query params required" });
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("eval_results")
    .select("version_tag, category, total_score")
    .in("version_tag", [v1, v2]);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  const aggregate = (version) => {
    const rows = (data ?? []).filter(r => r.version_tag === version && r.total_score != null);
    const overall = rows.length ? parseFloat((rows.reduce((s, r) => s + Number(r.total_score), 0) / rows.length).toFixed(2)) : null;
    const byCat = {};
    for (const cat of EVAL_CATEGORIES) {
      const catRows = rows.filter(r => r.category === cat);
      byCat[cat] = catRows.length ? parseFloat((catRows.reduce((s, r) => s + Number(r.total_score), 0) / catRows.length).toFixed(2)) : null;
    }
    return { version, count: rows.length, avg_total: overall, by_category: byCat };
  };
  const agg1 = aggregate(v1);
  const agg2 = aggregate(v2);
  const delta = (agg1.avg_total != null && agg2.avg_total != null) ? parseFloat((agg2.avg_total - agg1.avg_total).toFixed(2)) : null;
  const regressions = [], improvements = [];
  for (const cat of EVAL_CATEGORIES) {
    const d1 = agg1.by_category[cat], d2 = agg2.by_category[cat];
    if (d1 != null && d2 != null) {
      const diff = parseFloat((d2 - d1).toFixed(2));
      if (diff <= -5)  regressions.push({ category: cat, v1: d1, v2: d2, delta: diff });
      if (diff >= 5)   improvements.push({ category: cat, v1: d1, v2: d2, delta: diff });
    }
  }
  res.json({ v1: agg1, v2: agg2, delta, regressions, improvements, threshold: 5 });
});

/* GET /api/admin/eval/summary — aggregate scores by version_tag */
app.get("/api/admin/eval/summary", strictLimiter, async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const { data, error } = await supabase.from("eval_results").select("version_tag, category, total_score, created_at").order("created_at");
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  const versions = {};
  for (const row of (data ?? [])) {
    if (!versions[row.version_tag]) versions[row.version_tag] = { version_tag: row.version_tag, count: 0, scores: [], by_category: {} };
    const v = versions[row.version_tag];
    v.count++;
    if (row.total_score != null) { v.scores.push(Number(row.total_score)); }
    if (!v.by_category[row.category]) v.by_category[row.category] = [];
    if (row.total_score != null) v.by_category[row.category].push(Number(row.total_score));
  }
  const result = Object.values(versions).map(v => {
    const avg = v.scores.length ? parseFloat((v.scores.reduce((a, b) => a + b, 0) / v.scores.length).toFixed(2)) : null;
    const byCat = {};
    for (const [cat, scores] of Object.entries(v.by_category)) {
      byCat[cat] = scores.length ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : null;
    }
    return { version_tag: v.version_tag, count: v.count, avg_total: avg, by_category: byCat };
  });
  res.json({ summary: result });
});

/* GET /api/admin/eval/edge-cases — list edge cases */
app.get("/api/admin/eval/edge-cases", strictLimiter, async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const resolved = req.query.resolved === "true" ? true : req.query.resolved === "false" ? false : undefined;
  let q = supabase.from("eval_edge_cases").select("*").order("created_at", { ascending: false });
  if (resolved !== undefined) q = q.eq("resolved", resolved);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ edge_cases: data ?? [], count: data?.length ?? 0 });
});

/* POST /api/admin/eval/edge-cases — log a new edge case */
app.post("/api/admin/eval/edge-cases", strictLimiter, async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const { question, risk_type, description, example_bad_answer } = req.body;
  if (!question?.trim() || !risk_type) return res.status(400).json({ error: "question and risk_type required" });
  if (!EVAL_RISK_TYPES.includes(risk_type)) return res.status(400).json({ error: `risk_type must be one of: ${EVAL_RISK_TYPES.join(", ")}` });
  const supabase = getAdminClient();
  const { data, error } = await supabase.from("eval_edge_cases").insert({ question: question.trim(), risk_type, description, example_bad_answer }).select().single();
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ edge_case: data });
});

/* PATCH /api/admin/eval/edge-cases/:id — mark edge case resolved */
app.patch("/api/admin/eval/edge-cases/:id", strictLimiter, async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const { data, error } = await supabase.from("eval_edge_cases").update({ resolved: true }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ edge_case: data });
});

/* ── Phase 12: Chat message rating (anonymized feedback signal) ── */
// No user_id stored. message_hash is SHA-256(intent+confidence+timestamp) — not reversible.
// Privacy: rating, intent, and confidence are system-level signals, never personal data.
app.post("/api/chat/rate", writeLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const { rating, intent, confidence, messageTs, query_text, source_used } = req.body;
  if (![1, -1].includes(rating)) return res.status(400).json({ error: "rating must be 1 or -1" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server config error" });

  // Verify auth (required to prevent spam), but do NOT store user_id
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return res.status(401).json({ error: "Token tidak valid" });

  // Build a one-way hash from non-identifying signals — not linked to user
  const msgHash = hashText(`${intent ?? ""}__${confidence ?? ""}__${messageTs ?? Date.now()}`);

  const { error } = await supabase.from("intel_message_ratings").insert({
    message_hash: msgHash,
    rating,
    intent:     intent     ?? null,
    confidence: confidence ?? null,
  });

  if (error) {
    console.warn("[Intel/Rating] insert error:", error.message);
    return res.status(500).json({ error: "Gagal menyimpan rating" });
  }

  // Self-improvement: on negative rating, also log to query_log for bad-response analysis
  if (rating === -1 && query_text?.trim()) {
    logQuery({
      queryText:  query_text,
      intentType: intent  ?? null,
      sourceUsed: source_used ?? null,
      confidence: confidence ?? null,
      userId:     user.id,
      hasKbResult: false,
      isTransport: false,
      rating:     -1,
    }).catch(() => {});

    // A6: Feedback loop — negative feedback triggers KB gap detection
    // This ensures poorly-answered queries surface in admin's missing-topics dashboard
    logMissingTopic(query_text.trim(), intent ?? null);
    console.log(`[A6/FeedbackLoop] 👎 negative rating → "${query_text.trim().slice(0, 60)}" logged to missing_topics for KB improvement`);
  }

  console.log(`[Intel/Rating] rating=${rating > 0 ? "+1" : "-1"} intent=${intent} conf=${confidence}`);
  res.json({ success: true });
});

/* ── Phase 12: Admin intel endpoints (master-admin only) ── */
// Returns top recurring query topic clusters
app.get("/api/admin/intel/query-patterns", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const { data, error } = await supabase
    .from("intel_query_patterns")
    .select("id, topic_cluster, sample_query, frequency, last_seen_at")
    .order("frequency", { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json(data ?? []);
});

// Returns per-turn retrieval effectiveness breakdown
app.get("/api/admin/intel/retrieval-stats", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("intel_retrieval_stats")
    .select("intent, kb_strength, had_kb, had_pinned, had_wiki, had_ddg, had_perplexity, confidence_level, external_tier, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  // Aggregate: count combinations
  const agg = {};
  for (const row of data ?? []) {
    const key = `${row.intent}__${row.kb_strength}__${row.confidence_level}`;
    if (!agg[key]) agg[key] = { intent: row.intent, kb_strength: row.kb_strength, confidence_level: row.confidence_level, had_kb: 0, had_wiki: 0, had_ddg: 0, had_pinned: 0, had_perplexity: 0, total: 0 };
    agg[key].total++;
    if (row.had_kb)          agg[key].had_kb++;
    if (row.had_wiki)        agg[key].had_wiki++;
    if (row.had_ddg)         agg[key].had_ddg++;
    if (row.had_pinned)      agg[key].had_pinned++;
    if (row.had_perplexity)  agg[key].had_perplexity++;
  }
  res.json(Object.values(agg).sort((a, b) => b.total - a.total));
});

// Returns positive/negative rating breakdown by intent and confidence
app.get("/api/admin/intel/ratings", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("intel_message_ratings")
    .select("rating, intent, confidence, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  const agg = {};
  for (const row of data ?? []) {
    const key = `${row.intent ?? "unknown"}__${row.confidence ?? "unknown"}`;
    if (!agg[key]) agg[key] = { intent: row.intent, confidence: row.confidence, positive: 0, negative: 0, total: 0 };
    agg[key].total++;
    if (row.rating === 1) agg[key].positive++; else agg[key].negative++;
  }
  for (const k of Object.keys(agg)) agg[k].satisfaction_rate = agg[k].total > 0 ? +(agg[k].positive / agg[k].total * 100).toFixed(1) : null;
  res.json(Object.values(agg).sort((a, b) => b.total - a.total));
});

// Returns recurring edge-case patterns sorted by frequency
app.get("/api/admin/intel/edge-cases", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("intel_edge_cases")
    .select("id, pattern_type, topic_hint, frequency, last_seen_at, created_at")
    .order("frequency", { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json(data ?? []);
});

// Consolidated intelligence summary for the admin dashboard
app.get("/api/admin/intel/summary", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const supabase = getAdminClient();
  const [
    { data: topFAQs },
    { data: topEdge },
    { data: ratingsRaw },
    { data: retrievalRaw },
  ] = await Promise.all([
    supabase.from("intel_query_patterns").select("topic_cluster, sample_query, frequency").order("frequency", { ascending: false }).limit(5),
    supabase.from("intel_edge_cases").select("pattern_type, topic_hint, frequency").order("frequency", { ascending: false }).limit(5),
    supabase.from("intel_message_ratings").select("rating, intent"),
    supabase.from("intel_retrieval_stats").select("had_kb, had_wiki, had_ddg, had_pinned, had_perplexity, confidence_level").limit(500),
  ]);

  // Overall satisfaction rate
  const totalRatings = (ratingsRaw ?? []).length;
  const positiveRatings = (ratingsRaw ?? []).filter(r => r.rating === 1).length;
  const satisfactionRate = totalRatings > 0 ? +(positiveRatings / totalRatings * 100).toFixed(1) : null;

  // Source usage breakdown
  const rt = retrievalRaw ?? [];
  const sourceBreakdown = {
    kb_usage_pct:         rt.length > 0 ? +(rt.filter(r => r.had_kb).length         / rt.length * 100).toFixed(1) : null,
    pinned_usage_pct:     rt.length > 0 ? +(rt.filter(r => r.had_pinned).length     / rt.length * 100).toFixed(1) : null,
    perplexity_usage_pct: rt.length > 0 ? +(rt.filter(r => r.had_perplexity).length / rt.length * 100).toFixed(1) : null,
    wiki_usage_pct:       rt.length > 0 ? +(rt.filter(r => r.had_wiki).length       / rt.length * 100).toFixed(1) : null,
    ddg_usage_pct:        rt.length > 0 ? +(rt.filter(r => r.had_ddg).length        / rt.length * 100).toFixed(1) : null,
    total_turns:          rt.length,
  };
  const needsVerif = rt.filter(r => r.confidence_level === "needs_verification").length;
  const verifRate = rt.length > 0 ? +(needsVerif / rt.length * 100).toFixed(1) : null;

  res.json({
    top_faqs:          topFAQs ?? [],
    top_edge_cases:    topEdge ?? [],
    overall_satisfaction_rate: satisfactionRate,
    total_ratings:     totalRatings,
    source_breakdown:  sourceBreakdown,
    needs_verification_rate: verifRate,
  });
});

// Returns the active model routing config — reflects exactly what server.js does
app.get("/api/admin/intel/model-config", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  res.json({
    tiers: {
      lightweight: {
        label: "Tier A — Ringan",
        description: "Pertanyaan kasual, KB kuat + intent sederhana",
        primary:   "google/gemini-2.0-flash-001",
        fallback:  "google/gemini-2.0-flash-001",
        emergency: "meta-llama/llama-3.3-70b-instruct:free",
        routes_for: ["casual", "KB kuat + factual/procedural/confused"],
      },
      standard: {
        label: "Tier B — Standar",
        description: "Pertanyaan kompleks, time-sensitive, fiqh, Arabic, atau KB lemah/tidak ada",
        primary:   "google/gemini-2.0-flash-001",
        fallback:  "google/gemini-2.0-flash-001",
        emergency: "meta-llama/llama-3.3-70b-instruct:free",
        routes_for: ["procedural", "fiqh", "arabic_writing", "dynamic", "time-sensitive", "currency", "KB lemah/tidak ada"],
      },
    },
    vision_model: "google/gemini-2.0-flash-001",
    source_pipeline: [
      { name: "Admin Pinned Updates",  trust: 100, always_checked: true },
      { name: "Knowledge Base (KB)",   trust: 90,  always_checked: true },
      { name: "Exchange Rate API",     trust: 85,  condition: "query kurs/currency" },
      { name: "Dorar.net (Hadith)",    trust: 82,  condition: "intent = fiqh" },
      { name: "Gemini Web Context",    trust: 78,  condition: "OPENROUTER_API_KEY dikonfigurasi", active: !!process.env.OPENROUTER_API_KEY },
      { name: "Google Maps Places",    trust: 95,  condition: "query tentang tempat/lokasi, GOOGLE_MAPS_API_KEY dikonfigurasi", active: !!process.env.GOOGLE_MAPS_API_KEY },
      { name: "Wikipedia",             trust: 60,  condition: "fallback jika Gemini context gagal", active: true },
      { name: "DuckDuckGo",            trust: 35,  condition: "fallback jika Gemini context gagal", active: true },
      { name: "Model Knowledge",       trust: 20,  condition: "tidak ada sumber eksternal yang berhasil" },
    ],
    perplexity_configured: !!process.env.PERPLEXITY_API_KEY,
    google_maps_configured: !!process.env.GOOGLE_MAPS_API_KEY,
  });
});

/* ── Startup: check required tables exist ────────────── */
async function checkRequiredTables() {
  const supabase = getAdminClient();
  if (!supabase) return;

  const tables = [
    "profiles", "user_roles", "chats", "messages",
    "knowledge_base", "contributor_requests", "tasks",
    "threads", "thread_replies",
    "pinned_updates", "message_reports",
    "notifications", "user_badges",
    "beta_feedback", "user_memories",
    "eval_benchmarks", "eval_results", "eval_edge_cases",
    "system_announcements", "user_announcement_views",
    "masisir_news",
    "daily_focus_items", "admin_tracker_items", "reminder_logs",
    "library_items",
    "flashcard_sets",
    "system_settings",
  ];

  const missing = [];
  for (const table of tables) {
    const { error } = await supabase.from(table).select("*").limit(0);
    // PGRST116 = 0 rows (fine); 42P01 = table doesn't exist
    if (error && (error.code === "42P01" || error.message?.includes("does not exist"))) {
      missing.push(table);
    }
  }

  if (missing.length > 0) {
    console.warn(`[MIGRATIONS] ⚠️  Missing tables: ${missing.join(", ")}`);
    console.warn("[MIGRATIONS] Run the SQL from GET /api/admin/migration-sql in your Supabase SQL editor.");
  } else {
    console.log("[MIGRATIONS] ✓ All required tables exist");
  }
}

async function runColumnMigrations() {
  const supabase = getAdminClient();
  if (!supabase) return;

  // First, try to create the exec_sql helper function if it doesn't exist yet.
  // This is a no-op if it already exists.
  try {
    await supabase.rpc("exec_sql", {
      sql: "CREATE OR REPLACE FUNCTION public.exec_sql(sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN EXECUTE sql; END; $$;"
    });
  } catch {
    // exec_sql doesn't exist yet — admin must run the migration SQL in Supabase SQL editor once to bootstrap it.
  }

  const migrations = [
    "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hidden_from_leaderboard BOOLEAN NOT NULL DEFAULT FALSE;",
    "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;",
    "ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS image_url TEXT;",
    "ALTER TABLE public.thread_replies ADD COLUMN IF NOT EXISTS image_url TEXT;",
    "ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;",
    "ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS keywords TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS contact_number TEXT;",
    "ALTER TABLE public.user_memories ADD COLUMN IF NOT EXISTS memory_type TEXT NOT NULL DEFAULT 'context_memory';",
    "ALTER TABLE public.user_memories ADD COLUMN IF NOT EXISTS is_long_term BOOLEAN NOT NULL DEFAULT false;",
    "ALTER TABLE public.intel_retrieval_stats ADD COLUMN IF NOT EXISTS had_perplexity BOOLEAN NOT NULL DEFAULT false;",
    "ALTER TABLE public.intel_retrieval_stats ADD COLUMN IF NOT EXISTS external_tier TEXT;",
    "ALTER TABLE public.message_reports ADD COLUMN IF NOT EXISTS user_question TEXT;",
    "ALTER TABLE public.message_reports ADD COLUMN IF NOT EXISTS additional_note TEXT;",
    // Contributor requests new fields
    "ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS reason TEXT;",
    "ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS article_content TEXT;",
    "ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS article_file_url TEXT;",
    "ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS portfolio_link TEXT;",
    "ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS review_notes TEXT;",
    "ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS reviewed_by UUID;",
    "ALTER TABLE public.contributor_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;",
    "ALTER TABLE public.system_announcements ADD COLUMN IF NOT EXISTS image_url TEXT;",
    "ALTER TABLE public.system_announcements ADD COLUMN IF NOT EXISTS show_once_per_user BOOLEAN NOT NULL DEFAULT false;",
    "ALTER TABLE public.system_announcements ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'on_dashboard_open';",
    "ALTER TABLE public.system_announcements ADD COLUMN IF NOT EXISTS delay_seconds INTEGER NOT NULL DEFAULT 5;",
    "ALTER TABLE public.system_announcements ADD COLUMN IF NOT EXISTS selected_user_ids TEXT[];",
    // Custom instructions / personalization (ChatGPT-style)
    "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_about TEXT;",
    "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_instructions TEXT;",
    // Enable realtime on chats so admin deletions appear instantly for users
    "ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.chats;",
    // Announcement tables (CREATE via migration SQL if not exists)
    `CREATE TABLE IF NOT EXISTS public.system_announcements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'announcement' CHECK (type IN ('welcome','announcement')),
      target_audience TEXT NOT NULL DEFAULT 'all_users' CHECK (target_audience IN ('new_users','old_users','all_users')),
      is_active BOOLEAN NOT NULL DEFAULT true,
      button_text TEXT,
      button_link TEXT,
      dismissible BOOLEAN NOT NULL DEFAULT true,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      created_by UUID REFERENCES auth.users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS public.user_announcement_views (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      announcement_id UUID REFERENCES public.system_announcements(id) ON DELETE CASCADE NOT NULL,
      seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      dismissed_at TIMESTAMPTZ,
      UNIQUE(user_id, announcement_id)
    );`,
    // Answer-level feedback (helpful / not_accurate / outdated / saved)
    `CREATE TABLE IF NOT EXISTS public.answer_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      message_id TEXT NOT NULL,
      feedback_type TEXT NOT NULL CHECK (feedback_type IN ('helpful','not_accurate','outdated','saved')),
      note TEXT,
      intent TEXT,
      confidence TEXT,
      sources JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
    // Saved answers / bookmarks
    `CREATE TABLE IF NOT EXISTS public.saved_answers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      message_id TEXT NOT NULL,
      content TEXT NOT NULL,
      sources JSONB,
      source_summary TEXT,
      intent TEXT,
      promoted_to_kb BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user_id, message_id)
    );`,
    `ALTER TABLE public.saved_answers ADD COLUMN IF NOT EXISTS promoted_to_kb BOOLEAN NOT NULL DEFAULT false;`,
    // Masisir news table
    `CREATE TABLE IF NOT EXISTS public.masisir_news (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'kehidupan_mesir' CHECK (category IN ('breaking_news','administrasi','kuliner','kehidupan_mesir','transportasi','aigypt')),
      image_url TEXT,
      source_url TEXT,
      source_name TEXT,
      author_id UUID REFERENCES auth.users(id),
      is_active BOOLEAN NOT NULL DEFAULT true,
      is_pinned BOOLEAN NOT NULL DEFAULT false,
      published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
    // ── AI Performance intel tables ──────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS public.intel_retrieval_stats (
      id BIGSERIAL PRIMARY KEY,
      intent TEXT,
      kb_strength TEXT,
      had_kb BOOLEAN NOT NULL DEFAULT false,
      had_wiki BOOLEAN NOT NULL DEFAULT false,
      had_ddg BOOLEAN NOT NULL DEFAULT false,
      had_pinned BOOLEAN NOT NULL DEFAULT false,
      had_perplexity BOOLEAN NOT NULL DEFAULT false,
      confidence_level TEXT,
      external_tier TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS public.intel_query_patterns (
      id BIGSERIAL PRIMARY KEY,
      topic_cluster TEXT NOT NULL,
      sample_query TEXT,
      frequency INTEGER NOT NULL DEFAULT 1,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS public.intel_edge_cases (
      id BIGSERIAL PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      topic_hint TEXT,
      frequency INTEGER NOT NULL DEFAULT 1,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS public.intel_message_ratings (
      id BIGSERIAL PRIMARY KEY,
      rating INTEGER NOT NULL,
      intent TEXT,
      confidence TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
    // Fix: "Bahasa" category was added after the initial schema.
    // Step 1: drop old constraints (which don't include "Bahasa" or "Bahasa Arab")
    "ALTER TABLE public.knowledge_base DROP CONSTRAINT IF EXISTS knowledge_base_category_check;",
    "ALTER TABLE public.threads DROP CONSTRAINT IF EXISTS threads_category_check;",
    // Step 2: migrate any existing "Bahasa Arab" rows (old label) to the new "Bahasa" label
    "UPDATE public.knowledge_base SET category = 'Bahasa' WHERE category = 'Bahasa Arab';",
    "UPDATE public.threads SET category = 'Bahasa' WHERE category = 'Bahasa Arab';",
    // Step 3: add updated constraints that include "Bahasa"
    "ALTER TABLE public.knowledge_base ADD CONSTRAINT knowledge_base_category_check CHECK (category IN ('Administrasi', 'Akademik', 'Kehidupan Mesir', 'Transport', 'Tempat Tinggal', 'Kuliner', 'Bahasa'));",
    "ALTER TABLE public.threads ADD CONSTRAINT threads_category_check CHECK (category IN ('Administrasi', 'Akademik', 'Kehidupan Mesir', 'Transport', 'Tempat Tinggal', 'Kuliner', 'Bahasa'));",
    // Library items table — PDF/doc library with Google Drive links
    `CREATE TABLE IF NOT EXISTS public.library_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'umum' CHECK (category IN ('muqorror', 'panduan', 'referensi', 'umum')),
      faculty TEXT,
      year_level TEXT,
      drive_url TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'pdf',
      tags TEXT,
      is_published BOOLEAN NOT NULL DEFAULT true,
      created_by UUID REFERENCES auth.users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_library_items_cat ON public.library_items(category, is_published);`,
    // ── RAG (Retrieval-Augmented Generation) — pgvector semantic search ───────
    // Step 1: enable pgvector extension (pre-installed on all Supabase projects)
    `CREATE EXTENSION IF NOT EXISTS vector;`,
    // Step 2: add embedding column to knowledge_base (text-embedding-3-large = 1536 dims)
    `ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS embedding vector(1536);`,
    `ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS embedding_model varchar(80);`,
    `ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS summary TEXT;`,
    `ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS content_ar TEXT;`,
    // Step 3: IVFFlat index for fast cosine similarity search
    `CREATE INDEX IF NOT EXISTS idx_kb_embedding ON public.knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);`,
    // Step 4: match_knowledge_base RPC — returns articles sorted by semantic similarity
    `CREATE OR REPLACE FUNCTION match_knowledge_base(
      query_embedding vector(1536),
      match_threshold float DEFAULT 0.40,
      match_count int DEFAULT 5
    )
    RETURNS TABLE (
      title text,
      content text,
      category text,
      hidden boolean,
      article_type text,
      keywords text,
      maps_url text,
      summary text,
      important_notes text,
      similarity float
    )
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      RETURN QUERY
      SELECT
        kb.title,
        kb.content,
        kb.category,
        kb.hidden,
        kb.article_type,
        kb.keywords,
        kb.maps_url,
        kb.summary,
        kb.important_notes,
        1 - (kb.embedding <=> query_embedding) AS similarity
      FROM knowledge_base kb
      WHERE kb.status = 'approved'
        AND kb.embedding IS NOT NULL
        AND 1 - (kb.embedding <=> query_embedding) > match_threshold
      ORDER BY kb.embedding <=> query_embedding
      LIMIT match_count;
    END;
    $func$;`,
    // System settings table — for server restart flag and future config
    `CREATE TABLE IF NOT EXISTS public.system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
  ];
  let succeeded = 0;
  for (const sql of migrations) {
    try {
      await supabase.rpc("exec_sql", { sql });
      succeeded++;
    } catch {
      // RPC may not exist — admin can run migration-sql endpoint manually in Supabase SQL editor
    }
  }
  // Notify PostgREST to reload its schema cache after migrations
  if (succeeded > 0) {
    try {
      await supabase.rpc("exec_sql", { sql: "SELECT pg_notify('pgrst', 'reload schema')" });
    } catch { /* ignore */ }
  }
  if (succeeded === 0) {
    console.warn("[MIGRATIONS] ⚠️  Column migrations could not run automatically.");
    console.warn("[MIGRATIONS] → Go to Supabase SQL editor and run the SQL from: GET /api/admin/migration-sql");
  }
}

/* ══════════════════════════════════════════════════════
   PRODUCTIVITY — Daily Focus, Admin Tracker, Reminders
   (AI & reminder logic in server/services/ + server/routes/)
   ══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   TELEGRAM — Bot API channel import + MTProto userbot scraper
   ══════════════════════════════════════════════════════════ */

/* ── MTProto Userbot: login as user, auto-chat with bot ── */

// In-memory session store: adminUserId -> { client, phone, phoneCodeHash, verified, createdAt }
const ubSessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ubSessions.entries()) {
    if (now - v.createdAt > 30 * 60 * 1000) {
      v.client?.disconnect().catch(() => {});
      ubSessions.delete(k);
    }
  }
}, 5 * 60 * 1000);

/** Verify caller is an admin — returns user or throws */
async function requireAdmin(authHeader) {
  const user = await verifyAuth(authHeader);
  if (!user) throw Object.assign(new Error("Login diperlukan"), { status: 401 });
  const sb = getAdminClient();
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
  if (!roles?.some(r => r.role === "admin")) throw Object.assign(new Error("Hanya admin"), { status: 403 });
  return user;
}

/**
 * POST /api/admin/telegram/userbot/start
 * Body: { apiId, apiHash, phone }
 * Sends OTP to phone via Telegram.
 */
app.post("/api/admin/telegram/userbot/start", writeLimiter, async (req, res) => {
  try {
    const user = await requireAdmin(req.headers.authorization);
    const { apiId, apiHash, phone } = req.body;
    if (!apiId || !apiHash || !phone) return res.status(400).json({ error: "apiId, apiHash, dan nomor HP diperlukan" });

    const { TelegramClient } = await import("telegram");
    const { StringSession } = await import("telegram/sessions/StringSession.js");
    const { Api } = await import("telegram");

    // Disconnect any old session
    const old = ubSessions.get(user.id);
    if (old) { await old.client?.disconnect().catch(() => {}); ubSessions.delete(user.id); }

    const session = new StringSession("");
    const client = new TelegramClient(session, parseInt(apiId), apiHash, { connectionRetries: 3, baseLogger: null });
    await client.connect();

    const result = await client.invoke(new Api.auth.SendCode({
      phoneNumber: phone,
      apiId: parseInt(apiId),
      apiHash,
      settings: new Api.CodeSettings({}),
    }));

    ubSessions.set(user.id, { client, phone, apiId: parseInt(apiId), apiHash, phoneCodeHash: result.phoneCodeHash, verified: false, createdAt: Date.now() });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[userbot/start]", e.message);
    if (e.status) return res.status(e.status).json({ error: e.message });
    return res.status(500).json({ error: "Gagal mengirim kode: " + e.message });
  }
});

/**
 * POST /api/admin/telegram/userbot/verify
 * Body: { code, password? }
 * Verifies OTP (and 2FA password if needed).
 */
app.post("/api/admin/telegram/userbot/verify", writeLimiter, async (req, res) => {
  try {
    const user = await requireAdmin(req.headers.authorization);
    const sess = ubSessions.get(user.id);
    if (!sess) return res.status(400).json({ error: "Session tidak ada, mulai ulang login" });

    const { code, password } = req.body;
    if (!code) return res.status(400).json({ error: "Kode OTP diperlukan" });

    const { Api } = await import("telegram");

    try {
      await sess.client.invoke(new Api.auth.SignIn({
        phoneNumber: sess.phone,
        phoneCodeHash: sess.phoneCodeHash,
        phoneCode: code.toString().trim(),
      }));
    } catch (e) {
      if (e.errorMessage === "SESSION_PASSWORD_NEEDED" || e.message?.includes("SESSION_PASSWORD_NEEDED")) {
        if (!password) return res.status(200).json({ needsPassword: true });
        // Handle 2FA
        const pwd = await sess.client.invoke(new Api.account.GetPassword());
        const { computeCheck } = await import("telegram/Password.js");
        const check = await computeCheck(pwd, password);
        await sess.client.invoke(new Api.auth.CheckPassword({ password: check }));
      } else {
        throw e;
      }
    }

    sess.verified = true;
    return res.json({ ok: true });
  } catch (e) {
    console.error("[userbot/verify]", e.message);
    if (e.status) return res.status(e.status).json({ error: e.message });
    if (e.errorMessage === "PHONE_CODE_INVALID" || e.message?.includes("PHONE_CODE_INVALID")) return res.status(400).json({ error: "Kode OTP salah" });
    if (e.errorMessage === "PHONE_CODE_EXPIRED" || e.message?.includes("PHONE_CODE_EXPIRED")) return res.status(400).json({ error: "Kode OTP expired, mulai ulang" });
    return res.status(500).json({ error: "Gagal verifikasi: " + e.message });
  }
});

/**
 * POST /api/admin/telegram/userbot/scrape
 * Body: { targetBot, maxDepth? }
 * Auto-chats with bot and collects all text content via BFS of inline menus.
 */
app.post("/api/admin/telegram/userbot/scrape", writeLimiter, async (req, res) => {
  try {
    const user = await requireAdmin(req.headers.authorization);
    const sess = ubSessions.get(user.id);
    if (!sess?.verified) return res.status(400).json({ error: "Belum login, mulai ulang" });

    const { targetBot = "@PPMIMesir_bot", maxDepth = 3 } = req.body;
    const { Api } = await import("telegram");
    const client = sess.client;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // Resolve bot entity
    const botEntity = await client.getEntity(targetBot);
    const botId = botEntity.id.toString();

    const collected = [];
    const seenData = new Set();
    const queue = []; // { level, msgId, data (Buffer), label, parent }

    // Get recent messages from bot in this conversation (after a given timestamp)
    const getBotMsgs = async (since) => {
      const msgs = await client.getMessages(botEntity, { limit: 10 });
      return msgs.filter(m => !m.out && m.date >= since - 2);
    };

    // --- Step 1: /start ---
    const t0 = Math.floor(Date.now() / 1000);
    await client.sendMessage(botEntity, { message: "/start" });
    await sleep(3500);

    const startMsgs = await getBotMsgs(t0);
    for (const msg of startMsgs) {
      const text = (msg.text || msg.message || "").trim();
      if (text.length > 5) collected.push({ text, source: "/start" });
      for (const row of (msg.replyMarkup?.rows || [])) {
        for (const btn of (row.buttons || [])) {
          if (btn.data) queue.push({ level: 1, msgId: msg.id, data: btn.data, label: btn.text, parent: "/start" });
        }
      }
    }

    // --- Step 2: BFS through inline buttons ---
    while (queue.length > 0 && collected.length < 80) {
      const item = queue.shift();
      if (item.level > maxDepth) continue;

      const dataHex = item.data.toString("hex");
      if (seenData.has(dataHex)) continue;
      seenData.add(dataHex);

      await sleep(1800);
      const tClick = Math.floor(Date.now() / 1000);

      try {
        await client.invoke(new Api.messages.GetBotCallbackAnswer({
          peer: botEntity,
          msgId: item.msgId,
          data: item.data,
        }));
      } catch { /* button click errors are common, skip */ }

      await sleep(2500);
      const newMsgs = await getBotMsgs(tClick);

      for (const msg of newMsgs) {
        const text = (msg.text || msg.message || "").trim();
        if (text.length > 10) collected.push({ text, source: item.label });
        for (const row of (msg.replyMarkup?.rows || [])) {
          for (const btn of (row.buttons || [])) {
            if (btn.data) {
              const hex = btn.data.toString("hex");
              if (!seenData.has(hex)) queue.push({ level: item.level + 1, msgId: msg.id, data: btn.data, label: btn.text, parent: item.label });
            }
          }
        }
      }
    }

    // Deduplicate by text
    const unique = [];
    const seenText = new Set();
    for (const c of collected) {
      const key = c.text.slice(0, 80);
      if (!seenText.has(key)) { seenText.add(key); unique.push(c); }
    }

    console.log(`[userbot/scrape] ${unique.length} unique messages collected from ${targetBot}`);
    return res.json({ messages: unique });
  } catch (e) {
    console.error("[userbot/scrape]", e.message);
    if (e.status) return res.status(e.status).json({ error: e.message });
    return res.status(500).json({ error: "Gagal scraping: " + e.message });
  }
});

/**
 * POST /api/admin/telegram/userbot/disconnect
 * Cleans up the MTProto session.
 */
app.post("/api/admin/telegram/userbot/disconnect", async (req, res) => {
  try {
    const user = await requireAdmin(req.headers.authorization);
    const sess = ubSessions.get(user.id);
    if (sess) { await sess.client?.disconnect().catch(() => {}); ubSessions.delete(user.id); }
    return res.json({ ok: true });
  } catch { return res.json({ ok: true }); }
});

// ── Productivity CRUD routes (moved to server/routes/productivity.js) ──────
app.use("/api/productivity", createProductivityRouter({ verifyAuth, getAdminClient }));

// ── AI Focus + Reminder routes (moved to server/routes/productivityAI.js) ────
app.use("/api/productivity", createProductivityAIRouter({ verifyAuth, getAdminClient, sendEmail, emailTemplate, getUserEmail }));

/* ── Vercel Cron endpoints ────────────────────────────
   Called by Vercel scheduler (vercel.json "crons").
   Protected by CRON_SECRET header — set it in Vercel env vars.
   ─────────────────────────────────────────────────── */
function verifyCron(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers["x-cron-secret"] !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/* ── AI Flashcard Generator ────────────────────────────────────
   POST /api/flashcards/generate
   Body: { topic?: string, content?: string, count?: number, bilingual?: boolean }
   Returns: { flashcards: [{ question, answer }] | [{ question_ar, question_id, answer_ar, answer_id }] }
──────────────────────────────────────────────────────────── */
app.post("/api/flashcards/generate", chatLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });

  const { topic, content, count = 8, bilingual = false } = req.body;
  if (!topic && !content) return res.status(400).json({ error: "topic atau content harus diisi" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "OPENAI_API_KEY belum dikonfigurasi" });

  const safeCount = Math.max(3, Math.min(20, Number(count) || 8));

  const userPrompt = content
    ? `Buat tepat ${safeCount} flashcard dari teks berikut:\n\n${content.slice(0, 8000)}`
    : `Buat tepat ${safeCount} flashcard tentang topik: "${topic}"`;

  let systemPrompt, formatInstruction;
  if (bilingual) {
    systemPrompt = `Kamu adalah asisten belajar untuk mahasiswa Indonesia di Mesir (Masisir) yang belajar di Al-Azhar.
Tugasmu membuat flashcard belajar bilingual (Arab–Indonesia) berkualitas tinggi dalam format JSON.
Setiap flashcard memiliki 4 field:
- question_ar : pertanyaan dalam bahasa Arab (kalimat lengkap, fasih)
- question_id : terjemahan Indonesia dari pertanyaan
- answer_ar   : jawaban singkat-padat dalam bahasa Arab (maks 2-3 kalimat)
- answer_id   : terjemahan Indonesia dari jawaban
Gunakan bahasa Arab fusha (فصحى) yang sesuai konteks akademik Al-Azhar. Jawaban harus singkat, padat, dan akurat.`;
    formatInstruction = `\n\nKembalikan HANYA JSON dengan format:\n{"flashcards":[{"question_ar":"...","question_id":"...","answer_ar":"...","answer_id":"..."}]}`;
  } else {
    systemPrompt = `Kamu adalah asisten belajar untuk mahasiswa Indonesia di Mesir (Masisir).
Tugasmu membuat flashcard belajar berkualitas tinggi dalam format JSON.
Setiap flashcard berisi pertanyaan (question) dan jawaban singkat-padat (answer).
Jawaban maksimal 2-3 kalimat atau daftar poin singkat. Bahasa Indonesia.`;
    formatInstruction = `\n\nKembalikan HANYA JSON dengan format:\n{"flashcards":[{"question":"...","answer":"..."}]}`;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt + formatInstruction },
        ],
        max_tokens: bilingual ? 3000 : 2000,
        temperature: 0.4,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[Flashcard] OpenAI error:", err.slice(0, 200));
      return res.status(502).json({ error: "Gagal menghubungi AI. Coba lagi." });
    }

    const data = await response.json();
    const raw  = data.choices?.[0]?.message?.content || "{}";
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return res.status(502).json({ error: "Format flashcard tidak valid dari AI." }); }

    // Accept { flashcards: [...] } or { cards: [...] } or a bare array
    const cards = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed.flashcards) ? parsed.flashcards
      : Array.isArray(parsed.cards) ? parsed.cards
      : [];

    if (!cards.length) return res.status(502).json({ error: "AI tidak menghasilkan flashcard. Coba topik yang lebih spesifik." });

    let flashcards;
    if (bilingual) {
      flashcards = cards
        .filter(c => c.question_ar && c.question_id && c.answer_ar && c.answer_id)
        .map(c => ({
          question_ar: String(c.question_ar).trim(),
          question_id: String(c.question_id).trim(),
          answer_ar:   String(c.answer_ar).trim(),
          answer_id:   String(c.answer_id).trim(),
        }));
    } else {
      flashcards = cards
        .filter(c => c.question && c.answer)
        .map(c => ({ question: String(c.question).trim(), answer: String(c.answer).trim() }));
    }

    if (!flashcards.length) return res.status(502).json({ error: "AI tidak menghasilkan flashcard. Coba topik yang lebih spesifik." });

    console.log(`[Flashcard] user=${user.id} bilingual=${bilingual} topic="${topic || "(content)"}" cards=${flashcards.length}`);
    res.json({ flashcards });
  } catch (err) {
    console.error("[Flashcard] error:", err.message);
    res.status(500).json({ error: "Gagal membuat flashcard: " + err.message });
  }
});

/* ── Flashcard Sets CRUD ────────────────────────────────────── */
// GET /api/flashcards/sets — list saved sets for current user (last 30)
app.get("/api/flashcards/sets", async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });
  try {
    const { data, error } = await supabase
      .from("flashcard_sets")
      .select("id, name, source, bilingual, cards, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    res.json({ sets: data || [] });
  } catch (err) {
    console.error("[FlashcardSets/GET]", err.message);
    res.status(500).json({ error: "Gagal memuat set flashcard" });
  }
});

// POST /api/flashcards/sets — save a new flashcard set
app.post("/api/flashcards/sets", async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });
  const { name, source, bilingual, cards } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Nama set diperlukan" });
  if (!Array.isArray(cards) || cards.length === 0) return res.status(400).json({ error: "Kartu diperlukan" });
  try {
    const { data, error } = await supabase
      .from("flashcard_sets")
      .insert({ user_id: user.id, name: name.trim(), source: source || null, bilingual: !!bilingual, cards })
      .select("id, name, source, bilingual, cards, created_at")
      .single();
    if (error) throw error;
    res.json({ set: data });
  } catch (err) {
    console.error("[FlashcardSets/POST]", err.message);
    res.status(500).json({ error: "Gagal menyimpan set flashcard" });
  }
});

// DELETE /api/flashcards/sets/:id — delete a set (owner only)
app.delete("/api/flashcards/sets/:id", async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from("flashcard_sets")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[FlashcardSets/DELETE]", err.message);
    res.status(500).json({ error: "Gagal menghapus set" });
  }
});

// GET /api/cron/daily — runs every day at 17:00 UTC (00:00 WIB)
app.get("/api/cron/daily", async (req, res) => {
  if (!verifyCron(req, res)) return;
  try {
    const deps = { getAdminClient, sendEmail, emailTemplate, getUserEmail };
    const [dailyResult, expiryResult] = await Promise.all([
      runDailyReminder(deps),
      runExpiryAlerts(deps),
    ]);
    res.json({ ok: true, daily: dailyResult, expiry: expiryResult });
  } catch (e) {
    console.error("[Cron/daily]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cron/weekly — runs every Sunday at 18:00 UTC (01:00 WIB Senin)
app.get("/api/cron/weekly", async (req, res) => {
  if (!verifyCron(req, res)) return;
  try {
    const result = await runWeeklyRecap({ getAdminClient, sendEmail, emailTemplate, getUserEmail });

    // Self-improvement: log weekly insight snapshot to console for monitoring
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const { Client } = await import("pg");
      const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      try {
        await client.connect();
        const stats = await client.query(`
          SELECT
            COUNT(*)::int                                     AS total_queries,
            COUNT(*) FILTER (WHERE rating = -1)::int          AS bad_responses,
            COUNT(*) FILTER (WHERE has_kb_result = true)::int AS kb_hits
          FROM query_log
          WHERE created_at >= now() - INTERVAL '7 days'
        `);
        const { total_queries, bad_responses, kb_hits } = stats.rows[0] ?? {};
        const kbRate = total_queries > 0 ? Math.round((kb_hits / total_queries) * 100) : 0;
        const badRate = total_queries > 0 ? Math.round((bad_responses / total_queries) * 100) : 0;
        console.log(`[Cron/weekly] Insight snapshot — queries:${total_queries} bad:${bad_responses}(${badRate}%) kb_rate:${kbRate}%`);
      } catch (e) {
        console.warn("[Cron/weekly] insight snapshot failed:", e.message);
      } finally {
        await client.end().catch(() => {});
      }
    }

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("[Cron/weekly]", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ── Global error handler (must be last middleware) ─── */
// Catches any unhandled errors — never exposes stack traces or tech info.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[UNHANDLED]", req.method, req.path, err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Terjadi kesalahan, silakan coba lagi." });
});

/* ── Partner KB Article Seed (idempotent) ─────────────────
 * Inserts Temantiket partner articles into knowledge_base
 * once. Uses MASTER_ADMIN_IDS[0] as author. Safe to re-run.
 * ───────────────────────────────────────────────────────── */
async function seedPartnerArticles() {
  const supabase = getAdminClient();
  if (!supabase) return;

  const MASTER_ADMIN_ID = (process.env.MASTER_ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean)[0];
  if (!MASTER_ADMIN_ID) return;

  // Use exec_sql RPC to bypass PostgREST auth issues — runs as DB superuser
  const escape = (s) => s.replace(/'/g, "''");
  const PARTNER_ARTICLES = [
    {
      title: "Temantiket — Layanan Tiket Pesawat & VOA Mesir untuk Masisir",
      content: `Temantiket adalah mitra resmi AINA yang melayani kebutuhan perjalanan Masisir (Mahasiswa Indonesia di Mesir) secara khusus.

**Layanan yang tersedia:**
• Tiket pesawat PP Indonesia–Mesir (Kairo) — harga kompetitif, berbagai maskapai
• VOA (Visa on Arrival) Mesir — pengurusan resmi untuk kunjungan wisata/keluarga
• Visa Student / Student Entry Mesir — pendampingan proses visa pelajar
• Konsultasi dokumen perjalanan
• Pemesanan bisa via website atau langsung lewat WhatsApp

**Cara pesan:**
1. Hubungi via WhatsApp: +62 813-1150-6025
2. Atau kunjungi: temantiket.com
3. Ceritakan kebutuhan perjalananmu — tanggal, rute, dan tipe visa jika diperlukan
4. Tim Temantiket akan bantu proses dari awal sampai selesai

**Catatan penting VOA Mesir:**
• VOA Mesir valid 30 hari, bisa diperpanjang di imigrasi setempat
• Biaya VOA dibayar di bandara tujuan (Kairo/Hurghada/dll) dalam USD atau EGP
• Temantiket bisa bantu proses dokumen pendukung sebelum berangkat

**Kontak:**
• 🌐 temantiket.com
• 💬 WhatsApp: +62 813-1150-6025`,
      category: "administrasi",
      keywords: "temantiket tiket pesawat mesir kairo voa visa on arrival visa student student entry penerbangan booking tiket murah mitra aina perjalanan",
      contact_number: "+6281311506025",
    },
    {
      title: "Cara Urus VOA (Visa on Arrival) Mesir — Panduan Lengkap 2026",
      content: `VOA (Visa on Arrival) adalah visa turis yang bisa didapatkan langsung saat tiba di bandara Mesir. Cocok untuk kunjungan keluarga, wisata, atau transit singkat.

**Syarat dasar VOA Mesir:**
• Paspor berlaku minimal 6 bulan ke depan
• Tiket pulang (return ticket) sudah dipesan
• Uang tunai USD 25 atau setara EGP untuk biaya VOA di bandara

**Langkah proses VOA di bandara:**
1. Tiba di bandara Kairo (Cairo International Airport) atau Hurghada
2. Antri di loket "Visa on Arrival" sebelum masuk imigrasi
3. Bayar biaya VOA — USD 25 per orang (tersedia money changer di area ini)
4. Tempel stiker VOA di paspor, lanjut ke konter imigrasi
5. Selesai — VOA berlaku 30 hari sejak tanggal masuk

**Perbedaan VOA vs Visa Reguler:**
• VOA: cocok untuk turis, proses di bandara, berlaku 30 hari
• Visa reguler: untuk tinggal lebih lama / tujuan spesifik (pelajar, kerja)

**Butuh bantuan dokumen sebelum berangkat?**
Temantiket (mitra resmi AINA) bisa bantu proses dan konsultasi dokumen:
• 🌐 temantiket.com
• 💬 WhatsApp: +62 813-1150-6025`,
      category: "administrasi",
      keywords: "voa mesir visa on arrival cara urus voa bandara kairo syarat voa biaya voa proses visa turis mesir",
      contact_number: "+6281311506025",
    },
    {
      title: "Panduan Beli Tiket Pesawat Jakarta–Kairo (Cairo) yang Murah",
      content: `Rute Jakarta (CGK) ke Kairo (CAI) adalah jalur yang paling sering dipakai Masisir. Berikut tips mendapatkan tiket terjangkau.

**Maskapai yang melayani rute CGK–CAI (biasanya dengan transit):**
• Egyptair (via Kuala Lumpur atau Abu Dhabi) — sering paling murah untuk Masisir
• Emirates (via Dubai)
• Qatar Airways (via Doha)
• Etihad (via Abu Dhabi)
• Turkish Airlines (via Istanbul) — opsi bagus tapi perjalanan lebih panjang

**Tips mendapatkan harga terbaik:**
• Pesan 2–3 bulan sebelum keberangkatan untuk harga terbaik
• Hindari peak season: Juli–Agustus dan Desember–Januari (libur kuliah)
• Cek tiket di hari kerja, bukan weekend — harga cenderung lebih murah
• Perhatikan batas bagasi — beda maskapai beda policy, penting untuk Masisir yang bawa banyak barang

**Mau dibantu urus tiket?**
Temantiket adalah mitra resmi AINA yang khusus melayani Masisir:
• Bisa bantu cari rute terbaik dan harga termurah
• Koordinasi jadwal sesuai kalender akademik Al-Azhar
• 🌐 temantiket.com
• 💬 WhatsApp: +62 813-1150-6025`,
      category: "administrasi",
      keywords: "tiket pesawat jakarta kairo cairo cgk cai murah promo penerbangan egyptair emirates tiket pp pulang pergi masisir booking pesawat",
      contact_number: "+6281311506025",
    },
  ];

  let seeded = 0;
  for (const art of PARTNER_ARTICLES) {
    const sql = `
      INSERT INTO public.knowledge_base
        (author_id, title, content, category, keywords, article_type, contact_number, hidden)
      SELECT
        '${escape(MASTER_ADMIN_ID)}',
        '${escape(art.title)}',
        '${escape(art.content)}',
        '${escape(art.category)}',
        '${escape(art.keywords)}',
        'approved',
        '${escape(art.contact_number)}',
        false
      WHERE NOT EXISTS (
        SELECT 1 FROM public.knowledge_base WHERE title = '${escape(art.title)}'
      );
    `;
    try {
      await supabase.rpc("exec_sql", { sql });
      seeded++;
    } catch {
      // exec_sql may not be available — admin can add articles manually via Admin Panel
    }
  }
  if (seeded > 0) {
    console.log(`[PartnerSeed] ✓ Temantiket KB articles synced (${seeded} upserts run)`);
  } else {
    console.log("[PartnerSeed] Temantiket articles can be added manually via Admin Panel");
  }
}

/* ── Sync contribution_count from actual KB article counts ───────────────────
   Recalculates contribution_count for every author based on the number of
   approved (and non-hidden) articles they actually have in the knowledge_base.
   This ensures articles uploaded via admin panel are counted correctly.
   ─────────────────────────────────────────────────────────────────────────── */
async function syncContributionCounts() {
  const supabase = getAdminClient();
  if (!supabase) return;
  try {
    const { data: articles, error } = await supabase
      .from("knowledge_base")
      .select("author_id")
      .eq("status", "approved");
    if (error || !articles?.length) return;

    // Count approved articles per author
    const countByAuthor = {};
    for (const a of articles) {
      if (!a.author_id) continue;
      countByAuthor[a.author_id] = (countByAuthor[a.author_id] || 0) + 1;
    }

    // Update each author's profile
    let synced = 0;
    for (const [authorId, count] of Object.entries(countByAuthor)) {
      const { data: profile } = await supabase.from("profiles").select("contribution_count").eq("user_id", authorId).single();
      if (!profile) continue;
      // Only update if count differs to avoid unnecessary writes
      if ((profile.contribution_count || 0) !== count) {
        const level = count >= 10 ? "Senior Contributor" : "Contributor";
        await supabase.from("profiles").update({ contribution_count: count, level }).eq("user_id", authorId);
        synced++;
      }
    }
    if (synced > 0) console.log(`[ContribSync] ✓ Updated contribution_count for ${synced} author(s)`);
  } catch (e) {
    console.warn("[ContribSync] failed:", e.message);
  }
}

/* ── Direct table init for Library (no exec_sql dependency) ── */
async function initLibraryTable() {
  const supabase = getAdminClient();
  if (!supabase) return;

  // Check if table already exists
  const { error: checkErr } = await supabase.from("library_items").select("id").limit(0);
  if (!checkErr) {
    console.log("[Library] ✓ library_items table ready");
    return;
  }
  if (!checkErr.message?.includes("does not exist") && checkErr.code !== "42P01") {
    // Some other error (RLS etc) — table might exist, skip
    console.log("[Library] ✓ library_items table ready");
    return;
  }

  // Table missing — try to create via exec_sql RPC
  console.log("[Library] library_items table missing — attempting to create...");
  const createSQL = `
    CREATE TABLE IF NOT EXISTS public.library_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'umum' CHECK (category IN ('muqorror','panduan','referensi','umum')),
      faculty TEXT,
      year_level TEXT,
      drive_url TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'pdf',
      tags TEXT,
      is_published BOOLEAN NOT NULL DEFAULT true,
      created_by UUID REFERENCES auth.users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_library_items_cat ON public.library_items(category, is_published);
  `;
  try {
    await supabase.rpc("exec_sql", { sql: createSQL });
    console.log("[Library] ✓ library_items table created");
  } catch (e) {
    console.warn("[Library] ⚠️  Could not auto-create library_items:", e.message);
    console.warn("[Library] → Run this SQL manually in Supabase SQL editor:");
    console.warn(createSQL);
  }
}

// Auto-embed approved KB articles that are missing embeddings OR have a stale model.
// Runs at startup when OPENAI_API_KEY is configured.
// New articles get embedded on approval; this catches existing ones and model upgrades.
// Aborts early on quota/billing errors (429) to avoid wasting API calls.
async function autoEmbedMissingArticles() {
  if (!process.env.OPENAI_API_KEY) return;
  const supabase = getAdminClient();
  if (!supabase) return;
  // Fetch articles missing embeddings OR embedded with an old model
  const { data: articles, error } = await supabase
    .from("knowledge_base")
    .select("id, embedding_model")
    .eq("status", "approved")
    .or(`embedding.is.null,embedding_model.is.null,embedding_model.neq.${CURRENT_EMBED_MODEL}`);
  if (error || !articles || articles.length === 0) {
    if (!error) console.log(`[RAG] ✓ All approved articles are embedded with current model (${CURRENT_EMBED_MODEL})`);
    return;
  }
  const needUpgrade = articles.filter(a => a.embedding_model && a.embedding_model !== CURRENT_EMBED_MODEL).length;
  const needEmbed = articles.length - needUpgrade;
  console.log(`[RAG] Auto-embedding ${articles.length} article(s): ${needEmbed} missing, ${needUpgrade} model upgrade (→${CURRENT_EMBED_MODEL})`);
  let ok = 0, fail = 0;
  let delayMs = 1000; // Start at 1 req/s; auto-increases if rate limited
  for (const { id } of articles) {
    let retries = 0;
    let success = false;
    while (!success && retries < 4) {
      try {
        await embedKBArticle(id, { rethrow: true });
        ok++;
        success = true;
      } catch (e) {
        const isRateLimit = e.message?.includes("429");
        if (isRateLimit && retries < 3) {
          // Slow down permanently for remaining articles + wait before retry
          delayMs = Math.min(delayMs * 3, 22000); // ramp up: 1s→3s→9s→22s
          const waitMs = 20000 * (retries + 1); // 20s, 40s, 60s cooldown
          console.warn(`[RAG] Rate limited — slowing to ${delayMs / 1000}s/req, retrying in ${waitMs / 1000}s... (${ok}/${ok + articles.length - ok - 1} done)`);
          await new Promise(r => setTimeout(r, waitMs));
          retries++;
        } else if (isRateLimit) {
          // Still failing after retries — no billing/quota
          console.warn("[RAG] ⚠️  OpenAI quota/billing issue — auto-embed stopped.");
          console.warn("[RAG] → Fix: add a payment method at https://platform.openai.com/settings/billing");
          console.warn(`[RAG] → Progress so far: ${ok} embedded, ${fail + 1} failed out of ${articles.length}`);
          vectorSearchDisabled = true;
          return;
        } else {
          fail++;
          success = true; // non-rate-limit error, skip to next article
        }
      }
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  console.log(`[RAG] Auto-embed complete: ${ok} embedded, ${fail} failed`);
}

// Auto-generate summaries for approved KB articles that are missing them.
// Runs at startup when OPENAI_API_KEY is configured.
// New articles get summaries on approval; this catches existing ones.
async function autoSummarizeMissingArticles() {
  if (!process.env.OPENAI_API_KEY) return;
  const supabase = getAdminClient();
  if (!supabase) return;
  const { data: articles, error } = await supabase
    .from("knowledge_base")
    .select("id")
    .eq("status", "approved")
    .is("summary", null);
  if (error || !articles || articles.length === 0) {
    if (!error) console.log("[Summary] ✓ All approved articles already have summaries");
    return;
  }
  console.log(`[Summary] Auto-generating summaries for ${articles.length} article(s)...`);
  let ok = 0, fail = 0;
  for (const { id } of articles) {
    try {
      await triggerSummaryGen(id);
      ok++;
      await new Promise(r => setTimeout(r, 500)); // gentle rate limit: 2 req/s
    } catch (e) {
      fail++;
      console.warn(`[Summary] Failed for ${id}: ${e.message}`);
    }
  }
  console.log(`[Summary] Auto-summarize complete: ${ok} done, ${fail} failed`);
}

// On Vercel (serverless) we export the app; listen() is only called in local dev.
if (!process.env.VERCEL) {
  initLibraryTable();
  checkRequiredTables();
  runColumnMigrations().then(() => {
    seedPartnerArticles();
    syncContributionCounts();
    autoEmbedMissingArticles();
    autoSummarizeMissingArticles();
  });
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AINA API server running on port ${PORT}`);
  });
}

export default app;
