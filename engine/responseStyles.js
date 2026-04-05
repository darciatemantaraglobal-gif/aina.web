/**
 * api/engine/responseStyles.js
 * Response style system for AINA.
 *
 * Five user-selectable styles that control how AINA structures and tones its answers.
 * The active copy used by the server is inline in server.js (RESPONSE_STYLE_HINTS).
 * This module is kept in sync as the canonical reference.
 */

/* ── Valid style identifiers ──────────────────────────────────────────────── */

export const VALID_RESPONSE_STYLES = new Set([
  "short_direct",
  "step_by_step",
  "detailed_complete",
  "practical_ready_to_use",
  "casual_easy_to_understand",
  "balanced",
]);

/* ── Style → system prompt hint ───────────────────────────────────────────── */

export const RESPONSE_STYLE_HINTS = {
  // Used for: factual, confused
  // Goal: natural and conversational, not encyclopedic. Concise but with structure when needed.
  short_direct: `

⚡ **[GAYA JAWABAN: TERFOKUS & NATURAL]**
Jawab seperti teman yang tahu jawabannya — langsung ke inti, tapi tetap manusiawi.

**Struktur wajib:**
- Baris pertama: 1 kalimat pembuka yang relate langsung dengan pertanyaan (bukan basa-basi, bukan mengulang pertanyaan).
- Isi: paragraf pendek (2–3 kalimat) ATAU daftar bernomor/bullet — pilih yang paling cocok.
  - Jika daftar: SETIAP item harus punya penjelasan 1 kalimat. DILARANG tulis nama saja tanpa keterangan.
- Penutup (opsional): 1 kalimat guidance, saran, atau tawaran spesifik. Skip jika tidak relevan.

**Pantangan:**
- JANGAN buka dengan "Berikut adalah..." atau "Berikut ini..." sebagai kalimat pertama tanpa framing sebelumnya.
- JANGAN terdengar seperti artikel Wikipedia atau kamus.
- JANGAN tulis blok teks lebih dari 3 kalimat berturut-turut.`,

  // Used for: procedural, arabic_writing
  // Goal: clear numbered steps, each step one action only, practical tip if genuinely useful.
  step_by_step: `

📋 **[GAYA JAWABAN: LANGKAH DEMI LANGKAH]**
Awali dengan 1 kalimat framing tentang proses ini (apa tujuannya, kenapa penting).
Lanjut format bernomor (1. 2. 3.) — setiap langkah = SATU aksi spesifik, maks 2 kalimat. Aksi dulu, detail menyusul.
Tambahkan ⚠️ hanya untuk hal kritis yang sering terlewat. Tambahkan 💡 untuk tip yang benar-benar menghemat waktu.
Tutup dengan 1 kalimat guidance konkret: langkah paling penting atau peringatan utama yang tidak boleh dilewatkan.

Untuk pertanyaan faktual/konseptual yang tidak punya urutan langkah: jawab dalam paragraf mengalir, jangan paksakan format bernomor.`,

  // Used for: fiqh
  // Goal: thorough, warm, multi-section. User must understand AND be able to act.
  detailed_complete: `

📖 **[GAYA JAWABAN: MENDALAM & KOMPREHENSIF]**
Pembuka 1–2 kalimat yang tempatkan topik dalam konteks user — hangat, bukan akademik kering.
Isi: latar belakang singkat → penjelasan detail dengan dalil/alasan → catatan penting atau perbedaan pendapat ulama jika ada.
Gunakan ## heading jika ada lebih dari 2 aspek berbeda. Tiap bagian: paragraf pendek 2–3 kalimat, bukan blok teks besar.
Jika ada daftar: setiap item wajib punya penjelasan — bukan sekedar menyebut nama/istilah.
Tutup dengan guidance praktis: apa yang perlu user lakukan atau pertimbangkan setelah memahami ini.

Standar minimal: 3 bagian substantif. Setiap kalimat harus bernilai — tidak ada padding, tidak ada pengulangan.`,

  // Used for: recommendation
  // Goal: positioned numbered options with concrete closing recommendation, NOT checkbox list.
  practical_ready_to_use: `

✅ **[GAYA JAWABAN: REKOMENDASI KONKRET]**
1 kalimat pembuka yang frame konteks: untuk apa ini, siapa yang cocok, atau apa yang membedakan pilihan-pilihan ini.
Daftar bernomor — tiap item WAJIB punya positioning: kenapa cocok, untuk siapa, apa keunggulan utamanya. Bukan sekadar nama.
Tutup dengan rekomendasi konkret yang WAJIB ada: mulai dari mana, mana paling cocok untuk situasi user ini, atau apa yang harus dipertimbangkan pertama.

Gunakan template/checklist hanya jika user memang minta format siap-copy. Default: opsi bernomor dengan positioning.
DILARANG: tutup tanpa rekomendasi konkret. DILARANG: daftar tanpa penjelasan per item.`,

  // Used for: casual, brainstorming
  // Goal: conversational, short sentences, analogies welcome, light emoji ok.
  casual_easy_to_understand: `

💬 **[GAYA JAWABAN: SANTAI & MENGALIR]**
Tulis seperti ngobrol sama teman cerdas — bukan laporan, bukan dokumen resmi, bukan artikel blog.
Kalimat pendek dan ringan. Bahasa sehari-hari. Pakai analogi atau perbandingan sederhana jika membantu.
Kalau terpaksa pakai istilah teknis, langsung jelaskan artinya dalam kalimat berikutnya atau dalam kurung.
Boleh pakai emoji sesekali (max 1–2) kalau terasa natural dan pas.
Jangan heading kecuali kontennya memang kompleks. Jangan terlalu formal atau terstruktur kaku.`,

  // Used for: fallback / unknown intent
  // Goal: sensible default — adaptive format, no forced structure, warm tone.
  balanced: `

⚖️ **[GAYA JAWABAN: ADAPTIF & INFORMATIF]**
Pilih format yang paling cocok dengan jenis pertanyaan — jangan paksa semua jadi daftar.

- Pertanyaan faktual/konseptual → paragraf mengalir, natural, pembuka 1 kalimat, isi terstruktur, guidance penutup.
- Prosedur/langkah → bernomor, satu aksi per langkah.
- Daftar syarat/dokumen/opsi → bullet dengan penjelasan per item.
- Perbandingan → poin bernomor atau tabel, tiap item dengan positioning.
- Obrolan santai → natural, tanpa heading, tanpa daftar kaku.

Kedalaman: substantif dan bermanfaat — bukan panjang demi panjang. Kalimat pendek, paragraf maks 3 kalimat.
JANGAN langsung buka dengan "Berikut adalah..." tanpa kalimat pembuka yang manusiawi.`,
};

/* ── Style detection ──────────────────────────────────────────────────────── */

/**
 * Auto-detect the best response style based on detected query intent.
 *
 * @param {string} intentPrimary - Intent from intentDetector (e.g. "procedural", "fiqh")
 * @returns {string} One of the VALID_RESPONSE_STYLES keys
 */
export function autoDetectResponseStyle(intentPrimary) {
  switch (intentPrimary) {
    case "procedural":     return "step_by_step";
    case "fiqh":           return "detailed_complete";
    case "recommendation": return "practical_ready_to_use";
    case "brainstorming":  return "casual_easy_to_understand";
    case "arabic_writing": return "step_by_step";
    case "factual":        return "short_direct";
    case "casual":         return "casual_easy_to_understand";
    case "confused":       return "short_direct";
    default:               return "balanced";
  }
}

/**
 * Legacy: detect style from user profile fields (kept for backward compatibility).
 * @param {object|null} userProfile
 * @returns {string}
 */
export function detectResponseStyle(userProfile) {
  const rs = userProfile?.responseStyle;
  if (rs && VALID_RESPONSE_STYLES.has(rs)) return rs;

  const am = userProfile?.answerMode;
  if (am === "concise")  return "short_direct";
  if (am === "detailed") return "detailed_complete";

  const rl = userProfile?.responseLength;
  if (rl === "ringkas") return "short_direct";
  if (rl === "lengkap") return "detailed_complete";

  return "step_by_step";
}

/* ── Style → prompt hint builder ──────────────────────────────────────────── */

/**
 * Build the system-prompt injection for the selected response style.
 * Falls back to balanced if an unknown style is passed.
 *
 * @param {string} style
 * @returns {string}
 */
export function buildResponseStyleHint(style) {
  return RESPONSE_STYLE_HINTS[style] ?? RESPONSE_STYLE_HINTS.balanced;
}
