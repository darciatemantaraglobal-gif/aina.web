/**
 * api/engine/responseStyles.js
 * Response style system for AINA.
 *
 * Five user-selectable styles that control how AINA structures and tones its answers.
 * Default: "step_by_step"
 *
 * Extensible: add a new key to VALID_RESPONSE_STYLES and RESPONSE_STYLE_HINTS below.
 */

/* ── Valid style identifiers ──────────────────────────────────────────────── */

export const VALID_RESPONSE_STYLES = new Set([
  "short_direct",
  "step_by_step",
  "detailed_complete",
  "practical_ready_to_use",
  "casual_easy_to_understand",
]);

/* ── Style → system prompt hint ───────────────────────────────────────────── */
// Each hint is injected verbatim into the system prompt to control output structure.

export const RESPONSE_STYLE_HINTS = {
  short_direct: `\n\n**[Gaya Respons: SINGKAT & LANGSUNG]**
Jawab inti pertanyaan dalam 1–3 kalimat. Tanpa pendahuluan atau elaborasi yang tidak diminta.
Jika ada langkah-langkah, batas maksimal 3 poin, masing-masing satu kalimat.
Prioritaskan kepadatan informasi: setiap kata harus punya nilai. Berhenti begitu inti sudah tersampaikan.`,

  step_by_step: `\n\n**[Gaya Respons: LANGKAH DEMI LANGKAH]**
Wajib gunakan format bernomor (1. 2. 3.) untuk setiap langkah atau poin utama.
Setiap nomor = satu aksi atau satu ide yang spesifik. Maksimal 2 kalimat per langkah — aksi dulu, detail menyusul.
Tambahkan ⚠️ atau 💡 hanya jika ada hal kritis yang sering terlewat.
Urutan harus logis dan mudah diikuti dari awal sampai akhir.
Jika pertanyaan tidak cocok format langkah (misalnya faktual singkat), tetap jawab dengan ringkas dan jelas.`,

  detailed_complete: `\n\n**[Gaya Respons: DETAIL & LENGKAP]**
Berikan jawaban yang komprehensif — latar belakang, alasan, langkah-langkah, tips, dan hal yang perlu diwaspadai.
Gunakan heading ## untuk membagi bagian utama. Gunakan bullet atau nomor sesuai konten.
Panjang tidak masalah asalkan setiap kalimat bernilai — tidak ada padding atau pengulangan.
Targetkan pemahaman mendalam: user harus bisa bertindak AND mengerti mengapa, setelah membaca.`,

  practical_ready_to_use: `\n\n**[Gaya Respons: PRAKTIS & SIAP PAKAI]**
Prioritaskan output yang LANGSUNG bisa dipakai tanpa perlu diadaptasi:
- 📋 **Checklist** → gunakan format "- [ ] Langkah..." untuk daftar yang bisa dicentang
- 📝 **Template pesan/surat** → tulis dalam blockquote siap copy-paste
- ⚡ **Aksi langsung** → daftar tindakan konkret berurutan dari yang paling segera
Tandai jenis output dengan label yang sesuai di awal. Minimalis di penjelasan — maksimal di konten siap pakai.
Jika pertanyaan tidak cocok format ini, jawab dengan langkah-langkah konkret yang bisa langsung dieksekusi.`,

  casual_easy_to_understand: `\n\n**[Gaya Respons: SANTAI & MUDAH DIPAHAMI]**
Tulis seperti menjelaskan ke teman — bukan laporan, bukan dokumen resmi.
Gunakan kalimat pendek, bahasa sehari-hari, dan analogi sederhana jika membantu.
Kalau terpaksa pakai istilah teknis, langsung jelaskan artinya dalam kurung atau kalimat berikutnya.
Boleh pakai emoji sesekali (max 1-2) kalau terasa pas dan natural.
Tujuannya: siapapun — termasuk yang baru pertama kali di Mesir — harus bisa langsung ngerti.`,
};

/* ── Style detection ──────────────────────────────────────────────────────── */

/**
 * Detect which response style to apply, with backward compatibility for legacy fields.
 *
 * Priority chain:
 *   1. responseStyle field (new — from frontend selector)
 *   2. answerMode field (legacy)
 *   3. responseLength field (legacy)
 *   4. "step_by_step" (default)
 *
 * @param {object|null} userProfile - Profile object from the request body
 * @returns {string} One of the VALID_RESPONSE_STYLES keys
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
 * Falls back to step_by_step if an unknown style is passed.
 *
 * @param {string} style
 * @returns {string}
 */
export function buildResponseStyleHint(style) {
  return RESPONSE_STYLE_HINTS[style] ?? RESPONSE_STYLE_HINTS.step_by_step;
}
