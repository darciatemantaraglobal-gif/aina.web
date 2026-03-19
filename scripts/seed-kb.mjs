import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: adminUser } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
const authorId = adminUser?.users?.[0]?.id;
if (!authorId) {
  console.error("No users found in the database to use as author.");
  process.exit(1);
}

const articles = [
  {
    title: "Cara Mengurus Iqomah (Izin Tinggal) di Mesir",
    category: "Administrasi",
    content: `Iqomah adalah izin tinggal resmi yang wajib dimiliki oleh setiap mahasiswa asing yang belajar di Mesir. Tanpa iqomah, kamu tidak bisa melakukan banyak hal, mulai dari buka rekening bank hingga perpanjang visa.

**Dokumen yang Dibutuhkan:**
- Paspor asli + fotokopi semua halaman
- Foto terbaru ukuran paspor (4 lembar, background putih)
- Surat keterangan mahasiswa dari kampus (untuk Al-Azhar: Syahadah Qaid)
- Visa masuk yang masih berlaku
- Bukti tempat tinggal (kontrak sewa atau surat dari pemilik kos)
- Biaya administrasi sekitar 105–200 EGP tergantung jenis iqomah

**Prosedur Pengajuan:**
Datang ke kantor Maktab Al-Jiwazat (Imigrasi) di daerah Mogamma el-Tahrir, Kairo, atau kantor imigrasi terdekat di governorate tempat kamu tinggal. Proses pengajuan biasanya memakan waktu 2–4 minggu. Iqomah perlu diperbarui setiap tahun.

**Tips Penting:**
Bawa semua dokumen dalam format asli dan fotokopi. Datang pagi hari karena antrian bisa sangat panjang. Sebaiknya minta bantuan senior atau PPMI setempat untuk menemani, terutama jika belum lancar bahasa Arab.

*Sumber: Komunitas Masisir & Pengalaman Lapangan*`,
  },
  {
    title: "Panduan Mendaftar Kuliah di Universitas Al-Azhar",
    category: "Akademik",
    content: `Al-Azhar adalah tujuan utama mahasiswa Indonesia yang belajar di Mesir. Universitas ini memiliki prosedur pendaftaran tersendiri yang perlu dipahami sebelum berangkat.

**Jalur Masuk:**
- Jalur resmi melalui Kemenag RI (beasiswa MORA) — biasanya pendaftaran dibuka setiap tahun antara Maret–Mei
- Jalur mandiri langsung ke Al-Azhar — memerlukan sertifikat bahasa Arab atau lulus ujian masuk
- Jalur rekomendasi dari pesantren/lembaga yang memiliki MOU dengan Al-Azhar

**Dokumen Wajib:**
- Ijazah SMA/MA yang telah dilegalisir dan diterjemahkan ke bahasa Arab
- Transkrip nilai dengan legalisir resmi
- Sertifikat kemampuan bahasa Arab (jika ada)
- Paspor yang masih berlaku minimal 2 tahun
- Foto terbaru 4x6 sebanyak 8 lembar
- Surat keterangan sehat dari dokter

**Proses di Kairo:**
Setelah tiba di Mesir, mahasiswa baru wajib melapor ke kantor Maktab Al-Bua'uts Al-Islamiyyah di Abbasiyya untuk pengurusan administrasi awal. Dari sini kamu akan mendapatkan Syahadah Qaid (surat keterangan mahasiswa) yang dibutuhkan untuk pengurusan iqomah.

**Catatan Penting:**
Ujian masuk Al-Azhar mencakup tes membaca Al-Quran, nahwu-sharaf, dan terjemahan bahasa Arab. Persiapkan diri dengan matang sebelum berangkat.

*Sumber: Panduan PPMI Mesir & Pengalaman Masisir*`,
  },
  {
    title: "Transportasi di Kairo: Metro, Mikro Bus, dan Uber",
    category: "Transport",
    content: `Kairo memiliki beberapa pilihan transportasi umum yang bisa dimanfaatkan mahasiswa Indonesia untuk mobilitas sehari-hari.

**Metro Kairo:**
Metro adalah pilihan terbaik — cepat, murah, dan tidak macet. Tarif per perjalanan sekitar 7–10 EGP. Ada 3 jalur utama yang menghubungkan berbagai wilayah Kairo. Stasiun penting bagi masisir antara lain Hadayek El Maadi, Sadat (Tahrir), Nasser, dan Abbasiyya.

**Mikro Bus (Mikrobus):**
Mikrobus adalah angkutan umum berupa minibus 12-seat yang sangat murah (2–5 EGP). Tidak ada rute tetap yang tertulis, jadi kamu perlu hafal rute atau tanya ke penumpang lain. Ini adalah pilihan yang paling sering digunakan masisir untuk jarak dekat.

**Uber & Careem:**
Untuk kenyamanan dan keamanan, Uber dan Careem sangat direkomendasikan terutama malam hari. Tarif mulai dari 30–80 EGP untuk jarak 5–10 km, tergantung macet dan tipe kendaraan. Pastikan kamu punya nomor telepon lokal Mesir untuk mendaftar.

**Taksi Biasa:**
Pastikan selalu minta taksi meter dihidupkan atau negosiasi harga sebelum naik. Harga normal dari Maadi ke Tahrir sekitar 40–60 EGP.

**Tips:**
Download aplikasi Uber dan Careem sebelum berangkat. Isi saldo atau sambungkan kartu kredit dari Indonesia terlebih dahulu.

*Sumber: Komunitas Masisir Kairo*`,
  },
  {
    title: "Tips Mencari Tempat Tinggal di Kairo untuk Masisir",
    category: "Tempat Tinggal",
    content: `Mencari tempat tinggal adalah salah satu tantangan terbesar bagi mahasiswa baru yang tiba di Kairo. Berikut panduan lengkapnya.

**Daerah Populer Masisir:**
- **Maadi** — Paling banyak masisir, fasilitas lengkap, akses metro mudah. Harga sewa lebih tinggi tapi sepadan.
- **Hay Asyir (Oktober City)** — Banyak asrama mahasiswa Al-Azhar, lebih terjangkau.
- **Abbasiyya** — Dekat kampus Al-Azhar laki-laki, banyak pilihan kos murah.
- **Nasr City** — Dekat beberapa fakultas, akses ke pusat kota lumayan.

**Kisaran Harga (per bulan, 2024):**
- Kamar bersama (sharing 2–4 orang): 1.500–3.000 EGP
- Kamar sendiri di apartemen bersama: 3.000–5.000 EGP
- Apartemen studio mandiri: 5.000–10.000 EGP ke atas

**Cara Cari Kos:**
Bergabunglah dengan grup WhatsApp atau Facebook komunitas masisir setempat. Minta rekomendasi dari senior yang sudah ada di Kairo — ini cara paling aman. Hindari bayar DP tanpa survei fisik terlebih dahulu.

**Yang Perlu Dicek Sebelum Kontrak:**
- Kondisi air dan listrik (apakah stabil?)
- Fasilitas dapur dan kamar mandi
- Keamanan gedung (ada satpam atau tidak)
- Kedekatan ke masjid, pasar, dan transportasi
- Sistem pembayaran (bulanan atau tahunan?)

*Sumber: Komunitas Masisir & Senior Al-Azhar*`,
  },
  {
    title: "Kuliner Halal Terjangkau di Kairo untuk Mahasiswa",
    category: "Kuliner",
    content: `Kabar baiknya: hampir semua makanan di Mesir adalah halal karena mayoritas penduduknya Muslim. Yang perlu diperhatikan adalah kehalalannya untuk vegetarian atau yang pantang daging tertentu.

**Makanan Lokal Murah dan Mengenyangkan:**
- **Kushari** — Makanan nasional Mesir. Campuran nasi, lentil, makaroni, dan saus tomat pedas. Harga 10–20 EGP per porsi. Enak, mengenyangkan, dan 100% vegan!
- **Falafel (Ta'miyya)** — Gorengan dari kacang arab, biasanya dimakan dengan roti baladi. Sarapan paling murah, 2–5 EGP.
- **Ful Medammes** — Sup kacang arab yang menjadi sarapan khas Mesir. Bergizi tinggi, harga 5–10 EGP.
- **Shawarma** — Kebab daging ayam/sapi dengan sayuran dan saus. Harga 20–40 EGP.
- **Hawawshi** — Roti isi daging cincur bumbu rempah yang dipanggang. Enak banget!

**Restoran Indonesia di Kairo:**
Ada beberapa restoran dan warung masakan Indonesia yang dikelola masisir, terutama di daerah Maadi. Cek grup masisir di media sosial untuk daftar terbaru.

**Tips Belanja:**
- Pasar tradisional (souq) jauh lebih murah dari supermarket modern
- Beli sayur dan buah di Al-Saleeb atau pasar terdekat
- Makan siang di warung lokal sekitar kampus untuk menghemat budget

*Sumber: Pengalaman Masisir Kairo*`,
  },
  {
    title: "Kurs EGP/IDR dan Tips Tukar Uang di Mesir",
    category: "Kehidupan Mesir",
    content: `Salah satu hal penting yang perlu dipahami masisir adalah soal keuangan dan nilai tukar mata uang Mesir (Egyptian Pound / EGP) terhadap Rupiah (IDR) dan Dolar Amerika (USD).

**Kondisi Kurs Saat Ini:**
Sejak devaluasi besar-besaran pada 2022–2024, nilai EGP melemah signifikan. Per Maret 2024, 1 USD setara sekitar 47–50 EGP, dan 1 EGP setara sekitar Rp 300–350. Kurs ini dapat berubah sewaktu-waktu.

**Cara Tukar Uang:**
- **Exchange resmi** — Tersebar di seluruh Kairo, biasanya menawarkan kurs lebih baik dari bank. Cari yang ramai dan terpercaya.
- **Bank** — Aman tapi kurs sedikit lebih rendah dan butuh antre lebih lama.
- **ATM** — Bisa tarik tunai EGP langsung dari kartu debit/kredit Indonesia, tapi biaya admin tinggi.
- **Transfer via Western Union/Wise** — Alternatif untuk kiriman dari keluarga di Indonesia.

**Tips Hemat:**
- Simpan uang dalam USD atau IDR, konversi ke EGP secara bertahap sesuai kebutuhan
- Jangan bawa terlalu banyak uang tunai sekaligus
- Manfaatkan aplikasi seperti Wise untuk transfer internasional yang lebih murah

**Biaya Hidup Rata-rata Masisir:**
Untuk mahasiswa hemat: 2.500–4.000 EGP/bulan (sudah termasuk makan, transport, dan kebutuhan dasar). Untuk standar nyaman: 5.000–8.000 EGP/bulan.

*Sumber: Komunitas Masisir & Data Lapangan 2024*`,
  },
  {
    title: "Cara Membuka Rekening Bank di Mesir",
    category: "Administrasi",
    content: `Memiliki rekening bank lokal di Mesir sangat memudahkan transaksi sehari-hari, terutama untuk pembayaran sewa dan penerimaan beasiswa atau kiriman keluarga.

**Bank Populer untuk Masisir:**
- **Banque Misr** — Bank pemerintah, banyak cabang, proses cukup mudah
- **National Bank of Egypt (NBE)** — Jaringan luas, bisa untuk transfer internasional
- **CIB (Commercial International Bank)** — Layanan lebih modern, cocok untuk transaksi digital

**Syarat Membuka Rekening:**
- Paspor asli yang masih berlaku
- Iqomah (izin tinggal) yang masih berlaku — ini yang sering jadi kendala masisir baru
- Bukti tempat tinggal (kontrak sewa)
- Foto terbaru 2–4 lembar
- Setoran awal: bervariasi, tapi biasanya mulai dari 500–1.000 EGP

**Catatan Penting:**
Tanpa iqomah yang valid, sebagian besar bank tidak akan memproses pembukaan rekening. Jadi, prioritaskan mengurus iqomah terlebih dahulu. Beberapa mahasiswa menggunakan rekening teman atau senior selama masa transisi, tapi ini tidak disarankan untuk jangka panjang.

**Alternatif Digital:**
Untuk transaksi sehari-hari sementara belum punya rekening lokal, kamu bisa menggunakan Vodafone Cash atau Orange Money (dompet digital Mesir) yang lebih mudah dibuat.

*Sumber: Komunitas Masisir & Pengalaman Lapangan*`,
  },
  {
    title: "Daftar Rumah Sakit dan Klinik yang Direkomendasikan di Kairo",
    category: "Kehidupan Mesir",
    content: `Kesehatan adalah prioritas utama. Sebagai masisir, penting mengetahui fasilitas kesehatan yang tersedia dan terjangkau di Kairo.

**Rumah Sakit Pemerintah (Gratis/Sangat Murah):**
- **RS Qasr Al-Aini** — Rumah sakit universitas terbesar, lengkap tapi sering penuh. Gratis untuk pemegang iqomah mahasiswa
- **RS Embabi** — Alternatif yang lebih tenang, masih standar pemerintah

**Rumah Sakit Swasta Terjangkau:**
- **As-Salam International Hospital (Maadi)** — Terpercaya, banyak dokter berbahasa Inggris
- **Dar Al-Fouad Hospital** — Fasilitas modern, untuk kondisi yang lebih serius
- **Saudi-German Hospital** — Standar internasional, ada layanan darurat 24 jam

**Klinik Umum:**
Tersebar di seluruh Kairo. Konsultasi dokter umum biasanya 50–200 EGP. Bawa paspor dan iqomah saat berobat.

**Apotek (Eczane):**
Apotek di Mesir sangat banyak dan mudah ditemukan. Banyak obat yang dijual bebas tanpa resep dokter. Harga obat cukup terjangkau dibanding Indonesia.

**Tips:**
- Simpan nomor darurat: Ambulans 123, Polisi 122
- Bawa asuransi kesehatan dari Indonesia jika memungkinkan
- Bergabunglah dengan grup masisir setempat untuk rekomendasi dokter terpercaya

*Sumber: Komunitas Masisir & Pengalaman Lapangan*`,
  },
  {
    title: "Sistem Akademik Al-Azhar: SKS, Ujian, dan Kelulusan",
    category: "Akademik",
    content: `Memahami sistem akademik Al-Azhar sejak awal akan membantu kamu merencanakan studi dengan lebih baik dan menghindari masalah administrasi yang umum terjadi.

**Sistem Penilaian:**
Al-Azhar menggunakan sistem nilai berbeda dari Indonesia. Nilai akhir biasanya ditentukan oleh ujian akhir semester (sekitar 70–80%) dan kehadiran/tugas (20–30%). Tidak ada sistem SKS seperti di Indonesia — mahasiswa mengikuti semua mata kuliah yang ditetapkan per semester.

**Jadwal Ujian:**
- Semester 1 (Ganjil): Ujian sekitar bulan Januari
- Semester 2 (Genap): Ujian sekitar bulan Juni
- Ujian susulan/perbaikan tersedia untuk yang tidak lulus

**Absensi:**
Absensi sangat penting! Mahasiswa yang tidak hadir lebih dari 25% dari total pertemuan akan dilarang mengikuti ujian. Pastikan hadir secara konsisten terutama di awal semester.

**Bahasa Pengantar:**
Semua perkuliahan menggunakan bahasa Arab Fusha (Arab standar). Jika bahasa Arabmu belum lancar, pertimbangkan untuk mengikuti kursus bahasa Arab intensif di Kairo sebelum atau sambil kuliah.

**Wisuda dan Kelulusan:**
Mahasiswa S1 umumnya menyelesaikan studi dalam 4 tahun. Setelah lulus, ijazah perlu dilegalisir oleh Kemenag dan Kemlu RI sebelum dapat digunakan di Indonesia.

*Sumber: Panduan Akademik Al-Azhar & PPMI Mesir*`,
  },
  {
    title: "Tempat Belanja Kebutuhan Sehari-hari di Kairo",
    category: "Kehidupan Mesir",
    content: `Kairo menawarkan berbagai pilihan berbelanja dari pasar tradisional yang murah hingga supermarket modern. Ketahui mana yang paling cocok untuk kebutuhan dan budgetmu.

**Pasar Tradisional (Souq):**
- **Souq el-Attarin** (dekat Khan el-Khalili) — Untuk rempah, herbal, dan bumbu dapur
- **Pasar Imbaba** — Sayur, buah, dan kebutuhan dapur dengan harga murah
- **Al-Saleeb** — Populer di kalangan masisir Maadi, lengkap dan terjangkau

**Supermarket Modern:**
- **Carrefour** — Ada di beberapa mal besar seperti City Stars dan Mall of Egypt. Lengkap tapi harga lebih mahal.
- **Spinneys** — Supermarket dengan produk impor, cocok untuk yang rindu produk Asia
- **Hyper One** — Ukuran besar, banyak pilihan, sering ada promo

**Toko Produk Asia:**
Ada beberapa toko yang menjual produk Indonesia dan Asia di daerah Maadi dan beberapa sudut Kairo. Produk seperti kecap ABC, indomie, dan sambel bisa ditemukan di sini meski harganya jauh lebih mahal.

**Tips Belanja Hemat:**
- Belanja di pasar tradisional untuk kebutuhan harian
- Manfaatkan momen Ramadan — banyak diskon besar di berbagai toko
- Beli produk dalam jumlah besar bersama teman untuk mendapat harga grosir
- Pasar tumpah biasanya ada di masing-masing daerah, tanya ke senior

*Sumber: Komunitas Masisir Kairo*`,
  },
  {
    title: "Perpanjangan Visa Mesir: Prosedur dan Biaya",
    category: "Administrasi",
    content: `Visa masuk Mesir umumnya berlaku 30 hari (Single Entry) atau 6 bulan (Multiple Entry). Sebagai mahasiswa jangka panjang, kamu perlu memahami prosedur perpanjangan sebelum visa habis.

**Jenis Visa:**
- **Tourist Visa (30 hari)** — Visa yang paling umum saat pertama masuk
- **Student Visa** — Diajukan setelah mendapat Syahadah Qaid dari kampus, berlaku 1 tahun dan bisa diperpanjang

**Prosedur Perpanjangan:**
1. Pergi ke kantor Mogamma el-Tahrir di pusat Kairo (lantai 2)
2. Ambil formulir perpanjangan (gratis)
3. Isi formulir dan lampirkan: paspor, foto, iqomah, dan surat dari kampus
4. Bayar biaya di loket yang ditentukan
5. Kembali beberapa hari kemudian untuk mengambil paspor

**Biaya:**
- Single Entry Extension: ~190 EGP
- Multiple Entry Visa: ~570 EGP

**Jangan Sampai Overstay!**
Denda overstay di Mesir bisa mencapai $200–300 USD dan bisa menyebabkan masalah saat keluar masuk Mesir di kemudian hari. Perhatikan tanggal kedaluwarsa visamu dengan cermat.

**Tips:**
Urus perpanjangan setidaknya 1 minggu sebelum visa habis. Mogamma el-Tahrir buka Minggu–Kamis pukul 09.00–13.00. Datanglah sepagi mungkin karena antrian sangat panjang.

*Sumber: Pengalaman Masisir & Komunitas PPMI Mesir*`,
  },
  {
    title: "Cara Mengurus Paspor RI di KBRI Kairo",
    category: "Administrasi",
    content: `Paspor adalah dokumen paling penting yang harus selalu kamu jaga. Jika paspor rusak, hilang, atau hampir habis masa berlakunya, kamu perlu mengurusnya di KBRI Kairo.

**Lokasi KBRI Kairo:**
Jalan El-Mokhtar, Maadi, Kairo. Jam pelayanan: Senin–Jumat, pukul 08.30–15.00. Telp: +20-2-3749-2448.

**Layanan yang Tersedia:**
- Perpanjangan paspor
- Penggantian paspor hilang/rusak
- Pembuatan paspor baru (untuk WNI yang belum punya)
- Surat Perjalanan Laksana Paspor (SPLP) untuk keadaan darurat

**Dokumen untuk Perpanjangan Paspor:**
- Paspor lama + fotokopi
- E-KTP asli + fotokopi
- Foto terbaru 4x6 sebanyak 2 lembar (background merah)
- Formulir permohonan (tersedia di KBRI)
- Biaya layanan (tanya langsung ke KBRI karena tarif bisa berubah)

**Untuk Paspor Hilang:**
Tambahkan Surat Keterangan Kehilangan dari kepolisian Mesir (Al-Ballaghah) yang sudah diterjemahkan.

**Tips:**
- Buat janji terlebih dahulu melalui website atau WA KBRI jika tersedia, untuk menghindari antrian panjang
- Simpan salinan digital paspor di email/cloud sebagai cadangan
- Proses pembuatan biasanya memakan waktu 3–5 hari kerja

*Sumber: KBRI Kairo & Komunitas Masisir*`,
  },
  {
    title: "Rekomendasi Tempat Wisata dan Relaksasi di Kairo",
    category: "Kehidupan Mesir",
    content: `Kairo bukan hanya kota studi — ada banyak tempat menarik untuk refreshing di akhir pekan atau setelah ujian. Berikut rekomendasi dari komunitas masisir.

**Wisata Sejarah dan Budaya:**
- **Piramida Giza** — Ikon Mesir yang wajib dikunjungi. Tiket masuk ~200 EGP untuk WNA. Pergi pagi hari untuk menghindari panas dan keramaian.
- **Museum Nasional Peradaban Mesir (NMEC)** — Museum modern di Fustat, rumah mumi para firaun. Tiket ~200 EGP untuk WNA.
- **Khan el-Khalili** — Pasar tradisional bersejarah di kawasan Old Cairo, surganya oleh-oleh dan kerajinan tangan.
- **Citadel of Saladin** — Benteng bersejarah dengan pemandangan panorama Kairo yang luar biasa.

**Tempat Nongkrong Terjangkau:**
- **Corniche el-Nil** (tepi sungai Nil) — Jalan-jalan sore sambil menikmati pemandangan sungai Nil tanpa biaya
- **Al-Azhar Park** — Taman hijau yang tenang di tengah kota, tiket masuk sekitar 20 EGP
- **El-Fishawi Café** (Khan el-Khalili) — Kedai kopi legendaris yang buka 24 jam, cocok untuk bersantai dan ngeteh

**Wisata Alam Dekat Kairo:**
- **Wadi El-Rayan** (Fayum, ~100 km) — Danau dan air terjun di padang pasir, cocok untuk day trip
- **Dahshur** — Piramida yang lebih sepi dan terjangkau dibanding Giza

*Sumber: Komunitas Masisir & Travel Guide Kairo*`,
  },
  {
    title: "Komunitas dan Organisasi Masisir yang Perlu Diketahui",
    category: "Kehidupan Mesir",
    content: `Bergabung dengan komunitas masisir sangat penting, terutama di tahun-tahun pertama. Komunitas ini akan membantumu beradaptasi, mendapat informasi terkini, dan membangun jaringan sosial yang kuat.

**PPMI (Persatuan Pelajar dan Mahasiswa Indonesia) Mesir:**
Organisasi induk masisir yang berfungsi sebagai jembatan antara mahasiswa Indonesia dengan KBRI Kairo dan otoritas Mesir. PPMI aktif mengurus berbagai kebutuhan administratif dan sosial masisir.

**IKPM (Ikatan Keluarga Pondok Modern) Mesir:**
Wadah bagi alumni pesantren Gontor dan pondok modern lainnya. Aktif dalam kegiatan sosial dan kajian keislaman.

**Organisasi Kedaerahan:**
Ada banyak organisasi masisir berdasarkan asal daerah (Jawa, Sumatera, Kalimantan, dll.) yang aktif mengadakan kegiatan sosial dan saling membantu sesama anggota.

**Komunitas Online:**
- Grup WhatsApp "Masisir Update" — Info terkini seputar kehidupan di Kairo
- Grup Facebook "Masisir" — Diskusi dan tanya jawab
- Telegram channel berita masisir — Update akademik, beasiswa, dan acara

**Kegiatan Rutin:**
- Pengajian rutin tiap pekan
- Turnamen olahraga antar komunitas
- Bazar masakan Indonesia
- Diskusi dan bedah buku

**Saran:**
Jangan ragu untuk bergabung dengan komunitas sejak hari pertama tiba. Senior masisir adalah sumber informasi paling berharga dan biasanya dengan senang hati membantu junior baru.

*Sumber: PPMI Mesir & Komunitas Masisir*`,
  },
  {
    title: "Warung dan Restoran Masakan Indonesia di Kairo",
    category: "Kuliner",
    content: `Rindu masakan rumah? Tenang, ada beberapa warung masakan Indonesia yang dikelola oleh masisir dan warga Indonesia di Kairo. Berikut informasi yang berguna.

**Daerah dengan Konsentrasi Warung Indonesia:**
Maadi adalah pusat komunitas masisir, dan di sinilah paling banyak ditemukan warung masakan Indonesia. Selain itu, ada beberapa titik di Nasr City dan Hay Asyir.

**Menu yang Biasanya Tersedia:**
- Nasi dengan lauk pauk ala warteg (ayam goreng, tempe, tahu, sayur)
- Mie goreng dan nasi goreng
- Bakso dan mie ayam (musiman, tergantung ketersediaan bahan)
- Soto, rawon, dan gulai (biasanya untuk acara khusus)
- Martabak manis dan gorengan

**Tips Menemukan Warung:**
Tanya ke senior atau bergabung di grup WhatsApp komunitas masisir setempat. Daftar warung sering berubah karena buka-tutup mengikuti masa studi pemiliknya. Cek juga Instagram dan grup Facebook masisir untuk info terbaru.

**Harga:**
Paket nasi + lauk biasanya 30–70 EGP. Lebih mahal dari makanan lokal Mesir, tapi jauh lebih murah dari restoran Indonesia di Indonesia!

**Acara Potluck:**
Komunitas masisir sering mengadakan acara masak bersama, terutama saat hari raya Idul Fitri dan Idul Adha. Ini kesempatan terbaik untuk makan masakan Indonesia lengkap hasil gotong royong.

*Sumber: Komunitas Masisir Kairo*`,
  },
];

console.log(`\nSeeding ${articles.length} articles to knowledge base...\n`);

let success = 0;
let failed = 0;

for (const article of articles) {
  const { error } = await supabase.from("knowledge_base").insert({
    author_id: authorId,
    title: article.title,
    content: article.content,
    category: article.category,
    status: "approved",
  });

  if (error) {
    console.error(`✗ Failed: "${article.title}" — ${error.message}`);
    failed++;
  } else {
    console.log(`✓ Inserted: "${article.title}" [${article.category}]`);
    success++;
  }
}

console.log(`\nDone! ${success} articles inserted, ${failed} failed.`);
