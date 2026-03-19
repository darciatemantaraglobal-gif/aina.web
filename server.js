import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5000",
  "http://localhost:3000",
  process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o)) || (process.env.REPLIT_DEV_DOMAIN && origin.includes("replit"))) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "5mb" }));

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


const _adminCache = new Map();
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

  _adminCache.set(token, { user, expiresAt: Date.now() + 5 * 60 * 1000 });
  return user;
}

async function verifyMasterAdmin(authHeader) {
  const user = await verifyAdminUser(authHeader);
  if (!user) return null;
  if (!MASTER_ADMIN_IDS.has(user.id)) return null;
  return user;
}

/* ── Fetch relevant knowledge base articles ──────────── */
async function fetchRelevantArticles(userQuestion) {
  const supabase = getAdminClient();
  if (!supabase) return [];

  const keywords = userQuestion
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);

  if (keywords.length === 0) {
    const { data } = await supabase
      .from("knowledge_base")
      .select("title, content, category")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(5);
    return data ?? [];
  }

  const { data: allApproved } = await supabase
    .from("knowledge_base")
    .select("title, content, category")
    .eq("status", "approved");

  if (!allApproved || allApproved.length === 0) return [];

  const scored = allApproved.map(article => {
    const text = `${article.title} ${article.content}`.toLowerCase();
    const score = keywords.reduce((acc, kw) => acc + (text.includes(kw) ? 1 : 0), 0);
    return { ...article, score };
  });

  const matched = scored
    .filter(a => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (matched.length > 0) return matched;
  return allApproved.slice(0, 3);
}

const DAILY_FREE_LIMIT = 3;

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
  const isMasterAdmin = MASTER_ADMIN_IDS.has(user.id);

  console.log(`[/api/me] user.id=${user.id} email=${user.email} isMasterAdmin=${isMasterAdmin} MASTER_ADMIN_IDS=${[...MASTER_ADMIN_IDS].join(",")}`);

  res.json({
    id: user.id,
    email: user.email,
    roles: roleList,
    isMasterAdmin,
  });
});

/* ── AI Chat ─────────────────────────────────────────── */
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });

  const supabaseAdmin = getAdminClient();
  const authHeader = req.headers.authorization;
  if (supabaseAdmin && authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
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
  const articles = await fetchRelevantArticles(lastUserMessage);

  let knowledgeContext = "";
  if (articles.length > 0) {
    const articlesText = articles.map((a, i) =>
      `### Artikel ${i + 1}: ${a.title} [${a.category}]\n${a.content}`
    ).join("\n\n");
    knowledgeContext = `\n\n---\n## Knowledge Base AINA (Informasi dari Kontributor)\nINI ADALAH SUMBER UTAMA. Jawab HANYA berdasarkan artikel di bawah ini jika topiknya relevan. Jangan gunakan pengetahuan umummu jika jawabannya sudah ada di sini. Jika menggunakan artikel ini, cantumkan judulnya sebagai sumber.\n\n${articlesText}\n---`;
  }

  const systemPrompt = `Kamu adalah AINA, asisten AI untuk mahasiswa Indonesia di Mesir (Masisir).

Keahlianmu: administrasi (Iqomah, Paspor, Visa, VOA, pendaftaran kuliah), kehidupan di Mesir (transportasi, kuliner halal, tempat tinggal, biaya hidup), info Al-Azhar, tips sehari-hari di Kairo, kurs EGP/IDR/USD.

ATURAN KERAS — WAJIB DIIKUTI:
- PRIORITAS JAWABAN: Gunakan Knowledge Base terlebih dahulu. Gunakan pengetahuan umum hanya jika topik tidak tercakup di Knowledge Base.
- Jawab minimal 3 paragraf pendek — pastikan informasi tersampaikan jelas tapi tidak bertele-tele.
- Setiap paragraf fokus pada satu poin utama. Hindari pengulangan dan elaborasi berlebihan.
- Untuk syarat, dokumen, atau daftar ketentuan → gunakan format poin (bullet \`-\`) bukan paragraf.
- DILARANG menggunakan format tabel dalam jawaban apapun.
- Gunakan format Markdown yang rapi: judul bagian pakai **bold**, isi pakai paragraf atau poin.
- DILARANG memberi pengantar, basa-basi, atau kesimpulan yang tidak diminta.
- DILARANG mengulang pertanyaan user.
- Jika tidak tahu, jawab: "Maaf, saya belum punya info ini."
- WAJIB cantumkan sumber di akhir setiap jawaban dalam format: *Sumber: [nama sumber/instansi/artikel]* — jika dari knowledge base gunakan judul artikelnya, jika dari pengetahuan umum tulis "Pengetahuan umum", jika dari pengalaman komunitas tulis "Komunitas Masisir"${knowledgeContext}`;

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
app.post("/api/upload-avatar", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminClient();
  if (!supabase) return res.status(500).json({ error: "Server not configured" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });

  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const ext = (mimeType || "image/jpeg").split("/")[1] || "jpg";
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("avatars")
    .upload(path, buffer, { contentType: mimeType || "image/jpeg", upsert: true });

  if (uploadErr) return res.status(500).json({ error: uploadErr.message });

  const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
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

/* ── Admin: Set User Role ────────────────────────────── */
app.post("/api/admin/users/:userId/role", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
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
  const { data } = await supabase.from("knowledge_base").select("*").eq("status", status).order("created_at", { ascending: false });
  res.json(data ?? []);
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

app.post("/api/feedback", async (req, res) => {
  const { type, message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message required" });

  const validTypes = ["bug", "suggestion", "general"];
  const feedbackType = validTypes.includes(type) ? type : "general";

  let userEmail = null;
  let userId = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const supabase = getAdminClient();
    if (supabase) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userEmail = user.email;
        userId = user.id;
      }
    }
  }

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

  console.log(`[FEEDBACK] [${feedbackType}] from ${userEmail ?? "anonymous"}: ${message.slice(0, 80)}`);
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


app.listen(PORT, "0.0.0.0", () => {
  console.log(`AINA API server running on port ${PORT}`);
});
