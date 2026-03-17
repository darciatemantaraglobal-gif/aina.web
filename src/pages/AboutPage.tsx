import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Heart, BookOpen, Users, Lightbulb, Shield, Globe } from "lucide-react";
import ainaLogo from "@/assets/aina-logo.png";

const TEAM: { name: string; role: string; photo?: string }[] = [
  { name: "—", role: "Founder" },
  { name: "—", role: "Co-Founder" },
  { name: "—", role: "Lead Developer" },
  { name: "—", role: "Content & Knowledge" },
];

const VALUES = [
  {
    icon: Heart,
    title: "Kepedulian",
    desc: "Kami membangun AINA dari rasa peduli nyata terhadap mahasiswa Indonesia yang merantau jauh ke Mesir.",
  },
  {
    icon: BookOpen,
    title: "Pengetahuan Lokal",
    desc: "AINA diisi oleh kontributor yang benar-benar hidup dan memahami kehidupan Masisir dari dalam.",
  },
  {
    icon: Users,
    title: "Komunitas",
    desc: "AINA tumbuh bersama komunitasnya. Setiap kontribusi membuat platform ini lebih baik untuk semua.",
  },
  {
    icon: Lightbulb,
    title: "Inovasi",
    desc: "Kami terus berinovasi agar teknologi AI bisa benar-benar berguna untuk kehidupan nyata Masisir.",
  },
  {
    icon: Shield,
    title: "Kepercayaan",
    desc: "Privasi dan keamanan data pengguna adalah prioritas. Kami tidak pernah menjual data pengguna.",
  },
  {
    icon: Globe,
    title: "Inklusif",
    desc: "AINA terbuka untuk semua Masisir — dari mahasiswa baru hingga senior yang ingin membantu.",
  },
];

const AboutPage = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">

        {/* ── Hero ── */}
        <section className="relative overflow-hidden px-4 py-24">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/15 to-background" />
            <div className="absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/8 blur-[140px]" />
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                backgroundImage: "radial-gradient(circle, hsl(270 60% 55% / 0.15) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
          </div>

          <div className={`relative z-10 mx-auto max-w-3xl text-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <img
              src={ainaLogo}
              alt="AINA"
              className="mx-auto mb-6 h-16 w-16 object-contain drop-shadow-[0_0_30px_hsl(270_80%_65%/0.5)]"
            />
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Tentang AINA</span>
            </div>
            <h1 className="font-display text-5xl font-bold leading-tight text-foreground sm:text-6xl">
              Dibangun dari{" "}
              <span className="text-gradient-purple">Pengalaman Nyata</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
              AINA lahir dari keresahan mahasiswa Indonesia di Mesir yang sering bingung mencari informasi yang tepat dan terpercaya tentang kehidupan di sana.
            </p>
          </div>
        </section>

        {/* ── Cerita ── */}
        <section className="relative px-4 pb-20">
          <div className="mx-auto max-w-3xl">
            <div className={`rounded-2xl border border-border/40 bg-card/30 p-8 backdrop-blur-xl transition-all duration-700 delay-200 md:p-12 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
              <h2 className="mb-6 font-display text-2xl font-bold text-foreground">Mengapa AINA?</h2>
              <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Setiap tahun, ribuan mahasiswa Indonesia berangkat ke Mesir untuk menimba ilmu — kebanyakan di Universitas Al-Azhar, salah satu universitas tertua di dunia. Perjalanan ini penuh tantangan: administrasi yang kompleks, bahasa baru, budaya asing, dan kebutuhan informasi yang sangat spesifik tentang kehidupan di Kairo.
                </p>
                <p>
                  Informasi yang ada tersebar di berbagai grup WhatsApp, forum, dan mulut ke mulut. Tidak ada satu tempat yang menjadi sumber terpercaya. Mahasiswa baru sering berputar-putar mencari jawaban yang seharusnya mudah ditemukan.
                </p>
                <p>
                  <strong className="text-foreground">AINA hadir sebagai solusi.</strong> Dengan menggabungkan kekuatan AI modern dan pengetahuan lokal dari kontributor yang benar-benar tinggal di Mesir, AINA menjadi asisten yang benar-benar mengerti kebutuhan Masisir — bukan asisten AI generik.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Misi & Visi ── */}
        <section className="relative px-4 pb-20">
          <div className={`mx-auto max-w-4xl transition-all duration-700 delay-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                  <Lightbulb className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-3 font-display text-xl font-bold text-foreground">Visi</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Menjadi platform asisten AI nomor satu bagi seluruh mahasiswa Indonesia di Mesir — tempat di mana setiap pertanyaan seputar kehidupan Masisir memiliki jawaban yang akurat dan terpercaya.
                </p>
              </div>
              <div className="rounded-2xl border border-border/40 bg-card/30 p-8">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/60">
                  <Heart className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="mb-3 font-display text-xl font-bold text-foreground">Misi</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Memudahkan kehidupan mahasiswa Indonesia di Mesir melalui teknologi AI yang cerdas, pengetahuan komunitas yang terverifikasi, dan alat produktivitas yang relevan dengan kebutuhan sehari-hari mereka.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Values ── */}
        <section className="relative px-4 pb-20">
          <div className={`mx-auto max-w-5xl transition-all duration-700 delay-400 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <h2 className="mb-10 text-center font-display text-3xl font-bold text-foreground">
              Nilai-nilai <span className="text-gradient-purple">Kami</span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {VALUES.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="group rounded-2xl border border-border/40 bg-card/30 p-6 backdrop-blur-xl transition-all hover:border-primary/30 hover:bg-primary/5"
                >
                  <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                    <Icon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <h3 className="mb-2 font-display text-sm font-bold text-foreground">{title}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Tim ── */}
        <section className="relative px-4 pb-24">
          <div className={`mx-auto max-w-4xl transition-all duration-700 delay-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <div className="mb-10 text-center">
              <h2 className="font-display text-3xl font-bold text-foreground">
                Orang-orang di Balik{" "}
                <span className="text-gradient-purple">AINA</span>
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Mahasiswa dan alumni Masisir yang peduli dan berkomitmen membangun platform ini.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
              {TEAM.map(({ name, role, photo }, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center rounded-2xl border border-border/40 bg-card/30 p-6 text-center backdrop-blur-xl"
                >
                  {/* Avatar */}
                  <div className="relative mb-4 h-20 w-20 overflow-hidden rounded-2xl">
                    {photo ? (
                      <img src={photo} alt={name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-purple-glow/10 border border-primary/15">
                        <svg
                          className="h-10 w-10 text-primary/30"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className="font-display text-sm font-bold text-foreground">
                    {name === "—" ? <span className="text-muted-foreground/40 italic text-xs">Segera hadir</span> : name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{role}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="relative px-4 pb-24">
          <div className={`mx-auto max-w-2xl text-center transition-all duration-700 delay-600 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/30 to-purple-glow/5 p-10 backdrop-blur-xl">
              <h2 className="font-display text-2xl font-bold text-foreground">
                Bergabunglah bersama Masisir
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
                Jadilah bagian dari komunitas yang saling membantu. Daftar gratis dan mulai chat dengan AINA sekarang.
              </p>
              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link to="/login">
                  <button className="rounded-xl bg-gradient-purple px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_hsl(270_80%_65%/0.3)] transition-all hover:scale-105 hover:shadow-[0_0_28px_hsl(270_80%_65%/0.5)]">
                    Mulai Gratis
                  </button>
                </Link>
                <Link to="/contributor">
                  <button className="rounded-xl border border-border/60 bg-secondary/40 px-6 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-secondary/70">
                    Jadi Kontributor
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </div>
  );
};

export default AboutPage;
