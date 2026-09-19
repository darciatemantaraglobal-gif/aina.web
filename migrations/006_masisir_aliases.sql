-- 006_masisir_aliases.sql
-- Memindahkan kamus istilah Masisir dari hardcode di server.js ke database.
--
-- KENAPA: daftar ini (74 istilah, 242 alias) sebelumnya ditulis tangan di
-- dalam fetchRelevantArticles(). Konsekuensinya dua:
--   1. Orang yang paling tahu kosakata Masisir — contributor & admin — tidak
--      bisa menambah istilah tanpa minta developer deploy ulang.
--   2. Kosakata Masisir berubah terus (kawasan baru, kebijakan baru, slang
--      baru), jadi daftar hardcode dijamin basi seiring waktu.
--
-- AMAN DIJALANKAN KAPAN SAJA: server.js tetap memakai daftar hardcode sebagai
-- fallback kalau tabel ini belum ada atau masih kosong, jadi tidak ada momen
-- di mana pencarian KB kehilangan kamusnya.
--
-- Cara pakai setelah migrasi: Admin → Knowledge → Kamus Istilah, atau langsung
-- INSERT ke tabel ini. Perubahan terbaca maksimal 10 menit (cache TTL), atau
-- langsung kalau lewat endpoint admin.

CREATE TABLE IF NOT EXISTS public.masisir_aliases (
  term       TEXT PRIMARY KEY,
  aliases    TEXT[] NOT NULL DEFAULT '{}',
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.masisir_aliases IS 'Kamus sinonim istilah Masisir untuk ekspansi query pencarian knowledge base.';
COMMENT ON COLUMN public.masisir_aliases.term    IS 'Istilah yang diketik user (huruf kecil semua).';
COMMENT ON COLUMN public.masisir_aliases.aliases IS 'Istilah lain yang ikut dicari ketika term muncul di pertanyaan.';
COMMENT ON COLUMN public.masisir_aliases.note    IS 'Catatan opsional buat admin — kenapa alias ini ada.';

-- Backend-only table: diakses lewat service_role dari server. Deny-all untuk
-- anon/authenticated, sama seperti tabel internal lain (lihat migrasi 004).
ALTER TABLE public.masisir_aliases ENABLE ROW LEVEL SECURITY;

-- Seed dari daftar hardcode yang sudah jalan di produksi.
-- ON CONFLICT DO NOTHING: aman di-run ulang, dan TIDAK menimpa perubahan yang
-- sudah dibuat admin lewat UI.
INSERT INTO public.masisir_aliases (term, aliases) VALUES
  ('iqomah', ARRAY['iqama', 'igamah', 'izin tinggal', 'residence']::text[]),
  ('iqama', ARRAY['iqomah', 'igamah', 'izin tinggal']::text[]),
  ('igamah', ARRAY['iqomah', 'iqama', 'izin tinggal']::text[]),
  ('kbri', ARRAY['kedutaan', 'kedubes', 'konsulat']::text[]),
  ('kedutaan', ARRAY['kbri', 'kedubes']::text[]),
  ('kedubes', ARRAY['kbri', 'kedutaan']::text[]),
  ('paspor', ARRAY['passport']::text[]),
  ('passport', ARRAY['paspor']::text[]),
  ('visa', ARRAY['viza', 'izin masuk']::text[]),
  ('viza', ARRAY['visa']::text[]),
  ('azhar', ARRAY['al-azhar', 'universitas azhar']::text[]),
  ('qaid', ARRAY['shahada', 'surat aktif', 'syahadat']::text[]),
  ('shahada', ARRAY['qaid', 'syahadat']::text[]),
  ('ppmi', ARRAY['organisasi', 'masisir', 'persatuan', 'perhimpunan']::text[]),
  ('lokasi', ARRAY['alamat', 'kantor', 'tempat', 'gedung', 'letak']::text[]),
  ('alamat', ARRAY['lokasi', 'kantor', 'tempat', 'gedung']::text[]),
  ('kantor', ARRAY['lokasi', 'alamat', 'gedung', 'tempat']::text[]),
  ('kost', ARRAY['sewa', 'apartemen', 'kontrakan']::text[]),
  ('kos', ARRAY['sewa', 'apartemen', 'kontrakan']::text[]),
  ('sewa', ARRAY['kost', 'kos', 'kontrakan', 'apartemen']::text[]),
  ('bus', ARRAY['autobus', 'metro']::text[]),
  ('metro', ARRAY['bus', 'autobus']::text[]),
  ('halal', ARRAY['kuliner', 'makanan halal']::text[]),
  ('kuliner', ARRAY['makanan', 'restoran']::text[]),
  ('makan', ARRAY['kuliner', 'restoran']::text[]),
  ('transfer', ARRAY['bayar', 'pembayaran', 'kirim uang']::text[]),
  ('rasm', ARRAY['biaya kuliah', 'spp', 'uang kuliah']::text[]),
  ('riyal', ARRAY['egp', 'pound mesir']::text[]),
  ('perpanjang', ARRAY['perpanjangan', 'renew', 'renewal']::text[]),
  ('daftar', ARRAY['pendaftaran', 'registrasi', 'register']::text[]),
  ('kuliah', ARRAY['akademik', 'kampus', 'perkuliahan']::text[]),
  ('rumah', ARRAY['apartemen', 'sewa', 'kost']::text[]),
  ('muadzin', ARRAY['mu''adzin', 'azan']::text[]),
  ('sakit', ARRAY['klinik', 'dokter', 'rumah sakit', 'rs', 'kesehatan', 'berobat']::text[]),
  ('dokter', ARRAY['klinik', 'rumah sakit', 'sakit', 'berobat', 'kesehatan']::text[]),
  ('klinik', ARRAY['dokter', 'rumah sakit', 'kesehatan', 'berobat']::text[]),
  ('obat', ARRAY['apotek', 'pharmacy', 'farmasi', 'klinik']::text[]),
  ('apotek', ARRAY['obat', 'pharmacy', 'farmasi']::text[]),
  ('taksi', ARRAY['uber', 'grab', 'careem', 'transport', 'kendaraan']::text[]),
  ('careem', ARRAY['taksi', 'uber', 'grab', 'transport']::text[]),
  ('uber', ARRAY['taksi', 'careem', 'grab', 'transport']::text[]),
  ('bandara', ARRAY['airport', 'kairo', 'terminal', 'terbang', 'pesawat']::text[]),
  ('pesawat', ARRAY['tiket', 'terbang', 'bandara', 'airport']::text[]),
  ('kereta', ARRAY['metro', 'train', 'rail', 'stasiun']::text[]),
  ('imtihan', ARRAY['ujian', 'exam', 'tes', 'nilai', 'kuliah']::text[]),
  ('ujian', ARRAY['imtihan', 'exam', 'tes']::text[]),
  ('skripsi', ARRAY['tesis', 'penelitian', 'tugas akhir']::text[]),
  ('tesis', ARRAY['skripsi', 'penelitian', 'tugas akhir']::text[]),
  ('beasiswa', ARRAY['scholarship', 'bantuan', 'dana', 'biaya']::text[]),
  ('semester', ARRAY['kuliah', 'akademik', 'tahun ajaran']::text[]),
  ('wisuda', ARRAY['graduation', 'lulus', 'selesai kuliah']::text[]),
  ('bank', ARRAY['atm', 'transfer', 'rekening', 'western union']::text[]),
  ('atm', ARRAY['bank', 'transfer', 'rekening', 'uang']::text[]),
  ('western', ARRAY['western union', 'transfer', 'kirim uang', 'remitansi']::text[]),
  ('remitansi', ARRAY['western union', 'transfer', 'kirim uang', 'bank']::text[]),
  ('pound', ARRAY['egp', 'le', 'riyal', 'mata uang']::text[]),
  ('egp', ARRAY['pound', 'le', 'riyal', 'mata uang']::text[]),
  ('kpm', ARRAY['kelompok pengajian', 'komunitas', 'pengajian']::text[]),
  ('pengajian', ARRAY['kpm', 'komunitas', 'majelis', 'belajar']::text[]),
  ('masjid', ARRAY['sholat', 'mushola', 'ibadah', 'majelis']::text[]),
  ('komunitas', ARRAY['kpm', 'ppmi', 'organisasi', 'perkumpulan']::text[]),
  ('kairo', ARRAY['cairo', 'mesir', 'hay asyir', 'asyir', 'manshiyah']::text[]),
  ('hay', ARRAY['hay asyir', 'asyir', 'wilayah', 'kawasan']::text[]),
  ('asyir', ARRAY['hay asyir', 'hay', 'wilayah', 'kawasan']::text[]),
  ('manshiyah', ARRAY['mansheya', 'tempat tinggal', 'kost', 'sewa']::text[]),
  ('kontrakan', ARRAY['kost', 'sewa', 'apartemen', 'flat']::text[]),
  ('flat', ARRAY['apartemen', 'kost', 'sewa', 'kontrakan']::text[]),
  ('presiden', ARRAY['ketua', 'pimpinan', 'pemimpin', 'koordinator']::text[]),
  ('ketua', ARRAY['presiden', 'pimpinan', 'pemimpin']::text[]),
  ('pimpinan', ARRAY['presiden', 'ketua', 'pemimpin']::text[]),
  ('pemimpin', ARRAY['presiden', 'ketua', 'pimpinan']::text[]),
  ('sekretaris', ARRAY['sekjen', 'sekretariat']::text[]),
  ('bendahara', ARRAY['keuangan']::text[]),
  ('koordinator', ARRAY['ketua', 'kepala']::text[])
ON CONFLICT (term) DO NOTHING;

-- Verifikasi: harus mengembalikan 74 baris kalau seed berhasil.
SELECT count(*) AS total_istilah,
       (SELECT count(*) FROM (SELECT unnest(aliases) FROM public.masisir_aliases) x) AS total_alias
FROM public.masisir_aliases;
