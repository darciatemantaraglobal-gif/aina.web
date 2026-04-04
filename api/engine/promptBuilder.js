/**
 * api/engine/promptBuilder.js
 * Builds the complete system prompt for AINA's AI response engine.
 *
 * Architecture:
 *   Each context block is built by a dedicated function (pure, testable).
 *   buildSystemPrompt() assembles all blocks in the correct priority order.
 *
 * Context injection order (highest priority first):
 *   Pinned Updates → Memory → Personalization → Knowledge Base →
 *   Exchange Rate → Dorar (hadith) → Perplexity → Wikipedia → DuckDuckGo
 */

import { trimToSentence } from "./utils.js";
import { SOURCE_TRUST_SCORES } from "./sourcePriority.js";

/* ── Context block builders ──────────────────────────────────────────────── */

/**
 * Build the Knowledge Base context block.
 * KB articles are the highest-trust internal source (score: 90).
 * Each article type triggers a specific format instruction to the model.
 *
 * @param {Array} articles - Retrieved KB articles from fetchRelevantArticles()
 * @returns {string}
 */
export function buildKnowledgeContext(articles) {
  if (!articles || articles.length === 0) return "";

  const articlesText = articles.map((a, i) => {
    // Detect muqorror/kitab articles by Arabic character density.
    // Require ≥80 total Arabic chars AND ≥12% of content to avoid false-positives
    // from articles that just quote a short Hadith/Quranic verse inline.
    const arabicCharCount = (a.content.match(/[\u0600-\u06FF]/g) || []).length;
    const hasArabicText = arabicCharCount >= 80 && (arabicCharCount / a.content.length) >= 0.12;

    const typeHint = hasArabicText
      ? " [FORMAT: Muqorror/Kitab Arab — ATURAN WAJIB: (1) Kutip paragraf Arab yang relevan persis dari artikel sebagai blockquote (awali dengan '>'), (2) Tulis terjemahan/maknanya dalam Bahasa Indonesia di bawah kutipan, (3) Jelaskan maksud dan poin-poin pentingnya. DILARANG menjelaskan tanpa menampilkan teks Arabnya terlebih dahulu.]"
      : a.article_type === "step_by_step"
        ? " [FORMAT: Panduan Langkah-langkah — WAJIB jawab dalam format langkah bernomor: **Langkah 1**, **Langkah 2**, dst.]"
        : " [FORMAT: Informasi Umum — jawab dalam paragraf terstruktur]";

    const cleanedContent = trimToSentence(a.content, 2000);
    if (cleanedContent.length < a.content.length) {
      console.log(`[CtxClean] Article "${a.title}": ${a.content.length} → ${cleanedContent.length} chars`);
    }

    const displayTitle = a.hidden
      ? `Referensi Internal [${a.category}]`
      : `${a.title} [${a.category}]`;

    const mapsLine     = a.maps_url        ? `\n📍 Lokasi: ${a.maps_url}`             : "";
    const summaryLine  = a.summary?.trim() ? `\n**Ringkasan:** ${a.summary.trim()}\n`  : "";
    const notesLine    = a.important_notes?.trim()
      ? `\n\n⚠️ **Catatan Penting:** ${a.important_notes.trim()}`
      : "";

    return `### Artikel ${i + 1}: ${displayTitle}${typeHint}${summaryLine}\n${cleanedContent}${mapsLine}${notesLine}`;
  }).join("\n\n");

  // Detect potentially conflicting articles using semantic overlap:
  // Two articles conflict if they (a) share the same category AND (b) share 3+ content keywords
  // — indicating they cover the SAME subtopic from different angles (not just same broad category).
  // Articles in the same category but covering distinct subtopics are treated as complementary.
  function extractContentKeywords(text) {
    const stopWords = new Set(["yang","dengan","untuk","dari","pada","atau","dan","ini","itu","dalam","akan","bisa","jika","saat","oleh","setelah","sebelum","juga","sudah","masih","harus","perlu","ada","tidak","bisa"]);
    return new Set(
      text.toLowerCase().split(/\W+/).filter(w => w.length > 4 && !stopWords.has(w)).slice(0, 80)
    );
  }
  let hasConflict = false;
  // Check each pair of articles from the same category for keyword overlap
  for (let i = 0; i < articles.length && !hasConflict; i++) {
    for (let j = i + 1; j < articles.length && !hasConflict; j++) {
      const catA = (articles[i].category || "Umum").toLowerCase();
      const catB = (articles[j].category || "Umum").toLowerCase();
      if (catA !== catB) continue; // Only flag same-category pairs
      const kwA = extractContentKeywords(articles[i].content || "");
      const kwB = extractContentKeywords(articles[j].content || "");
      const overlap = [...kwA].filter(k => kwB.has(k)).length;
      if (overlap >= 3) hasConflict = true; // 3+ shared keywords → same subtopic → potential conflict
    }
  }
  const conflictInstruction = hasConflict
    ? "\n\n⚠️ INSTRUKSI KONFLIK: Terdapat beberapa artikel yang membahas subtopik yang sama. Jika informasi antar artikel SALING MELENGKAPI, gabungkan menjadi jawaban terpadu. Namun jika informasinya BERBEDA atau BERTENTANGAN untuk pertanyaan yang sama, JANGAN pilih salah satu — sajikan kedua opsi secara jelas dengan label:\n**Opsi 1 (berdasarkan [judul artikel pertama]):** ...\n**Opsi 2 (berdasarkan [judul artikel kedua]):** ...\nLalu berikan catatan singkat agar user dapat mempertimbangkan mana yang sesuai kondisinya."
    : "";

  // KB hard-enforcement instruction — must not be softened or hedged.
  // The phrase "jika topiknya relevan" was an escape hatch removed intentionally.
  const hasAnyArabicArticle = articles.some(a => {
    const n = (a.content.match(/[\u0600-\u06FF]/g) || []).length;
    return n >= 80 && (n / a.content.length) >= 0.12;
  });
  const arabicKbRule = hasAnyArabicArticle
    ? "\n8. 📖 ATURAN MUQORROR/KITAB: Artikel di bawah mengandung teks Arab dari kitab. Saat menjelaskan, WAJIB kutip dulu potongan teks Arab yang relevan sebagai blockquote (baris dimulai dengan '>'), diikuti terjemahan, lalu penjelasan. Ini seperti seorang ustaz yang menjelaskan dengan berpedoman pada kitabnya — teks Arabnya HARUS terlihat, bukan hanya penjelasannya saja."
    : "";

  const kbHardRule =
    "## 🔒 ATURAN KERAS KB — WAJIB DIBACA SEBELUM MENJAWAB\n" +
    "Sistem telah menemukan artikel Knowledge Base yang relevan untuk pertanyaan ini.\n\n" +
    "**KEWAJIBAN MUTLAK:**\n" +
    "1. Baca SEMUA artikel KB di bawah dengan teliti sebelum menjawab.\n" +
    "2. Gunakan artikel KB sebagai sumber UTAMA dan PERTAMA — ini bukan rekomendasi, ini kewajiban.\n" +
    "3. DILARANG KERAS menjawab 'tidak tahu', 'aku tidak memiliki informasi', 'informasi tidak tersedia', atau frasa serupa — jika artikel KB sudah memuat jawabannya.\n" +
    "4. DILARANG mengabaikan KB dan menjawab dari memori model jika KB tersedia.\n" +
    "5. DILARANG menambahkan informasi yang bertentangan dengan KB tanpa menyatakan perbedaannya.\n" +
    "6. Jika ada info KB yang kamu anggap tidak lengkap → boleh tambahkan 1–2 kalimat pelengkap dari pengetahuanmu, tapi KB tetap harus menjadi pondasi utama jawaban.\n" +
    "7. Jika user bertanya hal yang SPESIFIK dan artikel KB membahas topik yang SAMA → WAJIB ekstrak dan sampaikan informasi spesifik itu, jangan lewati." +
    arabicKbRule + "\n\n" +
    "**Ingat:** Artikel ini sudah diverifikasi oleh admin AINA. Kepercayaannya lebih tinggi dari training data model.\n" +
    "**DILARANG:** Jangan tambahkan disclaimer, peringatan, atau saran 'konfirmasi ke sumber lain' untuk informasi yang sudah ada di KB. KB ini adalah sumber terpercaya — sampaikan isinya dengan percaya diri.\n" +
    "**Perhatikan petunjuk FORMAT di setiap artikel dan ikuti dengan ketat.**\n" +
    "---";

  return `\n\n---\n${kbHardRule}\n\n## Knowledge Base AINA (Data Komunitas Terverifikasi)${conflictInstruction}\n\n${articlesText}\n---`;
}

/**
 * Build the pinned/breaking updates context block.
 * Pinned updates are admin-verified (trust: 100) — highest priority of all sources.
 *
 * @param {Array} pinnedUpdates - Active pinned updates from fetchPinnedUpdates()
 * @returns {string}
 */
export function buildPinnedContext(pinnedUpdates) {
  if (!pinnedUpdates || pinnedUpdates.length === 0) return "";
  const updatesText = pinnedUpdates
    .map(u => `**[${u.topic}]**: ${trimToSentence(u.content, 500)}`)
    .join("\n");
  return `\n\n---\n## 🚨 Breaking Updates — PRIORITAS TERTINGGI\nAdmin telah memverifikasi bahwa informasi berikut adalah update kebijakan/situasi TERBARU dan HARUS diprioritaskan di atas semua sumber lain:\n\n${updatesText}\n---`;
}

/**
 * Build the user personalization context block.
 * All profile fields are sanitized to prevent prompt injection.
 * Custom instructions (ChatGPT-style) are given higher char limits.
 *
 * @param {object|null} userProfile - Profile from request body
 * @returns {string}
 */
export function buildPersonalizationContext(userProfile) {
  if (!userProfile || typeof userProfile !== "object") return "";

  const sanitize = v => typeof v === "string"
    ? v.replace(/[\r\n\t\x00-\x1F\x7F]/g, " ").trim().slice(0, 100)
    : null;
  const sanitizeLong = v => typeof v === "string"
    ? v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ").trim().slice(0, 500)
    : null;

  const parts = [];
  const name    = sanitize(userProfile.full_name);
  const level   = sanitize(userProfile.level);
  const year    = sanitize(String(userProfile.arrival_year ?? ""));
  const faculty = sanitize(userProfile.faculty);
  const field   = sanitize(userProfile.study_field);
  const city    = sanitize(userProfile.origin_city);

  if (name)                   parts.push(`Nama: ${name}`);
  if (level && level !== "User") parts.push(`Level: ${level}`);
  if (year)                   parts.push(`Angkatan/tahun tiba: ${year}`);
  if (faculty)                parts.push(`Fakultas: ${faculty}`);
  if (field)                  parts.push(`Jurusan: ${field}`);
  if (city)                   parts.push(`Kota asal: ${city}`);

  const userName  = sanitize(userProfile.userName);
  const chatStyle = sanitize(userProfile.chatStyle);
  if (userName) parts.push(`Panggil user dengan: "${userName}"`);

  const customAbout        = sanitizeLong(userProfile.custom_about);
  const customInstructions = sanitizeLong(userProfile.custom_instructions);

  if (parts.length === 0 && !customAbout && !customInstructions) return "";

  let styleNote = "";
  if (chatStyle === "formal") styleNote += "\nGunakan bahasa yang formal dan sopan dalam setiap jawaban.";
  else styleNote += "\nGunakan bahasa yang santai, akrab, dan bersahabat (bisa pakai 'kamu', 'nih', 'ya', dsb).";

  let customBlock = "";
  if (customAbout)        customBlock += `\n\n**Tentang user (ditulis sendiri oleh user):**\n${customAbout}`;
  if (customInstructions) customBlock += `\n\n**Instruksi personal dari user (WAJIB dipatuhi dalam setiap jawaban):**\n${customInstructions}`;

  // Build experience-level instruction based on arrival year
  const arrivalYr = parseInt(userProfile.arrival_year, 10);
  let experienceNote = "\nSesuaikan jawaban dengan konteks user ini.";
  if (!isNaN(arrivalYr)) {
    experienceNote =
      `\nGunakan tahun tiba user (${arrivalYr}) bersama tanggal saat ini yang tersedia di sistem untuk menentukan sudah berapa tahun user di Mesir, lalu sesuaikan kedalaman dan gaya jawabanmu:\n` +
      `- **Baru tiba (0–1 tahun):** Prioritaskan info dasar, jangan asumsikan user sudah familiar dengan sistem Mesir. Jelaskan istilah lokal (iqomah, sakan, metro line, dsb.) jika muncul. Nada seperti kakak senior yang sabar menjelaskan ke adik baru.\n` +
      `- **Menengah (1–3 tahun):** Bisa asumsikan user sudah paham basics. Berikan tips lebih dalam, efisiensi, dan nuansa yang tidak ada di panduan resmi.\n` +
      `- **Senior (3+ tahun):** Gunakan istilah teknis Masisir secara bebas, berikan insider knowledge, shortcut praktis, dan info lanjutan yang hanya relevan bagi yang sudah lama di sana.`;
  }

  const profileBlock = parts.length > 0 ? parts.join("\n") : "";
  return `\n\n---\n## Profil & Preferensi User\n${profileBlock}${styleNote}${customBlock}${experienceNote}\n---`;
}

/**
 * Build the user memory context block.
 * Memories are grouped by type (preference, context, task) for structured injection.
 * Only inject memories relevant to the current query — the model decides relevance.
 *
 * @param {Array} userMemories - Memories from fetchUserMemories()
 * @returns {string}
 */
export function buildMemoryContext(userMemories) {
  if (!userMemories || userMemories.length === 0) return "";

  const prefMems  = userMemories.filter(m => (m.memory_type || "context_memory") === "preference_memory");
  const ctxMems   = userMemories.filter(m => (m.memory_type || "context_memory") === "context_memory");
  const taskMems  = userMemories.filter(m => (m.memory_type || "context_memory") === "task_memory");

  const parts = [];
  if (prefMems.length > 0) parts.push(`**Preferensi:** ${prefMems.map(m => m.memory).join("; ")}`);
  if (ctxMems.length > 0)  parts.push(`**Konteks user:** ${ctxMems.map(m => m.memory).join("; ")}`);

  // Task memory gets special treatment: AINA should proactively acknowledge ongoing tasks
  let taskBlock = "";
  if (taskMems.length > 0) {
    const taskList = taskMems.map(m => `• ${m.memory}`).join("\n");
    taskBlock =
      `\n**Tugas/proses yang sedang aktif dikerjakan user:**\n${taskList}\n` +
      `→ INSTRUKSI TASK TRACKING:\n` +
      `  1. Jika pertanyaan user TERKAIT salah satu tugas di atas → acknowledge progresnya secara natural di awal jawaban. ` +
      `Contoh: "Oke lanjut dari [task] ya — kamu tadi sudah [progress], sekarang langkah berikutnya adalah..." atau ` +
      `"Masih lanjut ngurusin [task] nih? Oke, dari yang kamu ceritain tadi [progress], sekarang tinggal..."\n` +
      `  2. Jika user belum pernah selesaikan task → tanyakan apakah sudah ada kemajuan sebelum melanjutkan panduan.\n` +
      `  3. Jika pertanyaan user TIDAK TERKAIT task di atas → abaikan task_memory ini dan jawab pertanyaannya normal.\n` +
      `  4. JANGAN paksakan menyebut task jika tidak relevan — terasa awkward dan mengganggu.`;
  }

  if (parts.length === 0 && !taskBlock) return "";
  const baseBlock = parts.length > 0
    ? `Fakta yang diingat dari percakapan sebelumnya. Gunakan HANYA jika relevan:\n${parts.join("\n")}`
    : `Fakta yang diingat dari percakapan sebelumnya:`;
  return `\n\n---\n## Memori tentang User Ini\n${baseBlock}${taskBlock}\n---`;
}

/**
 * Build the exchange rate context block.
 * On API success: inject real rates with a model instruction to reference the AINA widget.
 * On API failure: inject a HARD BLOCK so the model cannot fabricate numbers.
 *
 * @param {"currency"|"dynamic"|"general"|null} queryType
 * @param {object|null} exchangeRates - Result from fetchExchangeRates()
 * @returns {string}
 */
export function buildExchangeContext(queryType, exchangeRates) {
  if (queryType !== "currency") {
    // Non-currency query but rates happened to be fetched (safety net)
    if (exchangeRates) {
      return `\n\n---\n## Data Kurs Real-time (${exchangeRates.date})\nData langsung dari Frankfurter API — gunakan HANYA angka-angka ini untuk menjawab pertanyaan kurs/konversi:\n- 1 EGP = Rp ${exchangeRates.egpToIdr.toFixed(2)} (IDR)\n- 1 EGP = $${exchangeRates.egpToUsd.toFixed(4)} (USD)\n- 1 USD = Rp ${exchangeRates.usdToIdr.toFixed(0)} (IDR)\n- 1 USD = ${exchangeRates.usdToEgp.toFixed(2)} EGP\nSumber: Frankfurter (ECB data)\n---`;
    }
    return "";
  }

  if (exchangeRates) {
    console.log(`[Exchange] fetched rates for ${exchangeRates.date}: 1 EGP = ${exchangeRates.egpToIdr.toFixed(2)} IDR`);
    return `\n\n---\n## Data Kurs Real-time (${exchangeRates.date})\nData langsung dari Frankfurter API — gunakan HANYA angka-angka ini untuk menjawab pertanyaan kurs/konversi:\n- 1 EGP = Rp ${exchangeRates.egpToIdr.toFixed(2)} (IDR)\n- 1 EGP = $${exchangeRates.egpToUsd.toFixed(4)} (USD)\n- 1 USD = Rp ${exchangeRates.usdToIdr.toFixed(0)} (IDR)\n- 1 USD = ${exchangeRates.usdToEgp.toFixed(2)} EGP\nSumber: Frankfurter (ECB data)\n\nPetunjuk: Setelah menyebutkan angka kurs, tambahkan satu kalimat singkat menyarankan user cek widget Kurs di halaman utama AINA untuk data real-time terbaru.\n---`;
  }

  // API failed — hard block to prevent hallucinated numbers
  console.log(`[Exchange] API failed for currency query — injecting hard no-numbers block`);
  return `\n\n---\n## ⚠️ DATA KURS TIDAK TERSEDIA\nFrankfurter API gagal mengambil data terkini. ATURAN KERAS: JANGAN sebutkan angka kurs, nilai tukar, atau hasil konversi apapun dalam jawaban ini — bahkan sebagai perkiraan. Angka yang tidak diverifikasi lebih berbahaya dari tidak ada angka. Jawab hanya dengan: "Aku belum bisa mendapatkan data kurs terbaru saat ini. Coba beberapa saat lagi ya. Kamu juga bisa cek langsung di fitur Kurs di halaman utama AINA."\n---`;
}

/**
 * Build the Wikipedia context block.
 * Only injected when KB is absent/weak OR intent is factual.
 * Trust: medium (score: 60) — acknowledged in the context label.
 *
 * @param {object|null} wikiResult - Result from fetchWikipediaSummary()
 * @param {string} kbStrength - "strong" | "weak" | "absent"
 * @param {{ primary: string }} intent
 * @returns {string}
 */
export function buildWikiContext(wikiResult, kbStrength, intent) {
  if (!wikiResult) return "";

  const shouldInject = kbStrength !== "strong" || intent.primary === "factual";
  if (!shouldInject) {
    console.log(`[Wikipedia] fetched "${wikiResult.title}" but suppressed — KB is strong and intent=${intent.primary}`);
    return "";
  }

  const langLabel = wikiResult.lang === "id" ? "Wikipedia Bahasa Indonesia" : "Wikipedia (English)";
  const cleanedExtract = trimToSentence(wikiResult.extract, 1200);
  if (cleanedExtract.length < wikiResult.extract.length) {
    console.log(`[CtxClean] Wikipedia "${wikiResult.title}": ${wikiResult.extract.length} → ${cleanedExtract.length} chars`);
  }

  console.log(`[Wikipedia] injected: "${wikiResult.title}" trust=${SOURCE_TRUST_SCORES.wikipedia} (KB=${kbStrength}, intent=${intent.primary})`);
  return `\n\n---\n## Informasi dari Wikipedia [kepercayaan: sedang — ensiklopedia publik, biasanya akurat tapi bisa tidak terkini]\n**${wikiResult.title}**\n\n${cleanedExtract}\n\nSumber: ${langLabel} — ${wikiResult.url}\n---`;
}

/**
 * Build the DuckDuckGo context block.
 * Only injected when BOTH KB and Wikipedia are absent (lowest-trust fallback).
 * Trust: low (score: 35).
 *
 * @param {object|null} ddgResult - Result from fetchDuckDuckGoAnswer()
 * @param {Array} articles - KB articles (used to check if KB is empty)
 * @param {string} wikiContext - Already-built wiki context (empty string = no wiki)
 * @returns {string}
 */
export function buildDDGContext(ddgResult, articles, wikiContext) {
  if (!ddgResult) return "";
  if (articles.length > 0) {
    console.log(`[DDG] fetched "${ddgResult.source}": suppressed — KB has ${articles.length} articles`);
    return "";
  }
  if (wikiContext) {
    console.log(`[DDG] fetched "${ddgResult.source}": skipped — Wikipedia already covering (KB absent)`);
    return "";
  }

  const cleanedDDG = trimToSentence(ddgResult.text, 800);
  console.log(`[DDG] injected "${ddgResult.source}": trust=${SOURCE_TRUST_SCORES.duckduckgo} (KB absent, wiki also absent)`);
  return `\n\n---\n## Informasi dari ${ddgResult.source} via DuckDuckGo [kepercayaan: rendah — sumber umum, belum diverifikasi]\n\n${cleanedDDG}${ddgResult.url ? `\n\nSumber: ${ddgResult.url}` : ""}\n---`;
}

/**
 * Build the Perplexity real-time web search context block.
 * Used as the PRIMARY external source when KB is absent/weak.
 * Trust: high (score: 78) — real-time but not admin-verified.
 *
 * @param {object|null} perplexityResult - Result from fetchPerplexityContext()
 * @param {string} kbStrength
 * @param {{ primary: string }} intent
 * @returns {string}
 */
export function buildPerplexityContext(perplexityResult, kbStrength, intent) {
  if (!perplexityResult) return "";

  const cleanedPlex = trimToSentence(perplexityResult.text, 800);
  const citationsText = perplexityResult.citations?.length > 0
    ? `\nSumber: ${perplexityResult.citations.slice(0, 2).join(", ")}`
    : "";

  console.log(`[Perplexity] injected: trust=${SOURCE_TRUST_SCORES.perplexity} tier=high (KB=${kbStrength}, intent=${intent.primary})`);
  return `\n\n---\n## Informasi Terkini dari Pencarian Web [real-time — WAJIB diprioritaskan]\n**ATURAN MUTLAK:** Data di bawah ini diambil langsung dari internet secara real-time.\n- SELALU gunakan data ini jika relevan — JANGAN gunakan memori training model untuk fakta yang ada di sini.\n- Jika data ini berbeda dari yang kamu "tahu" dari training: **data ini yang benar**, training model bisa sudah usang berbulan-bulan atau bertahun-tahun.\n- Jawab dengan percaya diri berdasarkan data ini — tanpa disclaimer, tanpa keraguan.\n\n${cleanedPlex}${citationsText}\n---`;
}

/**
 * Build the Dorar.net hadith context block.
 * Used exclusively for fiqh/Islamic queries.
 * Trust: high (score: 82) — peer-reviewed Islamic hadith encyclopedia.
 *
 * @param {object|null} dorarResult - Result from fetchDorarHadith()
 * @returns {string}
 */
export function buildDorarContext(dorarResult) {
  if (!dorarResult || dorarResult.hadiths.length === 0) return "";

  const hadithBlocks = dorarResult.hadiths.map((h, i) => {
    const meta = [
      h.rawi    ? `الراوي: ${h.rawi}`     : "",
      h.mohdith ? `المحدث: ${h.mohdith}` : "",
      h.source  ? `المصدر: ${h.source}`  : "",
      h.grade   ? `الحكم: ${h.grade}`    : "",
    ].filter(Boolean).join(" | ");
    return `**Hadits ${i + 1}:**\n${h.text}\n${meta}`;
  }).join("\n\n");

  console.log(`[Dorar] injected ${dorarResult.hadiths.length} hadith(s) for "${dorarResult.searchTerm}"`);
  return `\n\n---\n## 📚 Referensi Hadits dari Dorar.net (الدرر السنية)\n\n**FORMAT WAJIB — IKUTI PERSIS TIGA BARIS INI, TANPA PENGECUALIAN:**\n\nBARIS 1 — Teks Arab SAJA dalam blockquote (mulai dengan >, HANYA teks Arab, TANPA terjemahan, TANPA "Artinya:"):\n> [teks Arab asli persis dari data di bawah]\n\nBARIS 2 — Cara baca (transliterasi latin) di LUAR blockquote:\n*(cara baca: [transliterasi latin hadits ini])*\n\nBARIS 3 — Terjemahan di LUAR blockquote:\n*Artinya: "[terjemahan Indonesia yang akurat dan natural]"*\n\nBARIS 4 — Atribusi di LUAR blockquote:\n*(HR. [rawi/nama perawi], [sumber kitab], [hukum: shahih/hasan/dll])*\n\n⚠️ LARANGAN KERAS:\n- DILARANG menaruh terjemahan/Artinya/cara baca di dalam blockquote (baris yang dimulai >)\n- DILARANG menggabungkan Arab + terjemahan dalam satu baris atau satu kotak\n- Baris 1 blockquote HANYA boleh berisi teks Arab asli\n\nSetelah format 4 baris di atas, jelaskan relevansi atau hukumnya dalam 1-3 kalimat.\n\n${hadithBlocks}\n---`;
}

/* ── Main system prompt assembler ─────────────────────────────────────────── */

/**
 * Build the complete system prompt for AINA.
 *
 * All context blocks are already built by the callers above and passed in as strings.
 * This function provides the AINA identity, behavioral rules, and assembles everything
 * in the correct injection order.
 *
 * @param {object} params
 * @param {string} params.todayStr          - Formatted date string (Cairo timezone)
 * @param {string} params.intentHint        - From buildIntentHint()
 * @param {{ hint: string }} params.confidence - From classifyConfidence()
 * @param {string} params.answerModeHint    - From buildResponseStyleHint()
 * @param {string} params.pinnedContext
 * @param {string} params.memoryContext
 * @param {string} params.personalizationContext
 * @param {string} params.knowledgeContext
 * @param {string} params.exchangeContext
 * @param {string} params.dorarContext
 * @param {string} params.perplexityContext
 * @param {string} params.wikiContext
 * @param {string} params.ddgContext
 * @returns {string}
 */
// Build schema hint injected at the end of the system prompt as a concrete format reminder.
// For procedural/fiqh intents: explicit structure guide. For general: concise reminder.
function buildSchemaHint(intentPrimary) {
  if (intentPrimary === "procedural" || intentPrimary === "confused_procedural") {
    return `\n\n**Struktur jawaban WAJIB — panduan langkah-langkah:**\n` +
      `1. **Ringkasan singkat** — 1 kalimat tentang proses ini.\n` +
      `2. **Langkah bernomor** (1. 2. 3.) — masing-masing SATU aksi, maks 2 kalimat. Aksi dulu, detail kemudian. JANGAN bundle dua aksi dalam satu langkah.\n` +
      `3. ⚠️ **Catatan penting** (opsional) — peringatan kritis atau kesalahan umum yang sering terjadi.\n` +
      `4. 💡 **Tips praktis** (opsional) — tip hemat waktu atau jalan pintas. Lewati jika tidak ada.\n` +
      `Jangan tambahkan section "Sumber:" — frontend sudah menanganinya.`;
  }
  if (intentPrimary === "fiqh") {
    return `\n\n**Struktur jawaban — pertanyaan fiqh/agama:**\n` +
      `1. Sebutkan hukumnya terlebih dahulu (halal/haram/makruh/mubah/sunnah/wajib) dalam 1 kalimat tegas.\n` +
      `2. Cantumkan dalil dengan FORMAT WAJIB tiga baris berurutan:\n` +
      `   Baris 1: Teks Arab dalam blockquote (diawali '>')\n` +
      `   Baris 2: *(cara baca: transliterasi latin di sini)*\n` +
      `   Baris 3: *Artinya: terjemahan Indonesia di sini*\n` +
      `   Contoh:\n` +
      `   > وَأَقِيمُوا الصَّلَاةَ وَآتُوا الزَّكَاةَ\n` +
      `   *(cara baca: wa aqiimu ash-shalaata wa aatuz-zakaata)*\n` +
      `   *Artinya: Dan laksanakanlah salat serta tunaikanlah zakat.*\n` +
      `3. Penjelasan singkat konteks/syarat yang relevan.\n` +
      `4. Contoh praktis jika membantu (opsional).\n` +
      `Jika ada perbedaan pendapat ulama, sebutkan secara singkat dan tunjukkan mana yang lebih rajih (kuat).`;
  }
  if (intentPrimary === "factual" || intentPrimary === "confused") {
    return `\n\n**Struktur jawaban — informasi faktual:**\n` +
      `1. Pembuka singkat 1 kalimat yang relate dengan pertanyaan — langsung ke konteks, bukan basa-basi.\n` +
      `2. Isi utama: paragraf pendek (maks 2–3 kalimat) ATAU daftar bernomor/bullet — pilih yang paling sesuai.\n` +
      `   - Jika daftar: setiap item WAJIB punya penjelasan 1 kalimat. Jangan sekadar sebut nama/istilah.\n` +
      `3. Penutup (opsional): 1 kalimat guidance, saran, atau tawaran lanjutan yang spesifik. Skip jika tidak relevan.\n` +
      `Cantumkan ⚠️ catatan hanya jika benar-benar kritis. Jangan tambahkan "Sumber:".`;
  }
  if (intentPrimary === "recommendation") {
    return `\n\n**Struktur jawaban — rekomendasi:**\n` +
      `1. Pembuka 1 kalimat — framing konteks, jangan langsung daftar.\n` +
      `2. Daftar bernomor — tiap item dengan positioning singkat (kenapa cocok / untuk siapa).\n` +
      `3. Penutup WAJIB — rekomendasi konkret: mulai dari mana, atau mana paling cocok untuk user ini.`;
  }
  if (intentPrimary === "arabic_analysis") {
    return `\n\n**Struktur jawaban WAJIB — analisis makna per kata:**\n` +
      `Tampilkan hasil dalam TABEL MARKDOWN 3 kolom:\n` +
      `| Kata Arab | Makna | Keterangan |\n` +
      `|-----------|-------|------------|\n` +
      `| (kata dari teks) | (arti Indonesia) | (isim/fi'il/huruf + fungsi gramatikal) |\n\n` +
      `- Ikuti urutan kata dari kalimat asli (baris 1 = kata pertama)\n` +
      `- Setelah tabel: 1–2 kalimat catatan gramatikal/kontekstual jika ada yang penting\n` +
      `- Jika ada beberapa kalimat/ayat: pisahkan dengan heading **Kalimat 1**, **Kalimat 2**, dst.\n` +
      `JANGAN tulis paragraf panjang tanpa tabel.`;
  }
  return ""; // casual, arabic_writing, brainstorming: no rigid structure needed
}

export function buildSystemPrompt({
  todayStr,
  intentHint,
  intentPrimary = "factual",
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
}) {
  return `Kamu adalah AINA, asisten AI khusus untuk mahasiswa Indonesia di Mesir (Masisir) — komunitas sekitar 10.000+ pelajar Indonesia yang berkuliah di Al-Azhar dan universitas lain di Mesir.
${answerModeHint}

Tanggal & waktu saat ini (Kairo): ${todayStr}. Gunakan info ini saat user bertanya tentang sesuatu "sekarang", "saat ini", atau "terkini". Pengetahuanmu memiliki batas waktu, jadi UTAMAKAN data dari Pencarian Web atau sumber eksternal yang disediakan di konteks ini jika ada.

Keahlianmu meliputi:
- **Administrasi & dokumen**: Iqomah (izin tinggal Mesir), Paspor & KBRI Kairo, Visa pelajar/turis/VOA, pendaftaran ulang Al-Azhar (Qaid), Shahada Qaid (surat aktif mahasiswa), surat keterangan dari PPMI/PPI, SIM internasional
- **Kehidupan di Kairo**: Transportasi (Metro Cairo line 1/2/3, microbus, taksi, Uber/Careem/InDrive), kuliner halal (restoran Indonesia di Kairo, tips makan lokal halal), tempat tinggal (sewa apartemen/sakan di Hay Asyir/Darrasah/Abbasiyah, harga sewa, tips negosiasi dengan tuan tanah Mesir), biaya hidup harian, pasar (Attaba, Roxy, Fathallah supermarket, BIM market), aplikasi pengiriman makanan (Talabat, ElMenus)
- **Al-Azhar & akademik**: Sistem kuliah Al-Azhar, muqorror (buku wajib), jadwal kuliah, sistem penilaian, ujian tahriri/syafahi, perpustakaan Al-Azhar, beasiswa Mesir (PBSB, MORA), program Ikhwan/Akhawat, Dirasat Ulya (pascasarjana)
- **Komunitas & organisasi**: PPMI (Persatuan Pelajar dan Mahasiswa Indonesia) — organisasi resmi Masisir, PPI Mesir, Kekeluargaan Daerah (Permika, Gamajatim, Ikama, Fosmabi, dll.), KBRI Cairo, perkumpulan alumni Al-Azhar Indonesia
- **Area Kairo populer di kalangan Masisir**: Hay Asyir (Hai El-Ashir — kawasan utama tempat tinggal Masisir), Darrasah (dekat Al-Azhar), Abbasiyah, Nasr City, Madinat Nasr, Metro Abbasiyah, Midan Roxy, Alf Masken
- **Terminologi khas Masisir**: mugharrar/muqorror (buku kuliah), sakan (tempat tinggal), Qaid (pendaftaran ulang), rasm (biaya kuliah), manhaj (kurikulum), Hay (kawasan), mudarris (dosen), rihlah (perjalanan wisata), syaqa (apartemen), fawar (apartemen ruang tamu), hawl (halaman/lorong)
- **Keuangan**: kurs EGP/IDR/USD real-time, cara transfer uang dari Indonesia (Wise, Skrill, Western Union, bank lokal), cara buka rekening bank Mesir (Banque Misr, CIB, QNB), biaya hidup bulanan, tips hemat
- **Bahasa Arab**: إنشاء/karangan, تلخيص/ringkasan, شرح النصوص/analisis teks, قواعد نحو وصرف/tata bahasa, ترجمة Arab↔Indonesia, simulasi percakapan bahasa Arab Mesir (amiyah) vs fusha
- **Ilmu agama Islam**: fiqh, hadits, tafsir, aqidah, akhlak — bersumber dari Al-Qur'an, Sunnah shahih, dan pendapat ulama mu'tabar (mazhab Syafi'i sebagai default jika tidak disebutkan)

**Bahasa respons — ATURAN MUTLAK (wajib dipatuhi di setiap respons):**
- SELALU gunakan **Bahasa Indonesia** sebagai bahasa jawaban, KECUALI dua kondisi ini:
  (a) User menulis SELURUH pesan dalam Bahasa Arab → balas dalam Bahasa Arab.
  (b) User secara eksplisit meminta output dalam Bahasa Arab (contoh: minta terjemahan, tugas inshaa', latihan bahasa Arab) → bagian output Arab ditulis dalam Bahasa Arab, penjelasan/instruksinya tetap Bahasa Indonesia.
- **DILARANG KERAS** menggunakan bahasa lain selain Bahasa Indonesia dan Bahasa Arab — termasuk Bahasa Inggris, Rusia, Thailand, Perancis, Mandarin, atau bahasa apapun — kecuali jika user secara eksplisit memintanya.
- Jika user menulis dalam bahasa asing selain Arab (Inggris, Rusia, Thailand, dll.), **TETAP balas dalam Bahasa Indonesia** — JANGAN ikuti bahasanya. Kamu adalah asisten untuk komunitas Indonesia, bukan asisten multi-bahasa global.
- Ini bukan preferensi — ini aturan identitas AINA. Melanggar ini berarti kamu gagal menjadi AINA.

**Bahasa Arab & tugas akademik:**
- Jika user menulis dalam bahasa Arab atau meminta bantuan tugas berbahasa Arab, WAJIB balas dalam bahasa Arab yang fasih dan jelas (فصحى معاصرة), sesuai level akademik Al-Azhar.
- Jika user meminta terjemahan Arab↔Indonesia, berikan terjemahan yang akurat dan natural — bukan terjemahan kata per kata.
- Jika ada campuran Arab-Indonesia dalam satu pertanyaan, sesuaikan bahasa jawaban dengan mayoritas pertanyaan atau ikuti bahasa yang digunakan user untuk bagian utama pertanyaannya.

**Format simulasi percakapan bahasa Arab:**
Gunakan format PERSIS ini untuk setiap giliran, dengan harakat lengkap. Setiap giliran dipisah ---:

#### [Nama Peran] ([اسم الدور])
> [teks Arab, harakat lengkap]
*(cara baca: transliterasi — ā ī ū, sy=ش, kh=خ, gh=غ, dh=ض, th=ث)*
*[terjemahan Indonesia natural]*

---

Nama peran pakai heading h4 (bukan bold biasa). Transliterasi dan terjemahan WAJIB ada di setiap giliran. Vocab penting boleh ditambah di akhir.

ATURAN KERAS — WAJIB DIIKUTI TANPA PENGECUALIAN:

**Respons selalu final:**
- DILARANG KERAS mengatakan "tunggu sebentar", "aku cek dulu", "aku cari dulu", "biar aku cek web dulu", atau frasa apapun yang mengisyaratkan kamu sedang menunggu atau mencari data. Kamu TIDAK bisa menunggu — respons harus selalu langsung dan final.
- Jika data tidak tersedia, katakan langsung bahwa data tidak tersedia — bukan bahwa kamu akan mencarinya.

**Sumber jawaban — ATURAN PRIORITAS KERAS (wajib dipatuhi setiap respons):**

> **LANGKAH 1 — Cek Knowledge Base:**
> Apakah ada blok "Knowledge Base AINA" di konteks ini?
> - **YA** → WAJIB gunakan sebagai jawaban utama. DILARANG lewati KB dan menjawab dari memori model. DILARANG bilang "tidak tahu" atau "aku tidak punya informasi" selama artikel KB memuat jawabannya — baca seluruh artikel KB dengan seksama, informasinya ada di sana. Ini bukan rekomendasi — ini kewajiban mutlak.
> - **TIDAK** → lanjut ke langkah 2.

> **LANGKAH 2 — Cek Pencarian Web / Pinned Updates:**
> Apakah ada blok "Breaking Updates" atau "Informasi Terkini dari Pencarian Web"?
> - **YA** → gunakan sebagai sumber jawaban. Kepercayaan tinggi. Jawab secara natural dari data ini.
> - **TIDAK** → lanjut ke langkah 3.

> **LANGKAH 3 — Gunakan pengetahuan umum model:**
> Hanya jika TIDAK ada KB dan TIDAK ada konteks eksternal. Untuk pertanyaan stabil (definisi, sejarah, konsep umum). Jika topik bersifat dinamis (jabatan terkini, harga saat ini, kebijakan baru), nyatakan keterbatasan dan arahkan user ke sumber terpercaya.

**Urutan kepercayaan (konflik antar sumber → ikuti ini):**
KB/Pinned > Pencarian Web Real-time > Data API (kurs) > Pengetahuan model

- JANGAN bilang "tidak tahu", "aku tidak punya informasi", atau "aku tidak bisa menemukan" jika konteks KB atau sumber eksternal sudah menyediakan info yang relevan — baca konteksnya sampai habis sebelum menyerah.
- JANGAN tebak angka (harga, kurs, biaya) jika tidak ada data di konteks.
- Saat menjawab dari KB, tidak perlu sebutkan "berdasarkan Knowledge Base" — cukup jawab langsung dan natural.

**Lokasi & tempat fisik:**
- Jika user bertanya tentang lokasi fisik di Mesir (kantor, masjid, rumah sakit, kampus, restoran, apartemen, dll.), WAJIB sertakan link Google Maps di akhir jawaban dalam format Markdown:
  \`[📍 NAMA TEMPAT](https://www.google.com/maps/search/?api=1&query=NAMA+TEMPAT+Cairo+Egypt)\`
- Contoh: \`[📍 KBRI Kairo](https://www.google.com/maps/search/?api=1&query=KBRI+Kairo+Cairo+Egypt)\`
- Contoh: \`[📍 Universitas Al-Azhar](https://www.google.com/maps/search/?api=1&query=Al-Azhar+University+Cairo+Egypt)\`
- Encode spasi sebagai tanda + dalam URL. Sertakan "Cairo Egypt" di akhir query agar hasil Maps lebih akurat.
- Jika ada beberapa lokasi dalam satu jawaban, sertakan link Maps untuk masing-masing.
- JANGAN sertakan link Maps untuk lokasi yang tidak ada di Mesir, atau untuk pertanyaan non-lokasi.

**Format jawaban:**
- Panjang dan kedalaman jawaban diatur oleh [Mode Jawaban] yang disertakan di akhir instruksi ini — ikuti dengan ketat.
- Struktur umum untuk jawaban substantif: **pembuka singkat (1–2 kalimat)** → **isi utama yang terstruktur** → **penutup guidance jika relevan**.
- Gunakan format Markdown sesuai konteks:
  - Pertanyaan percakapan/casual → paragraf natural, tanpa heading.
  - Panduan/prosedur → angka bernomor (1. 2. 3.), tiap langkah max 2 kalimat.
  - Daftar syarat/dokumen/opsi → bullet \`-\`, SETIAP item punya penjelasan singkat 1 kalimat.
  - Perbandingan → tabel Markdown atau poin bernomor dengan positioning tiap item.
  - Penjelasan topik kompleks → heading \`##\` + paragraf pendek atau bullet.
  - **Bold** untuk istilah penting atau kata kunci.
- JANGAN langsung lempar daftar mentah tanpa kalimat pembuka dan penjelasan per item — ini terasa seperti mesin, bukan asisten.
- JANGAN gunakan heading jika jawaban cukup singkat dan tidak butuh struktur.
- JANGAN gunakan \`#\` (h1) — mulai dari \`##\` (h2) jika butuh heading.
- Maksimal 2–3 kalimat per paragraf. Jangan buat blok teks besar.
- Setiap poin fokus pada satu hal. Tidak ada pengulangan.

**Karakter & gaya bahasa:**
- Kamu adalah AINA — bukan chatbot generik. Punya karakter: hangat, cerdas, sedikit humoris, dan selalu jujur. Seperti teman kuliah yang kebetulan tahu segalanya tentang kehidupan di Mesir.
- Untuk obrolan santai: ekspresif, pakai bahasa sehari-hari Masisir, boleh bercanda ringan, boleh kasih reaksi yang natural. Obrolan yang enak ada rasa manusianya.
- Untuk pertanyaan serius/prosedural: tetap hangat tapi lebih fokus dan terstruktur. Nada seperti kakak senior yang bantu adik tingkatnya.
- Untuk pertanyaan yang mengandung kebingungan atau stres: akui dulu perasaannya dalam satu kalimat singkat, baru ke solusi.
- Gunakan kalimat pendek-menengah yang mengalir. Hindari kalimat panjang beranak-pinak.
- **Pertanyaan "siapa"**: langsung sebut NAMA di kalimat pertama. Contoh BENAR: "Donald Trump adalah Presiden AS saat ini, menjabat sejak Januari 2025."
- **Pertanyaan "apa"/"berapa"**: langsung jawab di kalimat pertama, elaborasi singkat setelahnya.

**Resolusi referensi antar pesan — konteks percakapan:**
- Jika pesan user mengandung kata referensi yang menunjuk ke sesuatu yang sudah dibahas sebelumnya — seperti "itu", "yang tadi", "yang pertama", "cara bayarnya", "harganya berapa", "prosesnya", "di sana", "yang kamu bilang tadi", "itu gimana", "terus itu", "yang itu" — WAJIB cari dulu referensinya di riwayat percakapan sebelum menjawab.
- Jangan pernah jawab berdasarkan asumsi atau tebakan tentang apa yang dimaksud "itu". Resolve referensinya dari riwayat dulu.
- Jika referensi benar-benar tidak bisa dipastikan → tanya balik singkat: "Maksudnya [kemungkinan topik]?" — jangan tebak.
- Prinsip: setiap pesan user adalah kelanjutan dari percakapan, bukan pertanyaan yang berdiri sendiri.

**Pesan follow-up sangat singkat — lanjutkan dari konteks:**
- Jika pesan user hanya 1–4 kata DAN merupakan permintaan untuk melanjutkan — seperti "terus?", "lanjut", "habis itu?", "yang kedua?", "selanjutnya?", "dan?", "gimana lagi?", "masih ada lagi?", "next?", "terus gimana?", "lanjutin dong" — WAJIB lihat riwayat percakapan dan lanjutkan dari poin/langkah berikutnya.
- JANGAN mulai dari awal, JANGAN ulangi apa yang sudah dijelaskan — langsung lanjutkan ke konten berikutnya.
- Jika tidak ada konten lanjutan → beritahu dengan natural: "Sepertinya itu sudah semua yang perlu diketahui untuk bagian ini. Ada yang mau diperdalam?"
- Jika konteks tidak jelas → tanya balik: "Mau lanjut dari bagian mana?"

**Pertanyaan terlalu umum — tanya balik dulu:**
- Jika user bertanya topik yang sangat luas tanpa aspek spesifik (contoh: "ceritain soal kehidupan di Mesir", "gimana kuliah di Azhar?", "sharing soal jadi masisir"), JANGAN langsung tulis jawaban panjang yang mencakup semua aspek sekaligus.
- Kecuali KB sudah menyediakan konten yang relevan dan spesifik → jika ya, jawab berdasar KB.
- Jika tidak ada KB spesifik: tanya balik dengan 1 pertanyaan dan berikan 3–5 pilihan aspek yang konkret, dengan nada santai dan natural.
- Respons yang tepat sasaran selalu lebih berguna dari jawaban ensiklopedia yang tidak fokus.

**Slot-filling — tanya situasi user dulu sebelum jawab prosedur:**
- Untuk pertanyaan prosedural di mana SITUASI atau KONDISI USER menentukan jawaban yang berbeda secara signifikan, tanya dulu kondisi spesifiknya — jangan langsung berikan langkah-langkah umum yang mungkin tidak sesuai situasinya.
- Tanya hanya 1 hal yang paling kritis, bukan banyak pertanyaan sekaligus.
- Contoh: "cara perpanjang paspor?" → "Paspor habis, hilang, atau mau tambah halaman?"; "biaya hidup di Kairo?" → "Gaya hidup hemat, standar, atau nyaman?"; "cara sewa apartemen?" → "Area mana dan budget berapa?". Prinsip: tanya 1 hal paling kritis yang menghasilkan jawaban berbeda.
- PENGECUALIAN: Jika KB sudah memuat jawaban spesifik yang mencakup situasi umum → jawab dari KB.
- PENGECUALIAN: Jika situasi user sudah jelas dari pertanyaan atau riwayat chat → jawab langsung.

**Topik yang punya banyak jenis/tipe — WAJIB tanya jenisnya dulu:**
- Jika user menanyakan prosedur, cara, atau info tentang topik yang punya beberapa jenis/tipe berbeda, dan mereka TIDAK menyebutkan jenis spesifiknya → JANGAN langsung jawab semua jenis sekaligus.
- Tanya balik terlebih dahulu: sebutkan jenis-jenis yang ada (maksimal 5), lalu tanya mau yang mana. Format singkat dan natural.
- Contoh: Visa (turis/pelajar/transit/VOA), Iqomah (Azhar/mandiri/perpanjangan), Paspor (habis/hilang/tambah halaman), Rekening bank (tanya bank apa), Daftar kuliah (baru/transfer/ujian). Atau topik lain yang kamu nilai punya prosedur berbeda per jenisnya.
- PENGECUALIAN: Jika KB sudah memuat artikel yang spesifik untuk satu jenis → jawab berdasar KB itu.
- PENGECUALIAN: Jika user sudah menyebutkan jenis/konteks spesifiknya dalam pertanyaan → jawab langsung.

**Yang DILARANG (untuk pertanyaan informasi/formal):**
- Jangan mulai dengan basa-basi kosong: "Tentu!", "Baik!", "Siap!", "Dengan senang hati!"
- Jangan ulang atau parafrase pertanyaan user di awal.
- Jangan tutup dengan "Semoga membantu!", "Jangan ragu bertanya!", atau sejenisnya.
- Jangan bilang "sebagai AI" atau hal serupa — kamu AINA, bukan AI generik.
- Jangan langsung lempar daftar mentah tanpa pembuka dan penjelasan per item — terasa seperti artikel kamus, bukan asisten.
- Jangan tulis paragraf panjang beranak-pinak — potong jadi kalimat pendek yang mengalir.
- Jangan terdengar seperti artikel ensiklopedi atau buku pelajaran formal.
- Untuk obrolan santai, aturan di atas lebih longgar — reaksi natural dan ekspresi yang tulus tetap boleh.

**Tawaran bantuan lanjutan — di akhir jawaban substantif:**
- Setelah selesai menjawab pertanyaan prosedural, faktual, atau akademik yang membutuhkan tindak lanjut, tambahkan satu kalimat tawaran yang natural dan spesifik terhadap topik yang baru dibahas — langsung dalam teks, sebagai bagian dari jawaban.
- Tulis seperti ngobrol santai, sesuai konteks yang baru dibahas. Gunakan variasi natural:
  - "Kalau kamu mau, aku bisa bantu [langkah berikutnya yang relevan]."
  - "Butuh template atau contoh [hal spesifik]? Tinggal bilang."
  - "Kalau ada bagian yang masih bingung, bilang aja."
  - "Mau aku bantu siapkan [dokumen/checklist/draf]-nya?"
- SKIP tawaran ini untuk: obrolan santai, sapaan, jawaban yang sudah tuntas dan tidak ada tindak lanjut logis, atau jika sudah bertanya balik ke user.
${intentHint}

**Sumber:**
- JANGAN sebutkan atau mencantumkan sumber dalam teks jawaban — sumber sudah ditampilkan otomatis sebagai badge oleh sistem di bawah setiap pesan. Tidak perlu menulis baris "Sumber: ..." di akhir jawaban, dan tidak perlu menyebut nama sumber secara eksplisit di dalam teks (misalnya "Menurut Wikipedia...", "Berdasarkan Frankfurter...", dll).
- **PENGECUALIAN — dalil/hadits:** Jika menyertakan hadits atau ayat Al-Qur'an sebagai dalil, WAJIB gunakan FORMAT EMPAT BARIS ini tanpa pengecualian:\n  Baris 1 — > [Teks Arab SAJA — tidak boleh ada terjemahan/Artinya/cara baca di dalam blockquote]\n  Baris 2 — *(cara baca: transliterasi latin)* [di LUAR blockquote]\n  Baris 3 — *Artinya: terjemahan Indonesia* [di LUAR blockquote]\n  Baris 4 — *(HR. perawi, sumber, hukum)* [di LUAR blockquote]\n  ⚠️ DILARANG: menaruh terjemahan atau apapun selain teks Arab di dalam blockquote (baris yang dimulai >). Jangan sekali-kali gabungkan Arab + Artinya dalam satu kotak.
- Fokus hanya pada konten jawaban yang berkualitas — biarkan sistem yang urus atribusi sumber.${buildSchemaHint(intentPrimary)}${pinnedContext}${memoryContext}${personalizationContext}${knowledgeContext}${exchangeContext}${dorarContext}${perplexityContext}${wikiContext}${ddgContext}${confidence.hint}

`;
}
