import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-10">
    <h2 className="mb-4 font-display text-xl font-bold text-foreground">{title}</h2>
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </div>
);

const PrivacyPage = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        <section className="relative px-4 py-20">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/10 to-background" />
          </div>

          <div className={`relative z-10 mx-auto max-w-3xl transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            {/* Header */}
            <div className="mb-12 text-center">
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 backdrop-blur-sm">
                <ShieldCheck className="h-7 w-7 text-primary" />
              </div>
              <h1 className="font-display text-4xl font-bold text-foreground">
                Kebijakan{" "}
                <span className="text-gradient-purple">Privasi</span>
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Terakhir diperbarui: Maret 2025
              </p>
            </div>

            <div className="rounded-2xl border border-border/40 bg-card/30 p-8 backdrop-blur-xl md:p-12">
              <p className="mb-10 text-sm leading-relaxed text-muted-foreground">
                Kebijakan Privasi ini menjelaskan bagaimana <strong className="text-foreground">AINA</strong> mengumpulkan, menggunakan, dan melindungi informasi pribadimu saat menggunakan layanan kami. Dengan menggunakan AINA, kamu menyetujui praktik yang dijelaskan dalam kebijakan ini.
              </p>

              <Section title="1. Informasi yang Kami Kumpulkan">
                <p>Kami mengumpulkan informasi berikut saat kamu menggunakan AINA:</p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li><strong className="text-foreground">Data Akun:</strong> Nama lengkap, alamat email, dan foto profil — diperoleh saat kamu mendaftar langsung atau melalui Google.</li>
                  <li><strong className="text-foreground">Data Chat:</strong> Pertanyaan dan percakapan yang kamu lakukan dengan AINA untuk memberikan respons yang relevan dan menyimpan riwayat chat.</li>
                  <li><strong className="text-foreground">Konten Kontributor:</strong> Artikel yang kamu kirimkan ke Knowledge Base jika kamu adalah Kontributor.</li>
                  <li><strong className="text-foreground">Data Produktivitas:</strong> Tugas, kebiasaan, dan catatan yang kamu buat di fitur Productivity — hanya dapat diakses oleh kamu sendiri.</li>
                  <li><strong className="text-foreground">Data Teknis:</strong> Log akses dan informasi perangkat yang dikumpulkan secara otomatis untuk menjaga keamanan dan stabilitas sistem.</li>
                </ul>
              </Section>

              <Section title="2. Bagaimana Kami Menggunakan Informasimu">
                <p>Informasi yang dikumpulkan digunakan untuk:</p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li>Menyediakan dan meningkatkan layanan AINA</li>
                  <li>Menyimpan dan menampilkan riwayat percakapan kamu</li>
                  <li>Mengelola akun dan autentikasi pengguna</li>
                  <li>Menerapkan batas penggunaan yang adil (fair use)</li>
                  <li>Memproses permintaan menjadi Kontributor</li>
                  <li>Mendeteksi dan mencegah penyalahgunaan platform</li>
                </ul>
              </Section>

              <Section title="3. Berbagi Data dengan Pihak Ketiga">
                <p>
                  Kami <strong className="text-foreground">tidak menjual</strong> data pribadimu kepada pihak ketiga manapun.
                </p>
                <p>Data dapat dibagikan hanya dalam kondisi berikut:</p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li><strong className="text-foreground">Penyedia layanan teknis:</strong> Layanan database & autentikasi kami, serta layanan AI pihak ketiga untuk pemrosesan, yang semuanya terikat perjanjian kerahasiaan data.</li>
                  <li><strong className="text-foreground">Kewajiban hukum:</strong> Jika diwajibkan oleh hukum yang berlaku atau perintah pengadilan yang sah.</li>
                </ul>
                <p>
                  Pertanyaanmu ke AINA dikirimkan ke layanan AI pihak ketiga untuk diproses. Hindari mengirimkan informasi sensitif seperti nomor KTP, password, atau data keuangan dalam chat.
                </p>
              </Section>

              <Section title="4. Penyimpanan dan Keamanan Data">
                <p>
                  Data disimpan secara aman menggunakan layanan database kami dengan enkripsi standar industri. Kami menerapkan sistem keamanan berlapis sehingga data setiap pengguna hanya dapat diakses oleh pengguna itu sendiri.
                </p>
                <p>
                  Meskipun kami berupaya keras menjaga keamanan data, tidak ada sistem yang 100% kebal. Kami menyarankan kamu untuk tidak berbagi informasi sensitif melalui platform ini.
                </p>
              </Section>

              <Section title="5. Cookie dan Penyimpanan Lokal">
                <p>
                  AINA menggunakan penyimpanan lokal browser (localStorage) untuk menyimpan sesi login kamu agar kamu tidak perlu masuk ulang setiap saat. Tidak ada cookie pelacak pihak ketiga yang digunakan.
                </p>
              </Section>

              <Section title="6. Hak-hak Privasimu">
                <p>Kamu memiliki hak untuk:</p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li><strong className="text-foreground">Mengakses</strong> data yang kami simpan tentangmu melalui halaman Profile di dashboard.</li>
                  <li><strong className="text-foreground">Menghapus</strong> riwayat chat kapan saja dari dashboard.</li>
                  <li><strong className="text-foreground">Meminta penghapusan akun</strong> beserta seluruh datanya dengan menghubungi tim AINA.</li>
                  <li><strong className="text-foreground">Memperbarui</strong> informasi profilmu kapan saja melalui halaman Profile.</li>
                </ul>
              </Section>

              <Section title="7. Privasi Anak-anak">
                <p>
                  Layanan AINA ditujukan untuk mahasiswa (usia 17 tahun ke atas). Kami tidak secara sengaja mengumpulkan data dari anak di bawah usia 13 tahun. Jika kamu mengetahui ada pengguna di bawah umur, harap hubungi kami.
                </p>
              </Section>

              <Section title="8. Perubahan Kebijakan Privasi">
                <p>
                  Kami dapat memperbarui kebijakan ini sewaktu-waktu. Perubahan signifikan akan diberitahukan melalui platform. Tanggal pembaruan terakhir selalu tercantum di bagian atas halaman ini. Penggunaan berkelanjutan setelah perubahan dianggap sebagai persetujuan.
                </p>
              </Section>

              <Section title="9. Hubungi Kami">
                <p>
                  Jika kamu memiliki pertanyaan, kekhawatiran, atau permintaan terkait privasi datamu, silakan hubungi kami melalui halaman <strong className="text-foreground">Partner</strong> atau kontak yang tersedia di platform AINA.
                </p>
              </Section>
            </div>
          </div>
        </section>
        <Footer />
      </div>
    </div>
  );
};

export default PrivacyPage;
