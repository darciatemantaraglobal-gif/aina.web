import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useState, useEffect } from "react";
import { FileText } from "lucide-react";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-10">
    <h2 className="mb-4 font-display text-xl font-bold text-foreground">{title}</h2>
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </div>
);

const TermsPage = () => {
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
                <FileText className="h-7 w-7 text-primary" />
              </div>
              <h1 className="font-display text-4xl font-bold text-foreground">
                Syarat &{" "}
                <span className="text-gradient-purple">Ketentuan</span>
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Terakhir diperbarui: Maret 2025
              </p>
            </div>

            <div className="rounded-2xl border border-border/40 bg-card/30 p-8 backdrop-blur-xl md:p-12">
              <p className="mb-10 text-sm leading-relaxed text-muted-foreground">
                Selamat datang di <strong className="text-foreground">AINA</strong> — Asisten Pintar Khusus Mahasiswa Indonesia di Mesir. Dengan menggunakan layanan kami, kamu menyetujui syarat dan ketentuan berikut. Bacalah dengan seksama sebelum menggunakan platform ini.
              </p>

              <Section title="1. Penerimaan Syarat">
                <p>
                  Dengan mengakses atau menggunakan platform AINA (website, aplikasi, dan layanan terkait), kamu menyatakan telah membaca, memahami, dan menyetujui syarat dan ketentuan ini. Jika kamu tidak menyetujui, harap tidak menggunakan layanan kami.
                </p>
                <p>
                  AINA berhak memperbarui syarat ini sewaktu-waktu. Perubahan akan diberitahukan melalui platform. Penggunaan berlanjut setelah perubahan dianggap sebagai persetujuan terhadap syarat baru.
                </p>
              </Section>

              <Section title="2. Deskripsi Layanan">
                <p>
                  AINA adalah platform asisten AI yang dirancang khusus untuk membantu mahasiswa Indonesia yang belajar di Mesir (Masisir). Layanan meliputi:
                </p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li>Chat AI berbasis kecerdasan buatan untuk menjawab pertanyaan seputar kehidupan di Mesir</li>
                  <li>Fitur Productivity untuk pengelolaan tugas, kebiasaan, dan catatan harian</li>
                  <li>Knowledge Base berisi artikel dari kontributor terpercaya</li>
                  <li>Informasi berita dan kurs mata uang</li>
                </ul>
              </Section>

              <Section title="3. Akun Pengguna">
                <p>
                  Untuk menggunakan fitur penuh AINA, kamu perlu membuat akun menggunakan email atau akun Google. Kamu bertanggung jawab untuk:
                </p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li>Menjaga kerahasiaan kredensial akun kamu</li>
                  <li>Semua aktivitas yang terjadi melalui akunmu</li>
                  <li>Memberikan informasi yang akurat dan terkini</li>
                </ul>
                <p>
                  AINA berhak menangguhkan atau menghapus akun yang melanggar ketentuan ini tanpa pemberitahuan sebelumnya.
                </p>
              </Section>

              <Section title="4. Batas Penggunaan (Fair Use)">
                <p>
                  Pengguna akun gratis memiliki batas 3 pesan chat per hari kepada AINA. Batas ini direset setiap tengah malam. Pengguna dengan status Contributor atau Senior Contributor menikmati chat tanpa batas.
                </p>
                <p>
                  Penggunaan yang dianggap melanggar kebijakan fair use dapat mengakibatkan pembatasan atau penghentian akun.
                </p>
              </Section>

              <Section title="5. Konten Pengguna & Kontributor">
                <p>
                  Pengguna yang menjadi Kontributor diizinkan untuk mengirimkan artikel ke Knowledge Base AINA. Dengan mengirimkan konten, kamu menyatakan bahwa:
                </p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li>Konten adalah karya orisinal atau kamu memiliki hak untuk mempublikasikannya</li>
                  <li>Konten tidak mengandung informasi yang salah, menyesatkan, atau berbahaya</li>
                  <li>Konten tidak melanggar hak cipta, privasi, atau hukum yang berlaku</li>
                </ul>
                <p>
                  Tim AINA berhak meminjau, mengedit, atau menolak konten yang tidak memenuhi standar kualitas atau melanggar ketentuan.
                </p>
              </Section>

              <Section title="6. Larangan Penggunaan">
                <p>Kamu dilarang menggunakan AINA untuk:</p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li>Aktivitas ilegal atau yang melanggar hukum Indonesia maupun Mesir</li>
                  <li>Menyebarkan konten yang mengandung SARA, pornografi, atau ujaran kebencian</li>
                  <li>Mencoba meretas, memanipulasi, atau mengganggu sistem AINA</li>
                  <li>Menggunakan bot atau skrip otomatis tanpa izin tertulis</li>
                  <li>Mengumpulkan data pengguna lain tanpa persetujuan</li>
                </ul>
              </Section>

              <Section title="7. Privasi Data" id="privacy">
                <p>
                  AINA berkomitmen menjaga privasi penggunanya. Data yang kami kumpulkan meliputi:
                </p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li><strong className="text-foreground">Data Akun:</strong> Nama, email, dan foto profil dari Google (jika login dengan Google)</li>
                  <li><strong className="text-foreground">Data Penggunaan:</strong> Riwayat chat dan artikel yang ditulis</li>
                  <li><strong className="text-foreground">Data Teknis:</strong> Informasi perangkat dan log akses untuk keamanan sistem</li>
                </ul>
                <p>
                  Kami tidak menjual data pribadi kamu kepada pihak ketiga. Data digunakan semata-mata untuk meningkatkan layanan AINA.
                </p>
                <p>
                  Kamu memiliki hak untuk meminta penghapusan akun dan data pribadi dengan menghubungi tim AINA.
                </p>
              </Section>

              <Section title="8. Penafian (Disclaimer)">
                <p>
                  AINA adalah asisten AI dan tidak bertanggung jawab atas keakuratan informasi yang diberikan. Informasi yang tersedia di platform bersifat umum dan edukatif.
                </p>
                <p>
                  Untuk keputusan penting (akademik, hukum, kesehatan, keuangan), selalu verifikasi dengan sumber resmi atau profesional yang berwenang.
                </p>
              </Section>

              <Section title="9. Perubahan Layanan">
                <p>
                  AINA berhak mengubah, menambah, atau menghentikan fitur layanan kapan saja. Kami akan berupaya memberikan pemberitahuan terlebih dahulu untuk perubahan besar yang memengaruhi penggunaan.
                </p>
              </Section>

              <Section title="10. Kontak">
                <p>
                  Jika ada pertanyaan terkait syarat dan ketentuan ini, silakan hubungi kami melalui halaman Partner atau WhatsApp yang tersedia di platform.
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

export default TermsPage;
