/**
 * trainerChallenges.js — Seed bank pertanyaan "Challenge" AI Trainer Program.
 *
 * Ini BUKAN eval_benchmarks (itu untuk menguji kualitas jawaban AINA) dan
 * bukan missing_topics (itu gap yang datang dari pertanyaan user sungguhan).
 * Ini daftar kurasi: pertanyaan yang kita TAHU sering ditanyakan Masisir tapi
 * belum tentu ada jawabannya di Knowledge Base — jadi trainer punya sesuatu
 * yang konkret untuk dijawab, bukan disuruh mengarang topik sendiri.
 *
 * Prinsip penyusunan:
 * 1. Ditulis seperti cara mahasiswa benar-benar bertanya, bukan judul artikel.
 * 2. Tahan lama — sengaja menghindari "siapa ketua X sekarang" yang basi dalam
 *    hitungan bulan dan memang sudah diblokir AINA di eval benchmark.
 * 3. Bisa dijawab dari pengalaman hidup di Mesir, bukan butuh data rahasia.
 * 4. difficulty = perkiraan bobot jawaban (sederhana/standar/kompleks), dipakai
 *    sebagai ancang-ancang reviewer soal reward LE — reviewer tetap yang
 *    memutuskan final lewat resolveTrainerReward().
 */

/** @type {{ question: string, category: string, difficulty: string }[]} */
export const DEFAULT_TRAINER_CHALLENGES = [
  // ── Akademik & Al-Azhar ───────────────────────────────────────────────────
  { question: "Apa bedanya ujian tahdid mustawa dan ikhtibar tashfiyah, dan mana yang wajib untuk calon mahasiswa baru?", category: "akademik", difficulty: "kompleks" },
  { question: "Bagaimana alur pendaftaran ulang (tasjil) mahasiswa baru Al-Azhar setelah tiba di Mesir?", category: "akademik", difficulty: "kompleks" },
  { question: "Berapa nilai minimal kelulusan di Al-Azhar dan apa yang terjadi kalau rusub di satu maddah?", category: "akademik", difficulty: "standar" },
  { question: "Apa itu sistem i'adah (mengulang) di Al-Azhar dan bagaimana mekanismenya?", category: "akademik", difficulty: "standar" },
  { question: "Bagaimana cara mengurus surat keterangan aktif kuliah (syahadah qaid) dan berapa lama prosesnya?", category: "akademik", difficulty: "standar" },
  { question: "Di mana dan bagaimana cara mengambil muqarrar (diktat kuliah) tiap awal semester?", category: "akademik", difficulty: "sederhana" },
  { question: "Apa saja kulliyah yang tersedia di Al-Azhar untuk mahasiswa asing dan di kampus mana lokasinya?", category: "akademik", difficulty: "kompleks" },
  { question: "Bagaimana cara pindah fakultas atau jurusan di Al-Azhar?", category: "akademik", difficulty: "kompleks" },
  { question: "Kapan biasanya jadwal ujian termin 1 dan termin 2 Al-Azhar dalam satu tahun ajaran?", category: "akademik", difficulty: "standar" },
  { question: "Bagaimana cara cek natijah (hasil ujian) Al-Azhar secara online?", category: "akademik", difficulty: "sederhana" },
  { question: "Apa itu daurah lughah dan siapa yang wajib mengikutinya?", category: "akademik", difficulty: "standar" },
  { question: "Bagaimana sistem kehadiran kuliah di Al-Azhar, apakah berpengaruh ke nilai ujian?", category: "akademik", difficulty: "standar" },
  { question: "Apa yang harus dilakukan kalau ada kesalahan penulisan nama di dokumen akademik Al-Azhar?", category: "akademik", difficulty: "standar" },
  { question: "Bagaimana cara mendaftar program magister di Al-Azhar setelah lulus S1?", category: "akademik", difficulty: "kompleks" },
  { question: "Apa syarat dan alur pengurusan ijazah serta legalisirnya setelah wisuda di Al-Azhar?", category: "akademik", difficulty: "kompleks" },
  { question: "Bagaimana cara pindah kampus dari Al-Azhar Kairo ke cabang daerah seperti Zagazig atau Tanta?", category: "akademik", difficulty: "kompleks" },
  { question: "Apa bedanya kuliah sistem intisab dan muntazim di Al-Azhar?", category: "akademik", difficulty: "standar" },
  { question: "Berapa biaya rasm (uang kuliah) Al-Azhar untuk mahasiswa asing non-beasiswa dan bagaimana cara membayarnya?", category: "akademik", difficulty: "kompleks" },
  { question: "Beasiswa apa saja yang tersedia untuk mahasiswa Indonesia di Al-Azhar dan bagaimana cara mendaftarnya?", category: "akademik", difficulty: "kompleks" },
  { question: "Bagaimana cara mengajukan cuti kuliah atau menunda studi di Al-Azhar?", category: "akademik", difficulty: "standar" },
  { question: "Apa saja perlengkapan dan persiapan yang dibutuhkan saat hari ujian di Al-Azhar?", category: "akademik", difficulty: "standar" },
  { question: "Bagaimana strategi belajar muqarrar yang efektif untuk menghadapi ujian Al-Azhar?", category: "akademik", difficulty: "kompleks" },

  // ── Administrasi & Keimigrasian ───────────────────────────────────────────
  { question: "Apa saja dokumen yang harus disiapkan untuk perpanjangan iqomah tahun pertama?", category: "administrasi", difficulty: "kompleks" },
  { question: "Berapa lama proses perpanjangan iqomah dan berapa kisaran biayanya?", category: "administrasi", difficulty: "standar" },
  { question: "Apa yang harus dilakukan kalau iqomah sudah lewat masa berlaku (overstay) dan berapa dendanya?", category: "administrasi", difficulty: "kompleks" },
  { question: "Bagaimana alur pengurusan iqomah lewat INTIF dan apa bedanya kalau mengurus sendiri?", category: "administrasi", difficulty: "kompleks" },
  { question: "Bagaimana cara memperpanjang paspor di KBRI Kairo dan dokumen apa saja yang dibutuhkan?", category: "administrasi", difficulty: "kompleks" },
  { question: "Berapa lama proses perpanjangan paspor di KBRI Kairo dan berapa biayanya?", category: "administrasi", difficulty: "standar" },
  { question: "Apa yang harus dilakukan kalau paspor hilang saat berada di Mesir?", category: "administrasi", difficulty: "kompleks" },
  { question: "Bagaimana cara mengurus visa pelajar Mesir dari Indonesia sebelum berangkat?", category: "administrasi", difficulty: "kompleks" },
  { question: "Apa itu tasrih safar dan kapan mahasiswa membutuhkannya?", category: "administrasi", difficulty: "standar" },
  { question: "Bagaimana cara lapor diri di KBRI Kairo untuk mahasiswa yang baru tiba di Mesir?", category: "administrasi", difficulty: "standar" },
  { question: "Dokumen apa saja yang wajib dilegalisir di Indonesia sebelum berangkat kuliah ke Mesir?", category: "administrasi", difficulty: "standar" },
  { question: "Bagaimana cara mengurus surat keterangan belum menikah di KBRI Kairo?", category: "administrasi", difficulty: "standar" },
  { question: "Apa yang harus dilakukan kalau kartu iqomah hilang atau rusak?", category: "administrasi", difficulty: "standar" },
  { question: "Bagaimana prosedur izin tinggal untuk yang sudah lulus tapi masih ingin tinggal di Mesir?", category: "administrasi", difficulty: "kompleks" },
  { question: "Apa saja prosedur imigrasi yang dilalui saat pertama kali tiba di Bandara Kairo?", category: "administrasi", difficulty: "standar" },
  { question: "Apa yang harus dilakukan kalau kartu mahasiswa (karnet) Al-Azhar hilang?", category: "administrasi", difficulty: "sederhana" },
  { question: "Bagaimana cara mengirim dokumen penting dari Indonesia ke Mesir dengan aman?", category: "administrasi", difficulty: "standar" },
  { question: "Apa syarat dan prosedur membawa keluarga tinggal di Mesir sebagai mahasiswa?", category: "administrasi", difficulty: "kompleks" },
  { question: "Bagaimana cara mengurus akta kelahiran anak yang lahir di Mesir?", category: "administrasi", difficulty: "kompleks" },
  { question: "Bagaimana cara mengurus pernikahan sesama WNI di Mesir secara resmi?", category: "administrasi", difficulty: "kompleks" },

  // ── Kehidupan Sehari-hari ─────────────────────────────────────────────────
  { question: "Berapa kisaran harga sewa flat untuk mahasiswa di Hay Asyir per bulan?", category: "kehidupan", difficulty: "standar" },
  { question: "Apa saja yang harus dicek sebelum menandatangani kontrak sewa flat di Mesir?", category: "kehidupan", difficulty: "kompleks" },
  { question: "Bagaimana cara membayar tagihan listrik dan gas di flat Mesir?", category: "kehidupan", difficulty: "standar" },
  { question: "Provider internet apa yang paling stabil untuk mahasiswa di Kairo dan berapa biayanya?", category: "kehidupan", difficulty: "standar" },
  { question: "Bagaimana cara membeli dan mengisi ulang kartu SIM Mesir untuk pelajar asing?", category: "kehidupan", difficulty: "standar" },
  { question: "Aplikasi transportasi online apa yang paling aman dan murah dipakai di Kairo?", category: "kehidupan", difficulty: "standar" },
  { question: "Bagaimana cara naik metro Kairo: beli tiket, baca jalur, dan berapa tarifnya?", category: "kehidupan", difficulty: "standar" },
  { question: "Apa rute transportasi paling praktis dari Hay Asyir ke kampus Al-Azhar Darrasah?", category: "kehidupan", difficulty: "standar" },
  { question: "Di mana tempat belanja bahan makanan paling murah untuk mahasiswa di Nasr City?", category: "kehidupan", difficulty: "standar" },
  { question: "Di mana bisa membeli bumbu dan bahan makanan Indonesia di Kairo?", category: "kehidupan", difficulty: "standar" },
  { question: "Klinik atau rumah sakit mana yang biasa direkomendasikan untuk mahasiswa Indonesia di Kairo?", category: "kehidupan", difficulty: "standar" },
  { question: "Bagaimana cara berobat di Mesir tanpa asuransi dan berapa kisaran biayanya?", category: "kehidupan", difficulty: "kompleks" },
  { question: "Apa yang harus dilakukan kalau sakit darurat tengah malam di Kairo dan nomor apa yang dihubungi?", category: "kehidupan", difficulty: "kompleks" },
  { question: "Obat-obatan apa saja yang sebaiknya dibawa dari Indonesia karena sulit dicari di Mesir?", category: "kehidupan", difficulty: "standar" },
  { question: "Bagaimana cara mengirim uang dari Indonesia ke Mesir yang paling murah dan cepat?", category: "kehidupan", difficulty: "kompleks" },
  { question: "Di mana tempat penukaran uang yang aman dan kursnya bagus di Kairo?", category: "kehidupan", difficulty: "standar" },
  { question: "Bagaimana cara membuka rekening bank di Mesir sebagai mahasiswa asing?", category: "kehidupan", difficulty: "kompleks" },
  { question: "Apa saja tips bertahan menghadapi musim panas Kairo yang ekstrem?", category: "kehidupan", difficulty: "standar" },
  { question: "Perlengkapan apa yang perlu disiapkan untuk menghadapi musim dingin di Kairo?", category: "kehidupan", difficulty: "standar" },
  { question: "Barang apa saja yang wajib dan yang tidak perlu dibawa dari Indonesia saat pertama berangkat ke Mesir?", category: "kehidupan", difficulty: "kompleks" },
  { question: "Lebih hemat mana, laundry atau mesin cuci sendiri untuk mahasiswa di Mesir?", category: "kehidupan", difficulty: "sederhana" },
  { question: "Di mana tempat potong rambut yang murah dan bagus di sekitar Hay Asyir?", category: "kehidupan", difficulty: "sederhana" },
  { question: "Bagaimana cara menghindari penipuan atau harga turis saat belanja di Mesir?", category: "kehidupan", difficulty: "standar" },
  { question: "Apa saja hal yang sebaiknya tidak dilakukan di Mesir karena bisa berujung masalah hukum?", category: "kehidupan", difficulty: "kompleks" },
  { question: "Bagaimana cara mengurus pengiriman paket dari Indonesia ke Mesir dan berapa bea masuknya?", category: "kehidupan", difficulty: "kompleks" },
  { question: "Bagaimana cara mencari teman sekamar (partner flat) yang cocok di kalangan Masisir?", category: "kehidupan", difficulty: "standar" },
  { question: "Apa saja pilihan makanan halal dan murah di sekitar kampus Al-Azhar?", category: "kehidupan", difficulty: "standar" },

  // ── Komunitas & Kehidupan Masisir ─────────────────────────────────────────
  { question: "Apa itu PPMI Mesir dan apa saja fungsinya untuk mahasiswa Indonesia di Mesir?", category: "komunitas", difficulty: "standar" },
  { question: "Apa bedanya kekeluargaan, almamater, dan afiliatif dalam struktur organisasi Masisir?", category: "komunitas", difficulty: "kompleks" },
  { question: "Bagaimana cara bergabung dengan kekeluargaan sesuai daerah asal?", category: "komunitas", difficulty: "sederhana" },
  { question: "Apa itu ORMABA dan apa saja yang didapat mahasiswa baru dari kegiatan tersebut?", category: "komunitas", difficulty: "standar" },
  { question: "Wadah apa saja yang bisa diikuti Masisir untuk mengembangkan minat menulis dan jurnalistik?", category: "komunitas", difficulty: "standar" },
  { question: "Bagaimana cara mencari pekerjaan sampingan yang halal dan aman untuk Masisir?", category: "komunitas", difficulty: "kompleks" },
  { question: "Apa saja peluang usaha yang umum dijalankan Masisir sambil kuliah?", category: "komunitas", difficulty: "kompleks" },
  { question: "Bagaimana cara ikut kegiatan olahraga atau komunitas hobi di kalangan Masisir?", category: "komunitas", difficulty: "sederhana" },
  { question: "Grup atau kanal informasi apa saja yang wajib diikuti mahasiswa baru Masisir?", category: "komunitas", difficulty: "standar" },
  { question: "Bagaimana cara mendapatkan bantuan kalau mengalami kesulitan keuangan mendadak di Mesir?", category: "komunitas", difficulty: "kompleks" },
  { question: "Apa saja agenda tahunan besar Masisir yang biasanya diikuti banyak mahasiswa?", category: "komunitas", difficulty: "standar" },
  { question: "Bagaimana sistem jual-beli barang bekas antar Masisir bekerja?", category: "komunitas", difficulty: "standar" },
  { question: "Apa yang harus dilakukan kalau mengalami konflik dengan pemilik flat di Mesir?", category: "komunitas", difficulty: "kompleks" },
  { question: "Bagaimana prosedur pengurusan kepulangan jenazah WNI dari Mesir ke Indonesia?", category: "komunitas", difficulty: "kompleks" },
  { question: "Apa yang harus dilakukan kalau berurusan dengan kepolisian Mesir dan ke mana meminta pendampingan?", category: "komunitas", difficulty: "kompleks" },
  { question: "Bagaimana cara mahasiswa baru membangun relasi dan jaringan di komunitas Masisir?", category: "komunitas", difficulty: "standar" },

  // ── Bahasa Arab & Istilah Lokal ───────────────────────────────────────────
  { question: "Apa saja istilah amiyah Mesir yang wajib dikuasai mahasiswa baru untuk kebutuhan sehari-hari?", category: "bahasa", difficulty: "kompleks" },
  { question: "Apa bedanya bahasa Arab fusha dan amiyah Mesir, dan kapan masing-masing dipakai?", category: "bahasa", difficulty: "standar" },
  { question: "Bagaimana cara menawar harga dalam bahasa amiyah Mesir?", category: "bahasa", difficulty: "standar" },
  { question: "Istilah apa saja di pasar atau toko Mesir yang sering membingungkan mahasiswa baru?", category: "bahasa", difficulty: "standar" },
  { question: "Apa arti dan kapan dipakai istilah khalas, maalesh, dan yalla dalam percakapan sehari-hari orang Mesir?", category: "bahasa", difficulty: "standar" },
  { question: "Bagaimana cara berkomunikasi dengan sopir taksi Mesir menggunakan amiyah?", category: "bahasa", difficulty: "standar" },
  { question: "Istilah Arab apa saja yang muncul di dokumen keimigrasian Mesir dan apa artinya?", category: "bahasa", difficulty: "kompleks" },
  { question: "Istilah kampus Al-Azhar dalam bahasa Arab apa saja yang wajib diketahui mahasiswa?", category: "bahasa", difficulty: "kompleks" },
  { question: "Bagaimana cara belajar amiyah Mesir dengan cepat bagi mahasiswa baru?", category: "bahasa", difficulty: "standar" },
  { question: "Apa saja kesalahan umum mahasiswa Indonesia saat berbicara bahasa Arab di Mesir?", category: "bahasa", difficulty: "standar" },
  { question: "Bagaimana cara membaca dan memahami jadwal kuliah Al-Azhar yang berbahasa Arab?", category: "bahasa", difficulty: "standar" },
  { question: "Bagaimana cara menyebut angka dan mata uang Mesir dalam transaksi sehari-hari?", category: "bahasa", difficulty: "standar" },
  { question: "Bagaimana cara menulis surat permohonan (thalab) resmi berbahasa Arab untuk keperluan kampus?", category: "bahasa", difficulty: "kompleks" },
  { question: "Istilah medis dasar berbahasa Arab apa saja yang perlu diketahui saat berobat di Mesir?", category: "bahasa", difficulty: "standar" },
  { question: "Bagaimana cara melatih pemahaman logat Mesir lewat tontonan atau siaran lokal?", category: "bahasa", difficulty: "sederhana" },

  // ── Keislaman & Studi Turats ──────────────────────────────────────────────
  { question: "Apa itu talaqqi dan bagaimana cara memulainya bagi mahasiswa baru di Mesir?", category: "keislaman", difficulty: "standar" },
  { question: "Masjid mana saja di Kairo yang punya majelis talaqqi rutin untuk pelajar asing?", category: "keislaman", difficulty: "kompleks" },
  { question: "Bagaimana cara mendapatkan sanad dalam suatu kitab di Mesir?", category: "keislaman", difficulty: "kompleks" },
  { question: "Kitab dasar apa saja yang biasa ditalaqqi mahasiswa tingkat awal di Mesir?", category: "keislaman", difficulty: "standar" },
  { question: "Bagaimana adab menghadiri majelis syekh di Mesir?", category: "keislaman", difficulty: "standar" },
  { question: "Di mana tempat membeli kitab turats dengan harga murah di Kairo?", category: "keislaman", difficulty: "standar" },
  { question: "Apa keistimewaan Masjid Al-Azhar sebagai pusat kajian bagi pelajar asing?", category: "keislaman", difficulty: "standar" },
  { question: "Bagaimana cara ikut program tahfiz atau memperbaiki bacaan Al-Qur'an di Mesir?", category: "keislaman", difficulty: "standar" },
  { question: "Apa perbedaan pendekatan manhaj Al-Azhar dengan pola belajar di pesantren Indonesia?", category: "keislaman", difficulty: "kompleks" },
  { question: "Bagaimana cara mendapatkan ijazah sanad Al-Qur'an di Mesir?", category: "keislaman", difficulty: "kompleks" },
  { question: "Apa saja kegiatan keislaman rutin Masisir selama Ramadan di Mesir?", category: "keislaman", difficulty: "standar" },
  { question: "Bagaimana suasana dan tradisi Ramadan di Mesir dari sudut pandang mahasiswa Indonesia?", category: "keislaman", difficulty: "standar" },
  { question: "Di mana tempat i'tikaf yang biasa dipakai Masisir selama Ramadan?", category: "keislaman", difficulty: "standar" },
  { question: "Bagaimana cara mengikuti kajian berbahasa Indonesia yang dibimbing senior Masisir?", category: "keislaman", difficulty: "sederhana" },
  { question: "Apa saja etika bertanya dan berdiskusi dengan masyayikh Al-Azhar?", category: "keislaman", difficulty: "standar" },
];

/**
 * Hitung jumlah challenge per kategori. Dipakai admin untuk melihat sebaran
 * bank soal sebelum/sesudah seeding, dan oleh test sebagai penjaga supaya
 * tidak ada kategori yang diam-diam kosong saat daftar ini diedit.
 */
export function countChallengesByCategory(challenges = DEFAULT_TRAINER_CHALLENGES) {
  const counts = {};
  for (const c of challenges) counts[c.category] = (counts[c.category] ?? 0) + 1;
  return counts;
}
