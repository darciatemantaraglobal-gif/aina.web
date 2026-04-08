import { ArrowRight, MessageCircle } from "lucide-react";
import { useInView } from "@/hooks/useInView";

const waNumber = "6281311506025";
const waMessage = encodeURIComponent("Halo, saya tertarik untuk menjadi partner AINA. Bisa jelaskan lebih lanjut?");

const PARTNERS = [
  { logo: "/temantiket-logo.png", name: "Temantiket", type: "Travel Partner", wide: true },
  { logo: "/ppmi-mesir-logo.png", name: "PPMI Mesir", type: "Community Partner", wide: false },
];

export default function PartnerSection() {
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.15 });

  return (
    <section ref={ref} className="relative py-24 px-6 overflow-hidden">

      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-[#0e0820] to-background" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[700px] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl">

        {/* Overline */}
        <div className={`text-center transition-all duration-600 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="inline-flex items-center gap-2.5 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">Partner Resmi AINA</span>
          </div>
        </div>

        {/* Headline */}
        <div className={`mt-6 text-center transition-all duration-600 delay-75 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-white leading-tight">
            Dipercaya oleh ekosistem<br />
            <span className="text-gradient-purple">komunitas Masisir</span>
          </h2>
          <p className="mt-3 text-sm text-white/40 max-w-md mx-auto leading-relaxed">
            Kolaborasi strategis dengan mitra terpercaya untuk mendukung kehidupan mahasiswa Indonesia di Mesir.
          </p>
        </div>

        {/* Logo strip */}
        <div className={`mt-14 transition-all duration-700 delay-150 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          {/* Top line */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

          <div className="flex items-center justify-center gap-0 divide-x divide-white/8">
            {PARTNERS.map((p) => (
              <div
                key={p.name}
                className="group flex-1 flex flex-col items-center justify-center gap-3 py-10 px-8 hover:bg-white/[0.025] transition-all duration-300"
              >
                {/* Ambient glow on hover */}
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 scale-150" />
                  <img
                    src={p.logo}
                    alt={p.name}
                    className={`relative object-contain grayscale brightness-75 group-hover:grayscale-0 group-hover:brightness-100 transition-all duration-500 ${p.wide ? "h-8 w-32 sm:h-10 sm:w-40" : "h-12 w-12 sm:h-14 sm:w-14"}`}
                  />
                </div>

                {/* Partner type badge */}
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/20 group-hover:text-white/50 transition-colors duration-300">
                  {p.type}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom line */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
        </div>

        {/* CTA row */}
        <div className={`mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <p className="text-sm text-white/35">
            Tertarik bergabung sebagai partner?
          </p>
          <a
            href={`https://wa.me/${waNumber}?text=${waMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-primary/80 hover:text-primary transition-colors duration-200"
          >
            <MessageCircle className="h-4 w-4" />
            Hubungi via WhatsApp
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform duration-200" />
          </a>
        </div>

      </div>
    </section>
  );
}
