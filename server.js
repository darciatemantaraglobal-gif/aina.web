import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5000",
  "http://localhost:3000",
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://alibsjhwmturwfadqkkz.supabase.co";
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

/* ── Fetch relevant knowledge base articles ──────────── */
async function fetchRelevantArticles(userQuestion) {
  const supabase = getAdminClient();
  if (!supabase) return [];

  // Extract keywords from the question (words > 3 chars)
  const keywords = userQuestion
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);

  if (keywords.length === 0) {
    // No keywords — return a sample of recent approved articles
    const { data } = await supabase
      .from("knowledge_base")
      .select("title, content, category")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(5);
    return data ?? [];
  }

  // Search articles matching any keyword in title or content
  const { data: allApproved } = await supabase
    .from("knowledge_base")
    .select("title, content, category")
    .eq("status", "approved");

  if (!allApproved || allApproved.length === 0) return [];

  // Score each article by keyword matches
  const scored = allApproved.map(article => {
    const text = `${article.title} ${article.content}`.toLowerCase();
    const score = keywords.reduce((acc, kw) => acc + (text.includes(kw) ? 1 : 0), 0);
    return { ...article, score };
  });

  // Return top 5 articles with at least 1 match; if none match, return top 3 recent
  const matched = scored
    .filter(a => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (matched.length > 0) return matched;

  return allApproved.slice(0, 3);
}

const DAILY_FREE_LIMIT = 3;

/* ── Health check (UptimeRobot / Railway) ────────────── */
app.get("/api/ping", (_req, res) => {
  res.json({ status: "ok" });
});

/* ── AI Chat ─────────────────────────────────────────── */
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });

  // ── Rate limit: 3 messages/day for free users ──────────
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

        if ((count ?? 0) >= DAILY_FREE_LIMIT) {
          return res.status(429).json({
            error: "Batas chat harian tercapai",
            limitReached: true,
          });
        }
      }
    }
  }
  // ──────────────────────────────────────────────────────

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

  // Get last user message to search the knowledge base
  const lastUserMessage = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
  const articles = await fetchRelevantArticles(lastUserMessage);

  // Build knowledge base context block
  let knowledgeContext = "";
  if (articles.length > 0) {
    const articlesText = articles.map((a, i) =>
      `### Artikel ${i + 1}: ${a.title} [${a.category}]\n${a.content}`
    ).join("\n\n");
    knowledgeContext = `\n\n---\n## Knowledge Base AINA (Informasi dari Kontributor)\nGunakan informasi berikut sebagai referensi utama saat menjawab. Jika informasi yang dicari ada di sini, prioritaskan isi artikel ini di atas pengetahuan umummu.\n\n${articlesText}\n---`;
  }

  const systemPrompt = `Kamu adalah AINA, asisten AI untuk mahasiswa Indonesia di Mesir (Masisir).

Keahlianmu: administrasi (Iqomah, Paspor, Visa, VOA, pendaftaran kuliah), kehidupan di Mesir (transportasi, kuliner halal, tempat tinggal, biaya hidup), info Al-Azhar, tips sehari-hari di Kairo, kurs EGP/IDR/USD.

ATURAN KERAS — WAJIB DIIKUTI:
- Sesuaikan panjang jawaban dengan kebutuhan pertanyaan. Pertanyaan sederhana → jawab singkat 1-2 kalimat. Pertanyaan kompleks atau prosedural → jawab selengkap yang diperlukan sampai tuntas, jangan dipotong.
- DILARANG memberi pengantar, basa-basi, atau kesimpulan yang tidak diminta
- DILARANG mengulang pertanyaan user
- Gunakan poin/langkah bernomor jika ada urutan prosedur atau 3+ item; kalau bisa pakai kalimat, pakai kalimat
- Jika tidak tahu, jawab: "Maaf, saya belum punya info ini."
- WAJIB selesaikan jawaban sampai tuntas — jangan terpotong di tengah kalimat atau di tengah langkah${knowledgeContext}`;

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

  // Race all models in parallel — first to succeed wins, worst case ~12s not ~200s
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
          max_tokens: 3000,
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

/* ── Admin: List Users ───────────────────────────────── */
app.get("/api/admin/users", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
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

  if (status === "approved") {
    await supabase.from("user_roles").upsert({ user_id: request.user_id, role: "contributor" }, { onConflict: "user_id,role" });
    await supabase.from("profiles").update({ level: "Contributor" }).eq("user_id", request.user_id);
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

  await supabase.from("knowledge_base").update({ status }).eq("id", id);

  if (status === "approved") {
    const { data: profile } = await supabase.from("profiles").select("contribution_count").eq("user_id", article.author_id).single();
    if (profile) {
      const newCount = (profile.contribution_count || 0) + 1;
      const level = newCount >= 10 ? "Senior Contributor" : "Contributor";
      await supabase.from("profiles").update({ contribution_count: newCount, level }).eq("user_id", article.author_id);
      if (newCount >= 10) {
        await supabase.from("user_roles").upsert({ user_id: article.author_id, role: "senior_contributor" }, { onConflict: "user_id,role" });
      }
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AINA API server running on port ${PORT}`);
});
