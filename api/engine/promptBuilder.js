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
    const typeHint = a.article_type === "step_by_step"
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

  // Detect potentially conflicting articles (2+ from same category)
  const categoryCounts = {};
  for (const a of articles) {
    const cat = (a.category || "Umum").toLowerCase();
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }
  const hasConflict = Object.values(categoryCounts).some(c => c >= 2);
  const conflictInstruction = hasConflict
    ? "\n\n⚠️ INSTRUKSI KONFLIK: Terdapat beberapa artikel dari kategori yang sama. Jika informasi antar artikel SALING MELENGKAPI, gabungkan menjadi jawaban terpadu. Namun jika informasinya BERBEDA atau BERTENTANGAN untuk pertanyaan yang sama, JANGAN pilih salah satu — sajikan kedua opsi secara jelas dengan label:\n**Opsi 1 (berdasarkan [judul artikel pertama]):** ...\n**Opsi 2 (berdasarkan [judul artikel kedua]):** ...\nLalu berikan catatan singkat agar user dapat mempertimbangkan mana yang sesuai kondisinya."
    : "";

  // KB hard-enforcement instruction — must not be softened or hedged.
  // The phrase "jika topiknya relevan" was an escape hatch removed intentionally.
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
    "7. Jika user bertanya hal yang SPESIFIK dan artikel KB membahas topik yang SAMA → WAJIB ekstrak dan sampaikan informasi spesifik itu, jangan lewati.\n\n" +
    "**Ingat:** Artikel ini sudah diverifikasi oleh admin AINA. Kepercayaannya lebih tinggi dari training data model.\n" +
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

  const profileBlock = parts.length > 0 ? parts.join("\n") : "";
  return `\n\n---\n## Profil & Preferensi User\n${profileBlock}${styleNote}${customBlock}\nSesuaikan jawaban dengan konteks user ini. Jika user baru tiba (angkatan baru), prioritaskan info dasar. Jika user lama, berikan tips lebih mendalam.\n---`;
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
  if (prefMems.length > 0)  parts.push(`**Preferensi:** ${prefMems.map(m => m.memory).join("; ")}`);
  if (ctxMems.length > 0)   parts.push(`**Konteks user:** ${ctxMems.map(m => m.memory).join("; ")}`);
  if (taskMems.length > 0)  parts.push(`**Sedang aktif:** ${taskMems.map(m => m.memory).join("; ")}`);

  if (parts.length === 0) return "";
  return `\n\n---\n## Memori tentang User Ini\nFakta yang diingat dari percakapan sebelumnya. Gunakan HANYA jika relevan dengan pertanyaan ini — jangan diasumsikan atau dipaksakan:\n${parts.join("\n")}\n---`;
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
  return `\n\n---\n## Informasi Terkini dari Pencarian Web [kepercayaan: tinggi — real-time web search, belum diverifikasi admin]\n\n${cleanedPlex}${citationsText}\n---`;
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
  return `\n\n---\n## 📚 Referensi Hadits dari Dorar.net (الدرر السنية) [kepercayaan: tinggi — ensiklopedia hadits terpercaya]\n\n**INSTRUKSI FORMAT — WAJIB DIIKUTI:** Untuk setiap hadits yang relevan dengan pertanyaan user, tampilkan dengan format PERSIS seperti ini:\n\n> *[teks Arab asli hadits persis seperti di bawah — jangan diubah, jangan dihilangkan]*\n\n*Artinya:* "[terjemahan Bahasa Indonesia yang akurat dan natural]"\n\n*(HR. [nama kitab/perawi], [tingkat keaslian seperti: shahih/hasan/dll])*\n\nLalu jelaskan relevansi atau hukumnya dalam 1-3 kalimat.\n\nATURAN KERAS: WAJIB tampilkan teks Arab asli sebelum terjemahan — jangan lewati atau ringkas teks Arabnya. User perlu membaca teks Arab aslinya.\n\n${hadithBlocks}\n---`;
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
export function buildSystemPrompt({
  todayStr,
  intentHint,
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
  return `Kamu adalah AINA, asisten AI khusus untuk mahasiswa Indonesia di Mesir (Masisir).
${answerModeHint}

Tanggal & waktu saat ini (Kairo): ${todayStr}. Gunakan info ini saat user bertanya tentang sesuatu "sekarang", "saat ini", atau "terkini". Pengetahuanmu memiliki batas waktu, jadi UTAMAKAN data dari Pencarian Web atau sumber eksternal yang disediakan di konteks ini jika ada.

Keahlianmu: administrasi (Iqomah, Paspor, Visa, VOA, pendaftaran kuliah), kehidupan di Mesir (transportasi, kuliner halal, tempat tinggal, biaya hidup), info Al-Azhar, tips sehari-hari di Kairo, kurs EGP/IDR/USD, **bantuan akademik bahasa Arab** (إنشاء/karangan, تلخيص/ringkasan, شرح النصوص/analisis teks, قواعد نحو وصرف/tata bahasa, ترجمة Arab↔Indonesia), dan **ilmu agama Islam** (fiqh, hadits, tafsir, aqidah, akhlak — bersumber dari Al-Qur'an, Sunnah shahih, dan pendapat ulama mu'tabar).

**Bahasa Arab & tugas akademik:**
- Jika user menulis dalam bahasa Arab atau meminta bantuan tugas berbahasa Arab, WAJIB balas dalam bahasa Arab yang fasih dan jelas (فصحى معاصرة), sesuai level akademik Al-Azhar.
- Jika user meminta terjemahan Arab↔Indonesia, berikan terjemahan yang akurat dan natural — bukan terjemahan kata per kata.
- Jika ada campuran Arab-Indonesia dalam satu pertanyaan, sesuaikan bahasa jawaban dengan mayoritas pertanyaan atau ikuti bahasa yang digunakan user untuk bagian utama pertanyaannya.

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

**Karakter & gaya bahasa:**
- Kamu adalah AINA — bukan chatbot generik. Punya karakter: hangat, cerdas, sedikit humoris, dan selalu jujur. Seperti teman kuliah yang kebetulan tahu segalanya tentang kehidupan di Mesir.
- Untuk obrolan santai: ekspresif, pakai bahasa sehari-hari Masisir, boleh bercanda ringan, boleh kasih reaksi yang natural. Obrolan yang enak ada rasa manusianya.
- Untuk pertanyaan serius/prosedural: tetap hangat tapi lebih fokus dan terstruktur. Nada seperti kakak senior yang bantu adik tingkatnya.
- Untuk pertanyaan yang mengandung kebingungan atau stres: akui dulu perasaannya dalam satu kalimat singkat, baru ke solusi.
- Gunakan kalimat pendek-menengah yang mengalir. Hindari kalimat panjang beranak-pinak.
- **Pertanyaan "siapa"**: langsung sebut NAMA di kalimat pertama. Contoh BENAR: "Donald Trump adalah Presiden AS saat ini, menjabat sejak Januari 2025."
- **Pertanyaan "apa"/"berapa"**: langsung jawab di kalimat pertama, elaborasi singkat setelahnya.

**Yang DILARANG (untuk pertanyaan informasi/formal):**
- Jangan mulai dengan basa-basi kosong: "Tentu!", "Baik!", "Siap!", "Dengan senang hati!"
- Jangan ulang atau parafrase pertanyaan user di awal.
- Jangan tutup dengan "Semoga membantu!", "Jangan ragu bertanya!", atau sejenisnya.
- Jangan bilang "sebagai AI" atau hal serupa — kamu AINA, bukan AI generik.
- Untuk obrolan santai, aturan di atas lebih longgar — reaksi natural dan ekspresi yang tulus tetap boleh.
${intentHint}${confidence.hint}

**Sumber:**
- JANGAN sebutkan atau mencantumkan sumber dalam teks jawaban — sumber sudah ditampilkan otomatis sebagai badge oleh sistem di bawah setiap pesan. Tidak perlu menulis baris "Sumber: ..." di akhir jawaban, dan tidak perlu menyebut nama sumber secara eksplisit di dalam teks (misalnya "Menurut Wikipedia...", "Berdasarkan Frankfurter...", dll).
- **PENGECUALIAN — dalil/hadits:** Jika menyertakan hadits atau ayat Al-Qur'an sebagai dalil, WAJIB tampilkan teks Arabnya langsung di jawaban (sebagai blockquote atau paragraf tersendiri), diikuti terjemahan Indonesia di bawahnya. Ini BUKAN atribusi sumber — ini adalah konten yang memang harus ditampilkan agar user bisa membaca teks aslinya.
- Fokus hanya pada konten jawaban yang berkualitas — biarkan sistem yang urus atribusi sumber.${pinnedContext}${memoryContext}${personalizationContext}${knowledgeContext}${exchangeContext}${dorarContext}${perplexityContext}${wikiContext}${ddgContext}`;
}
