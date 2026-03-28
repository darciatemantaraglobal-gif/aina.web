/**
 * focusAiService.js
 * AI Daily Focus: build prompt → call model → parse response
 *
 * Exported functions:
 *   buildPrompt({ mode, userInput, pendingFocus, urgentAdmin, history })
 *   parseResponse(raw)  → [{ title, description, priority }] | null
 *   generateFocus({ mode, userInput, pendingFocus, urgentAdmin, history })
 *     → { items: [...] }   throws on AI/network error
 */

const MODEL       = "google/gemini-2.0-flash-001";
const MAX_TOKENS  = 600;
const TEMPERATURE = 0.5;
const REFERER     = process.env.CLIENT_URL || "https://ainalabs.pro";

// ── A. buildPrompt ───────────────────────────────────────────────────────────

/**
 * @param {"ai_assist"|"ai_suggest"} mode
 * @param {string}   [userInput]      — hanya untuk ai_assist
 * @param {object[]} [pendingFocus]   — hanya untuk ai_suggest
 * @param {object[]} [urgentAdmin]    — hanya untuk ai_suggest
 * @param {object[]} [history]        — hanya untuk ai_suggest
 */
export function buildPrompt({ mode, userInput = "", pendingFocus = [], urgentAdmin = [], history = [] }) {
  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const FORMAT = `[
  { "title": "...", "description": "...", "priority": 1 },
  { "title": "...", "description": "...", "priority": 2 }
]`;

  const RULES_COMMON = `- Maksimal 3 fokus
- Gunakan bahasa singkat, jelas, dan actionable — seperti teman, bukan sistem
- Jangan buat fokus yang terlalu besar atau abstrak
- Format respons HARUS berupa JSON array, tidak ada teks lain di luar JSON`;

  if (mode === "ai_assist") {
    return `Kamu adalah AINA, asisten pintar mahasiswa Indonesia di Mesir.
Hari ini: ${today}.

Input dari mahasiswa:
"${userInput}"

Tugasmu: ubah input di atas menjadi TEPAT 1–3 fokus harian yang rapi, realistis, dan actionable.

Aturan:
${RULES_COMMON}
- Prioritaskan yang paling berdampak dan paling mungkin diselesaikan hari ini
- Pecah tugas besar menjadi versi yang lebih kecil dan realistis
- Jangan terlalu formal, tapi tetap jelas
- "description" boleh null jika tidak perlu penjelasan tambahan

Format respons:
${FORMAT}`;
  }

  // mode === "ai_suggest"
  const urgentList = urgentAdmin.slice(0, 3)
    .map(a => `- ${a.title} (${a.category}${a.due_date ? `, tenggat ${a.due_date}` : ""})`)
    .join("\n") || "Tidak ada.";

  const pendingList = pendingFocus.slice(0, 3)
    .map(f => `- ${f.title}`)
    .join("\n") || "Tidak ada.";

  const historyList = history.slice(0, 5)
    .map(f => `- [${f.status}] ${f.title} (${f.focus_date})`)
    .join("\n") || "Belum ada riwayat.";

  return `Kamu adalah AINA, asisten pintar mahasiswa Indonesia di Mesir.
Hari ini: ${today}.

Konteks mahasiswa ini:
Fokus yang belum selesai dari sebelumnya:
${pendingList}

Urusan penting/dokumen yang masih pending atau urgent:
${urgentList}

Riwayat fokus terakhir:
${historyList}

Tugasmu: buat TEPAT 1–3 rekomendasi fokus harian yang realistis untuk hari ini.

Aturan:
${RULES_COMMON}
- Prioritaskan: 1 tugas utama + 1 tugas administratif jika ada + 1 tugas ringan jika realistis
- Hindari memberikan terlalu banyak beban

Format respons:
${FORMAT}`;
}

// ── B. parseResponse ─────────────────────────────────────────────────────────

/**
 * Parse raw JSON string from model into clean focus array.
 * @returns {Array<{title:string, description:string|null, priority:number}>|null}
 */
export function parseResponse(raw) {
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return null;

    return parsed
      .filter(item => item && typeof item.title === "string" && item.title.trim())
      .slice(0, 3)
      .map((item, i) => ({
        title:       item.title.trim(),
        description: item.description?.trim() || null,
        priority:    typeof item.priority === "number" ? item.priority : i + 1,
      }));
  } catch {
    return null;
  }
}

// ── C. generateFocus ─────────────────────────────────────────────────────────

/**
 * Full pipeline: build prompt → call OpenRouter → parse response.
 * @throws {Error} if AI unavailable or parse fails
 * @returns {{ items: Array<{title, description, priority}> }}
 */
export async function generateFocus({ mode, userInput, pendingFocus, urgentAdmin, history }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const prompt = buildPrompt({ mode, userInput, pendingFocus, urgentAdmin, history });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization":  `Bearer ${apiKey}`,
      "Content-Type":   "application/json",
      "HTTP-Referer":   REFERER,
    },
    body: JSON.stringify({
      model:       MODEL,
      messages:    [{ role: "user", content: prompt }],
      max_tokens:  MAX_TOKENS,
      temperature: TEMPERATURE,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenRouter error ${res.status}`);
  }

  const data  = await res.json();
  const raw   = data.choices?.[0]?.message?.content || "";
  const items = parseResponse(raw);

  if (!items || items.length === 0) {
    throw new Error("AI tidak bisa memproses input, coba lagi");
  }

  return { items };
}
