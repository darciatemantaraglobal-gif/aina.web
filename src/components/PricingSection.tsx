import { Check, Zap, MessageSquare, LayoutDashboard, BookOpen, Star, Users, Shield, Lock, Upload, Infinity, Clock, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useCallback } from "react";
import PaymentModal from "./PaymentModal";
import { usePayment } from "@/hooks/usePayment";
import { supabase } from "@/integrations/supabase/client";
import { useInView } from "@/hooks/useInView";

const FREE_FEATURES = [
  { icon: MessageSquare, text: "3 chat dengan AINA per hari" },
  { icon: BookOpen, text: "Baca artikel Knowledge Base" },
  { icon: LayoutDashboard, text: "Akses Productivity (Tasks & Notes)" },
  { icon: Users, text: "Bergabung sebagai anggota komunitas" },
];

const PRO_FEATURES = [
  { icon: Infinity, text: "Chat unlimited dengan AINA" },
  { icon: Upload, text: "Upload & analisis dokumen (PDF, Word)" },
  { icon: Clock, text: "Riwayat chat penuh tanpa batas" },
  { icon: Sparkles, text: "Prioritas respons AI" },
  { icon: Star, text: "Badge Pro eksklusif di profil" },
  { icon: Zap, text: "Early access fitur-fitur baru" },
];

const CONTRIBUTOR_FEATURES = [
  { icon: MessageSquare, text: "Unlimited chat dengan AINA (khusus masa awal)" },
  { icon: BookOpen, text: "Tulis & publikasikan artikel Knowledge Base" },
  { icon: Star, text: "Badge Contributor eksklusif di profil" },
  { icon: Users, text: "Naik level ke Senior Contributor" },
  { icon: Shield, text: "Prioritas dukungan dari tim AINA" },
  { icon: LayoutDashboard, text: "Semua fitur Gratis" },
];

const PricingSection = () => {
  const navigate = useNavigate();
  const [annual, setAnnual] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const { config } = usePayment();
  const { ref: sectionRef, inView: visible } = useInView<HTMLElement>();

  const handleGoContributor = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      navigate("/dashboard?tab=contributor");
    } else {
      navigate("/login", { state: { redirectAfter: "/dashboard?tab=contributor" } });
    }
  }, [navigate]);


  return (
    <section ref={sectionRef} className="relative py-10 px-4 sm:py-20">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-subtle/15 to-background" />
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className={`relative z-10 mx-auto max-w-6xl transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
        {/* Header */}
        <div className="mb-3 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 backdrop-blur-sm">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="font-modernist text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
              Pricing AINA
            </span>
          </div>
        </div>

        <div className="mb-3 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-5xl">
            Pilih Paket{" "}
            <span className="text-gradient-purple">Terbaik</span>
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-muted-foreground sm:mt-4 sm:text-base">
            Mulai gratis, upgrade sesuai kebutuhan — semua dirancang untuk mahasiswa Indonesia di Mesir.
          </p>
        </div>

        {/* Status badge */}
        <div className={`mb-5 flex justify-center transition-all duration-700 delay-100 sm:mb-8 ${visible ? "opacity-100" : "opacity-0"}`}>
          <div className="inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/5 px-3 py-1.5 text-[11px] text-green-400 sm:px-4 sm:py-2 sm:text-xs">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
            </span>
            Saat ini semua fitur dasar AINA tersedia gratis untuk semua mahasiswa
          </div>
        </div>

        {/* Billing toggle */}
        <div className={`mb-8 flex justify-center transition-all duration-700 delay-150 sm:mb-12 ${visible ? "opacity-100" : "opacity-0"}`}>
          <div className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-card/40 p-1 backdrop-blur-sm">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${!annual ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              Bulanan
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${annual ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              Tahunan
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${annual ? "bg-primary-foreground/20 text-primary-foreground" : "bg-green-500/15 text-green-400"}`}>
                -28%
              </span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3 lg:items-stretch">

          {/* Free */}
          <div className={`flex flex-col rounded-2xl border border-border/60 bg-card/40 p-5 backdrop-blur-xl transition-all duration-700 delay-150 sm:p-8 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <div className="mb-4 sm:mb-6">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/60 sm:h-10 sm:w-10">
                <Users className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground sm:text-xl">Gratis</h3>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">Untuk semua mahasiswa Indonesia di Mesir</p>
              <div className="mt-4 flex items-end gap-1 sm:mt-6">
                <span className="font-display text-4xl font-bold text-foreground sm:text-5xl">Rp 0</span>
                <span className="mb-1 text-xs text-muted-foreground sm:mb-2 sm:text-sm">/ selamanya</span>
              </div>
            </div>

            <ul className="mb-5 flex-1 space-y-2 sm:mb-8 sm:space-y-3">
              {FREE_FEATURES.map(({ text }) => (
                <li key={text} className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-secondary/60 sm:h-5 sm:w-5">
                    <Check className="h-2.5 w-2.5 text-muted-foreground sm:h-3 sm:w-3" />
                  </div>
                  <span className="text-xs text-muted-foreground sm:text-sm">{text}</span>
                </li>
              ))}
            </ul>

            <Link to="/login">
              <button className="w-full rounded-xl border border-border/60 bg-secondary/40 py-2.5 text-xs font-semibold text-foreground transition-all hover:bg-secondary/70 sm:py-3 sm:text-sm">
                Mulai Gratis
              </button>
            </Link>
          </div>

          {/* Pro — Coming Soon */}
          <div className={`relative flex flex-col rounded-2xl border border-primary/50 bg-card/40 p-5 backdrop-blur-xl transition-all duration-700 delay-300 sm:p-8 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/12 via-transparent to-purple-glow/8" />


            <div className="relative mb-4 sm:mb-6">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/15 sm:h-10 sm:w-10">
                <Zap className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-bold text-foreground sm:text-xl">Pro</h3>
                {!config?.enabled && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400 border border-amber-500/20">
                    Segera Hadir
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">Untuk yang butuh lebih dari sekadar dasar</p>
              <div className="mt-4 sm:mt-6">
                <span className="font-display text-3xl font-bold text-primary/60 sm:text-4xl">Coming Soon</span>
              </div>
            </div>

            <ul className="relative mb-5 flex-1 space-y-2 sm:mb-8 sm:space-y-3">
              {PRO_FEATURES.map(({ text }) => (
                <li key={text} className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/15 sm:h-5 sm:w-5">
                    <Check className="h-2.5 w-2.5 text-primary sm:h-3 sm:w-3" />
                  </div>
                  <span className="text-xs text-foreground/80 sm:text-sm">{text}</span>
                </li>
              ))}
            </ul>

            {/* Coming Soon button */}
            <button
              onClick={() => setShowPaymentModal(true)}
              className="relative w-full overflow-hidden rounded-xl border border-primary/30 bg-primary/10 py-2.5 text-xs font-semibold text-primary/70 backdrop-blur-sm transition-all hover:bg-primary/15 sm:py-3 sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="h-3.5 w-3.5" />
              Segera Hadir — Notifikasi Saya
            </button>
          </div>

          {/* Contributor */}
          <div className={`relative flex flex-col rounded-2xl border border-amber-500/50 bg-card/40 p-5 backdrop-blur-xl transition-all duration-700 sm:p-8 ${visible ? "opacity-100 translate-y-0 delay-500" : "opacity-0 translate-y-6"}`}>
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/10 via-transparent to-amber-400/5" />

            {/* Most popular badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <div className="rounded-full bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-1 text-[11px] font-bold uppercase tracking-widest text-white shadow-[0_0_16px_hsl(38_95%_55%/0.4)]">
                Paling Populer
              </div>
            </div>

            <div className="relative mb-4 sm:mb-6">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 sm:h-10 sm:w-10">
                <Star className="h-4 w-4 text-amber-400 sm:h-5 sm:w-5" />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground sm:text-xl">Contributor</h3>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">Untuk mahasiswa aktif yang berbagi ilmu</p>
              <div className="mt-4 sm:mt-6">
                <span className="font-display text-4xl font-bold text-foreground sm:text-5xl">Gratis</span>
                <p className="mt-0.5 text-xs text-amber-400/80">Cukup berkontribusi ke komunitas</p>
              </div>
            </div>

            <ul className="mb-5 flex-1 space-y-2 sm:mb-8 sm:space-y-3">
              {CONTRIBUTOR_FEATURES.map(({ text }) => (
                <li key={text} className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 sm:h-5 sm:w-5">
                    <Check className="h-2.5 w-2.5 text-amber-400 sm:h-3 sm:w-3" />
                  </div>
                  <span className="text-xs text-foreground/80 sm:text-sm">{text}</span>
                </li>
              ))}
            </ul>

            <button onClick={handleGoContributor} className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 py-2.5 text-xs font-semibold text-amber-400 transition-all hover:bg-amber-500/20 sm:py-3 sm:text-sm">
              Daftar Jadi Kontributor
            </button>
          </div>
        </div>

        {/* FAQ */}
        <div className={`mt-8 transition-all duration-700 sm:mt-14 ${visible ? "opacity-100 translate-y-0 delay-700" : "opacity-0 translate-y-4"}`}>
          <h3 className="mb-4 text-center font-display text-lg font-bold text-foreground sm:mb-6 sm:text-xl">Pertanyaan Umum</h3>
          <div className="mx-auto grid max-w-3xl gap-3 sm:gap-4 md:grid-cols-2">
            {[
              {
                q: "Apa itu limit 5 chat per hari?",
                a: "User gratis bisa mengirim 5 pesan ke AINA setiap hari. Limit reset otomatis setiap tengah malam.",
              },
              {
                q: "Kapan paket Pro tersedia?",
                a: "Paket Pro sedang dalam tahap pengembangan. Klik 'Notifikasi Saya' untuk dapat info pertama saat diluncurkan.",
              },
              {
                q: "Metode pembayaran apa yang diterima?",
                a: "Akan tersedia GoPay, OVO, ShopeePay, DANA, QRIS, dan Virtual Account semua bank besar Indonesia.",
              },
              {
                q: "Bagaimana cara jadi Contributor?",
                a: "Isi formulir di halaman Contributor. Tim AINA akan memverifikasi dan memberikan akses dalam 1–3 hari kerja.",
              },
              {
                q: "Apakah fitur dasar tetap gratis?",
                a: "Ya. Fitur dasar AINA akan selalu gratis untuk semua mahasiswa Indonesia di Mesir.",
              },
              {
                q: "Apa itu Senior Contributor?",
                a: "Contributor yang aktif menulis artikel berkualitas akan naik level ke Senior Contributor secara otomatis.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="rounded-xl border border-border/40 bg-card/30 p-3.5 sm:p-5">
                <p className="mb-1.5 text-xs font-semibold text-foreground sm:mb-2 sm:text-sm">{q}</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <PaymentModal open={showPaymentModal} onClose={() => setShowPaymentModal(false)} />
    </section>
  );
};

export default PricingSection;
