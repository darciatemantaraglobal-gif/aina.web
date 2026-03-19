import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const app = express();
const PORT = process.env.PORT || 3001;

/* ── Security headers ────────────────────────────────── */
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // managed by Vite for the SPA
}));

/* ── CORS — exact origin matching only ──────────────── */
const allowedOrigins = new Set([
  process.env.CLIENT_URL,
  "http://localhost:5000",
  "http://localhost:3000",
  process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null,
].filter(Boolean));

// Also allow *.replit.dev and *.replit.app subdomains (exact suffix, not substring)
function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin / non-browser requests
  if (allowedOrigins.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname.endsWith(".replit.dev") || hostname.endsWith(".replit.app");
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
    const exists = buckets?.some(b => b.name === "avatars");
    if (!exists) {
      await supabase.storage.createBucket("avatars", { public: true, fileSizeLimit: 2097152 });
      console.log("Storage bucket 'avatars' created");
    }
  } catch (e) {
    console.warn("Storage init warning:", e.message);
  }
}
initStorage();

console.log(`Admin client: ${SUPABASE_URL ? "✓ configured" : "✗ missing SUPABASE_URL"}`);
console.log(`Service role: ${SERVICE_ROLE_KEY ? "✓ configured" : "✗ missing SERVICE_ROLE_KEY"}`);
console.log(`OpenRouter: ${process.env.OPENROUTER_API_KEY ? "✓ configured" : "✗ missing OPENROUTER_API_KEY"}`);
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

/* ── Fetch relevant knowledge base articles ──────────── */
async function fetchRelevantArticles(userQuestion) {
  const supabase = getAdminClient();
  if (!supabase) return [];

  const hasTypeCol = await detectArticleTypeCol(supabase);
  const selectCols = hasTypeCol
    ? "title, content, category, article_type"
    : "title, content, category";

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
  const orFilter = keywords
    .flatMap(kw => [`title.ilike.%${kw}%`, `content.ilike.%${kw}%`])
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

/* ── AI Chat ─────────────────────────────────────────── */
app.post("/api/chat", chatLimiter, async (req, res) => {
  // Auth is required — unauthenticated requests must not reach OpenRouter
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan untuk menggunakan chat" });

  const { messages, userProfile } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });
  if (messages.length > 50) return res.status(400).json({ error: "Terlalu banyak pesan dalam satu permintaan" });

  // Validate each message content length
  for (const m of messages) {
    if (typeof m?.content === "string" && m.content.length > 8000) {
      return res.status(400).json({ error: "Pesan terlalu panjang" });
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

  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id);
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

  const MODELS = [
    "meta-llama/llama-3.2-3b-instruct:free",
    "google/gemma-3-27b-it:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "openai/gpt-oss-20b:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "stepfun/step-3.5-flash:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "minimax/minimax-m2.5:free",
    "openai/gpt-oss-120b:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
  ];

  const lastUserMessage = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
  const [articles, pinnedUpdates] = await Promise.all([
    fetchRelevantArticles(lastUserMessage),
    fetchPinnedUpdates(),
  ]);

  // Build knowledge context with article-type-aware formatting hints
  let knowledgeContext = "";
  if (articles.length > 0) {
    const articlesText = articles.map((a, i) => {
      const typeHint = a.article_type === "step_by_step"
        ? " [FORMAT: Panduan Langkah-langkah — WAJIB jawab dalam format langkah bernomor: **Langkah 1**, **Langkah 2**, dst.]"
        : " [FORMAT: Informasi Umum — jawab dalam paragraf terstruktur]";
      return `### Artikel ${i + 1}: ${a.title} [${a.category}]${typeHint}\n${a.content}`;
    }).join("\n\n");
    knowledgeContext = `\n\n---\n## Knowledge Base AINA (Informasi dari Kontributor)\nINI ADALAH SUMBER UTAMA. Jawab HANYA berdasarkan artikel di bawah ini jika topiknya relevan. Perhatikan petunjuk FORMAT di setiap artikel dan ikuti dengan ketat. Jika menggunakan artikel ini, cantumkan judulnya sebagai sumber.\n\n${articlesText}\n---`;
  }

  // Build breaking/pinned updates context
  let pinnedContext = "";
  if (pinnedUpdates.length > 0) {
    const updatesText = pinnedUpdates.map(u => `**[${u.topic}]**: ${u.content}`).join("\n");
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
    if (parts.length > 0) {
      personalizationContext = `\n\n---\n## Profil User Saat Ini\n${parts.join("\n")}\nSesuaikan jawaban dengan konteks user ini. Jika user baru tiba (angkatan baru), prioritaskan info dasar. Jika user lama, berikan tips lebih mendalam.\n---`;
    }
  }

  const systemPrompt = `Kamu adalah AINA, asisten AI untuk mahasiswa Indonesia di Mesir (Masisir).

Keahlianmu: administrasi (Iqomah, Paspor, Visa, VOA, pendaftaran kuliah), kehidupan di Mesir (transportasi, kuliner halal, tempat tinggal, biaya hidup), info Al-Azhar, tips sehari-hari di Kairo, kurs EGP/IDR/USD.

ATURAN KERAS — WAJIB DIIKUTI:
- PRIORITAS JAWABAN: Gunakan Knowledge Base terlebih dahulu. Gunakan pengetahuan umum hanya jika topik tidak tercakup di Knowledge Base.
- IKUTI FORMAT dari petunjuk artikel: jika artikel bertipe Panduan Langkah-langkah, WAJIB gunakan **Langkah 1**, **Langkah 2**, dst. Jika bertipe Informasi Umum, gunakan paragraf.
- Jawab minimal 3 paragraf pendek atau 3 langkah — pastikan informasi tersampaikan jelas tapi tidak bertele-tele.
- Setiap paragraf/langkah fokus pada satu poin utama. Hindari pengulangan dan elaborasi berlebihan.
- Untuk syarat, dokumen, atau daftar ketentuan → gunakan format poin (bullet \`-\`) bukan paragraf.
- DILARANG menggunakan format tabel dalam jawaban apapun.
- Gunakan format Markdown yang rapi: judul bagian pakai **bold**, isi pakai paragraf atau poin.
- DILARANG memberi pengantar, basa-basi, atau kesimpulan yang tidak diminta.
- DILARANG mengulang pertanyaan user.
- Jika tidak tahu, jawab: "Maaf, saya belum punya info ini."
- WAJIB cantumkan sumber di akhir setiap jawaban dalam format: *Sumber: [nama sumber/instansi/artikel]* — jika dari knowledge base gunakan judul artikelnya, jika dari pengetahuan umum tulis "Pengetahuan umum", jika dari pengalaman komunitas tulis "Komunitas Masisir"${pinnedContext}${personalizationContext}${knowledgeContext}`;

  console.log(`Chat: found ${articles.length} relevant articles for query: "${lastUserMessage.slice(0, 60)}"`);

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

  const tryModel = async (model) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.REPLIT_DEV_DOMAIN || "https://aina.replit.app",
          "X-Title": "AINA - Asisten Masisir",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          max_tokens: 8000,
          temperature: 0.5,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("empty response");
      return { reply: content, model };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    const result = await Promise.any(MODELS.map(tryModel));
    console.log(`Responded using model: ${result.model}`);
    return res.json({ reply: cleanReply(result.reply), model: result.model });
  } catch {
    return res.status(503).json({ error: "Semua model AI sedang sibuk. Coba lagi dalam beberapa detik." });
  }
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
  const [{ data: profiles }, { data: allRoles }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("user_roles").select("user_id, role"),
  ]);

  const roleMap = {};
  (allRoles ?? []).forEach(r => {
    if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
    roleMap[r.user_id].push(r.role);
  });

  const users = (profiles ?? []).map(p => ({ ...p, roles: roleMap[p.user_id] ?? ["user"] }));
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
  const { status } = req.body;
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });

  const supabase = getAdminClient();
  const { data: request } = await supabase.from("contributor_requests").select("user_id").eq("id", id).single();
  if (!request) return res.status(404).json({ error: "Request not found" });

  await supabase.from("contributor_requests").update({ status }).eq("id", id);

  const userInfo = await getUserEmail(request.user_id);
  const appUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "https://aina.replit.app";

  if (status === "approved") {
    await supabase.from("user_roles").upsert({ user_id: request.user_id, role: "contributor" }, { onConflict: "user_id,role" });
    await supabase.from("profiles").update({ level: "Contributor" }).eq("user_id", request.user_id);
    await supabase.from("notifications").insert({
      user_id: request.user_id,
      title: "Selamat! Kamu jadi Kontributor 🎉",
      message: "Permintaanmu untuk menjadi kontributor telah disetujui. Kamu sekarang bisa menulis dan mengirim artikel ke Knowledge Base AINA.",
      type: "success",
    }).catch(() => {});
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
          ctaText: "Buka Dashboard AINA",
          ctaUrl: `${appUrl}/dashboard`,
        }),
      });
    }
  } else {
    await supabase.from("notifications").insert({
      user_id: request.user_id,
      title: "Permintaan kontributor ditolak",
      message: "Permintaanmu untuk menjadi kontributor belum bisa disetujui saat ini. Kamu tetap bisa menggunakan semua fitur AINA.",
      type: "warning",
    }).catch(() => {});
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

/* ── Admin: Knowledge Base ───────────────────────────── */
app.get("/api/admin/articles", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { status = "pending" } = req.query;
  const { data: articles } = await supabase
    .from("knowledge_base")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });

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
    : "https://aina.replit.app";
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
        }).catch(() => {});
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
              ctaUrl: `${appUrl}/dashboard`,
            }),
          });
        }
      } else {
        await supabase.from("notifications").insert({
          user_id: article.author_id,
          title: "Artikel kamu disetujui! ✅",
          message: `Artikel "${articleTitle}" telah disetujui dan kini tersedia di Knowledge Base AINA. Total kontribusimu: ${newCount} artikel.`,
          type: "success",
        }).catch(() => {});
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
              ctaText: "Lihat Knowledge Base",
              ctaUrl: `${appUrl}/dashboard`,
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
    }).catch(() => {});
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
          ctaUrl: `${appUrl}/dashboard`,
        }),
      });
    }
  }

  res.json({ success: true });
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

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete("/api/admin/articles/:id", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  await supabase.from("knowledge_base").delete().eq("id", req.params.id);
  res.json({ success: true });
});

/* ── Admin: Edit Article ──────────────────────────────── */
app.patch("/api/admin/articles/:id", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { title, content, category } = req.body;
  const { error } = await supabase.from("knowledge_base").update({ title, content, category }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
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
  if (error) return res.status(500).json({ error: error.message });
  if (!threads || threads.length === 0) return res.json([]);

  const authorIds = [...new Set(threads.map(t => t.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, avatar_url")
    .in("user_id", authorIds);

  const profileMap = {};
  (profiles ?? []).forEach(p => { profileMap[p.user_id] = p; });

  res.json(threads.map(t => ({
    ...t,
    author_name: profileMap[t.user_id]?.full_name ?? null,
    author_avatar: profileMap[t.user_id]?.avatar_url ?? null,
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
  if (error) return res.status(500).json({ error: error.message });
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
  const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", userIds);
  const profileMap = {};
  (profiles ?? []).forEach(p => { profileMap[p.user_id] = p; });

  res.json({
    ...thread,
    author_name: profileMap[thread.user_id]?.full_name ?? null,
    author_avatar: profileMap[thread.user_id]?.avatar_url ?? null,
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
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/threads/:id/replies/:replyId", async (req, res) => {
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

app.delete("/api/threads/:id", async (req, res) => {
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

/* ── Beta Feedback ───────────────────────────────────── */
const FEEDBACK_DIR = "./data";
const FEEDBACK_FILE = "./data/beta_feedback.json";

function loadFeedback() {
  if (!existsSync(FEEDBACK_DIR)) mkdirSync(FEEDBACK_DIR, { recursive: true });
  if (!existsSync(FEEDBACK_FILE)) return [];
  try { return JSON.parse(readFileSync(FEEDBACK_FILE, "utf8")); } catch { return []; }
}

function saveFeedback(items) {
  if (!existsSync(FEEDBACK_DIR)) mkdirSync(FEEDBACK_DIR, { recursive: true });
  writeFileSync(FEEDBACK_FILE, JSON.stringify(items, null, 2));
}

app.post("/api/feedback", feedbackLimiter, async (req, res) => {
  // Require authentication to prevent anonymous spam
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Login diperlukan untuk mengirim feedback" });

  const { type, message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message required" });
  if (message.trim().length > 2000) return res.status(400).json({ error: "Feedback terlalu panjang (maks 2.000 karakter)" });

  const validTypes = ["bug", "suggestion", "general"];
  const feedbackType = validTypes.includes(type) ? type : "general";

  let userEmail = null;
  let userId = null;
  const supabase = getAdminClient();
  if (supabase) {
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) {
      userEmail = user.email;
      userId = user.id;
    }
  }

  if (!userId) return res.status(401).json({ error: "Token tidak valid" });

  const entry = {
    id: Date.now().toString(),
    type: feedbackType,
    message: message.trim(),
    user_email: userEmail,
    user_id: userId,
    created_at: new Date().toISOString(),
  };

  const items = loadFeedback();
  items.unshift(entry);
  saveFeedback(items);

  console.log(`[FEEDBACK] [${feedbackType}] from ${userEmail}: ${message.slice(0, 80)}`);
  res.json({ success: true });
});

app.get("/api/admin/feedback", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const items = loadFeedback();
  res.json(items);
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
    return res.status(500).json({ error: error.message });
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

  if (error) return res.status(500).json({ error: error.message });
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

  if (error) return res.status(500).json({ error: error.message });
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

  if (error) return res.status(500).json({ error: error.message });
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

  if (error) return res.status(500).json({ error: error.message });
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

app.get("/api/admin/chats/:chatId/messages", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("chat_id", req.params.chatId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
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
  if (error) return res.status(500).json({ error: error.message });

  console.log(`[ADMIN] User ${userId} deleted by admin ${admin.email}`);
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

/* ── Report Message ──────────────────────────────────── */
app.post("/api/report-message", writeLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server not configured" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });

  const { message_id, message_content, reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: "reason required" });
  if (reason.trim().length > 500) return res.status(400).json({ error: "Alasan terlalu panjang (maks 500 karakter)" });

  try {
    const { data, error } = await supabase
      .from("message_reports")
      .insert({
        user_id: user.id,
        message_id: message_id || null,
        message_content: message_content?.slice(0, 2000) || null,
        reason: reason.trim(),
        status: "pending",
      })
      .select()
      .single();
    if (error) throw error;
    console.log(`[REPORT] New report by user ${user.id}: "${reason}"`);
    res.json({ success: true, id: data.id });
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
    const query = supabase
      .from("message_reports")
      .select("*, reporter:profiles!message_reports_user_id_fkey(full_name, email)")
      .order("created_at", { ascending: false });
    if (status !== "all") query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data ?? []);
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AINA API server running on port ${PORT}`);
});
