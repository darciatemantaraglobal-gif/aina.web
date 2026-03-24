import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";

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

/* ── Fetch user memories ─────────────────────────────── */
async function fetchUserMemories(userId) {
  const supabase = getAdminClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("user_memories")
      .select("id, memory")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error && (error.code === "42P01" || error.message?.includes("does not exist"))) {
      return []; // Table not yet created — degrade gracefully
    }
    return data ?? [];
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

    const extractionPrompt = `Dari percakapan berikut, ekstrak fakta-fakta penting yang perlu diingat tentang user untuk percakapan di masa depan. Contoh: nama panggilan, kota tempat tinggal di Mesir, jurusan/universitas, preferensi khusus yang disebutkan, situasi spesifik (baru tiba, mau ujian, dll).

Format output: JSON array of strings, masing-masing max 120 karakter. Jika tidak ada fakta baru yang perlu disimpan, kembalikan array kosong [].

ATURAN:
- Hanya fakta yang eksplisit disebutkan user dalam percakapan ini
- Maksimal 3 fakta baru dari satu percakapan
- Jangan duplikasi hal umum seperti "user mahasiswa Al-Azhar"
- Contoh valid: ["Tinggal di Hay Asyir", "Suka jawaban singkat", "Baru tiba Maret 2026", "Ambil jurusan Syariah Islamiyah"]
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
          max_tokens: 250,
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
      newMemories = parsed
        .filter(m => typeof m === "string" && m.trim().length > 5)
        .map(m => m.trim().slice(0, 150))
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
      newMemories.map(memory => ({ user_id: userId, memory }))
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

  const [rolesRes, userMemories] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id),
    fetchUserMemories(user.id),
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

  // Extract plain text from last user message (content may be string or multimodal array)
  const rawLastContent = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
  const lastUserMessage = Array.isArray(rawLastContent)
    ? (rawLastContent.find(p => p.type === "text")?.text ?? "")
    : rawLastContent;

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
    const chatStyle = sanitize(userProfile.chatStyle);
    const responseLength = sanitize(userProfile.responseLength);
    const userName = sanitize(userProfile.userName);
    if (userName) parts.push(`Panggil user dengan: "${userName}"`);
    if (parts.length > 0) {
      let styleNote = "";
      if (chatStyle === "formal") styleNote += "\nGunakan bahasa yang formal dan sopan dalam setiap jawaban.";
      else styleNote += "\nGunakan bahasa yang santai, akrab, dan bersahabat (bisa pakai 'kamu', 'nih', 'ya', dsb).";
      if (responseLength === "ringkas") styleNote += "\nBerikan jawaban yang RINGKAS dan to-the-point. Maksimal 3 poin/paragraf singkat.";
      else styleNote += "\nBerikan jawaban yang LENGKAP dan mendetail sesuai kebutuhan.";
      personalizationContext = `\n\n---\n## Profil & Preferensi User\n${parts.join("\n")}${styleNote}\nSesuaikan jawaban dengan konteks user ini. Jika user baru tiba (angkatan baru), prioritaskan info dasar. Jika user lama, berikan tips lebih mendalam.\n---`;
    }
  }

  let memoryContext = "";
  if (userMemories.length > 0) {
    const memList = userMemories.map(m => `- ${m.memory}`).join("\n");
    memoryContext = `\n\n---\n## Memori tentang User Ini\nKamu telah menyimpan hal-hal berikut tentang user ini dari percakapan sebelumnya. Gunakan untuk memberi jawaban yang lebih personal:\n${memList}\n---`;
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
- WAJIB cantumkan sumber di akhir setiap jawaban dalam format: *Sumber: [nama sumber/instansi/artikel]* — jika dari knowledge base gunakan judul artikelnya, jika dari pengetahuan umum tulis "Pengetahuan umum", jika dari pengalaman komunitas tulis "Komunitas Masisir"${pinnedContext}${memoryContext}${personalizationContext}${knowledgeContext}`;

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
          "HTTP-Referer": process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://aina.replit.app",
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
      if (!content) throw new Error("empty response");
      return { reply: content, model };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    const result = useVisionModel
      ? await tryModel(VISION_MODEL)
      : await Promise.any(MODELS.map(tryModel));
    const reply = cleanReply(result.reply);
    console.log(`Responded using model: ${result.model}`);
    res.json({ reply, model: result.model });
    // Fire-and-forget: extract memories from this conversation in the background
    setImmediate(() => extractAndSaveMemories(
      user.id,
      [...messages, { role: "assistant", content: reply }],
      apiKey
    ));
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
    return res.status(400).json({ error: err.message || "Gagal mengupload file" });
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
    return res.status(400).json({ error: err.message || "Gagal mengupload file" });
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
    return res.status(500).json({ error: "Gagal membuat URL upload: " + error.message });
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
  const { status } = req.body;
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });

  const supabase = getAdminClient();
  const { data: request } = await supabase.from("contributor_requests").select("user_id").eq("id", id).single();
  if (!request) return res.status(404).json({ error: "Request not found" });

  await supabase.from("contributor_requests").update({ status }).eq("id", id);

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
  if (error) return res.status(500).json({ error: error.message });

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

  if (error) return res.status(500).json({ error: error.message });
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
  if (error) return res.status(500).json({ error: error.message });

  res.json({ deleted: count ?? allowedIds.length });
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
    if (data.error) return res.status(500).json({ error: data.error.message || "AI error" });

    const newContent = data.choices?.[0]?.message?.content?.trim();
    if (!newContent || newContent.length < 50) return res.status(500).json({ error: "Hasil reformat kosong" });

    const { error } = await supabase
      .from("knowledge_base").update({ content: newContent }).eq("id", art.id);
    if (error) return res.status(500).json({ error: error.message });

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

  if (error) return res.status(500).json({ error: error.message });

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

  if (error) return res.status(500).json({ error: error.message });

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
  if (error) return res.status(500).json({ error: error.message });

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
      return res.status(502).json({ error: "Layanan AI error: " + (data.error.message || JSON.stringify(data.error)) });
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

  const { title, content, category, article_type } = req.body;
  if (!title?.trim() || !content?.trim() || !category) return res.status(400).json({ error: "title, content, category required" });
  if (title.trim().length > 200) return res.status(400).json({ error: "Judul terlalu panjang (maks 200 karakter)" });
  if (content.trim().length > 50000) return res.status(400).json({ error: "Konten terlalu panjang (maks 50.000 karakter)" });
  const validCategories = ["Administrasi", "Akademik", "Kehidupan Mesir", "Transport", "Tempat Tinggal", "Kuliner"];
  if (!validCategories.includes(category)) return res.status(400).json({ error: "Kategori tidak valid" });
  const validTypes = ["narrative", "step_by_step"];
  const safeType = validTypes.includes(article_type) ? article_type : "narrative";

  const payload = { author_id: user.id, title: title.trim(), content: content.trim(), category, article_type: safeType };
  const { data, error } = await supabase.from("knowledge_base").insert(payload).select().single();
  if (error) {
    if (error.message?.includes("article_type")) {
      const { data: d2, error: e2 } = await supabase.from("knowledge_base").insert({ author_id: user.id, title: title.trim(), content: content.trim(), category }).select().single();
      if (e2) return res.status(500).json({ error: e2.message });
      return res.json(d2);
    }
    return res.status(500).json({ error: error.message });
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
  if (error) return res.status(500).json({ error: error.message });
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
  if (error) return res.status(500).json({ error: error.message });
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

  if (error) return res.status(500).json({ error: error.message });
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
  if (error) return res.status(500).json({ error: error.message });

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
  if (error) return res.status(500).json({ error: error.message });

  console.log(`[ADMIN] User ${userId} BANNED by ${admin.email}`);
  res.json({ success: true });
});

app.post("/api/admin/users/:userId/unban", async (req, res) => {
  const admin = await verifyMasterAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });

  const { userId } = req.params;
  const supabase = getAdminClient();
  const { error } = await supabase.from("profiles").update({ is_banned: false }).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });

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
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed')),
  admin_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can insert own reports" ON public.message_reports FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admin can manage all reports" ON public.message_reports FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_message_reports_status ON public.message_reports(status, created_at DESC);`,

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
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  memory     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can manage own memories" ON public.user_memories FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_user_memories_user ON public.user_memories(user_id, created_at DESC);`,
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
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;`;

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
  try {
    const supabase = getAdminClient();
    await supabase.rpc("exec_sql", { sql: "ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;" });
  } catch {
    // RPC may not exist — silently skip; admin can run migration-sql manually
  }
}

// On Vercel (serverless) we export the app; listen() is only called in local dev.
if (!process.env.VERCEL) {
  checkRequiredTables();
  runColumnMigrations();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AINA API server running on port ${PORT}`);
  });
}

export default app;
