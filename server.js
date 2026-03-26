import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import { createHash } from "crypto";

const app = express();
const PORT = process.env.PORT || 3001;

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
// Avatar upload route overrides this with its own limit (see below)
app.use((req, res, next) => {
  const avatarRoute = req.path === "/api/upload-avatar";
  express.json({ limit: avatarRoute ? "2mb" : "64kb" })(req, res, next);
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
const chatLimiter     = rl(60_000,  20, "Terlalu banyak pesan, tunggu sebentar.");
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
  } catch (e) {
    console.warn("Storage init warning:", e.message);
  }
}
initStorage();

console.log(`Admin client: ${SUPABASE_URL ? "✓ configured" : "✗ missing SUPABASE_URL"}`);
console.log(`Service role: ${SERVICE_ROLE_KEY ? "✓ configured" : "✗ missing SERVICE_ROLE_KEY"}`);
console.log(`OpenRouter: ${process.env.OPENROUTER_API_KEY ? "✓ configured" : "✗ missing OPENROUTER_API_KEY"}`);
console.log(`Perplexity: ${process.env.PERPLEXITY_API_KEY ? "✓ configured" : "✗ not configured — Perplexity fallback disabled"}`);
console.log(`Email (Resend): ${process.env.RESEND_API_KEY ? "✓ configured" : "✗ not configured — email notifications disabled"}`);

/* ── Email via Resend ─────────────────────────────────── */
async function getUserEmail(userId) {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data } = await supabase.from("profiles").select("email, full_name").eq("user_id", userId).single();
  return data ?? null;
}

async function sendEmail({ to, name, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
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
    } else {
      console.log(`Email sent to ${to}: ${subject}`);
    }
  } catch (e) {
    console.warn("Email send failed:", e.message);
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

/* ── Article type column detection (cached) ──────────── */
let _hasArticleTypeCol = null; // null=unknown, true/false=detected
let _hasKeywordsCol = null;

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

/* ── Fetch relevant knowledge base articles ──────────── */
async function fetchRelevantArticles(userQuestion) {
  const supabase = getAdminClient();
  if (!supabase) return [];

  const [hasTypeCol, hasKwCol] = await Promise.all([
    detectArticleTypeCol(supabase),
    detectKeywordsCol(supabase),
  ]);
  const selectCols = [
    "title, content, category",
    hasTypeCol ? ", article_type" : "",
    hasKwCol   ? ", keywords"     : "",
  ].join("");

  const keywords = userQuestion
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 5);

  if (keywords.length === 0) {
    const { data } = await supabase
      .from("knowledge_base")
      .select(selectCols)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(5);
    return data ?? [];
  }

  // Use server-side OR filter across keywords — avoids loading all articles in memory
  // Also matches against contributor-defined `keywords` column for precise query targeting
  const orFilter = keywords
    .flatMap(kw => [
      `title.ilike.%${kw}%`,
      `content.ilike.%${kw}%`,
      ...(hasKwCol ? [`keywords.ilike.%${kw}%`] : []),
    ])
    .join(",");

  const { data: matched } = await supabase
    .from("knowledge_base")
    .select(selectCols)
    .eq("status", "approved")
    .or(orFilter)
    .limit(5);

  if (matched && matched.length > 0) return matched;

  // Fallback: return recent articles
  const { data: recent } = await supabase
    .from("knowledge_base")
    .select(selectCols)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(3);
  return recent ?? [];
}

const DAILY_FREE_LIMIT = 3;

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
 * 'strong'  → ≥2 articles, or 1 article with ≥800 chars — KB can answer unaided
 * 'weak'    → 1 short article (<800 chars) — supplementary external may help
 * 'absent'  → no articles — external retrieval needed
 */
function assessKBStrength(articles) {
  if (!articles || articles.length === 0) return "absent";
  const totalChars = articles.reduce((sum, a) => sum + (a.content?.length ?? 0), 0);
  if (articles.length >= 2 || totalChars >= 800) return "strong";
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
  // Dynamic role or time-sensitive: Perplexity is critical
  const dynamic =
    /\bsiapa\b.{0,50}\b(presiden|perdana menteri|menteri|wakil presiden|rektor|direktur|ceo|gubernur|walikota|bupati|kepala|ketua|sekjen|paus|raja|ratu|panglima|kapolri|jaksa agung|chairman|pemimpin)\b/i.test(query)
    || /\b(presiden|menteri|rektor|direktur|ceo|gubernur|ketua|kepala)\b.{0,30}\bsiapa\b/i.test(query)
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
  if (perplexityInjected) return { tier: "high",   score: SOURCE_TRUST_SCORES.perplexity,  label: "Perplexity" };
  if (wikiInjected)       return { tier: "medium", score: SOURCE_TRUST_SCORES.wikipedia,   label: "Wikipedia" };
  if (ddgInjected)        return { tier: "low",    score: SOURCE_TRUST_SCORES.duckduckgo,  label: "DuckDuckGo" };
  return null;
}

/* ── Phase 12: Multi-User Intelligence helpers ────────── */

/** Normalize a query for dedup: lowercase, strip punctuation, collapse spaces. */
function normalizeQuery(q) {
  return q.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
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
    const text = data.AbstractText || data.Answer || data.Definition || "";
    if (!text || text.length < 20) return null;
    const source = data.AbstractSource || "DuckDuckGo";
    const url = data.AbstractURL || data.DefinitionURL || "";
    return { text: text.trim(), source, url };
  } catch {
    return null;
  }
}

/* ── Perplexity: Real-time web search fallback ────────── */

/**
 * Decide if a query warrants a Perplexity lookup.
 *
 * Rule: KB → Perplexity if KB is absent or weak.
 * Perplexity is the primary external intelligence source for ALL non-casual,
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
  if (kbStrength === "strong") return false;
  // KB is absent or weak → always try Perplexity
  return true;
}

/**
 * Fetch a concise, search-grounded answer from Perplexity's sonar model.
 * Returns { text, citations } or null on failure / no API key.
 * - text: filtered, max ~800 chars
 * - citations: up to 3 source URLs
 */
async function fetchPerplexityContext(query) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.log("[Perplexity] skipped — PERPLEXITY_API_KEY not set");
    return null;
  }

  const TIMEOUT = 10000;
  const todayPerplexity = new Date().toLocaleDateString("id-ID", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Africa/Cairo",
  });
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT),
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: `You are a factual web search assistant. Today's date is ${todayPerplexity} (Cairo time). Always prioritize the most current and up-to-date information available as of today. Return a clear, informative answer (3-5 sentences or a short list) covering the key facts. Include only factual content — no greetings, disclaimers, or extra commentary. Respond in the same language as the user's query.`,
          },
          {
            role: "user",
            content: query.slice(0, 500),
          },
        ],
        max_tokens: 500,
        return_citations: true,
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      console.warn(`[Perplexity] API error ${res.status}`);
      return null;
    }

    const data = await res.json();
    const rawText = data.choices?.[0]?.message?.content ?? "";
    if (!rawText || rawText.length < 20) return null;

    // Keep only first 1200 chars, cutting at sentence boundary
    const text = trimToSentence(rawText, 1200);

    // Extract up to 3 citations (URLs)
    const citations = (data.citations ?? []).slice(0, 3);

    return { text, citations };
  } catch (e) {
    console.warn("[Perplexity] fetch failed:", e.message);
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

    // Relevance scoring — type-intent affinity + keyword overlap
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
      const typeScore = (2 - priority.indexOf(type)) * 1.5; // 3, 1.5, 0
      const memWords = m.memory.toLowerCase().split(/\s+/);
      const overlap = Math.min(memWords.filter(w => queryWords.has(w)).length, 2);
      return { ...m, _score: typeScore + overlap };
    });
    scored.sort((a, b) => b._score - a._score);

    // Always include preference_memory if scored, cap total at 3
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
    const MAX_MEMORIES = 20;
    const supabase = getAdminClient();
    if (!supabase) return;

    // Only analyse the last 6 messages to keep cost minimal
    const recent = conversation.slice(-6);
    const convText = recent
      .map(m => `${m.role === "user" ? "User" : "AINA"}: ${m.content.slice(0, 500)}`)
      .join("\n");

    const extractionPrompt = `Dari percakapan berikut, ekstrak fakta penting tentang user untuk diingat di masa depan.

Output: JSON array, setiap item: { "memory": "...", "type": "...", "long_term": true/false }

KATEGORI:
- preference_memory: preferensi eksplisit user tentang gaya/format ("suka jawaban singkat", "prefer langkah-langkah", "prefer bahasa formal"). long_term=true.
- context_memory: siapa mereka dan situasinya ("tinggal di Hay Asyir", "baru tiba Maret 2026", "jurusan Syariah", "asal Surabaya"). long_term=false.
- task_memory: tugas/proses aktif saat ini ("sedang urus iqomah", "lagi cari kos", "mau ujian minggu depan", "sedang buat SKCK"). long_term=false.

ATURAN KETAT:
- Hanya fakta yang EKSPLISIT disebutkan user dalam percakapan ini
- Maksimal 3 item baru
- Jangan simpan hal generik seperti "user mahasiswa di Mesir"
- Tidak ada informasi sensitif (nomor paspor, data pribadi, finansial spesifik)
- Jika tidak ada fakta baru → kembalikan []
- Setiap memory max 120 karakter
- Balas HANYA dengan JSON array, tidak ada teks lain

Percakapan:
${convText}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    let newMemories = [];

    try {
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
          model: "meta-llama/llama-3.2-3b-instruct:free",
          messages: [{ role: "user", content: extractionPrompt }],
          max_tokens: 400,
          temperature: 0.1,
        }),
      });
      clearTimeout(timeoutId);
      if (!response.ok) return;
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
        .slice(0, 3);
    } catch {
      clearTimeout(timeoutId);
      return;
    }

    if (newMemories.length === 0) return;

    // Evict oldest if we'd exceed the cap
    const { data: existing } = await supabase
      .from("user_memories")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    const currentCount = existing?.length ?? 0;
    const toDelete = currentCount + newMemories.length - MAX_MEMORIES;
    if (toDelete > 0 && existing) {
      const idsToDelete = existing.slice(0, toDelete).map(m => m.id);
      await supabase.from("user_memories").delete().in("id", idsToDelete);
    }

    await supabase.from("user_memories").insert(
      newMemories.map(m => ({ user_id: userId, memory: m.memory, memory_type: m.memory_type, is_long_term: m.is_long_term }))
    );
    console.log(`[memory] saved ${newMemories.length} new memories for user ${userId}: ${JSON.stringify(newMemories)}`);
  } catch (e) {
    console.warn("[memory] extraction error:", e.message);
  }
}

/* ── Health check ────────────────────────────────────── */
app.get("/api/ping", (_req, res) => {
  res.json({ status: "ok" });
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

  res.json({
    id: user.id,
    email: user.email,
    roles: roleList,
    isMasterAdmin,
  });
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

/* ── Intent detection (rule-based, no LLM call) ─────── */
function detectIntent(text) {
  const t = text.toLowerCase().trim();

  // Casual tone flag — keyword-based only, no length check
  const isCasual = /\b(dong|deh|nih|btw|wkwk|haha|hehe|sih|loh|lho|gitu|gitu ya|ya kan|nggak sih|gak sih)\b/.test(t);

  // Primary intent signals (evaluated independently before priority resolution)
  const isConfused   = /bingung|galau|khawatir|takut|pusing|stres|stress|overwhelm|nggak tau|tidak tau|ga tau|gak tau|harus mulai dari mana|nggak ngerti|tidak mengerti|susah banget|ribet banget|tolong bantu/.test(t);
  const isProcedural = /\b(cara|bagaimana cara|gimana cara|langkah|prosedur|tahapan|proses|tutorial|panduan|step|caranya|gimana sih cara|ngurus|ngurusin|mendaftar|cara daftar|gimana daftar)\b/.test(t);
  const isRecommend  = /\b(rekomen|rekomendasi|saranin|suggest|yang bagus|yang enak|yang murah|yang terbaik|mending yang mana|pilih yang mana)\b/.test(t);
  const isBrainstorm = /\b(ide|pilihan|opsi|alternatif|apa saja|apa aja|apa yang bisa|bisa apa|ada nggak|ada yang|kira-kira apa)\b/.test(t);

  // Priority resolution — mixed case handled first
  let primary;
  if (isConfused && isProcedural) primary = "confused_procedural";
  else if (isConfused)            primary = "confused";
  else if (isProcedural)          primary = "procedural";
  else if (isRecommend)           primary = "recommendation";
  else if (isBrainstorm)          primary = "brainstorming";
  else                            primary = "factual";

  return { primary, casual: isCasual };
}

function buildIntentHint({ primary, casual }) {
  const toneNote = casual
    ? " Nada santai dan percakapan, boleh pakai kata informal tapi tetap informatif."
    : "";

  const hints = {
    factual:
      "Jawab poin utama langsung di kalimat pertama — tidak perlu pengantar apapun. " +
      "Kalimat kedua dan seterusnya boleh elaborasi singkat, tapi jangan overexplain. " +
      "Jika jawabannya cukup dalam 2–3 kalimat, berhenti di sana. " +
      "Jangan tambahkan informasi yang tidak ditanya.",

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
      "Sebutkan rekomendasi terkuat di kalimat pertama dengan tegas — jangan langsung bikin daftar. " +
      "Jelaskan alasannya dalam 1 kalimat singkat. " +
      "Baru setelah itu, tambahkan 2–3 alternatif jika memang relevan, masing-masing dengan 1 alasan singkat. " +
      "Jangan buat listing panjang tanpa prioritas — user butuh panduan, bukan katalog.",

    brainstorming:
      "Buka dengan 1 kalimat singkat yang framing-nya terbuka dan mengundang. " +
      "Berikan 3–5 opsi/ide yang benar-benar berbeda satu sama lain — hindari variasi yang terlalu mirip. " +
      "Setiap ide dalam format bullet, diikuti 1–2 kalimat penjelasan yang relevan dan konkret. " +
      "Susun dari yang paling mudah diakses ke yang lebih spesifik, atau dari yang paling umum ke yang paling niche. " +
      "Jangan ulangi ide dengan kata berbeda.",
  };

  const label = primary.toUpperCase().replace("_", "/");
  return `\n\n**[Gaya respons — ${label}]** ${hints[primary] ?? hints.factual}${toneNote}`;
}

/* ── Answer mode: concise / balanced / detailed ─────── */

/**
 * Detect the answer mode from userProfile.
 * Priority: explicit answerMode field → mapped responseLength → default "balanced"
 */
function detectAnswerMode(userProfile) {
  const raw = userProfile?.answerMode;
  if (raw === "concise" || raw === "balanced" || raw === "detailed") return raw;
  // Map legacy responseLength field
  const rl = userProfile?.responseLength;
  if (rl === "ringkas") return "concise";
  if (rl === "lengkap") return "detailed";
  return "balanced"; // default — not too short, not overwhelming
}

/**
 * Build a system-prompt hint that controls answer length and depth.
 * Injected alongside intentHint so the model understands the expected style.
 */
function buildAnswerModeHint(mode) {
  if (mode === "concise") {
    return `\n\n**[Mode Jawaban: RINGKAS]** Jawaban harus singkat dan langsung — maksimal 2-3 kalimat atau 3-4 poin bullet. Tidak perlu elaborasi atau contoh tambahan kecuali benar-benar kritis. Fokus pada inti saja.`;
  }
  if (mode === "detailed") {
    return `\n\n**[Mode Jawaban: DETAIL]** Berikan penjelasan yang lengkap dan komprehensif. Jelaskan latar belakang, langkah-langkah, konteks praktis, dan tips jika relevan. Gunakan heading dan struktur yang jelas. Panjang boleh lebih dari biasa asalkan tidak repetitif dan setiap kalimat punya nilai.`;
  }
  // balanced — default
  return `\n\n**[Mode Jawaban: BALANCED]** Struktur jawaban wajib mengikuti 3 bagian ini secara berurutan:

1. **Jawaban utama** — Langsung jawab di kalimat atau poin pertama. Jelas dan tidak ragu-ragu.
2. **Penjelasan singkat** — Berikan konteks, alasan, atau makna yang membantu user memahami lebih dalam (1–3 kalimat atau daftar 3–6 poin). Jangan terlalu singkat, tapi jangan berlebihan.
3. **Tawaran lanjutan (opsional, 1 kalimat)** — Di akhir jawaban, tawarkan bantuan relevan berikutnya secara natural. Tawaran ini HARUS spesifik terhadap topik yang ditanya — jangan generik seperti "ada yang bisa aku bantu lagi?". Contoh yang baik: "Kalau kamu mau, aku bisa jelasin langkah-langkah pengurusannya juga." atau "Aku juga bisa bantu rekomendasiin jenis kosan yang pas buat mahasiswa baru."

**Kapan TIDAK menambahkan tawaran lanjutan:**
- Jawaban sudah panjang/prosedural (ada langkah-langkah bernomor) — tawaran di akhir akan terasa berlebihan
- Pertanyaan sudah sangat spesifik dan lengkap dijawab — tidak ada natural next step yang relevan
- Topik sederhana/faktual yang sudah selesai sempurna dengan 1-2 kalimat

**Tone:** Hangat, natural, seperti senior yang helpful — bukan robot, bukan over-promising. Kalimat pendek-menengah. Inti selalu di depan.`;
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
  const timeSensitive = /\b(sekarang|terbaru|terkini|saat ini|hari ini|bulan ini|tahun ini|2024|2025|2026|berubah|update|baru-baru|perubahan|kebijakan baru|berita)\b/i.test(query);

  // Current role / office-holder: inherently dynamic even without explicit time keywords.
  const currentRoleQuery = /\bsiapa\b.{0,50}\b(presiden|perdana menteri|menteri|wakil presiden|rektor|direktur|ceo|gubernur|walikota|bupati|kepala|ketua|sekjen|sekretaris jenderal|paus|raja|ratu|panglima|kapolri|jaksa agung|chairman|chancellor|pemimpin|komisaris|wali kota)\b/i.test(query)
    || /\b(presiden|menteri|rektor|direktur|ceo|gubernur|ketua|kepala)\b.{0,30}\bsiapa\b/i.test(query);

  // Historical role modifier — these are stable facts, not current office-holders.
  // "presiden pertama", "presiden ke-2", "pendiri", "mantan", "almarhum", etc.
  const historicalRole = /\b(pertama|ke-?\d+|pendiri|terdahulu|dahulu|dulu|mantan|eks|sebelumnya|almarhum|almarhumah|wafat|tokoh|founding|awal mula)\b/i.test(query);

  // General knowledge: stable definitional / conceptual questions the model already knows
  const generalKnowledge = /\b(siapa|apa itu|apa arti|artinya apa|apa yang dimaksud|definisi|pengertian|ibu kota|ibukota|jelaskan|bagaimana cara kerja|dalam bahasa|terjemahan|artinya|maksudnya|berapa lama|berapa hari|kapan|sejarah|asal usul|fungsi|manfaat)\b/i.test(query);

  // Pinned updates are admin-verified — highest trust
  if (hasPinned) return { level: "high_confidence", hint: "" };

  // KB hit on stable, procedure-oriented intent — high trust
  // (KB takes priority even for role queries — article may have current info)
  if (hasKB && ["factual", "procedural", "confused_procedural", "confused"].includes(intent.primary)) {
    return { level: "high_confidence", hint: "" };
  }

  // Current role + NOT historical + no KB/pinned:
  // If Perplexity returned web-grounded data → medium confidence, answer allowed.
  // If no Perplexity → hard block, model must not guess from stale memory.
  if (currentRoleQuery && !historicalRole && !hasKB && !hasPinned) {
    if (hasPerplexity) {
      return {
        level: "medium_confidence",
        hint: "\n\n**[Kepercayaan — SEDANG/PERPLEXITY]** Jawaban ini berdasarkan pencarian web real-time (Perplexity). Jabatan dan posisi bisa berubah — tambahkan 1 kalimat saran cek sumber resmi di akhir jika terasa natural. Jangan terlalu banyak disclaimer.",
      };
    }
    return {
      level: "needs_verification",
      hint: "\n\n**[BLOKIR — JABATAN TERKINI TANPA SUMBER]** Ini adalah pertanyaan tentang pejabat/jabatan yang bisa berubah sewaktu-waktu. JANGAN sebutkan nama spesifik dari memori model — data bisa sudah basi. Jawab dengan salah satu dari:\n- 'Untuk jabatan yang bisa berubah seperti ini, saya tidak bisa pastikan nama terkininya tanpa sumber terbaru.'\n- 'Saya tidak bisa konfirmasi siapa yang menjabat saat ini tanpa data yang diverifikasi — sebaiknya cek langsung ke sumber resmi atau berita terbaru.'\nJangan tebak. Jangan sebut nama dari memori. Arahkan user untuk cek sumber terpercaya.",
    };
  }

  // General knowledge + stable + not a current role query → high trust.
  // Historical role queries (presiden pertama, pendiri, mantan) are allowed through.
  if (generalKnowledge && !timeSensitive && (!currentRoleQuery || historicalRole)) {
    return { level: "high_confidence", hint: "" };
  }

  // No KB, no pinned, query is time-sensitive:
  // Perplexity provides web-grounded fresh context → medium_confidence
  // No Perplexity → model uses its own knowledge but MUST prefix with uncertainty phrase
  if (!hasKB && !hasPinned && timeSensitive) {
    if (hasPerplexity) {
      return {
        level: "medium_confidence",
        hint: "\n\n**[Kepercayaan — SEDANG/PERPLEXITY]** Jawaban ini berdasarkan pencarian web real-time. Info bisa berubah — tambahkan 1 kalimat saran cek ulang di akhir jika terasa natural.",
      };
    }
    return {
      level: "needs_verification",
      hint: "\n\n**[Kepercayaan — PERLU_VERIFIKASI / FALLBACK MODEL]** Pencarian web tidak tersedia untuk pertanyaan ini. WAJIB mulai jawaban dengan frasa seperti 'Berdasarkan informasi terakhir yang aku tahu...' atau 'Sejauh yang aku tahu hingga batas pengetahuanku...' — jangan jawab dengan percaya diri penuh karena info ini bisa sudah berubah. Sertakan saran cek sumber terbaru di akhir jawaban.",
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

  // No context at all (no KB, no pinned, no wiki, no DDG) — very weak basis
  if (!hasKB && !hasPinned && !hasWiki && !hasDDG) {
    return {
      level: "needs_verification",
      hint: "\n\n**[Kepercayaan — PERLU_VERIFIKASI]** Jika jawaban ini mungkin sudah tidak akurat atau butuh konfirmasi, tambahkan 1 kalimat peringatan singkat dan natural di akhir. Jangan terdengar kaku atau defensif.",
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

/* ── AI Chat ─────────────────────────────────────────── */
app.post("/api/chat", chatLimiter, async (req, res) => {
  // Auth is required — unauthenticated requests must not reach OpenRouter
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan untuk menggunakan chat" });

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

  // Intent detection is synchronous — compute before parallel fetches so memory retrieval is query-aware
  const intent = detectIntent(lastUserMessage);
  const intentHint = buildIntentHint(intent);
  console.log(`[Intent] ${intent.primary}${intent.casual ? "+casual" : ""} — "${lastUserMessage.slice(0, 60)}"`);

  const [rolesRes, userMemories] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id),
    fetchUserMemories(user.id, lastUserMessage, intent.primary),
  ]);
  const roles = rolesRes.data;
  const isPaidUser = roles?.some(r => ["contributor", "senior_contributor", "admin"].includes(r.role)) ?? false;

  if (!isPaidUser) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabaseAdmin
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "user")
      .gte("created_at", todayStart.toISOString());

    console.log(`Rate limit check: user ${user.id} used ${count}/${DAILY_FREE_LIMIT} messages today`);

    if ((count ?? 0) >= DAILY_FREE_LIMIT) {
      return res.status(429).json({
        error: "Batas chat harian tercapai",
        limitReached: true,
      });
    }
  }

  // ── Tiered model routing ────────────────────────────────────────────────────
  // Tier A (lightweight): fast + cheap — casual, short queries, KB-strong simple answers
  // Tier B (standard):   quality   — procedural, memory-aware, complex, time-sensitive
  // Fallback:            free safety-net — only if both paid tiers fail
  //
  // Models are tried SEQUENTIALLY per tier (not raced) to avoid wasting paid API calls.
  // ──────────────────────────────────────────────────────────────────────────────
  const MODEL_TIERS = {
    // Tier A — cheapest safe model for simple, non-dynamic queries
    lightweight: {
      primary:   "google/gemini-2.0-flash-lite-001",       // cheapest safe ($0.075/1M in)
      fallback:  "google/gemini-2.0-flash-001",            // paid fallback if lite unavailable
      emergency: "meta-llama/llama-3.3-70b-instruct:free", // free safety-net
    },
    // Tier B — stronger model for complex, procedural, and dynamic queries
    standard: {
      primary:   "google/gemini-2.0-flash-001",            // main standard — training cutoff early 2025, knows post-election world
      fallback:  "openai/gpt-4o-mini",                     // backup — good quality but cutoff Oct 2023
      emergency: "meta-llama/llama-3.3-70b-instruct:free", // free last resort
    },
  };

  // Wave 1 — fast internal fetches (always run in parallel)
  const [articles, pinnedUpdates, exchangeRates] = await Promise.all([
    fetchRelevantArticles(lastUserMessage),
    fetchPinnedUpdates(),
    isCurrencyQuery(lastUserMessage) ? fetchExchangeRates() : Promise.resolve(null),
  ]);

  // Assess KB coverage strength before deciding whether to hit external sources
  const kbStrength = assessKBStrength(articles);
  const needsExternal = shouldFetchExternal(intent.primary, kbStrength, lastUserMessage);
  const perplexityNeeded = needsPerplexity(intent.primary, kbStrength, lastUserMessage);

  // ── Classify query type for strict 3-layer routing ──────────────────────────
  // "currency"  → exchange API only (already fetched); NEVER Wikipedia/DDG/Perplexity
  // "dynamic"   → Perplexity primary; Wikipedia/DDG only if Perplexity unavailable
  // "general"   → Perplexity primary (if weak/absent KB); Wikipedia/DDG only as fallback
  const queryType = classifyQueryType(intent.primary, kbStrength, lastUserMessage);
  const kbCoversQuery = kbStrength === "strong";

  console.log(`[Source] KB=${kbStrength} (${articles.length} art) intent=${intent.primary} queryType=${queryType} kbCovers=${kbCoversQuery}`);

  // ── Wave 2 — strict 3-layer external routing ─────────────────────────────
  // Rule 1: KB strong  → no external at all
  // Rule 2: currency   → exchange API only (Wave 1). Skip everything else.
  // Rule 3: dynamic/general → Perplexity first; Wikipedia+DDG only if Perplexity absent/failed
  let wikiResult = null, ddgResult = null, perplexityResult = null;

  if (!kbCoversQuery && queryType !== "currency") {
    // Step A — try Perplexity (primary external intelligence)
    if (perplexityNeeded) {
      perplexityResult = await fetchPerplexityContext(lastUserMessage);
      console.log(`[Source] perplexity=${perplexityResult ? "SUCCESS" : "FAILED"} (queryType=${queryType})`);
    }

    // Step B — Wikipedia + DDG: ONLY when Perplexity is not configured at all.
    // If Perplexity key exists but the call failed → go straight to model fallback.
    // This keeps the architecture clean: KB → Perplexity → Model.
    const perplexityConfigured = !!process.env.PERPLEXITY_API_KEY;
    if (!perplexityResult && !perplexityConfigured && needsExternal) {
      [wikiResult, ddgResult] = await Promise.all([
        fetchWikipediaSummary(lastUserMessage),
        fetchDuckDuckGoAnswer(lastUserMessage),
      ]);
      console.log(`[Source] wikipedia=${!!wikiResult} ddg=${!!ddgResult} (Perplexity not configured → last-resort fallback)`);
    } else if (perplexityResult) {
      console.log(`[Source] perplexity succeeded → skipping Wikipedia+DDG`);
    } else if (!perplexityResult && perplexityConfigured) {
      console.log(`[Source] perplexity configured but failed → model fallback (no Wikipedia/DDG)`);
    }
  } else {
    if (kbCoversQuery) console.log(`[Source] KB strong → skipping all external sources`);
    if (queryType === "currency") console.log(`[Source] currency query → exchange API only (no Wikipedia/DDG/Perplexity)`);
  }

  // ── Answer mode ──────────────────────────────────────────────────────────
  const answerMode = detectAnswerMode(userProfile);
  const answerModeHint = buildAnswerModeHint(answerMode);

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

  // Build knowledge context with article-type-aware formatting hints
  // Context cleaning: cap each article at 2,000 chars, cutting at last sentence boundary
  let knowledgeContext = "";
  if (articles.length > 0) {
    const articlesText = articles.map((a, i) => {
      const typeHint = a.article_type === "step_by_step"
        ? " [FORMAT: Panduan Langkah-langkah — WAJIB jawab dalam format langkah bernomor: **Langkah 1**, **Langkah 2**, dst.]"
        : " [FORMAT: Informasi Umum — jawab dalam paragraf terstruktur]";
      const cleanedContent = trimToSentence(a.content, 2000);
      if (cleanedContent.length < a.content.length) {
        console.log(`[CtxClean] Article "${a.title}": ${a.content.length} → ${cleanedContent.length} chars`);
      }
      return `### Artikel ${i + 1}: ${a.title} [${a.category}]${typeHint}\n${cleanedContent}`;
    }).join("\n\n");

    // Detect potentially conflicting articles: 2+ articles in the same category
    const categoryCounts = {};
    for (const a of articles) {
      const cat = (a.category || "Umum").toLowerCase();
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    const hasConflictingCategory = Object.values(categoryCounts).some(c => c >= 2);
    const conflictInstruction = hasConflictingCategory
      ? "\n\n⚠️ INSTRUKSI KONFLIK: Terdapat beberapa artikel dari kategori yang sama. Jika informasi antar artikel SALING MELENGKAPI, gabungkan menjadi jawaban terpadu. Namun jika informasinya BERBEDA atau BERTENTANGAN untuk pertanyaan yang sama, JANGAN pilih salah satu — sajikan kedua opsi secara jelas dengan label:\n**Opsi 1 (berdasarkan [judul artikel pertama]):** ...\n**Opsi 2 (berdasarkan [judul artikel kedua]):** ...\nLalu berikan catatan singkat agar user dapat mempertimbangkan mana yang sesuai kondisinya."
      : "";

    knowledgeContext = `\n\n---\n## Knowledge Base AINA (Informasi dari Kontributor)\nINI ADALAH SUMBER UTAMA. Jawab HANYA berdasarkan artikel di bawah ini jika topiknya relevan. Perhatikan petunjuk FORMAT di setiap artikel dan ikuti dengan ketat. Jika menggunakan artikel ini, cantumkan judulnya sebagai sumber.${conflictInstruction}\n\n${articlesText}\n---`;
  }

  // Build breaking/pinned updates context
  let pinnedContext = "";
  if (pinnedUpdates.length > 0) {
    // Context cleaning: cap each pinned update at 500 chars
    const updatesText = pinnedUpdates.map(u => `**[${u.topic}]**: ${trimToSentence(u.content, 500)}`).join("\n");
    pinnedContext = `\n\n---\n## 🚨 Breaking Updates — PRIORITAS TERTINGGI\nAdmin telah memverifikasi bahwa informasi berikut adalah update kebijakan/situasi TERBARU dan HARUS diprioritaskan di atas semua sumber lain:\n\n${updatesText}\n---`;
  }

  // Build user personalization context
  // Sanitize every field: strip control characters + cap at 100 chars to block prompt injection
  let personalizationContext = "";
  if (userProfile && typeof userProfile === "object") {
    const sanitize = (v) => typeof v === "string"
      ? v.replace(/[\r\n\t\x00-\x1F\x7F]/g, " ").trim().slice(0, 100)
      : null;
    const parts = [];
    const name = sanitize(userProfile.full_name);
    const level = sanitize(userProfile.level);
    const year = sanitize(String(userProfile.arrival_year ?? ""));
    const faculty = sanitize(userProfile.faculty);
    const field = sanitize(userProfile.study_field);
    const city = sanitize(userProfile.origin_city);
    if (name) parts.push(`Nama: ${name}`);
    if (level && level !== "User") parts.push(`Level: ${level}`);
    if (year) parts.push(`Angkatan/tahun tiba: ${year}`);
    if (faculty) parts.push(`Fakultas: ${faculty}`);
    if (field) parts.push(`Jurusan: ${field}`);
    if (city) parts.push(`Kota asal: ${city}`);
    const chatStyle = sanitize(userProfile.chatStyle);
    const userName = sanitize(userProfile.userName);
    if (userName) parts.push(`Panggil user dengan: "${userName}"`);
    if (parts.length > 0) {
      let styleNote = "";
      if (chatStyle === "formal") styleNote += "\nGunakan bahasa yang formal dan sopan dalam setiap jawaban.";
      else styleNote += "\nGunakan bahasa yang santai, akrab, dan bersahabat (bisa pakai 'kamu', 'nih', 'ya', dsb).";
      // Note: answer length/depth is controlled by answerModeHint (concise/balanced/detailed)
      // and injected separately into the system prompt — not repeated here.
      personalizationContext = `\n\n---\n## Profil & Preferensi User\n${parts.join("\n")}${styleNote}\nSesuaikan jawaban dengan konteks user ini. Jika user baru tiba (angkatan baru), prioritaskan info dasar. Jika user lama, berikan tips lebih mendalam.\n---`;
    }
  }

  let memoryContext = "";
  if (userMemories.length > 0) {
    const prefMems  = userMemories.filter(m => (m.memory_type || "context_memory") === "preference_memory");
    const ctxMems   = userMemories.filter(m => (m.memory_type || "context_memory") === "context_memory");
    const taskMems  = userMemories.filter(m => (m.memory_type || "context_memory") === "task_memory");
    const parts = [];
    if (prefMems.length > 0)  parts.push(`**Preferensi:** ${prefMems.map(m => m.memory).join("; ")}`);
    if (ctxMems.length > 0)   parts.push(`**Konteks user:** ${ctxMems.map(m => m.memory).join("; ")}`);
    if (taskMems.length > 0)  parts.push(`**Sedang aktif:** ${taskMems.map(m => m.memory).join("; ")}`);
    if (parts.length > 0) {
      memoryContext = `\n\n---\n## Memori tentang User Ini\nFakta yang diingat dari percakapan sebelumnya. Gunakan HANYA jika relevan dengan pertanyaan ini — jangan diasumsikan atau dipaksakan:\n${parts.join("\n")}\n---`;
      console.log(`[Memory] injected ${userMemories.length} memories (pref:${prefMems.length} ctx:${ctxMems.length} task:${taskMems.length}) for intent=${intent.primary}`);
    }
  }

  // Build exchange rate context (Frankfurter API)
  let exchangeContext = "";
  if (queryType === "currency" && exchangeRates) {
    // API success → inject real-time rates
    exchangeContext = `\n\n---\n## Data Kurs Real-time (${exchangeRates.date})\nData langsung dari Frankfurter API — gunakan HANYA angka-angka ini untuk menjawab pertanyaan kurs/konversi:\n- 1 EGP = Rp ${exchangeRates.egpToIdr.toFixed(2)} (IDR)\n- 1 EGP = $${exchangeRates.egpToUsd.toFixed(4)} (USD)\n- 1 USD = Rp ${exchangeRates.usdToIdr.toFixed(0)} (IDR)\n- 1 USD = ${exchangeRates.usdToEgp.toFixed(2)} EGP\nSumber: Frankfurter (ECB data)\n\nPetunjuk: Setelah menyebutkan angka kurs, tambahkan satu kalimat singkat menyarankan user cek widget Kurs di halaman utama AINA untuk data real-time terbaru.\n---`;
    console.log(`[Exchange] fetched rates for ${exchangeRates.date}: 1 EGP = ${exchangeRates.egpToIdr.toFixed(2)} IDR`);
  } else if (queryType === "currency" && !exchangeRates) {
    // API failed → inject hard block so model cannot hallucinate numbers
    exchangeContext = `\n\n---\n## ⚠️ DATA KURS TIDAK TERSEDIA\nFrankfurter API gagal mengambil data terkini. ATURAN KERAS: JANGAN sebutkan angka kurs, nilai tukar, atau hasil konversi apapun dalam jawaban ini — bahkan sebagai perkiraan. Angka yang tidak diverifikasi lebih berbahaya dari tidak ada angka. Jawab hanya dengan: "Aku belum bisa mendapatkan data kurs terbaru saat ini. Coba beberapa saat lagi ya. Kamu juga bisa cek langsung di fitur Kurs di halaman utama AINA."\n---`;
    console.log(`[Exchange] API failed for currency query — injecting hard no-numbers block`);
  } else if (!queryType && exchangeRates) {
    // Non-currency query but rates happened to be fetched (shouldn't happen, safety net)
    exchangeContext = `\n\n---\n## Data Kurs Real-time (${exchangeRates.date})\nData langsung dari Frankfurter API — gunakan HANYA angka-angka ini untuk menjawab pertanyaan kurs/konversi:\n- 1 EGP = Rp ${exchangeRates.egpToIdr.toFixed(2)} (IDR)\n- 1 EGP = $${exchangeRates.egpToUsd.toFixed(4)} (USD)\n- 1 USD = Rp ${exchangeRates.usdToIdr.toFixed(0)} (IDR)\n- 1 USD = ${exchangeRates.usdToEgp.toFixed(2)} EGP\nSumber: Frankfurter (ECB data)\n---`;
  }

  // Build Wikipedia context — KB-first filter: only inject when KB is absent/weak OR intent is factual
  // Trust label added so AINA knows the epistemic weight of this source (Phase 9)
  let wikiContext = "";
  if (wikiResult) {
    const injectWiki = kbStrength !== "strong" || intent.primary === "factual";
    if (injectWiki) {
      const langLabel = wikiResult.lang === "id" ? "Wikipedia Bahasa Indonesia" : "Wikipedia (English)";
      const cleanedExtract = trimToSentence(wikiResult.extract, 1200);
      if (cleanedExtract.length < wikiResult.extract.length) {
        console.log(`[CtxClean] Wikipedia "${wikiResult.title}": ${wikiResult.extract.length} → ${cleanedExtract.length} chars`);
      }
      wikiContext = `\n\n---\n## Informasi dari Wikipedia [kepercayaan: sedang — ensiklopedia publik, biasanya akurat tapi bisa tidak terkini]\n**${wikiResult.title}**\n\n${cleanedExtract}\n\nSumber: ${langLabel} — ${wikiResult.url}\n---`;
      console.log(`[Wikipedia] injected: "${wikiResult.title}" trust=${SOURCE_TRUST_SCORES.wikipedia} (KB=${kbStrength}, intent=${intent.primary})`);
    } else {
      console.log(`[Wikipedia] fetched "${wikiResult.title}" but suppressed — KB is strong and intent=${intent.primary}`);
    }
  }

  // Build DuckDuckGo context — only inject when KB has no relevant articles (KB-first filter, strictest)
  // DDG is lowest trust tier: inject only when both KB and Wikipedia are absent
  // Trust label added so AINA applies appropriate caution (Phase 9)
  let ddgContext = "";
  if (ddgResult && articles.length === 0) {
    const injectDDG = !wikiContext; // prefer Wikipedia; only use DDG if wiki also absent
    if (injectDDG) {
      const cleanedDDG = trimToSentence(ddgResult.text, 800);
      ddgContext = `\n\n---\n## Informasi dari ${ddgResult.source} via DuckDuckGo [kepercayaan: rendah — sumber umum, belum diverifikasi]\n\n${cleanedDDG}${ddgResult.url ? `\n\nSumber: ${ddgResult.url}` : ""}\n---`;
      console.log(`[DDG] injected "${ddgResult.source}": trust=${SOURCE_TRUST_SCORES.duckduckgo} (KB absent, wiki also absent)`);
    } else {
      console.log(`[DDG] fetched "${ddgResult.source}": skipped — Wikipedia already covering (KB absent)`);
    }
  } else if (ddgResult) {
    console.log(`[DDG] fetched "${ddgResult.source}": suppressed — KB has ${articles.length} articles`);
  }

  // Build Perplexity context — injected between Pinned Updates and Wikipedia in the hierarchy.
  // Only used when Perplexity was fetched and returned a usable result.
  let perplexityContext = "";
  if (perplexityResult) {
    const cleanedPlex = trimToSentence(perplexityResult.text, 800);
    const citationsText = perplexityResult.citations?.length > 0
      ? `\nSumber: ${perplexityResult.citations.slice(0, 2).join(", ")}`
      : "";
    perplexityContext = `\n\n---\n## Informasi Terkini dari Pencarian Web [kepercayaan: tinggi — real-time web search, belum diverifikasi admin]\n\n${cleanedPlex}${citationsText}\n---`;
    console.log(`[Perplexity] injected: trust=${SOURCE_TRUST_SCORES.perplexity} tier=high (KB=${kbStrength}, intent=${intent.primary})`);
  }

  // Compute external trust level — used to refine confidence classification (Phase 9)
  const externalTrust = computeExternalTrustLevel(!!wikiContext, !!ddgContext, !!perplexityContext);
  if (externalTrust) {
    console.log(`[Trust] external=${externalTrust.label}(${externalTrust.score}) tier=${externalTrust.tier}`);
  }

  // Classify confidence based on what context was actually retrieved
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

  const now = new Date();
  const todayStr = now.toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Africa/Cairo" });

  const systemPrompt = `Kamu adalah AINA, asisten AI khusus untuk mahasiswa Indonesia di Mesir (Masisir).

Tanggal & waktu saat ini (Kairo): ${todayStr}. Gunakan info ini saat user bertanya tentang sesuatu "sekarang", "saat ini", atau "terkini". Pengetahuanmu memiliki batas waktu, jadi UTAMAKAN data dari Pencarian Web atau sumber eksternal yang disediakan di konteks ini jika ada.

Keahlianmu: administrasi (Iqomah, Paspor, Visa, VOA, pendaftaran kuliah), kehidupan di Mesir (transportasi, kuliner halal, tempat tinggal, biaya hidup), info Al-Azhar, tips sehari-hari di Kairo, kurs EGP/IDR/USD.

ATURAN KERAS — WAJIB DIIKUTI TANPA PENGECUALIAN:

**Respons selalu final:**
- DILARANG KERAS mengatakan "tunggu sebentar", "aku cek dulu", "aku cari dulu", "biar aku cek web dulu", atau frasa apapun yang mengisyaratkan kamu sedang menunggu atau mencari data. Kamu TIDAK bisa menunggu — respons harus selalu langsung dan final.
- Jika data tidak tersedia, katakan langsung bahwa data tidak tersedia — bukan bahwa kamu akan mencarinya.

**Sumber jawaban:**
- Urutan prioritas sumber jawaban (dari paling dipercaya):
  1. **Knowledge Base** (konteks artikel di bawah) — UTAMAKAN ini. Jika KB ada dan relevan, jawab berdasarkan KB dulu.
  2. **Pinned / Verified Updates** (jika ada di konteks) — Admin-verified. Selalu prioritaskan ini untuk info kebijakan atau fakta terkini.
  3. **Pencarian Web Real-time** (jika ada di konteks "Informasi Terkini dari Pencarian Web") — Digunakan untuk pertanyaan jabatan terkini, kebijakan terbaru, info yang berubah cepat, atau topik apapun yang KB tidak punya. Kepercayaan tinggi tapi belum diverifikasi admin — gunakan isinya secara natural dalam jawaban.
  4. **Data real-time** (kurs, dll.) — Gunakan jika tersedia di konteks, khusus untuk data numerik/kurs. Jangan tebak angka jika data tidak tersedia.
  5. **Pengetahuan umum kamu sendiri** — Untuk pertanyaan stabil: definisi, konsep, sejarah, arti kata, info yang tidak berubah cepat.
- JANGAN bilang "tidak tahu" jika Pencarian Web atau sumber lain sudah menyediakan info relevan di konteks.
- JANGAN bilang "tidak tahu" untuk fakta umum yang sudah kamu miliki (ibu kota, siapa tokoh terkenal, definisi istilah).
- Jika tidak ada konteks eksternal yang disertakan, itu artinya KB sudah cukup atau topiknya cukup stabil — jawab dari KB atau pengetahuanmu.
- **Konflik antar sumber:** Ikuti urutan kepercayaan secara ketat: KB > Pinned Updates > Pencarian Web Real-time > Data real-time > Pengetahuan model. Pilih dan gunakan sumber tertinggi — tanpa perlu menyebutkan nama sumbernya dalam teks.

**Format jawaban:**
- Panjang dan kedalaman jawaban diatur oleh [Mode Jawaban] yang disertakan di akhir instruksi ini — ikuti dengan ketat.
- Gunakan format Markdown secara natural sesuai konteks, persis seperti ChatGPT:
  - Pertanyaan percakapan/casual → jawab tanpa heading, gaya natural.
  - Panduan/prosedur/langkah-langkah → gunakan angka bernomor (1. 2. 3.) dan heading \`##\` untuk bagian utama.
  - Daftar syarat/dokumen/opsi → gunakan bullet \`-\`.
  - Perbandingan data → gunakan tabel Markdown.
  - Penjelasan topik kompleks → gunakan \`##\` untuk sub-judul bagian, diikuti paragraf atau bullet.
  - **Bold** untuk istilah penting atau kata kunci.
- JANGAN gunakan heading jika jawaban cukup singkat dan tidak butuh struktur.
- JANGAN gunakan \`#\` (h1) — mulai dari \`##\` (h2) jika butuh heading.
- Setiap poin fokus pada satu hal. Tidak ada pengulangan.

**Gaya bahasa:**
- DILARANG memberi pengantar, salam, atau basa-basi (jangan mulai dengan "Tentu!", "Baik!", "Halo!", "Siap!", dll.).
- DILARANG mengulang atau memparafrase pertanyaan user di awal jawaban.
- DILARANG menambahkan penutup seperti "Semoga membantu!", "Jangan ragu bertanya!", atau sejenisnya.
- Langsung jawab inti pertanyaan dari kalimat pertama.
- Bayangkan kamu adalah kakak senior Masisir yang sangat paham kondisi di Kairo — pintar, hangat, dan bicara apa adanya. Bukan robot, bukan asisten formal.
- Sesuaikan nada dengan jenis pertanyaan:
  - Pertanyaan santai/kasual → jawab dengan gaya percakapan yang natural, boleh pakai kata seperti "nih", "btw", "oh iya", "sebenernya", tapi tetap informatif.
  - Pertanyaan prosedural/langkah-langkah → tetap ikuti format bernomor yang sudah ditentukan, nada tetap bisa hangat.
  - Pertanyaan yang mengandung kebingungan atau kekhawatiran → akui dulu perasaannya dalam satu kalimat singkat, lalu langsung ke solusi.
- Jawaban harus terasa seperti ditulis manusia: alami, tidak kaku, tidak terlalu formal, tidak seperti dokumen resmi.
- Gunakan kalimat pendek-menengah. Hindari kalimat panjang beranak-pinak yang sulit dicerna.
- Jika ada satu poin inti yang harus disampaikan, tulis itu di kalimat pertama — baru elaborasi setelahnya.
- **Pertanyaan "siapa"**: langsung sebut NAMA orangnya di kalimat pertama. JANGAN awali dengan menjelaskan jabatan/perannya dulu. Contoh SALAH: "Presiden Amerika Serikat adalah kepala negara yang dipilih setiap 4 tahun. Saat ini dijabat oleh..." — Contoh BENAR: "Donald Trump adalah Presiden Amerika Serikat saat ini, menjabat sejak Januari 2025."
- **Pertanyaan "apa"/"berapa"**: langsung sebut jawabannya di kalimat pertama, baru elaborasi singkat jika perlu.
${intentHint}${confidence.hint}${answerModeHint}

**Sumber:**
- JANGAN sebutkan atau mencantumkan sumber dalam teks jawaban — sumber sudah ditampilkan otomatis sebagai badge oleh sistem di bawah setiap pesan. Tidak perlu menulis baris "Sumber: ..." di akhir jawaban, dan tidak perlu menyebut nama sumber secara eksplisit di dalam teks (misalnya "Menurut Wikipedia...", "Berdasarkan Frankfurter...", dll).
- Fokus hanya pada konten jawaban yang berkualitas — biarkan sistem yang urus atribusi sumber.${pinnedContext}${memoryContext}${personalizationContext}${knowledgeContext}${exchangeContext}${perplexityContext}${wikiContext}${ddgContext}`;

  console.log(`Chat: found ${articles.length} relevant articles for query: "${lastUserMessage.slice(0, 60)}"`);

  // ── Build final messages array, injecting attachedFile if present ──────────
  let finalSystemPrompt = systemPrompt;
  let finalMessages = [...messages];
  let useVisionModel = false;

  if (attachedFile?.type === "pdf" && attachedFile.text) {
    const pdfCtx = `\n\n---\n## Dokumen yang Diupload User (${attachedFile.name ?? "file.pdf"})\nAnalisis dokumen berikut sesuai pertanyaan user:\n\n${attachedFile.text.slice(0, 20_000)}\n---`;
    finalSystemPrompt = finalSystemPrompt + pdfCtx;
  }

  if (attachedFile?.type === "image" && attachedFile.dataUrl) {
    // Replace the last user message with multimodal content
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
    // Casual / small-talk: no KB reasoning needed
    if (intentPrimary === "casual") return "lightweight";

    // KB is strong → model only needs to present/format the KB content; no heavy reasoning
    if (kbStrength === "strong" && ["factual", "procedural", "confused", "confused_procedural"].includes(intentPrimary)) return "lightweight";

    // ── Everything else → Tier B ──────────────────────────────────────────────
    // recommendation, brainstorming, memory-aware, absent KB, weak KB, or unknown intent
    return "standard";
  }

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
          temperature: 0.5,
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

  try {
    let result;
    if (useVisionModel) {
      result = await tryModel(VISION_MODEL, false, 20000);
    } else {
      const tier = selectModelTier(intent.primary, kbStrength, lastUserMessage);
      console.log(`[Routing] tier=${tier} intent=${intent.primary} kb=${kbStrength} qlen=${lastUserMessage.length}`);
      try {
        result = await runTieredWaterfall(tier);
      } catch {
        // Last resort: try standard tier if lightweight failed, or vice versa
        const fallbackTier = tier === "lightweight" ? "standard" : "lightweight";
        console.warn(`[Routing] tier ${tier} exhausted, trying ${fallbackTier}`);
        result = await runTieredWaterfall(fallbackTier);
      }
    }
    const reply = cleanReply(result.reply);
    console.log(`Responded using model: ${result.model}`);

    // Build structured source list for frontend badges — derived from what was actually used,
    // not from model text (model is told not to write "Sumber: ..." anymore).
    const responseSources = [];
    if (pinnedUpdates.length > 0)                        responseSources.push("Breaking Update");
    if (articles.length > 0)                             articles.slice(0, 2).forEach(a => responseSources.push(a.title));
    if (perplexityResult)                                responseSources.push("Pencarian Web");
    if (queryType === "currency" && exchangeRates)       responseSources.push("Kurs Real-time");
    if (wikiResult)                                      responseSources.push("Wikipedia");
    if (ddgResult)                                       responseSources.push("DuckDuckGo");
    if (responseSources.length === 0)                    responseSources.push("Pengetahuan Umum");

    res.json({ reply, model: result.model, intent: intent.primary, confidence: confidence.level, sources: responseSources });
    // Fire-and-forget: extract memories + record intel signals (Phase 6 + Phase 12)
    setImmediate(() => {
      extractAndSaveMemories(user.id, [...messages, { role: "assistant", content: reply }], apiKey);
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
    });
  } catch {
    return res.status(503).json({ error: "Semua model AI sedang sibuk. Coba lagi dalam beberapa detik." });
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
// then sends all pages in parallel to an OpenRouter vision model for text extraction.
// Much faster than local Tesseract (no model download, parallelised API calls).
const MAX_OCR_PAGES = 5; // Cap to stay within Vercel's 60 s timeout

async function ocrPdf(buffer) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  GlobalWorkerOptions.workerSrc = new URL(
    "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url
  ).href;

  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const numPages = Math.min(pdf.numPages, MAX_OCR_PAGES);

  // Render pages to JPEG base64 (JPEG is smaller → faster API transfer)
  const pageImages = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 }); // 1.5× → good quality/size balance
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const b64 = canvas.toBuffer("image/jpeg", { quality: 80 }).toString("base64");
    pageImages.push(`data:image/jpeg;base64,${b64}`);
    page.cleanup();
  }

  // Send all pages to vision model in parallel
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY tidak dikonfigurasi di server");

  const results = await Promise.all(
    pageImages.map(async (imgUrl) => {
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
              { type: "image_url", image_url: { url: imgUrl } },
              {
                type: "text",
                text: "Ekstrak semua teks dari gambar dokumen ini. Dokumen mungkin mengandung teks bahasa Arab (tulisan Arab, kanan ke kiri), Indonesia, atau campuran keduanya — ekstrak semuanya dengan akurat dan pertahankan urutan serta strukturnya. Kembalikan HANYA teks yang diekstrak, pertahankan paragraf dan struktur aslinya. Jangan tambahkan komentar atau penjelasan apapun.",
              },
            ],
          }],
          max_tokens: 2000,
        }),
      });
      const data = await resp.json();
      return data.choices?.[0]?.message?.content?.trim() || "";
    })
  );

  const combined = results.filter(Boolean).join("\n\n");
  return numPages < pdf.numPages
    ? combined + `\n\n[...${pdf.numPages - numPages} halaman berikutnya tidak di-OCR karena batas halaman]`
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
      if (!extractedText || extractedText.trim().length < 20) {
        console.log(`[extract-file] No text found in PDF — running OCR on ${originalname}`);
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

  if (!extractedText || extractedText.trim().length < 20) {
    const isPdf = mimetype === "application/pdf";
    return res.status(422).json({
      error: isPdf
        ? "PDF ini tidak mengandung teks yang bisa dibaca bahkan setelah OCR. Coba simpan ulang file PDF-nya atau ketik kontennya secara manual."
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
      if (!extractedText || extractedText.trim().length < 20) {
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
      if (!extractedText || extractedText.trim().length < 20) {
        console.log(`[extract-from-storage] No text in PDF — running OCR on ${originalname}`);
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

  if (!extractedText || extractedText.trim().length < 20) {
    const isPdf = mimetype === "application/pdf";
    return res.status(422).json({
      error: isPdf
        ? "PDF ini tidak mengandung teks yang bisa dibaca bahkan setelah OCR. Coba simpan ulang file PDF-nya atau ketik kontennya secara manual."
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

/* ── Admin: Stats ────────────────────────────────────── */
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

  // Get user profile to determine if they're a new user (registered ≤ 7 days ago)
  const { data: profile } = await supabase.from("profiles").select("created_at").eq("user_id", user.id).single();
  const isNewUser = profile?.created_at
    ? (Date.now() - new Date(profile.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000
    : false;

  // Fetch active announcements that haven't expired and match audience
  let query = supabase
    .from("system_announcements")
    .select("*")
    .eq("is_active", true)
    .or(`start_at.is.null,start_at.lte.${now}`)
    .or(`end_at.is.null,end_at.gte.${now}`)
    .order("created_at", { ascending: false });

  const { data: announcements, error } = await query;
  if (error) return res.json([]);
  if (!announcements || announcements.length === 0) return res.json([]);

  // Filter by audience
  const filtered = announcements.filter(a => {
    if (a.target_audience === "all_users") return true;
    if (a.target_audience === "new_users") return isNewUser;
    if (a.target_audience === "old_users") return !isNewUser;
    return false;
  });

  if (filtered.length === 0) return res.json([]);

  // Get dismissed/seen announcements for this user
  const ids = filtered.map(a => a.id);
  const { data: views } = await supabase
    .from("user_announcement_views")
    .select("announcement_id, dismissed_at")
    .eq("user_id", user.id)
    .in("announcement_id", ids);

  const dismissedIds = new Set((views || []).filter(v => v.dismissed_at).map(v => v.announcement_id));

  // Only return unseen/undismissed announcements
  const unseen = filtered.filter(a => !dismissedIds.has(a.id));

  // Mark as seen (upsert without dismissed_at)
  if (unseen.length > 0) {
    const seenRecords = unseen.map(a => ({
      user_id: user.id,
      announcement_id: a.id,
      seen_at: now,
    }));
    await supabase.from("user_announcement_views").upsert(seenRecords, {
      onConflict: "user_id,announcement_id",
      ignoreDuplicates: true,
    });
  }

  res.json(unseen);
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
  if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Master admin only" });

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
  if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Master admin only" });

  const { title, message, type, target_audience, is_active, button_text, button_link, dismissible, start_at, end_at, image_url } = req.body;
  if (!title?.trim() || !message?.trim()) return res.status(400).json({ error: "title and message required" });
  const validTypes = ["welcome", "announcement"];
  const validAudiences = ["new_users", "old_users", "all_users"];
  if (type && !validTypes.includes(type)) return res.status(400).json({ error: "Invalid type" });
  if (target_audience && !validAudiences.includes(target_audience)) return res.status(400).json({ error: "Invalid target_audience" });

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
    created_by: admin.id,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.patch("/api/master/announcements/:id", writeLimiter, async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Master admin only" });

  const { id } = req.params;
  const { title, message, type, target_audience, is_active, button_text, button_link, dismissible, start_at, end_at, image_url } = req.body;
  const supabase = getAdminClient();

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

  const { data, error } = await supabase.from("system_announcements").update(updates).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/master/announcements/:id", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin || !isMasterAdminId(admin.id)) return res.status(403).json({ error: "Master admin only" });

  const { id } = req.params;
  const supabase = getAdminClient();
  await supabase.from("system_announcements").delete().eq("id", id);
  res.json({ success: true });
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

  const result = articles.map(a => ({
    ...a,
    author_name: profileMap[a.author_id]?.full_name ?? null,
    author_email: profileMap[a.author_id]?.email ?? null,
  }));

  res.json(result);
});

app.patch("/api/admin/articles/:id/visibility", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Hanya master admin yang bisa mengubah visibilitas artikel" });

  const { id } = req.params;
  const { hidden } = req.body;
  if (typeof hidden !== "boolean") return res.status(400).json({ error: "hidden (boolean) diperlukan" });

  const supabase = getAdminClient();
  const { error } = await supabase.from("knowledge_base").update({ hidden }).eq("id", id);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });

  return res.json({ success: true, hidden });
});

app.post("/api/admin/articles/:id/review", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { id } = req.params;
  const { status } = req.body;
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });

  const supabase = getAdminClient();
  const { data: article } = await supabase.from("knowledge_base").select("author_id").eq("id", id).single();
  if (!article) return res.status(404).json({ error: "Article not found" });

  const { data: articleData } = await supabase.from("knowledge_base").select("title").eq("id", id).single();
  await supabase.from("knowledge_base").update({ status }).eq("id", id);

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
app.post("/api/admin/articles/bulk-review", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { ids, status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });

  const supabase = getAdminClient();
  const { data: articles } = await supabase.from("knowledge_base").select("id, title, author_id, status").in("id", ids);
  if (!articles?.length) return res.status(404).json({ error: "No articles found" });

  const pendingArticles = articles.filter(a => a.status === "pending");
  if (pendingArticles.length === 0) return res.json({ updated: 0 });

  const pendingIds = pendingArticles.map(a => a.id);
  await supabase.from("knowledge_base").update({ status }).in("id", pendingIds);

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

/* ── Admin: Input Article Directly ──────────────────── */
app.post("/api/admin/articles", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { title, content, category } = req.body;
  if (!title || !content || !category) return res.status(400).json({ error: "title, content, category required" });

  const { error } = await supabase.from("knowledge_base").insert({
    author_id: admin.id,
    title,
    content,
    category,
    status: "approved",
  });

  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ success: true });
});

app.delete("/api/admin/articles/:id", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { data: art } = await supabase.from("knowledge_base").select("status").eq("id", req.params.id).single();
  if (art?.status === "approved" && !isMasterAdminId(admin.id)) {
    return res.status(403).json({ error: "Hanya master admin yang bisa menghapus artikel yang sudah disetujui" });
  }

  await supabase.from("knowledge_base").delete().eq("id", req.params.id);
  res.json({ success: true });
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
      return res.status(403).json({ error: "Hanya master admin yang bisa menghapus artikel yang sudah disetujui" });
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
  const { title, content, category, keywords } = req.body;
  const updatePayload = { title, content, category };
  if (typeof keywords === "string") updatePayload.keywords = keywords.trim().slice(0, 500);
  const { error } = await supabase.from("knowledge_base").update(updatePayload).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  res.json({ success: true });
});

/* ── Master Admin: Reformat Single Article ──────────── */
app.post("/api/admin/articles/:id/reformat", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Hanya master admin" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key tidak dikonfigurasi" });

  const supabase = getAdminClient();
  const { data: art } = await supabase
    .from("knowledge_base")
    .select("id, title, content, category")
    .eq("id", req.params.id)
    .single();
  if (!art) return res.status(404).json({ error: "Artikel tidak ditemukan" });

  const prompt = `Kamu adalah editor konten untuk knowledge base mahasiswa Indonesia di Mesir.

Tugasmu: Rapikan dan format ulang konten artikel berikut menjadi Markdown yang terstruktur, rapi, dan mudah dibaca. JANGAN mengubah informasi — hanya perbaiki format dan struktur tulisan.

Judul artikel: "${art.title}"
Kategori: "${art.category}"

Konten asli:
<KONTEN>
${art.content.slice(0, 10000)}
</KONTEN>

Aturan format yang WAJIB diikuti:
- Gunakan ## untuk subjudul/bagian utama (JANGAN gunakan # karena judul sudah terpisah)
- Pisahkan setiap paragraf dengan satu baris kosong
- Gunakan - untuk poin-poin dalam list
- Gunakan 1. 2. 3. untuk langkah berurutan
- Gunakan **teks** untuk istilah penting
- Jangan gunakan tabel
- Tulis dalam bahasa Indonesia yang natural dan mudah dipahami

Kembalikan HANYA teks konten yang sudah diformat (bukan JSON, bukan penjelasan). Langsung isi kontennya saja.`;

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
  if (!admin) return res.status(403).json({ error: "Hanya master admin yang bisa melakukan reformat massal" });

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
    const prompt = `Kamu adalah editor konten untuk knowledge base mahasiswa Indonesia di Mesir.

Tugasmu: Rapikan dan format ulang konten artikel berikut menjadi Markdown yang terstruktur, rapi, dan mudah dibaca. JANGAN mengubah informasi — hanya perbaiki format dan struktur tulisan.

Judul artikel: "${art.title}"
Kategori: "${art.category}"

Konten asli:
<KONTEN>
${art.content.slice(0, 10000)}
</KONTEN>

Aturan format yang WAJIB diikuti:
- Gunakan ## untuk subjudul/bagian utama (JANGAN gunakan # karena judul sudah terpisah)
- Pisahkan setiap paragraf dengan satu baris kosong
- Gunakan - untuk poin-poin dalam list
- Gunakan 1. 2. 3. untuk langkah berurutan
- Gunakan **teks** untuk istilah penting
- Jangan gunakan tabel
- Jika konten sudah cukup bagus, bisa pertahankan sebagian besar strukturnya
- Tulis dalam bahasa Indonesia yang natural dan mudah dipahami

Kembalikan HANYA teks konten yang sudah diformat (bukan JSON, bukan penjelasan apapun). Langsung isi kontennya saja.`;

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

/* ── Master Admin: Waitlist Pro ──────────────────────── */
app.get("/api/admin/waitlist", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Hanya master admin yang bisa melihat waitlist" });

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
  if (!admin) return res.status(403).json({ error: "Hanya master admin yang bisa memberikan akses Pro" });

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
  if (!admin) return res.status(403).json({ error: "Hanya master admin yang bisa mencabut akses Pro" });

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
  if (!admin) return res.status(403).json({ error: "Hanya master admin yang bisa mengekspor data" });

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
  if (!admin) return res.status(403).json({ error: "Hanya master admin yang bisa mengekspor data" });

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
  const truncated = cleanText.slice(0, 14000);
  const fileNote = filename ? ` dari file "${filename}"` : "";
  const ocrNote = isOcr ? "\nCatatan: Teks ini berasal dari OCR (scan dokumen), mungkin ada noise/karakter aneh — abaikan noise, fokus pada informasi yang bermakna." : "";

  const prompt = `Kamu adalah asisten yang membantu mengorganisasi informasi tentang kehidupan mahasiswa Indonesia di Mesir (Masisir).

Diberikan teks berikut${fileNote}:${ocrNote}

<TEKS>
${truncated}
</TEKS>

Tugasmu: Baca seluruh teks, lalu identifikasi dan ekstrak SEMUA topik informasi yang berbeda. Pisahkan menjadi artikel terstruktur yang siap dikirim ke knowledge base.

Aturan penting:
- Setiap artikel fokus pada SATU topik
- Tulis ulang konten agar jelas, rapi, dan informatif dalam bahasa Indonesia yang natural (minimal 80 kata per artikel)
- Jika teks mengandung langkah-langkah/prosedur, gunakan article_type "step_by_step", selainnya "narrative"
- Jika hanya ada satu topik dalam teks, buat satu artikel saja
- Jangan biarkan array articles kosong — selama ada informasi apapun yang berguna, buat artikelnya

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

Kategori yang tersedia (pilih yang paling sesuai):
- "Administrasi" — iqomah, visa, paspor, KTP, surat-surat resmi
- "Akademik" — perkuliahan Al-Azhar, pendaftaran, ujian, beasiswa
- "Kehidupan Mesir" — tips sehari-hari, keamanan, budaya, bahasa
- "Transport" — metro, taksi, microbus, uber, rute
- "Tempat Tinggal" — sewa flat, lokasi, harga, kontrak
- "Kuliner" — restoran halal, masakan, harga makanan, dapur

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
        max_tokens: 8000,
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

app.post("/api/articles", writeLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Login diperlukan" });

  const supabase = getAdminClient();

  // Verify contributor/admin role server-side
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const hasAccess = roles?.some(r => ["contributor", "senior_contributor", "admin"].includes(r.role));
  if (!hasAccess) return res.status(403).json({ error: "Hanya kontributor yang bisa mengirim artikel" });

  const { title, content, category, article_type, keywords: rawKeywords } = req.body;
  if (!title?.trim() || !content?.trim() || !category) return res.status(400).json({ error: "title, content, category required" });
  if (title.trim().length > 200) return res.status(400).json({ error: "Judul terlalu panjang (maks 200 karakter)" });
  if (content.trim().length > 50000) return res.status(400).json({ error: "Konten terlalu panjang (maks 50.000 karakter)" });
  const validCategories = ["Administrasi", "Akademik", "Kehidupan Mesir", "Transport", "Tempat Tinggal", "Kuliner"];
  if (!validCategories.includes(category)) return res.status(400).json({ error: "Kategori tidak valid" });
  const validTypes = ["narrative", "step_by_step"];
  const safeType = validTypes.includes(article_type) ? article_type : "narrative";
  const safeKeywords = typeof rawKeywords === "string" ? rawKeywords.trim().slice(0, 500) : "";

  const payload = { author_id: user.id, title: title.trim(), content: content.trim(), category, article_type: safeType, keywords: safeKeywords };
  const { data, error } = await supabase.from("knowledge_base").insert(payload).select().single();
  if (error) {
    if (error.message?.includes("article_type") || error.message?.includes("keywords")) {
      const { data: d2, error: e2 } = await supabase.from("knowledge_base").insert({ author_id: user.id, title: title.trim(), content: content.trim(), category }).select().single();
      if (e2) return res.status(500).json({ error: e2.message });
      return res.json(d2);
    }
    return res.status(500).json({ error: sanitizeErr(error) });
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

app.post("/api/threads", writeLimiter, async (req, res) => {
  const user = await verifyAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { title, content, category } = req.body;
  if (!title?.trim() || !content?.trim() || !category) return res.status(400).json({ error: "title, content, category required" });
  if (title.trim().length > 200) return res.status(400).json({ error: "Judul terlalu panjang (maks 200 karakter)" });
  if (content.trim().length > 10000) return res.status(400).json({ error: "Konten terlalu panjang (maks 10.000 karakter)" });
  const valid = ["Administrasi", "Akademik", "Kehidupan Mesir", "Transport", "Tempat Tinggal", "Kuliner"];
  if (!valid.includes(category)) return res.status(400).json({ error: "Invalid category" });

  const supabase = getAdminClient();
  const { data, error } = await supabase.from("threads")
    .insert({ user_id: user.id, title: title.trim(), content: content.trim(), category })
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

  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "content required" });
  if (content.trim().length > 2000) return res.status(400).json({ error: "Balasan terlalu panjang (maks 2.000 karakter)" });

  const supabase = getAdminClient();
  const { id } = req.params;
  const { data: thread } = await supabase.from("threads").select("id").eq("id", id).single();
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const { data, error } = await supabase.from("thread_replies")
    .insert({ thread_id: id, user_id: user.id, content: content.trim() })
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
      .limit(20),
    supabase
      .from("knowledge_base")
      .select("id, title, category, article_type, vote_count, created_at, author_id")
      .eq("status", "approved")
      .neq("hidden", true)
      .order("vote_count", { ascending: false })
      .limit(20),
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
    if (revised_answer?.trim()) {
      const questionSnippet = (user_question || "Pertanyaan tidak diketahui").slice(0, 140);
      const kbTitle = `[Koreksi AI] ${questionSnippet}`;
      const kbContent = [
        user_question ? `**Pertanyaan yang dilaporkan:**\n${user_question.slice(0, 600)}` : null,
        `**Jawaban yang diusulkan:**\n${revised_answer.trim()}`,
        `---\n*Diajukan sebagai koreksi atas jawaban AI. ID Laporan: ${reportId}*`,
      ].filter(Boolean).join("\n\n");
      const { error: kbErr } = await supabase.from("knowledge_base").insert({
        author_id: user.id,
        title: kbTitle,
        content: kbContent,
        category: "Administrasi",
        status: "pending",
        article_type: "narrative",
        keywords: "koreksi, ai correction, perbaikan",
      });
      if (kbErr) console.error(`[REPORT] Failed to create KB revision entry: ${kbErr.message}`);
      else console.log(`[REPORT] Revision KB entry created from report ${reportId}`);
    }

    res.json({ success: true, id: reportId, has_revision: !!revised_answer?.trim() });
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

-- Article type column
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS article_type TEXT NOT NULL DEFAULT 'narrative'
  CHECK (article_type IN ('narrative', 'step_by_step'));

-- Hidden flag for articles (master admin can hide from public leaderboard, AI still uses them)
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- Memory type + long-term flag (Phase 6: typed memory — safe to re-run)
ALTER TABLE public.user_memories ADD COLUMN IF NOT EXISTS memory_type TEXT NOT NULL DEFAULT 'context_memory';
ALTER TABLE public.user_memories ADD COLUMN IF NOT EXISTS is_long_term BOOLEAN NOT NULL DEFAULT false;

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

  const { rating, intent, confidence, messageTs } = req.body;
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
    .select("intent, kb_strength, had_kb, had_pinned, had_wiki, had_ddg, confidence_level, external_tier, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: sanitizeErr(error) });
  // Aggregate: count combinations
  const agg = {};
  for (const row of data ?? []) {
    const key = `${row.intent}__${row.kb_strength}__${row.confidence_level}`;
    if (!agg[key]) agg[key] = { intent: row.intent, kb_strength: row.kb_strength, confidence_level: row.confidence_level, had_kb: 0, had_wiki: 0, had_ddg: 0, had_pinned: 0, total: 0 };
    agg[key].total++;
    if (row.had_kb)     agg[key].had_kb++;
    if (row.had_wiki)   agg[key].had_wiki++;
    if (row.had_ddg)    agg[key].had_ddg++;
    if (row.had_pinned) agg[key].had_pinned++;
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
    supabase.from("intel_retrieval_stats").select("had_kb, had_wiki, had_ddg, had_pinned, confidence_level").limit(500),
  ]);

  // Overall satisfaction rate
  const totalRatings = (ratingsRaw ?? []).length;
  const positiveRatings = (ratingsRaw ?? []).filter(r => r.rating === 1).length;
  const satisfactionRate = totalRatings > 0 ? +(positiveRatings / totalRatings * 100).toFixed(1) : null;

  // Source usage breakdown
  const rt = retrievalRaw ?? [];
  const sourceBreakdown = {
    kb_usage_pct:     rt.length > 0 ? +(rt.filter(r => r.had_kb).length     / rt.length * 100).toFixed(1) : null,
    wiki_usage_pct:   rt.length > 0 ? +(rt.filter(r => r.had_wiki).length   / rt.length * 100).toFixed(1) : null,
    ddg_usage_pct:    rt.length > 0 ? +(rt.filter(r => r.had_ddg).length    / rt.length * 100).toFixed(1) : null,
    pinned_usage_pct: rt.length > 0 ? +(rt.filter(r => r.had_pinned).length / rt.length * 100).toFixed(1) : null,
    total_turns:      rt.length,
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

/* ── Global JSON error handler ───────────────────────── */
// Must be registered AFTER all routes. Ensures all unhandled errors
// return JSON (not Express's default HTML page) so the client never
// sees "Request failed" due to a non-JSON error body.
app.use((err, req, res, _next) => {
  console.error("[UNHANDLED ERROR]", req.method, req.path, err.message);
  res.status(err.status || err.statusCode || 500).json({
    error: err.message || "Internal server error",
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
    "ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;",
    "ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS keywords TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE public.user_memories ADD COLUMN IF NOT EXISTS memory_type TEXT NOT NULL DEFAULT 'context_memory';",
    "ALTER TABLE public.user_memories ADD COLUMN IF NOT EXISTS is_long_term BOOLEAN NOT NULL DEFAULT false;",
    "ALTER TABLE public.intel_retrieval_stats ADD COLUMN IF NOT EXISTS had_perplexity BOOLEAN NOT NULL DEFAULT false;",
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

/* ── Global error handler (must be last middleware) ─── */
// Catches any unhandled errors — never exposes stack traces or tech info.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[UNHANDLED]", req.method, req.path, err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Terjadi kesalahan, silakan coba lagi." });
});

// On Vercel (serverless) we export the app; listen() is only called in local dev.
if (!process.env.VERCEL) {
  checkRequiredTables();
  runColumnMigrations();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AINA API server running on port ${PORT}`);
  });
}

export default app;
