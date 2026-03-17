import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Heart, BookOpen, Users, Lightbulb, Shield, Globe,
  ArrowRight, Zap, Star, MessageSquare, FileText, TrendingUp,
} from "lucide-react";
import ainaLogo from "@/assets/aina-logo.png";

/* ─── Intersection Observer hook ─────────────────────────── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ─── Animated counter ───────────────────────────────────── */
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const { ref, inView } = useInView(0.3);
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / 60;
    const id = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(id); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(id);
  }, [inView, target]);
  return (
    <div ref={ref} className="tabular-nums">
      {count.toLocaleString("id-ID")}{suffix}
    </div>
  );
}

/* ─── Data ───────────────────────────────────────────────── */
const STATS = [
  { icon: Users, value: 5000, suffix: "+", label: "Masisir Terbantu", color: "text-primary" },
  { icon: FileText, value: 120, suffix: "+", label: "Artikel Knowledge Base", color: "text-purple-glow" },
  { icon: MessageSquare, value: 25000, suffix: "+", label: "Pesan AI Terkirim", color: "text-primary" },
];

const TIMELINE = [
  {
    year: "2023",
    title: "Keresahan Lahir",
    desc: "Ribuan Masisir kebingungan mencari informasi yang tersebar di ratusan grup WA. Tidak ada satu sumber terpercaya.",
  },
  {
    year: "2024",
    title: "AINA Dibangun",
    desc: "Tim kecil mahasiswa Masisir mulai membangun platform dengan menggabungkan AI dan knowledge base lokal.",
  },
  {
    year: "2025",
    title: "Komunitas Berkembang",
    desc: "Kontributor dari berbagai jurusan bergabung, memperkaya basis pengetahuan AINA dengan pengalaman nyata.",
  },
  {
    year: "2026",
    title: "Saat Ini",
    desc: "AINA terus tumbuh bersama komunitas Masisir, menghadirkan fitur baru dan memperluas jangkauan.",
  },
];

const VALUES = [
  { icon: Heart, title: "Kepedulian", desc: "Dibangun dari rasa peduli nyata terhadap mahasiswa yang merantau jauh ke Mesir." },
  { icon: BookOpen, title: "Pengetahuan Lokal", desc: "Diisi kontributor yang benar-benar hidup dan memahami kehidupan Masisir dari dalam." },
  { icon: Users, title: "Komunitas", desc: "Tumbuh bersama komunitasnya — setiap kontribusi membuat platform ini lebih baik untuk semua." },
  { icon: Lightbulb, title: "Inovasi", desc: "Teknologi AI yang benar-benar berguna, bukan sekadar generik — dirancang untuk kebutuhan Masisir." },
  { icon: Shield, title: "Kepercayaan", desc: "Privasi dan keamanan data pengguna adalah prioritas. Kami tidak pernah menjual data pengguna." },
  { icon: Globe, title: "Inklusif", desc: "Terbuka untuk semua Masisir — dari mahasiswa baru hingga senior yang ingin berbagi ilmu." },
];

const TEAM: { name: string; role: string; initial: string }[] = [
  { name: "—", role: "Founder", initial: "F" },
  { name: "—", role: "Co-Founder", initial: "C" },
  { name: "—", role: "Lead Developer", initial: "D" },
  { name: "—", role: "Content & Knowledge", initial: "K" },
];

/* ─── Page ───────────────────────────────────────────────── */
const AboutPage = () => {
  const heroRef = useInView(0.1);
  const storyRef = useInView(0.1);
  const statsRef = useInView(0.1);
  const missionRef = useInView(0.1);
  const valuesRef = useInView(0.1);
  const teamRef = useInView(0.1);
  const ctaRef = useInView(0.1);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* ══════════ HERO ══════════════════════════════════════ */}
      <section className="relative min-h-[92vh] overflow-hidden flex items-center justify-center px-4 pt-16">

        {/* Background layers */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
          {/* Large glow orbs */}
          <div className="absolute left-1/4 top-1/4 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[160px]" />
          <div className="absolute right-1/4 bottom-1/3 h-[400px] w-[400px] rounded-full bg-purple-glow/8 blur-[120px]" />
          {/* Grid dots */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: "radial-gradient(circle, hsl(270 60% 55% / 0.3) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        {/* Content */}
        <div
          ref={heroRef.ref}
          className={`relative z-10 mx-auto max-w-4xl text-center transition-all duration-1000 ${heroRef.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}
        >
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/8 px-5 py-2 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="font-modernist text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Tentang AINA</span>
          </div>

          {/* Main heading */}
          <h1 className="font-display text-5xl font-bold leading-[1.08] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Asisten AI yang{" "}
            <br className="hidden sm:block" />
            <span className="text-gradient-purple">Benar-benar Mengerti</span>
            <br className="hidden sm:block" />
            <span className="text-foreground"> Masisir</span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            AINA lahir dari keresahan nyata mahasiswa Indonesia di Mesir —
            gabungan kecerdasan AI modern dan pengetahuan lokal dari komunitas yang hidup di sana.
          </p>

          {/* CTA buttons */}
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link to="/login">
              <button className="group flex items-center gap-2 rounded-xl bg-gradient-purple px-7 py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_hsl(270_80%_65%/0.35)] transition-all hover:scale-105 hover:shadow-[0_0_36px_hsl(270_80%_65%/0.55)]">
                Mulai Gratis
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </Link>
            <Link to="/contributor">
              <button className="rounded-xl border border-border/60 bg-card/40 px-7 py-3 text-sm font-semibold text-foreground backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-primary/5">
                Jadi Kontributor
              </button>
            </Link>
          </div>

          {/* Logo glow */}
          <div className="mt-16 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 scale-150 rounded-full bg-primary/15 blur-3xl" />
              <img
                src={ainaLogo}
                alt="AINA"
                className="relative h-20 w-20 object-contain drop-shadow-[0_0_40px_hsl(270_80%_65%/0.7)] animate-pulse"
                style={{ animationDuration: "3s" }}
              />
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-40">
          <div className="h-12 w-px bg-gradient-to-b from-transparent to-primary/60" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-primary/60" />
        </div>
      </section>

      {/* ══════════ STATS ══════════════════════════════════════ */}
      <section className="relative px-4 py-20">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/3 to-background" />
        </div>
        <div
          ref={statsRef.ref}
          className={`relative z-10 mx-auto max-w-4xl transition-all duration-700 ${statsRef.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="grid gap-6 sm:grid-cols-3">
            {STATS.map(({ icon: Icon, value, suffix, label, color }, i) => (
              <div
                key={label}
                className="group relative overflow-hidden rounded-2xl border border-border/40 bg-card/30 p-8 text-center backdrop-blur-xl transition-all duration-300 hover:border-primary/30 hover:bg-primary/5"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className={`mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ${color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className={`font-display text-4xl font-bold ${color}`}>
                  <Counter target={value} suffix={suffix} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ STORY TIMELINE ══════════════════════════════ */}
      <section className="relative overflow-hidden px-4 py-20">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-primary/6 blur-[140px]" />
        </div>

        <div
          ref={storyRef.ref}
          className={`relative z-10 mx-auto max-w-5xl transition-all duration-700 ${storyRef.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="mb-14 text-center">
            <p className="mb-3 font-modernist text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Perjalanan</p>
            <h2 className="font-display text-4xl font-bold text-foreground sm:text-5xl">
              Dari <span className="text-gradient-purple">Keresahan</span> ke Solusi
            </h2>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Vertical line (desktop) */}
            <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-primary/30 to-transparent md:block" />

            <div className="space-y-10 md:space-y-0">
              {TIMELINE.map(({ year, title, desc }, i) => {
                const isLeft = i % 2 === 0;
                return (
                  <div
                    key={year}
                    className={`relative flex flex-col gap-4 md:flex-row md:items-center md:gap-0 ${isLeft ? "md:flex-row" : "md:flex-row-reverse"}`}
                    style={{ marginBottom: "3rem" }}
                  >
                    {/* Content card */}
                    <div className={`flex-1 ${isLeft ? "md:pr-12 md:text-right" : "md:pl-12 md:text-left"}`}>
                      <div className="group rounded-2xl border border-border/40 bg-card/30 p-6 backdrop-blur-xl transition-all hover:border-primary/30 hover:bg-primary/5">
                        <span className="font-modernist text-xs font-bold uppercase tracking-widest text-primary">{year}</span>
                        <h3 className="mt-1 font-display text-lg font-bold text-foreground">{title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
                      </div>
                    </div>

                    {/* Dot on the line */}
                    <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 h-5 w-5 items-center justify-center rounded-full border-2 border-primary bg-background shadow-[0_0_12px_hsl(270_80%_65%/0.5)]">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>

                    {/* Empty side */}
                    <div className="hidden flex-1 md:block" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ VISION & MISSION ════════════════════════════ */}
      <section className="relative px-4 py-20">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute right-0 top-1/2 h-[600px] w-[600px] -translate-y-1/2 rounded-full bg-primary/6 blur-[150px]" />
        </div>

        <div
          ref={missionRef.ref}
          className={`relative z-10 mx-auto max-w-5xl transition-all duration-700 ${missionRef.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          {/* Heading */}
          <div className="mb-14 text-center">
            <p className="mb-3 font-modernist text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Arah Kami</p>
            <h2 className="font-display text-4xl font-bold text-foreground sm:text-5xl">
              Visi & <span className="text-gradient-purple">Misi</span>
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Vision card — glowing */}
            <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent p-8 md:p-10">
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/15 blur-2xl" />
              <div className="relative">
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-purple">
                  <Lightbulb className="h-6 w-6 text-primary-foreground" />
                </div>
                <div className="mb-2 flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary" />
                  <span className="font-modernist text-xs font-bold uppercase tracking-widest text-primary">Visi</span>
                </div>
                <p className="font-display text-lg font-bold leading-snug text-foreground">
                  Platform AI nomor satu bagi seluruh mahasiswa Indonesia di Mesir
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Tempat di mana setiap pertanyaan seputar kehidupan Masisir memiliki jawaban yang akurat dan terpercaya.
                </p>
              </div>
            </div>

            {/* Mission card */}
            <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/30 p-8 backdrop-blur-xl md:p-10">
              <div className="absolute -left-8 -bottom-8 h-32 w-32 rounded-full bg-purple-glow/8 blur-2xl" />
              <div className="relative">
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/60">
                  <Heart className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <span className="font-modernist text-xs font-bold uppercase tracking-widest text-muted-foreground">Misi</span>
                </div>
                <p className="font-display text-lg font-bold leading-snug text-foreground">
                  Memudahkan kehidupan Masisir melalui teknologi yang relevan
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  AI yang cerdas, pengetahuan komunitas terverifikasi, dan alat produktivitas untuk kebutuhan sehari-hari di Kairo.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ VALUES ══════════════════════════════════════ */}
      <section className="relative overflow-hidden px-4 py-20">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/3 to-background" />
          <div className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[200px]" />
        </div>

        <div
          ref={valuesRef.ref}
          className={`relative z-10 mx-auto max-w-5xl transition-all duration-700 ${valuesRef.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="mb-14 text-center">
            <p className="mb-3 font-modernist text-[11px] font-bold uppercase tracking-[0.2em] text-primary">DNA Kami</p>
            <h2 className="font-display text-4xl font-bold text-foreground sm:text-5xl">
              Nilai-nilai yang <span className="text-gradient-purple">Kami Pegang</span>
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {VALUES.map(({ icon: Icon, title, desc }, i) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-2xl border border-border/40 bg-card/30 p-6 backdrop-blur-xl transition-all duration-300 hover:border-primary/35 hover:bg-primary/5 hover:-translate-y-1 hover:shadow-[0_8px_32px_hsl(270_80%_65%/0.12)]"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {/* Corner accent */}
                <div className="absolute right-0 top-0 h-16 w-16 overflow-hidden opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="absolute right-0 top-0 h-16 w-16 -translate-x-1/2 translate-y-0 rotate-45 bg-gradient-to-br from-primary/20 to-transparent" />
                </div>

                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 transition-all group-hover:bg-primary/20 group-hover:scale-110">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-2 font-display text-base font-bold text-foreground">{title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ TEAM ════════════════════════════════════════ */}
      <section className="relative px-4 py-20">
        <div
          ref={teamRef.ref}
          className={`relative z-10 mx-auto max-w-4xl transition-all duration-700 ${teamRef.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="mb-14 text-center">
            <p className="mb-3 font-modernist text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Tim Kami</p>
            <h2 className="font-display text-4xl font-bold text-foreground sm:text-5xl">
              Orang-orang di Balik{" "}
              <span className="text-gradient-purple">AINA</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
              Mahasiswa dan alumni Masisir yang peduli dan berkomitmen membangun platform ini.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-4">
            {TEAM.map(({ name, role, initial }, i) => (
              <div
                key={i}
                className="group flex flex-col items-center rounded-2xl border border-border/40 bg-card/30 p-6 text-center backdrop-blur-xl transition-all hover:border-primary/30 hover:bg-primary/5 hover:-translate-y-1"
              >
                {/* Avatar ring */}
                <div className="relative mb-5">
                  <div className="absolute inset-0 scale-110 rounded-2xl bg-gradient-purple opacity-0 blur-md transition-opacity group-hover:opacity-40" />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/20 via-primary/10 to-purple-glow/10">
                    <span className="font-display text-2xl font-bold text-primary/50">{initial}</span>
                  </div>
                </div>
                <p className="font-display text-sm font-bold text-foreground">
                  {name === "—" ? (
                    <span className="italic text-muted-foreground/40 text-xs">Segera hadir</span>
                  ) : name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{role}</p>
                <div className="mt-3 h-px w-8 rounded-full bg-primary/20 transition-all group-hover:w-12 group-hover:bg-primary/50" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CTA ══════════════════════════════════════════ */}
      <section className="relative overflow-hidden px-4 pb-28 pt-8">
        <div
          ref={ctaRef.ref}
          className={`relative z-10 mx-auto max-w-3xl transition-all duration-700 ${ctaRef.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card/30 to-purple-glow/8 p-10 text-center backdrop-blur-xl md:p-14">
            {/* Background glow orbs inside card */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
              <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-purple-glow/15 blur-3xl" />
            </div>

            <div className="relative">
              {/* Trending icon badge */}
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-purple shadow-[0_0_32px_hsl(270_80%_65%/0.5)]">
                <TrendingUp className="h-8 w-8 text-primary-foreground" />
              </div>

              <h2 className="font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">
                Bergabunglah Bersama
                <br />
                <span className="text-gradient-purple">Ribuan Masisir</span>
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
                Daftar gratis dan mulai tanyakan apa saja tentang kehidupan di Mesir kepada AINA. Tidak ada pertanyaan yang terlalu kecil.
              </p>

              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link to="/login">
                  <button className="group flex items-center gap-2 rounded-xl bg-gradient-purple px-8 py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_hsl(270_80%_65%/0.4)] transition-all hover:scale-105 hover:shadow-[0_0_36px_hsl(270_80%_65%/0.65)]">
                    Mulai Gratis Sekarang
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </Link>
                <Link to="/contributor">
                  <button className="rounded-xl border border-border/60 bg-background/40 px-8 py-3 text-sm font-semibold text-foreground backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-primary/8">
                    Jadi Kontributor
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default AboutPage;
