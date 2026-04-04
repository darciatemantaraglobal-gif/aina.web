/**
 * api/engine/queryExpander.js
 *
 * Query expansion + meaning resolution for AINA's retrieval pipeline.
 *
 * Purpose:
 *   Short/ambiguous user queries often miss KB articles because they
 *   don't share enough vocabulary. This module expands them into
 *   richer retrieval queries — without changing the displayed message.
 *
 * Pipeline:
 *   1. Pattern-based expansion  — short procedural queries → full intent phrase
 *   2. Context anchoring        — Masisir terms get Egypt-context suffixes
 *   3. Category context boost   — 1-2 word queries get category context
 *   4. Strategy selection       — kb_first | dynamic | general
 *
 * All operations are synchronous and pure (no I/O).
 */

// ═══════════════════════════════════════════════════════════════════
// EXPANSION RULES
// Applied in order — first match wins.
// expand: string  → replace query entirely
// expand: fn(q)   → transform query
// ═══════════════════════════════════════════════════════════════════
const EXPANSION_RULES = [
  // ── Administration ───────────────────────────────────────────────
  {
    match: /\b(iqomah|iqama)\b.*\b(habis|expired?|mati|kadaluarsa|mau\s*habis)\b/i,
    expand: "cara perpanjang iqomah mesir izin tinggal expired prosedur dokumen",
  },
  {
    match: /\b(perpanjang|renew)\b.*\b(iqomah|iqama)\b/i,
    expand: "prosedur perpanjang iqomah izin tinggal mesir syarat dokumen biaya",
  },
  {
    match: /\b(cara|gimana|bagaimana|prosedur|langkah)\b.*\b(iqomah|iqama)\b/i,
    expand: "prosedur mengurus iqomah izin tinggal mahasiswa Indonesia di Mesir",
  },
  {
    match: /\bkbri\b.*\b(buka|tutup|jam|jadwal|kontak|alamat|telepon)\b/i,
    expand: "jam operasional KBRI Kairo kontak alamat jadwal pelayanan konsulat Indonesia Mesir",
  },
  {
    match: /\bjawazat\b/i,
    expand: "jawazat imigrasi Mesir iqomah izin tinggal prosedur",
  },
  {
    match: /\bapostille\b/i,
    expand: "apostille mesir legalisasi dokumen Indonesia prosedur KBRI",
  },

  // ── Al-Azhar Academic ────────────────────────────────────────────
  {
    match: /\bimtihan\b.*\b(kapan|jadwal|tanggal|mulai|bulan|semester)\b/i,
    expand: "jadwal imtihan Al-Azhar tanggal mulai semester ujian tahriri syafahi",
  },
  {
    match: /\b(kapan|jadwal|tanggal)\b.*\bimtihan\b/i,
    expand: "jadwal imtihan Al-Azhar tanggal mulai semester tahriri syafahi",
  },
  {
    match: /\b(nilai|hasil|taqdir)\b.*\b(imtihan|ujian)\b/i,
    expand: "cara cek nilai taqdir imtihan Al-Azhar hasil ujian akademik",
  },
  {
    match: /\btahriri\b/i,
    expand: q => `${q} ujian tulis Al-Azhar jadwal imtihan semester`,
  },
  {
    match: /\bsyafahi\b/i,
    expand: q => `${q} ujian lisan Al-Azhar jadwal imtihan`,
  },
  {
    match: /\bdirasat\s*ulya\b/i,
    expand: "dirasat ulya program pascasarjana Al-Azhar syarat pendaftaran beasiswa",
  },
  {
    match: /\b(rasm|biaya)\s*(tasjil|pendaftaran)\b.*\b(azhar|al.azhar)\b/i,
    expand: "rasm tasjil biaya pendaftaran ulang Al-Azhar prosedur pembayaran",
  },
  {
    match: /\bqaid\s*tasjil\b/i,
    expand: "qaid tasjil kartu mahasiswa Al-Azhar pendaftaran nomor induk",
  },
  {
    match: /\bmuqorror\b|\bmugharrar\b/i,
    expand: q => `${q} buku wajib manhaj Al-Azhar daftar pelajaran`,
  },
  {
    match: /\bmarkaz\s*lugh?ah?\b/i,
    expand: "markaz lughah pusat bahasa Arab Al-Azhar pendaftaran biaya level",
  },

  // ── Housing ──────────────────────────────────────────────────────
  {
    match: /\b(cari|nyari|sewa|mau|butuh)\b.*\b(sakan|syaqa|kost|apartemen|flat)\b/i,
    expand: q => `${q} harga per bulan hay asyir nasr city kairo lokasi murah Masisir`,
  },
  {
    match: /\bbiaya\s*hidup\b/i,
    expand: "biaya hidup mahasiswa Indonesia di Kairo Mesir per bulan sakan makan transport",
  },
  {
    match: /\b(fawar|air\s*panas)\b.*\b(sakan|flat|syaqa)?\b/i,
    expand: "fawar air panas sakan mesir kairo apartemen mahasiswa",
  },

  // ── Travel ───────────────────────────────────────────────────────
  {
    match: /\bvisa\s*dubai\b/i,
    expand: "cara mengurus visa dubai dari kairo mesir syarat dokumen mahasiswa Masisir",
  },
  {
    match: /\bvisa\s*turki\b/i,
    expand: "cara mengurus visa turki dari kairo mesir syarat dokumen",
  },
  {
    match: /\btransit\s*(di\s*)?(dubai|istanbul|kairo)\b/i,
    expand: q => `${q} prosedur transit bandara visa keperluan dokumen`,
  },
  {
    match: /\b(airport|bandara)\s*(kairo|cairo|mesir)\b.*\b(ke|dari|cara|rute|naik)\b/i,
    expand: "transportasi dari ke airport kairo cairo international rute cara naik metro microbus",
  },

  // ── Transport ────────────────────────────────────────────────────
  {
    match: /\b(microbus|metro)\b.*\b(ke|dari|nomor|jurusan|rute)\b/i,
    expand: q => `${q} rute transportasi kairo mesir`,
  },
  {
    match: /\b(ke|dari|rute)\b.*\b(darrasah|hay\s*asyir|nasr\s*city|abbasiyya)\b/i,
    expand: q => `${q} cara transportasi microbus metro dari kairo`,
  },

  // ── Community ────────────────────────────────────────────────────
  {
    match: /\b(ppmi|ppi\s*mesir)\b/i,
    expand: q => `${q} organisasi mahasiswa Indonesia Mesir kegiatan program`,
  },
  {
    match: /\bkekeluargaan\b/i,
    expand: q => `${q} organisasi daerah mahasiswa Indonesia di Mesir`,
  },
];

// ═══════════════════════════════════════════════════════════════════
// CONTEXT ANCHORS
// Added as suffix to disambiguate Masisir-specific terms
// Only applied when masisirCtx.isLocal = true
// ═══════════════════════════════════════════════════════════════════
const CONTEXT_ANCHORS = [
  { term: /\biqomah\b/i,        anchor: "izin tinggal mesir" },
  { term: /\bvisa\s*dubai\b/i,  anchor: "dari kairo mesir mahasiswa" },
  { term: /\bvisa\s*turki\b/i,  anchor: "dari mesir kairo" },
  { term: /\bkbri\b/i,          anchor: "kairo konsulat indonesia" },
  { term: /\bjawazat\b/i,       anchor: "imigrasi mesir" },
  { term: /\bapostille\b/i,     anchor: "mesir legalisasi dokumen" },
  { term: /\bsakan\b/i,         anchor: "kairo mahasiswa indonesia" },
  { term: /\bimtihan\b/i,       anchor: "al-azhar ujian semester" },
  { term: /\btahriri\b/i,       anchor: "ujian tulis al-azhar" },
  { term: /\bsyafahi\b/i,       anchor: "ujian lisan al-azhar" },
  { term: /\brihlah\b/i,        anchor: "masisir wisata indonesia mesir" },
];

// ═══════════════════════════════════════════════════════════════════
// CATEGORY CONTEXT BOOSTS
// When query is 1-2 words and Masisir category is known
// ═══════════════════════════════════════════════════════════════════
const CATEGORY_CONTEXT = {
  akademik_al_azhar:    "Al-Azhar mahasiswa Indonesia Mesir ujian akademik",
  administrasi_mesir:   "administrasi dokumen mahasiswa Indonesia Mesir prosedur",
  kehidupan_kairo:      "kehidupan sehari-hari mahasiswa Indonesia di Kairo Mesir",
  transportasi_kairo:   "transportasi rute kairo mesir mahasiswa",
  travel_masisir:       "perjalanan mahasiswa Indonesia dari Mesir",
  komunitas_masisir:    "komunitas Masisir Indonesia di Mesir organisasi",
};

// ═══════════════════════════════════════════════════════════════════
// DYNAMIC QUERY SIGNALS
// Time-sensitive queries → allow external info
// ═══════════════════════════════════════════════════════════════════
function isDynamicQuery(q) {
  return /\b(sekarang|terbaru|terkini|hari ini|bulan ini|tahun ini|update|berita|cuaca|harga pasar|nilai tukar|kurs)\b/i.test(q);
}

// ═══════════════════════════════════════════════════════════════════
// MAIN EXPORTED FUNCTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Expand a retrieval query for better KB matching and route it.
 *
 * @param {string} rawQuery       - Typo-normalized user query
 * @param {object} masisirCtx     - Output from detectMasisirContext()
 * @returns {{
 *   kbQuery:   string,           - Expanded query for fetchRelevantArticles()
 *   strategy:  "kb_first" | "dynamic" | "general",
 *   changed:   boolean,          - Whether expansion was applied
 *   anchors:   string[]          - Which anchors were added
 * }}
 */
export function expandQuery(rawQuery, masisirCtx) {
  const q = (rawQuery ?? "").trim();
  let expanded = q;
  const anchors = [];
  let ruleApplied = false;

  // ── Step 1: Pattern-based expansion ──────────────────────────────
  for (const rule of EXPANSION_RULES) {
    if (rule.match.test(q)) {
      expanded = typeof rule.expand === "function" ? rule.expand(q) : rule.expand;
      ruleApplied = true;
      break; // first match only
    }
  }

  // ── Step 2: Masisir context anchoring ─────────────────────────────
  if (masisirCtx?.isLocal) {
    for (const { term, anchor } of CONTEXT_ANCHORS) {
      if (term.test(q) && !expanded.toLowerCase().includes(anchor.split(" ")[0])) {
        expanded = `${expanded} ${anchor}`;
        anchors.push(anchor);
      }
    }
  }

  // ── Step 3: Short-query category boost ───────────────────────────
  const wordCount = q.split(/\s+/).filter(Boolean).length;
  if (!ruleApplied && wordCount <= 3 && masisirCtx?.matchedCategories?.length > 0) {
    const firstCat = masisirCtx.matchedCategories[0];
    const boost = CATEGORY_CONTEXT[firstCat];
    if (boost && !expanded.toLowerCase().includes(boost.split(" ")[0].toLowerCase())) {
      expanded = `${expanded} ${boost}`;
      anchors.push(`[cat:${firstCat}]`);
    }
  }

  // ── Step 4: Retrieval strategy ────────────────────────────────────
  let strategy;
  if (masisirCtx?.isLocal) {
    strategy = "kb_first";       // KB → model, block external sources
  } else if (isDynamicQuery(q)) {
    strategy = "dynamic";        // KB + Perplexity/external allowed
  } else {
    strategy = "general";        // KB + model knowledge
  }

  const changed = expanded !== q;
  if (changed) {
    console.log(`[QueryExpander] "${q.slice(0, 55)}" → "${expanded.slice(0, 90)}" [${strategy}]`);
  }

  return {
    kbQuery: expanded,
    strategy,
    changed,
    anchors,
  };
}
