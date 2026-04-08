import { MessageCircle } from "lucide-react";
import { useInView } from "@/hooks/useInView";

const waNumber = "6281311506025";
const waMessage = encodeURIComponent("Halo, saya tertarik untuk menjadi partner AINA. Bisa jelaskan lebih lanjut?");

const PARTNERS = [
  {
    logo: "/temantiket-logo.png",
    name: "Temantiket",
    type: "Travel Partner",
    wide: true,
    logo2: null,
    subtitle: null,
  },
  {
    logo: "/ppmi-mesir-logo.png",
    name: "PPMI Mesir",
    type: "Community Partner",
    wide: false,
    logo2: "/ppmi-kabinet-logo.png",
    subtitle: "Kabinet Poros Persatuan",
  },
];

export default function PartnerSection() {
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.1 });

  return (
    <section ref={ref} className="relative pt-8 pb-20 overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-[#0e0820] to-background" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[600px] rounded-full bg-primary/6 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6">

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

        {/* Partner cards */}
        <div className={`mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4 transition-all duration-700 delay-150 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          {PARTNERS.map((p) => (
            <div
              key={p.name}
              className="group relative rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm px-8 py-8 flex flex-col items-center text-center hover:border-primary/25 hover:bg-primary/5 transition-all duration-300"
            >
              {/* Type badge */}
              <span className="absolute top-4 right-4 text-[10px] font-semibold uppercase tracking-widest text-white/25 group-hover:text-primary/50 transition-colors duration-300">
                {p.type}
              </span>

              {/* Logos */}
              <div className="flex items-center justify-center gap-3 mb-5">
                <img
                  src={p.logo}
                  alt={p.name}
                  className={`object-contain ${p.wide ? "h-10 w-32" : "h-14 w-14"}`}
                />
                {p.logo2 && (
                  <>
                    <span className="h-8 w-px bg-white/10" />
                    <img
                      src={p.logo2}
                      alt={p.subtitle ?? ""}
                      className="h-12 w-12 object-contain"
                    />
                  </>
                )}
              </div>

              {/* Name + subtitle */}
              <p className="font-display text-base font-bold text-white">{p.name}</p>
              {p.subtitle && (
                <p className="mt-1 text-[11px] text-white/35">{p.subtitle}</p>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className={`mt-12 text-center transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <p className="text-sm text-white/35 mb-4">Ingin jadi partner AINA?</p>
          <a
            href={`https://wa.me/${waNumber}?text=${waMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary/90 active:scale-95 transition-all duration-200"
          >
            <MessageCircle className="h-4 w-4" />
            Hubungi Kami
          </a>
        </div>

      </div>
    </section>
  );
}
