import express from "express";
import cors from "cors";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RATES_FILE = join(__dirname, "rates.json");

function getRates() {
  try {
    if (fs.existsSync(RATES_FILE)) return JSON.parse(fs.readFileSync(RATES_FILE, "utf8"));
  } catch {}
  return { egpToIdr: 245, usdToIdr: 15800 };
}
function saveRates(rates) {
  fs.writeFileSync(RATES_FILE, JSON.stringify(rates, null, 2));
}

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://alibsjhwmturwfadqkkz.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function verifyAdminUser(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const isAdmin = roles?.some(r => r.role === "admin");
  if (!isAdmin) return null;
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

/* ── AI Chat ─────────────────────────────────────────── */
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });

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

  const systemPrompt = `Kamu adalah AINA, asisten AI cerdas untuk mahasiswa Indonesia yang sedang belajar di Mesir (Masisir).

Keahlianmu meliputi:
- Informasi administrasi: Iqomah, Paspor, Visa Mesir, VOA, pendaftaran kuliah
- Kehidupan di Mesir: transportasi, kuliner halal, tempat tinggal, biaya hidup
- Informasi Al-Azhar dan universitas lainnya di Mesir
- Tips dan panduan sehari-hari untuk mahasiswa di Kairo dan sekitarnya
- Kurs mata uang EGP, IDR, USD

Jawab dalam Bahasa Indonesia yang ramah, informatif, dan mudah dipahami. Gunakan format markdown (tebal, poin, dll) agar mudah dibaca. Jika kamu tidak yakin tentang sesuatu, katakan dengan jujur.${knowledgeContext}`;

  console.log(`Chat: found ${articles.length} relevant articles for query: "${lastUserMessage.slice(0, 60)}"`);

  let lastError = null;
  for (const model of MODELS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
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
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content || "Maaf, tidak ada respons.";
        const reply = raw
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
        console.log(`Responded using model: ${model}`);
        return res.json({ reply, model });
      }
      const errBody = await response.text();
      console.warn(`Model ${model} failed (${response.status}):`, errBody.slice(0, 200));
      lastError = errBody;
      if (response.status === 401 || response.status === 403) break;
    } catch (err) {
      console.warn(`Model ${model} timed out or errored:`, err.message);
      lastError = err.message;
    } finally {
      clearTimeout(timeout);
    }
  }

  return res.status(503).json({ error: "Semua model AI sedang sibuk. Coba lagi dalam beberapa detik.", detail: lastError });
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

  const { data, error } = await supabase.from("knowledge_base").insert({
    author_id: admin.id,
    title,
    content,
    category,
    status: "approved",
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
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
  const { data, error } = await supabase.from("knowledge_base").update({ title, content, category }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/* ─── Rates Endpoints ────────────────────────────────── */
app.get("/api/rates", (req, res) => {
  res.json(getRates());
});

app.post("/api/admin/rates", async (req, res) => {
  const admin = await verifyAdminUser(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: "Unauthorized" });
  const { egpToIdr, usdToIdr } = req.body;
  if (typeof egpToIdr !== "number" || typeof usdToIdr !== "number") {
    return res.status(400).json({ error: "egpToIdr and usdToIdr harus berupa angka" });
  }
  const rates = { egpToIdr, usdToIdr };
  saveRates(rates);
  res.json({ success: true, rates });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AINA API server running on port ${PORT}`);
});
