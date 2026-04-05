/**
 * api/engine/contextDetector.js
 *
 * Scoring-based Masisir context detection system.
 * Replaces the monolithic boolean isLocalMasisirQuery() with a structured,
 * category-aware detector that returns confidence scores and matched terms.
 *
 * Output shape:
 *   { isLocal: boolean, score: number, matchedTerms: string[],
 *     matchedCategories: string[], confidence: "low" | "medium" | "high" }
 */

// ═══════════════════════════════════════════════════════════════════
// TYPO NORMALIZATION
// Common misspellings by Masisir users — normalize before detection
// ═══════════════════════════════════════════════════════════════════
const TYPO_NORM = [
  // Travel
  [/\bdunai\b/g, "dubai"],
  [/\bdubay\b/g, "dubai"],
  // Iqomah variants
  [/\biqoma\b/g, "iqomah"],
  [/\bikomah\b/g, "iqomah"],
  [/\bigamah\b/g, "iqomah"],
  [/\bikamah\b/g, "iqomah"],
  [/\biqoamah\b/g, "iqomah"],
  [/\biqaamah\b/g, "iqomah"],
  [/\biqamah\b/g, "iqomah"],
  // Exam terms
  [/\bimtehan\b/g, "imtihan"],
  [/\bimtehon\b/g, "imtihan"],
  [/\bimtehaan\b/g, "imtihan"],
  [/\bimtihaan\b/g, "imtihan"],
  [/\bumtihan\b/g, "imtihan"],
  // Academic
  [/\btasjheel\b/g, "tasjil"],
  [/\btasjeel\b/g, "tasjil"],
  [/\btasjeel\b/g, "tasjil"],
  [/\bmuqarar\b/g, "muqorror"],
  [/\bmugharar\b/g, "mugharrar"],
  [/\bmuqarrar\b/g, "muqorror"],
  [/\bsyafaahi\b/g, "syafahi"],
  [/\btahriiri\b/g, "tahriri"],
  // Housing
  [/\bsakaan\b/g, "sakan"],
  [/\bsyaq+a\b/g, "syaqa"],
];

function normalizeTypos(text) {
  let t = text.toLowerCase();
  for (const [re, repl] of TYPO_NORM) t = t.replace(re, repl);
  return t;
}

// ═══════════════════════════════════════════════════════════════════
// VOCABULARY CATEGORIES
// Each category has: terms[], patterns[]
// terms  → exact word/phrase matches (+2 per match, capped at +6/cat)
// patterns → regex structural matches (+3 per match, no cap)
// ═══════════════════════════════════════════════════════════════════
const CATEGORIES = {

  // ── 1. Al-Azhar Academic ─────────────────────────────────────────
  akademik_al_azhar: {
    terms: [
      // Exams
      "imtihan", "tahriri", "syafahi", "takmili",
      // Grading
      "taqdir", "mumtaz", "jayyid jiddan", "jayyid", "maqbul",
      // Registration — "tasjil" alone is Al-Azhar specific
      "tasjil", "tasjil azhar", "rasm tasjil", "qaid tasjil", "rasm imtihan",
      "pendaftaran ulang azhar", "daftar ulang azhar",
      // Advanced study
      "dirasat ulya", "majistir", "doktorah", "phd azhar",
      // Language center
      "markaz lughah", "pusat bahasa azhar",
      // Faculties / levels
      "kulliyah", "kulliyat", "sanah ula", "sanah sani", "sanah salas",
      "sanah rabi", "sanah khamis", "lisensi", "isnad",
      // Certificates
      "syahadah azhar", "ijazah azhar", "shahada qaid",
      // Syllabus/books
      "muqorror", "mugharrar", "manhaj azhar", "kitab wajib",
      // Systems
      "azhar online", "mazaya card", "karneh azhar", "kartu azhar",
      // MORA / scholarship
      "mora", "pbsb", "beasiswa azhar", "beasiswa mesir",
    ],
    patterns: [
      /\bimtihan\s*(kapan|bulan|jadwal|minggu|semester|tahriri|syafahi|susulan)\b/,
      /\b(jadwal|tanggal|kapan)\s*(imtihan|ujian\s*azhar)\b/,
      /\b(hasil|nilai|taqdir|score)\s*(imtihan|ujian)\b/,
      /\b(tagrif|takrarul?|mudzakarah|murojaah)\s*(imtihan|pelajaran)?\b/,
      /\b(qaid|rasm|tasjil)\s*(al.?azhar|azhar)\b/,
      /\b(shahada|surat|ijazah)\s*qaid\b/,
      /\b(markaz|pusat)\s*lugh?ah?\b/,
      /\bkuliah\s*(di\s*)?(azhar|al.?azhar|mesir)\b/,
      /\bdirasat\s*ulya\b/,
      /\b(lulus|wisuda)\s*(azhar|al.?azhar)\b/,
      /\b(semester|tahun\s*ajaran)\s*(azhar|al.?azhar)\b/,
      /\b(muqorror|mugharrar|manhaj)\s*(azhar|al.?azhar)?\b/,
      /\b(pbsb|mora)\s*(mesir|azhar|scholarship)?\b/,
    ],
  },

  // ── 2. Egypt Administration & Documents ──────────────────────────
  administrasi_mesir: {
    terms: [
      // Residence permit — all variants
      "iqomah", "izin tinggal mesir",
      // Immigration authority
      "jawazat", "tarhil", "deportasi mesir",
      // Embassy
      "kbri", "kbri kairo", "kbri cairo", "kbri mesir",
      // Other official docs
      "tasrih", "taqyid", "tamlik",
      "apostille mesir", "legalisasi mesir",
      // Student status docs
      "ppln", "dpln", "dptln", "surat ppln",
      "surat keterangan mahasiswa azhar",
      // Visa types Egypt-context
      "visa pelajar mesir", "visa belajar mesir", "visa student mesir",
      // Common Masisir admin terms
      "pendaftaran konsulat", "legalisasi kbri",
    ],
    patterns: [
      /\b(perpanjang|urus|buat|bikin|ngurus|renew)\s*(iqomah|iqama|igamah|izin\s*tinggal)\b/,
      /\b(iqomah|iqama)\s*(expired?|habis|mati|kadaluarsa|mau\s*habis)\b/,
      /\b(iqomah|iqama)\s*(berapa|biaya|biayanya|prosedur|langkah|syarat)\b/,
      /\bkbri\s*(kairo|cairo|mesir|itu)?\b/,
      /\bjawazat\b/,
      /\btarhil\b/,
      /\b(surat|dokumen|berkas)\s*(konsulat|kbri|kedubes)\b/,
      /\b(apostille|legalisasi)\s*(mesir|dokumen|surat)?\b/,
      /\bvisa\s*(pelajar|belajar|student)\s*(mesir|egypt|kairo)?\b/,
      /\b(masalah|urusan)\s*(iqomah|imigrasi|jawazat)\b/,
    ],
  },

  // ── 3. Cairo Daily Life & Housing ────────────────────────────────
  kehidupan_kairo: {
    terms: [
      // Housing terms
      "sakan", "syaqa", "fawar", "hawl", "rumah kontrakan kairo",
      // Cairo districts common for Masisir
      "hay asyir", "hay asher", "nasr city", "madinat nasr",
      "darrasah", "abbasiyya", "abbasyia",
      "alf maskan", "alif maskan", "bawwabat",
      "hay sabi", "hay sabe", "hay thamin", "hay tamine",
      "hay tasi", "hay sadis", "hay awwal", "hay sani",
      "basatin", "hadaiq qubba", "zaytoun",
      // Markets and shops
      "fathallah", "bim market", "bim seka", "attaba",
      "wakala balah", "roxy", "souq", "suq gemalia",
      // Food delivery & transport apps
      "talabat", "elimenu", "careem", "indrive", "uber mesir",
      // Transport
      "microbus kairo", "metro kairo", "metro masri",
    ],
    patterns: [
      /\b(cari|sewa|kontrak|nyari|mau)\s*(sakan|syaqa|kost?|kamar|apartemen|flat|rumah)\s*(di\s*)?(kairo|mesir|hay)?\b/,
      /\b(harga|biaya|budget|ongkos)\s*(sakan|sewa|kost)\s*(di\s*)?(kairo|mesir|hay|nasr)?\b/,
      /\bbiaya\s*hidup\s*(di\s*)?(kairo|mesir)\b/,
      /\b(hay|kawasan|area|daerah)\s*(asyir|asher|10|nasr|darrasah|abbasiyya)\b/,
      /\b(fathallah|bim\s*market|attaba|wakala)\b/,
      /\b(microbus|metro|subway)\s*(kairo|mesir|ke|dari|nomor|jurusan)?\b/,
      /\b(transportasi|naik\s*apa|rute)\s*(di\s*)?(kairo|mesir|hay)?\b/,
      /\b(pesan|order)\s*(talabat|elimenu|careem)\b/,
      /\bnyaman\s*(di|tinggal)\s*(hay|nasr|darrasah|kairo)\b/,
      /\b(fawar|air\s*panas|hawl|listrik)\s*(sakan|flat|syaqa)?\b/,
    ],
  },

  // ── 4. Transport & Navigation in Cairo ────────────────────────────
  transportasi_kairo: {
    terms: [
      "microbus", "metro kairo", "tuktuk kairo",
      "hay asyir ke", "darrasah ke", "rute kairo",
    ],
    patterns: [
      /\b(ke\s*sana|kesana|ke\s*situ|ke\s*sini)\b.*\b(hay|darrasah|azhar|nasr|kairo)\b/,
      /\b(hay\s*(asyir|asher|sabi|thamin|tasi|sadis|awwal|sani|kamil|khamis|10|7|8|9|6|5|4|3|2|1))\b.*\b(ke|dari|rute|naik)\b/,
      /\b(naik\s*apa|gimana\s*ke|cara\s*ke|rute\s*(ke|dari))\b.*\b(darrasah|azhar|hay|nasr|kairo|attaba|abbasiyya)\b/,
      /\b(microbus|metro)\s*(ke|dari|nomor|jurusan|rute|berapa)\b/,
      /\b(bis|bus|mikrobus)\s*(ke|nomor|jurusan)\b.*\b(kairo|mesir|hay|darrasah)\b/,
      /\b(dari|ke)\s*(darrasah|abbasiyya|hay\s*asyir|nasr\s*city)\b/,
      /\b(uber|careem|grab|indrive)\s*(kairo|mesir|ke|dari)\b/,
    ],
  },

  // ── 5. Travel from Egypt (Masisir context) ───────────────────────
  travel_masisir: {
    terms: [
      // Rihlah / travel programs
      "rihlah masisir", "wisata masisir",
      // Visa context from Egypt  
      "visa dubai", "visa turki", "visa jordan", "visa eropa dari mesir",
      // Airport
      "airport kairo", "bandara kairo", "cairo airport",
      "terminal kairo", "terminal 2 kairo", "terminal 3 kairo",
      // Transit
      "transit kairo", "transit dubai", "transit istanbul",
      // Tickets
      "tiket mesir", "tiket kairo", "tiket jakarta kairo",
    ],
    patterns: [
      /\bvisa\s*dubai\b/,
      /\bvisa\s*turki\b/,
      /\bvisa\s*(jordan|yordania)\b/,
      /\bvisa\s*(eropa|eropa)\s*(dari|untuk)\s*(mesir|kairo)\b/,
      /\btransit\s*(di\s*)?(kairo|dubai|istanbul)\b/,
      /\b(airport|bandara)\s*(kairo|cairo|mesir)\b/,
      /\brihlah\s*(masisir|ke|dari|mahasiswa)?\b/,
      /\b(tiket|penerbangan)\s*(ke\s*)?(mesir|kairo|cairo|egypt)\b/,
      /\b(pulang|balik)\s*(ke\s*)?(indonesia|jakarta|surabaya)\s*(dari\s*)?(mesir|kairo)?\b/,
      /\b(check.?in|bagasi)\s*(bandara|airport)\s*(kairo|cairo|mesir)?\b/,
    ],
  },

  // ── 6. Masisir Community & Organizations ─────────────────────────
  komunitas_masisir: {
    terms: [
      // Catch-all
      "masisir", "mahasiswa indonesia mesir", "pelajar indonesia mesir",
      // Umbrella orgs
      "ppmi", "ppmi mesir", "ppi mesir",
      // Kekeluargaan by region (partial list — broad)
      "kekeluargaan", "paguyuban", "imaba", "isma", "imabi",
      "gamajatim", "permika", "ikama", "fosmabi", "ikaluin",
      "forkis", "kmm", "ismafar", "ikpm", "forsada", "gamasi",
      "kpmjb", "kpmjt", "himdamesi", "himalaya", "himsatesi",
      "fosimaba", "pknm", "ikaluin mesir", "imaba mesir",
      // Events
      "masisir cup", "bazar masisir", "rihlah ppmi",
      "dana darurat ppmi", "sekretariat ppmi",
      // Indonesia hub spots
      "warung indonesia kairo", "kantin indonesia mesir",
      "resto indonesia mesir",
    ],
    patterns: [
      /\bmasisir\b/,
      /\b(organisasi|komunitas|kekeluargaan)\s*(indonesia\s*)?(di\s*)?(mesir|kairo)\b/,
      /\b(ppmi|ppi\s*mesir)\b/,
      /\b(warung|kantin|resto(ran)?)\s*indonesia\s*(di\s*)?(mesir|kairo|hay)?\b/,
      /\b(bazar|event|acara)\s*masisir\b/,
      /\b(mahasiswa|pelajar)\s*indonesia\s*(di\s*)?(mesir|kairo|azhar)\b/,
      /\b(senior|angkatan|junior)\s*masisir\b/,
      /\bgrup\s*(whatsapp|wa|telegram)\s*(masisir|ppmi|kekeluargaan)\b/,
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════
// NEGATIVE CONTEXT
// These patterns indicate the query is fiqh/ibadah focused,
// NOT about Masisir admin/life. Only suppress at low scores.
// ═══════════════════════════════════════════════════════════════════
const NEGATIVE_PATTERNS = [
  // Fiqh iqomah (prayer call, not residence permit)
  /\b(shalat|salat|solat)\s*(setelah\s*)?(iqomah|iqama)\b/,
  /\b(iqomah|iqama)\s*(shalat|salat|solat|jamaah)\b/,
  /\b(bacaan|lafaz|doa|cara|hukum)\s*(iqomah|adzan|iqama)\b/,
  /\b(adzan|azan)\s*(dan|serta|&|kemudian)\s*(iqomah|iqama)\b/,
  // Pure ibadah queries with no Masisir anchor
  /^(cara|hukum|waktu|doa|niat)\s*(shalat|salat|solat|adzan|wudhu|puasa|zakat)\b/,
  // Waktu shalat — always fiqh, never Masisir
  /\bwaktu\s*(shalat|salat|solat)\b/,
  /\bjadwal\s*(shalat|salat|solat)\b/,
];

// ═══════════════════════════════════════════════════════════════════
// SCORE THRESHOLDS
// ═══════════════════════════════════════════════════════════════════
const SCORE_LOCAL_THRESHOLD = 2;

function toConfidence(score) {
  if (score >= 5) return "high";
  if (score >= 2) return "medium";
  return "low";
}

// ═══════════════════════════════════════════════════════════════════
// MAIN EXPORTED FUNCTION
// ═══════════════════════════════════════════════════════════════════

/**
 * detectMasisirContext(rawText)
 *
 * @param {string} rawText — the user query (raw, any case)
 * @returns {{ isLocal: boolean, score: number, matchedTerms: string[],
 *             matchedCategories: string[], confidence: "low"|"medium"|"high" }}
 */
export function detectMasisirContext(rawText) {
  const text = normalizeTypos(rawText || "");

  let score = 0;
  const matchedTerms = [];
  const matchedCategories = new Set();
  let negativeScore = 0;

  // ── Check negative context first ──────────────────────────────────
  for (const pat of NEGATIVE_PATTERNS) {
    if (pat.test(text)) negativeScore++;
  }

  // ── Score each category ───────────────────────────────────────────
  for (const [catName, cat] of Object.entries(CATEGORIES)) {
    let catScore = 0;

    // Term matches (+2 each, cap at 6 per category)
    for (const term of cat.terms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                          .replace(/\s+/g, "\\s+");
      const re = new RegExp(`\\b${escaped}\\b`, "i");
      if (re.test(text)) {
        catScore += 2;
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
        if (catScore >= 6) break; // cap per category
      }
    }

    // Pattern matches (+3 each, no cap — patterns are high-signal)
    for (const pat of cat.patterns) {
      if (pat.test(text)) {
        catScore += 3;
        const m = text.match(pat);
        if (m) {
          const key = `[${catName}] ${m[0].trim()}`;
          if (!matchedTerms.includes(key)) matchedTerms.push(key);
        }
      }
    }

    if (catScore > 0) {
      score += catScore;
      matchedCategories.add(catName);
    }
  }

  // ── Apply negative penalty ────────────────────────────────────────
  // Only reduces score when Masisir signal is weak AND ibadah is strong.
  // Does NOT suppress if score is already high (real Masisir query).
  const effectiveScore = (negativeScore > 0 && score < 5)
    ? Math.max(0, score - (negativeScore * 2))
    : score;

  const isLocal = effectiveScore >= SCORE_LOCAL_THRESHOLD;
  const confidence = toConfidence(effectiveScore);

  return {
    isLocal,
    score: effectiveScore,
    matchedTerms,
    matchedCategories: [...matchedCategories],
    confidence,
  };
}

/**
 * Backward-compatible boolean wrapper.
 * Drop-in replacement for the old isLocalMasisirQuery(text).
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isLocalMasisirQuery(text) {
  return detectMasisirContext(text).isLocal;
}

// ═══════════════════════════════════════════════════════════════════
// BUILT-IN TESTS
// Run: node api/engine/contextDetector.js
// ═══════════════════════════════════════════════════════════════════
function runTests() {
  const PASS = "✅";
  const FAIL = "❌";

  const cases = [
    // ── Should detect as Masisir (isLocal: true) ──
    { q: "cara urus iqomah",              expect: true,  label: "iqomah procedural" },
    { q: "iqomah expired gimana",         expect: true,  label: "iqomah expired" },
    { q: "imtihan kapan semester ini",    expect: true,  label: "imtihan schedule" },
    { q: "nilai imtihan keluar belum",    expect: true,  label: "imtihan result" },
    { q: "biaya sakan di hay asyir",      expect: true,  label: "sakan hay asyir" },
    { q: "kbri kairo jam berapa buka",    expect: true,  label: "kbri hours" },
    { q: "visa dubai gimana dari mesir",  expect: true,  label: "visa dubai from Egypt" },
    { q: "ppmi mesir ada acara apa",      expect: true,  label: "ppmi event" },
    { q: "microbus ke darrasah dari mana", expect: true, label: "transport darrasah" },
    { q: "tahriri azhar kapan mulai",     expect: true,  label: "tahriri exam" },
    { q: "dirasat ulya di azhar gimana",  expect: true,  label: "postgrad azhar" },
    { q: "kekeluargaan jawa timur mesir", expect: true,  label: "kekeluargaan" },
    { q: "apostille mesir itu apa",       expect: true,  label: "apostille mesir" },
    { q: "rasm tasjil azhar 2025",        expect: true,  label: "rasm tasjil" },
    { q: "masisir",                       expect: true,  label: "masisir standalone" },
    // ── Typo normalization ──
    { q: "iqoma gimana cara perpanjang",  expect: true,  label: "typo: iqoma→iqomah" },
    { q: "imtehan azhar kapan",           expect: true,  label: "typo: imtehan→imtihan" },
    { q: "tasjheel azhar itu apa",        expect: true,  label: "typo: tasjheel→tasjil" },
    { q: "visa dunai dari kairo",         expect: true,  label: "typo: dunai→dubai" },
    // ── Should NOT detect as Masisir (isLocal: false) ──
    { q: "bagaimana cara shalat yang benar",      expect: false, label: "shalat fiqh" },
    { q: "bacaan iqomah shalat maghrib",          expect: false, label: "iqomah shalat = prayer call" },
    { q: "jadwal shalat kairo",                   expect: false, label: "jadwal shalat = ibadah" },
    { q: "hukum adzan dan iqomah bagi wanita",    expect: false, label: "adzan+iqomah fiqh" },
    { q: "cara membuat pizza",                    expect: false, label: "unrelated" },
    { q: "siapa presiden indonesia",              expect: false, label: "general knowledge" },
    { q: "rumus fisika momentum",                 expect: false, label: "physics" },
  ];

  let passed = 0;
  let failed = 0;

  console.log("\n══ contextDetector — Test Suite ══\n");
  for (const tc of cases) {
    const result = detectMasisirContext(tc.q);
    const ok = result.isLocal === tc.expect;
    if (ok) passed++;
    else failed++;
    const icon = ok ? PASS : FAIL;
    const score = `score:${result.score}`.padEnd(10);
    const conf = `conf:${result.confidence}`.padEnd(12);
    const cats = result.matchedCategories.join(", ") || "—";
    console.log(`${icon} [${tc.label}]`);
    console.log(`   q: "${tc.q}"`);
    console.log(`   ${score}${conf}cats: ${cats}`);
    if (result.matchedTerms.length > 0) {
      console.log(`   terms: ${result.matchedTerms.slice(0, 4).join(" | ")}`);
    }
    if (!ok) {
      console.log(`   ⚠️  expected isLocal:${tc.expect} but got isLocal:${result.isLocal}`);
    }
    console.log();
  }

  console.log(`══ Results: ${passed}/${cases.length} passed, ${failed} failed ══\n`);
}

// Run tests if executed directly
if (process.argv[1] && process.argv[1].endsWith("contextDetector.js")) {
  runTests();
}
