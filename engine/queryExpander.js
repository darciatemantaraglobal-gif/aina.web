/**
 * engine/queryExpander.js
 *
 * Query expansion + meaning resolution for AINA's retrieval pipeline.
 *
 * Purpose:
 *   Short/ambiguous user queries often miss KB articles because they
 *   don't share enough vocabulary. This module expands them into
 *   richer retrieval queries — without changing the displayed message.
 *
 * Pipeline:
 *   1. Slang normalization       — Masisir slang/abbrev → standard terms
 *   2. Pattern-based expansion   — short procedural queries → full intent phrase
 *   3. Context anchoring         — Masisir terms get Egypt-context suffixes
 *   4. Category context boost    — 1-2 word queries get category context
 *   5. Strategy selection        — kb_first | dynamic | general
 */

// ═══════════════════════════════════════════════════════════════════
// STEP 0: SLANG & ABBREVIATION NORMALIZATION
// Runs first, before expansion rules — maps Masisir informal terms
// to standard Indonesian/Arabic terms used in the KB.
// ═══════════════════════════════════════════════════════════════════
const SLANG_MAP = [
  // ── Singkatan organisasi ──────────────────────────────────────────
  { match: /\bppmi\b/gi,            replace: "PPMI Persatuan Pelajar Mahasiswa Indonesia Mesir" },
  { match: /\bppi\s*kairo\b/gi,     replace: "PPI Kairo organisasi mahasiswa Indonesia" },
  { match: /\bppi\s*mansoura?\b/gi, replace: "PPI Mansoura mahasiswa Indonesia Mansoura" },
  { match: /\bppi\s*tanta\b/gi,     replace: "PPI Tanta mahasiswa Indonesia Tanta" },
  { match: /\bppi\s*zagazig\b/gi,   replace: "PPI Zagazig mahasiswa Indonesia Zagazig" },
  { match: /\bppi\s*ismailia\b/gi,  replace: "PPI Ismailia mahasiswa Indonesia Ismailia" },
  { match: /\bppi\s*damanhour\b/gi, replace: "PPI Damanhour mahasiswa Indonesia Damanhour" },
  { match: /\bppi\s*sohag\b/gi,     replace: "PPI Sohag mahasiswa Indonesia Sohag" },
  { match: /\bkbri\b/gi,            replace: "KBRI Kairo Kedutaan Besar Republik Indonesia" },
  { match: /\bwni\b/gi,             replace: "WNI Warga Negara Indonesia di Mesir" },
  { match: /\baigypt\b/gi,          replace: "AIGYPT AI teknologi mahasiswa Indonesia Mesir" },

  // ── Istilah akademik Al-Azhar ─────────────────────────────────────
  { match: /\bimtihan\b/gi,         replace: "imtihan ujian Al-Azhar" },
  { match: /\btahriri\b/gi,         replace: "tahriri ujian tulis Al-Azhar" },
  { match: /\bsyafahi\b/gi,         replace: "syafahi ujian lisan Al-Azhar" },
  { match: /\btasjil\b/gi,          replace: "tasjil qaid pendaftaran ulang Al-Azhar" },
  { match: /\bqaid\b/gi,            replace: "qaid tasjil kartu mahasiswa Al-Azhar" },
  { match: /\bmuqorror\b|\bmugharrar\b/gi, replace: "muqarrar buku teks wajib Al-Azhar manhaj" },
  { match: /\bmarkaz\s*lugh?ah?\b/gi,      replace: "markaz lughah pusat bahasa Arab Al-Azhar" },
  { match: /\bdirasat\s*ulya\b/gi,         replace: "dirasat ulya pascasarjana Al-Azhar" },
  { match: /\bmaghrib\s*(atau|atau\s*)?\s*lisansi\b/gi, replace: "lisansi S1 Al-Azhar sarjana" },
  { match: /\blisansi\b/gi,         replace: "lisansi sarjana S1 Al-Azhar" },
  { match: /\bmagister\b/gi,        replace: "magister S2 pascasarjana Al-Azhar" },
  { match: /\bdoktora\b/gi,         replace: "doktora S3 Al-Azhar program doktor" },
  { match: /\bibtidai\b/gi,         replace: "ibtidai tingkat dasar Al-Azhar" },
  { match: /\btsanawi\b|\bthanawi\b/gi,    replace: "tsanawi tingkat menengah Al-Azhar" },
  { match: /\bwustho\b/gi,          replace: "wustho tingkat menengah Al-Azhar" },
  { match: /\bkuliyyah\b/gi,        replace: "kuliyyah fakultas Al-Azhar" },
  { match: /\bsyuun\s*talabah\b/gi, replace: "syuun talabah urusan mahasiswa Al-Azhar" },
  { match: /\bmunaqasya\b/gi,       replace: "munaqasya sidang skripsi tesis Al-Azhar" },
  { match: /\bmudzakarah\b/gi,      replace: "mudzakarah belajar bersama kelompok belajar" },
  { match: /\bhalaqah\b/gi,         replace: "halaqah kajian belajar kitab" },
  { match: /\bdurus\b/gi,           replace: "durus pelajaran kuliah Al-Azhar" },
  { match: /\bnizhom\b/gi,          replace: "nizhom peraturan sistem Al-Azhar" },
  { match: /\btaqrir\b/gi,          replace: "taqrir laporan tugas Al-Azhar" },
  { match: /\bmanhaj\b/gi,          replace: "manhaj kurikulum silabus Al-Azhar" },
  { match: /\bshahadah?\s*qaid\b/gi,       replace: "shahada qaid surat keterangan terdaftar Al-Azhar" },
  { match: /\bshahadah?\s*tasjil\b/gi,     replace: "shahada tasjil surat keterangan terdaftar Al-Azhar" },
  { match: /\btaqdir\b/gi,          replace: "taqdir nilai hasil ujian Al-Azhar" },

  // ── Administrasi & dokumen ────────────────────────────────────────
  { match: /\biqomah\b|\biqama\b/gi,       replace: "iqomah izin tinggal residency permit Mesir" },
  { match: /\bjawazat\b/gi,         replace: "jawazat imigrasi Mesir immigration" },
  { match: /\bapostille\b/gi,       replace: "apostille legalisasi dokumen KBRI Mesir" },
  { match: /\bwakalah\b/gi,         replace: "wakalah surat kuasa power of attorney" },
  { match: /\btasrih\b/gi,          replace: "tasrih izin surat resmi keterangan" },
  { match: /\bskck\b/gi,            replace: "SKCK surat keterangan catatan kepolisian" },
  { match: /\bsim\b.*\b(mesir|internasional|egypt)\b/gi, replace: "SIM internasional surat izin mengemudi Mesir" },
  { match: /\bpaspor\b/gi,          replace: "paspor passport dokumen perjalanan KBRI" },

  // ── Tempat tinggal ────────────────────────────────────────────────
  { match: /\bsakan\b/gi,           replace: "sakan tempat tinggal kost apartemen Mesir" },
  { match: /\bsyaqa\b|\bshaqqa\b/gi,       replace: "syaqa apartemen flat sewa Mesir" },
  { match: /\bfawar\b/gi,           replace: "fawar air panas boiler sakan Mesir" },
  { match: /\bsahibul?\s*bait\b/gi, replace: "pemilik sakan landlord pemilik kost" },
  { match: /\bmabna\b/gi,           replace: "mabna gedung asrama mahasiswa" },
  { match: /\bsakaniyyah\b/gi,      replace: "sakaniyyah kompleks perumahan mahasiswa" },

  // ── Transportasi ─────────────────────────────────────────────────
  { match: /\bmikrobus\b|\bmicrobus\b/gi,  replace: "mikrobus angkutan umum kairo rute" },
  { match: /\bubrik\b/gi,           replace: "ubrik bus besar kairo transportasi" },
  { match: /\bmetro\b.*\b(kairo|cairo|mesir)\b/gi, replace: "metro kereta bawah tanah kairo rute stasiun" },
  { match: /\buber\b.*\b(mesir|kairo)\b/gi, replace: "uber careem taksi online kairo mesir" },
  { match: /\bcareem\b/gi,          replace: "careem uber taksi online kairo mesir" },
  { match: /\bmahattah\b/gi,        replace: "mahattah terminal stasiun bus kairo" },

  // ── Keuangan ─────────────────────────────────────────────────────
  { match: /\bkurs?\b.*\b(egp|pound|mesir)\b/gi, replace: "kurs nilai tukar EGP IDR rupiah pound Mesir" },
  { match: /\bpound\b.*\b(mesir|egypt|egyptian)\b/gi, replace: "pound Mesir EGP mata uang nilai tukar IDR" },
  { match: /\bremit(tan)?(si|ce)?\b/gi,    replace: "remitansi kirim uang transfer internasional ke Indonesia" },
  { match: /\bwisecash?\b|\bwise\b/gi,     replace: "Wise transfer uang internasional kirim uang Mesir" },
  { match: /\binstapay\b/gi,        replace: "instapay transfer uang bank Mesir" },

  // ── Makanan & kehidupan ───────────────────────────────────────────
  { match: /\bwarung\s*indo\b/gi,   replace: "warung Indonesia makanan Indonesia Mesir restoran" },
  { match: /\bkosher\b|\bhalal\b.*\b(mesir)\b/gi, replace: "makanan halal Mesir restoran rekomendasi" },
  { match: /\bpasar\b.*\b(kairo|hay\s*asyir|asyir)\b/gi, replace: "pasar belanja bahan makanan kairo hay asyir" },

  // ── Lokasi ────────────────────────────────────────────────────────
  { match: /\bhay\s*asyir\b|\basyir\b/gi,  replace: "Hay Asyir kawasan 10 kairo tempat tinggal masisir" },
  { match: /\bnasr\s*city\b/gi,     replace: "Nasr City kairo kawasan tempat tinggal" },
  { match: /\bdarrasah\b/gi,        replace: "Darrasah kawasan Al-Azhar kairo" },
  { match: /\babbasiyya\b|\babbasiyah\b/gi, replace: "Abbasiyya kawasan kairo transportasi" },
  { match: /\bmansoura?\b/gi,       replace: "Mansoura kota mahasiswa Indonesia Mesir" },
  { match: /\bzagazig\b/gi,         replace: "Zagazig kota mahasiswa Indonesia Mesir" },
  { match: /\bismailia\b/gi,        replace: "Ismailia kota mahasiswa Indonesia Mesir" },

  // ── Istilah umum Masisir ──────────────────────────────────────────
  { match: /\bmasisir\b/gi,         replace: "Masisir mahasiswa Indonesia di Mesir" },
  { match: /\banak\s*baru\b/gi,     replace: "mahasiswa baru Mesir tips panduan datang pertama kali" },
  { match: /\bmantong\b/gi,         replace: "mahasiswa lama senior Mesir berpengalaman" },
  { match: /\brihlah\b/gi,          replace: "rihlah wisata perjalanan Mesir mahasiswa Indonesia" },
  { match: /\bnadi\b/gi,            replace: "nadi club kegiatan organisasi mahasiswa" },
];

// ═══════════════════════════════════════════════════════════════════
// EXPANSION RULES
// Applied in order — first match wins.
// ═══════════════════════════════════════════════════════════════════
const EXPANSION_RULES = [

  // ── Iqomah / Izin Tinggal ─────────────────────────────────────────
  {
    match: /\b(iqomah|iqama|izin\s*tinggal)\b.*\b(habis|expired?|mati|kadaluarsa|mau\s*habis)\b/i,
    expand: "cara perpanjang iqomah mesir izin tinggal expired prosedur dokumen syarat biaya",
  },
  {
    match: /\b(perpanjang|renew|bikin|buat|urus)\b.*\b(iqomah|iqama|izin\s*tinggal)\b/i,
    expand: "prosedur perpanjang iqomah izin tinggal mesir syarat dokumen biaya jawazat",
  },
  {
    match: /\b(cara|gimana|bagaimana|prosedur|langkah|urus)\b.*\b(iqomah|iqama)\b/i,
    expand: "prosedur mengurus iqomah izin tinggal mahasiswa Indonesia di Mesir dokumen syarat",
  },
  {
    match: /\biqomah\b.*\b(berapa|harga|biaya|cost)\b/i,
    expand: "biaya iqomah izin tinggal Mesir harga 2024 2025 prosedur",
  },

  // ── KBRI & Konsulat ───────────────────────────────────────────────
  {
    match: /\bkbri\b.*\b(buka|tutup|jam|jadwal|kontak|alamat|telepon|layanan)\b/i,
    expand: "jam operasional KBRI Kairo kontak alamat jadwal pelayanan konsulat Indonesia Mesir telepon",
  },
  {
    match: /\b(layanan|pelayanan|ngurus)\b.*\bkbri\b/i,
    expand: "layanan KBRI Kairo prosedur dokumen paspor konsuler Indonesia Mesir",
  },
  {
    match: /\bkbri\b.*\b(paspor|darurat|emergency|hilang)\b/i,
    expand: "KBRI Kairo paspor darurat emergency hilang rusak penggantian prosedur",
  },

  // ── Visa ──────────────────────────────────────────────────────────
  {
    match: /\bvisa\s*pelajar\b|\bvisa\s*studi\b|\bstudent\s*visa\b/i,
    expand: "visa pelajar student visa Mesir syarat dokumen prosedur perpanjang mahasiswa Indonesia",
  },
  {
    match: /\bvisa\s*dubai\b/i,
    expand: "cara mengurus visa dubai dari kairo mesir syarat dokumen mahasiswa masisir prosedur",
  },
  {
    match: /\bvisa\s*turki\b/i,
    expand: "cara mengurus visa turki dari kairo mesir syarat dokumen masisir",
  },
  {
    match: /\bvisa\s*(transit|layover)\b/i,
    expand: "visa transit layover bandara syarat prosedur mahasiswa Indonesia dari Mesir",
  },
  {
    match: /\bvoa\b.*\b(mesir|egypt|kairo)\b/i,
    expand: "visa on arrival VOA Mesir mahasiswa Indonesia prosedur",
  },

  // ── Apostille & Legalisasi ────────────────────────────────────────
  {
    match: /\bapostille\b/i,
    expand: "apostille mesir legalisasi dokumen ijazah akta KBRI cairo prosedur biaya",
  },
  {
    match: /\b(legalisasi|legalisir)\b.*\b(dokumen|ijazah|akta)\b/i,
    expand: "legalisasi dokumen ijazah akta apostille KBRI Kairo prosedur Mesir",
  },

  // ── Al-Azhar: Pendaftaran ─────────────────────────────────────────
  {
    match: /\b(cara|gimana|prosedur|daftar)\b.*\b(masuk|kuliah|pendaftaran|mendaftar)\b.*\b(azhar|al.?azhar)\b/i,
    expand: "pendaftaran Al-Azhar mahasiswa baru prosedur syarat dokumen kuliah Mesir",
  },
  {
    match: /\btasjil\b.*\b(kapan|deadline|batas|sampai|mulai|selesai|buka)\b/i,
    expand: "jadwal tasjil qaid pendaftaran ulang Al-Azhar batas waktu deadline semester",
  },
  {
    match: /\b(cara|gimana|bagaimana|prosedur|kapan|deadline)\b.*\btasjil\b/i,
    expand: "prosedur tasjil qaid pendaftaran ulang mahasiswa Al-Azhar syarat jadwal deadline biaya",
  },
  {
    match: /\bqaid\b.*\b(kapan|buka|mulai|deadline)\b/i,
    expand: "jadwal qaid tasjil pendaftaran ulang Al-Azhar deadline semester Masisir",
  },
  {
    match: /\bqaid\s*tasjil\b/i,
    expand: "qaid tasjil kartu mahasiswa pendaftaran ulang Al-Azhar nomor induk dokumen",
  },
  {
    match: /\brasm\s*(tasjil|al.?azhar)\b|\bbiaya\s*tasjil\b/i,
    expand: "rasm tasjil biaya pendaftaran ulang Al-Azhar prosedur pembayaran Masisir",
  },
  {
    match: /\bshahadah?\s*qaid\b|\bsurat\s*keterangan\s*terdaftar\b/i,
    expand: "shahada qaid surat keterangan terdaftar aktif Al-Azhar dokumen resmi",
  },

  // ── Al-Azhar: Ujian ───────────────────────────────────────────────
  {
    match: /\bimtihan\b.*\b(kapan|jadwal|tanggal|mulai|bulan|semester)\b/i,
    expand: "jadwal imtihan Al-Azhar tanggal mulai ujian tahriri syafahi semester Masisir",
  },
  {
    match: /\b(kapan|jadwal|tanggal)\b.*\bimtihan\b/i,
    expand: "jadwal imtihan Al-Azhar tanggal mulai semester tahriri syafahi 2025",
  },
  {
    match: /\b(nilai|hasil|taqdir)\b.*\b(imtihan|ujian)\b/i,
    expand: "cara cek nilai taqdir imtihan Al-Azhar hasil ujian akademik mahasiswa",
  },
  {
    match: /\b(lulus|tidak\s*lulus|gagal|resit)\b.*\b(imtihan|ujian)\b/i,
    expand: "lulus gagal resit imtihan Al-Azhar konsekuensi prosedur ulang ujian",
  },
  {
    match: /\btahriri\b/i,
    expand: q => `${q} ujian tulis Al-Azhar jadwal imtihan semester tahriri`,
  },
  {
    match: /\bsyafahi\b/i,
    expand: q => `${q} ujian lisan Al-Azhar jadwal imtihan syafahi`,
  },

  // ── Al-Azhar: Akademik ────────────────────────────────────────────
  {
    match: /\b(muqorror|mugharrar)\b/i,
    expand: q => `${q} buku wajib manhaj Al-Azhar daftar pelajaran teks`,
  },
  {
    match: /\bmarkaz\s*lugh?ah?\b/i,
    expand: "markaz lughah pusat bahasa Arab Al-Azhar pendaftaran biaya level kelas",
  },
  {
    match: /\bdirasat\s*ulya\b/i,
    expand: "dirasat ulya program pascasarjana Al-Azhar syarat pendaftaran beasiswa tesis",
  },
  {
    match: /\b(kuliyyah|fakultas)\b.*\b(azhar|al.?azhar)\b/i,
    expand: q => `${q} kuliyyah fakultas Al-Azhar daftar jurusan pilihan`,
  },
  {
    match: /\bmunaqasya\b/i,
    expand: "munaqasya sidang skripsi tesis Al-Azhar syarat pendaftaran prosedur",
  },
  {
    match: /\blisansi\b/i,
    expand: "lisansi sarjana S1 Al-Azhar gelar kelulusan wisuda",
  },

  // ── Tempat Tinggal / Sakan ────────────────────────────────────────
  {
    match: /\b(cari|nyari|sewa|mau|butuh|rekomendasi)\b.*\b(sakan|syaqa|kost|apartemen|flat|kamar)\b/i,
    expand: q => `${q} harga per bulan hay asyir nasr city kairo lokasi murah Masisir mahasiswa Indonesia`,
  },
  {
    match: /\bharga\b.*\b(sakan|kost|flat|syaqa|apartemen)\b/i,
    expand: "harga sewa sakan kost flat apartemen Mesir Kairo per bulan Masisir 2025",
  },
  {
    match: /\bbiaya\s*hidup\b/i,
    expand: "biaya hidup mahasiswa Indonesia di Kairo Mesir per bulan sakan makan transport total estimasi",
  },
  {
    match: /\bfawar\b/i,
    expand: "fawar air panas boiler sakan mesir kairo apartemen mahasiswa cara pakai masalah",
  },
  {
    match: /\b(masalah|konflik|ribut)\b.*\b(pemilik|landlord|sahibul\s*bait)\b/i,
    expand: "masalah konflik pemilik sakan landlord solusi mediasi PPMI mahasiswa Indonesia Mesir",
  },

  // ── Biaya & Keuangan ──────────────────────────────────────────────
  {
    match: /\b(kurs|nilai\s*tukar|harga)\b.*\b(egp|pound|mesir|egypt)\b/i,
    expand: "kurs nilai tukar EGP pound Mesir ke IDR rupiah hari ini terbaru",
  },
  {
    match: /\b(kirim|transfer)\b.*\b(uang|duit|dolar|rupiah)\b.*\b(mesir|indonesia|ke|dari)\b/i,
    expand: "cara kirim transfer uang dari Mesir ke Indonesia remitansi Wise Western Union biaya",
  },
  {
    match: /\b(buka|bikin|buat)\b.*\b(rekening|akun|account)\b.*\b(bank|mesir)\b/i,
    expand: "cara buka rekening bank di Mesir syarat dokumen mahasiswa Indonesia CIB QNB Bank Misr",
  },
  {
    match: /\binstapay\b/i,
    expand: "instapay transfer uang antar bank Mesir cara daftar pakai",
  },

  // ── Transportasi ──────────────────────────────────────────────────
  {
    match: /\b(mikrobus|microbus)\b.*\b(ke|dari|nomor|jurusan|rute)\b/i,
    expand: q => `${q} rute transportasi kairo mesir nomor jurusan`,
  },
  {
    match: /\b(ke|dari|rute)\b.*\b(darrasah|hay\s*asyir|nasr\s*city|abbasiyya)\b/i,
    expand: q => `${q} cara transportasi mikrobus metro dari ke kairo`,
  },
  {
    match: /\b(airport|bandara)\b.*\b(kairo|cairo|mesir)\b.*\b(ke|dari|cara|rute|naik)\b/i,
    expand: "transportasi dari ke airport kairo cairo international rute cara naik metro mikrobus taksi",
  },
  {
    match: /\b(metro|kereta)\b.*\b(kairo|cairo|rute|ke|dari)\b/i,
    expand: q => `${q} metro kairo rute stasiun tiket cara naik`,
  },
  {
    match: /\bcareem\b|\buber\b/i,
    expand: q => `${q} taksi online kairo Mesir cara order harga estimasi`,
  },

  // ── Perjalanan / Travel ───────────────────────────────────────────
  {
    match: /\btransit\s*(di\s*)?(dubai|istanbul|kairo|abu\s*dhabi)\b/i,
    expand: q => `${q} prosedur transit bandara visa keperluan dokumen durasi mahasiswa`,
  },
  {
    match: /\b(tiket|pesawat|penerbangan)\b.*\b(pulang|indo|indonesia|jakarta)\b/i,
    expand: q => `${q} tiket pesawat pulang ke Indonesia dari Kairo harga maskapai booking`,
  },
  {
    match: /\btemantiket\b/i,
    expand: "Temantiket platform tiket pesawat mahasiswa Masisir beli tiket promo",
  },

  // ── Komunitas ─────────────────────────────────────────────────────
  {
    match: /\b(ppmi|ppi\s*mesir)\b/i,
    expand: q => `${q} PPMI organisasi mahasiswa Indonesia Mesir kegiatan program pengurus`,
  },
  {
    match: /\bkekeluargaan\b/i,
    expand: q => `${q} kekeluargaan organisasi daerah mahasiswa Indonesia di Mesir paguyuban`,
  },
  {
    match: /\b(anak|mahasiswa)\s*baru\b/i,
    expand: "panduan mahasiswa baru Masisir tips datang pertama kali persiapan Mesir dokumen",
  },
  {
    match: /\brihlah\b/i,
    expand: q => `${q} rihlah wisata perjalanan mahasiswa Masisir destinasi tips`,
  },

  // ── Beasiswa ──────────────────────────────────────────────────────
  {
    match: /\bbeasiswa\b.*\b(azhar|al.?azhar|mesir|egypt)\b/i,
    expand: "beasiswa Al-Azhar Mesir syarat daftar prosedur penerima mahasiswa Indonesia",
  },
  {
    match: /\bbeasiswa\b.*\b(lpdp|dikti|kemendikbud)\b/i,
    expand: "beasiswa LPDP luar negeri Mesir Al-Azhar syarat prosedur mahasiswa Indonesia",
  },

  // ── Makanan & Tempat ──────────────────────────────────────────────
  {
    match: /\b(warung|resto|restoran|makan)\b.*\b(indonesia|indo|jawa|sunda|padang)\b/i,
    expand: q => `${q} warung Indonesia makanan Indonesia di Kairo Mesir rekomendasi lokasi`,
  },
  {
    match: /\b(rekomendasi|referensi)\b.*\b(makan|tempat\s*makan|kuliner)\b.*\b(mesir|kairo|hay\s*asyir)\b/i,
    expand: "rekomendasi tempat makan halal Kairo Mesir restoran kuliner mahasiswa Indonesia",
  },

  // ── Kesehatan ─────────────────────────────────────────────────────
  {
    match: /\b(dokter|klinik|rumah\s*sakit|rs)\b.*\b(mesir|kairo|murah|bagus)\b/i,
    expand: "dokter klinik rumah sakit rekomendasi Kairo Mesir mahasiswa Indonesia murah berkualitas",
  },
  {
    match: /\b(asuransi|insurance)\b.*\b(kesehatan|health|mesir)\b/i,
    expand: "asuransi kesehatan mahasiswa Indonesia di Mesir cara daftar biaya manfaat",
  },
  {
    match: /\bobat\b.*\b(mesir|egypt|kairo)\b/i,
    expand: "obat apotek farmasi Kairo Mesir nama setara Indonesia beli",
  },
];

// ═══════════════════════════════════════════════════════════════════
// CONTEXT ANCHORS
// Added as suffix to disambiguate Masisir-specific terms
// Only applied when masisirCtx.isLocal = true
// ═══════════════════════════════════════════════════════════════════
const CONTEXT_ANCHORS = [
  { term: /\biqomah\b|\biqama\b/i,  anchor: "izin tinggal mesir prosedur" },
  { term: /\btasjil\b/i,            anchor: "pendaftaran ulang Al-Azhar" },
  { term: /\bqaid\b/i,              anchor: "kartu mahasiswa Al-Azhar terdaftar" },
  { term: /\bvisa\s*dubai\b/i,      anchor: "dari kairo mesir mahasiswa" },
  { term: /\bvisa\s*turki\b/i,      anchor: "dari mesir kairo" },
  { term: /\bkbri\b/i,              anchor: "kairo konsulat indonesia pelayanan" },
  { term: /\bjawazat\b/i,           anchor: "imigrasi mesir iqomah" },
  { term: /\bapostille\b/i,         anchor: "mesir legalisasi dokumen KBRI" },
  { term: /\bsakan\b/i,             anchor: "kairo mahasiswa indonesia sewa" },
  { term: /\bimtihan\b/i,           anchor: "al-azhar ujian semester jadwal" },
  { term: /\btahriri\b/i,           anchor: "ujian tulis al-azhar" },
  { term: /\bsyafahi\b/i,           anchor: "ujian lisan al-azhar" },
  { term: /\brihlah\b/i,            anchor: "masisir wisata indonesia mesir" },
  { term: /\bmuqorror\b|\bmugharrar\b/i, anchor: "buku teks Al-Azhar manhaj wajib" },
  { term: /\bmarkaz\s*lugh?ah?\b/i, anchor: "bahasa Arab Al-Azhar kelas pendaftaran" },
  { term: /\bfawar\b/i,             anchor: "air panas sakan kost mesir" },
  { term: /\binstapay\b/i,          anchor: "transfer bank mesir" },
  { term: /\blisansi\b/i,           anchor: "sarjana Al-Azhar kelulusan" },
  { term: /\bmunaqasya\b/i,         anchor: "sidang skripsi Al-Azhar" },
  { term: /\bppmi\b/i,              anchor: "organisasi mahasiswa Indonesia Mesir" },
];

// ═══════════════════════════════════════════════════════════════════
// CATEGORY CONTEXT BOOSTS
// When query is 1-2 words and Masisir category is known
// ═══════════════════════════════════════════════════════════════════
const CATEGORY_CONTEXT = {
  akademik_al_azhar:    "Al-Azhar mahasiswa Indonesia Mesir ujian akademik kurikulum",
  administrasi_mesir:   "administrasi dokumen mahasiswa Indonesia Mesir prosedur resmi",
  kehidupan_kairo:      "kehidupan sehari-hari mahasiswa Indonesia di Kairo Mesir",
  transportasi_kairo:   "transportasi rute kairo mesir mahasiswa mikrobus metro",
  travel_masisir:       "perjalanan wisata mahasiswa Indonesia dari Mesir",
  komunitas_masisir:    "komunitas Masisir Indonesia di Mesir organisasi PPMI PPI",
};

// ═══════════════════════════════════════════════════════════════════
// DYNAMIC QUERY SIGNALS
// Time-sensitive queries → allow external info
// ═══════════════════════════════════════════════════════════════════
function isDynamicQuery(q) {
  return /\b(sekarang|terbaru|terkini|hari ini|bulan ini|tahun ini|update|berita|cuaca|harga pasar|nilai tukar|kurs|2025|2026)\b/i.test(q);
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

  // ── Step 0: Slang & abbreviation normalization ────────────────────
  // Only expand abbreviations in the KB query (not the displayed message)
  let slangNormalized = q;
  for (const { match, replace } of SLANG_MAP) {
    if (match.test(slangNormalized)) {
      // Replace inline — but cap expansion at 200 chars to avoid over-bloat
      const replaced = slangNormalized.replace(match, replace);
      if (replaced.length <= 200) slangNormalized = replaced;
    }
  }
  if (slangNormalized !== q) {
    expanded = slangNormalized;
    anchors.push("[slang-norm]");
    console.log(`[QueryExpander] slang-norm: "${q.slice(0, 50)}" → "${expanded.slice(0, 90)}"`);
  }

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
  if (changed && !anchors.includes("[slang-norm]")) {
    console.log(`[QueryExpander] "${q.slice(0, 55)}" → "${expanded.slice(0, 90)}" [${strategy}]`);
  }

  return {
    kbQuery: expanded,
    strategy,
    changed,
    anchors,
  };
}
