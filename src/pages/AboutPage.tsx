import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Lightbulb, ArrowRight, Zap, Star, TrendingUp, Smartphone, Share2,
} from "lucide-react";
import ainaLogo from "@/assets/aina-logo.png";
import { supabase } from "@/integrations/supabase/client";

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

/* ─── Data ───────────────────────────────────────────────── */
const TIMELINE = [
  {
    period: "Mei 2025",
    title: "AIGYPT Batch 0 — Awal Mula",
    desc: "AIGYPT didirikan oleh Daru dan kawan-kawan untuk mengajak Masisir mulai belajar AI. Batch 0 diadakan khusus untuk membantu persiapan Ujian Al-Azhar.",
  },
  {
    period: "Juni 2025",
    title: "AIGYPT Batch 1 × HPIM Mesir",
    desc: "AIGYPT kembali hadir berkolaborasi dengan HPIM Mesir. Berlangsung 5 hari secara indoor dan outdoor — pelajaran meluas ke praktik langsung dan produktivitas.",
  },
  {
    period: "Desember 2025",
    title: "AINA Dirancang & Power Team Terbentuk",
    desc: "AINA mulai dirancang secara serius. Power Team dibentuk dan diketuai oleh Fairuz dan Maliki untuk memimpin perjalanan AINA di Mesir.",
  },
  {
    period: "April 2026",
    title: "Launching! 🚀",
    desc: "AINA resmi diluncurkan untuk seluruh Masisir — hadir sebagai AI pendamping yang benar-benar mengerti kehidupan mahasiswa Indonesia di Mesir.",
  },
];

type Member = { name: string; role: string; initial: string; photo?: string };
type TeamGroup = { label: string; members: Member[] };

const TEAM_GROUPS: TeamGroup[] = [
  {
    label: "Founder",
    members: [
      { name: "Daru Fahmaa Muliawan, Lc.", role: "Founder AIGYPT & AINA", initial: "D", photo: "/team/daru.jpg" },
    ],
  },
  {
    label: "Head of AINA Mesir",
    members: [
      { name: "Fairuz Azri Afif Arsyadi", role: "Head of AINA Mesir", initial: "F", photo: "/team/fairuz.jpg" },
      { name: "Teuku Muhammad Maliki Ishak", role: "Head of AINA Mesir", initial: "M", photo: "/team/maliki.jpg" },
    ],
  },
  {
    label: "Operations & Admin",
    members: [
      { name: "Mohamad Virli Okto", role: "Operations & Admin Lead", initial: "V", photo: "/team/okto.jpg" },
      { name: "Moch Azriel Putra Novendra", role: "Operations & Admin Lead", initial: "A", photo: "/team/azriel.jpg" },
    ],
  },
  {
    label: "Community & Partnership",
    members: [
      { name: "Adyatma Zaki Rabbani", role: "Community & Growth Lead", initial: "Z", photo: "/team/zaki.jpg" },
      { name: "Muhammad Ariiq Ash Shidiq", role: "External & Partnership Lead", initial: "Ar", photo: "/team/ariqq.jpg" },
      { name: "Rifki Haikal", role: "External & Partnership Lead", initial: "R", photo: "/team/rifki.jpg" },
    ],
  },
  {
    label: "Developer Assistant",
    members: [
      { name: "Ilham Mutasim Billah", role: "Developer Assistant", initial: "I", photo: "/team/ilham.jpg" },
      { name: "Naadir Al Atilla Muklis", role: "Developer Assistant", initial: "N", photo: "/team/naadir.jpg" },
    ],
  },
  {
    label: "Creative & Media",
    members: [
      { name: "Sulthan Nadzir", role: "Creative & Media Lead", initial: "S", photo: "/team/sulthan.jpg" },
      { name: "Navis Athiyatul Hafidz", role: "Creative & Media", initial: "Na", photo: "/team/navis.jpg" },
      { name: "Hafidz Majduddin", role: "Creative & Media", initial: "H", photo: "/team/hafidz.jpg" },
      { name: "Arnaf Hamdan Farros", role: "Creative & Media", initial: "Af", photo: "/arnaf.png" },
    ],
  },
];

/* ─── Page ───────────────────────────────────────────────── */
const AboutPage = () => {
  const navigate = useNavigate();
  const heroRef = useInView(0.1);
  const storyRef = useInView(0.1);
  const missionRef = useInView(0.1);
  const teamRef = useInView(0.1);
  const ctaRef = useInView(0.1);

  const handleGoContributor = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      navigate("/dashboard?tab=contributor");
    } else {
      navigate("/login", { state: { redirectAfter: "/dashboard?tab=contributor" } });
    }
  }, [navigate]);

  return (
    <div className="bg-background">
      <Navbar />

      {/* ══════════ HERO ══════════════════════════════════════ */}
      <section className="relative overflow-hidden flex items-center justify-center px-4 pt-20 pb-12 md:min-h-[92vh] md:pt-16 md:pb-0">

        {/* Background layers */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
          <div className="absolute left-1/4 top-1/4 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[160px]" />
          <div className="absolute right-1/4 bottom-1/3 h-[400px] w-[400px] rounded-full bg-purple-glow/8 blur-[120px]" />
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
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/8 px-4 py-1.5 backdrop-blur-sm md:mb-8 md:px-5 md:py-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="font-modernist text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Tentang AINA</span>
          </div>

          {/* Main heading */}
          <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Asisten AI yang{" "}
            <br className="hidden sm:block" />
            <span className="text-gradient-purple">Benar-benar Mengerti</span>
            <br className="hidden sm:block" />
            <span className="text-foreground"> Masisir</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-lg md:mt-8 md:text-base">
            AINA adalah AI pendamping untuk mahasiswa Indonesia di Mesir. Karena AINA belajar dari pengalaman
            nyata Masisir, jawabannya lebih nyambung, praktis, dan sesuai kondisi di lapangan.
          </p>

          {/* CTA buttons */}
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center md:mt-10">
            <Link to="/login">
              <button className="group flex items-center gap-2 rounded-xl bg-gradient-purple px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_hsl(270_80%_65%/0.35)] transition-all hover:scale-105 hover:shadow-[0_0_36px_hsl(270_80%_65%/0.55)] md:px-7 md:py-3">
                Mulai Gratis
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </Link>
            <button onClick={handleGoContributor} className="rounded-xl border border-border/60 bg-card/40 px-6 py-2.5 text-sm font-semibold text-foreground backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-primary/5 md:px-7 md:py-3">
              Jadi Kontributor
            </button>
          </div>

          {/* Logo glow — hidden on mobile, visible on md+ */}
          <div className="mt-10 hidden justify-center md:mt-16 md:flex">
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

        {/* Scroll indicator — desktop only */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden flex-col items-center gap-1 opacity-40 md:flex">
          <div className="h-12 w-px bg-gradient-to-b from-transparent to-primary/60" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-primary/60" />
        </div>
      </section>

      {/* ══════════ STORY TIMELINE ══════════════════════════════ */}
      <section className="relative overflow-hidden px-4 py-10 md:py-20">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-primary/6 blur-[140px]" />
        </div>

        <div
          ref={storyRef.ref}
          className={`relative z-10 mx-auto max-w-5xl transition-all duration-700 ${storyRef.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="mb-8 text-center md:mb-14">
            <p className="mb-2 font-modernist text-[11px] font-bold uppercase tracking-[0.2em] text-primary md:mb-3">Perjalanan</p>
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-5xl">
              Dari <span className="text-gradient-purple">Keresahan</span> ke Solusi
            </h2>
          </div>

          {/* Timeline — stacked on mobile, alternating on desktop */}
          <div className="relative">
            <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-primary/30 to-transparent md:block" />

            <div className="flex flex-col gap-3 md:gap-0 md:space-y-0">
              {TIMELINE.map(({ period, title, desc }, i) => {
                const isLeft = i % 2 === 0;
                return (
                  <div
                    key={title}
                    className={`relative flex flex-col gap-4 md:flex-row md:items-center md:gap-0 ${isLeft ? "md:flex-row" : "md:flex-row-reverse"}`}
                    style={{ marginBottom: "2.5rem" }}
                  >
                    <div className={`flex-1 ${isLeft ? "md:pr-12 md:text-right" : "md:pl-12 md:text-left"}`}>
                      <div className="group rounded-xl border border-border/40 bg-card/30 p-4 backdrop-blur-xl transition-all hover:border-primary/30 hover:bg-primary/5 md:rounded-2xl md:p-6">
                        <span className="font-modernist text-[10px] font-bold uppercase tracking-widest text-primary md:text-xs">{period}</span>
                        <h3 className="mt-0.5 font-display text-base font-bold text-foreground md:mt-1 md:text-lg">{title}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground md:mt-2 md:text-sm">{desc}</p>
                      </div>
                    </div>
                    <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 h-5 w-5 items-center justify-center rounded-full border-2 border-primary bg-background shadow-[0_0_12px_hsl(270_80%_65%/0.5)]">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                    <div className="hidden flex-1 md:block" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ VISION & MISSION ════════════════════════════ */}
      <section className="relative px-4 py-10 md:py-20">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute right-0 top-1/2 h-[600px] w-[600px] -translate-y-1/2 rounded-full bg-primary/6 blur-[150px]" />
        </div>

        <div
          ref={missionRef.ref}
          className={`relative z-10 mx-auto max-w-5xl transition-all duration-700 ${missionRef.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="mb-8 text-center md:mb-14">
            <p className="mb-2 font-modernist text-[11px] font-bold uppercase tracking-[0.2em] text-primary md:mb-3">Arah Kami</p>
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-5xl">
              Visi & <span className="text-gradient-purple">Misi</span>
            </h2>
          </div>

          {/* Vision */}
          <div className="relative mb-4 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent p-5 md:mb-6 md:rounded-2xl md:p-10">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/15 blur-2xl" />
            <div className="relative">
              <div className="mb-3 flex items-center gap-2 md:mb-4">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-purple md:h-10 md:w-10 md:rounded-2xl">
                  <Lightbulb className="h-4 w-4 text-primary-foreground md:h-5 md:w-5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-primary md:h-4 md:w-4" />
                  <span className="font-modernist text-xs font-bold uppercase tracking-widest text-primary">Visi</span>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                AINA menjadi <strong className="text-foreground">AI Assistant yang dipakai rutin oleh Masisir</strong> untuk
                membantu urusan akademik, administrasi, dan kehidupan sehari-hari — menjadikan setiap Masisir
                lebih mudah, lebih terarah, dan lebih produktif.
              </p>
            </div>
          </div>

          {/* Mission — 4 roles */}
          <div className="mb-4">
            <div className="mb-4 flex items-center gap-2 md:mb-5">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-secondary/60 md:h-10 md:w-10 md:rounded-2xl">
                <Zap className="h-4 w-4 text-primary md:h-5 md:w-5" />
              </div>
              <span className="font-modernist text-xs font-bold uppercase tracking-widest text-primary">Peran AINA</span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              {[
                { id: "SYS_01", title: "Academic Support", desc: "Membantu proses belajar, pemahaman materi, dan adaptasi akademik di lingkungan Al-Azhar." },
                { id: "SYS_02", title: "Administrative Guidance", desc: "Panduan terstruktur terkait urusan kampus, dokumen, dan proses birokrasi." },
                { id: "SYS_03", title: "Life System", desc: "Membantu Masisir hidup lebih teratur, produktif, dan terarah." },
                { id: "SYS_04", title: "Komunitas Masisir", desc: "Ekosistem saling bantu antar mahasiswa Indonesia di Mesir." },
              ].map(({ id, title, desc }) => (
                <div key={id} className="relative overflow-hidden rounded-xl border border-border/40 bg-card/30 p-4 backdrop-blur-xl md:rounded-2xl md:p-6">
                  <div className="absolute -right-8 -bottom-8 h-28 w-28 rounded-full bg-primary/6 blur-2xl" />
                  <div className="relative">
                    <span className="font-modernist text-[10px] font-bold tracking-widest text-primary/50">{id}</span>
                    <h3 className="mt-0.5 mb-1 font-display text-xs font-bold text-foreground md:mt-1 md:mb-2 md:text-sm">{title}</h3>
                    <p className="text-[11px] leading-relaxed text-muted-foreground md:text-xs">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ TEAM ════════════════════════════════════════ */}
      <section className="relative px-4 py-10 md:py-20">
        <div
          ref={teamRef.ref}
          className={`relative z-10 mx-auto max-w-4xl transition-all duration-700 ${teamRef.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="mb-8 text-center md:mb-14">
            <p className="mb-2 font-modernist text-[11px] font-bold uppercase tracking-[0.2em] text-primary md:mb-3">Tim Kami</p>
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-5xl">
              Orang-orang di Balik{" "}
              <span className="text-gradient-purple">AINA</span>
            </h2>
            <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground md:mt-4 md:text-sm">
              Mahasiswa dan alumni Masisir yang peduli dan berkomitmen membangun platform ini.
            </p>
          </div>

          <div className="flex flex-col gap-6 md:gap-8">
            {TEAM_GROUPS.map(({ label, members }) => {
              const colClass =
                members.length === 1
                  ? "flex justify-center"
                  : members.length === 2
                  ? "grid grid-cols-2 gap-3 max-w-xs mx-auto w-full md:max-w-sm md:gap-5"
                  : members.length === 4
                  ? "grid grid-cols-2 gap-3 max-w-xs mx-auto w-full md:max-w-sm md:gap-5"
                  : "grid grid-cols-3 gap-3 md:gap-5";

              return (
                <div key={label}>
                  {/* Group label */}
                  <div className="mb-3 flex items-center gap-2 md:mb-4">
                    <div className="h-px flex-1 bg-border/30" />
                    <span className="font-modernist text-[10px] font-bold uppercase tracking-widest text-primary/60 md:text-[11px]">
                      {label}
                    </span>
                    <div className="h-px flex-1 bg-border/30" />
                  </div>

                  {/* Members */}
                  <div className={colClass}>
                    {members.map(({ name, role, initial, photo }) => (
                      <div
                        key={name}
                        className="group flex flex-col items-center rounded-xl border border-border/40 bg-card/30 p-3 text-center backdrop-blur-xl transition-all hover:border-primary/30 hover:bg-primary/5 hover:-translate-y-1 md:rounded-2xl md:p-5"
                      >
                        <div className="relative mb-3 md:mb-4">
                          <div className="absolute inset-0 scale-110 rounded-xl bg-gradient-purple opacity-0 blur-md transition-opacity group-hover:opacity-40 md:rounded-2xl" />
                          {photo ? (
                            <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-primary/15 md:h-24 md:w-24 md:rounded-2xl">
                              <img
                                src={photo}
                                alt={name}
                                className="h-full w-full object-cover object-center"
                              />
                            </div>
                          ) : (
                            <div className="relative flex h-20 w-20 items-center justify-center rounded-xl border border-primary/15 bg-gradient-to-br from-primary/20 via-primary/10 to-purple-glow/10 md:h-24 md:w-24 md:rounded-2xl">
                              <span className="font-display text-2xl font-bold text-primary/50 md:text-3xl">{initial}</span>
                            </div>
                          )}
                        </div>
                        <p className="font-display text-[11px] font-bold leading-tight text-foreground md:text-sm">{name}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground md:mt-1 md:text-xs">{role}</p>
                        <div className="mt-2 h-px w-6 rounded-full bg-primary/20 transition-all group-hover:w-10 group-hover:bg-primary/50 md:mt-3 md:w-8" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════ PWA INSTALL ══════════════════════════════════ */}
      <section className="px-4 py-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">
              Pasang AINA di Ponselmu
            </h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
              Akses AINA langsung dari layar utama — tanpa perlu buka browser.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary/8 border border-primary/15 px-3 py-1.5">
              <span className="text-[11px] font-mono font-semibold text-primary">ainalabs.pro</span>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* Android */}
            <div className="rounded-2xl border border-border/40 bg-card/30 overflow-hidden backdrop-blur-sm">
              <div className="flex items-center gap-3 border-b border-border/30 bg-card/50 px-5 py-3.5">
                <img src="/android.png" alt="Android" className="h-5 w-5 object-contain" style={{ filter: "invert(1) brightness(2)" }} />
                <span className="font-display text-sm font-bold text-foreground">Android</span>
                <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Chrome</span>
              </div>
              <ol className="p-5 space-y-3">
                {[
                  <>Buka <code className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-mono text-primary">ainalabs.pro</code> di Chrome</>,
                  <>Ketuk <strong className="text-foreground">⋮</strong> di pojok kanan atas</>,
                  <>Pilih <strong className="text-foreground">"Tambahkan ke layar beranda"</strong></>,
                  <>Ketuk <strong className="text-foreground">Pasang</strong> — selesai!</>,
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* iOS */}
            <div className="rounded-2xl border border-border/40 bg-card/30 overflow-hidden backdrop-blur-sm">
              <div className="flex items-center gap-3 border-b border-border/30 bg-card/50 px-5 py-3.5">
                <img src="/apple-.png" alt="Apple" className="h-5 w-5 object-contain" style={{ filter: "invert(1) brightness(2)" }} />
                <span className="font-display text-sm font-bold text-foreground">iPhone / iPad</span>
                <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Safari</span>
              </div>
              <ol className="p-5 space-y-3">
                {[
                  <>Buka <code className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-mono text-primary">ainalabs.pro</code> di Safari</>,
                  <><Share2 className="inline h-3.5 w-3.5 text-foreground mr-0.5" /> Ketuk ikon <strong className="text-foreground">Bagikan</strong> di toolbar</>,
                  <>Pilih <strong className="text-foreground">"Tambahkan ke Layar Utama"</strong></>,
                  <>Ketuk <strong className="text-foreground">Tambahkan</strong> di kanan atas</>,
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground/50">
            Setelah dipasang, AINA berjalan seperti aplikasi biasa — full screen, tanpa address bar.
          </p>
        </div>
      </section>

      {/* ══════════ CTA ══════════════════════════════════════════ */}
      <section className="relative overflow-hidden px-4 py-10 md:pb-28 md:pt-8">
        <div
          ref={ctaRef.ref}
          className={`relative z-10 mx-auto max-w-3xl transition-all duration-700 ${ctaRef.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card/30 to-purple-glow/8 p-7 text-center backdrop-blur-xl md:rounded-3xl md:p-14">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
              <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-purple-glow/15 blur-3xl" />
            </div>

            <div className="relative">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-purple shadow-[0_0_32px_hsl(270_80%_65%/0.5)] md:mb-6 md:h-16 md:w-16 md:rounded-2xl">
                <TrendingUp className="h-6 w-6 text-primary-foreground md:h-8 md:w-8" />
              </div>

              <h2 className="font-display text-2xl font-bold leading-tight text-foreground sm:text-4xl">
                Bergabung bersama{" "}
                <span className="text-gradient-purple">Tim AINA!</span>
              </h2>
              <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-muted-foreground md:mt-4 md:text-sm">
                Daftar gratis dan mulai tanyakan apa saja tentang kehidupan di Mesir kepada AINA.
              </p>

              <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center md:mt-8">
                <Link to="/login">
                  <button className="group flex items-center gap-2 rounded-xl bg-gradient-purple px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_hsl(270_80%_65%/0.4)] transition-all hover:scale-105 hover:shadow-[0_0_36px_hsl(270_80%_65%/0.65)] md:px-8 md:py-3">
                    Mulai Gratis Sekarang
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </Link>
                <button onClick={handleGoContributor} className="rounded-xl border border-border/60 bg-background/40 px-6 py-2.5 text-sm font-semibold text-foreground backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-primary/8 md:px-8 md:py-3">
                  Jadi Kontributor
                </button>
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
