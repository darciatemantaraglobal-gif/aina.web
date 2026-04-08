import { ArrowRight, MessageCircle } from "lucide-react";
import { useInView } from "@/hooks/useInView";

const waNumber = "6281311506025";
const waMessage = encodeURIComponent("Halo, saya tertarik untuk menjadi partner AINA. Bisa jelaskan lebih lanjut?");

const PARTNERS = [
  { logo: "/temantiket-logo.png", name: "Temantiket", type: "Travel Partner", wide: true },
  { logo: "/ppmi-mesir-logo.png", name: "PPMI Mesir", type: "Community Partner", wide: false },
];

/* Duplicate enough times for seamless loop */
const TRACK = [...PARTNERS, ...PARTNERS, ...PARTNERS, ...PARTNERS, ...PARTNERS, ...PARTNERS];

export default function PartnerSection() {
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.1 });

  return (
    <section ref={ref} className="relative pt-8 pb-20 overflow-hidden">
      <style>{`
        @keyframes marquee-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .marquee-run {
          animation: marquee-scroll 22s linear infinite;
          will-change: transform;
        }
        .marquee-run:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-[#0e0820] to-background" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[600px] rounded-full bg-primary/6 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-6">

        {/* Badge */}
        <div className={`text-center transition-all duration-500 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">Partner Resmi AINA</span>
          </div>
        </div>

        {/* Headline */}
        <div className={`mt-5 text-center transition-all duration-500 delay-75 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-white leading-tight">
            Dipercaya oleh ekosistem<br />
            <span className="text-gradient-purple">komunitas Masisir</span>
          </h2>
          <p className="mt-3 text-sm text-white/40 max-w-md mx-auto leading-relaxed">
            Kolaborasi strategis dengan mitra terpercaya untuk mendukung kehidupan mahasiswa Indonesia di Mesir.
          </p>
        </div>
      </div>

      {/* Marquee strip — full width, no max-w */}
      <div className={`relative mt-12 transition-all duration-700 delay-150 ${inView ? "opacity-100" : "opacity-0"}`}>
        {/* Fade masks */}
        <div
          className="relative overflow-hidden py-2"
          style={{
            maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
            WebkitMaskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
          }}
        >
          <div className="flex w-max marquee-run">
            {TRACK.map((p, i) => (
              <div key={i} className="group flex items-center gap-3 mx-10 shrink-0">
                <img
                  src={p.logo}
                  alt={p.name}
                  className={`object-contain grayscale brightness-75 group-hover:grayscale-0 group-hover:brightness-100 transition-all duration-400 ${p.wide ? "h-7 w-24" : "h-9 w-9"}`}
                />
                <span className="text-xs font-semibold text-white/25 group-hover:text-white/70 transition-colors duration-300 whitespace-nowrap">
                  {p.name}
                </span>
                {/* Dot separator */}
                <span className="ml-6 h-1 w-1 rounded-full bg-white/10 shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Decorative line above and below strip */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/6 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/6 to-transparent" />
      </div>

      {/* CTA */}
      <div className={`relative z-10 mt-12 px-6 transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <div className="mx-auto max-w-3xl relative rounded-2xl overflow-hidden">
          {/* Background layers */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-[#1a0a3a] to-purple-900/30" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--primary)/0.25),_transparent_60%)]" />
          <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-purple-500/15 blur-3xl" />
          {/* Border glow */}
          <div className="absolute inset-0 rounded-2xl border border-primary/25" />

          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6 px-8 py-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/60 mb-1.5">Buka Peluang Kolaborasi</p>
              <h3 className="font-display text-xl sm:text-2xl font-bold text-white leading-tight">
                Jangkau 15.000+ Masisir<br className="hidden sm:block" /> bersama AINA
              </h3>
            </div>
            <a
              href={`https://wa.me/${waNumber}?text=${waMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group shrink-0 inline-flex items-center gap-2.5 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#0d0824] hover:bg-white/90 active:scale-95 transition-all duration-200 shadow-[0_0_24px_-4px_hsl(var(--primary)/0.5)]"
            >
              <MessageCircle className="h-4 w-4" />
              Hubungi via WhatsApp
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform duration-200" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
