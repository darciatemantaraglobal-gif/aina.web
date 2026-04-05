/**
 * api/engine/sourcePriority.js
 * Source priority rules for AINA's 3-layer retrieval architecture.
 *
 * Priority order (highest → lowest):
 *   1. Pinned / Verified Admin Updates  (trust: 100)
 *   2. Knowledge Base articles          (trust:  90)
 *   3. Exchange Rate API (Frankfurter)  (trust:  85)
 *   4. Dorar.net hadith encyclopedia    (trust:  82)
 *   5. Perplexity real-time web search  (trust:  78)
 *   6. Wikipedia                        (trust:  60)
 *   7. DuckDuckGo instant answers       (trust:  35)
 *   8. Model knowledge (training data)  (trust:  20)
 */

import { WIKI_SKIP_PATTERNS } from "./utils.js";

/* ── Trust score registry ──────────────────────────────────────────────────── */

export const SOURCE_TRUST_SCORES = {
  pinned_update:   100,
  kb_article:       90,
  exchange_rate:    85,
  dorar:            82,
  perplexity:       78,
  wikipedia:        60,
  duckduckgo:       35,
  model_knowledge:  20,
};

/* ── KB strength assessment ────────────────────────────────────────────────── */

/**
 * Assess how well the Knowledge Base covers a query based on retrieved articles.
 *
 * @param {Array} articles - Articles returned by fetchRelevantArticles()
 * @returns {"strong" | "weak" | "absent"}
 */
export function assessKBStrength(articles) {
  if (!articles || articles.length === 0) return "absent";
  const totalChars = articles.reduce((sum, a) => sum + (a.content?.length ?? 0), 0);
  if (articles.length >= 2 || totalChars >= 800) return "strong";
  return "weak";
}

/* ── Currency query detection ──────────────────────────────────────────────── */

/**
 * Detect if a query is asking about exchange rates or currency conversion.
 * These queries MUST use the real-time Frankfurter API — never let the model
 * invent exchange rate numbers from its training data.
 */
export function isCurrencyQuery(text) {
  const kw = [
    "kurs", "rate", "nilai tukar", "exchange", "pound", "egp",
    "idr", "rupiah", "dollar", "usd", "eur", "euro", "tukar",
    "konversi", "berapa rupiah", "berapa pound", "mata uang", "valuta",
  ];
  const lower = text.toLowerCase();
  return kw.some(k => lower.includes(k));
}

/* ── Query type classifier ─────────────────────────────────────────────────── */

/**
 * Classify query into one of three routing types.
 * Must be called AFTER KB assessment so kbStrength is available.
 *
 * Returns:
 *   "currency"  → exchange API only; model must never invent numbers
 *   "dynamic"   → current-role or time-sensitive → Perplexity primary
 *   "general"   → everything else → Perplexity (weak/absent KB) then Wiki/DDG
 */
export function classifyQueryType(intentPrimary, kbStrength, query) {
  if (isCurrencyQuery(query)) return "currency";

  const dynamic =
    /\bsiapa\b.{0,50}\b(presiden|perdana menteri|menteri|wakil presiden|rektor|direktur|ceo|gubernur|walikota|bupati|kepala|ketua|sekjen|paus|raja|ratu|panglima|kapolri|jaksa agung|chairman|pemimpin)\b/i.test(query)
    || /\b(presiden|menteri|rektor|direktur|ceo|gubernur|ketua|kepala)\b.{0,30}\bsiapa\b/i.test(query)
    || /\b(sekarang|terbaru|terkini|saat ini|hari ini|bulan ini|tahun ini|2024|2025|2026|kebijakan baru|aturan terbaru|perubahan|berubah|update|berita|baru-baru)\b/i.test(query);

  if (dynamic) return "dynamic";
  return "general";
}

/* ── External fetch decision rules ─────────────────────────────────────────── */

/**
 * Decide whether to run Wave 2 (Wikipedia / DuckDuckGo) fallback fetches.
 * These are only used when Perplexity is not configured at all.
 *
 * Rules:
 *   - casual / arabic_writing / fiqh intents → skip (not helped by web search)
 *   - KB strong → skip (internal knowledge is sufficient)
 *   - short/trivial query → skip
 *   - otherwise → fetch (KB absent or weak)
 */
export function shouldFetchExternal(intentPrimary, kbStrength, query) {
  const q = (query ?? "").trim();
  if (q.length < 8 || WIKI_SKIP_PATTERNS.test(q)) return false;
  if (intentPrimary === "casual") return false;
  if (intentPrimary === "arabic_writing") return false;
  if (intentPrimary === "fiqh") return false;
  if (kbStrength === "strong") return false;
  return true;
}

/**
 * Decide whether to call Perplexity for this query.
 * Perplexity is the PRIMARY external intelligence layer — always tried before
 * Wikipedia/DDG. This function has identical short-circuit rules so callers
 * can call both independently.
 */
export function needsPerplexity(intentPrimary, kbStrength, query) {
  const q = (query ?? "").trim();
  if (q.length < 8 || WIKI_SKIP_PATTERNS.test(q)) return false;
  if (intentPrimary === "casual") return false;
  if (intentPrimary === "arabic_writing") return false;
  if (intentPrimary === "fiqh") return false;
  if (kbStrength === "strong") return false;
  return true;
}

/* ── External trust level ──────────────────────────────────────────────────── */

/**
 * Compute the trust tier of whatever external context is actually being injected.
 * Used to refine confidence classification and emit structured log signals.
 *
 * @returns {{ tier: string, score: number, label: string } | null}
 */
export function computeExternalTrustLevel(wikiInjected, ddgInjected, perplexityInjected = false) {
  if (perplexityInjected) return { tier: "high",   score: SOURCE_TRUST_SCORES.perplexity, label: "Perplexity" };
  if (wikiInjected)       return { tier: "medium", score: SOURCE_TRUST_SCORES.wikipedia,  label: "Wikipedia" };
  if (ddgInjected)        return { tier: "low",    score: SOURCE_TRUST_SCORES.duckduckgo, label: "DuckDuckGo" };
  return null;
}

/* ── Confidence classifier ─────────────────────────────────────────────────── */

/**
 * Classify response confidence based on what context was actually retrieved.
 * Rule-based — no LLM call. Returns a hint injected into the system prompt.
 *
 * Confidence levels:
 *   "high_confidence"     → answer with full confidence
 *   "medium_confidence"   → light caveat allowed if natural
 *   "needs_verification"  → must include uncertainty signal; may hard-block
 *
 * @returns {{ level: string, hint: string }}
 */
export function classifyConfidence({
  hasKB, kbStrength = "absent", hasPinned, hasWiki, hasDDG,
  hasPerplexity = false, externalTrustTier = null, intent, query,
}) {
  const timeSensitive = /\b(sekarang|terbaru|terkini|saat ini|hari ini|bulan ini|tahun ini|2024|2025|2026|berubah|update|baru-baru|perubahan|kebijakan baru|berita)\b/i.test(query);

  const currentRoleQuery =
    /\bsiapa\b.{0,50}\b(presiden|perdana menteri|menteri|wakil presiden|rektor|direktur|ceo|gubernur|walikota|bupati|kepala|ketua|sekjen|sekretaris jenderal|paus|raja|ratu|panglima|kapolri|jaksa agung|chairman|chancellor|pemimpin|komisaris|wali kota)\b/i.test(query)
    || /\b(presiden|menteri|rektor|direktur|ceo|gubernur|ketua|kepala)\b.{0,30}\bsiapa\b/i.test(query);

  const historicalRole = /\b(pertama|ke-?\d+|pendiri|terdahulu|dahulu|dulu|mantan|eks|sebelumnya|almarhum|almarhumah|wafat|tokoh|founding|awal mula)\b/i.test(query);

  const generalKnowledge = /\b(siapa|apa itu|apa arti|artinya apa|apa yang dimaksud|definisi|pengertian|ibu kota|ibukota|jelaskan|bagaimana cara kerja|dalam bahasa|terjemahan|artinya|maksudnya|berapa lama|berapa hari|kapan|sejarah|asal usul|fungsi|manfaat)\b/i.test(query);

  // Admin-pinned updates → highest trust
  if (hasPinned) return { level: "high_confidence", hint: "" };

  // KB hit on stable procedure/factual intent → high trust
  if (hasKB && ["factual", "procedural", "confused_procedural", "confused"].includes(intent.primary)) {
    return { level: "high_confidence", hint: "" };
  }

  // Current role without historical modifier — dynamic, stale data is dangerous
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

  // Stable general knowledge — allow full confidence
  if (generalKnowledge && !timeSensitive && (!currentRoleQuery || historicalRole)) {
    return { level: "high_confidence", hint: "" };
  }

  // Time-sensitive without KB/pinned
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

  // Wikipedia injected (medium-trust external) — upgrade from needs_verification
  if (!hasKB && !hasPinned && externalTrustTier === "medium" && !currentRoleQuery) {
    return {
      level: "medium_confidence",
      hint: "\n\n**[Kepercayaan — SEDANG]** Jawaban ini berdasarkan Wikipedia. Boleh gunakan frasa ringan seperti 'berdasarkan Wikipedia' jika terasa natural — tapi jangan terlalu banyak disclaimer. Jika info bisa berubah, cukup 1 kalimat peringatan singkat di akhir.",
    };
  }

  // No context at all — weakest basis
  if (!hasKB && !hasPinned && !hasWiki && !hasDDG) {
    return {
      level: "needs_verification",
      hint: "\n\n**[Kepercayaan — PERLU_VERIFIKASI]** Jika jawaban ini mungkin sudah tidak akurat atau butuh konfirmasi, tambahkan 1 kalimat peringatan singkat dan natural di akhir. Jangan terdengar kaku atau defensif.",
    };
  }

  // KB with subjective intent — allow light basis phrasing
  if (hasKB && ["recommendation", "brainstorming"].includes(intent.primary)) {
    return {
      level: "medium_confidence",
      hint: "\n\n**[Kepercayaan — SEDANG]** Boleh gunakan frasa ringan seperti 'berdasarkan knowledge base AINA' — hanya jika terasa natural, jangan dipaksakan.",
    };
  }

  // Secondary source only (wiki or DDG, no KB)
  if (!hasKB && (hasWiki || hasDDG)) {
    return {
      level: "medium_confidence",
      hint: "\n\n**[Kepercayaan — SEDANG]** Boleh gunakan frasa ringan seperti 'berdasarkan informasi yang tersedia' — hanya jika terasa natural, jangan dipaksakan.",
    };
  }

  return { level: "medium_confidence", hint: "" };
}
