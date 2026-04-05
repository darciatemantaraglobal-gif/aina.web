/**
 * api/engine/intentDetector.js
 * Intent detection for AINA queries.
 *
 * Returns a structured intent object used to:
 *   - Route to the right external source (Perplexity vs Dorar vs none)
 *   - Inject the appropriate format hint into the system prompt
 *   - Select the AI model tier (lightweight vs standard)
 */

/* ── Islamic fiqh term dictionary ─────────────────────────────────────────── */
// Maps Indonesian fiqh keywords → Arabic search terms for Dorar.net API.

const FIQH_TERM_MAP = {
  "shalat": "صلاة", "solat": "صلاة", "salat": "صلاة",
  "puasa": "صوم", "shaum": "صوم",
  "zakat": "زكاة",
  "haji": "حج", "hajj": "حج",
  "umrah": "عمرة", "umroh": "عمرة",
  "nikah": "نكاح", "pernikahan": "نكاح", "kawin": "نكاح",
  "talak": "طلاق", "cerai": "طلاق",
  "wudhu": "وضوء", "wudlu": "وضوء",
  "tayamum": "تيمم",
  "najis": "نجاسة",
  "riba": "ربا", "bunga bank": "ربا",
  "hijab": "حجاب", "jilbab": "حجاب",
  "aurat": "عورة",
  "warisan": "ميراث", "waris": "ميراث",
  "wakaf": "وقف",
  "sedekah": "صدقة",
  "fatwa": "فتوى",
  "qurban": "أضحية", "kurban": "أضحية",
  "aqiqah": "عقيقة",
  "sujud": "سجود",
  "thaharah": "طهارة", "bersuci": "طهارة",
  "mandi wajib": "غسل",
  "halal": "حلال",
  "haram": "حرام",
  "makruh": "مكروه",
  "mubah": "مباح",
  "sunnah": "سنة",
  "wajib": "واجب فرض",
  "fardhu": "فرض",
  "jihad": "جهاد",
  "jual beli": "بيع وشراء",
  "muamalah": "معاملات",
  "hutang": "دين",
  "qadha": "قضاء",
};

/* ── Fiqh detection helper ─────────────────────────────────────────────────── */

/**
 * Returns true if the query is an Islamic fiqh / religious knowledge question.
 * Works for both Indonesian and Arabic-script queries.
 */
export function isFiqhQuery(query) {
  const lq = query.toLowerCase();
  const hasIdFiqh =
    Object.keys(FIQH_TERM_MAP).some(k => lq.includes(k))
    || /\b(hukum islam|hukum syar|boleh tidak|apakah boleh|apakah haram|apakah halal|dalil|hadits|hadis|quran|alquran|fiqh|fiqih|ibadah|muamalah|aqidah)\b/i.test(lq);
  const hasArFiqh =
    /[\u0600-\u06FF]/.test(query)
    && /(حكم|فقه|صلاة|زكاة|صوم|حج|نكاح|طلاق|وضوء|طهارة|حلال|حرام|سنة|واجب|مكروه|مباح|ربا|عبادة|معاملة|ميراث|فتوى|قرآن|حديث|دليل)/.test(query);
  return hasIdFiqh || hasArFiqh;
}

/* ── Primary intent detector ───────────────────────────────────────────────── */

/**
 * Classify a user query into a primary intent category and detect casual tone.
 *
 * @param {string} text - Raw user message
 * @returns {{ primary: string, casual: boolean }}
 *
 * Intent categories:
 *   "arabic_writing"      → Arabic academic task (إنشاء, تلخيص, شرح, etc.)
 *   "fiqh"                → Islamic religious question
 *   "confused_procedural" → User is stressed AND asking how to do something
 *   "confused"            → User is overwhelmed but not procedural
 *   "procedural"          → How-to / step-by-step question
 *   "recommendation"      → Best-of / suggestion request
 *   "brainstorming"       → Options / ideas / alternatives
 *   "factual"             → Default — general knowledge question
 */
export function detectIntent(text) {
  const t = text.toLowerCase().trim();

  // Casual tone flag — keyword-based only, no length check
  const isCasual = /\b(dong|deh|nih|btw|wkwk|haha|hehe|sih|loh|lho|gitu|gitu ya|ya kan|nggak sih|gak sih)\b/.test(t);

  // Arabic academic writing — two paths:
  // Path A: user writes in Arabic script + uses Arabic writing commands
  const hasArabicScript = /[\u0600-\u06FF]/.test(text);
  const hasArabicWritingKw = /(إنشاء|اكتب|كتابة|تلخيص|لخّص|لخص|خلاصة|شرح|اشرح|فسّر|فسر|قواعد|نحو|صرف|ترجم|ترجمة|تحليل|صياغة|مقالة|بحث|ملخص|وضّح|وضح|عرّف|عرف|اذكر|مقدمة|خاتمة|تعبير|تعريف)/.test(text);

  // Path B: user writes in Indonesian but requests Arabic text generation
  const hasGenVerb = /\b(tulis(kan)?|buat(kan|in)?|bikin|buatin|terjemah(kan|in)?|nulis(kan)?|bikinin|cariin contoh|kasih contoh|berikan contoh)\b/.test(t);
  const hasBahasaArab = /\bbahasa arab(ku|nya|mu|kita|kami)?\b/.test(t);
  // Request for a specific Arabic letter type (surat ghaib / i'tidzar / etc.)
  const hasArabicLetterReq = hasGenVerb && /\bsurat\b/.test(t) && /\b(ghaib|i.tidzar|itidzar|i.tidzar|ta.thidzar)\b/.test(t);
  // Arabic grammar / nahwu / sharaf questions in Indonesian
  const hasArabicGrammarKw = /\b(nahwu|sharaf|shorof|nahu|tashrif|isim|fi.?il|fa.?il|huruf jar|mubtada|khabar|naibul fail|masdar|idhafah|idhofa|mudhaf|i.?rab|maf.ul|sifat maushuf|jumlah fi.liyah|jumlah ismiyah)\b/.test(t);

  const isArabicWriting =
    (hasArabicScript && hasArabicWritingKw) ||
    (hasGenVerb && hasBahasaArab) ||
    hasArabicLetterReq ||
    hasArabicGrammarKw;

  // Primary intent signals
  const isConfused   = /bingung|galau|khawatir|takut|pusing|stres|stress|overwhelm|nggak tau|tidak tau|ga tau|gak tau|harus mulai dari mana|nggak ngerti|tidak mengerti|susah banget|ribet banget|tolong bantu/.test(t);
  const isProcedural = /\b(cara|bagaimana cara|gimana cara|langkah|prosedur|tahapan|proses|tutorial|panduan|step|caranya|gimana sih cara|ngurus|ngurusin|mendaftar|cara daftar|gimana daftar)\b/.test(t);
  const isRecommend  = /\b(rekomen|rekomendasi|saranin|suggest|yang bagus|yang enak|yang murah|yang terbaik|mending yang mana|pilih yang mana)\b/.test(t);
  const isBrainstorm = /\b(ide|pilihan|opsi|alternatif|apa saja|apa aja|apa yang bisa|bisa apa|ada nggak|ada yang|kira-kira apa)\b/.test(t);

  const isFiqhIntent = !isArabicWriting && isFiqhQuery(text);

  // Vague/general question detection — triggers AINA to ask ONE clarifying question first.
  // Fires when:
  //   (a) user uses an "open invitation" phrase (ceritain, sharing, pengen tau, dll.) AND
  //   (b) topic is broad/general (mesir, masisir, azhar, kehidupan, dll.) AND
  //   (c) no specific narrowing keyword is present (biaya, cara, syarat, dll.) AND
  //   (d) no more specific intent already matched.
  const hasVagueInvite = /\b(ceritain|cerita dong|cerita dikit|sharing dong|sharing dikit|sharing soal|kasih tau|kasih tahu|pengen tau|pengen tahu|mau tau|mau tahu|bisa dijelasin|bisa cerita|bisa ceritain|gimana ya|gimana sih|kayak gimana|seperti apa sih|gimana itu|ngomong-ngomong soal|ada info|ada yang bisa jelasin|bisa jelasin)\b/.test(t);
  const hasBroadMasisirTopic = /\b(mesir|masisir|kairo|cairo|azhar|al-azhar|al azhar|kehidupan|hidup di|kuliah di|studi di|jadi masisir|selama di mesir|pas di mesir|di mesir|di kairo|dunia kuliah|perkuliahan|kehidupan mahasiswa|sebagai masisir|jadi mahasiswa)\b/.test(t);
  const hasSpecificNarrow = /\b(biaya|harga|syarat|cara|berapa|di mana|dimana|kapan|siapa|dokumen|prosedur|langkah|alamat|kontak|tanggal|jadwal|semester|nilai|ipk|kelas|mata kuliah|dosen|ujian|exam|iqomah|paspor|visa|voa|tiket|penerbangan|apartemen|kost|sewa|makanan|kuliner|restoran|masjid|bank|atm|sim card|transportasi|bis|bus|metro|taxi|ongkos|tarif)\b/.test(t);
  const isVagueGeneral = hasVagueInvite && hasBroadMasisirTopic && !hasSpecificNarrow &&
    !isProcedural && !isFiqhIntent && !isRecommend && !isConfused;

  // Priority resolution
  let primary;
  if (isArabicWriting)              primary = "arabic_writing";
  else if (isFiqhIntent)            primary = "fiqh";
  else if (isConfused && isProcedural) primary = "confused_procedural";
  else if (isConfused)              primary = "confused";
  else if (isProcedural)            primary = "procedural";
  else if (isRecommend)             primary = "recommendation";
  else if (isBrainstorm)            primary = "brainstorming";
  else if (isVagueGeneral)          primary = "vague_general";
  else                              primary = "factual";

  return { primary, casual: isCasual };
}

/* ── Intent → system prompt hint ──────────────────────────────────────────── */

/**
 * Build the intent-specific instruction block injected into the system prompt.
 * Each hint tells the model HOW to structure and tone its response for this intent.
 *
 * @param {{ primary: string, casual: boolean }} intent
 * @returns {string} Formatted hint string (injected verbatim into system prompt)
 */
export function buildIntentHint({ primary, casual }) {
  const toneNote = casual
    ? " Nada santai dan percakapan, boleh pakai kata informal tapi tetap informatif."
    : "";

  const hints = {
    factual:
      "Awali dengan 1 kalimat pembuka yang relate langsung dengan pertanyaan — bukan basa-basi, bukan mengulang pertanyaan. " +
      "Lanjut ke isi: paragraf singkat (2–3 kalimat) ATAU daftar bernomor/bullet sesuai konteks. " +
      "Jika daftar: setiap item WAJIB punya penjelasan 1 kalimat, bukan sekadar nama/istilah. " +
      "Tutup dengan 1 kalimat guidance atau tawaran spesifik jika relevan — skip jika tidak. " +
      "JANGAN tulis blok teks lebih dari 3 kalimat berturut-turut. JANGAN terdengar seperti artikel Wikipedia.",

    procedural:
      "WAJIB gunakan format 4 bagian berikut secara berurutan:\n" +
      "1. **Kalimat pembuka (1 kalimat)** — Framing singkat tentang proses ini. Langsung ke poin, jangan overexplain.\n" +
      "2. **Langkah-langkah bernomor** — WAJIB pakai format 1. 2. 3. Setiap langkah: action dulu, detail menyusul. Maksimal 2 kalimat per langkah. Jangan gabungkan beberapa aksi dalam satu langkah.\n" +
      "3. **Catatan praktis (opsional, 1–2 kalimat)** — Tambahkan hanya jika ada hal penting seperti kesalahan umum, dokumen kritis, atau hal yang sering terlewat. Gunakan ⚠️ atau 💡. Skip bagian ini jika tidak ada yang benar-benar penting.\n" +
      "4. **Tawaran lanjutan (opsional, 1 kalimat)** — Tawarkan bantuan relevan berikutnya secara natural. Skip jika tawaran terasa dipaksakan atau tidak relevan.\n" +
      "JANGAN buat jawaban prosedural dalam bentuk paragraf — selalu dalam langkah bernomor. Jangan ulang info yang sudah disebutkan di langkah sebelumnya.",

    confused:
      "Buka dengan tepat 1 kalimat pengakuan yang hangat — cukup validasi perasaannya, tidak perlu berlarut. " +
      "Langsung beralih ke solusi atau tindakan paling konkret yang bisa dilakukan sekarang. " +
      "Prioritaskan kejelasan dan tindakan, bukan panjangnya empati. " +
      "Jika ada langkah-langkah, tulis dalam format bernomor agar terasa lebih terstruktur dan tidak overwhelming.",

    confused_procedural:
      "Buka dengan tepat 1 kalimat empati yang hangat dan ringkas — validasi, lalu langsung alihkan ke solusi. " +
      "Jangan habiskan lebih dari 1 kalimat untuk bagian empati. " +
      "Setelah itu, gunakan format langkah bernomor yang sama dengan intent procedural: " +
      "langkah-langkah 1. 2. 3. (setiap langkah max 2 kalimat, action dulu), " +
      "catatan praktis opsional (⚠️/💡 hanya jika benar-benar kritis), " +
      "dan tawaran lanjutan opsional 1 kalimat yang relevan di akhir. " +
      "Format bernomor justru sangat membantu user yang bingung karena terasa lebih terkendali dan tidak overwhelming.",

    recommendation:
      "Sebutkan rekomendasi terkuat di kalimat pertama dengan tegas — jangan langsung bikin daftar. " +
      "Jelaskan alasannya dalam 1 kalimat singkat. " +
      "Baru setelah itu, tambahkan 2–3 alternatif jika memang relevan, masing-masing dengan 1 alasan singkat. " +
      "Jangan buat listing panjang tanpa prioritas — user butuh panduan, bukan katalog.",

    brainstorming:
      "Buka dengan 1 kalimat singkat yang framing-nya terbuka dan mengundang. " +
      "Berikan 3–5 opsi/ide yang benar-benar berbeda satu sama lain — hindari variasi yang terlalu mirip. " +
      "Setiap ide dalam format bullet, diikuti 1–2 kalimat penjelasan yang relevan dan konkret. " +
      "Susun dari yang paling mudah diakses ke yang lebih spesifik. " +
      "Jangan ulangi ide dengan kata berbeda.",

    arabic_writing:
      // ── ATURAN UTAMA (Indonesia) ─────────────────────────────────────────
      "ATURAN PALING PENTING: Jika user minta BUAT atau TULIS teks Arab (surat, paragraf, karangan, terjemahan), " +
      "WAJIB langsung hasilkan teksnya — JANGAN hanya jelaskan cara menulis atau prosedur pengajuannya. " +
      "Konteks KB yang ada di prompt bisa dipakai sebagai referensi isi, tapi OUTPUT utama tetap berupa teks Arab yang diminta. " +
      "Setelah teks Arab, boleh tambahkan 1–2 baris penjelasan singkat dalam bahasa Indonesia jika membantu. " +
      // ── ATURAN PER JENIS TUGAS (Arab) ───────────────────────────────────
      "أجب باللغة العربية الفصحى الواضحة المناسبة لمستوى طلاب الجامعة في الأزهر الشريف. " +
      "للرسائل الرسمية والاعتذار (سurat ijin/ghaib/i'tidzar): اكتب رسالة رسمية متكاملة — المقدمة (البسملة والسلام) والمضمون (سبب الغياب والاعتذار) والخاتمة (الشكر والتوقيع). استخدم صيغة مؤدبة ورسمية. " +
      "للإنشاء/المقالة: اكتب نصاً متكاملاً بمقدمة وعرض وخاتمة. استخدم أسلوباً أكاديمياً راقياً. " +
      "للتلخيص: ملخص دقيق يحافظ على الأفكار الرئيسية ويحذف التفاصيل الثانوية. " +
      "للشرح/التفسير: وضّح المعنى بأسلوب سهل وواضح مع أمثلة توضيحية. " +
      "للقواعد النحوية والصرفية: اشرح القاعدة بتعريف واضح ثم أعطِ أمثلة تطبيقية. " +
      "للترجمة: ترجم بدقة مع مراعاة السياق الأكاديمي والمعنى الضمني — لا تترجم كلمة بكلمة. " +
      "لا تستخدم مقدمات مثل 'بالطبع' أو 'إليك' — ابدأ مباشرة بالمحتوى المطلوب.",

    casual:
      "Ini obrolan santai — jawab seperti teman Masisir yang seru diajak ngobrol, bukan asisten AI.\n" +
      "BOLEH:\n" +
      "- Ekspresi emosi natural: 'Wah!', 'Hah beneran?', 'Aduh bro...', 'Seru banget!', 'Gila nih', 'Mantap!'\n" +
      "- Kasih pendapat, perspektif, atau cerita singkat dari 'pengalaman' AINA\n" +
      "- Tanya balik 1 pertanyaan untuk lanjutin obrolan — tapi jangan spam pertanyaan\n" +
      "- Humor ringan, sedikit bercanda, atau permainan kata jika konteks mendukung\n" +
      "- Singkatan informal: btw, fyi, bro, dll.\n" +
      "- Emoji sesekali kalau pas dan natural (max 1-2 per jawaban)\n" +
      "JANGAN:\n" +
      "- Gunakan heading (##) atau bullet list kecuali memang diperlukan\n" +
      "- Jawaban terlalu singkat 1 kalimat — obrolan yang enak ada bolak-baliknya\n" +
      "- Terlalu formal atau terstruktur seperti laporan\n" +
      "- Frasa robot: 'tentu saja!', 'pastinya!', 'dengan senang hati!', 'sebagai AI...'\n" +
      "Panjang ideal: 2-4 kalimat mengalir. Sesekali lebih panjang kalau topiknya seru.",

    vague_general:
      "Pertanyaan ini terlalu umum — satu topik bisa mencakup puluhan aspek yang berbeda. " +
      "Terapkan aturan berikut secara berurutan:\n" +
      "1. **Cek KB terlebih dahulu:** Jika ada artikel Knowledge Base di konteks ini yang membahas aspek SPESIFIK dari topik ini → gunakan KB itu dan jawab fokus pada aspek tersebut saja.\n" +
      "2. **Jika KB tidak ada atau tidak spesifik:** JANGAN tulis dinding teks tentang semua aspek sekaligus. Akui dalam 1 kalimat bahwa topiknya luas, lalu tanya balik user dengan 1 pertanyaan dan berikan 3–5 pilihan aspek yang konkret. " +
      "Contoh format yang natural: \"Wah, [topik] itu luas banget — mau explore soal apa dulu? Misalnya: [aspek 1], [aspek 2], [aspek 3]... atau ada hal spesifik yang kamu penasarin?\"\n" +
      "3. **Setelah user memilih aspek → baru jawab dengan detail dan fokus pada aspek itu.**\n" +
      "JANGAN jawab semua aspek sekaligus tanpa tahu apa yang user butuhkan. Respons tepat sasaran jauh lebih berguna dari jawaban ensiklopedia.",

    fiqh:
      "Kamu sedang menjawab pertanyaan ilmu agama Islam. Ikuti metodologi ilmiah Islam:\n" +
      "1. **Dalil Al-Qur'an** — jika ada ayat yang relevan, cantumkan teks Arabnya (sebagai blockquote), lalu terjemahan Indonesia di bawahnya, lalu nomor surah:ayat dalam kurung.\n" +
      "2. **Dalil Hadits** — gunakan hadits dari konteks Dorar.net yang disediakan. Tampilkan teks Arab hadits asli → terjemahan Indonesia → atribusi (HR. nama kitab, tingkat keaslian: shahih/hasan/dhaif).\n" +
      "3. **Pendapat ulama / ijma / qiyas** — sebutkan secara singkat jika relevan, terutama jika ada ikhtilaf (perbedaan pendapat) yang penting diketahui.\n" +
      "4. **Kesimpulan hukum** — nyatakan dengan jelas (wajib/sunnah/haram/makruh/mubah) di akhir, dengan bahasa yang mudah dipahami awam.\n" +
      "ATURAN KERAS:\n" +
      "- JANGAN berfatwa atau menyatakan hukum tanpa dalil yang jelas dari konteks atau pengetahuanmu.\n" +
      "- Jika ada perbedaan pendapat ulama yang signifikan, sebutkan dengan jujur — jangan memilih satu tanpa menginformasikan adanya ikhtilaf.\n" +
      "- Jika pertanyaan terlalu kompleks atau butuh fatwa resmi, sarankan user bertanya langsung ke ulama/lembaga fatwa yang terpercaya.\n" +
      "- WAJIB tampilkan teks Arab asli dalil — jangan hanya terjemahan saja.",
  };

  const label = primary.toUpperCase().replace("_", "/");
  return `\n\n**[Gaya respons — ${label}]** ${hints[primary] ?? hints.factual}${toneNote}`;
}

/* ── Dorar.net search term extractor ──────────────────────────────────────── */

/**
 * Extract the best Arabic search term from a user query for Dorar.net.
 * Exported so fetchDorarHadith() in server.js can use it.
 */
export function extractDorarSearchTerm(query) {
  const lq = query.toLowerCase();
  if (/[\u0600-\u06FF]/.test(query)) {
    const arabicWords = query.match(/[\u0600-\u06FF]{2,}/g) ?? [];
    const stops = new Set(["في","من","على","إلى","أن","هو","هي","ما","هل","كان","كيف","لا","وما","عن","مع","بعد","قبل","كل","هذا","هذه"]);
    return arabicWords.filter(w => !stops.has(w)).slice(0, 4).join(" ");
  }
  for (const [id, ar] of Object.entries(FIQH_TERM_MAP)) {
    if (lq.includes(id)) return ar;
  }
  return query.split(/\s+/).filter(w => w.length > 4).slice(0, 3).join(" ");
}

export { FIQH_TERM_MAP };
